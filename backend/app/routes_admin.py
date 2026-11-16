import csv
import io
import json
import re
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import (
    Principal,
    current_principal,
    hash_password,
    log_activity,
    require_admin,
    require_super_admin,
    token_hash,
    validate_password,
)
from app.config import APP_BASE_URL, WORKSPACE_DIR
from app.db import (
    ROLES,
    ActivityLog,
    AuthSession,
    Entity,
    PasswordResetToken,
    Project,
    User,
    get_db,
    utcnow,
)

router = APIRouter(prefix="/api/admin")

RESET_LINK_HOURS = 24
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EntityCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    status: str = "active"
    settings: dict[str, Any] = {}


class EntityUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    settings: Optional[dict[str, Any]] = None


class UserCreate(BaseModel):
    email: str
    name: str = ""
    role: str = "entity_user"
    entityId: Optional[int] = None
    password: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    entityId: Optional[int] = None
    isActive: Optional[bool] = None


def iso(value) -> Optional[str]:
    return value.isoformat() + "Z" if value else None


def entity_payload(entity: Entity, db: Session) -> dict:
    users = db.execute(select(func.count(User.id)).where(User.entity_id == entity.id)).scalar_one()
    projects = db.execute(
        select(func.count(Project.id)).where(Project.entity_id == entity.id, Project.deleted_at.is_(None))
    ).scalar_one()
    return {
        "id": entity.id, "name": entity.name, "slug": entity.slug, "status": entity.status,
        "settings": entity.settings or {}, "createdAt": iso(entity.created_at),
        "userCount": users, "projectCount": projects,
    }


def user_row(user: User) -> dict:
    return {
        "id": user.id, "email": user.email, "name": user.name, "role": user.role,
        "entityId": user.entity_id, "entityName": user.entity.name if user.entity else None,
        "isActive": user.is_active, "createdAt": iso(user.created_at), "lastLoginAt": iso(user.last_login_at),
    }


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:64]


def check_status(status: str) -> str:
    if status not in ("active", "suspended"):
        raise HTTPException(400, "Status must be active or suspended.")
    return status


# ── Entities ──

@router.get("/entities")
def list_entities(principal: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(Entity).order_by(Entity.name)
    if not principal.is_super_admin:
        query = query.where(Entity.id == principal.user.entity_id)
    return {"success": True, "entities": [entity_payload(e, db) for e in db.execute(query).scalars()]}


@router.post("/entities")
def create_entity(body: EntityCreate, request: Request,
                  principal: Principal = Depends(require_super_admin), db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Workspace name is required.")
    slug = slugify(body.slug or name)
    if not slug:
        raise HTTPException(400, "Workspace ID must contain letters or numbers.")
    if db.execute(select(Entity.id).where(Entity.slug == slug)).first():
        raise HTTPException(409, f"Workspace ID “{slug}” is already taken.")
    entity = Entity(name=name[:120], slug=slug, status=check_status(body.status), settings=body.settings or {})
    db.add(entity)
    db.flush()
    log_activity(db, principal, "entity.create", entity.name, {"slug": slug}, request, entity_id=entity.id)
    db.commit()
    return {"success": True, "entity": entity_payload(entity, db)}


@router.patch("/entities/{entity_id}")
def update_entity(entity_id: int, body: EntityUpdate, request: Request,
                  principal: Principal = Depends(require_super_admin), db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(404, "Workspace not found.")
    changes = {}
    if body.name is not None and body.name.strip():
        entity.name = changes["name"] = body.name.strip()[:120]
    if body.status is not None:
        entity.status = changes["status"] = check_status(body.status)
    if body.settings is not None:
        entity.settings = body.settings
        changes["settings"] = True
    log_activity(db, principal, "entity.update", entity.name, changes, request, entity_id=entity.id)
    db.commit()
    return {"success": True, "entity": entity_payload(entity, db)}


# ── Users ──

def manageable_user(db: Session, principal: Principal, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    if not principal.is_super_admin and (user.role == "super_admin" or user.entity_id != principal.user.entity_id):
        raise HTTPException(404, "User not found.")
    return user


def resolve_role_and_entity(db: Session, principal: Principal, role: str, entity_id: Optional[int]) -> tuple[str, Optional[int]]:
    if role not in ROLES:
        raise HTTPException(400, "Unknown role.")
    if not principal.is_super_admin:
        if role == "super_admin":
            raise HTTPException(403, "Only super admins can grant super admin access.")
        return role, principal.user.entity_id
    if role == "super_admin":
        return role, None
    if not entity_id or not db.get(Entity, entity_id):
        raise HTTPException(400, "Choose a workspace for this user.")
    return role, entity_id


def issue_reset_link(db: Session, principal: Principal, user: User) -> dict:
    token = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(hours=RESET_LINK_HOURS)
    db.add(PasswordResetToken(token_hash=token_hash(token), user_id=user.id,
                              created_by=principal.user.id, expires_at=expires))
    return {"link": f"{APP_BASE_URL}/reset-password.html?token={token}", "expiresAt": iso(expires)}


@router.get("/users")
def list_users(entityId: Optional[int] = Query(None),
               principal: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(User).order_by(User.email)
    if not principal.is_super_admin:
        query = query.where(User.entity_id == principal.user.entity_id)
    elif entityId:
        query = query.where(User.entity_id == entityId)
    return {"success": True, "users": [user_row(u) for u in db.execute(query).scalars()]}


@router.post("/users")
def create_user(body: UserCreate, request: Request,
                principal: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address.")
    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(409, "A user with this email already exists.")
    role, entity_id = resolve_role_and_entity(db, principal, body.role, body.entityId)
    if body.password:
        validate_password(body.password)
    user = User(
        email=email, name=(body.name or "").strip()[:120], role=role, entity_id=entity_id, is_active=True,
        # Without a password, the account can only be activated through the set-password link.
        password_hash=hash_password(body.password or secrets.token_urlsafe(32)),
    )
    db.add(user)
    db.flush()
    setup = None if body.password else issue_reset_link(db, principal, user)
    log_activity(db, principal, "user.create", email, {"role": role}, request, entity_id=entity_id)
    db.commit()
    return {"success": True, "user": user_row(user), "setPasswordLink": setup}


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserUpdate, request: Request,
                principal: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    user = manageable_user(db, principal, user_id)
    is_self = user.id == principal.user.id
    changes: dict[str, Any] = {}
    if body.name is not None:
        user.name = changes["name"] = body.name.strip()[:120]
    if body.role is not None or body.entityId is not None:
        if is_self:
            raise HTTPException(400, "You can't change your own role or workspace.")
        role, entity_id = resolve_role_and_entity(db, principal, body.role or user.role, body.entityId or user.entity_id)
        user.role, user.entity_id = role, entity_id
        changes.update(role=role, entityId=entity_id)
    if body.isActive is not None:
        if is_self and not body.isActive:
            raise HTTPException(400, "You can't disable your own account.")
        user.is_active = changes["isActive"] = body.isActive
        if not body.isActive:
            for session in db.execute(select(AuthSession).where(AuthSession.user_id == user.id)).scalars():
                db.delete(session)
    log_activity(db, principal, "user.update", user.email, changes, request, entity_id=user.entity_id)
    db.commit()
    return {"success": True, "user": user_row(user)}


@router.post("/users/{user_id}/reset-link")
def reset_link(user_id: int, request: Request,
               principal: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    user = manageable_user(db, principal, user_id)
    link = issue_reset_link(db, principal, user)
    log_activity(db, principal, "user.reset_link", user.email, request=request, entity_id=user.entity_id)
    db.commit()
    return {"success": True, **link}


# ── Activity / audit log ──

ACTION_CATEGORIES = {
    "auth": ("auth.",),
    "admin": ("entity.", "user."),
    "site": ("site.clone", "site.delete", "site.restore", "site.save", "site.upload", "site.download",
             "site.open", "site.theme", "site.create_page", "site.history_restore", "site.version_restore",
             "site.head_snippets", "site.replace_logos", "site.apply_brand", "site.brand_image", "site.php_restructure"),
    "ai": ("site.ai.",),
    "asset": ("asset.",),
}


def scoped_activity_query(principal: Principal, entityId: Optional[int]):
    query = select(ActivityLog)
    role = principal.user.role
    if role == "super_admin":
        if entityId:
            query = query.where(ActivityLog.entity_id == entityId)
    elif role == "entity_admin":
        query = query.where(ActivityLog.entity_id == principal.user.entity_id)
    else:
        query = query.where(ActivityLog.user_id == principal.user.id)
    return query


def parse_day(value: str, end: bool = False):
    try:
        day = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Dates must look like 2026-11-17.")
    return day + timedelta(days=1) if end else day


def csv_cell(value) -> str:
    """Spreadsheets run cells starting with = + - @ as formulas; logged prompts must stay plain text."""
    text = "" if value is None else str(value)
    return f"'{text}" if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def activity_row(log: ActivityLog) -> dict:
    return {
        "id": log.id, "action": log.action, "target": log.target, "details": log.details or {},
        "entityId": log.entity_id, "userEmail": log.user.email if log.user else None,
        "ip": log.ip, "createdAt": iso(log.created_at),
    }


@router.get("/activity")
def activity(entityId: Optional[int] = Query(None), user: str = Query(""), category: str = Query(""),
             site: str = Query(""), dateFrom: str = Query(""), dateTo: str = Query(""),
             before: Optional[int] = Query(None), limit: int = Query(100, ge=1, le=500), format: str = Query("json"),
             principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    query = scoped_activity_query(principal, entityId)
    if user.strip():
        query = query.join(User, ActivityLog.user_id == User.id).where(User.email.like(f"%{user.strip().lower()[:120]}%"))
    if category in ACTION_CATEGORIES:
        query = query.where(or_(*[ActivityLog.action.like(f"{prefix}%") for prefix in ACTION_CATEGORIES[category]]))
    if site.strip():
        query = query.where(ActivityLog.target.like(f"%{site.strip()[:120]}%"))
    if dateFrom:
        query = query.where(ActivityLog.created_at >= parse_day(dateFrom))
    if dateTo:
        query = query.where(ActivityLog.created_at < parse_day(dateTo, end=True))

    if format == "csv":
        rows = db.execute(query.order_by(ActivityLog.id.desc()).limit(10000)).scalars().all()
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["time_utc", "user", "action", "target", "workspace_id", "ip", "details"])
        for log in rows:
            writer.writerow([csv_cell(v) for v in (
                iso(log.created_at), log.user.email if log.user else "", log.action, log.target,
                log.entity_id or "", log.ip, json.dumps(log.details or {}, ensure_ascii=False))])
        return Response(out.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="activity-log.csv"'})

    if before:
        query = query.where(ActivityLog.id < before)
    rows = db.execute(query.order_by(ActivityLog.id.desc()).limit(limit + 1)).scalars().all()
    return {"success": True, "activity": [activity_row(log) for log in rows[:limit]],
            "nextBefore": rows[limit - 1].id if len(rows) > limit else None}


@router.get("/activity/{log_id}/screenshot/{name}")
def activity_screenshot(log_id: int, name: str,
                        principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """The screenshots sent with an AI edit, visible to whoever may see that log entry."""
    log = db.execute(scoped_activity_query(principal, None).where(ActivityLog.id == log_id)).scalar_one_or_none()
    if not log or name not in (log.details or {}).get("screenshots", []) or not log.entity_id:
        raise HTTPException(404, "Screenshot not found.")
    path = WORKSPACE_DIR / "entities" / str(log.entity_id) / "screenshots" / Path(name).name
    if not path.is_file():
        raise HTTPException(404, "Screenshot not found.")
    return FileResponse(path, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"})
