import base64
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Principal, current_principal, log_activity, project_for, require_editable
from app.config import WORKSPACE_DIR
from app.db import Asset, get_db, utcnow
from app.models import AiEditRequest
from app.routes_assets import SITE_DIRS, entity_asset_dir
from app.routes_versions import safe_record_version
from app.services.node_worker import run_node_worker

router = APIRouter()

MAX_IMAGES = 4
MAX_IMAGE_BYTES = 6 * 1024 * 1024
DATA_URL = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$")
SIGNATURES = {
    "png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "jpeg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}


def check_screenshots(images: list[str]) -> list[tuple[str, bytes]]:
    if len(images) > MAX_IMAGES:
        raise HTTPException(400, f"Attach at most {MAX_IMAGES} screenshots.")
    decoded = []
    for i, data_url in enumerate(images, 1):
        match = DATA_URL.match(data_url or "")
        if not match:
            raise HTTPException(400, f"Screenshot {i} must be a PNG, JPEG or WebP image.")
        kind, payload = match.groups()
        raw = base64.b64decode(payload)
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(400, f"Screenshot {i} is larger than 6 MB.")
        if not SIGNATURES[kind](raw):
            raise HTTPException(400, f"Screenshot {i} isn't a valid {kind.upper()} image.")
        decoded.append((kind, raw))
    return decoded


def save_screenshots(entity_id: int, shots: list[tuple[str, bytes]]) -> list[str]:
    """Keep the screenshots behind each edit, for the activity trail."""
    folder = WORKSPACE_DIR / "entities" / str(entity_id) / "screenshots"
    folder.mkdir(parents=True, exist_ok=True)
    names = []
    for kind, raw in shots:
        name = f"{uuid.uuid4().hex}.{'jpg' if kind == 'jpeg' else kind}"
        (folder / name).write_bytes(raw)
        names.append(name)
    return names


@router.post("/api/ai-edit")
async def ai_edit(body: AiEditRequest, request: Request,
                  principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = project_for(db, principal, body.folder)
    require_editable(db, principal, project)
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(400, "Describe the change you want.")
    if len(prompt) > 4000:
        raise HTTPException(400, "Keep the request under 4,000 characters.")
    shots = check_screenshots(body.images)

    # The AI may only use this workspace's own assets.
    rows = db.execute(
        select(Asset).where(Asset.entity_id == project.entity_id, Asset.deleted_at.is_(None))
        .order_by(Asset.id.desc()).limit(60)
    ).scalars().all()
    assets = [{
        "id": a.id,
        "fileName": a.file_name,
        "kind": a.kind,
        "source": str(entity_asset_dir(a.entity_id) / a.stored_name),
        "sitePath": f"{SITE_DIRS[a.kind]}/{a.stored_name}",
    } for a in rows if (entity_asset_dir(a.entity_id) / a.stored_name).is_file()]

    selection = body.selection or None
    if selection:
        size = {k: selection.get(k) for k in ("width", "height")}
        selection = {k: selection.get(k) for k in ("tag", "label", "elementId", "classes", "outerHTML", "isGlobal", "selectorPath")}
        selection["outerHTML"] = str(selection.get("outerHTML") or "")[:60000]
        selection["selectorPath"] = str(selection.get("selectorPath") or "")[:500]
        # On-screen size of the element, so a generated image gets the right shape.
        if all(isinstance(v, (int, float)) and 0 < v < 20000 for v in size.values()):
            selection.update({k: int(v) for k, v in size.items()})

    try:
        result = await run_node_worker(
            "ai-edit", folder=project.folder, page=body.page, prompt=prompt,
            images=body.images, selection=selection, assets=assets,
            insert=body.insert if body.insert in ("before", "after", "end") else None,
        )
    except RuntimeError as e:
        log_activity(db, principal, "site.ai.edit_failed", project.folder,
                     {"page": body.page, "prompt": prompt[:500], "error": str(e)[:300]}, request,
                     entity_id=project.entity_id)
        db.commit()
        raise HTTPException(422, str(e))

    used = set(result.get("assetsUsed") or [])
    for asset in rows:
        if asset.id in used:
            usage = [u for u in (asset.usage or []) if u.get("folder") != project.folder]
            usage.append({"folder": project.folder, "path": f"{SITE_DIRS[asset.kind]}/{asset.stored_name}",
                          "at": utcnow().isoformat() + "Z"})
            asset.usage = usage

    log_activity(db, principal, "site.ai.edit", project.folder, {
        "page": body.page,
        "prompt": prompt[:500],
        "summary": str(result.get("summary") or "")[:500],
        "files": result.get("filesChanged") or [],
        "assets": sorted(used),
        "screenshots": save_screenshots(project.entity_id, shots) if shots else [],
        "element": (selection or {}).get("tag"),
    }, request, entity_id=project.entity_id)
    db.commit()
    if result.get("changed") is not False:
        safe_record_version(db, principal, project, "site.ai.edit", f"AI edit: {result.get('summary') or prompt}"[:255])
    return result
