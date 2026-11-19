#!/usr/bin/env python3
"""
Rebrand a cloned website from one brand profile to another.

Usage (run from the brand_data folder):
  python3 tools/rebrand.py --site /path/to/cloned-site --to bes-publisher.com
  python3 tools/rebrand.py --site ./clone --from bookwritingmaestros.co --to "Ink-Blaze/bes-publisher.com"
  python3 tools/rebrand.py --site ./clone --to pandabookpublishing.co --dry-run

--from is optional: if left out, the script detects which brand the clone currently is.
--from / --to accept a domain, a "Group/domain" folder, or a path to any brand.json.

By default a rebranded COPY is written next to the site ("<site>-<new-domain>").
Use --in-place to change the site folder itself.

What gets swapped: company name / legal / short name, domain and URLs, emails, phone numbers
(every common format, plus tel: links), address, tagline, SEO title & description, about text,
copyright line, brand colours (hex and rgb()), font families (CSS + Google Fonts links),
and logo files (the clone's original logo files are overwritten with the new brand's original
logo files, so every <img> that pointed to them now shows the new logo).
Only values found on both live sites are swapped; anything null in a brand.json is left alone.
Run tools/fetch_original_logos.sh once first so the logo files exist.
Only Python 3 standard library is needed.
"""
import argparse, json, os, re, shutil, sys
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent.parent
TEXT_EXT = {".html", ".htm", ".php", ".css", ".scss", ".sass", ".less", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
            ".vue", ".svelte", ".json", ".txt", ".xml", ".svg", ".md", ".twig", ".blade", ".liquid", ".hbs", ".ejs",
            ".njk", ".yml", ".yaml", ".webmanifest", ".htaccess", ".env", ".ini", ".py", ".rb", ".csv"}
SKIP_DIRS = {".git", "node_modules", ".next", ".cache", "__pycache__", "vendor"}


# ---------- loading brands ----------
def all_brand_files():
    return sorted(ROOT.glob("*/*/brand.json"))

def load_brand(ref):
    p = Path(ref)
    if p.is_file():
        return json.load(open(p)), p.parent
    if (ROOT / ref / "brand.json").is_file():
        return json.load(open(ROOT / ref / "brand.json")), ROOT / ref
    ref_l = ref.lower().replace("https://", "").replace("http://", "").replace("www.", "").strip("/")
    for f in all_brand_files():
        if f.parent.name.lower() == ref_l:
            return json.load(open(f)), f.parent
    sys.exit(f"Brand '{ref}' not found. Use a domain like bes-publisher.com, a Group/domain folder, or a brand.json path.")


# ---------- helpers ----------
def phone_variants(e164):
    d = re.sub(r"\D", "", e164)
    if len(d) == 11 and d[0] == "1": d = d[1:]
    if len(d) != 10: return {"e164": e164}
    a, b, c = d[:3], d[3:6], d[6:]
    return {
        "p01": f"+1 ({a}) {b}-{c}", "p02": f"+1 ({a}) {b} {c}", "p03": f"+1 ({a}) {b}{c}", "p04": f"+1-{a}-{b}-{c}",
        "p05": f"+1 {a} {b} {c}", "p06": f"+1 {a}-{b}-{c}", "p07": f"+1.{a}.{b}.{c}", "p08": f"+1 {a}.{b}.{c}",
        "p09": f"1 ({a}) {b}-{c}", "p10": f"1-{a}-{b}-{c}", "p11": f"1 {a} {b} {c}", "p12": f"({a}) {b}-{c}",
        "p13": f"({a}) {b} {c}", "p14": f"{a}-{b}-{c}", "p15": f"{a}.{b}.{c}", "p16": f"{a} {b} {c}",
        "p17": f"+1{a}{b}{c}", "p18": f"1{a}{b}{c}", "p19": f"+1 ({a}){b}-{c}", "p20": f"+1 {a} {b}{c}",
    }

def rgb_forms(hexv):
    h = hexv.lstrip("#")
    if len(h) != 6: return []
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return [f"rgb({r}, {g}, {b})", f"rgb({r},{g},{b})", f"rgb({r} {g} {b})"]

def bare_domain(url_or_domain):
    s = url_or_domain.lower()
    if "//" in s: s = urlparse(s).netloc
    return s.replace("www.", "").strip("/")


def build_pairs(src, dst):
    """List of (old, new, case_insensitive, label). Only fields present in BOTH profiles are swapped."""
    pairs = []
    def add(old, new, label, ci=False):
        if old and new and old != new and len(str(old)) >= 3:
            pairs.append((str(old), str(new), ci, label))
    sc, dc = src["company"], dst["company"]
    add(src["seo"]["title"], dst["seo"]["title"], "seo title")
    add(src["seo"]["description"], dst["seo"]["description"], "seo description")
    add(sc.get("about"), dc.get("about"), "about")
    add(sc.get("tagline"), dc.get("tagline"), "tagline")
    add(sc.get("copyright"), dc.get("copyright"), "copyright")
    sa, da = src["contact"].get("address"), dst["contact"].get("address")
    if sa and da:
        add(sa["as_shown"], da["as_shown"], "address")
        add(f'{sa["street"]}, {sa["city"]}, {sa["state"]} {sa["zip"]}', f'{da["street"]}, {da["city"]}, {da["state"]} {da["zip"]}', "address")
        add(f'{sa["street"]} {sa["city"]}, {sa["state"]} {sa["zip"]}', f'{da["street"]} {da["city"]}, {da["state"]} {da["zip"]}', "address")
        add(f'{sa["city"]}, {sa["state"]} {sa["zip"]}', f'{da["city"]}, {da["state"]} {da["zip"]}', "address")
        add(sa["street"], da["street"], "address")
    s2, d2 = src["contact"].get("address_2"), dst["contact"].get("address_2")
    if s2 and d2: add(s2["as_shown"], d2["as_shown"], "address 2")
    for i, e in enumerate(src["contact"]["emails"]):
        de = dst["contact"]["emails"]
        if de: add(e, de[min(i, len(de) - 1)], "email", ci=True)
    dphones = dst["contact"]["phones"]
    for i, p in enumerate(src["contact"]["phones"]):
        if not dphones: break
        dp = dphones[min(i, len(dphones) - 1)]
        sv, dv = phone_variants(p["e164"]), phone_variants(dp["e164"])
        for k in sorted(sv, key=lambda k: -len(sv[k])):
            add(sv[k], dv.get(k, dp["display"]), "phone")
        add(p["display"], dp["display"], "phone")
    sd, dd = bare_domain(src["domain"]), bare_domain(dst["domain"])
    add("www." + sd, "www." + dd, "domain", ci=True)
    add(sd, dd, "domain", ci=True)
    if sc.get("name") and dc.get("name"):
        o, n = sc["name"], dc["name"]
        add(o.upper(), n.upper(), "name"); add(o, n, "name")
        if " " in o: add(o.replace(" ", ""), n.replace(" ", ""), "name")
    for role in ("heading", "body"):
        of, nf = src["fonts"].get(role), dst["fonts"].get(role)
        if of and nf and of != nf:
            add(of.replace(" ", "+"), nf.replace(" ", "+"), "font (google url)")
            add(of, nf, "font")
    return pairs


def build_color_pairs(src, dst):
    o, n = src["colors"].get("primary"), dst["colors"].get("primary")
    if not o or not n or o.upper() == n.upper(): return []
    out = [(o, n, True, "primary colour")]
    for a, b in zip(rgb_forms(o), rgb_forms(n)): out.append((a, b, False, "primary colour"))
    return out


# ---------- main replacement ----------
def iter_files(site):
    for dp, dn, fn in os.walk(site):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            p = Path(dp) / f
            if p.suffix.lower() in TEXT_EXT or f in (".htaccess",):
                yield p

def apply(text, pairs, counts):
    # Two-phase so A->B then B->C chains can't happen.
    tokens = []
    for i, (old, new, ci, label) in enumerate(pairs):
        tok = f"\x00{i}\x00"
        if ci:
            text, n = re.subn(re.escape(old), tok, text, flags=re.IGNORECASE)
        else:
            n = text.count(old); text = text.replace(old, tok) if n else text
        if n:
            counts[label] = counts.get(label, 0) + n
            tokens.append((tok, new))
    for tok, new in tokens:
        text = text.replace(tok, new)
    return text


def detect_source(site):
    blob = []
    for p in iter_files(site):
        try: blob.append(p.read_text(errors="ignore"))
        except Exception: pass
    blob = "\n".join(blob).lower()
    best = None
    for f in all_brand_files():
        b = json.load(open(f))
        score = blob.count(bare_domain(b["domain"])) * 3 + (blob.count(b["company"]["name"].lower()) * 2 if b["company"].get("name") else 0) \
            + sum(blob.count(re.sub(r"\D", "", p["e164"])[-10:]) for p in b["contact"]["phones"])
        if best is None or score > best[0]: best = (score, f)
    if not best or best[0] == 0:
        sys.exit("Could not detect which brand the site currently is. Pass --from.")
    print(f"Detected current brand: {best[1].parent.relative_to(ROOT)} (score {best[0]})")
    return str(best[1])


def swap_logos(site, src, dst, dst_dir, dry):
    """Overwrite the clone's original logo files with the new brand's original logo files (matched by role)."""
    replaced, missing = [], []
    dlogos = {r: dst_dir / v["file"] for r, v in dst["logos"].items() if (dst_dir / v["file"]).is_file()}
    if not dlogos:
        return replaced, ["the new brand has no downloaded logo files - run tools/fetch_original_logos.sh first"]
    def pick(role):
        if role in dlogos: return dlogos[role]
        if "white" in role or "footer" in role:
            for r in dlogos:
                if "white" in r or "footer" in r: return dlogos[r]
        if role == "favicon": return None
        return dlogos.get("logo") or next((p for r, p in dlogos.items() if r != "favicon"), None)
    by_name = {unquote(Path(urlparse(v["source_url"]).path).name).lower(): r for r, v in src["logos"].items()}
    for dp, dn, fn in os.walk(site):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            role = by_name.get(f.lower())
            if not role: continue
            new = pick(role)
            if not new: missing.append(f"{f} ({role}: new brand has none)"); continue
            replaced.append((str(Path(dp, f).relative_to(site)), str(new.relative_to(dst_dir))))
            if not dry: shutil.copy(new, Path(dp, f))
    return replaced, missing


def main():
    ap = argparse.ArgumentParser(description="Rebrand a cloned website using brand.json profiles.")
    ap.add_argument("--site", required=True, help="Folder of the cloned website")
    ap.add_argument("--to", required=True, help="Target brand (domain, Group/domain, or brand.json path)")
    ap.add_argument("--from", dest="src", help="Brand the clone currently is (auto-detected if omitted)")
    ap.add_argument("--out", help="Output folder (default: <site>-<new-domain>)")
    ap.add_argument("--in-place", action="store_true", help="Modify the site folder directly")
    ap.add_argument("--dry-run", action="store_true", help="Only report what would change")
    ap.add_argument("--no-colors", action="store_true", help="Do not swap colours")
    ap.add_argument("--no-logos", action="store_true", help="Do not swap logo files")
    a = ap.parse_args()

    site = Path(a.site).resolve()
    if not site.is_dir(): sys.exit(f"Site folder not found: {site}")
    src, _ = load_brand(a.src or detect_source(site))
    dst, dst_dir = load_brand(a.to)
    print(f"Rebranding: {src['company']['name']} ({src['domain']})  ->  {dst['company']['name']} ({dst['domain']})")

    work = site
    if not a.in_place and not a.dry_run:
        work = Path(a.out).resolve() if a.out else site.parent / f"{site.name}-{dst['domain']}"
        if work.exists(): sys.exit(f"Output folder already exists: {work}  (delete it or pass --out)")
        shutil.copytree(site, work, ignore=shutil.ignore_patterns(*SKIP_DIRS))
        print(f"Writing rebranded copy to: {work}")

    pairs = build_pairs(src, dst) + ([] if a.no_colors else build_color_pairs(src, dst))
    counts, changed = {}, 0
    for p in iter_files(work):
        try: t = p.read_text(encoding="utf-8")
        except Exception: continue
        n = apply(t, pairs, counts)
        if n != t:
            changed += 1
            if not a.dry_run: p.write_text(n, encoding="utf-8")

    logos, logo_missing = ([], []) if a.no_logos else swap_logos(work, src, dst, dst_dir, a.dry_run)

    print(f"\nFiles changed: {changed}")
    for k, v in sorted(counts.items(), key=lambda x: -x[1]): print(f"  {k:<22} {v} replacement(s)")
    if logos:
        print("Logo files overwritten:")
        for f, n in logos: print(f"  {f}  <- {n}")
    elif not a.no_logos:
        print("No logo files from the old brand were found by name in the site.")
    for m in logo_missing: print("  logo note:", m)

    # leftovers check
    left = {}
    probes = [bare_domain(src["domain"])] + ([src["company"]["name"].lower()] if src["company"].get("name") else [])
    if not a.dry_run:
        for p in iter_files(work):
            try: t = p.read_text(errors="ignore").lower()
            except Exception: continue
            for pr in probes[:2]:
                if pr in t: left.setdefault(pr, []).append(str(p.relative_to(work)))
    if left:
        print("\nStill mentions the old brand (check these by hand):")
        for k, v in left.items(): print(f"  '{k}': {', '.join(v[:10])}{' …' if len(v) > 10 else ''}")
    print("\nAlso check: text inside images, social links, and any field that is null in the new brand.json (the site didn't show it, so it was not swapped).")


if __name__ == "__main__":
    main()
