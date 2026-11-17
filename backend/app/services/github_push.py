"""Push a site's PHP export to a private GitHub repository.

Repos go to GITHUB_ORG when it is set, otherwise to the token owner's own account.

Each site gets one repo, named after its project name; every download adds a commit to it, so the
history of exports is kept. A local working copy per site lives under
workspace/entities/<id>/github/<folder>. The token is passed to git through environment
config (an HTTP header), never on the command line or in the remote URL.
"""
import asyncio
import base64
import json
import logging
import os
import re
import shutil
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from app.config import ROOT, WORKSPACE_DIR

log = logging.getLogger(__name__)

MAX_FILE_BYTES = 95 * 1024 * 1024  # GitHub rejects files over 100 MB
_locks: dict[str, asyncio.Lock] = {}
_status: dict[str, dict] = {}  # folder -> latest push result, for the UI
_owner: dict[str, str] = {}  # token -> owner login


def _settings() -> dict:
    """GitHub settings, re-read from .env on every use so a new token works without a restart.
    Real environment variables win over the file."""
    values = {}
    env_file = ROOT / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("GITHUB_") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("'\"`")
    get = lambda key, default="": (os.environ.get(key) or values.get(key) or default).strip()
    return {"token": get("GITHUB_TOKEN"), "org": get("GITHUB_ORG"),
            "api": get("GITHUB_API", "https://api.github.com").rstrip("/")}


def is_configured() -> bool:
    return bool(_settings()["token"])


def account_login() -> str:
    """The GitHub user the token belongs to."""
    token = _settings()["token"]
    if token not in _owner:
        code, data = _api("GET", "/user")
        if code != 200 or not data.get("login"):
            raise RuntimeError(f"The GitHub token was refused ({code}): {data.get('message', 'check GITHUB_TOKEN')}")
        _owner[token] = data["login"]
    return _owner[token]


def repo_owner() -> str:
    """Where repos are created: the organization if one is set, else the token owner's account."""
    return _settings()["org"] or account_login()


def repo_name(entity_slug: str, folder: str) -> str:
    """The repo is named after the project name the user gave the clone (its folder)."""
    return re.sub(r"[^A-Za-z0-9._-]+", "-", folder).strip("-.")[:100] or "site"


def status_for(folder: str) -> dict:
    if not is_configured():
        return {"state": "not-configured"}
    return _status.get(folder, {"state": "idle"})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── GitHub REST API ──

def _api(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    cfg = _settings()
    request = urllib.request.Request(
        f"{cfg['api']}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {cfg['token']}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "website-cloner",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode() or "{}"
            return response.status, json.loads(text)
    except urllib.error.HTTPError as err:
        try:
            return err.code, json.loads(err.read().decode() or "{}")
        except ValueError:
            return err.code, {}


class RepoNameTaken(RuntimeError):
    """A repository with this name already exists on the GitHub account."""


def _repo_is_empty(owner: str, name: str) -> bool:
    code, branches = _api("GET", f"/repos/{owner}/{name}/branches")
    return code == 200 and isinstance(branches, list) and not branches


def repo_name_taken(folder: str) -> dict:
    """Whether the repo a site would push to already exists. {"taken": bool, "repo": "owner/name"};
    {"taken": None} when GitHub isn't set up or can't be reached."""
    if not is_configured():
        return {"taken": None}
    name = repo_name("", folder)
    try:
        owner = repo_owner()
        code, _ = _api("GET", f"/repos/{owner}/{name}")
    except Exception:  # noqa: BLE001
        return {"taken": None, "repo": name}
    if code == 404:
        return {"taken": False, "repo": f"{owner}/{name}"}
    if code == 200:
        return {"taken": not _repo_is_empty(owner, name), "repo": f"{owner}/{name}"}
    return {"taken": None, "repo": f"{owner}/{name}"}


def create_repo(owner: str, name: str, description: str) -> dict:
    """A new private repo for this site. A repo with the same name is never pushed into
    (only an empty one, left by a push that failed halfway, is reused)."""
    code, data = _api("GET", f"/repos/{owner}/{name}")
    if code == 200:
        if _repo_is_empty(owner, name):
            return data
        raise RepoNameTaken(f"A repository named \"{name}\" already exists on GitHub ({owner}/{name}). "
                            "Clone the site again under another folder name, then push.")
    if code != 404:
        raise RuntimeError(f"GitHub answered {code}: {data.get('message', 'could not look up the repository')}")
    path = f"/orgs/{owner}/repos" if _settings()["org"] else "/user/repos"
    code, data = _api("POST", path, {
        "name": name, "private": True, "description": description[:350], "auto_init": False,
    })
    if code == 422 and "already exists" in str(data):
        raise RepoNameTaken(f"A repository named \"{name}\" already exists on GitHub ({owner}/{name}).")
    if code not in (200, 201):
        raise RuntimeError(f"Could not create {owner}/{name}: {data.get('message', code)}")
    return data


ensure_repo = create_repo  # older name


# ── git ──

def _git_env(token: str | None) -> dict:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    if token:
        basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()
        env.update({
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "http.extraHeader",
            "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {basic}",
        })
    return env


async def _git(cwd: Path, *args: str, env: dict, check: bool = True) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(
        "git", *args, cwd=str(cwd), env=env,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    out, _ = await proc.communicate()
    text = out.decode(errors="replace").strip()
    if check and proc.returncode != 0:
        raise RuntimeError(f"git {args[0]} failed: {text[-400:]}")
    return proc.returncode, text


def _sync_tree(source: Path, work: Path) -> list[str]:
    """Make the working copy match the export (everything except .git). Returns skipped files."""
    for entry in work.iterdir():
        if entry.name == ".git":
            continue
        shutil.rmtree(entry) if entry.is_dir() and not entry.is_symlink() else entry.unlink()
    skipped = []
    for path in source.rglob("*"):
        rel = path.relative_to(source)
        if ".git" in rel.parts:
            continue
        target = work / rel
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif path.is_file():
            if path.stat().st_size > MAX_FILE_BYTES:
                skipped.append(rel.as_posix())
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    return skipped


async def push_tree(source: Path, work: Path, remote_url: str, message: str, token: str | None) -> dict:
    """Commit `source` on top of the remote's main branch and push it. Works on empty repos too."""
    env = _git_env(token)
    if not (work / ".git").is_dir():
        work.mkdir(parents=True, exist_ok=True)
        await _git(work, "init", "-q", env=env)
        await _git(work, "remote", "add", "origin", remote_url, env=env)
    else:
        await _git(work, "remote", "set-url", "origin", remote_url, env=env)
    fetched, _ = await _git(work, "fetch", "-q", "origin", "main", env=env, check=False)
    if fetched == 0:
        await _git(work, "reset", "-q", "--hard", "FETCH_HEAD", env=env)
    await _git(work, "checkout", "-q", "-B", "main", env=env)

    skipped = await asyncio.to_thread(_sync_tree, source, work)
    await _git(work, "add", "-A", env=env)
    unchanged, _ = await _git(work, "diff", "--cached", "--quiet", env=env, check=False)
    if unchanged == 0 and fetched == 0:
        return {"changed": False, "skipped": skipped}
    await _git(work, "-c", "user.name=Website Cloner", "-c", "user.email=cloner@users.noreply.github.com",
               "commit", "-q", "--allow-empty", "-m", message, env=env)
    await _git(work, "push", "-q", "origin", "HEAD:main", env=env)
    _, sha = await _git(work, "rev-parse", "--short", "HEAD", env=env)
    return {"changed": True, "commit": sha, "skipped": skipped}


async def push_export(entity_id: int, entity_slug: str, folder: str, export_dir: Path, source_url: str = "") -> dict:
    """Push one site's export; records the outcome for status_for(folder)."""
    if not is_configured():
        return {"state": "not-configured"}
    lock = _locks.setdefault(folder, asyncio.Lock())
    async with lock:
        name = repo_name(entity_slug, folder)
        cfg = _settings()
        owner = cfg["org"] or _owner.get(cfg["token"], "")
        _status[folder] = {"state": "pushing", "repo": f"{owner}/{name}" if owner else name, "url": "", "at": _now()}
        try:
            owner = await asyncio.to_thread(repo_owner)
            repo_url = f"https://github.com/{owner}/{name}"
            _status[folder].update(repo=f"{owner}/{name}", url=repo_url)
            await asyncio.to_thread(create_repo, owner, name,
                                    f"Website clone of {source_url}" if source_url else f"Website clone: {folder}")
            work = WORKSPACE_DIR / "entities" / str(entity_id) / "github" / folder
            stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            result = await push_tree(export_dir, work, f"https://github.com/{owner}/{name}.git",
                                     f"Export from Website Cloner ({stamp})", cfg["token"])
            _status[folder] = {"state": "pushed", "repo": f"{owner}/{name}", "url": repo_url, "at": _now(), **result}
        except Exception as err:  # noqa: BLE001 — reported to the user, never breaks the download
            log.warning("GitHub push for %s failed: %s", folder, err)
            _status[folder] = {**_status[folder], "state": "error", "at": _now(),
                               "error": (str(err).replace(cfg["token"], "***") if cfg["token"] else str(err))[:400]}
        return _status[folder]


def delete_repo(entity_id: int, folder: str) -> dict:
    """Delete the site's GitHub repo (permanent on GitHub) and its local working copy.
    Returns {"deleted": bool, "repo": ..., "error": ...}; a missing repo is not an error."""
    work = WORKSPACE_DIR / "entities" / str(entity_id) / "github" / folder
    shutil.rmtree(work, ignore_errors=True)
    _status.pop(folder, None)
    if not is_configured():
        return {"deleted": False}
    name = repo_name("", folder)
    try:
        owner = repo_owner()
    except Exception as err:  # noqa: BLE001
        return {"deleted": False, "error": str(err)[:300]}
    code, data = _api("DELETE", f"/repos/{owner}/{name}")
    if code == 204:
        return {"deleted": True, "repo": f"{owner}/{name}"}
    if code == 404:
        return {"deleted": False, "repo": f"{owner}/{name}"}  # never pushed
    hint = " The token needs the Administration: Read and write permission." if code == 403 else ""
    return {"deleted": False, "repo": f"{owner}/{name}",
            "error": f"GitHub refused to delete {owner}/{name} ({code}): {str(data.get('message', '')).rstrip('.')}.{hint}"}
