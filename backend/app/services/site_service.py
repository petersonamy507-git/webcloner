import base64
import io
import json
import os
import random
import re
import shutil
import string
import time
import zipfile
from pathlib import Path
from urllib.parse import quote

from app.config import CLONED_DIR, ROOT


def sanitize_folder(folder: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", folder or "")


def site_dir(folder: str) -> Path:
    return CLONED_DIR / sanitize_folder(folder)


def page_label(file: str) -> str:
    if file == "index.html":
        return "Home"
    name = re.sub(r"/index\.html?$", "", file, flags=re.I)
    name = re.sub(r"\.html?$", "", name, flags=re.I)
    last = name.split("/")[-1] if name else name
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), last.replace("-", " ").replace("_", " "))


def collect_html_files(directory: Path, base: Path | None = None) -> list[str]:
    base = base or directory
    pages: list[str] = []
    if not directory.exists():
        return pages
    for entry in directory.iterdir():
        if entry.name.startswith("."):
            continue
        if entry.is_dir():
            if entry.name in {"external", "node_modules"}:
                continue
            pages.extend(collect_html_files(entry, base))
        elif re.search(r"\.html?$", entry.name, re.I):
            pages.append(str(entry.relative_to(base)).replace(os.sep, "/"))
    return pages


def list_pages(folder: str) -> list[dict[str, str]]:
    directory = site_dir(folder)
    if not directory.exists():
        raise FileNotFoundError("Clone folder not found.")

    pages = [{"file": f, "label": page_label(f)} for f in collect_html_files(directory)]
    pages.sort(key=lambda p: (0 if p["file"] == "index.html" else 1, p["file"]))
    return pages


def resolve_page_path(directory: Path, page: str) -> Path:
    rel = Path(page or "index.html")
    if rel.is_absolute() or ".." in rel.parts:
        raise ValueError("Invalid page path.")
    target = (directory / rel).resolve()
    if not str(target).startswith(str(directory.resolve())):
        raise ValueError("Invalid page path.")
    return target


def save_page(folder: str, page: str, html: str) -> dict:
    directory = site_dir(folder)
    if not directory.exists():
        raise FileNotFoundError("Clone folder not found.")
    target = resolve_page_path(directory, page)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding="utf-8")
    return {"file": str(target.relative_to(directory.resolve())).replace("\\", "/")}


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
BRANDS_DIR = ROOT / "brands"


def brand_dir(brand_id: str) -> Path:
    safe = re.sub(r"[^a-z0-9_-]", "", (brand_id or "").lower())
    directory = (BRANDS_DIR / safe).resolve()
    root = BRANDS_DIR.resolve()
    if not safe or not str(directory).startswith(str(root)) or not directory.is_dir():
        raise FileNotFoundError("Brand not found.")
    return directory


def resolve_brand_file(brand_id: str, file: str) -> Path:
    directory = brand_dir(brand_id)
    rel = Path(file or "")
    if not file or rel.is_absolute() or ".." in rel.parts:
        raise FileNotFoundError("Image not found.")
    target = (directory / rel).resolve()
    if not target.is_relative_to(directory) or not target.is_file():
        raise FileNotFoundError("Image not found.")
    if target.suffix.lower() not in IMAGE_EXTS:
        raise FileNotFoundError("Image not found.")
    return target


def list_brand_galleries() -> list[dict]:
    if not BRANDS_DIR.is_dir():
        return []
    brands = []
    for child in sorted(BRANDS_DIR.iterdir()):
        meta_file = child / "brand.json"
        if not child.is_dir() or not meta_file.is_file():
            continue
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        brand_id = meta.get("id") or child.name
        images = []
        logo_name = meta.get("logo") or "logo.png"
        logo = child / logo_name
        if logo.is_file():
            images.append(_brand_image(brand_id, logo_name, "Logo", "logo"))
        for folder_name in ("portfolio", "porfolio"):
            portfolio = child / folder_name
            if not portfolio.is_dir():
                continue
            for image in sorted(portfolio.iterdir(), key=lambda item: item.name.lower()):
                if image.suffix.lower() not in IMAGE_EXTS or not image.is_file():
                    continue
                rel = f"{folder_name}/{image.name}"
                images.append(_brand_image(brand_id, rel, image.stem, "portfolio"))
        brands.append({
            "id": brand_id,
            "name": meta.get("name") or brand_id,
            "images": images,
        })
    return brands


def _brand_image(brand_id: str, rel: str, label: str, kind: str) -> dict:
    return {
        "file": rel,
        "label": label,
        "kind": kind,
        "url": f"/api/brand-file?brand={quote(brand_id)}&file={quote(rel)}",
    }


def copy_brand_image(folder: str, brand_id: str, file: str) -> dict:
    source = resolve_brand_file(brand_id, file)
    directory = site_dir(folder)
    if not directory.exists():
        raise FileNotFoundError("Clone folder not found.")
    dest_dir = directory / "images" / "brand" / "manual"
    dest_dir.mkdir(parents=True, exist_ok=True)
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    filename = f"{int(time.time() * 1000)}_{suffix}{source.suffix.lower()}"
    shutil.copyfile(source, dest_dir / filename)
    rel = f"images/brand/manual/{filename}"
    safe_folder = sanitize_folder(folder)
    return {
        "path": rel,
        "url": f"/cloned/{safe_folder}/{rel}",
    }


def upload_image(folder: str, data_b64: str, ext: str = "png") -> dict:
    directory = site_dir(folder)
    if not directory.exists():
        raise FileNotFoundError("Clone folder not found.")
    ext = re.sub(r"[^a-z0-9]", "", (ext or "png").lower()) or "png"
    images_dir = directory / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    filename = f"upload_{int(time.time() * 1000)}_{suffix}.{ext}"
    (images_dir / filename).write_bytes(base64.b64decode(data_b64))
    return {
        "url": f"/cloned/{sanitize_folder(folder)}/images/{filename}",
        "filename": filename,
    }


# Downloaded project matches the americanauthors PHP stack.
# Static HTML mirrors stay on disk for the editor preview and are left out of the zip.
STACK_DIRS = {
    "views",
    "includes",
    "class",
    "css",
    "js",
    "images",
    "img",
    "fonts",
    "assets",
    "wp-content",
    "wp-includes",
    "external",
    "cdn-cgi",
    ".hkjgdshagkjhadskjhfkjdsafhakjdsfhakjdshgf",
}
STACK_ROOT_FILES = {
    "index.php",
    ".htaccess",
    "robots.txt",
    "start-server.sh",
    "favicon.png",
    "favicon.ico",
    "favicon.webp",
}
SKIP_ROOT_FILES = {"clone-meta.json", ".ds_store", "index.html"}


def include_in_php_zip(relative: Path) -> bool:
    parts = relative.parts
    if not parts:
        return False
    if parts[0] in STACK_DIRS:
        return True
    if len(parts) != 1:
        return False
    name = parts[0]
    if name.lower() in SKIP_ROOT_FILES or name.startswith("."):
        return name in STACK_ROOT_FILES
    if name.lower().endswith((".html", ".htm")):
        return False
    return True


PORTABLE_START_SERVER = """#!/bin/bash
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8888}"
if command -v php >/dev/null 2>&1; then
  exec php -S "localhost:${PORT}" -t "$PROJECT_DIR" "$PROJECT_DIR/index.php"
else
  echo "PHP not found. Install PHP 8.2+ or use Apache with .htaccess"
  exit 1
fi
"""


def ensure_portable_start_server(directory: Path) -> None:
    target = directory / "start-server.sh"
    current = target.read_text(encoding="utf-8") if target.is_file() else ""
    if "command -v php" in current and "Cellar" not in current:
        return
    target.write_text(PORTABLE_START_SERVER, encoding="utf-8")
    target.chmod(0o755)


def build_zip(folder: str) -> tuple[bytes, str]:
    directory = site_dir(folder)
    if not directory.exists():
        raise FileNotFoundError("Clone not found.")
    if not (directory / "index.php").is_file() or not (directory / "views").is_dir():
        raise FileNotFoundError("PHP project is not ready.")
    ensure_portable_start_server(directory)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in directory.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(directory)
            if include_in_php_zip(relative):
                zf.write(path, relative.as_posix())
    return buffer.getvalue(), f"{sanitize_folder(folder)}.zip"


def build_laravel_zip(folder: str) -> tuple[bytes, str]:
    directory = site_dir(folder) / "laravel"
    if not directory.is_dir() or not (directory / "artisan").is_file():
        raise FileNotFoundError("Laravel project is not ready.")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in directory.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(directory)
            zf.write(path, relative.as_posix())
    return buffer.getvalue(), f"{sanitize_folder(folder)}-laravel.zip"


def resolve_cloned_file(url_path: str) -> Path | None:
    """Resolve /cloned/folder/... to a real file path."""
    rel = url_path.lstrip("/")
    if not rel.startswith("cloned/"):
        return None
    full = (ROOT / rel).resolve()
    cloned_root = CLONED_DIR.resolve()
    if full != cloned_root and cloned_root not in full.parents:
        return None
    if full.is_file():
        return full
    # Some clones saved a file under its URL-encoded name ("HLO%20Banner.jpg"),
    # while the browser asks for the decoded one ("HLO Banner.jpg").
    encoded = (ROOT / quote(rel, safe="/!$&'()*+,;=:@~")).resolve()
    if encoded != full and cloned_root in encoded.parents and encoded.is_file():
        return encoded
    if full.is_dir() and (full / "index.html").is_file():
        return full / "index.html"
    if not full.suffix:
        html_file = full.with_suffix(".html")
        if html_file.is_file():
            return html_file
        if (full / "index.html").is_file():
            return full / "index.html"
    return None


def zip_directory(directory: Path, filename: str) -> tuple[bytes, str]:
    """Zip a finished export folder, dotfiles (.htaccess) included."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(directory.rglob("*")):
            if path.is_file() and path.name != ".DS_Store":
                zf.write(path, path.relative_to(directory).as_posix())
    return buffer.getvalue(), filename

