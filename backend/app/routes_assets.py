import re
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Principal, current_principal, log_activity, project_for, require_entity, sees_all_sites
from app.config import CLONED_DIR, WORKSPACE_DIR
from app.db import Asset, Entity, Project, get_db, utcnow

router = APIRouter(prefix="/api/assets")

MB = 1024 * 1024


def _ftyp(*brands: bytes):
    return lambda head: head[4:8] == b"ftyp" and any(head[8:12].startswith(b) for b in brands)


# extension -> (kind, mime type, size limit, content check on the first bytes)
FORMATS = {
    "png": ("image", "image/png", 15 * MB, lambda h: h.startswith(b"\x89PNG\r\n\x1a\n")),
    "jpg": ("image", "image/jpeg", 15 * MB, lambda h: h.startswith(b"\xff\xd8\xff")),
    "jpeg": ("image", "image/jpeg", 15 * MB, lambda h: h.startswith(b"\xff\xd8\xff")),
    "gif": ("image", "image/gif", 15 * MB, lambda h: h[:6] in (b"GIF87a", b"GIF89a")),
    "webp": ("image", "image/webp", 15 * MB, lambda h: h[:4] == b"RIFF" and h[8:12] == b"WEBP"),
    "avif": ("image", "image/avif", 15 * MB, _ftyp(b"avif", b"avis")),
    "ico": ("image", "image/x-icon", 2 * MB, lambda h: h[:4] == b"\x00\x00\x01\x00"),
    "svg": ("svg", "image/svg+xml", 2 * MB, None),
    "mp4": ("video", "video/mp4", 200 * MB, _ftyp(b"isom", b"iso", b"mp4", b"avc1", b"M4V", b"dash", b"MSNV")),
    "m4v": ("video", "video/mp4", 200 * MB, _ftyp(b"M4V", b"isom", b"mp4")),
    "mov": ("video", "video/quicktime", 200 * MB, _ftyp(b"qt")),
    "webm": ("video", "video/webm", 200 * MB, lambda h: h[:4] == b"\x1a\x45\xdf\xa3"),
    "woff": ("font", "font/woff", 10 * MB, lambda h: h[:4] == b"wOFF"),
    "woff2": ("font", "font/woff2", 10 * MB, lambda h: h[:4] == b"wOF2"),
    "ttf": ("font", "font/ttf", 10 * MB, lambda h: h[:4] in (b"\x00\x01\x00\x00", b"true")),
    "otf": ("font", "font/otf", 10 * MB, lambda h: h[:4] == b"OTTO"),
}

# SVG is XML that browsers will run scripts from, so anything active is refused.
SVG_DANGER = re.compile(
    rb"<\s*script|<\s*foreignObject|<\s*iframe|<\s*embed|<\s*object|<!ENTITY|\bon[a-z]+\s*=|javascript:|data:text/html",
    re.IGNORECASE,
)

SITE_DIRS = {"image": "images/library", "svg": "images/library", "video": "media/library", "font": "fonts/library"}


def entity_asset_dir(entity_id: int) -> Path:
    return WORKSPACE_DIR / "entities" / str(entity_id) / "assets"


def asset_payload(asset: Asset, folder: str = "", visible: set[str] | None = None) -> dict:
    """visible: the sites the viewer may see (None = all), so members don't learn teammates' site names."""
    usage = [u for u in (asset.usage or []) if visible is None or u.get("folder") in visible]
    return {
        "id": asset.id,
        "fileName": asset.file_name,
        "kind": asset.kind,
        "mimeType": asset.mime_type,
        "size": asset.size,
        "url": f"/api/assets/{asset.id}/file",
        "uploadedBy": asset.uploader.email if asset.uploader else None,
        "createdAt": asset.created_at.isoformat() + "Z",
        "usage": usage,
        "usedInSite": bool(folder) and any(u.get("folder") == folder for u in asset.usage or []),
    }


def load_asset(db: Session, principal: Principal, asset_id: int) -> Asset:
    asset = db.get(Asset, asset_id)
    entity_id = principal.entity_id
    if not asset or asset.deleted_at or (asset.entity_id != entity_id and not principal.is_super_admin):
        raise HTTPException(404, "Asset not found.")
    return asset


def library_entity(db: Session, principal: Principal, entity_id: Optional[int]) -> int:
    """The library to act on: your own workspace, or any one a super admin picks."""
    if entity_id and principal.is_super_admin:
        if not db.get(Entity, entity_id):
            raise HTTPException(404, "Entity not found.")
        return entity_id
    return require_entity(principal)


def validate_upload(name: str, head: bytes, data_path: Path) -> tuple[str, str, str]:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    fmt = FORMATS.get(ext)
    if not fmt:
        raise HTTPException(400, f"“{name}”: this file type isn't supported. Use images, SVG, MP4/WebM video or web fonts.")
    kind, mime, _limit, check = fmt
    if kind == "svg":
        text = data_path.read_bytes()
        if b"<svg" not in text[:4096].lower() or SVG_DANGER.search(text):
            raise HTTPException(400, f"“{name}” is not a plain SVG image (it contains scripts or embedded content).")
    elif not check(head):
        raise HTTPException(400, f"“{name}” doesn't look like a real .{ext} file.")
    return ext, kind, mime


@router.get("")
def list_assets(q: str = Query(""), kind: str = Query(""), folder: str = Query(""), onlySite: bool = Query(False),
                entityId: Optional[int] = Query(None),
                principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    entity_id = library_entity(db, principal, entityId)
    if folder:
        folder = project_for(db, principal, folder).folder
    query = select(Asset).where(Asset.entity_id == entity_id, Asset.deleted_at.is_(None)).order_by(Asset.id.desc())
    if kind in ("image", "svg", "video", "font"):
        query = query.where(Asset.kind == kind)
    if q.strip():
        query = query.where(Asset.file_name.like(f"%{q.strip()[:100]}%"))
    visible = None
    if not sees_all_sites(principal):
        visible = set(db.execute(select(Project.folder).where(Project.created_by == principal.user.id)).scalars())
    assets = [asset_payload(a, folder, visible) for a in db.execute(query).scalars()]
    if onlySite and folder:
        assets = [a for a in assets if a["usedInSite"]]
    return {"success": True, "assets": assets}


@router.post("")
async def upload_assets(request: Request, files: list[UploadFile] = File(...), entityId: Optional[int] = Query(None),
                        principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    entity_id = library_entity(db, principal, entityId)
    entity = db.get(Entity, entity_id)
    if principal.user.role == "entity_user" and (entity.settings or {}).get("allowUserUploads", True) is False:
        raise HTTPException(403, "Uploads are limited to workspace admins in this workspace.")
    if len(files) > 20:
        raise HTTPException(400, "Upload at most 20 files at a time.")

    target_dir = entity_asset_dir(entity_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    created: list[Asset] = []
    try:
        for upload in files:
            created.append(await _store_upload(upload, target_dir, entity_id, principal, db, request))
    except HTTPException:
        # One bad file rejects the batch; don't leave the earlier files behind.
        for asset in created:
            (target_dir / asset.stored_name).unlink(missing_ok=True)
        raise
    db.commit()
    return {"success": True, "assets": [asset_payload(a) for a in created]}


async def _store_upload(upload: UploadFile, target_dir: Path, entity_id: int, principal: Principal,
                        db: Session, request: Request) -> Asset:
    name = Path(upload.filename or "file").name[:200]
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    limit = FORMATS.get(ext, (None, None, 15 * MB, None))[2]
    temp = target_dir / f".upload-{uuid.uuid4().hex}"
    size = 0
    head = b""
    try:
        with temp.open("wb") as out:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(400, f"“{name}” is too large (limit {limit // MB} MB).")
                if len(head) < 32:
                    head += chunk[: 32 - len(head)]
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, f"“{name}” is empty.")
        ext, kind, mime = validate_upload(name, head, temp)
        stored = f"{uuid.uuid4().hex}.{ext}"
        temp.rename(target_dir / stored)
    finally:
        temp.unlink(missing_ok=True)
    asset = Asset(entity_id=entity_id, uploaded_by=principal.user.id, file_name=name, stored_name=stored,
                  mime_type=mime, kind=kind, size=size, usage=[])
    db.add(asset)
    db.flush()
    log_activity(db, principal, "asset.upload", name, {"kind": kind, "size": size}, request, entity_id=entity_id)
    return asset


@router.get("/{asset_id}/file")
def asset_file(asset_id: int, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    asset = load_asset(db, principal, asset_id)
    path = entity_asset_dir(asset.entity_id) / asset.stored_name
    if not path.is_file():
        raise HTTPException(404, "Asset file is missing.")
    return FileResponse(path, media_type=asset.mime_type, headers={
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        "Cache-Control": "private, max-age=3600",
    })


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, request: Request,
                 principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    asset = load_asset(db, principal, asset_id)
    if principal.user.role == "entity_user" and asset.uploaded_by != principal.user.id:
        raise HTTPException(403, "Only workspace admins can delete files someone else uploaded.")
    asset.deleted_at = utcnow()
    # Sites keep their own copy of anything already inserted, so the library file can go.
    (entity_asset_dir(asset.entity_id) / asset.stored_name).unlink(missing_ok=True)
    log_activity(db, principal, "asset.delete", asset.file_name, request=request, entity_id=asset.entity_id)
    db.commit()
    return {"success": True}


class UseAssetRequest(BaseModel):
    folder: str
    page: Optional[str] = None
    placement: Optional[str] = None


@router.post("/{asset_id}/use")
def use_asset(asset_id: int, body: UseAssetRequest, request: Request,
              principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Copy a library asset into a site so the page can reference it."""
    asset = load_asset(db, principal, asset_id)
    project = project_for(db, principal, body.folder)
    # Super admins may bring any entity's asset into any site; everyone else stays in their own workspace.
    if project.entity_id != asset.entity_id and not principal.is_super_admin:
        raise HTTPException(404, "Asset not found.")
    source = entity_asset_dir(asset.entity_id) / asset.stored_name
    if not source.is_file():
        raise HTTPException(404, "Asset file is missing.")

    rel = f"{SITE_DIRS[asset.kind]}/{asset.stored_name}"
    dest = CLONED_DIR / project.folder / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        shutil.copyfile(source, dest)

    usage = [u for u in (asset.usage or []) if u.get("folder") != project.folder]
    usage.append({"folder": project.folder, "path": rel, "at": utcnow().isoformat() + "Z"})
    asset.usage = usage
    log_activity(db, principal, "asset.use", asset.file_name,
                 {"site": project.folder, "page": body.page, "placement": body.placement}, request,
                 entity_id=project.entity_id)
    db.commit()
    return {"success": True, "path": rel, "url": f"/cloned/{project.folder}/{rel}", "asset": asset_payload(asset, project.folder, None if sees_all_sites(principal) else {project.folder})}
