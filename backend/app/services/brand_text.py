"""
Exact text swap between two brand_data profiles, using brand_data/tools/rebrand.py.

When a clone was made from one of our own brand sites (its source URL is a brand_data domain),
both profiles are known, so every value can be swapped precisely: name, domain, emails, every
phone format and tel: link, address, tagline, about, copyright, SEO title/description, primary
colour and fonts. Logos are NOT touched here: apply-brand.mjs swaps them so each new logo keeps
the old logo's on-page size.
"""
from __future__ import annotations

import importlib.util
import json
import re
from functools import lru_cache
from pathlib import Path

from app.services import brand_registry
from app.services.site_service import site_dir

SKIP_DIRS = {"external", "node_modules", ".git", "vendor"}
ASSET_TOKEN = re.compile(r"""[^\s"'()<>,\\]+""")
ASSET_EXT = re.compile(r"\.(?:css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|woff2?|ttf|otf|eot|mp4|webm|ogv|ogg|mp3|wav|json|map|pdf|xml)$", re.I)


def protect_asset_refs(text: str):
    """Hide file references (external/<host>/... mirrors, URLs/paths of css, js, images, fonts)
    so swapping the old domain or name can't point them at files that don't exist."""
    kept: list[str] = []

    def mask(m: re.Match) -> str:
        token = m.group(0)
        bare = re.sub(r"(?:[?#]|&amp;).*$", "", token)
        if "external/" not in token.lower() and not (ASSET_EXT.search(bare) and re.search(r"[/.]", bare[:-4])):
            return token
        kept.append(token)
        return f"\x01{len(kept) - 1}\x01"

    masked = ASSET_TOKEN.sub(mask, text)
    return masked, lambda out: re.sub(r"\x01(\d+)\x01", lambda m: kept[int(m.group(1))], out)


@lru_cache(maxsize=1)
def _rebrand_module():
    script = brand_registry.BRAND_DATA_DIR / "tools" / "rebrand.py"
    spec = importlib.util.spec_from_file_location("brand_data_rebrand", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rebrand_profile_text(folder: str, source_url: str, target: dict) -> dict | None:
    """Swap the source brand's details for `target`'s. None when the clone isn't one of our brands."""
    if target.get("format") != "profile":
        return None
    source = brand_registry.brand_for_host(source_url)
    if not source or source["id"] == target["id"]:
        return None
    rb = _rebrand_module()
    src = json.loads((Path(source["dir"]) / "brand.json").read_text("utf-8"))
    dst = json.loads((Path(target["dir"]) / "brand.json").read_text("utf-8"))
    pairs = rb.build_pairs(src, dst) + rb.build_color_pairs(src, dst)
    root = site_dir(folder)
    counts: dict[str, int] = {}
    changed = 0
    for path in rb.iter_files(root):
        rel = path.relative_to(root).parts
        if any(part in SKIP_DIRS for part in rel) or rel[-1] == "clone-meta.json" or rel[:2] == ("images", "brand"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        masked, restore = protect_asset_refs(text)
        new = restore(rb.apply(masked, pairs, counts))
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
    return {"from": source["name"], "filesChanged": changed, "replacements": counts}
