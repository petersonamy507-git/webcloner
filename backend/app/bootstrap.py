import json
import os
import shutil

from sqlalchemy import select

from app.auth import hash_password
from app.config import CLONED_DIR
from app.db import Base, CloneJob, Entity, Project, User, SessionLocal, engine, utcnow

DEFAULT_ENTITY_SLUG = "default"
ENTITY_SLUGS = ("apex", "codified", "orion", "vanguard", "zenium", "ink-blaze", "ivertax-lab")
# Display names where capitalising the slug isn't right (these match the brand_data group folders).
ENTITY_NAMES = {"ink-blaze": "Ink-Blaze", "ivertax-lab": "Ivertax Lab"}


def _clone_meta(folder) -> dict:
    meta = folder / "clone-meta.json"
    try:
        return json.loads(meta.read_text(encoding="utf-8")) if meta.is_file() else {}
    except (OSError, ValueError):
        return {}


def bootstrap() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        default = db.execute(select(Entity).where(Entity.slug == DEFAULT_ENTITY_SLUG)).scalar_one_or_none()
        if not default:
            default = Entity(slug=DEFAULT_ENTITY_SLUG, name="Default workspace", status="active", settings={})
            db.add(default)
            db.flush()

        # The company's entities; every new user is assigned to one of them.
        existing = set(db.execute(select(Entity.slug)).scalars())
        for slug in ENTITY_SLUGS:
            if slug not in existing:
                db.add(Entity(slug=slug, name=ENTITY_NAMES.get(slug, slug.capitalize()), status="active", settings={}))
        db.flush()

        known = set(db.execute(select(Project.folder)).scalars())

        # A restart kills running clones; say so, and remove their half-written folders.
        for job in db.execute(select(CloneJob).where(CloneJob.status.in_(("queued", "running")))).scalars():
            job.status, job.stage, job.finished_at = "failed", "Interrupted", utcnow()
            job.error = "The server restarted while this clone was running. Start it again."
            backup = CLONED_DIR / f".{job.folder}.previous"
            if backup.is_dir():  # a re-clone: the earlier copy comes back
                shutil.rmtree(CLONED_DIR / job.folder, ignore_errors=True)
                backup.rename(CLONED_DIR / job.folder)
                job.error += " The previous copy of the site was kept."
            elif job.folder not in known:
                shutil.rmtree(CLONED_DIR / job.folder, ignore_errors=True)

        # Clones made before accounts existed belong to the default workspace; a folder
        # a clone job created belongs to that job's workspace.
        job_entities = dict(db.execute(select(CloneJob.folder, CloneJob.entity_id)).all())
        for folder in sorted(CLONED_DIR.iterdir()):
            if not folder.is_dir() or folder.name.startswith(".") or folder.name in known:
                continue
            meta = _clone_meta(folder)
            db.add(Project(
                entity_id=job_entities.get(folder.name, default.id),
                folder=folder.name,
                name=meta.get("title") or folder.name,
                source_url=meta.get("sourceUrl") or "",
            ))
            known.add(folder.name)

        # Trashed sites ("<folder>--<timestamp>") stay restorable by the default workspace.
        trash = CLONED_DIR.parent / ".cloner-trash"
        if trash.is_dir():
            for entry in sorted(trash.iterdir()):
                name = entry.name.rsplit("--", 1)[0]
                if not entry.is_dir() or "--" not in entry.name or name in known:
                    continue
                db.add(Project(entity_id=default.id, folder=name, name=name,
                               source_url=_clone_meta(entry).get("sourceUrl") or "", deleted_at=utcnow()))
                known.add(name)

        email = os.environ.get("SUPERADMIN_EMAIL", "").strip().lower()
        password = os.environ.get("SUPERADMIN_PASSWORD", "")
        has_super = db.execute(select(User.id).where(User.role == "super_admin")).first()
        if email and password and not has_super:
            db.add(User(email=email, name="Super Admin", password_hash=hash_password(password),
                        role="super_admin", entity_id=None, is_active=True))
        db.commit()
