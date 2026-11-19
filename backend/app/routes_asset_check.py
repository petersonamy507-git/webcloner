"""Broken-image check: re-download what we can, flag the rest for the user to replace."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import Principal, current_principal, log_activity, project_for, require_editable
from app.db import get_db
from app.routes_versions import safe_record_version
from app.services.asset_repair import missing_report, repair_site
from app.services.site_service import site_dir

router = APIRouter()
_locks: dict[str, asyncio.Lock] = {}


class RepairRequest(BaseModel):
    folder: str


async def repair_folder(folder: str, source_url: str = "") -> dict:
    """One repair per site at a time; the network part runs off the event loop."""
    lock = _locks.setdefault(folder, asyncio.Lock())
    async with lock:
        return await asyncio.to_thread(repair_site, folder, source_url)


def missing_message(report: dict) -> str:
    count = report.get("missing") or 0
    pages = len(report.get("pages") or {})
    return (f"Some images are missing: {count} image{'s' if count != 1 else ''} on "
            f"{pages} page{'s' if pages != 1 else ''} still need{'s' if count == 1 else ''} to be replaced. "
            "Open the site in the editor, click each red “Image missing” box and replace it with a "
            "brand asset or an upload, then push again.")


@router.get("/api/missing-assets")
def missing_assets(folder: str = Query(...), principal: Principal = Depends(current_principal),
                   db: Session = Depends(get_db)):
    project = project_for(db, principal, folder)
    if not site_dir(project.folder).is_dir():
        raise HTTPException(404, "Clone not found.")
    return {"success": True, **missing_report(project.folder)}


@router.post("/api/repair-assets")
async def repair_assets(body: RepairRequest, request: Request,
                        principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = project_for(db, principal, body.folder)
    require_editable(db, principal, project)
    if not site_dir(project.folder).is_dir():
        raise HTTPException(404, "Clone not found.")
    result = await repair_folder(project.folder, project.source_url or "")
    log_activity(db, principal, "site.assets.repair", project.folder, {
        "recovered": result["recovered"], "placeholders": result["placeholdersAdded"], "missing": result["missing"],
    }, request, entity_id=project.entity_id)
    db.commit()
    if result["pagesChanged"] or result["recovered"]:
        safe_record_version(db, principal, project, "site.assets.repair",
                            f"Fixed broken images ({result['recovered']} restored, {result['missing']} missing)"[:255])
    return {"success": True, **result}
