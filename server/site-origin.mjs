import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const META_FILE = 'clone-meta.json';

export function loadCloneMeta(siteDir) {
  const fp = path.join(siteDir, META_FILE);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

export function saveCloneMeta(siteDir, data) {
  const fp = path.join(siteDir, META_FILE);
  const existing = loadCloneMeta(siteDir) || {};
  fs.writeFileSync(fp, JSON.stringify({ ...existing, ...data, updatedAt: new Date().toISOString() }, null, 2));
}

export function detectSiteOrigin(siteDir) {
  const meta = loadCloneMeta(siteDir);
  if (meta?.sourceUrl) {
    try {
      return new URL(meta.sourceUrl).origin;
    } catch { /* fall through */ }
  }

  const indexPath = path.join(siteDir, 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  const html = fs.readFileSync(indexPath, 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false });
  for (const [sel, attr] of [
    ['base', 'href'],
    ['link[rel="canonical"]', 'href'],
    ['meta[property="og:url"]', 'content'],
  ]) {
    const val = $(sel).attr(attr);
    if (val?.startsWith('http')) {
      try { return new URL(val).origin; } catch { /* skip */ }
    }
  }
  const trust = html.match(/trustpilot\.com\/review\/([^/"'\s]+)/i);
  if (trust) {
    try { return `https://www.${trust[1].replace(/^www\./, '')}`.replace(/\/$/, ''); } catch { /* skip */ }
  }
  return null;
}

export function pageFileToOriginalUrl(pageFile, siteOrigin, sourceUrl = null) {
  const normalized = (pageFile || 'index.html').replace(/\\/g, '/');
  const base = sourceUrl || siteOrigin;
  if (!base) return null;

  try {
    const root = new URL(base.endsWith('/') ? base : `${base}/`);
    if (normalized === 'index.html') return root.href;
    const slug = normalized.replace(/\/index\.html$/i, '').replace(/^\/+/, '');
    return new URL(`${slug}/`, root).href;
  } catch {
    return null;
  }
}
