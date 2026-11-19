#!/usr/bin/env python3
"""Download a site's homepage and every same-domain asset it references.

Saves into <Group>/<domain>/site-assets/, keeping the site's own path structure.
The homepage HTML is saved as site-assets/index.html.

Assets = images, icons, favicons, SVG, CSS, JS, fonts, video/audio referenced by
the homepage (src, href, srcset, data-src / data-srcset / data-bg / other lazy-load
attributes, inline style url(...), <style> blocks, meta og:image) plus anything
referenced inside downloaded CSS (url(...) and @import), recursively.
Only files on <domain> or www.<domain> are fetched; third-party hosts are skipped.

Usage (from anywhere):
  python3 tools/fetch_site_assets.py                 # all sites listed below
  python3 tools/fetch_site_assets.py Apex/bookwritingmaestros.co   # one or more sites
Python 3 standard library only.
"""
import concurrent.futures as cf
import gzip
import html.parser
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

SITES = [
    "Apex/bookwritingmaestros.co", "Apex/webdesignarchitects.co", "Apex/websitedesigntree.co",
    "Orion/ecompartnerz.co", "Orion/ny-publishers.com",
    "Ivertax Lab/northstarbookpublishers.co", "Ivertax Lab/expertbookpartners.co",
    "Ivertax Lab/onlineshopexpert.co",
    "Ink-Blaze/bluemountpublishers.co", "Ink-Blaze/americancreativesagency.com",
    "Ink-Blaze/bes-publisher.com",
    "Vanguard/pandabookpublishing.co", "Vanguard/bestselerllc.com", "Vanguard/writers-bloom.com",
    "Zenium/houseofbest-sellers.com", "Zenium/primebooksagency.co",
    "Zenium/expressbookpublishing.com",
]

ASSET_EXT = {
    "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "tif", "tiff",
    "css", "js", "mjs", "json", "webmanifest",
    "woff", "woff2", "ttf", "otf", "eot",
    "mp4", "webm", "ogg", "ogv", "mov", "m4v", "mp3", "wav", "m4a", "gif",
    "pdf", "xml",
}
CSS_URL_RE = re.compile(r"""url\(\s*(['"]?)(.*?)\1\s*\)""", re.I | re.S)
CSS_IMPORT_RE = re.compile(r"""@import\s+(?:url\(\s*)?['"]([^'"]+)['"]""", re.I)
# Tags whose src/href always point at an asset, regardless of extension.
ASSET_TAGS = {"img", "script", "source", "video", "audio", "track", "embed", "input", "image", "use"}
ASSET_LINK_RELS = {"stylesheet", "icon", "shortcut", "apple-touch-icon", "apple-touch-icon-precomposed",
                   "preload", "prefetch", "modulepreload", "manifest", "mask-icon", "image_src"}


def ext_of(url):
    path = urllib.parse.urlsplit(url).path
    base = path.rsplit("/", 1)[-1]
    return base.rsplit(".", 1)[-1].lower() if "." in base else ""


class Collector(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.urls = set()       # (url, forced) forced=True means take regardless of extension
        self.styles = []
        self.base = None
        self._in_style = False

    def add(self, v, forced=False):
        v = (v or "").strip()
        if v and not v.startswith(("data:", "javascript:", "mailto:", "tel:", "#", "blob:", "about:")):
            self.urls.add((v, forced))

    def add_srcset(self, v):
        for part in (v or "").split(","):
            part = part.strip()
            if part:
                self.add(part.split()[0], True)

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "base" and a.get("href"):
            self.base = a["href"]
        if tag == "style":
            self._in_style = True
        forced_tag = tag in ASSET_TAGS
        if tag == "link":
            rels = set(a.get("rel", "").lower().split())
            if rels & ASSET_LINK_RELS:
                self.add(a.get("href"), True)
            else:
                self.add(a.get("href"), False)
        for k, v in a.items():
            if not v:
                continue
            if k in ("srcset", "data-srcset", "imagesrcset", "data-lazy-srcset"):
                self.add_srcset(v)
            elif k in ("src", "poster", "data") or k.startswith("data-") or k in ("xlink:href",):
                if k.startswith("data-") and ("srcset" in k):
                    self.add_srcset(v)
                else:
                    self.add(v, forced_tag and k in ("src", "poster", "data-src", "xlink:href"))
            elif k == "href" and tag != "link":
                self.add(v, tag in ("use", "image"))
            elif k == "style":
                self.styles.append(v)
            elif k == "content" and tag == "meta":
                if re.match(r"^(https?:)?/", v) or ext_of(v) in ASSET_EXT:
                    self.add(v, False)

    def handle_endtag(self, tag):
        if tag == "style":
            self._in_style = False

    def handle_data(self, data):
        if self._in_style:
            self.styles.append(data)


def decode_body(raw, enc):
    enc = (enc or "").lower()
    if enc == "gzip":
        return gzip.decompress(raw)
    if enc == "deflate":
        try:
            return zlib.decompress(raw)
        except zlib.error:
            return zlib.decompress(raw, -zlib.MAX_WBITS)
    return raw


def fetch(url, tries=3, timeout=60):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept": "*/*", "Accept-Encoding": "gzip, deflate",
                "Accept-Language": "en-US,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = decode_body(r.read(), r.headers.get("Content-Encoding"))
                return r.status, r.geturl(), r.headers.get("Content-Type", ""), body
        except urllib.error.HTTPError as e:
            last = (e.code, url, "", None)
            if e.code in (403, 404, 410):
                break
        except Exception as e:  # timeout, DNS, TLS ...
            last = (f"ERR {type(e).__name__}: {e}"[:120], url, "", None)
        time.sleep(1.5 * (i + 1))
    return last


class Site:
    def __init__(self, rel):
        self.rel = rel
        self.domain = rel.split("/", 1)[1]
        self.hosts = {self.domain, "www." + self.domain}
        self.out = os.path.join(ROOT, rel, "site-assets")
        self.seen = set()
        self.failures = []
        self.saved = 0

    def on_site(self, url):
        return (urllib.parse.urlsplit(url).hostname or "").lower() in self.hosts

    def local_path(self, url):
        p = urllib.parse.unquote(urllib.parse.urlsplit(url).path)
        if not p or p.endswith("/"):
            p += "index.html"
        p = os.path.normpath("/" + p).lstrip("/")
        full = os.path.join(self.out, p)
        if not os.path.abspath(full).startswith(os.path.abspath(self.out) + os.sep):
            return None
        return full

    def save(self, path, body):
        if os.path.isdir(path):  # a directory already occupies this name
            path = os.path.join(path, "index.html")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(body)
        self.saved += 1

    def norm(self, ref, base):
        u = urllib.parse.urljoin(base, ref.strip())
        u = urllib.parse.urldefrag(u)[0]
        u = urllib.parse.quote(u, safe=":/?#[]@!$&'()*+,;=%~")  # e.g. spaces in file names
        return u if u.startswith(("http://", "https://")) else None

    def css_refs(self, text, base):
        refs = [m.group(2) for m in CSS_URL_RE.finditer(text)] + CSS_IMPORT_RE.findall(text)
        out = []
        for r in refs:
            r = r.strip()
            if r and not r.startswith(("data:", "#")):
                u = self.norm(r, base)
                if u:
                    out.append(u)
        return out

    def get_asset(self, url):
        res = fetch(url)
        status, final, ctype, body = res
        if body is None:
            self.failures.append((url, status))
            return []
        if not self.on_site(final):
            self.failures.append((url, f"redirected off-site to {final}"))
            return []
        if "text/html" in ctype.lower() and ext_of(url) not in ("html", "htm", ""):
            # server returned an HTML (error/soft-404) page instead of the asset
            self.failures.append((url, f"{status} but served HTML, not saved"))
            return []
        path = self.local_path(url)
        if not path:
            return []
        self.save(path, body)
        if ext_of(url) == "css" or "text/css" in ctype.lower():
            return self.css_refs(body.decode("utf-8", "replace"), final)
        return []

    def run(self):
        os.makedirs(self.out, exist_ok=True)
        home = None
        for start in (f"https://www.{self.domain}/", f"https://{self.domain}/"):
            res = fetch(start)
            if res[3] is not None:
                home = res
                break
        if home is None:
            self.failures.append((f"https://{self.domain}/", res[0]))
            return self
        status, final, ctype, body = home
        self.home_status = status
        self.save(os.path.join(self.out, "index.html"), body)
        text = body.decode("utf-8", "replace")
        c = Collector()
        try:
            c.feed(text)
        except Exception:
            pass
        base = urllib.parse.urljoin(final, c.base) if c.base else final
        queue = []
        for ref, forced in c.urls:
            u = self.norm(ref, base)
            if u and self.on_site(u) and (forced or ext_of(u) in ASSET_EXT):
                queue.append(u)
        for s in c.styles:
            queue += [u for u in self.css_refs(s, base) if self.on_site(u)]
        with cf.ThreadPoolExecutor(max_workers=8) as ex:
            while queue:
                batch = []
                for u in queue:
                    key = urllib.parse.urlsplit(u)._replace(netloc=self.domain).geturl()
                    if key not in self.seen and self.on_site(u):
                        self.seen.add(key)
                        batch.append(u)
                queue = []
                for refs in ex.map(self.get_asset, batch):
                    queue += refs
        return self


def main():
    sites = sys.argv[1:] or SITES
    for rel in sites:
        s = Site(rel).run()
        print(f"{rel}: homepage {getattr(s, 'home_status', 'FAILED')}, saved {s.saved} file(s), "
              f"{len(s.failures)} failure(s)", flush=True)
        for u, st in s.failures:
            print(f"   FAIL {st}  {u}", flush=True)


if __name__ == "__main__":
    main()
