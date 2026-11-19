/**
 * Swap a cloned site's logo, portfolio images, and contact details
 * for one of the bundled brands.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCloneMeta, saveCloneMeta } from './site-origin.mjs';
import { dropStalePictureSources, fittedImage, imageSize, localImageFile, originalBox, STALE_IMAGE_ATTRS } from './image-fit.mjs';

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

const PORTFOLIO_MIN_BYTES = 12 * 1024;

/** Portfolio images saved from a brand's own site: any "portfolio" folder under site-assets. */
function profilePortfolio(dir) {
  const root = path.join(dir, 'site-assets');
  const out = [];
  const walk = (folder, inPortfolio) => {
    if (!fs.existsSync(folder)) return;
    for (const name of fs.readdirSync(folder)) {
      const full = path.join(folder, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full, inPortfolio || /portfolio|porfolio/i.test(name));
      else if (inPortfolio && /\.(png|jpe?g|webp|gif)$/i.test(name) && stat.size >= PORTFOLIO_MIN_BYTES) out.push(full);
    }
  };
  walk(root, false);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** A brand_data profile (brand.json schema 2) in the shape the rest of this file uses. */
function fromProfile(meta, dir) {
  const company = meta.company || {};
  const contact = meta.contact || {};
  const logos = Object.fromEntries(Object.entries(meta.logos || {})
    .map(([role, info]) => [role, info?.file && path.join(dir, info.file)])
    .filter(([, file]) => file && fs.existsSync(file)));
  const logoFile = logos.logo || Object.entries(logos).find(([role]) => role !== 'favicon')?.[1];
  if (!company.name || !logoFile) throw new Error(`${meta.domain || 'This brand'} has no name or logo in its profile yet.`);
  const light = Object.entries(logos).find(([role]) => /white|footer|light/i.test(role))?.[1] || '';
  return {
    id: meta.domain,
    name: company.name,
    domain: company.website || `https://${meta.domain}`,
    email: (contact.emails || [])[0] || '',
    phone: (contact.phones || [])[0]?.display || '',
    address: (contact.address?.as_shown || '').replace(/^(?:mailing |postal |office |our )?address\s*:\s*/i, ''),
    addressParts: contact.address || null,
    dir,
    logoFile,
    lightLogoFile: light && light !== logoFile ? light : '',
    faviconFile: logos.favicon || '',
    portfolioFiles: profilePortfolio(dir),
  };
}

function loadBrand(brandId, brandDir = '') {
  let dir = brandDir;
  if (!dir) {
    const safeId = String(brandId || '').replace(/[^a-z0-9_-]/gi, '');
    dir = path.join(BRANDS_DIR, safeId);
  }
  const metaFile = path.join(dir, 'brand.json');
  if (!fs.existsSync(metaFile)) throw new Error('Brand not found.');
  const meta = readJson(metaFile);
  if (meta.schema_version || meta.company) return fromProfile(meta, dir);
  const logoFile = path.join(dir, meta.logo || 'logo.png');
  if (!fs.existsSync(logoFile)) throw new Error(`Logo missing for ${meta.name}.`);
  const portfolioDir = ['portfolio', 'porfolio']
    .map((name) => path.join(dir, name))
    .find((candidate) => fs.existsSync(candidate));
  const portfolioFiles = portfolioDir
    ? fs.readdirSync(portfolioDir).filter((name) => IMAGE_EXT.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((name) => path.join(portfolioDir, name))
    : [];
  return { ...meta, id: meta.id || path.basename(dir), dir, logoFile, lightLogoFile: '', faviconFile: '', portfolioFiles };
}

function copyAssets(siteDir, brand) {
  const brandRoot = path.join(siteDir, 'images', 'brand');
  // A previous brand's files must not linger (or be picked up as this brand's portfolio).
  fs.rmSync(path.join(brandRoot, 'portfolio'), { recursive: true, force: true });
  fs.mkdirSync(path.join(brandRoot, 'portfolio'), { recursive: true });
  const copy = (file, name) => {
    if (!file) return '';
    const rel = `images/brand/${name}${path.extname(file).toLowerCase() || '.png'}`;
    fs.copyFileSync(file, path.join(siteDir, rel));
    return rel;
  };
  const logoRel = copy(brand.logoFile, 'logo');
  const lightLogoRel = copy(brand.lightLogoFile, 'logo-light');
  const faviconRel = copy(brand.faviconFile, 'favicon');
  const portfolioRels = (brand.portfolioFiles || []).map((file, index) => {
    const rel = `images/brand/portfolio/${String(index + 1).padStart(2, '0')}${path.extname(file).toLowerCase()}`;
    fs.copyFileSync(file, path.join(siteDir, rel));
    return rel;
  });
  return { logoRel, lightLogoRel, faviconRel, portfolioRels };
}

/** Point every favicon link at the brand's favicon. */
function swapFavicon(html, fileRel, faviconRel) {
  if (!faviconRel) return html;
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["'][^"']*icon[^"']*["']/i.test(tag) || /mask-icon/i.test(tag)) return tag;
    const href = getAttr(tag, 'href');
    if (!href) return tag;
    return tag.replace(/(\bhref\s*=\s*)(["'])[\s\S]*?\2/i, `$1"${assetRef(fileRel, faviconRel, href)}"`)
      .replace(/\stype\s*=\s*(["'])[^"']*\1/i, '');
  });
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

function removeAttr(tag, name) {
  return tag.replace(new RegExp(`\\s${name}\\s*=\\s*(["'])[\\s\\S]*?\\1`, 'i'), '');
}

/**
 * Point an <img> at a brand image while keeping the exact box the old image had:
 * the new file is fitted into the old image's size (see image-fit.mjs).
 */
function swapImage(tag, fileRel, assetRel, state, mode) {
  const src = getAttr(tag, 'src');
  const shown = realSrc(tag);
  const box = originalBox(state.siteDir, fileRel, shown && shown !== src ? setAttr(tag, 'src', shown) : tag, getAttr);
  let target = assetRel;
  if (box) {
    try { target = fittedImage(state.siteDir, assetRel, box, mode); } catch { /* fall back to the plain file */ }
  }
  let next = setAttr(tag, 'src', assetRef(fileRel, target, src));
  for (const attr of STALE_IMAGE_ATTRS) next = removeAttr(next, attr);
  return next;
}

function assetRef(fileRel, assetRel, originalSrc) {
  if (String(originalSrc).startsWith('/')) return `/${assetRel}`;
  const from = path.posix.dirname(fileRel);
  let rel = path.posix.relative(from, assetRel);
  if (!rel || rel.startsWith('/')) rel = assetRel;
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

// "Brands Logo", "Client logos", "As seen on", "Payment cards": other companies' logos, not ours.
const NOT_OUR_LOGO = /\b(?:brands?|partners?|clients?|sponsors?|press|media)[\s_-]*logos?\b|\blogos\b|\bas[- ]seen\b|\bfeatured (?:in|on)\b|\bpayments?\b|\bcards?\b|\bawards?\b|\btrustpilot\b/i;
const NOT_OUR_LOGO_SRC = /(?:^|[/_-])(?:brands?|partners?|clients?|sponsors?|payments?|awards?|logos)(?:[/_.-]|$)/i;

/** The image actually shown: lazy-loaders keep it in data-src while src holds a placeholder. */
function realSrc(tag) {
  const lazy = getAttr(tag, 'data-src') || getAttr(tag, 'data-lazy-src') || getAttr(tag, 'data-original');
  const src = getAttr(tag, 'src');
  return lazy && (!src || /^data:|placeholder|blank|lazy|loading|spacer/i.test(src)) ? lazy : (src || lazy);
}

function fileOf(src) {
  const clean = String(src || '').split(/[?#]/)[0];
  try { return decodeURIComponent(clean.split('/').pop() || '').toLowerCase(); } catch { return (clean.split('/').pop() || '').toLowerCase(); }
}

/** book-publisher-ae.webp, grandpublishers-logo.png: a file named after the old domain. */
function namedAfterSite(file, label, tld) {
  if (!label || label.length < 4) return false;
  const compact = file.replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]/g, '');
  if (!compact.startsWith(label)) return false;
  const rest = compact.slice(label.length);
  return new RegExp(`^(?:${tld || 'x'}|ae|uk|us|usa|co|com|pk|ca|au|in|llc|inc)?(?:logo|white|dark|light|black|footer|header|main|new|\\d)*$`).test(rest);
}

// logo.png, white-logo.png, footer-logo.webp, Logo-04.png, logo1.png — not banner-logo1.png or logo-design.jpg.
const LOGO_FILE = /^(?:(?:site|main|header|footer|nav|new|white|black|dark|light|mobile|sticky|inner[-_]?(?:pg|page))[-_ ]?)*logo(?:[-_ ]?(?:white|black|dark|light|footer|header|main|new|colou?r|mobile|sticky|small|large|big|\d+|v\d+))*(?:@[23]x)?\.(?:png|jpe?g|webp|svg|gif|avif)$/i;
const BAD_LOGO_TOKEN = /design|portfolio|slider|carousel|client|partner|logos|sponsor|award|badge|marquee|swiper|slick|gallery/i;

/** class/id tokens of a logo box: logo, footerlogo, header-main__logo, navbar-brand — not logo-design. */
function hasLogoClass(attrs) {
  const tokens = `${getAttr(attrs, 'class')} ${getAttr(attrs, 'id')}`.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.some((t) => !BAD_LOGO_TOKEN.test(t)
    && /(?:^|[-_])(?:logo|navbar-brand|site-brand|brand-logo|custom-logo-link|site-branding|site-title)(?:[-_]+(?:wrap|wrapper|box|img|image|link|area|container|holder|main|white|dark|light|header|footer|mobile|sticky))*$|logo$/.test(t));
}

function isHomeHref(href, host) {
  const h = String(href || '').trim();
  if (!h || h.startsWith('#') || /^javascript:/i.test(h)) return false; // "#" links hold icons, not the logo
  if (/^(?:\/|\.\/?|\.\.\/|index\.(?:html?|php)|\.\.\/index\.(?:html?|php)|\.\/index\.(?:html?|php))$/i.test(h.replace(/#.*$/, ''))) return true;
  return Boolean(host) && new RegExp(`^https?://(?:www\\.)?${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?(?:index\\.(?:html?|php))?$`, 'i').test(h);
}

function isLogoTag(tag, ctx) {
  const src = realSrc(tag);
  if (!src || SKIP_SRC.test(src)) return false;
  const file = fileOf(src);
  const alt = getAttr(tag, 'alt').trim();
  const title = getAttr(tag, 'title').trim();
  const labels = `${getAttr(tag, 'class')} ${alt} ${title}`;
  if (NOT_OUR_LOGO.test(labels) || NOT_OUR_LOGO_SRC.test(src.split('?')[0])) return false;
  // A file the site already uses as its logo elsewhere.
  if (ctx.knownLogoFiles?.has(file)) return true;
  // Strong signals on the image itself.
  if (LOGO_FILE.test(file) || hasLogoClass(tag) || /\blogo\b/i.test(alt)) return true;
  const frames = ctx.frames || [];
  // Inside a logo box (the nearest two parents), but not inside a portfolio of logo designs.
  if (!ctx.inPortfolio && frames.slice(-2).some((f) => hasLogoClass(f.attrs))) return true;
  // The image in the header's or footer's link back to the home page.
  const link = [...frames].reverse().find((f) => f.tag === 'a');
  const home = link && isHomeHref(getAttr(link.attrs, 'href'), ctx.host);
  const edge = ctx.inHeader || ctx.inFooter;
  const iconish = /icon|arrow|badge|dmca|pay|phone|envelop|mail|location|map|social|whatsapp|chat|star|rating|flag|cart|search|menu|close|top/i.test(file);
  if (home && edge && !iconish) return true;
  // Named after the company (file or alt text): only where a logo lives.
  const same = (v) => v && (ctx.oldNames || []).some((n) => v.toLowerCase() === n.toLowerCase());
  return (namedAfterSite(file, ctx.label, ctx.tld) || same(alt) || same(title)) && (home || ctx.inHeader) && !iconish;
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
  if (isLogoTag(tag, state)) {
    if (state.collectOnly) {
      state.knownLogoFiles.add(fileOf(realSrc(tag)));
      return tag;
    }
    state.logos += 1;
    const logo = state.inFooter && state.lightLogoRel ? state.lightLogoRel : state.logoRel;
    let next = swapImage(tag, fileRel, logo, state, 'contain');
    if (getAttr(next, 'title')) next = setAttr(next, 'title', state.brand.name);
    if (getAttr(next, 'titile')) next = setAttr(next, 'titile', state.brand.name);
    const alt = getAttr(next, 'alt');
    if (alt && !/^logo$/i.test(alt.trim())) next = setAttr(next, 'alt', state.brand.name);
    return next;
  }
  if (state.collectOnly) return tag;
  if (state.portfolioRels.length && isPortfolioTag(tag, inPortfolio)) {
    const key = src.split('?')[0];
    if (!state.srcMap.has(key)) {
      const assigned = state.portfolioRels[state.portfolioIndex % state.portfolioRels.length];
      state.portfolioIndex += 1;
      state.srcMap.set(key, assigned);
    }
    state.portfolios += 1;
    return swapImage(tag, fileRel, state.srcMap.get(key), state, 'cover');
  }
  return tag;
}

function isLogoSvg(open, stack, state) {
  const words = `${getAttr(open, 'class')} ${getAttr(open, 'id')} ${getAttr(open, 'aria-label')}`;
  if (NOT_OUR_LOGO.test(words)) return false;
  if (hasLogoClass(open) || /\blogo\b/i.test(getAttr(open, 'aria-label'))) return true;
  if (stack.slice(-2).some((f) => hasLogoClass(f.attrs))) return true;
  const link = [...stack].reverse().find((f) => f.tag === 'a');
  return Boolean(link && isHomeHref(getAttr(link.attrs, 'href'), state.host) && stack.some((f) => f.header || f.footer));
}

function svgLogoImage(open, fileRel, state) {
  const num = (v) => parseFloat(String(v || '').replace(/px$/, '')) || 0;
  let width = num(getAttr(open, 'width'));
  let height = num(getAttr(open, 'height'));
  const box = getAttr(open, 'viewBox').split(/[\s,]+/).map(Number);
  if ((!width || !height) && box.length === 4 && box[2] > 0 && box[3] > 0) {
    if (width) height = (width * box[3]) / box[2];
    else if (height) width = (height * box[2]) / box[3];
    else [width, height] = [box[2], box[3]];
  }
  const logo = state.inFooter && state.lightLogoRel ? state.lightLogoRel : state.logoRel;
  let target = logo;
  if (width > 0 && height > 0) {
    try { target = fittedImage(state.siteDir, logo, { width, height }, 'contain'); } catch { /* plain file */ }
  }
  state.logos += 1;
  const keep = ['class', 'id', 'style'].map((a) => (getAttr(open, a) ? ` ${a}="${getAttr(open, a)}"` : '')).join('');
  const size = width > 0 && height > 0 ? ` width="${Math.round(width)}" height="${Math.round(height)}"` : '';
  return `<img src="${assetRef(fileRel, target, '')}" alt="${escapeAttr(state.brand.name)}"${keep}${size}>`;
}

function escapeAttr(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
      state.inFooter = stack.some((frame) => frame.footer);
      state.frames = stack;
      state.inPortfolio = portfolioDepth > 0;
      state.inHeader = stack.some((frame) => frame.header);
      out += rewriteImg(full, portfolioDepth > 0, fileRel, state);
    } else if (tag === 'svg' && !state.collectOnly && portfolioDepth === 0 && isLogoSvg(full, stack, state)) {
      // An inline SVG logo becomes the brand's logo image, in the same box.
      const end = html.toLowerCase().indexOf('</svg>', match.index);
      if (end > 0) {
        out += svgLogoImage(full, fileRel, state);
        last = end + '</svg>'.length;
        tagRe.lastIndex = last;
        continue;
      }
      out += full;
    } else {
      if (!selfClose) {
        const portfolio = PORTFOLIO_ATTR.test(attrs);
        const footer = tag === 'footer' || /(?:class|id)\s*=\s*["'][^"']*footer/i.test(attrs);
        const header = tag === 'header' || tag === 'nav'
          || /(?:class|id)\s*=\s*["'][^"']*\b(?:header|site-header|navbar|nav-bar|topbar|top-bar|main-nav|menu-bar)\b/i.test(attrs);
        stack.push({ tag, portfolio, footer, header, attrs });
        if (portfolio) portfolioDepth += 1;
      }
      out += full;
    }
    last = match.index + full.length;
  }
  out += html.slice(last);
  return out;
}

/** "grandpublishers" from grandpublishers.co.uk, "nypublishers" from ny-publishers.com. */
function hostLabel(host) {
  const label = String(host || '').toLowerCase().replace(/^www\./, '').split('.')[0] || '';
  return label.replace(/[^a-z0-9]/g, '');
}

/**
 * How the old company writes its own name, found by matching the site's domain:
 * grandpublishers.co.uk -> "Grand Publishers", "GRAND PUBLISHERS", "GrandPublishers".
 * Guessing from the page title instead swaps the wrong words (e.g. a slogan).
 */
const NAME_SUFFIXES = new Set(['AE', 'UAE', 'UK', 'US', 'USA', 'CA', 'AU', 'PK', 'IN', 'LLC', 'INC', 'INC.', 'LTD', 'LTD.', 'CO', 'CO.', 'PVT']);

/** Close enough to be the same name: equal, singular/plural, or a typo (bestselerllc / Best Sellers LLC). */
function closeTo(compact, label) {
  if (compact === label || `${compact}s` === label || compact === `${label}s`) return true;
  // Typos only, never extra words in front: the name must start like the domain does.
  if (label.length < 8 || Math.abs(compact.length - label.length) > 2 || compact.slice(0, 4) !== label.slice(0, 4)) return false;
  const prev = Array.from({ length: label.length + 1 }, (_, i) => i);
  for (let i = 1; i <= compact.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= label.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (compact[i - 1] === label[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[label.length] <= 2;
}

function cleanName(phrase) {
  const name = String(phrase || '').replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$/g, '').replace(/\.$/, '').trim();
  if (name.length < 3 || name.length > 60 || /\.[a-z]{2,}$/i.test(name) || /[.,!?;:]\s/.test(name)) return '';
  // Every word of a company name carries a capital ("Book Writing Maestros", "eCom Partnerz");
  // "book publishers in Dubai" is just words.
  const words = name.split(' ');
  return words.every((w) => /[A-Z0-9&]/.test(w) || /^(?:of|and|the|for|&)$/i.test(w)) ? name : '';
}

const compactOf = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');

function detectOriginalNames(pages, oldHost) {
  const label = hostLabel(oldHost);
  const tld = String(oldHost || '').split('.').pop().toUpperCase();
  const exact = new Set();   // matches the domain letter for letter
  const variants = new Set(); // plural / typo: only trusted when the site confirms it
  const declared = new Set(); // what the site calls itself (og:site_name, copyright, logo alt)
  const related = (name) => label.length >= 4 && (closeTo(compactOf(name), label) || compactOf(name).startsWith(label));
  for (const page of pages) {
    const html = fs.readFileSync(page.full, 'utf8');
    const attrs = [...html.matchAll(/\b(?:alt|title|content)\s*=\s*(["'])([^"']{3,200})\1/gi)].map((m) => m[2]);
    const text = `${html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')} ${attrs.join(' \n ')}`
      .replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ');
    if (label.length >= 4) {
      const words = text.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += 1) {
        let compact = '';
        for (let j = i; j < Math.min(words.length, i + 5); j += 1) {
          compact += words[j].toLowerCase().replace(/[^a-z0-9]/g, '');
          if (compact.length > label.length + 3) break;
          if (compact.length < label.length - 2 || !closeTo(compact, label)) continue;
          const phrase = cleanName(words.slice(i, j + 1).join(' '));
          if (!phrase) continue;
          (compact === label ? exact : variants).add(phrase);
          // "Book Publisher AE", "Grand Publishers UK", "Acme LLC": the suffix belongs to the name.
          const next = String(words[j + 1] || '').replace(/[^A-Za-z.]+$/g, '');
          if (next && (NAME_SUFFIXES.has(next.toUpperCase()) || next.toUpperCase() === tld) && next === next.toUpperCase()) {
            (compact === label ? exact : variants).add(`${phrase} ${next}`);
          }
        }
      }
    }
    const site = html.match(/<meta\b[^>]*property=["']og:site_name["'][^>]*>/i)?.[0];
    if (site) declared.add(cleanName(getAttr(site, 'content')));
    for (const m of text.matchAll(/(?:©|&copy;|Copyright)\s*(?:\d{4}\s*(?:[-–]\s*\d{2,4})?)?\s*[-–|,]?\s*(?:by\s+)?([A-Z][A-Za-z0-9&'’ ]{2,50}?)(?=\s*(?:[.,|]|All\b|$)|\s{2,}|\n)/g)) declared.add(cleanName(m[1]));
    for (const m of text.matchAll(/(?:Powered|Owned|Operated) by\s+([A-Z][A-Za-z0-9&'’ ]{2,50}?)(?=\s*(?:[.,|]|All\b|$)|\s{2,}|\n)/g)) declared.add(cleanName(m[1]));
    // Page title segments ("Bestsellers LLC - Leading Book Marketing Agency"); only ones like the domain count.
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    for (const part of title.replace(/&amp;/g, '&').split(/\s[|\-–—:]\s|\|/)) declared.add(cleanName(part));
    for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
      if (LOGO_FILE.test(fileOf(realSrc(img[0]))) || hasLogoClass(img[0])) {
        declared.add(cleanName(getAttr(img[0], 'alt')));
        declared.add(cleanName(getAttr(img[0], 'title')));
      }
    }
  }
  declared.delete('');
  const confirmed = new Set([...declared].filter(related).map(compactOf));
  const names = new Set(exact);
  for (const v of variants) if (confirmed.has(compactOf(v))) names.add(v);
  for (const d of declared) if (related(d)) names.add(d);
  // Without a domain to match, trust only what the site declares about itself.
  if (!label || label.length < 4) for (const d of declared) names.add(d);
  return [...names].filter((n) => !/^logo$/i.test(n)).sort((a, b) => b.length - a.length);
}

/** The new name written the same way the old one was (all caps, or without spaces). */
function nameLike(variant, name) {
  if (variant === variant.toUpperCase() && /[A-Z]/.test(variant)) return name.toUpperCase();
  if (!/\s/.test(variant) && /\s/.test(name) && /[a-z][A-Z]/.test(variant)) return name.replace(/\s+/g, '');
  return name;
}

function escapeReg(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ASSET_TOKEN = /[^\s"'()<>,\\]+/g;
const ASSET_EXT = /\.(?:css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|woff2?|ttf|otf|eot|mp4|webm|ogv|ogg|mp3|wav|json|map|pdf|xml)$/i;

/**
 * Hide every reference to a file (local "external/<host>/..." mirrors, and any URL or path
 * ending in .css/.js/an image/a font) while names, domains, phones and emails are swapped.
 * Otherwise "external/cdn.oldbrand.com/style.css" becomes "external/cdn.newbrand.com/style.css",
 * a folder that doesn't exist, and the page loses its CSS and images.
 */
export function protectAssetRefs(text) {
  const kept = [];
  const masked = String(text).replace(ASSET_TOKEN, (token) => {
    const bare = token.replace(/[?#].*$/, '').replace(/&amp;.*$/, '');
    if (!/external\//i.test(token) && !(ASSET_EXT.test(bare) && /[/.]/.test(bare.slice(0, -4)))) return token;
    kept.push(token);
    return `\u0000${kept.length - 1}\u0000`;
  });
  return {
    text: masked,
    restore: (out) => out.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]),
  };
}

const ESC = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const US_ADDRESS = /\b\d{1,6}[A-Za-z]?\s+[^<>"]{2,90}?\b[A-Z]{2},?\s+\d{5}(?:-\d{4})?\b(?:,?\s*(?:USA|U\.S\.A\.|US|United States(?: of America)?))?/g;
const UK_ADDRESS = /\b\d{1,5}[A-Za-z]?\s+[^<>"]{2,90}?\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b(?:,?\s*(?:UK|United Kingdom))?/g;
const LOCATION_ICON = /<(?:i|span|em|img|svg)\b[^>]*(?:map-?marker|location|geo-?alt|map-?pin|fa-map|address|bi-geo|icon-pin|icon-map)[^>]*>/i;

/** Text that reads like a street address rather than a phone, email or sentence. */
function looksLikeAddress(text) {
  const t = text.replace(/&nbsp;|&#160;/g, ' ').trim();
  if (t.length < 6 || t.length > 220 || /@|https?:|^\+?[\d\s().-]+$/.test(t)) return false;
  if (t.split(/\s+/).length > 30) return false;
  return /\d/.test(t) || /,/.test(t) || /\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|suite|floor|tower|building|blvd|lane|drive|plaza|office|p\.?\s?o\.?\s?box)\b/i.test(t);
}

/** Point the visible address, map links and structured data at the new brand's address. */
function swapAddresses(html, brand) {
  const address = brand.address;
  if (!address) return html;
  const safe = ESC(address);
  let next = html;
  // Street addresses written out in full (US / UK formats).
  next = next.replace(US_ADDRESS, (m) => (looksLikeAddress(m) ? safe : m));
  next = next.replace(UK_ADDRESS, (m) => (looksLikeAddress(m) ? safe : m));
  // Text right after a location icon: <i class="fa fa-map-marker"></i> <a>Office 12, Bay Square, Dubai</a>
  next = next.replace(new RegExp(`(${LOCATION_ICON.source}(?:\\s*</(?:i|span|em|svg)>)*(?:\\s*</span>)?\\s*(?:<(?:a|span|p|div|strong|b)\\b[^>]*>\\s*)*)([^<]{6,220})`, 'gi'),
    (all, lead, text) => (looksLikeAddress(text) ? `${lead}${text.match(/^\s*/)[0]}${safe}` : all));
  // Labelled: "Address: …", "Head Office: …", "Mailing Address: …"
  next = next.replace(/((?:Mailing |Postal |Office |Our |Head Office |Business |Street )?(?:Address|Location|Head Office|Office|Visit Us|Find Us|HQ)\s*:\s*(?:<\/(?:b|strong|span|label|dt|th)>\s*)?(?:<(?:span|a|dd|td)\b[^>]*>\s*)?)([^<]{6,220})/gi,
    (all, lead, text) => (looksLikeAddress(text) ? `${lead}${safe}` : all));
  // <address>…</address> and elements marked as an address: keep labels, replace the address text.
  next = next.replace(/(<(address)\b[^>]*>|<(\w+)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:address|addr|location)\b[^"']*["'][^>]*>)([\s\S]{0,600}?)(<\/(?:\2|\3)>)/gi,
    (all, open, t1, t2, inner, close) => {
      let done = false;
      const body = inner.replace(/(^|>)([^<]+)(?=<|$)/g, (m, gt, text) => {
        if (/:\s*$/.test(text) || !text.trim()) return m;
        if (!looksLikeAddress(text) && !done) return m;
        if (done) return looksLikeAddress(text) ? gt : m; // the rest of a multi-line address
        done = true;
        return `${gt}${text.match(/^\s*/)[0]}${safe}`;
      });
      return done ? `${open}${body}${close}` : all;
    });
  // Map links and embedded maps.
  const q = encodeURIComponent(address);
  next = next.replace(/(href=["'])(https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com)[^"']*)(["'])/gi,
    `$1https://www.google.com/maps/search/?api=1&amp;query=${q}$3`);
  // The address written inside a map link: <a href="…maps…"><p>318 W Adams St …</p></a>
  next = next.replace(/(<a\b[^>]*href=["']https:\/\/www\.google\.com\/maps\/search\/[^"']*["'][^>]*>\s*(?:<(?:p|span|strong|b)\b[^>]*>\s*)*)([^<]{6,220})/gi,
    (all, lead, text) => (looksLikeAddress(text) ? `${lead}${safe}` : all));
  next = next.replace(/(<iframe\b[^>]*\bsrc=["'])(https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)[^"']*)(["'])/gi,
    `$1https://maps.google.com/maps?q=${q}&amp;output=embed$3`);
  // Structured data (JSON-LD).
  const parts = brand.addressParts;
  if (parts) {
    const set = (key, value) => { if (value) next = next.replace(new RegExp(`("${key}"\\s*:\\s*)["“][^"”]*["”]`, 'g'), `$1"${String(value).replace(/"/g, '\\"')}"`); };
    set('streetAddress', parts.street);
    set('addressLocality', parts.city);
    set('addressRegion', parts.state);
    set('postalCode', parts.zip);
  }
  return next;
}

function applyText(html, brand, oldNames, oldHost) {
  const shield = protectAssetRefs(html);
  return shield.restore(swapText(shield.text, brand, oldNames, oldHost));
}

function swapText(html, brand, oldNames, oldHost) {
  let next = html;
  for (const oldName of oldNames) {
    if (oldName.toLowerCase() === brand.name.toLowerCase()) continue;
    next = next.replace(new RegExp(`(?<![A-Za-z0-9])${escapeReg(oldName)}(?![A-Za-z0-9])`, 'g'), nameLike(oldName, brand.name));
  }
  next = swapAddresses(next, brand);
  if (brand.phone) {
    const phone = brand.phone.trim();
    const tel = phone.replace(/[^\d+]/g, '');
    const digitsOf = (v) => String(v).replace(/\D/g, '').replace(/^00/, '');
    // The site's own numbers, as its tel: links write them (any country format).
    const own = new Set([...next.matchAll(/(?:href=(["'])(?:tel|callto|sms):([^"']*)\1|"telephone"\s*:\s*["“]([^"”]+))/gi)]
      .map((m) => digitsOf(m[2] || m[3])).filter((d) => d.length >= 7));
    next = next.replace(/\+?\(?\d[\d\s().-]{6,18}\d/g, (match) => {
      const d = digitsOf(match);
      const local = d.replace(/^0+/, ''); // 054 994 5073 is +971 54 994 5073 written locally
      const known = [...own].some((o) => o === d || (local.length >= 8 && (o.endsWith(local) || local.endsWith(o))));
      const international = /^\+/.test(match.trim()) && d.length >= 9 && d.length <= 15;
      const us = /^(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}$/.test(match.trim());
      if (!known && !international && !us) return match;
      const lead = match.match(/^\s*/)[0];
      return `${lead}${phone}`;
    });
    // Links last, in dialable form (the display format above has spaces and brackets).
    next = next.replace(/href=(["'])(tel|callto|sms):[^"']*\1/gi, `href=$1$2:${tel}$1`);
    next = next.replace(/("telephone"\s*:\s*)["“][^"”]*["”]/g, `$1"${tel}"`);
    next = next.replace(/((?:wa\.me\/|whatsapp\.com\/send\/?\?phone=))[^"'&\s]*/gi, `$1${tel.replace(/\D/g, '')}`);
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
      // "BookPublisher.ae is ..." is the name written as a domain; "bookpublisher.ae" in a link is the domain.
      next = next.replace(new RegExp(`(^|[^/\\w.@-])(www\\.)?${escapeReg(oldHost)}`, 'gi'), (m, pre, www, offset, all) => {
        const word = m.slice(pre.length);
        const inText = /[A-Z]/.test(word) && !/["'=]\s*$/.test(all.slice(Math.max(0, offset - 3), offset + pre.length));
        return `${pre}${inText ? brand.name : `${www || ''}${newHost}`}`;
      });
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

function replaceLogoImages(html, fileRel, logoRel, oldBase, siteDir) {
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
        out += swapImage(full, fileRel, logoRel, { siteDir }, 'contain');
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
  return { html: dropStalePictureSources(out), logos };
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
    const result = replaceLogoImages(original, page.rel, safeLogo, oldBase, siteDir);
    if (result.html !== original) {
      fs.writeFileSync(page.full, result.html);
      pagesUpdated += 1;
      logosReplaced += result.logos;
    }
  }
  return { success: true, logosReplaced, pagesUpdated };
}

/** Is this url() / meta image one of the site's logos? */
function isLogoUrl(url, state) {
  const file = fileOf(url);
  if (!file || /^data:/i.test(url) || SKIP_SRC.test(url) || NOT_OUR_LOGO_SRC.test(url.split('?')[0])) return false;
  return state.knownLogoFiles.has(file) || LOGO_FILE.test(file);
}

/** Logos drawn as CSS backgrounds (stylesheets and inline style), in the old image's size. */
function swapCssLogos(css, cssRel, state) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (all, quote, url) => {
    if (!isLogoUrl(url, state)) return all;
    let target = state.logoRel;
    const file = /^(?:[a-z]+:|\/\/)/i.test(url) ? null : localImageFile(state.siteDir, cssRel, url);
    const box = file ? imageSize(file) : null;
    if (box) {
      try { target = fittedImage(state.siteDir, state.logoRel, box, 'contain'); } catch { /* plain file */ }
    }
    state.cssLogos += 1;
    return `url("${assetRef(cssRel, target, url)}")`;
  });
}

/** Share previews (og:image / twitter:image) and the logo in structured data. */
function swapMetaLogos(html, fileRel, state) {
  const logo = assetRef(fileRel, state.logoRel, '');
  let next = html.replace(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/gi, (tag) => {
    const content = getAttr(tag, 'content');
    return content && isLogoUrl(content, state) ? tag.replace(/(\bcontent\s*=\s*)(["'])[\s\S]*?\2/i, `$1"${logo}"`) : tag;
  });
  next = next.replace(/("logo"\s*:\s*)["“][^"”]*["”]/g, `$1"${logo}"`);
  return next;
}

function cssFiles(dir, rel = '', out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'images') continue;
    const full = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (fs.statSync(full).isDirectory()) cssFiles(full, relPath, out);
    else if (/\.css$/i.test(name)) out.push({ full, rel: relPath.replace(/\\/g, '/') });
  }
  return out;
}

export function applyBrand(siteDir, brandId, brandDir = '') {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');
  const brand = loadBrand(brandId, brandDir);
  const { logoRel, lightLogoRel, faviconRel, portfolioRels } = copyAssets(siteDir, brand);
  const pages = walkPages(siteDir);
  const meta = loadCloneMeta(siteDir);
  let oldHost = '';
  if (meta?.sourceUrl) {
    try { oldHost = new URL(meta.sourceUrl).host.replace(/^www\./, ''); } catch { /* ignore */ }
  }

  const oldNames = detectOriginalNames(pages, oldHost);
  const state = {
    siteDir,
    oldNames,
    label: hostLabel(oldHost),
    host: oldHost,
    frames: [],
    tld: String(oldHost || '').split('.').pop().toLowerCase(),
    knownLogoFiles: new Set(),
    collectOnly: true,
    ancestors: [],
    cssLogos: 0,
    brand,
    logoRel,
    lightLogoRel,
    portfolioRels,
    inFooter: false,
    srcMap: new Map(),
    portfolioIndex: 0,
    logos: 0,
    portfolios: 0,
    before: '',
  };
  let pagesUpdated = 0;

  // Pass 1: which image files does the site use as its logo? (Then the same file is
  // swapped everywhere, even where it has no logo-like name or class.)
  for (const page of pages) transformMarkup(fs.readFileSync(page.full, 'utf8'), page.rel, state);
  state.collectOnly = false;

  for (const page of pages) {
    const original = fs.readFileSync(page.full, 'utf8');
    let next = dropStalePictureSources(transformMarkup(original, page.rel, state));
    next = next.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, o, css, c) => o + swapCssLogos(css, page.rel, state) + c);
    next = next.replace(/(\sstyle\s*=\s*")([^"]*url\([^"]*)(")/gi, (m, o, css, c) => o + swapCssLogos(css, page.rel, state) + c);
    next = swapMetaLogos(next, page.rel, state);
    next = applyText(next, brand, oldNames, oldHost);
    next = swapFavicon(next, page.rel, faviconRel);
    if (next !== original) {
      fs.writeFileSync(page.full, next);
      pagesUpdated += 1;
    }
  }

  for (const sheet of cssFiles(siteDir)) {
    const css = fs.readFileSync(sheet.full, 'utf8');
    const swapped = swapCssLogos(css, sheet.rel, state);
    if (swapped !== css) fs.writeFileSync(sheet.full, swapped);
  }

  saveCloneMeta(siteDir, { brandId: brand.id, brandName: brand.name });

  return {
    success: true,
    brand: brand.name,
    brandId: brand.id,
    pagesUpdated,
    logosReplaced: state.logos + state.cssLogos,
    portfolioImages: state.portfolios,
    previousName: oldNames[0] || null,
    previousNames: oldNames,
  };
}
