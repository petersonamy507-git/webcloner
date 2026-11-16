import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import Principal, current_principal, log_activity, project_for
from app.db import ActivityLog, Project, Revision, get_db, utcnow
from app.services import versions

router = APIRouter()
log = logging.getLogger("versions")

MAX_REVISIONS = 300
# Quick repeated saves by the same person fold into one version instead of dozens.
SQUASH_ACTIONS = {"site.save"}
SQUASH_WINDOW = timedelta(minutes=2)


def iso(value):
    return value.isoformat() + "Z" if value else None


def record_version(db: Session, principal: Principal | None, project: Project, action: str, label: str) -> Revision | None:
    """Snapshot the site after a change. Returns the revision, or None when nothing changed."""
    latest = db.execute(
        select(Revision).where(Revision.project_id == project.id).order_by(Revision.number.desc()).limit(1)
    ).scalar_one_or_none()
    user_id = principal.user.id if principal else None
    key, manifest, changes = versions.snapshot(project.entity_id, project.folder, latest.version_key if latest else "")
    if latest and changes["total"] == 0:
        versions.drop_manifest(project.entity_id, project.folder, key)
        return None

    if (latest and action in SQUASH_ACTIONS and latest.action == action and latest.user_id == user_id
            and utcnow() - latest.created_at < SQUASH_WINDOW):
        base = db.execute(
            select(Revision).where(Revision.project_id == project.id, Revision.number < latest.number)
            .order_by(Revision.number.desc()).limit(1)
        ).scalar_one_or_none()
        base_manifest = versions.read_manifest(versions.store_dir(project.entity_id, project.folder),
                                               base.version_key if base else "")
        versions.drop_manifest(project.entity_id, project.folder, latest.version_key)
        latest.version_key = key
        latest.changes = versions.diff_manifests(base_manifest, manifest)
        latest.created_at = utcnow()
        return latest

    revision = Revision(
        project_id=project.id, entity_id=project.entity_id, number=(latest.number + 1) if latest else 1,
        user_id=user_id, action=action, label=label[:255], version_key=key, changes=changes,
    )
    db.add(revision)
    db.flush()
    _apply_retention(db, project)
    return revision


def _apply_retention(db: Session, project: Project) -> None:
    count = db.execute(select(func.count(Revision.id)).where(Revision.project_id == project.id)).scalar_one()
    if count <= MAX_REVISIONS:
        return
    old = db.execute(
        select(Revision).where(Revision.project_id == project.id).order_by(Revision.number).limit(count - MAX_REVISIONS)
    ).scalars().all()
    for revision in old:
        db.delete(revision)
    db.flush()
    keep = set(db.execute(select(Revision.version_key).where(Revision.project_id == project.id)).scalars())
    versions.collect_garbage(project.entity_id, project.folder, keep)


def safe_record_version(db: Session, principal: Principal | None, project: Project, action: str, label: str):
    """Versioning must never undo a change the user already made, so failures are logged, not raised."""
    try:
        revision = record_version(db, principal, project, action, label)
        db.commit()
        return revision
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("Could not record a version for %s", project.folder)
        return None


def revision_payload(rev: Revision, current_id: int | None, numbers: dict[int, int]) -> dict:
    return {
        "id": rev.id,
        "number": rev.number,
        "action": rev.action,
        "label": rev.label,
        "userEmail": rev.user.email if rev.user else None,
        "userName": rev.user.name if rev.user else None,
        "createdAt": iso(rev.created_at),
        "changes": rev.changes or {},
        "isCurrent": rev.id == current_id,
        "restoredFrom": numbers.get(rev.restored_from) if rev.restored_from else None,
    }


@router.get("/api/versions")
def list_versions(folder: str = Query(""), limit: int = Query(100, ge=1, le=300),
                  principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    project = project_for(db, principal, folder)
    revisions = db.execute(
        select(Revision).where(Revision.project_id == project.id).order_by(Revision.number.desc()).limit(limit)
    ).scalars().all()
    numbers = {r.id: r.number for r in revisions}
    current = revisions[0].id if revisions else None
    can_restore = principal.user.role in ("super_admin", "entity_admin")
    return {"success": True, "canRestore": can_restore,
            "versions": [revision_payload(r, current, numbers) for r in revisions]}


def load_revision(db: Session, principal: Principal, revision_id: int) -> tuple[Revision, Project]:
    revision = db.get(Revision, revision_id)
    if not revision:
        raise HTTPException(404, "Version not found.")
    project = db.get(Project, revision.project_id)
    project_for(db, principal, project.folder, include_deleted=True)  # same ownership rules as the site
    return revision, project


@router.get("/api/versions/{revision_id}/diff")
def version_diff(revision_id: int, file: str = Query(...),
                 principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    revision, project = load_revision(db, principal, revision_id)
    previous = db.execute(
        select(Revision).where(Revision.project_id == project.id, Revision.number < revision.number)
        .order_by(Revision.number.desc()).limit(1)
    ).scalar_one_or_none()
    after = versions.file_text(project.entity_id, project.folder, revision.version_key, file)
    before = versions.file_text(project.entity_id, project.folder, previous.version_key, file) if previous else None
    if after is None and before is None:
        raise HTTPException(404, "That file isn't part of this version.")
    return {"success": True, "file": file, "diff": versions.unified_diff(before, after, file)}


@router.post("/api/versions/{revision_id}/restore")
def restore_version(revision_id: int, request: Request,
                    principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if principal.user.role not in ("super_admin", "entity_admin"):
        raise HTTPException(403, "Only workspace admins can restore earlier versions.")
    target, project = load_revision(db, principal, revision_id)
    if project.deleted_at:
        raise HTTPException(400, "Restore the site from the trash first.")

    # Capture anything changed outside the editor, so this restore can itself be undone.
    record_version(db, principal, project, "site.before_restore", "Before restoring an earlier version")
    try:
        result = versions.restore(project.entity_id, project.folder, target.version_key)
    except FileNotFoundError as e:
        db.rollback()
        raise HTTPException(410, str(e))
    revision = record_version(db, principal, project, "site.version_restore", f"Restored version {target.number}")
    if revision:
        revision.restored_from = target.id
    log_activity(db, principal, "site.version_restore", project.folder,
                 {"version": target.number, **result}, request, entity_id=project.entity_id)
    db.commit()
    return {"success": True, "restoredVersion": target.number,
            "newVersion": revision.number if revision else None, **result}


class OpenedRequest(BaseModel):
    folder: str


@router.post("/api/sites/opened")
def site_opened(body: OpenedRequest, request: Request,
                principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Editor-open events for the activity trail, at most one per user and site every 10 minutes."""
    project = project_for(db, principal, body.folder)
    recent = db.execute(
        select(ActivityLog.id).where(
            ActivityLog.user_id == principal.user.id, ActivityLog.action == "site.open",
            ActivityLog.target == project.folder, ActivityLog.created_at > utcnow() - timedelta(minutes=10),
        ).limit(1)
    ).first()
    if not recent:
        log_activity(db, principal, "site.open", project.folder, request=request, entity_id=project.entity_id)
        db.commit()
    return {"success": True}
