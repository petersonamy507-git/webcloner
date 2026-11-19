/**
 * Make a replacement image take exactly the space of the image it replaces.
 *
 * A page's layout depends on an image's intrinsic size (the browser uses it whenever the CSS
 * doesn't fix both width and height). So instead of pointing <img> at the new file directly,
 * we point it at a small SVG whose width/height are the OLD image's, with the new image
 * embedded and fitted inside ("contain" for logos, "cover" for photos). The page keeps every
 * box the same size, and the embedded image stays sharp on high-DPI screens.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif',
};

function svgSize(text) {
  const head = text.slice(0, 4000);
  const tag = head.match(/<svg\b[^>]*>/i)?.[0] || '';
  const num = (name) => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i'));
    return m ? parseFloat(m[1]) : 0;
  };
  let width = num('width');
  let height = num('height');
  const box = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if ((!width || !height) && box) {
    const [vw, vh] = [parseFloat(box[1]), parseFloat(box[2])];
    if (width && !height) height = (width * vh) / vw;
    else if (height && !width) width = (height * vw) / vh;
    else { width = vw; height = vh; }
  }
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Pixel size of a PNG, JPEG, GIF, WebP or SVG file, or null when it can't be read. */
export function imageSize(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    return null;
  }
  const text = buf.toString('utf8', 0, Math.min(buf.length, 8000));
  if (/<svg\b/i.test(text)) return svgSize(text);
  return null;
}

/** The local file an <img src> on page `pageRel` points to, if it's inside the site. */
export function localImageFile(siteDir, pageRel, src) {
  const clean = String(src || '').split('#')[0].split('?')[0].trim();
  if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* keep as is */ }
  const rel = decoded.startsWith('/')
    ? decoded.replace(/^\/+/, '')
    : path.posix.join(path.posix.dirname(pageRel), decoded);
  const root = path.resolve(siteDir);
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return null;
  return fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}

/** The box the old image occupied: its file's size, else the tag's width/height attributes. */
export function originalBox(siteDir, pageRel, tag, getAttr) {
  const file = localImageFile(siteDir, pageRel, getAttr(tag, 'src'));
  const fromFile = file ? imageSize(file) : null;
  if (fromFile?.width && fromFile?.height) return fromFile;
  const width = parseFloat(getAttr(tag, 'width'));
  const height = parseFloat(getAttr(tag, 'height'));
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Write (once) an SVG of exactly `box` size showing `assetRel` fitted inside it, and return
 * its site-relative path. mode: 'contain' (whole image visible) or 'cover' (box filled).
 */
export function fittedImage(siteDir, assetRel, box, mode = 'contain') {
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const src = path.join(siteDir, assetRel);
  const ext = path.extname(assetRel).toLowerCase();
  const base = path.basename(assetRel, ext).replace(/[^a-z0-9_-]/gi, '-');
  const out = `images/brand/fit/${base}-${width}x${height}-${mode}.svg`;
  const full = path.join(siteDir, out);
  const data = fs.readFileSync(src);
  // Re-write when the source changed (a different brand applied with the same file name).
  // (A hex hash: base64 can contain "--", which would break an XML comment and the whole SVG.)
  const stamp = `<!-- source ${crypto.createHash('sha1').update(data).digest('hex')} -->`;
  if (fs.existsSync(full) && fs.readFileSync(full, 'utf8').includes(stamp)) return out;
  const href = `data:${MIME[ext] || 'application/octet-stream'};base64,${data.toString('base64')}`;
  const fit = mode === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${stamp}<image width="${width}" height="${height}" preserveAspectRatio="${fit}" href="${href}" xlink:href="${href}"/></svg>\n`);
  return out;
}

/** Lazy-load and responsive attributes that would bring the old image back. */
export const STALE_IMAGE_ATTRS = ['srcset', 'data-srcset', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-imgurl'];

/** A <picture> whose <img> now shows a brand image must not keep <source>s of the old one. */
export function dropStalePictureSources(html) {
  return html.replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, (block) => (
    /images\/brand\//.test(block) ? block.replace(/<source\b[^>]*>/gi, '') : block));
}
