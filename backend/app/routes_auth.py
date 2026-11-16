from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    Principal,
    clear_failed_logins,
    client_ip,
    create_session,
    current_principal,
    hash_password,
    log_activity,
    login_locked,
    record_failed_login,
    token_hash,
    validate_password,
    verify_password,
)
from app.config import COOKIE_SECURE, SESSION_COOKIE, SESSION_HOURS
from app.db import AuthSession, Entity, PasswordResetToken, User, get_db, utcnow

router = APIRouter(prefix="/api/auth")

# Compared against when the email is unknown, so timing doesn't reveal which emails exist.
_DUMMY_HASH = hash_password("not-a-real-password-placeholder")


class LoginRequest(BaseModel):
    email: str
    password: str


class ResetRequest(BaseModel):
    token: str
    password: str


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


class SwitchEntityRequest(BaseModel):
    entityId: int


def user_payload(user: User, db: Session, principal: Principal | None = None) -> dict:
    entity = db.get(Entity, user.entity_id) if user.entity_id else None
    data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "entity": {"id": entity.id, "name": entity.name, "slug": entity.slug} if entity else None,
    }
    if principal and principal.is_super_admin:
        active = db.get(Entity, principal.session.active_entity_id) if principal.session.active_entity_id else None
        data["activeEntity"] = {"id": active.id, "name": active.name, "slug": active.slug} if active else None
        data["entities"] = [
            {"id": e.id, "name": e.name, "slug": e.slug, "status": e.status}
            for e in db.execute(select(Entity).order_by(Entity.name)).scalars()
        ]
    else:
        data["activeEntity"] = data["entity"]
    return data


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    key = f"{email}|{client_ip(request)}"
    if login_locked(key):
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    valid = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not valid:
        record_failed_login(key)
        raise HTTPException(401, "Email or password is incorrect.")
    if not user.is_active:
        raise HTTPException(403, "This account is disabled. Contact your administrator.")
    if user.role != "super_admin":
        entity = db.get(Entity, user.entity_id) if user.entity_id else None
        if not entity or entity.status != "active":
            raise HTTPException(403, "Your workspace is suspended. Contact your administrator.")

    clear_failed_logins(key)
    token, session = create_session(db, user, request)
    user.last_login_at = utcnow()
    db.flush()
    principal = Principal(user=user, session=session)
    log_activity(db, principal, "auth.login", user.email, request=request)
    db.commit()
    response.set_cookie(
        SESSION_COOKIE, token, max_age=SESSION_HOURS * 3600, httponly=True,
        samesite="lax", secure=COOKIE_SECURE, path="/",
    )
    return {"success": True, "user": user_payload(user, db, principal)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = db.execute(select(AuthSession).where(AuthSession.token_hash == token_hash(token))).scalar_one_or_none()
        if session:
            user = db.get(User, session.user_id)
            if user:
                log_activity(db, Principal(user=user, session=session), "auth.logout", user.email, request=request)
            db.delete(session)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"success": True}


@router.get("/me")
def me(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return {"success": True, "user": user_payload(principal.user, db, principal)}


@router.post("/switch-entity")
def switch_entity(body: SwitchEntityRequest, request: Request,
                  principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not principal.is_super_admin:
        raise HTTPException(403, "Only super admins can switch workspaces.")
    entity = db.get(Entity, body.entityId)
    if not entity:
        raise HTTPException(404, "Workspace not found.")
    principal.session.active_entity_id = entity.id
    log_activity(db, principal, "auth.switch_entity", entity.name, request=request, entity_id=entity.id)
    db.commit()
    return {"success": True, "user": user_payload(principal.user, db, principal)}


@router.post("/password-reset")
def password_reset(body: ResetRequest, request: Request, db: Session = Depends(get_db)):
    record = db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash(body.token.strip()))
    ).scalar_one_or_none()
    if not record or record.used_at or record.expires_at < utcnow():
        raise HTTPException(400, "This reset link is invalid or has expired. Ask your administrator for a new one.")
    validate_password(body.password)
    user = db.get(User, record.user_id)
    if not user:
        raise HTTPException(400, "This reset link is invalid.")
    user.password_hash = hash_password(body.password)
    record.used_at = utcnow()
    # Sign the user out everywhere after a reset.
    for session in db.execute(select(AuthSession).where(AuthSession.user_id == user.id)).scalars():
        db.delete(session)
    log_activity(db, None, "auth.password_reset", user.email, request=request, entity_id=user.entity_id)
    db.commit()
    return {"success": True}


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, request: Request,
                    principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not verify_password(body.currentPassword, principal.user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    validate_password(body.newPassword)
    principal.user.password_hash = hash_password(body.newPassword)
    for session in db.execute(select(AuthSession).where(AuthSession.user_id == principal.user.id)).scalars():
        if session.id != principal.session.id:
            db.delete(session)
    log_activity(db, principal, "auth.change_password", principal.user.email, request=request)
    db.commit()
    return {"success": True}
