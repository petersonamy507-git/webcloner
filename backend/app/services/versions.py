"""
Content-addressed version store for a site's editable files.

Layout: workspace/entities/<entity>/versions/<folder>/
  objects/ab/cdef...   gzip-compressed file contents, named by SHA-256
  manifests/<key>.json {path: [sha256, size, mtime_ns]}

A file that didn't change between versions is stored once, so keeping every
version is cheap. Images and other binaries are left out: uploads are never
overwritten in place, so restoring the text files is enough to bring a page back.
"""
import difflib
import gzip
import hashlib
import json
import os
import secrets
from pathlib import Path

from app.config import CLONED_DIR, WORKSPACE_DIR

TRACKED_EXT = {".html", ".htm", ".php", ".css", ".js", ".json", ".svg", ".txt", ".xml"}
SKIP_DIRS = {"external", "node_modules", "laravel", ".git"}
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_LISTED_CHANGES = 200


def store_dir(entity_id: int, folder: str) -> Path:
    return WORKSPACE_DIR / "entities" / str(entity_id) / "versions" / folder


def _scan(site: Path) -> dict[str, tuple[int, int]]:
    files = {}
    for dirpath, dirnames, filenames in os.walk(site):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            if name.startswith(".") or os.path.splitext(name)[1].lower() not in TRACKED_EXT:
                continue
            full = Path(dirpath) / name
            try:
                stat = full.stat()
            except OSError:
                continue
            if stat.st_size <= MAX_FILE_BYTES:
                files[full.relative_to(site).as_posix()] = (stat.st_size, stat.st_mtime_ns)
    return files


def _object_path(store: Path, digest: str) -> Path:
    return store / "objects" / digest[:2] / digest[2:]


def read_manifest(store: Path, key: str) -> dict[str, list]:
    if not key:
        return {}
    path = store / "manifests" / f"{key}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def snapshot(entity_id: int, folder: str, previous_key: str = "") -> tuple[str, dict, dict]:
    """
    Store the site's current files. Returns (key, manifest, changes vs. previous_key).
    Unchanged files are recognised by size+mtime against the previous manifest and not re-read.
    """
    site = CLONED_DIR / folder
    store = store_dir(entity_id, folder)
    previous = read_manifest(store, previous_key)
    manifest: dict[str, list] = {}
    for rel, (size, mtime) in _scan(site).items():
        old = previous.get(rel)
        if old and old[1] == size and old[2] == mtime and _object_path(store, old[0]).is_file():
            manifest[rel] = old
            continue
        data = (site / rel).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        target = _object_path(store, digest)
        if not target.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_suffix(".tmp")
            tmp.write_bytes(gzip.compress(data))
            tmp.replace(target)
        manifest[rel] = [digest, size, mtime]

    changes = diff_manifests(previous, manifest)
    key = f"v{secrets.token_hex(8)}"
    (store / "manifests").mkdir(parents=True, exist_ok=True)
    (store / "manifests" / f"{key}.json").write_text(json.dumps(manifest), encoding="utf-8")
    return key, manifest, changes


def diff_manifests(before: dict, after: dict) -> dict:
    added = sorted(p for p in after if p not in before)
    removed = sorted(p for p in before if p not in after)
    modified = sorted(p for p in after if p in before and before[p][0] != after[p][0])
    return {
        "added": added[:MAX_LISTED_CHANGES],
        "modified": modified[:MAX_LISTED_CHANGES],
        "removed": removed[:MAX_LISTED_CHANGES],
        "total": len(added) + len(modified) + len(removed),
    }


def drop_manifest(entity_id: int, folder: str, key: str) -> None:
    (store_dir(entity_id, folder) / "manifests" / f"{key}.json").unlink(missing_ok=True)


def restore(entity_id: int, folder: str, key: str) -> dict:
    """Make the site's tracked files exactly match version `key`."""
    site = CLONED_DIR / folder
    store = store_dir(entity_id, folder)
    target = read_manifest(store, key)
    if not target:
        raise FileNotFoundError("That version's files are no longer available.")
    restored = 0
    for rel, (digest, _size, _mtime) in target.items():
        dest = (site / rel).resolve()
        if site.resolve() not in dest.parents:
            continue
        data = gzip.decompress(_object_path(store, digest).read_bytes())
        if dest.is_file() and dest.read_bytes() == data:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        restored += 1
    removed = 0
    for rel in _scan(site):
        if rel not in target:
            (site / rel).unlink(missing_ok=True)
            removed += 1
    return {"restored": restored, "removed": removed}


def file_text(entity_id: int, folder: str, key: str, rel: str) -> str | None:
    store = store_dir(entity_id, folder)
    entry = read_manifest(store, key).get(rel)
    if not entry:
        return None
    return gzip.decompress(_object_path(store, entry[0]).read_bytes()).decode("utf-8", errors="replace")


def unified_diff(before: str | None, after: str | None, rel: str, max_lines: int = 1500) -> str:
    lines = list(difflib.unified_diff(
        (before or "").splitlines(), (after or "").splitlines(),
        fromfile=f"before/{rel}", tofile=f"after/{rel}", lineterm="", n=2,
    ))
    if len(lines) > max_lines:
        lines = lines[:max_lines] + [f"… {len(lines) - max_lines} more lines not shown"]
    return "\n".join(lines)


def collect_garbage(entity_id: int, folder: str, keep_keys: set[str]) -> int:
    """Delete manifests no revision uses, then any stored file no manifest references."""
    store = store_dir(entity_id, folder)
    manifests = store / "manifests"
    if not manifests.is_dir():
        return 0
    used: set[str] = set()
    for path in manifests.glob("*.json"):
        if path.stem not in keep_keys:
            path.unlink(missing_ok=True)
            continue
        used.update(entry[0] for entry in json.loads(path.read_text(encoding="utf-8")).values())
    freed = 0
    for obj in (store / "objects").glob("*/*"):
        if obj.parent.name + obj.name not in used:
            obj.unlink(missing_ok=True)
            freed += 1
    return freed
