/**
 * Branded invoice bands for a cloned site.
 *
 * Renders two print-ready PNGs into `<clone>/invoice/` — a header band carrying
 * the site's own logo and an "INVOICE" wordmark, plus a matching footer rule.
 * Both are 2480px wide, which is A4 at 300dpi, so they drop straight into an
 * invoice document at full print resolution.
 *
 * The wordmark comes from a bundled alpha mask that gets tinted, so the
 * lettering is identical on every machine without depending on installed fonts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { colorStats, contrastRatio, loadTheme, mixHex } from './site-utils.mjs';
import { resolveChromePath } from './PuppeteerCloner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASK_FILE = path.join(__dirname, 'assets/invoice/wordmark-invoice.png');

/** A4 at 300dpi, matching the reference artwork this was measured from. */
const BAND = {
  width: 2480,
  height: 483,
  logo: { left: 38, top: 4, maxWidth: 914, maxHeight: 246 },
  bar: { left: 0, top: 272, width: 1405, height: 148 },
  wordmark: { left: 1489, top: 267, width: 666, height: 157 },
  endBlock: { left: 2213, top: 267, width: 267, height: 157 },
};

const FOOTER = {
  width: 2480,
  height: 52,
  barTop: 31,
  barHeight: 20,
  left: { left: 3, width: 1502 },
  right: { left: 2266, width: 214 },
};

const OUT_DIR = 'img';
const HEADER_FILE = 'invoice.png';
const FOOTER_FILE = 'footer.png';

const LOGO_EXT = /\.(png|svg|webp|jpe?g|gif)$/i;
/** Payment badges, sprites, and social icons are never the site logo. */
const SKIP_LOGO_SRC = /pay-logo|payment|sprite|social|flag|icon-|badge|cards?\b/i;

function outDir(siteDir) {
  return path.join(siteDir, OUT_DIR);
}

/* ---------------------------------------------------------------- colors -- */

/**
 * Large flat bands read badly on paper when they are almost white or almost
 * black, so a color is nudged toward a printable mid-tone before it is used.
 */
function printable(hex) {
  const { luma } = colorStats(hex);
  if (luma < 45) return mixHex(hex, '#ffffff', 0.25);
  if (luma > 205) return mixHex(hex, '#000000', 0.3);
  return hex;
}

/**
 * The wordmark is cut out of the band color on a white invoice, so the band has
 * to stay readable as text. A pale brand color is deepened until it is.
 */
function readableOnWhite(hex) {
  let color = hex;
  for (let step = 1; step <= 6 && contrastRatio(color, '#ffffff') < 3; step += 1) {
    color = mixHex(color, '#000000', 0.15);
  }
  return color;
}

function hueOf(hex) {
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return -1;
  const d = max - min;
  let deg;
  if (max === r) deg = ((g - b) / d) % 6;
  else if (max === g) deg = ((b - r) / d) + 2;
  else deg = ((r - g) / d) + 4;
  return ((deg * 60) + 360) % 360;
}

function hueGap(a, b) {
  if (a < 0 || b < 0) return 0;
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function isUsable(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return false;
  const { sat, luma } = colorStats(hex);
  return sat >= 0.15 && luma > 18 && luma < 232;
}

/**
 * Pick the band colors. The header takes the strongest brand color. The footer
 * takes a genuine second brand color when the site has one, which is how the
 * reference artwork pairs blue with gold; otherwise it takes a darker tone of
 * the header, because a hue plucked from further down a scraped palette is
 * usually an incidental accent and clashes on paper.
 *
 * Logo colors come first when available. Scraped CSS often yields a near-white
 * `primary`, while the logo is what the business actually prints.
 */
export function pickBandColors(theme = {}, logoColors = []) {
  const ordered = [
    ...logoColors,
    theme.primary,
    theme.accent,
    theme.secondary,
    ...(Array.isArray(theme.palette) ? theme.palette : []),
    theme.text,
  ];
  const candidates = [];
  for (const raw of ordered) {
    const hex = String(raw || '').toLowerCase();
    if (isUsable(hex) && !candidates.includes(hex)) candidates.push(hex);
  }
  if (!candidates.length) return { headerColor: '#6a9abf', footerColor: '#a98759' };

  const headerColor = readableOnWhite(printable(candidates[0]));
  const headerHue = hueOf(headerColor);
  const headerSat = colorStats(headerColor).sat;
  // A real brand pair matches in intensity the way navy matches gold. A hue that
  // is far more saturated than the header is a CTA or alert color, not branding.
  const second = candidates
    .slice(1, 4)
    .find((hex) => hueGap(hueOf(hex), headerHue) >= 45
      && Math.abs(colorStats(hex).sat - headerSat) <= 0.35);
  const footerColor = second ? printable(second) : mixHex(headerColor, '#000000', 0.28);
  return { headerColor, footerColor };
}

/* ------------------------------------------------------------------ logo -- */

function fileScore(abs) {
  try {
    return fs.statSync(abs).size;
  } catch {
    return 0;
  }
}

function collectLogoRefs(siteDir) {
  const indexPath = ['index.html', 'index.php', 'views/home.php', 'includes/header.php']
    .map((rel) => path.join(siteDir, rel))
    .filter((abs) => fs.existsSync(abs));

  const refs = new Set();
  for (const abs of indexPath) {
    const html = fs.readFileSync(abs, 'utf8');
    const imgRe = /<img\b[^>]*>/gi;
    let match;
    while ((match = imgRe.exec(html))) {
      const tag = match[0];
      const src = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
      if (!src || SKIP_LOGO_SRC.test(src)) continue;
      const identity = `${tag} ${html.slice(Math.max(0, match.index - 200), match.index)}`;
      if (!/\blogo\b/i.test(identity)) continue;
      refs.add(src.split('#')[0].split('?')[0]);
    }
  }
  return [...refs];
}

/**
 * Find the clone's own logo on disk. A logo installed by the brand tool wins,
 * then anything the pages mark as a logo, then the favicon as a last resort.
 */
export function findSiteLogo(siteDir) {
  const brandDir = path.join(siteDir, 'images/brand');
  if (fs.existsSync(brandDir)) {
    const installed = fs
      .readdirSync(brandDir)
      .filter((name) => /^logo\./i.test(name) && LOGO_EXT.test(name))
      .map((name) => `images/brand/${name}`);
    if (installed.length) return installed[0];
  }

  const found = [];
  for (const ref of collectLogoRefs(siteDir)) {
    const rel = ref.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
    if (!LOGO_EXT.test(rel) || rel.split('/').includes('..')) continue;
    const abs = path.join(siteDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) found.push(rel);
  }
  if (found.length) {
    found.sort((a, b) => fileScore(path.join(siteDir, b)) - fileScore(path.join(siteDir, a)));
    return found[0];
  }

  for (const fallback of ['favicon.png', 'images/favicon.png', 'favicon.ico']) {
    if (fs.existsSync(path.join(siteDir, fallback))) return fallback;
  }
  return '';
}

/* --------------------------------------------------------------- render -- */

function dataUri(abs) {
  const ext = path.extname(abs).toLowerCase();
  const type = ext === '.svg'
    ? 'image/svg+xml'
    : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.ico'
          ? 'image/x-icon'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/png';
  return `data:${type};base64,${fs.readFileSync(abs).toString('base64')}`;
}

function headerMarkup({ headerColor, logoUri, maskUri }) {
  const { logo, bar, wordmark, endBlock } = BAND;
  const logoTag = logoUri
    ? `<img class="logo" src="${logoUri}" alt="" />`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  .band { position: relative; width: ${BAND.width}px; height: ${BAND.height}px; }
  .logo {
    position: absolute; left: ${logo.left}px; top: ${logo.top}px;
    max-width: ${logo.maxWidth}px; max-height: ${logo.maxHeight}px;
    width: auto; height: auto;
  }
  .bar {
    position: absolute; left: ${bar.left}px; top: ${bar.top}px;
    width: ${bar.width}px; height: ${bar.height}px; background: ${headerColor};
  }
  .end {
    position: absolute; left: ${endBlock.left}px; top: ${endBlock.top}px;
    width: ${endBlock.width}px; height: ${endBlock.height}px; background: ${headerColor};
  }
  .word {
    position: absolute; left: ${wordmark.left}px; top: ${wordmark.top}px;
    width: ${wordmark.width}px; height: ${wordmark.height}px; background: ${headerColor};
    -webkit-mask-image: url("${maskUri}"); mask-image: url("${maskUri}");
    -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  }
</style></head>
<body><div class="band">${logoTag}<div class="bar"></div><div class="word"></div><div class="end"></div></div></body></html>`;
}

function footerMarkup({ footerColor }) {
  const { barTop, barHeight, left, right } = FOOTER;
  const rule = (seg) => `<div class="rule" style="left:${seg.left}px;width:${seg.width}px"></div>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  .band { position: relative; width: ${FOOTER.width}px; height: ${FOOTER.height}px; }
  .rule { position: absolute; top: ${barTop}px; height: ${barHeight}px; background: ${footerColor}; }
</style></head>
<body><div class="band">${rule(left)}${rule(right)}</div></body></html>`;
}

/**
 * Read the logo's own brand colors by drawing it to a canvas and counting
 * saturated pixels. Quantizing to 5 bits a channel merges anti-aliased edges,
 * and hues already represented are skipped so the result is distinct colors
 * rather than several shades of one.
 */
async function sampleLogoColors(page, logoUri) {
  if (!logoUri) return [];
  try {
    await page.setContent('<!DOCTYPE html><html><body></body></html>', { waitUntil: 'load' });
    return await page.evaluate(async (uri) => {
      const img = new Image();
      img.src = uri;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('logo decode failed'));
      });

      const size = 72;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      const counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a < 200) continue;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const luma = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        if (sat < 0.3 || luma < 25 || luma > 225) continue;
        const key = `${r >> 3},${g >> 3},${b >> 3}`;
        const slot = counts.get(key) || { r: 0, g: 0, b: 0, n: 0 };
        slot.r += r; slot.g += g; slot.b += b; slot.n += 1;
        counts.set(key, slot);
      }

      const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
      const hueOfRgb = (r, g, b) => {
        const max = Math.max(r, g, b);
        const d = max - Math.min(r, g, b);
        if (!d) return -1;
        let deg;
        if (max === r) deg = ((g - b) / d) % 6;
        else if (max === g) deg = ((b - r) / d) + 2;
        else deg = ((r - g) / d) + 4;
        return ((deg * 60) + 360) % 360;
      };

      const picked = [];
      const hues = [];
      for (const slot of [...counts.values()].sort((a, b) => b.n - a.n)) {
        const r = slot.r / slot.n;
        const g = slot.g / slot.n;
        const b = slot.b / slot.n;
        const hue = hueOfRgb(r, g, b);
        if (hues.some((h) => {
          const diff = Math.abs(h - hue) % 360;
          return (diff > 180 ? 360 - diff : diff) < 30;
        })) continue;
        hues.push(hue);
        picked.push(`#${hex(r)}${hex(g)}${hex(b)}`);
        if (picked.length === 3) break;
      }
      return picked;
    }, logoUri);
  } catch {
    return [];
  }
}

async function shoot(page, html, width, height, file) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

/**
 * Write the header band and footer rule for one clone, branded from the
 * clone's own logo and theme. The images land in `<clone>/img/`.
 */
export async function generateInvoiceBands(siteDir) {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');
  if (!fs.existsSync(MASK_FILE)) throw new Error('Invoice wordmark asset is missing.');

  const logo = findSiteLogo(siteDir);

  const dir = outDir(siteDir);
  fs.mkdirSync(dir, { recursive: true });

  const puppeteer = await import('puppeteer');
  const executablePath = resolveChromePath(puppeteer.default);
  if (!executablePath) {
    throw new Error('Chrome not found. Install Google Chrome or run: npx puppeteer browsers install chrome');
  }

  const maskUri = dataUri(MASK_FILE);
  const logoUri = logo ? dataUri(path.join(siteDir, logo)) : '';

  const browser = await puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const { headerColor, footerColor } = pickBandColors(
      loadTheme(siteDir),
      await sampleLogoColors(page, logoUri),
    );

    await shoot(
      page,
      headerMarkup({ headerColor, logoUri, maskUri }),
      BAND.width,
      BAND.height,
      path.join(dir, HEADER_FILE),
    );
    await shoot(
      page,
      footerMarkup({ footerColor }),
      FOOTER.width,
      FOOTER.height,
      path.join(dir, FOOTER_FILE),
    );

    return {
      success: true,
      headerColor,
      footerColor,
      logo,
      files: { header: `${OUT_DIR}/${HEADER_FILE}`, footer: `${OUT_DIR}/${FOOTER_FILE}` },
    };
  } finally {
    await browser.close();
  }
}
