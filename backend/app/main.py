from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from app.config import MIME_TYPES, ROOT
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
from app.services.node_worker import run_node_worker
from app.services.site_service import (
    build_laravel_zip,
    build_zip,
    copy_brand_image,
    list_brand_galleries,
    list_pages,
    resolve_brand_file,
    resolve_cloned_file,
    save_page,
    site_dir,
    upload_image,
)

app = FastAPI(title="Website Cloner API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "backend": "fastapi"}


@app.get("/api/brand-gallery")
async def brand_gallery():
    return {"success": True, "brands": list_brand_galleries()}


@app.get("/api/brand-file")
async def brand_file(brand: str = Query(""), file: str = Query("")):
    try:
        path = resolve_brand_file(brand, file)
    except FileNotFoundError:
        return Response("Image not found.", status_code=404)
    return FileResponse(path)


@app.post("/api/replace-logos")
async def replace_logos(body: ReplaceLogosRequest):
    if not body.folder or not body.logoPath:
        return JSONResponse({"success": False, "error": "Choose a logo."}, status_code=400)
    try:
        return await run_node_worker(
            "replace-logos",
            folder=body.folder,
            logoPath=body.logoPath,
            oldSrc=body.oldSrc or "",
        )
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/brand-image")
async def use_brand_image(body: UseBrandImageRequest):
    if not body.folder or not body.brand or not body.file:
        return JSONResponse({"success": False, "error": "Choose a brand image."}, status_code=400)
    try:
        result = copy_brand_image(body.folder, body.brand, body.file)
        return {"success": True, **result}
    except FileNotFoundError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)


@app.get("/api/brands")
async def list_brands():
    try:
        return await run_node_worker("list-brands")
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/apply-brand")
async def apply_brand(body: ApplyBrandRequest):
    if not body.folder or not body.brand:
        return JSONResponse({"success": False, "error": "Choose a clone and a brand."}, status_code=400)
    try:
        return await run_node_worker("apply-brand", folder=body.folder, brand=body.brand)
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/clone")
async def clone_website(body: CloneRequest):
    if not body.url:
        return JSONResponse({"success": False, "error": "URL is required."}, status_code=400)
    try:
        return await run_node_worker(
            "clone",
            url=body.url,
            folderName=body.folderName,
            mode=body.mode,
        )
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.get("/api/clones")
async def list_clones():
    try:
        return await run_node_worker("list-clones")
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.delete("/api/clones")
async def delete_clone(folder: str = Query("")):
    if not folder:
        return JSONResponse({"success": False, "error": "A clone folder name is required."}, status_code=400)
    try:
        return await run_node_worker("delete-clone", folder=folder)
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/clones/restore")
async def restore_clone(trashId: str = Query("")):
    if not trashId:
        return JSONResponse({"success": False, "error": "A deleted site id is required."}, status_code=400)
    try:
        return await run_node_worker("restore-clone", trashId=trashId)
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.get("/api/download")
async def download_zip(folder: str = Query("")):
    try:
        directory = site_dir(folder)
        if not directory.exists():
            return Response("Clone not found.", status_code=404)
        if not (directory / "laravel" / "artisan").is_file():
            await run_node_worker("laravel-restructure", folder=folder)
        data, filename = build_laravel_zip(folder)
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except FileNotFoundError:
        return Response("Clone not found.", status_code=404)
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.get("/api/pages")
async def get_pages(folder: str = Query("")):
    try:
        pages = list_pages(folder)
        return {"success": True, "pages": pages}
    except FileNotFoundError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)


@app.post("/api/create-page")
async def create_page(body: CreatePageRequest):
    try:
        return await run_node_worker("create-page", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.get("/api/theme")
async def get_theme(folder: str = Query(""), refresh: str = Query("0")):
    try:
        return await run_node_worker("theme-get", folder=folder, refresh=refresh == "1")
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/theme")
async def post_theme(body: ThemePostRequest):
    try:
        return await run_node_worker("theme-post", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/generate-page")
async def generate_page(body: GeneratePageRequest):
    try:
        return await run_node_worker("generate-page", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/fix-with-ai")
async def fix_with_ai(body: FixWithAiRequest):
    if not body.folder or not body.prompt.strip():
        return JSONResponse({"success": False, "error": "Describe what should be fixed."}, status_code=400)
    try:
        return await run_node_worker(
            "fix-with-ai",
            folder=body.folder,
            page=body.page,
            prompt=body.prompt,
            imageSrc=body.imageSrc,
        )
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/ai-customize")
async def ai_customize(body: AiCustomizeRequest):
    try:
        return await run_node_worker("ai-customize", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/ai-audit")
async def ai_audit(body: AiAuditRequest):
    try:
        return await run_node_worker("ai-audit", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/ai-fix-selection")
async def ai_fix_selection(body: AiFixSelectionRequest):
    try:
        return await run_node_worker("ai-fix-selection", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/ai-edit-selection")
async def ai_edit_selection(body: AiEditSelectionRequest):
    try:
        return await run_node_worker("ai-edit-selection", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/head-snippets")
async def head_snippets(body: HeadSnippetsRequest):
    try:
        return await run_node_worker("head-snippets", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/history")
async def project_history(body: HistoryRequest):
    if body.action not in ("snapshot", "restore"):
        return JSONResponse({"success": False, "error": "Unknown history action."}, status_code=400)
    if body.action == "restore" and not body.id:
        return JSONResponse({"success": False, "error": "History step id is required."}, status_code=400)
    try:
        return await run_node_worker(
            f"history-{body.action}",
            folder=body.folder,
            id=body.id,
            label=body.label,
        )
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/php-restructure")
async def php_restructure(body: PhpRestructureRequest):
    try:
        return await run_node_worker("php-restructure", **body.model_dump())
    except RuntimeError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)


@app.post("/api/save")
async def save_html(body: SaveRequest):
    if not body.folder or not body.html:
        return JSONResponse({"success": False, "error": "Folder and HTML are required."}, status_code=400)
    try:
        result = save_page(body.folder, body.page, body.html)
        return {"success": True, **result}
    except FileNotFoundError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)


@app.post("/api/upload")
async def upload_file(body: UploadRequest):
    if not body.folder or not body.data:
        return JSONResponse({"success": False, "error": "Folder and image data are required."}, status_code=400)
    try:
        result = upload_image(body.folder, body.data, body.ext)
        return {"success": True, **result}
    except FileNotFoundError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)


@app.get("/editor-bridge.js")
async def serve_editor_bridge():
    bridge = ROOT / "public" / "editor-bridge.js"
    if not bridge.is_file():
        return Response("Editor bridge not found.", status_code=404)
    return FileResponse(bridge, media_type="application/javascript")


@app.get("/cloned/{folder_path:path}")
async def serve_cloned(folder_path: str):
    file_path = resolve_cloned_file(f"/cloned/{folder_path}")
    if not file_path:
        return Response("File not found.", status_code=404)
    ext = file_path.suffix.lower()
    media_type = MIME_TYPES.get(ext, "application/octet-stream")
    return FileResponse(file_path, media_type=media_type)
