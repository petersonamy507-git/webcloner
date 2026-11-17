import base64
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SESSION_COOKIE, SESSION_HOURS
from app.db import ActivityLog, AuthSession, Entity, Project, User, get_db, utcnow

MIN_PASSWORD_LENGTH = 10
_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=64, **_SCRYPT)
    return "scrypt${n}${r}${p}${salt}${hash}".format(
        **_SCRYPT,
        salt=base64.b64encode(salt).decode(),
        hash=base64.b64encode(digest).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), dklen=64, n=int(n), r=int(r), p=int(p)
        )
        return hmac.compare_digest(digest, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


def validate_password(password: str) -> None:
    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def client_ip(request: Request) -> str:
    return (request.client.host if request.client else "")[:64]


# Simple in-process brute-force guard: 5 failures per email+IP per 15 minutes.
_FAILED_LOGINS: dict[str, deque] = defaultdict(deque)
_LOCK_WINDOW = 15 * 60
_LOCK_LIMIT = 5


def login_locked(key: str) -> bool:
    attempts = _FAILED_LOGINS[key]
    now = time.monotonic()
    while attempts and now - attempts[0] > _LOCK_WINDOW:
        attempts.popleft()
    return len(attempts) >= _LOCK_LIMIT


def record_failed_login(key: str) -> None:
    _FAILED_LOGINS[key].append(time.monotonic())


def clear_failed_logins(key: str) -> None:
    _FAILED_LOGINS.pop(key, None)


def create_session(db: Session, user: User, request: Request) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    active_entity = user.entity_id
    if active_entity is None:
        active_entity = db.execute(select(Entity.id).order_by(Entity.id)).scalars().first()
    session = AuthSession(
        token_hash=token_hash(token),
        user_id=user.id,
        active_entity_id=active_entity,
        expires_at=utcnow() + timedelta(hours=SESSION_HOURS),
        ip=client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:255],
    )
    db.add(session)
    return token, session


@dataclass
class Principal:
    user: User
    session: AuthSession

    @property
    def is_super_admin(self) -> bool:
        return self.user.role == "super_admin"

    @property
    def entity_id(self) -> int | None:
        """The entity this request acts in: own entity, or the one a super admin switched to."""
        if self.is_super_admin:
            return self.session.active_entity_id
        return self.user.entity_id


def current_principal(request: Request, db: Session = Depends(get_db)) -> Principal:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Please sign in.")
    session = db.execute(
        select(AuthSession).where(AuthSession.token_hash == token_hash(token))
    ).scalar_one_or_none()
    if not session or session.expires_at < utcnow():
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "This account is disabled.")
    if user.role != "super_admin":
        entity = db.get(Entity, user.entity_id) if user.entity_id else None
        if not entity or entity.status != "active":
            raise HTTPException(401, "Your workspace is suspended.")
    return Principal(user=user, session=session)


def require_admin(principal: Principal = Depends(current_principal)) -> Principal:
    if principal.user.role not in ("super_admin", "entity_admin"):
        raise HTTPException(403, "Administrator access required.")
    return principal


def require_super_admin(principal: Principal = Depends(current_principal)) -> Principal:
    if not principal.is_super_admin:
        raise HTTPException(403, "Super admin access required.")
    return principal


def require_entity(principal: Principal) -> int:
    """Entity the request acts in; super admins must pick one first."""
    if not principal.entity_id:
        raise HTTPException(400, "Choose a workspace first.")
    return principal.entity_id


def sanitize_folder(folder: str) -> str:
    return "".join(ch for ch in (folder or "") if ch.isalnum() or ch in "_-")


def sees_all_sites(principal: Principal) -> bool:
    """Admins see every site in their workspace; members only the sites they cloned."""
    return principal.user.role in ("super_admin", "entity_admin")


def project_for(db: Session, principal: Principal, folder: str, include_deleted: bool = False) -> Project:
    """Load a project the caller may access. Unknown and foreign projects both read as 404."""
    name = sanitize_folder(folder)
    if not name:
        raise HTTPException(400, "A site folder is required.")
    project = db.execute(select(Project).where(Project.folder == name)).scalar_one_or_none()
    if not project or (project.deleted_at and not include_deleted):
        raise HTTPException(404, "Site not found.")
    if not principal.is_super_admin and project.entity_id != principal.user.entity_id:
        raise HTTPException(404, "Site not found.")
    if not sees_all_sites(principal) and project.created_by != principal.user.id:
        raise HTTPException(404, "Site not found.")
    return project


def log_activity(
    db: Session,
    principal: Principal | None,
    action: str,
    target: str = "",
    details: dict | None = None,
    request: Request | None = None,
    entity_id: int | None = None,
) -> None:
    db.add(ActivityLog(
        entity_id=entity_id if entity_id is not None else (principal.entity_id if principal else None),
        user_id=principal.user.id if principal else None,
        action=action,
        target=str(target or "")[:255],
        details=details or {},
        ip=client_ip(request) if request else "",
    ))
