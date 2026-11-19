import asyncio
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Principal, client_ip, current_principal, is_admin_user, log_activity, project_for, require_editable, require_entity, sanitize_folder, sees_all_sites
from app.bootstrap import bootstrap
from app.config import CLONED_DIR, CORS_ORIGINS, MIME_TYPES, ROOT, WORKSPACE_DIR
from app.db import CloneJob, Entity, Project, SiteSettings, User, get_db, utcnow
from app.services import brand_registry, github_push
from app.services.brand_text import rebrand_profile_text
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
from app.routes_asset_check import missing_message, repair_folder, router as asset_check_router
from app.routes_auth import router as auth_router
from app.services.node_worker import run_node_worker
from app.services.site_service import (
    build_laravel_zip,
    copy_brand_image,
    list_pages,
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
app.include_router(asset_check_router)
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


# Actions that don't change the site, so a locked site still allows them.
READ_ACTIONS = {"site.open", "site.download", "site.github_push_request"}


def site_settings(db: Session, project: Project) -> SiteSettings:
    settings = db.get(SiteSettings, project.id)
    if not settings:
        settings = SiteSettings(project_id=project.id, locked=False, github_repo="", github_url="")
        db.add(settings)
        db.flush()
    return settings


def site_action(db: Session, principal: Principal, folder: str, action: str, request: Request,
                details: dict | None = None) -> Project:
    """Ownership check for a site, plus an activity record for the change."""
    project = project_for(db, principal, folder)
    if action not in READ_ACTIONS:
        require_editable(db, principal, project)
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


# ── Brands (each entity sees and uses only its own) ──

def brand_scope(db: Session, principal: Principal, folder: str = "") -> tuple[str, Project | None]:
    """The entity whose brands apply: the site's entity when a site is given, else the caller's."""
    project = project_for(db, principal, folder) if folder else None
    entity_id = project.entity_id if project else principal.entity_id
    entity = db.get(Entity, entity_id) if entity_id else None
    return (entity.slug if entity else ""), project


def owned_brand(db: Session, principal: Principal, brand_id: str, entity: str) -> dict:
    brand = brand_registry.find_brand(brand_id)
    if not brand or brand["entity"] != entity:
        # Another entity's brand reads exactly like a missing one.
        raise HTTPException(404, "Brand not found.")
    return brand


@app.get("/api/brand-gallery")
async def brand_gallery(folder: str = Query(""), principal: Principal = Depends(current_principal),
                        db: Session = Depends(get_db)):
    entity, _ = brand_scope(db, principal, folder)
    return {"success": True, "brands": [brand_registry.gallery(b) for b in brand_registry.brands_for(entity) if b["usable"]]}


@app.get("/api/brand-file")
async def brand_file(brand: str = Query(""), file: str = Query(""), principal: Principal = Depends(current_principal),
                     db: Session = Depends(get_db)):
    found = brand_registry.find_brand(brand)
    if found and not principal.is_super_admin:
        own = db.get(Entity, principal.user.entity_id) if principal.user.entity_id else None
        if not own or own.slug != found["entity"]:
            found = None
    try:
        if not found:
            raise FileNotFoundError
        path = brand_registry.resolve_file(found, file)
    except FileNotFoundError:
        return Response("Image not found.", status_code=404)
    return FileResponse(path)


@app.get("/api/brands")
async def list_brands(folder: str = Query(""), principal: Principal = Depends(current_principal),
                      db: Session = Depends(get_db)):
    entity, _ = brand_scope(db, principal, folder)
    brands = brand_registry.brands_for(entity)
    return {"success": True, "entity": entity, "brands": [brand_registry.public(b) for b in brands]}


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
    entity, _ = brand_scope(db, principal, body.folder)
    brand = owned_brand(db, principal, body.brand, entity)
    project = site_action(db, principal, body.folder, "site.brand_image", request, {"brand": body.brand})
    try:
        return {"success": True, **copy_brand_image(project.folder, brand_registry.resolve_file(brand, body.file))}
    except FileNotFoundError as e:
        return fail(str(e), 404)


@app.post("/api/apply-brand")
async def apply_brand(body: ApplyBrandRequest, request: Request,
                      principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not body.folder or not body.brand:
        return fail("Choose a clone and a brand.", 400)
    entity, _ = brand_scope(db, principal, body.folder)
    brand = owned_brand(db, principal, body.brand, entity)
    if not brand["usable"]:
        return fail(brand["note"] or "This brand can't be applied yet.", 400)
    project = site_action(db, principal, body.folder, "site.apply_brand", request, {"brand": brand["id"]})

    async def run():
        # A clone of one of our own brand sites: swap its exact details (taglines, SEO text,
        # every phone format, colours, fonts) first, using the brand_data profiles.
        swapped = await asyncio.to_thread(rebrand_profile_text, project.folder, project.source_url or "", brand)
        result = await worker("apply-brand", folder=project.folder, brand=brand["id"], brandDir=brand["dir"])
        return {**result, "profileSwap": swapped}

    return await versioned(db, principal, project, "site.apply_brand", f"Applied brand {brand['name']}", run())


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
    every_entity = principal.is_super_admin  # the super admin sees every entity's sites
    if not entity_id and not every_entity:
        return {"success": True, "clones": []}
    visible = select(Project.folder).where(Project.deleted_at.is_(None))
    if not every_entity:
        visible = visible.where(Project.entity_id == entity_id)
    if not sees_all_sites(principal):
        visible = visible.where(Project.created_by == principal.user.id)
    owned = set(db.execute(visible).scalars())
    data = await worker("list-clones")
    data["clones"] = [c for c in data.get("clones", []) if c.get("folder") in owned]
    # The desktop screenshot of the original site makes a better card image than a guessed site image.
    shots: dict[str, int] = {}
    jobs = select(CloneJob).where(CloneJob.status == "succeeded").order_by(CloneJob.id)
    if not every_entity:
        jobs = jobs.where(CloneJob.entity_id == entity_id)
    for job in db.execute(jobs).scalars():
        if "desktop" in (job.screenshots or []):
            shots[job.folder] = job.id
    for clone in data["clones"]:
        if clone.get("folder") in shots:
            clone["thumbnail"] = f"/api/clone-jobs/{shots[clone['folder']]}/screenshot/desktop"
    ids = dict(db.execute(select(Project.folder, Project.id).where(Project.folder.in_(owned))).all())
    flags = {s.project_id: s for s in db.execute(select(SiteSettings).where(SiteSettings.project_id.in_(ids.values()))).scalars()}
    # Which entity each site belongs to, and (for admins) who cloned it.
    info = {row.folder: row for row in db.execute(
        select(Project.folder, Entity.name.label("entity_name"), User.email.label("creator"))
        .join(Entity, Entity.id == Project.entity_id)
        .outerjoin(User, User.id == Project.created_by)
        .where(Project.folder.in_(owned))
    )}
    for clone in data["clones"]:
        row = info.get(clone.get("folder"))
        clone["entityName"] = row.entity_name if row else ""
        if sees_all_sites(principal):
            clone["createdBy"] = (row.creator if row else "") or ""
    for clone in data["clones"]:
        s = flags.get(ids.get(clone.get("folder")))
        clone["locked"] = bool(s and s.locked)
        clone["githubRepo"] = s.github_repo if s and s.github_pushed_at else ""
        clone["githubUrl"] = s.github_url if s and s.github_pushed_at else ""
    data["canLock"] = is_admin_user(principal)
    data["allEntities"] = every_entity
    return data


class LockRequest(BaseModel):
    folder: str
    locked: bool


@app.post("/api/clones/lock")
async def lock_clone(body: LockRequest, request: Request,
                     principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Admins lock a site so regular users can't edit or delete it."""
    if not is_admin_user(principal):
        return fail("Only admins can lock or unlock sites.", 403)
    project = project_for(db, principal, body.folder)
    settings = site_settings(db, project)
    settings.locked = body.locked
    settings.locked_by = principal.user.id if body.locked else None
    settings.locked_at = utcnow() if body.locked else None
    log_activity(db, principal, "site.lock" if body.locked else "site.unlock", project.folder,
                 request=request, entity_id=project.entity_id)
    db.commit()
    return {"success": True, "locked": settings.locked}


@app.delete("/api/clones")
async def delete_clone(request: Request, folder: str = Query(""),
                       principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not folder:
        return fail("A clone folder name is required.", 400)
    project = project_for(db, principal, folder)
    require_editable(db, principal, project)
    result = await worker("delete-clone", folder=project.folder)
    project.deleted_at = utcnow()
    # The site's GitHub repo goes with it (permanently on GitHub).
    github = await asyncio.to_thread(github_push.delete_repo, project.entity_id, project.folder)
    settings = db.get(SiteSettings, project.id)
    if settings and github.get("deleted"):  # the repo is gone, so a restored site can be pushed again
        settings.github_repo, settings.github_url, settings.github_pushed_at = "", "", None
    log_activity(db, principal, "site.delete", project.folder,
                 {"githubRepoDeleted": github.get("repo") if github.get("deleted") else None}, request=request,
                 entity_id=project.entity_id)
    db.commit()
    return {**result, "github": github}


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


_github_tasks: set = set()


def start_github_push(db: Session, principal: Principal, project: Project, export_dir, request: Request) -> None:
    """Push the export to the org's GitHub repo in the background; the zip download doesn't wait."""
    if not github_push.is_configured():
        return
    entity = db.get(Entity, project.entity_id)
    entity_slug = entity.slug if entity else ""
    folder, entity_id, source_url, project_id = project.folder, project.entity_id, project.source_url or "", project.id
    # Captured now: the request's session is closed by the time the push finishes.
    user_id, ip = principal.user.id, client_ip(request)

    async def run():
        result = await github_push.push_export(entity_id, entity_slug, folder, export_dir, source_url)
        from app.db import ActivityLog, SessionLocal
        try:
            with SessionLocal() as session:
                session.add(ActivityLog(entity_id=entity_id, user_id=user_id, action="site.github_push", target=folder,
                                        details={k: result.get(k) for k in ("state", "repo", "commit", "error")}, ip=ip))
                if result.get("state") == "pushed":  # one push per site: the button goes away
                    settings = session.get(SiteSettings, project_id) or SiteSettings(project_id=project_id, locked=False)
                    settings.github_repo, settings.github_url = result.get("repo", ""), result.get("url", "")
                    settings.github_pushed_at = utcnow()
                    session.merge(settings)
                session.commit()
        except Exception:  # noqa: BLE001 — the audit entry must not hide the push result
            pass

    task = asyncio.create_task(run())
    _github_tasks.add(task)
    task.add_done_callback(_github_tasks.discard)


class GithubPushRequest(BaseModel):
    folder: str


@app.post("/api/github-push")
async def github_push_site(body: GithubPushRequest, request: Request,
                           principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Build the PHP project and push it to GitHub (no local download). The push runs in the
    background; /api/github-status reports its progress."""
    if not github_push.is_configured():
        return fail("GitHub isn't set up yet: add GITHUB_TOKEN to the .env file in the project folder.", 400)
    project = project_for(db, principal, body.folder)
    settings = db.get(SiteSettings, project.id)
    if settings and settings.github_pushed_at:
        return fail(f"This site is already on GitHub ({settings.github_repo}).", 409)
    project = site_action(db, principal, body.folder, "site.github_push_request", request)
    if not site_dir(project.folder).exists():
        return fail("Clone not found.", 404)
    # Last chance to bring back broken images; whatever is still missing blocks the push.
    report = await repair_folder(project.folder, project.source_url or "")
    if report.get("missing"):
        return fail(missing_message(report), 409)
    out = WORKSPACE_DIR / "entities" / str(project.entity_id) / "exports" / project.folder / "php"
    try:
        await worker("php-export", folder=project.folder, outDir=str(out))
    except FileNotFoundError as e:
        return fail(str(e), 404)
    start_github_push(db, principal, project, out, request)
    return {"success": True, "started": True}


@app.get("/api/github-name")
async def github_name(name: str = Query(""), principal: Principal = Depends(current_principal)):
    """Is a GitHub repo for this folder name still free? (Used by the clone form.)"""
    folder = sanitize_folder(name)
    if not folder:
        return {"success": True, "taken": None}
    return {"success": True, **(await asyncio.to_thread(github_push.repo_name_taken, folder))}


@app.get("/api/github-status")
async def github_status(folder: str = Query(""), principal: Principal = Depends(current_principal),
                        db: Session = Depends(get_db)):
    project = project_for(db, principal, folder)
    settings = db.get(SiteSettings, project.id)
    pushed = {"pushedRepo": settings.github_repo, "pushedUrl": settings.github_url} if settings and settings.github_pushed_at else {}
    locked = bool(settings and settings.locked)
    return {"success": True, **github_push.status_for(project.folder), **pushed,
            "locked": locked, "canEdit": not locked or is_admin_user(principal)}


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
