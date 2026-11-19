"""
Find and fix broken images, videos and other assets in a cloned site.

For every asset a page (or stylesheet) points to:
  1. If the local file is there and valid, nothing to do.
  2. Otherwise download it again from the original site (urllib first, then curl with
     browser-like headers) and save it under the same name the code uses, so the link works.
  3. If it still can't be fetched, an image or video is swapped for a "missing" placeholder
     that the user must replace (with a brand asset or an upload) before the site can go to
     GitHub. Other files (scripts, fonts) are only reported.

Run it by hand:  python -m app.services.asset_repair <folder> [--check]
"""
from __future__ import annotations

import html as htmlmod
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

if __package__ in (None, ""):  # allow `python asset_repair.py` as well as `-m`
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services.site_service import site_dir  # noqa: E402

PLACEHOLDER_DIR = "assets/cloner"
PLACEHOLDER_IMAGE = f"{PLACEHOLDER_DIR}/missing-image.svg"
PLACEHOLDER_VIDEO = f"{PLACEHOLDER_DIR}/missing-video.svg"
PLACEHOLDER_MARK = "cloner/missing-"  # any reference containing this is an unfilled placeholder
MISSING_ATTR = "data-missing-asset"

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp", ".jfif", ".tif", ".tiff"}
VIDEO_EXT = {".mp4", ".webm", ".ogv", ".ogg", ".mov", ".m4v"}
OTHER_EXT = {".css", ".js", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".json", ".pdf", ".mp3", ".wav"}
SKIP_DIRS = {"node_modules", ".git", "laravel", "php", "vendor"}
MAX_BYTES = 50 * 1024 * 1024
TIMEOUT = 15
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
HASHED = re.compile(r"_[0-9a-f]{8}(?=\.[A-Za-z0-9]+$)")  # name_<md5 of query>.ext from the cloner

PLACEHOLDER_SVG = {
    PLACEHOLDER_IMAGE: ("Image missing", "Replace with a brand asset or upload", "M24 34h52v32H24z M30 58l12-14 9 10 7-7 12 11"),
    PLACEHOLDER_VIDEO: ("Video missing", "Replace with a brand asset or upload", "M24 34h52v32H24z M45 42v16l13-8z"),
}


def _placeholder_svg(title: str, note: str, icon: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" role="img" aria-label="{title}">
  <rect width="800" height="500" fill="#eef1f6"/>
  <rect x="8" y="8" width="784" height="484" fill="none" stroke="#e5484d" stroke-width="6" stroke-dasharray="22 14" rx="14"/>
  <g transform="translate(350 120)" fill="none" stroke="#e5484d" stroke-width="4" stroke-linejoin="round"><path d="{icon}"/></g>
  <text x="400" y="290" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#b4232a">{title}</text>
  <text x="400" y="340" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#4a5568">{note}</text>
</svg>
"""


# ---------------------------------------------------------------- file checks

def _kind(path: str) -> str:
    ext = os.path.splitext(urlsplit(path).path)[1].lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    return "other"


def _looks_like_html(head: bytes) -> bool:
    start = head.lstrip()[:200].lower()
    return start.startswith((b"<!doctype html", b"<html", b"<head", b"<body")) or b"<html" in start[:100]


def _valid_bytes(data: bytes, kind: str, content_type: str = "") -> bool:
    if not data:
        return False
    ct = (content_type or "").split(";")[0].strip().lower()
    head = data[:64]
    if kind == "image":
        if head.startswith((b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"BM", b"\x00\x00\x01\x00", b"II*\x00", b"MM\x00*")):
            return True
        if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
            return True
        if head[4:12] in (b"ftypavif", b"ftypavis", b"ftypheic", b"ftypmif1"):
            return True
        text = data[:2048].lstrip().lower()
        return b"<svg" in text and not _looks_like_html(data)
    if kind == "video":
        return (head[4:8] == b"ftyp" or head.startswith(b"\x1aE\xdf\xa3") or head.startswith(b"OggS")
                or ct.startswith("video/"))
    return not (_looks_like_html(data) and ct not in ("text/css", "application/javascript", "text/javascript"))


def _file_ok(file: Path, kind: str) -> bool:
    try:
        if not file.is_file() or file.stat().st_size == 0:
            return False
        with file.open("rb") as fh:
            return _valid_bytes(fh.read(4096), kind)
    except OSError:
        return False


# ---------------------------------------------------------------- downloading

def _fetch(url: str, referer: str, kind: str, probe: bool = False) -> bytes | None:
    """Download `url`; urllib first, curl second (some sites only answer a curl/browser handshake).
    With probe=True only the first 64 KB is requested: enough to tell whether the file is real."""
    accept = {"image": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
              "video": "video/*,*/*;q=0.8"}.get(kind, "*/*")
    headers = {"User-Agent": UA, "Accept": accept, "Accept-Language": "en-US,en;q=0.9"}
    if referer:
        headers["Referer"] = referer
    if probe:
        headers["Range"] = "bytes=0-65535"
    limit = 65536 if probe else MAX_BYTES + 1
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            data = res.read(limit)
            if (probe or len(data) <= MAX_BYTES) and _valid_bytes(data, kind, res.headers.get("Content-Type", "")):
                return data
    except (urllib.error.URLError, OSError, ValueError):
        pass
    curl = shutil.which("curl")
    if not curl:
        return None
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        out = tmp.name
    try:
        cmd = [curl, "-sSL", "--compressed", "--max-time", str(TIMEOUT + 10), "--max-filesize", str(MAX_BYTES),
               "-A", UA, "-H", f"Accept: {accept}", "-o", out, "-w", "%{http_code} %{content_type}"]
        if referer:
            cmd += ["-e", referer]
        if probe:
            cmd += ["-r", "0-65535"]
        done = subprocess.run(cmd + ["--", url], capture_output=True, text=True, timeout=TIMEOUT + 20)
        status, _, ctype = (done.stdout or "").partition(" ")
        if done.returncode in (0, 63) and status.startswith("2"):
            data = Path(out).read_bytes()
            if _valid_bytes(data, kind, ctype):
                return data
    except (subprocess.SubprocessError, OSError):
        pass
    finally:
        try:
            os.unlink(out)
        except OSError:
            pass
    return None


def _candidates(rel: str, origin: str, bases: list[str] | None = None) -> list[str]:
    """Original URLs a local asset path may have come from."""
    rels = [rel]
    if HASHED.search(rel):
        rels.append(HASHED.sub("", rel))  # the query-string variant: try the plain file too
    urls: list[str] = []
    for r in rels:
        if r.startswith("external/"):
            rest = r[len("external/"):]
            urls += [f"https://{rest}", f"http://{rest}"]
        elif origin:
            urls.append(urljoin(origin + "/", r))
            # The cloned page may have lived in a sub-folder (e.g. https://site.com/lp/).
            urls += [urljoin(b, r) for b in (bases or [])]
            parts = urlsplit(origin)
            if parts.hostname and not parts.hostname.startswith("www."):
                urls.append(urljoin(f"{parts.scheme}://www.{parts.netloc}/", r))
    seen, out = set(), []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _local_for_remote(url: str) -> str | None:
    parts = urlsplit(url)
    if not parts.hostname or not parts.path or parts.path.endswith("/"):
        return None
    path = unquote(parts.path).lstrip("/")
    if ".." in path.split("/"):
        return None
    return f"external/{parts.hostname}/{path}"


# ---------------------------------------------------------------- reference scanning

ATTR_SRC = ("src", "data-src", "data-lazy-src", "data-original", "data-lazy", "data-bg", "data-background",
            "poster", "data-poster")
SRCSET_ATTRS = ("srcset", "data-srcset")
ANY_TAG = re.compile(r"<([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*>")
ATTR = re.compile(r"""(\s)([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*)("([^"]*)"|'([^']*)')""")
CSS_URL = re.compile(r"""url\(\s*(['"]?)([^'")]+)\1\s*\)""", re.I)


def site_pages(root: Path) -> list[Path]:
    out = []
    for dirpath, dirnames, files in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")
                       and not (rel_dir == "." and d in ("assets", "external"))]
        out += [Path(dirpath) / f for f in files if f.endswith(".html")]
    return sorted(out)


def site_stylesheets(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.css")
                  if not any(part in SKIP_DIRS or part.startswith(".") for part in p.relative_to(root).parts))


MEDIA_TAGS = {"img", "video", "source", "image", "input"}


def _is_local(ref: str) -> bool:
    return bool(ref) and not re.match(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", ref, re.I)


class Repairer:
    def __init__(self, folder: str, source_url: str = "", fetch: bool = True, placeholders: bool = True):
        self.root = site_dir(folder)
        self.folder = folder
        meta = self._meta()
        source = source_url or meta.get("sourceUrl") or ""
        parts = urlsplit(source)
        self.origin = f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else ""
        self.bases: list[str] = []
        if self.origin and parts.path.strip("/"):
            self.bases = list(dict.fromkeys([source.split("?")[0].rstrip("/") + "/", urljoin(source, ".")]))
        self._by_name: dict[str, list[str]] | None = None
        self.fetch_enabled = fetch
        self.placeholders = placeholders
        self.recovered: dict[str, str] = {}   # site-relative path -> url it came from
        self.failed: dict[str, str] = {}      # site-relative path or remote url -> kind
        self.remote_saved: dict[str, str] = {}  # remote url -> site-relative path
        self.missing: list[dict] = []         # placeholders put in
        self._status: dict[str, bool] = {}

    # -- helpers
    def _meta(self) -> dict:
        try:
            return json.loads((self.root / "clone-meta.json").read_text("utf-8"))
        except (OSError, ValueError):
            return {}

    def _resolve(self, ref: str, base_dir: str) -> str | None:
        """Site-relative path of a local reference, or None when it leaves the site."""
        clean = htmlmod.unescape(ref).split("#")[0].split("?")[0].strip()
        if not clean:
            return None
        joined = os.path.normpath(clean.lstrip("/") if clean.startswith("/") else os.path.join(base_dir, clean))
        joined = joined.replace("\\", "/")
        if joined.startswith("..") or joined.startswith("/") or joined == ".":
            return None
        return joined

    def _exists(self, rel: str, kind: str) -> bool:
        for candidate in (rel, unquote(rel)):
            if _file_ok(self.root / candidate, kind):
                return True
        return False

    def _rel_from(self, base_dir: str, rel: str) -> str:
        return os.path.relpath(rel, base_dir or ".").replace("\\", "/")

    # -- phase 1: collect every reference, phase 2: fetch broken ones in parallel

    def _refs_in_tag(self, tag: str):
        """(attribute, value, is_srcset, is_style) for every asset reference in one tag."""
        name = tag[1:].split(None, 1)[0].split(">")[0].lower()
        for m in ATTR.finditer(tag):
            attr = m.group(2).lower()
            value = m.group(5) if m.group(5) is not None else m.group(6)
            if attr in SRCSET_ATTRS:
                yield attr, value, True, False
            elif attr == "style" and "url(" in value.lower():
                yield attr, value, False, True
            elif attr in ATTR_SRC or (attr == "href" and name == "link" and re.search(
                    r"rel\s*=\s*[\"'][^\"']*(icon|preload|stylesheet)", tag, re.I)):
                yield attr, value, False, False

    def _srcset_urls(self, value: str) -> list[str]:
        return [part.strip().split()[0] for part in value.split(",") if part.strip()]

    def _collect(self, pages: list[Path], sheets: list[Path]) -> tuple[dict, dict]:
        local: dict[str, str] = {}   # rel -> kind
        remote: dict[str, str] = {}  # url -> kind

        def note(ref: str, base_dir: str, kind_hint: str | None = None):
            ref = htmlmod.unescape(ref.strip())
            if not ref or ref.startswith("data:") or PLACEHOLDER_MARK in ref:
                return
            ext = os.path.splitext(urlsplit(ref).path)[1].lower()
            if ext in (".html", ".htm", ".php", ".asp", ".aspx"):
                return
            kind = kind_hint or _kind(ref)
            if _is_local(ref):
                rel = self._resolve(ref, base_dir)
                if rel and os.path.splitext(rel)[1]:
                    local.setdefault(rel, kind)
            elif re.match(r"^(https?:)?//", ref, re.I) and kind in ("image", "video"):
                remote.setdefault(ref if ref.lower().startswith("http") else "https:" + ref, kind)

        for page in pages:
            base = os.path.relpath(page.parent, self.root).replace("\\", "/")
            base = "" if base == "." else base
            text = page.read_text("utf-8", errors="replace")
            for tag in ANY_TAG.finditer(text):
                for attr, value, is_srcset, is_style in self._refs_in_tag(tag.group(0)):
                    if is_srcset:
                        for url in self._srcset_urls(value):
                            note(url, base)
                    elif is_style:
                        for m in CSS_URL.finditer(htmlmod.unescape(value)):
                            note(m.group(2), base, "image" if _kind(m.group(2)) == "other" else None)
                    else:
                        note(value, base)
            for block in re.findall(r"<style\b[^>]*>(.*?)</style>", text, re.I | re.S):
                for m in CSS_URL.finditer(block):
                    note(m.group(2), base)
        for sheet in sheets:
            base = os.path.relpath(sheet.parent, self.root).replace("\\", "/")
            base = "" if base == "." else base
            for m in CSS_URL.finditer(sheet.read_text("utf-8", errors="replace")):
                note(m.group(2), base)
        return local, remote

    def _index_files(self) -> None:
        self._by_name = {}
        for dirpath, dirnames, files in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
            for f in files:
                full = Path(dirpath) / f
                self._by_name.setdefault(f.lower(), []).append(full.relative_to(self.root).as_posix())

    def _local_copy(self, rel: str, kind: str) -> str | None:
        """The same file saved under another folder of this clone (e.g. lp/images/x.png for images/x.png)."""
        if self._by_name is None:
            self._index_files()
        name = unquote(rel).rsplit("/", 1)[-1].lower()
        want = unquote(rel).lower()
        tail = "/".join(want.split("/")[-2:])  # at least the parent folder must match
        matches = [c for c in self._by_name.get(name, [])
                   if c.lower() != want and (c.lower().endswith("/" + tail) or "/" not in want)
                   and _file_ok(self.root / c, kind)]
        if not matches:
            return None
        matches.sort(key=lambda c: (-len(os.path.commonprefix([c.lower()[::-1], want[::-1]])), len(c)))
        return matches[0]

    def _try_recover(self, rel: str, kind: str) -> bool:
        if self._exists(rel, kind):
            return True
        twin = self._local_copy(rel, kind)
        if twin:
            target = self.root / unquote(rel)
            if not target.is_dir():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(self.root / twin, target)
                self.recovered[rel] = f"copy of {twin}"
                return True
        if not self.fetch_enabled:
            return False
        referer = self.origin + "/" if self.origin else ""
        for url in _candidates(rel, self.origin, self.bases):
            data = _fetch(url, referer, kind)
            if data:
                target = self.root / unquote(rel)
                if target.is_dir():
                    return False
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                self.recovered[rel] = url
                return True
        return False

    def _try_remote(self, url: str, kind: str) -> bool:
        """A remote image/video: does it load? If not, can another address give it to us?"""
        if not self.fetch_enabled:
            return True  # without network access we can't tell; don't flag it
        referer = self.origin + "/" if self.origin else ""
        if _fetch(url, referer, kind, probe=True) or _fetch(url, "", kind, probe=True):
            return True  # it loads: leave the remote address alone
        data = _fetch("http://" + url[len("https://"):], referer, kind) if url.startswith("https://") else None
        if data is None:
            return False
        rel = _local_for_remote(url)
        if rel and not (self.root / rel).is_dir():
            target = self.root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            self.remote_saved[url] = rel  # served locally from now on
        return True

    # -- phase 3: rewrite the pages
    def _ensure_placeholders(self):
        for rel, (title, note, icon) in PLACEHOLDER_SVG.items():
            file = self.root / rel
            if not file.is_file():
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(_placeholder_svg(title, note, icon), "utf-8")

    def _status_of(self, ref: str, base_dir: str) -> tuple[str, str | None]:
        """('ok'|'broken'|'skip', replacement) for one reference in a page or stylesheet."""
        raw = htmlmod.unescape(ref.strip())
        if not raw or raw.startswith("data:") or PLACEHOLDER_MARK in raw:
            return "skip", None
        if _is_local(raw):
            rel = self._resolve(raw, base_dir)
            if not rel or not os.path.splitext(rel)[1]:
                return "skip", None
            return ("broken" if rel in self.failed else "ok"), None
        url = raw if raw.lower().startswith("http") else ("https:" + raw if raw.startswith("//") else raw)
        if url in self.remote_saved:
            return "ok", self._rel_from(base_dir, self.remote_saved[url])
        return ("broken" if url in self.failed else "ok"), None

    def _set_attr(self, tag: str, attr: str, value: str | None) -> str:
        pattern = re.compile(r"""\s%s\s*=\s*("[^"]*"|'[^']*')""" % re.escape(attr), re.I)
        if value is None:
            return pattern.sub("", tag, count=1)
        new = f' {attr}="{htmlmod.escape(value, quote=True)}"'
        if pattern.search(tag):
            return pattern.sub(lambda _m: new, tag, count=1)
        return re.sub(r"\s*(/?)>$", lambda m: f"{new}{' /' if m.group(1) else ''}>", tag, count=1)

    def _get_attr(self, tag: str, attr: str) -> str | None:
        m = re.search(r"""\s%s\s*=\s*("([^"]*)"|'([^']*)')""" % re.escape(attr), tag, re.I)
        if not m:
            return None
        return m.group(2) if m.group(2) is not None else m.group(3)

    def _fix_tag(self, tag: str, base_dir: str, page_rel: str) -> str:
        name = tag[1:].split(None, 1)[0].rstrip(">/").lower()
        placeholder_img = self._rel_from(base_dir, PLACEHOLDER_IMAGE)
        broken_main: list[str] = []
        changed = tag
        for attr, value, is_srcset, is_style in list(self._refs_in_tag(tag)):
            if is_srcset:
                keep = []
                for part in value.split(","):
                    bits = part.strip().split()
                    if not bits:
                        continue
                    state, repl = self._status_of(bits[0], base_dir)
                    if state == "broken":
                        continue
                    keep.append(" ".join([repl or bits[0]] + bits[1:]))
                if len(keep) != len([p for p in value.split(",") if p.strip()]):
                    changed = self._set_attr(changed, attr, ", ".join(keep) if keep else None)
                continue
            if is_style:
                broken_here = []

                def swap(m):
                    state, repl = self._status_of(m.group(2), base_dir)
                    if state == "broken":
                        broken_here.append(m.group(2))
                        return f"url({placeholder_img})"
                    return f"url({repl})" if repl else m.group(0)
                new_style = CSS_URL.sub(swap, htmlmod.unescape(value))
                if new_style != htmlmod.unescape(value):
                    changed = self._set_attr(changed, "style", new_style)
                    if broken_here:
                        changed = self._set_attr(changed, MISSING_ATTR, f"background:{broken_here[0]}"[:500])
                        self.missing.append({"page": page_rel, "kind": "background", "ref": broken_here[0]})
                continue
            state, repl = self._status_of(value, base_dir)
            if repl:
                changed = self._set_attr(changed, attr, repl)
            elif state == "broken" and (name in MEDIA_TAGS or _kind(value) in ("image", "video")):
                broken_main.append(attr)

        if not broken_main or not self.placeholders:
            return changed
        if name == "link":  # a broken icon/preload link: just drop it
            return "" if self._get_attr(changed, "rel") and re.search(r"icon|preload", self._get_attr(changed, "rel") or "", re.I) else changed
        if name == "source":  # the <video>/<picture> pass decides what to do with the parent
            return self._set_attr(changed, MISSING_ATTR, "source")
        if name == "video" and all(a in ("poster", "data-poster") for a in broken_main):
            for attr in broken_main:  # the video itself plays: it just shows its first frame
                changed = self._set_attr(changed, attr, None)
            return changed
        original = self._get_attr(changed, broken_main[0]) or ""
        kind = "video" if name == "video" or _kind(original) == "video" else "image"
        target = self._rel_from(base_dir, PLACEHOLDER_VIDEO if kind == "video" else PLACEHOLDER_IMAGE)
        for attr in broken_main:
            if attr in ("poster", "data-poster") or name != "video":
                changed = self._set_attr(changed, attr, target)
            else:
                changed = self._set_attr(changed, attr, None)
        if name == "img":
            changed = self._set_attr(changed, "src", target)
            changed = self._set_attr(changed, "srcset", None)
            if not (self._get_attr(changed, "alt") or "").strip():
                changed = self._set_attr(changed, "alt", "Missing image: please replace")
        changed = self._set_attr(changed, MISSING_ATTR, f"{kind}:{original}"[:500])
        if name != "video":  # a video is counted once, in the video pass
            self.missing.append({"page": page_rel, "kind": kind, "ref": original})
        return changed

    def _fix_videos(self, text: str, base_dir: str, page_rel: str) -> str:
        """A <video> whose sources are all gone becomes a placeholder image the user can replace."""
        def repl(m):
            block = m.group(0)
            open_tag = re.match(r"<video\b[^>]*>", block, re.I).group(0)
            sources = re.findall(r"<source\b[^>]*>", block, re.I)
            src = self._get_attr(open_tag, "src")
            good_sources = [s for s in sources if MISSING_ATTR not in s]
            has_src = bool(src) and PLACEHOLDER_MARK not in src
            if has_src or good_sources:
                return re.sub(r"<source\b[^>]*%s[^>]*>" % MISSING_ATTR, "", block, flags=re.I)
            if not sources and not src and MISSING_ATTR not in open_tag:
                return block  # a video filled in by script; leave it alone
            original = (self._get_attr(open_tag, MISSING_ATTR) or "").split(":", 1)[-1] or (
                self._get_attr(sources[0], "src") if sources else "") or ""
            keep = " ".join(f'{a}="{htmlmod.escape(self._get_attr(open_tag, a) or "", quote=True)}"'
                            for a in ("class", "id", "style", "width", "height") if self._get_attr(open_tag, a))
            self.missing.append({"page": page_rel, "kind": "video", "ref": original})
            return (f'<img src="{self._rel_from(base_dir, PLACEHOLDER_VIDEO)}" {keep} alt="Missing video: please replace" '
                    f'{MISSING_ATTR}="video:{htmlmod.escape(original, quote=True)[:480]}" />')
        return re.sub(r"<video\b[^>]*>.*?</video>", repl, text, flags=re.I | re.S)

    def _fix_css(self, text: str, base_dir: str, where: str) -> str:
        def swap(m):
            state, repl = self._status_of(m.group(2), base_dir)
            if state == "broken" and _kind(m.group(2)) == "image" and self.placeholders:
                self.missing.append({"page": where, "kind": "stylesheet", "ref": m.group(2)})
                return f"url('{self._rel_from(base_dir, PLACEHOLDER_IMAGE)}')"
            return f"url('{repl}')" if repl else m.group(0)
        return CSS_URL.sub(swap, text)

    # -- entry point
    def run(self) -> dict:
        if not self.root.is_dir():
            raise FileNotFoundError(f"Clone not found: {self.folder}")
        pages, sheets = site_pages(self.root), site_stylesheets(self.root)
        local, remote = self._collect(pages, sheets)

        self._index_files()  # before the threads start
        with ThreadPoolExecutor(max_workers=8) as pool:
            local_ok = dict(zip(local, pool.map(lambda kv: self._try_recover(*kv), local.items())))
            # A remote image/video only needs a check when it's not already saved locally.
            remote_ok = dict(zip(remote, pool.map(lambda kv: self._try_remote(*kv), remote.items())))
        self.failed.update({rel: local[rel] for rel, ok in local_ok.items() if not ok})
        self.failed.update({url: remote[url] for url, ok in remote_ok.items() if not ok})

        media_failed = any(kind in ("image", "video") for kind in self.failed.values())
        if media_failed and self.placeholders:
            self._ensure_placeholders()

        pages_changed = 0
        for page in pages:
            base = os.path.relpath(page.parent, self.root).replace("\\", "/")
            base = "" if base == "." else base
            page_rel = page.relative_to(self.root).as_posix()
            text = page.read_text("utf-8", errors="replace")
            new = ANY_TAG.sub(lambda m: self._fix_tag(m.group(0), base, page_rel), text)
            new = self._fix_videos(new, base, page_rel)
            new = re.sub(r"(<style\b[^>]*>)(.*?)(</style>)",
                         lambda m: m.group(1) + self._fix_css(m.group(2), base, page_rel) + m.group(3),
                         new, flags=re.I | re.S)
            if new != text:
                page.write_text(new, "utf-8")
                pages_changed += 1
        for sheet in sheets:
            base = os.path.relpath(sheet.parent, self.root).replace("\\", "/")
            base = "" if base == "." else base
            text = sheet.read_text("utf-8", errors="replace")
            new = self._fix_css(text, base, sheet.relative_to(self.root).as_posix())
            if new != text:
                sheet.write_text(new, "utf-8")

        self._write_meta()
        report = missing_report(self.folder)
        return {
            "folder": self.folder,
            "checked": len(local) + len(remote),
            "recovered": len(self.recovered),
            "recoveredFiles": sorted(self.recovered)[:200],
            "unrecoverable": sorted(f"{k} ({v})" for k, v in self.failed.items())[:200],
            "placeholdersAdded": len(self.missing),
            "pagesChanged": pages_changed,
            **report,
        }

    def _write_meta(self):
        meta = self._meta()
        meta["assetsCheckedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        try:
            (self.root / "clone-meta.json").write_text(json.dumps(meta, indent=2), "utf-8")
        except OSError:
            pass


def repair_site(folder: str, source_url: str = "", fetch: bool = True) -> dict:
    """Re-download what can be re-downloaded; put placeholders where it can't."""
    return Repairer(folder, source_url, fetch=fetch).run()


def missing_report(folder: str) -> dict:
    """Placeholders still waiting for the user's upload (these block the GitHub push)."""
    root = site_dir(folder)
    items: list[dict] = []
    css_items: list[dict] = []
    if not root.is_dir():
        return {"missing": 0, "items": [], "stylesheetMissing": 0, "checkedAt": None}
    for page in site_pages(root):
        page_rel = page.relative_to(root).as_posix()
        text = page.read_text("utf-8", errors="replace")
        for tag in ANY_TAG.finditer(text):
            t = tag.group(0)
            if PLACEHOLDER_MARK not in t:
                continue
            label = re.search(r"""%s\s*=\s*["']([^"']*)""" % MISSING_ATTR, t)
            kind, _, ref = (htmlmod.unescape(label.group(1)) if label else "image:").partition(":")
            items.append({"page": page_rel, "kind": kind or "image", "ref": ref})
        for block in re.findall(r"<style\b[^>]*>(.*?)</style>", text, re.I | re.S):
            css_items += [{"page": page_rel, "kind": "stylesheet", "ref": ""}] * block.count(PLACEHOLDER_MARK)
    for sheet in site_stylesheets(root):
        count = sheet.read_text("utf-8", errors="replace").count(PLACEHOLDER_MARK)
        css_items += [{"page": sheet.relative_to(root).as_posix(), "kind": "stylesheet", "ref": ""}] * count
    try:
        checked = json.loads((root / "clone-meta.json").read_text("utf-8")).get("assetsCheckedAt")
    except (OSError, ValueError):
        checked = None
    pages: dict[str, int] = {}
    for item in items:
        pages[item["page"]] = pages.get(item["page"], 0) + 1
    return {"missing": len(items), "items": items[:300], "pages": pages,
            "stylesheetMissing": len(css_items), "checkedAt": checked}


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("usage: python -m app.services.asset_repair <folder> [--check]")
        sys.exit(2)
    result = missing_report(args[0]) if "--check" in sys.argv else repair_site(args[0])
    print(json.dumps(result, indent=2))
