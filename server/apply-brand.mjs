/**
 * Swap a cloned site's logo, portfolio images, and contact details
 * for one of the bundled brands.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCloneMeta, saveCloneMeta } from './site-origin.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRANDS_DIR = path.join(ROOT, 'brands');

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;
const PAGE_EXT = /\.(html?|php)$/i;
const PORTFOLIO_ATTR = /(?:class|id)\s*=\s*["'][^"']*(?:portfolio|portfo|book-shelf|bookshelf|book-card|our-work|gallery)[^"']*["']/i;
const PORTFOLIO_SRC = /(?:portfolio|bookshelf|book-shelf|bookcover|book-cover|lp-m\d)/i;
const SKIP_SRC = /pay-logo|payment|sprite|favicon|icon-|social|flag/i;
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'wbr']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function listBrands() {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs.readdirSync(BRANDS_DIR)
    .map((id) => {
      const dir = path.join(BRANDS_DIR, id);
      const metaFile = path.join(dir, 'brand.json');
      if (!fs.existsSync(metaFile)) return null;
      const meta = readJson(metaFile);
      const portfolioDir = ['portfolio', 'porfolio']
        .map((name) => path.join(dir, name))
        .find((candidate) => fs.existsSync(candidate));
      return {
        id: meta.id || id,
        name: meta.name || id,
        domain: meta.domain || '',
        email: meta.email || '',
        phone: meta.phone || '',
        address: meta.address || '',
        logo: Boolean(meta.logo && fs.existsSync(path.join(dir, meta.logo))),
        portfolioCount: portfolioDir
          ? fs.readdirSync(portfolioDir).filter((name) => IMAGE_EXT.test(name)).length
          : 0,
      };
    })
    .filter(Boolean);
}

function loadBrand(brandId) {
  const safeId = String(brandId || '').replace(/[^a-z0-9_-]/gi, '');
  const dir = path.join(BRANDS_DIR, safeId);
  const metaFile = path.join(dir, 'brand.json');
  if (!fs.existsSync(metaFile)) throw new Error('Choose Oxford Book Publishing or Penguin Global Publication.');
  const meta = readJson(metaFile);
  const logoFile = path.join(dir, meta.logo || 'logo.png');
  if (!fs.existsSync(logoFile)) throw new Error(`Logo missing for ${meta.name}.`);
  const portfolioDir = ['portfolio', 'porfolio']
    .map((name) => path.join(dir, name))
    .find((candidate) => fs.existsSync(candidate));
  return { ...meta, id: meta.id || safeId, dir, logoFile, portfolioDir: portfolioDir || '' };
}

function copyAssets(siteDir, brand) {
  const logoExt = path.extname(brand.logoFile) || '.png';
  const logoRel = `images/brand/logo${logoExt}`;
  fs.mkdirSync(path.join(siteDir, 'images', 'brand', 'portfolio'), { recursive: true });
  fs.copyFileSync(brand.logoFile, path.join(siteDir, logoRel));

  const portfolioRels = [];
  if (brand.portfolioDir) {
    const files = fs.readdirSync(brand.portfolioDir)
      .filter((name) => IMAGE_EXT.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    files.forEach((name, index) => {
      const ext = path.extname(name).toLowerCase();
      const rel = `images/brand/portfolio/${String(index + 1).padStart(2, '0')}${ext}`;
      fs.copyFileSync(path.join(brand.portfolioDir, name), path.join(siteDir, rel));
      portfolioRels.push(rel);
    });
  }
  return { logoRel, portfolioRels };
}

function walkPages(dir, rel = '', out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'external' || name === 'cdn-cgi' || name === 'images') continue;
    const full = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (fs.statSync(full).isDirectory()) walkPages(full, relPath, out);
    else if (PAGE_EXT.test(name)) out.push({ full, rel: relPath.replace(/\\/g, '/') });
  }
  return out;
}

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function setAttr(tag, name, value) {
  const safe = String(value).replace(/"/g, '&quot;');
  const re = new RegExp(`(\\b${name}\\s*=\\s*)(["'])[\\s\\S]*?\\2`, 'i');
  if (re.test(tag)) return tag.replace(re, `$1"${safe}"`);
  return tag.replace(/<img\b/i, `<img ${name}="${safe}"`);
}

function assetRef(fileRel, assetRel, originalSrc) {
  if (String(originalSrc).startsWith('/')) return `/${assetRel}`;
  const from = path.posix.dirname(fileRel);
  let rel = path.posix.relative(from, assetRel);
  if (!rel || rel.startsWith('/')) rel = assetRel;
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function isLogoTag(tag, before) {
  const src = getAttr(tag, 'src');
  if (!src || SKIP_SRC.test(src)) return false;
  const className = `${getAttr(tag, 'class')} ${getAttr(tag, 'alt')} ${getAttr(tag, 'title')}`;
  if (/\blogo\b/i.test(className) && !/pay-logo/i.test(src)) return true;
  if (/(?:^|\/)logo[^/]*\.(png|jpe?g|webp|gif|svg)/i.test(src)) return true;
  if (/class\s*=\s*["'][^"']*\blogo\b/i.test(before) && !/pay-logo/i.test(src)) return true;
  return false;
}

function isPortfolioTag(tag, inPortfolio) {
  const src = getAttr(tag, 'src');
  const alt = `${getAttr(tag, 'alt')} ${getAttr(tag, 'title')}`;
  if (!src || SKIP_SRC.test(src) || /^data:/i.test(src)) return false;
  if (inPortfolio && IMAGE_EXT.test(src.split('?')[0])) return true;
  if (PORTFOLIO_SRC.test(src) || /portfolio|book cover/i.test(alt)) return true;
  return false;
}

function rewriteImg(tag, inPortfolio, fileRel, state) {
  const src = getAttr(tag, 'src');
  const before = state.before || '';
  if (isLogoTag(tag, before)) {
    state.logos += 1;
    let next = setAttr(tag, 'src', assetRef(fileRel, state.logoRel, src));
    if (getAttr(next, 'title')) next = setAttr(next, 'title', state.brand.name);
    if (getAttr(next, 'titile')) next = setAttr(next, 'titile', state.brand.name);
    const alt = getAttr(next, 'alt');
    if (alt && !/^logo$/i.test(alt.trim())) next = setAttr(next, 'alt', state.brand.name);
    return next;
  }
  if (state.portfolioRels.length && isPortfolioTag(tag, inPortfolio)) {
    const key = src.split('?')[0];
    if (!state.srcMap.has(key)) {
      const assigned = state.portfolioRels[state.portfolioIndex % state.portfolioRels.length];
      state.portfolioIndex += 1;
      state.srcMap.set(key, assigned);
    }
    state.portfolios += 1;
    return setAttr(tag, 'src', assetRef(fileRel, state.srcMap.get(key), src));
  }
  return tag;
}

function transformMarkup(html, fileRel, state) {
  const tagRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)\b([^>]*?)\/?>/g;
  let out = '';
  let last = 0;
  const stack = [];
  let portfolioDepth = 0;
  let match;

  while ((match = tagRe.exec(html))) {
    out += html.slice(last, match.index);
    const full = match[0];
    if (full.startsWith('<!--')) {
      out += full;
      last = match.index + full.length;
      continue;
    }
    const tag = (match[1] || '').toLowerCase();
    const attrs = match[2] || '';
    const isClose = full.startsWith('</');
    const selfClose = /\/\s*>$/.test(full) || VOID_TAGS.has(tag);

    if (isClose) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const frame = stack.pop();
        if (frame.portfolio) portfolioDepth = Math.max(0, portfolioDepth - 1);
        if (frame.tag === tag) break;
      }
      out += full;
    } else if (tag === 'img') {
      state.before = html.slice(Math.max(0, match.index - 280), match.index);
      out += rewriteImg(full, portfolioDepth > 0, fileRel, state);
    } else {
      if (!selfClose) {
        const portfolio = PORTFOLIO_ATTR.test(attrs);
        stack.push({ tag, portfolio });
        if (portfolio) portfolioDepth += 1;
      }
      out += full;
    }
    last = match.index + full.length;
  }
  out += html.slice(last);
  return out;
}

function addName(raw, counts) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (name.length < 4 || name.length > 80) return;
  if (/^(logo|home|menu|image|photo|icon|contact|portfolio|gallery)$/i.test(name)) return;
  if (/@|https?:|^\d/.test(name)) return;
  counts.set(name, (counts.get(name) || 0) + 1);
}

function detectOriginalName(pages) {
  const counts = new Map();
  for (const page of pages) {
    const html = fs.readFileSync(page.full, 'utf8');
    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = match[0];
      const src = getAttr(tag, 'src');
      const before = html.slice(Math.max(0, match.index - 280), match.index);
      if (!isLogoTag(tag, before) && !/logo/i.test(src)) continue;
      addName(getAttr(tag, 'title'), counts);
      addName(getAttr(tag, 'titile'), counts);
      addName(getAttr(tag, 'alt'), counts);
    }
    const title = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (title) {
      for (const part of title[1].split(/[|\-–—:]/)) addName(part, counts);
    }
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && name.length > best.length)) {
      best = name;
      bestCount = count;
    }
  }
  return bestCount >= 1 ? best : '';
}

function escapeReg(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyText(html, brand, oldName, oldHost) {
  let next = html;
  if (oldName && oldName.toLowerCase() !== brand.name.toLowerCase()) {
    next = next.replace(new RegExp(escapeReg(oldName), 'g'), brand.name);
  }
  if (brand.address) {
    next = next.replace(/(Mailing Address:\s*)([^<]+)/gi, `$1${brand.address}`);
    next = next.replace(/(\bAddress:\s*)(\d[^<]{6,160})/gi, `$1${brand.address}`);
  }
  if (brand.phone) {
    const phone = brand.phone.trim();
    const tel = phone.replace(/[^\d+]/g, '');
    next = next.replace(/href=(["'])tel:[^"']*\1/gi, `href=$1tel:${tel}$1`);
    next = next.replace(/(?:\+\d{1,3}[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g, phone);
  }
  if (brand.email) {
    next = next.replace(/href=(["'])mailto:[^"']*\1/gi, `href=$1mailto:${brand.email}$1`);
    next = next.replace(/<span class="__cf_email__"[^>]*>[\s\S]*?<\/span>/gi, brand.email);
    next = next.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (value) => {
      if (/\.(png|jpe?g|webp|gif|svg|css|js)$/i.test(value)) return value;
      return brand.email;
    });
  }
  if (oldHost && brand.domain) {
    let newHost = '';
    try { newHost = new URL(brand.domain).host.replace(/^www\./, ''); } catch { /* ignore */ }
    if (newHost && oldHost !== newHost) {
      next = next.replace(new RegExp(escapeReg(oldHost), 'gi'), newHost);
    }
  }
  return next;
}

function srcBase(src) {
  const clean = String(src || '').split('#')[0].split('?')[0];
  const name = clean.split('/').pop() || '';
  try { return decodeURIComponent(name).toLowerCase(); } catch { return name.toLowerCase(); }
}

function replaceLogoImages(html, fileRel, logoRel, oldBase) {
  const tagRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)\b([^>]*?)\/?>/g;
  let logos = 0;
  let last = 0;
  let out = '';
  const stack = [];
  let match;
  while ((match = tagRe.exec(html))) {
    out += html.slice(last, match.index);
    const full = match[0];
    if (full.startsWith('<!--')) {
      out += full;
      last = match.index + full.length;
      continue;
    }
    const tag = (match[1] || '').toLowerCase();
    const attrs = match[2] || '';
    const isClose = full.startsWith('</');
    const selfClose = /\/\s*>$/.test(full) || VOID_TAGS.has(tag);
    if (isClose) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const frame = stack.pop();
        if (frame.tag === tag) break;
      }
      out += full;
    } else if (tag === 'img') {
      const src = getAttr(full, 'src');
      const identity = `${getAttr(full, 'class')} ${getAttr(full, 'id')} ${getAttr(full, 'alt')} ${src}`;
      const ownLogo = /\blogo\b/i.test(identity) && !SKIP_SRC.test(src || '');
      const ancestorLogo = stack.some((frame) => /\blogo\b/i.test(frame.attrs));
      const sameFile = Boolean(oldBase) && src && srcBase(src) === oldBase && !SKIP_SRC.test(src);
      if (src && !SKIP_SRC.test(src) && (ownLogo || ancestorLogo || sameFile)) {
        logos += 1;
        out += setAttr(full, 'src', assetRef(fileRel, logoRel, src));
      } else {
        out += full;
      }
    } else {
      if (!selfClose) stack.push({ tag, attrs });
      out += full;
    }
    last = match.index + full.length;
  }
  out += html.slice(last);
  return { html: out, logos };
}

export function replaceProjectLogos(siteDir, logoRel, oldSrc = '') {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');
  const safeLogo = String(logoRel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!safeLogo || safeLogo.split('/').includes('..') || !fs.existsSync(path.join(siteDir, safeLogo))) {
    throw new Error('Logo file is missing.');
  }
  const oldBase = srcBase(oldSrc);
  let logosReplaced = 0;
  let pagesUpdated = 0;
  for (const page of walkPages(siteDir)) {
    const original = fs.readFileSync(page.full, 'utf8');
    const result = replaceLogoImages(original, page.rel, safeLogo, oldBase);
    if (result.html !== original) {
      fs.writeFileSync(page.full, result.html);
      pagesUpdated += 1;
      logosReplaced += result.logos;
    }
  }
  return { success: true, logosReplaced, pagesUpdated };
}

export function applyBrand(siteDir, brandId) {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');
  const brand = loadBrand(brandId);
  const { logoRel, portfolioRels } = copyAssets(siteDir, brand);
  const pages = walkPages(siteDir);
  const oldName = detectOriginalName(pages);
  const meta = loadCloneMeta(siteDir);
  let oldHost = '';
  if (meta?.sourceUrl) {
    try { oldHost = new URL(meta.sourceUrl).host.replace(/^www\./, ''); } catch { /* ignore */ }
  }

  const state = {
    brand,
    logoRel,
    portfolioRels,
    srcMap: new Map(),
    portfolioIndex: 0,
    logos: 0,
    portfolios: 0,
    before: '',
  };
  let pagesUpdated = 0;

  for (const page of pages) {
    const original = fs.readFileSync(page.full, 'utf8');
    let next = transformMarkup(original, page.rel, state);
    next = applyText(next, brand, oldName, oldHost);
    if (next !== original) {
      fs.writeFileSync(page.full, next);
      pagesUpdated += 1;
    }
  }

  saveCloneMeta(siteDir, { brandId: brand.id, brandName: brand.name });

  return {
    success: true,
    brand: brand.name,
    brandId: brand.id,
    pagesUpdated,
    logosReplaced: state.logos,
    portfolioImages: state.portfolios,
    previousName: oldName || null,
  };
}
