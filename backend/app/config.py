import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLONED_DIR = ROOT / "cloned"
CLONED_DIR.mkdir(parents=True, exist_ok=True)
WORKSPACE_DIR = ROOT / "workspace"


def _load_env_file(path: Path) -> None:
    """Minimal .env reader; real environment variables always win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\"`"))


_load_env_file(ROOT / ".env")

# e.g. mysql+pymysql://user:password@127.0.0.1:3306/web_cloner
DATABASE_URL = os.environ.get("DATABASE_URL", "")
SESSION_COOKIE = "wc_session"
SESSION_HOURS = int(os.environ.get("SESSION_HOURS", "12"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "0") == "1"
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:5173")

# Downloads also push the PHP project to a private GitHub repo: in GITHUB_ORG when set,
# otherwise on the token owner's own account. The token must be able to create and push repos.
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GITHUB_ORG = os.environ.get("GITHUB_ORG", "").strip()
GITHUB_API = os.environ.get("GITHUB_API", "https://api.github.com").rstrip("/")

MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
}
