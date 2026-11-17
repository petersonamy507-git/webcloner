from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Principal, current_principal, log_activity, project_for, require_entity, sanitize_folder, sees_all_sites
from app.bootstrap import bootstrap
from app.config import CLONED_DIR, CORS_ORIGINS, MIME_TYPES, ROOT, WORKSPACE_DIR
from app.db import CloneJob, Project, get_db, utcnow
from app.models import (
    AiAuditRequest,
    AiEditSelectionRequest,
    AiFixSelectionRequest,
    AiCustomizeRequest,
    FixWithAiRequest,
    PhpRestructureRequest,
    HeadSnippetsRequest,
    HistoryRequest,
    ApplyBrandRequest,
    CloneRequest,
    UseBrandImageRequest,
    ReplaceLogosRequest,
    CreatePageRequest,
    GeneratePageRequest,
    SaveRequest,
    ThemePostRequest,
    UploadRequest,
)
from app.routes_admin import router as admin_router
from app.routes_assets import router as assets_router
from app.routes_versions import router as versions_router, safe_record_version
from app.routes_clone_jobs import folder_conflict, register_clone, router as clone_jobs_router
from app.routes_ai_edit import router as ai_edit_router
from app.routes_auth import router as auth_router
from app.services.node_worker import run_node_worker
from app.services.site_service import (
    build_laravel_zip,
    copy_brand_image,
    list_brand_galleries,
    list_pages,
    resolve_brand_file,
    resolve_cloned_file,
    save_page,
    site_dir,
    upload_image,
    zip_directory,
)

app = FastAPI(title="Website Cloner API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(assets_router)
app.include_router(ai_edit_router)
app.include_router(versions_router)
app.include_router(clone_jobs_router)


@app.on_event("startup")
def on_startup():
    bootstrap()


def fail(error: str, status: int = 422) -> JSONResponse:
    return JSONResponse({"success": False, "error": error}, status_code=status)


async def worker(action: str, **params):
    try:
        return await run_node_worker(action, **params)
    except RuntimeError as e:
        raise HTTPException(422, str(e))


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return fail(str(exc.detail), exc.status_code)


def site_action(db: Session, principal: Principal, folder: str, action: str, request: Request,
                details: dict | None = None) -> Project:
    """Ownership check for a site, plus an activity record for the change."""
    project = project_for(db, principal, folder)
    log_activity(db, principal, action, project.folder, details, request, entity_id=project.entity_id)
    db.commit()
    return project


async def versioned(db: Session, principal: Principal, project: Project, action: str, label: str, pending):
    """Run a change, then record the site's new version (skipped when no file changed)."""
    result = await pending
    safe_record_version(db, principal, project, action, label)
    return result


@app.get("/health")
async def health():
    return {"status": "ok", "backend": "fastapi"}


# ── Brand kits (shared, read-only) ──

@app.get("/api/brand-gallery")
async def brand_gallery(principal: Principal = Depends(current_principal)):
    return {"success": True, "brands": list_brand_galleries()}


@app.get("/api/brand-file")
async def brand_file(brand: str = Query(""), file: str = Query(""), principal: Principal = Depends(current_principal)):
    try:
        path = resolve_brand_file(brand, file)
    except FileNotFoundError:
        return Response("Image not found.", status_code=404)
    return FileResponse(path)


@app.get("/api/brands")
async def list_brands(principal: Principal = Depends(current_principal)):
    return await worker("list-brands")


@app.post("/api/replace-logos")
async def replace_logos(body: ReplaceLogosRequest, request: Request,
                        principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not body.folder or not body.logoPath:
        return fail("Choose a logo.", 400)
    project = site_action(db, principal, body.folder, "site.replace_logos", request)
    return await versioned(db, principal, project, "site.replace_logos", "Replaced the logo",
                           worker("replace-logos", folder=project.folder, logoPath=body.logoPath, oldSrc=body.oldSrc or ""))


@app.post("/api/brand-image")
async def use_brand_image(body: UseBrandImageRequest, request: Request,
                          principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not body.folder or not body.brand or not body.file:
        return fail("Choose a brand image.", 400)
    project = site_action(db, principal, body.folder, "site.brand_image", request, {"brand": body.brand})
    try:
        return {"success": True, **copy_brand_image(project.folder, body.brand, body.file)}
    except FileNotFoundError as e:
        return fail(str(e), 404)


@app.post("/api/apply-brand")
async def apply_brand(body: ApplyBrandRequest, request: Request,
                      principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not body.folder or not body.brand:
        return fail("Choose a clone and a brand.", 400)
    project = site_action(db, principal, body.folder, "site.apply_brand", request, {"brand": body.brand})
    return await versioned(db, principal, project, "site.apply_brand", f"Applied brand {body.brand}",
                           worker("apply-brand", folder=project.folder, brand=body.brand))


# ── Cloning and the site library ──

@app.post("/api/clone")
async def clone_website(body: CloneRequest, request: Request,
                        principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Clone and wait for the result. The home page uses /api/clone-jobs instead, which runs in the background."""
    entity_id = require_entity(principal)
    folder_name = sanitize_folder(body.folderName or "")
    if folder_name:
        conflict = folder_conflict(db, entity_id, folder_name, principal)
        if conflict:
            return fail(conflict, 409)
    result = await worker("clone", url=body.url, folderName=folder_name or None, mode=body.mode,
                          **({"sessionCookies": body.sessionCookies} if body.sessionCookies else {}))
    folder = sanitize_folder(result.get("folder") or "")
    if folder:
        register_clone(db, principal, entity_id, folder, body.url, body.mode, result)
    return result


@app.get("/api/clones")
async def list_clones(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    entity_id = principal.entity_id
    if not entity_id:
        return {"success": True, "clones": []}
    visible = select(Project.folder).where(Project.entity_id == entity_id, Project.deleted_at.is_(None))
    if not sees_all_sites(principal):
        visible = visible.where(Project.created_by == principal.user.id)
    owned = set(db.execute(visible).scalars())
    data = await worker("list-clones")
    data["clones"] = [c for c in data.get("clones", []) if c.get("folder") in owned]
    # The desktop screenshot of the original site makes a better card image than a guessed site image.
    shots: dict[str, int] = {}
    for job in db.execute(
        select(CloneJob).where(CloneJob.entity_id == entity_id, CloneJob.status == "succeeded").order_by(CloneJob.id)
    ).scalars():
        if "desktop" in (job.screenshots or []):
            shots[job.folder] = job.id
    for clone in data["clones"]:
        if clone.get("folder") in shots:
            clone["thumbnail"] = f"/api/clone-jobs/{shots[clone['folder']]}/screenshot/desktop"
    return data


@app.delete("/api/clones")
async def delete_clone(request: Request, folder: str = Query(""),
                       principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not folder:
        return fail("A clone folder name is required.", 400)
    project = project_for(db, principal, folder)
    result = await worker("delete-clone", folder=project.folder)
    project.deleted_at = utcnow()
    log_activity(db, principal, "site.delete", project.folder, request=request, entity_id=project.entity_id)
    db.commit()
    return result


@app.post("/api/clones/restore")
async def restore_clone(request: Request, trashId: str = Query(""),
                        principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not trashId:
        return fail("A deleted site id is required.", 400)
    project = project_for(db, principal, trashId.rsplit("--", 1)[0], include_deleted=True)
    result = await worker("restore-clone", trashId=trashId)
    project.deleted_at = None
    log_activity(db, principal, "site.restore", project.folder, request=request, entity_id=project.entity_id)
    db.commit()
    safe_record_version(db, principal, project, "site.restore", "Restored from the trash")
    return result


@app.get("/api/download")
async def download_zip(request: Request, folder: str = Query(""), format: str = Query("php"),
                       principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Custom PHP stack by default (index.php router, views/, includes/, class/, assets/); ?format=laravel for Laravel."""
    project = site_action(db, principal, folder, "site.download", request, {"format": format})
    directory = site_dir(project.folder)
    if not directory.exists():
        return Response("Clone not found.", status_code=404)
    try:
        if format == "laravel":
            await worker("laravel-restructure", folder=project.folder)
            data, filename = build_laravel_zip(project.folder)
        else:
            out = WORKSPACE_DIR / "entities" / str(project.entity_id) / "exports" / project.folder / "php"
            await worker("php-export", folder=project.folder, outDir=str(out))
            data, filename = zip_directory(out, f"{project.folder}.zip")
    except FileNotFoundError:
        return Response("Clone not found.", status_code=404)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Editor ──

@app.get("/api/pages")
async def get_pages(folder: str = Query(""), principal: Principal = Depends(current_principal),
                    db: Session = Depends(get_db)):
    project = project_for(db, principal, folder)
    try:
        return {"success": True, "pages": list_pages(project.folder)}
    except FileNotFoundError as e:
        return fail(str(e), 404)


@app.post("/api/create-page")
async def create_page(body: CreatePageRequest, request: Request,
                      principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = site_action(db, principal, body.folder, "site.create_page", request, {"page": body.pageName})
    return await versioned(db, principal, project, "site.create_page", f"Added page {body.pageName}",
                           worker("create-page", **{**body.model_dump(), "folder": project.folder}))


@app.get("/api/theme")
async def get_theme(folder: str = Query(""), refresh: str = Query("0"),
                    principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = project_for(db, principal, folder)
    return await worker("theme-get", folder=project.folder, refresh=refresh == "1")


@app.post("/api/theme")
async def post_theme(body: ThemePostRequest, request: Request,
                     principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = site_action(db, principal, body.folder, "site.theme", request)
    return await versioned(db, principal, project, "site.theme", "Changed theme colors",
                           worker("theme-post", **{**body.model_dump(), "folder": project.folder}))


@app.post("/api/generate-page")
async def generate_page(body: GeneratePageRequest, request: Request,
                        principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = site_action(db, principal, body.folder, "site.ai.generate_page", request,
                          {"page": body.pageName, "prompt": body.prompt[:500]})
    return await versioned(db, principal, project, "site.ai.generate_page", f"AI generated page {body.pageName}",
                           worker("generate-page", **{**body.model_dump(), "folder": project.folder}))


@app.post("/api/fix-with-ai")
async def fix_with_ai(body: FixWithAiRequest, request: Request,
                      principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not body.folder or not body.prompt.strip():
        return fail("Describe what should be fixed.", 400)
    project = site_action(db, principal, body.folder, "site.ai.fix", request,
                          {"page": body.page, "prompt": body.prompt[:500]})
    return await versioned(db, principal, project, "site.ai.fix", f"Fix with AI: {body.prompt[:120]}",
                           worker("fix-with-ai", folder=project.folder, page=body.page, prompt=body.prompt,
                                  imageSrc=body.imageSrc))


@app.post("/api/ai-customize")
async def ai_customize(body: AiCustomizeRequest, request: Request,
                       principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = site_action(db, principal, body.folder, "site.ai.customize", request, {"prompt": body.prompt[:500]})
    return await versioned(db, principal, project, "site.ai.customize", f"AI Assistant: {body.prompt[:120]}",
                           worker("ai-customize", **{**body.model_dump(), "folder": project.folder}))


@app.post("/api/ai-audit")
async def ai_audit(body: AiAuditRequest, request: Request,
                   principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = site_action(db, principal, body.folder, "site.ai.audit", request, {"mode": body.mode})
    return await versioned(db, principal, project, "site.ai.audit", "AI audit fixes",
                           worker("ai-audit", **{**body.model_dump(), "folder": project.folder}))


@app.post("/api/ai-fix-selection")
async def ai_fix_selection(body: AiFixSelectionRequest, request: Request,
                           principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = site_action(db, principal, body.folder, "site.ai.fix_selection", request,
                          {"page": body.page, "prompt": (body.prompt or "")[:500]})
    return await versioned(db, principal, project, "site.ai.fix_selection", "AI fixed a section from the original",
                           worker("ai-fix-selection", **{**body.model_dump(), "folder": project.folder}))


@app.post("/api/ai-edit-selection")
async def ai_edit_selection(body: AiEditSelectionRequest, request: Request,
                            principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = site_action(db, principal, body.folder, "site.ai.edit_selection", request,
                          {"page": body.page, "prompt": body.prompt[:500]})
    return await versioned(db, principal, project, "site.ai.edit_selection", f"AI changed an element: {body.prompt[:120]}",
                           worker("ai-edit-selection", **{**body.model_dump(), "folder": project.folder}))


@app.post("/api/head-snippets")
async def head_snippets(body: HeadSnippetsRequest, request: Request,
                        principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if body.snippet is None:
        project = project_for(db, principal, body.folder)
    else:
        project = site_action(db, principal, body.folder, "site.head_snippets", request)
    pending = worker("head-snippets", **{**body.model_dump(), "folder": project.folder})
    if body.snippet is None:
        return await pending
    return await versioned(db, principal, project, "site.head_snippets", "Updated head tags", pending)


@app.post("/api/history")
async def project_history(body: HistoryRequest, request: Request,
                          principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if body.action not in ("snapshot", "restore"):
        return fail("Unknown history action.", 400)
    if body.action == "restore" and not body.id:
        return fail("History step id is required.", 400)
    if body.action == "restore":
        project = site_action(db, principal, body.folder, "site.history_restore", request, {"label": body.label})
    else:
        project = project_for(db, principal, body.folder)
    pending = worker(f"history-{body.action}", folder=project.folder, id=body.id, label=body.label)
    if body.action != "restore":
        return await pending
    return await versioned(db, principal, project, "site.history_restore", f"Undo/redo: {body.label or 'change'}", pending)


@app.post("/api/php-restructure")
async def php_restructure(body: PhpRestructureRequest, request: Request,
                          principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = site_action(db, principal, body.folder, "site.php_restructure", request)
    return await versioned(db, principal, project, "site.php_restructure", "Rebuilt the PHP export",
                           worker("php-restructure", folder=project.folder))


@app.post("/api/save")
async def save_html(body: SaveRequest, request: Request,
                    principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not body.folder or not body.html:
        return fail("Folder and HTML are required.", 400)
    project = site_action(db, principal, body.folder, "site.save", request, {"page": body.page})
    try:
        saved = save_page(project.folder, body.page, body.html)
        safe_record_version(db, principal, project, "site.save", f"Saved {body.page}")
        return {"success": True, **saved}
    except FileNotFoundError as e:
        return fail(str(e), 404)
    except ValueError as e:
        return fail(str(e), 400)


@app.post("/api/upload")
async def upload_file(body: UploadRequest, request: Request,
                      principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not body.folder or not body.data:
        return fail("Folder and image data are required.", 400)
    project = site_action(db, principal, body.folder, "site.upload", request, {"ext": body.ext})
    try:
        return {"success": True, **upload_image(project.folder, body.data, body.ext)}
    except FileNotFoundError as e:
        return fail(str(e), 404)


@app.get("/editor-bridge.js")
async def serve_editor_bridge():
    bridge = ROOT / "public" / "editor-bridge.js"
    if not bridge.is_file():
        return Response("Editor bridge not found.", status_code=404)
    return FileResponse(bridge, media_type="application/javascript")


@app.get("/cloned/{folder_path:path}")
async def serve_cloned(folder_path: str, principal: Principal = Depends(current_principal),
                       db: Session = Depends(get_db)):
    project_for(db, principal, folder_path.split("/", 1)[0])
    file_path = resolve_cloned_file(f"/cloned/{folder_path}")
    if not file_path:
        return Response("File not found.", status_code=404)
    ext = file_path.suffix.lower()
    media_type = MIME_TYPES.get(ext, "application/octet-stream")
    return FileResponse(file_path, media_type=media_type)
