"""
Background clone jobs: queued, run at most CLONE_SLOTS at a time, with live
progress read from the Node cloner, desktop/tablet/mobile screenshots of the
original site, and a validation scan of the result.
"""
import asyncio
import os
import shutil
import time
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import Principal, current_principal, log_activity, require_entity, sanitize_folder, sees_all_sites
from app.config import CLONED_DIR, WORKSPACE_DIR
from app.db import CloneJob, Project, SessionLocal, SiteSettings, User, get_db, utcnow
from app.services import github_push
from app.models import CloneRequest
from app.routes_versions import safe_record_version
from app.services.node_worker import run_node_worker

router = APIRouter()

# Clones that run at the same time on this server (each one drives its own Chrome);
# more wait in the queue. Per workspace, up to MAX_ACTIVE can be queued or running.
CLONE_CONCURRENCY = max(1, int(os.environ.get("CLONE_CONCURRENCY", "4")))
CLONE_SLOTS = asyncio.Semaphore(CLONE_CONCURRENCY)
ACTIVE = ("queued", "running")
MAX_ACTIVE_PER_WORKSPACE = max(1, int(os.environ.get("CLONE_MAX_ACTIVE_PER_WORKSPACE", "8")))
DEVICES = ("desktop", "tablet", "mobile")
SHOTS = DEVICES + ("desktop-popup",)  # desktop-popup: the page as it opened, popup still showing

_processes: dict[int, asyncio.subprocess.Process] = {}
_cancelled: set[int] = set()
_tasks: set[asyncio.Task] = set()
# Session cookies waiting for their job to start. Memory only: never in the database or logs.
_sessions: dict[int, str] = {}


def job_dir(entity_id: int, job_id: int):
    return WORKSPACE_DIR / "entities" / str(entity_id) / "clone-jobs" / str(job_id)


def previous_copy(folder: str):
    """Where a site's existing copy waits while it is cloned again."""
    return CLONED_DIR / f".{folder}.previous"


def put_back_previous(folder: str) -> bool:
    """A re-clone failed or was interrupted: bring the earlier copy back."""
    backup = previous_copy(folder)
    if not backup.is_dir():
        return False
    shutil.rmtree(CLONED_DIR / folder, ignore_errors=True)
    backup.rename(CLONED_DIR / folder)
    return True


def iso(value):
    return value.isoformat() + "Z" if value else None


def folder_conflict(db: Session, entity_id: int, folder: str, principal: Principal | None = None) -> str | None:
    existing = db.execute(select(Project).where(Project.folder == folder)).scalar_one_or_none()
    if existing and existing.entity_id != entity_id:
        return "That folder name is already taken. Choose another."
    # A member may re-clone their own site, not overwrite a teammate's.
    if existing and principal and not sees_all_sites(principal) and existing.created_by != principal.user.id:
        return "That folder name is already taken. Choose another."
    if not existing and (CLONED_DIR / folder).exists():
        return "That folder name is already taken. Choose another."
    running = db.execute(
        select(CloneJob.id).where(CloneJob.folder == folder, CloneJob.status.in_(ACTIVE)).limit(1)
    ).first()
    if running:
        return "A clone into that folder is already in progress."
    return None


def github_repo_is_this_sites(db: Session, folder: str) -> bool:
    """Re-cloning a site that already pushed to its own repo is fine."""
    project = db.execute(select(Project).where(Project.folder == folder)).scalar_one_or_none()
    settings = db.get(SiteSettings, project.id) if project else None
    return bool(settings and settings.github_pushed_at)


def register_clone(db: Session, actor, entity_id: int, folder: str, url: str, mode: str, result: dict) -> Project:
    """Add (or refresh) the site in the workspace library after a successful clone."""
    project = db.execute(select(Project).where(Project.folder == folder)).scalar_one_or_none()
    if not project:
        project = Project(entity_id=entity_id, folder=folder, created_by=actor.user.id if actor else None)
        db.add(project)
    project.name = (result.get("title") or url)[:255]
    project.source_url = url[:1024]
    project.deleted_at = None
    log_activity(db, actor, "site.clone", folder, {"url": url, "mode": mode}, entity_id=entity_id)
    db.commit()
    safe_record_version(db, actor, project, "site.clone", f"Cloned from {url}"[:255])
    return project


def job_payload(job: CloneJob) -> dict:
    return {
        "id": job.id,
        "url": job.url,
        "folder": job.folder,
        "mode": job.mode,
        "status": job.status,
        "progress": job.progress,
        "stage": job.stage,
        "error": job.error,
        "result": job.result or {},
        "screenshots": {d: f"/api/clone-jobs/{job.id}/screenshot/{d}" for d in (job.screenshots or [])},
        "userEmail": job.user.email if job.user else None,
        "createdAt": iso(job.created_at),
        "startedAt": iso(job.started_at),
        "finishedAt": iso(job.finished_at),
    }


def _update(job_id: int, **fields) -> None:
    with SessionLocal() as db:
        job = db.get(CloneJob, job_id)
        if job:
            for key, value in fields.items():
                setattr(job, key, value)
            db.commit()


def _validation_summary(audit: dict) -> dict:
    issues = audit.get("issues") or []
    by_severity: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for issue in issues:
        by_severity[issue.get("severity", "other")] = by_severity.get(issue.get("severity", "other"), 0) + 1
        by_type[issue.get("type", "other")] = by_type.get(issue.get("type", "other"), 0) + 1
    return {"summary": audit.get("summary", ""), "pagesChecked": audit.get("pagesChecked"),
            "bySeverity": by_severity, "byType": by_type, "total": len(issues)}


async def run_job(job_id: int) -> None:
    async with CLONE_SLOTS:
        with SessionLocal() as db:
            job = db.get(CloneJob, job_id)
            if not job or job.status != "queued":
                return
            job.status, job.started_at, job.stage, job.progress = "running", utcnow(), "Starting", 2
            db.commit()
            entity_id, url, folder, mode, user_id = job.entity_id, job.url, job.folder, job.mode, job.user_id
        session_cookies = _sessions.pop(job_id, None)
        shots = job_dir(entity_id, job_id) / "screenshots"
        last = {"t": 0.0, "p": -1}

        def on_progress(event: dict) -> None:
            percent = min(96, int(event.get("percent") or 0))
            now = time.monotonic()
            # Keep database writes modest: at most ~1/second unless the bar jumps.
            if now - last["t"] < 0.8 and percent - last["p"] < 5:
                return
            last.update(t=now, p=percent)
            _update(job_id, progress=percent, stage=str(event.get("stage") or "Working")[:255])

        # Cloning again over an existing site: keep the old copy until the new one is done.
        target, backup = CLONED_DIR / folder, previous_copy(folder)
        if target.is_dir():
            shutil.rmtree(backup, ignore_errors=True)
            target.rename(backup)

        try:
            result = await run_node_worker(
                "clone", on_progress=on_progress, on_start=lambda proc: _processes.__setitem__(job_id, proc),
                url=url, folderName=folder, mode=mode, screenshotDir=str(shots),
                **({"sessionCookies": session_cookies} if session_cookies else {}),
            )
        except RuntimeError as e:
            cancelled = job_id in _cancelled
            _cancelled.discard(job_id)
            if not put_back_previous(folder):
                with SessionLocal() as db:
                    if not db.execute(select(Project.id).where(Project.folder == folder)).first():
                        shutil.rmtree(CLONED_DIR / folder, ignore_errors=True)  # don't leave a half-cloned folder
            _update(job_id, status="cancelled" if cancelled else "failed", finished_at=utcnow(),
                    stage="Cancelled" if cancelled else "Failed",
                    error=None if cancelled else str(e)[:1000])
            return
        finally:
            _processes.pop(job_id, None)

        shutil.rmtree(backup, ignore_errors=True)  # the new copy replaces it
        final_folder = sanitize_folder(result.get("folder") or folder) or folder
        _update(job_id, progress=97, stage="Fixing broken images")
        try:
            from app.routes_asset_check import repair_folder
            repaired = await repair_folder(final_folder, url)
            assets = {k: repaired.get(k) for k in ("recovered", "missing", "stylesheetMissing", "pages")}
        except Exception as e:  # noqa: BLE001 — a failed check must not fail the clone
            assets = {"error": str(e)[:300]}
        _update(job_id, progress=98, stage="Checking the cloned site")
        try:
            validation = _validation_summary(await run_node_worker(
                "ai-audit", folder=final_folder, mode="audit", categories=["all"], useAI=False))
        except RuntimeError as e:
            validation = {"summary": f"Validation skipped: {e}", "total": None}

        with SessionLocal() as db:
            user = db.get(User, user_id) if user_id else None
            actor = SimpleNamespace(user=user, entity_id=entity_id) if user else None
            register_clone(db, actor, entity_id, final_folder, url, mode, result)
            job = db.get(CloneJob, job_id)
            job.folder = final_folder
            job.status, job.progress, job.stage, job.finished_at = "succeeded", 100, "Done", utcnow()
            job.screenshots = [d for d in SHOTS if (shots / f"{d}.jpg").is_file()]
            job.result = {k: result.get(k) for k in (
                "url", "folder", "pagesCloned", "filesDownloaded", "totalSize", "previewUrl", "downloadUrl", "fallback",
                "access")}
            job.result["validation"] = validation
            job.result["assets"] = assets
            db.commit()


def load_job(db: Session, principal: Principal, job_id: int) -> CloneJob:
    job = db.get(CloneJob, job_id)
    if not job or (not principal.is_super_admin and job.entity_id != principal.user.entity_id):
        raise HTTPException(404, "Clone job not found.")
    if not sees_all_sites(principal) and job.user_id != principal.user.id:
        raise HTTPException(404, "Clone job not found.")
    return job


@router.post("/api/clone-jobs")
async def start_clone_job(body: CloneRequest, request: Request,
                          principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    entity_id = require_entity(principal)
    folder = sanitize_folder(body.folderName or "") or f"clone_{int(time.time() * 1000)}"
    conflict = folder_conflict(db, entity_id, folder, principal)
    if conflict:
        raise HTTPException(409, conflict)
    if body.folderName and not github_repo_is_this_sites(db, folder):
        taken = await asyncio.to_thread(github_push.repo_name_taken, folder)
        if taken.get("taken"):
            raise HTTPException(409, f"A GitHub repository named \"{taken['repo'].split('/')[-1]}\" already exists "
                                     f"({taken['repo']}). Choose another folder name.")
    active = db.execute(
        select(func.count(CloneJob.id)).where(CloneJob.entity_id == entity_id, CloneJob.status.in_(ACTIVE))
    ).scalar_one()
    if active >= MAX_ACTIVE_PER_WORKSPACE:
        raise HTTPException(429, f"Your workspace already has {active} clones running. Wait for one to finish.")

    job = CloneJob(entity_id=entity_id, user_id=principal.user.id, url=body.url[:1024], folder=folder,
                   mode=body.mode, status="queued", stage="Waiting to start", progress=0)
    db.add(job)
    db.flush()
    log_activity(db, principal, "site.clone_started", folder,
                 {"url": body.url, "mode": body.mode, "job": job.id, "withSession": bool(body.sessionCookies)},
                 request, entity_id=entity_id)
    db.commit()
    if body.sessionCookies and body.sessionCookies.strip():
        _sessions[job.id] = body.sessionCookies
    task = asyncio.create_task(run_job(job.id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"success": True, "job": job_payload(job)}


@router.get("/api/clone-jobs")
def list_clone_jobs(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    entity_id = principal.entity_id
    if not entity_id:
        return {"success": True, "jobs": []}
    query = select(CloneJob).where(CloneJob.entity_id == entity_id)
    if not sees_all_sites(principal):
        query = query.where(CloneJob.user_id == principal.user.id)
    jobs = db.execute(query.order_by(CloneJob.id.desc()).limit(15)).scalars().all()
    return {"success": True, "jobs": [job_payload(j) for j in jobs]}


@router.get("/api/clone-jobs/{job_id}")
def get_clone_job(job_id: int, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return {"success": True, "job": job_payload(load_job(db, principal, job_id))}


@router.post("/api/clone-jobs/{job_id}/cancel")
def cancel_clone_job(job_id: int, request: Request,
                     principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    job = load_job(db, principal, job_id)
    if job.user_id != principal.user.id and principal.user.role == "entity_user":
        raise HTTPException(403, "Only the person who started this clone, or an admin, can cancel it.")
    if job.status == "queued":
        job.status, job.stage, job.finished_at = "cancelled", "Cancelled", utcnow()
        _sessions.pop(job.id, None)
    elif job.status == "running":
        proc = _processes.get(job.id)
        if not proc:
            raise HTTPException(409, "This clone is finishing up and can't be cancelled now.")
        _cancelled.add(job.id)
        proc.kill()
    else:
        raise HTTPException(409, "This clone has already finished.")
    log_activity(db, principal, "site.clone_cancelled", job.folder, {"job": job.id}, request, entity_id=job.entity_id)
    db.commit()
    return {"success": True}


@router.get("/api/clone-jobs/{job_id}/screenshot/{device}")
def clone_job_screenshot(job_id: int, device: str,
                         principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    job = load_job(db, principal, job_id)
    if device not in SHOTS or device not in (job.screenshots or []):
        raise HTTPException(404, "Screenshot not found.")
    path = job_dir(job.entity_id, job.id) / "screenshots" / f"{device}.jpg"
    if not path.is_file():
        raise HTTPException(404, "Screenshot not found.")
    return FileResponse(path, media_type="image/jpeg",
                        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400"})
