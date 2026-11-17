from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from app.config import DATABASE_URL

ROLES = ("super_admin", "entity_admin", "entity_user")


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Add it to .env, e.g. "
        "DATABASE_URL=mysql+pymysql://user:password@127.0.0.1:3306/web_cloner"
    )

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600, future=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
Base = declarative_base()


class Entity(Base):
    __tablename__ = "entities"
    id = Column(Integer, primary_key=True)
    slug = Column(String(64), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    status = Column(String(16), nullable=False, default="active")  # active | suspended
    settings = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(120), nullable=False, default="")
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="entity_user")
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    last_login_at = Column(DateTime, nullable=True)

    entity = relationship("Entity")


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(Integer, primary_key=True)
    token_hash = Column(String(64), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    active_entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    expires_at = Column(DateTime, nullable=False)
    ip = Column(String(64), nullable=False, default="")
    user_agent = Column(String(255), nullable=False, default="")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True)
    token_hash = Column(String(64), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)


class Project(Base):
    """A cloned website. `folder` is its directory under cloned/."""

    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False, index=True)
    folder = Column(String(128), unique=True, nullable=False)
    name = Column(String(255), nullable=False, default="")
    source_url = Column(String(1024), nullable=False, default="")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    deleted_at = Column(DateTime, nullable=True)


class SiteSettings(Base):
    """Per-site flags: an admin lock, and the one-time GitHub push."""

    __tablename__ = "site_settings"
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    locked = Column(Boolean, nullable=False, default=False)
    locked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_at = Column(DateTime, nullable=True)
    github_repo = Column(String(255), nullable=False, default="")
    github_url = Column(String(512), nullable=False, default="")
    github_pushed_at = Column(DateTime, nullable=True)


class Asset(Base):
    """A file in a workspace's asset library, stored under workspace/entities/<entity_id>/assets/."""

    __tablename__ = "assets"
    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False, index=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    file_name = Column(String(255), nullable=False)
    stored_name = Column(String(80), unique=True, nullable=False)
    mime_type = Column(String(100), nullable=False)
    kind = Column(String(16), nullable=False)  # image | svg | video | font
    size = Column(Integer, nullable=False)
    usage = Column(JSON, nullable=False, default=list)  # [{"folder": ..., "path": ...}]
    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    deleted_at = Column(DateTime, nullable=True)

    uploader = relationship("User")


class CloneJob(Base):
    """A clone running (or queued) in the background, with live progress."""

    __tablename__ = "clone_jobs"
    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    url = Column(String(1024), nullable=False)
    folder = Column(String(128), nullable=False, index=True)
    mode = Column(String(16), nullable=False, default="landing")
    status = Column(String(16), nullable=False, default="queued")  # queued | running | succeeded | failed | cancelled
    progress = Column(Integer, nullable=False, default=0)
    stage = Column(String(255), nullable=False, default="Waiting to start")
    error = Column(String(1000), nullable=True)
    result = Column(JSON, nullable=False, default=dict)
    screenshots = Column(JSON, nullable=False, default=list)  # ["desktop", "tablet", "mobile"]
    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    user = relationship("User")


class Revision(Base):
    """One saved version of a site. Its files live in the workspace version store under `version_key`."""

    __tablename__ = "revisions"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False, index=True)
    number = Column(Integer, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(64), nullable=False)
    label = Column(String(255), nullable=False, default="")
    version_key = Column(String(64), nullable=False)
    changes = Column(JSON, nullable=False, default=dict)  # {"added": [...], "modified": [...], "removed": [...]}
    restored_from = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)

    user = relationship("User")


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(64), nullable=False)
    target = Column(String(255), nullable=False, default="")
    details = Column(JSON, nullable=False, default=dict)
    ip = Column(String(64), nullable=False, default="")
    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)

    user = relationship("User")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
