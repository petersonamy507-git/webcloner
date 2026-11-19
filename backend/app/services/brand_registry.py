"""
Brands an entity may rebrand its clones with.

Brand profiles live in brand_data/<Group>/<domain>/ (brand.json, logos/, site-assets/). The group
folder is the owning entity: "Apex" -> entity "apex", "Ivertax Lab" -> "ivertax-lab". An entity
only ever sees and uses its own brands. The two original kits in brands/ (oxford, penguin)
belong to the default workspace.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, urlsplit

from app.config import ROOT

BRAND_DATA_DIR = ROOT / "brand_data"
LEGACY_DIR = ROOT / "brands"
LEGACY_ENTITY = "default"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif", ".ico"}
MIN_PORTFOLIO_BYTES = 12 * 1024  # skip icons that merely live in a portfolio folder


def entity_slug(group: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (group or "").lower()).strip("-")


def bare_host(url_or_domain: str) -> str:
    text = (url_or_domain or "").strip().lower()
    host = urlsplit(text).netloc if "//" in text else text.split("/")[0]
    return host.removeprefix("www.")


def _portfolio_files(folder: Path) -> list[str]:
    """Portfolio images saved from the brand's own site (site-assets/**/portfolio*/...)."""
    assets = folder / "site-assets"
    if not assets.is_dir():
        return []
    found = []
    for file in assets.rglob("*"):
        rel = file.relative_to(folder)
        dirs = [p.lower() for p in rel.parts[1:-1]]
        if (file.is_file() and file.suffix.lower() in IMAGE_EXTS - {".ico", ".svg"}
                and any("portfolio" in d or "porfolio" in d for d in dirs)
                and file.stat().st_size >= MIN_PORTFOLIO_BYTES):
            found.append(rel.as_posix())
    return sorted(found, key=lambda p: [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p)])


def _profile(folder: Path) -> dict | None:
    try:
        meta = json.loads((folder / "brand.json").read_text("utf-8"))
    except (OSError, ValueError):
        return None
    company = meta.get("company") or {}
    contact = meta.get("contact") or {}
    logos = {role: (info or {}).get("file") for role, info in (meta.get("logos") or {}).items()}
    logos = {role: f for role, f in logos.items() if f and (folder / f).is_file()}
    main_logo = logos.get("logo") or next((f for r, f in logos.items() if r != "favicon"), None)
    domain = meta.get("domain") or folder.name
    usable = bool(company.get("name") and main_logo)
    return {
        "id": domain,
        "name": company.get("name") or domain,
        "domain": domain,
        "website": company.get("website") or f"https://{domain}",
        "group": meta.get("group") or folder.parent.name,
        "entity": entity_slug(meta.get("group") or folder.parent.name),
        "dir": str(folder),
        "format": "profile",
        "usable": usable,
        "note": "" if usable else "This brand's profile is empty (its website showed no details).",
        "phones": [ph.get("display") for ph in (contact.get("phones") or []) if ph and ph.get("display")],
        "emails": [e for e in (contact.get("emails") or []) if e],
        "tagline": company.get("tagline") or "",
        "email": (contact.get("emails") or [""])[0],
        "phone": ((contact.get("phones") or [{}])[0] or {}).get("display") or "",
        "address": re.sub(r"^(?:mailing |postal |office |our )?address\s*:\s*", "", ((contact.get("address") or {}) or {}).get("as_shown") or "", flags=re.I),
        "primaryColor": (meta.get("colors") or {}).get("primary"),
        "logos": logos,
        "logo": main_logo,
        "portfolio": _portfolio_files(folder),
    }


def _legacy(folder: Path) -> dict | None:
    try:
        meta = json.loads((folder / "brand.json").read_text("utf-8"))
    except (OSError, ValueError):
        return None
    logo = meta.get("logo") or "logo.png"
    portfolio_dir = next((folder / n for n in ("portfolio", "porfolio") if (folder / n).is_dir()), None)
    portfolio = sorted(p.relative_to(folder).as_posix() for p in portfolio_dir.iterdir()
                       if p.suffix.lower() in IMAGE_EXTS) if portfolio_dir else []
    return {
        "id": meta.get("id") or folder.name,
        "name": meta.get("name") or folder.name,
        "domain": bare_host(meta.get("domain") or ""),
        "website": meta.get("domain") or "",
        "group": "Default",
        "entity": LEGACY_ENTITY,
        "dir": str(folder),
        "format": "legacy",
        "usable": (folder / logo).is_file(),
        "note": "",
        "phones": [meta["phone"]] if meta.get("phone") else [],
        "emails": [meta["email"]] if meta.get("email") else [],
        "tagline": meta.get("tagline") or "",
        "email": meta.get("email") or "",
        "phone": meta.get("phone") or "",
        "address": meta.get("address") or "",
        "primaryColor": None,
        "logos": {"logo": logo} if (folder / logo).is_file() else {},
        "logo": logo if (folder / logo).is_file() else None,
        "portfolio": portfolio,
    }


def _stamp() -> tuple:
    """Changes whenever a brand.json is added, removed or edited, so the cache refreshes."""
    files = list(BRAND_DATA_DIR.glob("*/*/brand.json")) + list(LEGACY_DIR.glob("*/brand.json"))
    return tuple(sorted((str(f), f.stat().st_mtime_ns) for f in files))


@lru_cache(maxsize=4)
def _load(stamp: tuple) -> tuple[dict, ...]:
    brands = []
    for brand_json in sorted(BRAND_DATA_DIR.glob("*/*/brand.json")):
        if brand_json.parent.parent.name in ("tools",):
            continue
        profile = _profile(brand_json.parent)
        if profile:
            brands.append(profile)
    for brand_json in sorted(LEGACY_DIR.glob("*/brand.json")):
        legacy = _legacy(brand_json.parent)
        if legacy:
            brands.append(legacy)
    return tuple(brands)


def all_brands() -> list[dict]:
    return list(_load(_stamp()))


def brands_for(entity: str) -> list[dict]:
    return [b for b in all_brands() if b["entity"] == entity]


def find_brand(brand_id: str) -> dict | None:
    key = (brand_id or "").strip().lower()
    return next((b for b in all_brands() if b["id"].lower() == key), None)


def brand_for_host(url: str) -> dict | None:
    """The brand_data profile a site belongs to, when a clone was made from one of our own brands."""
    host = bare_host(url)
    return next((b for b in all_brands() if b["format"] == "profile" and host and bare_host(b["domain"]) == host), None)


def public(brand: dict) -> dict:
    """What the browser gets: no server paths."""
    return {k: brand[k] for k in ("id", "name", "domain", "website", "group", "usable", "note", "email", "phone",
                                   "address", "primaryColor", "phones", "emails", "tagline")} | {
        "logoUrl": file_url(brand, brand["logo"]) if brand["logo"] else "",
        "portfolioCount": len(brand["portfolio"]),
    }


def file_url(brand: dict, rel: str) -> str:
    return f"/api/brand-file?brand={quote(brand['id'])}&file={quote(rel)}"


def gallery(brand: dict) -> dict:
    images = []
    for role, rel in brand["logos"].items():
        if Path(rel).suffix.lower() in IMAGE_EXTS - {".ico"}:
            label = "Logo" if role == "logo" else role.replace("_", " ").capitalize()
            images.append({"file": rel, "label": label, "kind": "logo", "url": file_url(brand, rel)})
    for rel in brand["portfolio"]:
        images.append({"file": rel, "label": Path(rel).stem, "kind": "portfolio", "url": file_url(brand, rel)})
    return {"id": brand["id"], "name": brand["name"], "images": images}


def resolve_file(brand: dict, file: str) -> Path:
    root = Path(brand["dir"]).resolve()
    rel = Path(file or "")
    if not file or rel.is_absolute() or ".." in rel.parts:
        raise FileNotFoundError("Image not found.")
    target = (root / rel).resolve()
    if not target.is_relative_to(root) or not target.is_file() or target.suffix.lower() not in IMAGE_EXTS:
        raise FileNotFoundError("Image not found.")
    return target
