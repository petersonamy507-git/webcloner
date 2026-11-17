import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as cheerio from 'cheerio';
import {
  assetUrlToLocal,
  safeWriteFile,
  isCrawlablePage,
  pageAssetBase,
  localPathAssetBase,
  resolveAssetAbsolute,
  isRootAssetPath,
  relativeAssetFromPage,
  canonicalAssetKey,
  isSameSite,
  ensureCrawlFetchUrl,
  fetchWithRetry,
} from './crawl-utils.mjs';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_SIZE = 500 * 1024 * 1024;

export const MIME_EXT = {
  'image/avif': '.avif',
  'text/css': '.css',
  'text/javascript': '.js',
  'application/javascript': '.js',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
  'font/ttf': '.ttf',
  'application/font-woff': '.woff',
  'application/font-woff2': '.woff2',
  'video/mp4': '.mp4',
};

/**
 * Point srcset candidates at saved copies. Candidates that could not be saved are
 * dropped when another size was (a root path like /api/images/… would otherwise hit
 * the editor's own server), and a src still pointing at the live site takes a saved one.
 */
function rewriteSrcset($, $el, rewriteHtmlRef) {
  const srcset = $el.attr('srcset');
  if (!srcset) return;
  const parts = srcset.split(/,\s+(?=\S)/).map((p) => {
    const [url, ...d] = p.trim().split(/\s+/);
    const next = rewriteHtmlRef(url);
    return { url: next, local: next !== url, descriptor: d.join(' ') };
  });
  const local = parts.filter((p) => p.local);
  const keep = local.length ? local : parts;
  $el.attr('srcset', keep.map((p) => p.url + (p.descriptor ? ` ${p.descriptor}` : '')).join(', '));
  const src = $el.attr('src') || '';
  if (local.length && (/^(https?:)?\/\//i.test(src) || src.startsWith('/'))) {
    $el.attr('src', local[local.length - 1].url);
  }
}

function hashStr(s) {
  return crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
}

function isSkipped(url) {
  return !url || /^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(url.trim());
}

function resolveAbsolute(refUrl, baseUrl) {
  if (isSkipped(refUrl)) return null;
  try {
    return new URL(refUrl, baseUrl).href;
  } catch {
    return null;
  }
}

function collectCssFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectCssFiles(full));
    else if (entry.name.endsWith('.css')) files.push(full);
  }
  return files;
}

/** Remove Slick carousel runtime markup saved by Puppeteer so sliders re-init on reload */
export function stripSlickRuntime(html) {
  if (!/slick-(?:initialized|track|list|slide)/i.test(html)) return html;
  const $ = cheerio.load(html, { decodeEntities: false });

  const unwrapSlideContent = ($slide) => {
    let $node = $slide.children().first();
    if (!$node.length) return null;
    if ($node.children().length === 1) {
      const $child = $node.children().first();
      if ($child.is('li, div, article, section')) $node = $child;
    }
    return $node.clone();
  };

  $('.slick-initialized').each((_, root) => {
    const $root = $(root);
    if ($root.parents('.slick-initialized').length) return;

    $root.find('.slick-dots, .slick-arrow').remove();

    const $list = $root.children('.slick-list').first();
    const $track = $list.length
      ? $list.children('.slick-track').first()
      : $root.children('.slick-track').first();

    if ($track.length) {
      const items = [];
      $track.children('.slick-slide:not(.slick-cloned)').each((_, slide) => {
        const item = unwrapSlideContent($(slide));
        if (item) items.push(item);
      });
      $root.empty();
      const isListRoot = $root.is('ul, ol');
      for (const item of items) {
        item.removeAttr('style tabindex aria-hidden id aria-describedby role');
        item.find('[style]').each((__, el) => {
          const style = $(el).attr('style') || '';
          if (/width:\s*100%|display:\s*inline-block/i.test(style)) $(el).removeAttr('style');
        });
        if (isListRoot && !item.is('li')) {
          $root.append($('<li></li>').append(item));
        } else {
          $root.append(item);
        }
      }
    }

    const cls = ($root.attr('class') || '').split(/\s+/).filter((c) => c && !c.startsWith('slick-'));
    if (cls.length) $root.attr('class', cls.join(' '));
    else $root.removeAttr('class');
    $root.removeAttr('style tabindex role');
  });

  $('.slick-dots, .slick-arrow').remove();
  return $.html();
}

function patchSliderScripts(html) {
  return html.replace(
    /\$\(['"]\.mobile_portfolio['"]\)\.slick\(/g,
    "$('.home_slider, .mobile_portfolio').slick("
  );
}

/** Move <style> blocks sitting between </head> and <body> into body (common on nypublishers pages) */
function relocateOrphanStyles(html) {
  if (!/<\/head>\s*<style/i.test(html) && !/<html>\s*<style/i.test(html)) return html;
  const $ = cheerio.load(html, { decodeEntities: false });
  const blocks = [];
  $('html > style').each((_, el) => {
    blocks.push($.html(el));
    $(el).remove();
  });
  if (blocks.length && $('body').length) {
    $('body').prepend(blocks.join('\n'));
  }
  return $.html();
}

function sanitizeHtml(html) {
  let out = html
    .replace(/(<img\b[^>]*?)\sloading="lazy"([^>]*?)\sloading="lazy"/gi, '$1 loading="eager"$2')
    .replace(/\sloading="lazy"/gi, ' loading="eager"');
  out = stripSlickRuntime(out);
  out = patchSliderScripts(out);
  out = relocateOrphanStyles(out);
  return out;
}

function isHtmlPayload(buf, contentType = '') {
  if (contentType.includes('text/html')) return true;
  const head = buf.slice(0, 128).toString('utf8').trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

async function downloadAsset(absoluteUrl, pageOrigin) {
  const fetchUrl = ensureCrawlFetchUrl(absoluteUrl);
  try {
    const res = await fetchWithRetry(fetchUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', Referer: `${pageOrigin}/` },
      redirect: 'follow',
      signal: AbortSignal.timeout(120000),
    }, 1);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_FILE_SIZE) return null;
    if (isHtmlPayload(buf, contentType)) return null;
    return { buf, contentType };
  } catch {
    return null;
  }
}

function finalizeLazyImages(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('img').each((_, el) => {
    const $el = $(el);
    const lazySrc = $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-original');
    const current = $el.attr('src') || '';
    if (lazySrc && (!current || current.startsWith('data:image'))) {
      $el.attr('src', lazySrc);
    }
    $el.removeClass('myLazy lazy');
    $el.removeAttr('loading data-src data-lazy-src data-original');
  });
  return $.html();
}

function scanHtmlForAssetPaths(html, checkLocal) {
  const attrRe = /(?:src|href|poster|data-src|data-lazy-src|data-original)=["']((assets\/|external\/|slick\/|bootstrap\/|cdn-cgi\/|nypublishers\/)[^"'?#]+)["']/gi;
  let m;
  while ((m = attrRe.exec(html)) !== null) checkLocal(m[1]);
  const quotedRe = /["']((assets\/|external\/|slick\/|bootstrap\/|cdn-cgi\/|nypublishers\/)[^"'?#]+)["']/gi;
  while ((m = quotedRe.exec(html)) !== null) checkLocal(m[1]);
}

const CRITICAL_STYLESHEETS = [
  'nypublishers/assets/css/slick.css',
  'nypublishers/assets/css/slick-theme.css',
  'nypublishers/assets/css/popup.css',
  'nypublishers/assets/css/popup-custom.css',
  'nypublishers/assets/css/owl.carousel.css',
  'nypublishers/assets/css/owl.carousel.min.css',
];

const UI_FIDELITY_CSS = 'assets/css/cloner-ui-fidelity.css';

function pageDepth(pageFile) {
  const dir = path.posix.dirname(pageFile.replace(/\\/g, '/'));
  return dir === '.' ? 0 : dir.split('/').length;
}

function relativeSitePrefix(pageFile) {
  const depth = pageDepth(pageFile);
  return depth ? '../'.repeat(depth) : '';
}

export function fixSliderListStructure(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('ul.top-slider, ul.logo-slider').each((_, el) => {
    const $ul = $(el);
    if ($ul.hasClass('slick-initialized')) return;
    $ul.children('img').each((__, img) => {
      $(img).wrap('<li></li>');
    });
  });
  return $.html();
}

export function fixDeferredLoaderPaths(html, pageFile) {
  const correct = `${relativeSitePrefix(pageFile)}nypublishers/`;
  return html.replace(/\.\.\/nypublishers\//g, correct);
}

export function injectCriticalStylesheets(html, pageFile) {
  const head = (html.split('</head>')[0] || '');
  if (/<link[^>]+slick\.css/i.test(head)) return html;
  const prefix = relativeSitePrefix(pageFile);
  const links = CRITICAL_STYLESHEETS
    .filter((href) => !new RegExp(href.replace(/\./g, '\\.'), 'i').test(head))
    .map((href) => `<link rel="stylesheet" href="${prefix}${href}">`)
    .join('\n  ');
  if (!links || !html.includes('</head>')) return html;
  return html.replace('</head>', `  ${links}\n</head>`);
}

function collectCloneHtmlFiles(outputDir) {
  const htmlFiles = [];
  function walk(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const relPath = (rel ? `${rel}/${name}` : name).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) {
        if (!/^(assets|external|cdn-cgi)$/i.test(name)) walk(full, relPath);
      } else if (name === 'index.html' && !/^(assets|external)\//i.test(relPath)) {
        htmlFiles.push(relPath);
      }
    }
  }
  if (fs.existsSync(outputDir)) walk(outputDir);
  return htmlFiles;
}

async function downloadMissingDeferredAssets(outputDir, siteOrigin) {
  const missing = new Set(CRITICAL_STYLESHEETS);
  const extraAssets = [
    'nypublishers/assets/css/jquery.fancybox.css',
    'nypublishers/assets/css/jquery.fancybox.min.css',
    'nypublishers/assets/js/functions.js',
  ];
  for (const p of extraAssets) missing.add(p);

  for (const relPath of collectCloneHtmlFiles(outputDir)) {
    const html = fs.readFileSync(path.join(outputDir, relPath), 'utf8');
    const re = /["']((nypublishers\/)[^"'?#\s]+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      missing.add(m[1].split('?')[0]);
    }
  }

  let count = 0;
  for (const localPath of missing) {
    const full = path.join(outputDir, localPath);
    if (fs.existsSync(full) && !isHtmlPayload(fs.readFileSync(full))) continue;
    const abs = new URL(localPath, `${siteOrigin}/`).href;
    const result = await downloadAsset(abs, siteOrigin);
    if (!result || isHtmlPayload(result.buf, result.contentType)) continue;
    safeWriteFile(full, result.buf);
    count++;
  }
  return count;
}

function writeUiFidelityCss(outputDir) {
  const cssDir = path.join(outputDir, 'assets/css');
  if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true });
  const cssPath = path.join(cssDir, 'cloner-ui-fidelity.css');
  const rules = [
    '/* Cloner UI fidelity — restore original popup/slider styling */',
    '#popupform1Lead .banner-r h4, #popupformLead .banner-r h4, .popup-form .banner-inner-tl h4 { color: #fff !important; }',
    '.popup-form .banner-inner-tl p, .popup-form .form-div label, .popup-form .banner-r .bnr-form-btn p { color: #fff !important; }',
    '.popup-form .banner-inner-tl p, .banner-r .bnr-form-btn p strong { color: #06d978 !important; }',
    '.popup-form .form-btn, .banner-r .form-btn, .bnr-form-btn .form-btn, .banner-r input.btn.form-btn { background-color: #06d978 !important; border-color: #06d978 !important; color: #fff !important; }',
    '.top-slider li { list-style: none; text-align: center; }',
    '.top-slider img { display: inline-block !important; width: 65% !important; max-width: 140px; height: auto !important; }',
    '.slick-slider .top-slider img { width: 65% !important; }',
  ];
  fs.writeFileSync(cssPath, rules.join('\n'));
}

function linkUiFidelityCss(outputDir) {
  writeUiFidelityCss(outputDir);
  let linked = 0;
  for (const pageFile of collectCloneHtmlFiles(outputDir)) {
    const filePath = path.join(outputDir, pageFile);
    let html = fs.readFileSync(filePath, 'utf8');
    const prefix = relativeSitePrefix(pageFile);
    const href = `${prefix}${UI_FIDELITY_CSS}`;
    if (html.includes('cloner-ui-fidelity.css') || !html.includes('</head>')) continue;
    html = html.replace('</head>', `  <link rel="stylesheet" href="${href}">\n</head>`);
    fs.writeFileSync(filePath, html);
    linked++;
  }
  return linked;
}

/**
 * Light cleanup only. Do not inject another site's CSS or override colors —
 * the captured stylesheets are what make the clone match the original.
 */
export async function repairUiFidelity(outputDir) {
  let pagesFixed = 0;

  for (const pageFile of collectCloneHtmlFiles(outputDir)) {
    const filePath = path.join(outputDir, pageFile);
    let html = fs.readFileSync(filePath, 'utf8');
    const before = html;
    html = fixDeferredLoaderPaths(html, pageFile);
    html = fixSliderListStructure(html);
    if (html !== before) {
      fs.writeFileSync(filePath, html);
      pagesFixed++;
    }
  }

  return { pagesFixed, assetsDownloaded: 0, cssLinked: 0, animationPagesFixed: 0 };
}

function isRemoteVendor(refUrl, pageOrigin) {
  if (!/^https?:\/\//i.test(refUrl || '')) return false;
  try {
    return new URL(refUrl).origin !== new URL(pageOrigin).origin;
  } catch {
    return false;
  }
}

function lookupDownloaded(downloaded, absUrl, pageOrigin, outputDir = null) {
  if (!absUrl) return null;
  const key = canonicalAssetKey(absUrl);
  let local = downloaded.get(absUrl) || downloaded.get(key);
  if (!local) {
    for (const [k, v] of downloaded) {
      if (canonicalAssetKey(k) === key) {
        local = v;
        break;
      }
    }
  }
  if (!local) local = assetUrlToLocal(absUrl, pageOrigin);
  if (local && outputDir && !fs.existsSync(path.join(outputDir, local))) {
    return null;
  }
  return local;
}

function lookupValidLocalAsset(downloaded, absUrl, pageOrigin, outputDir) {
  const local = lookupDownloaded(downloaded, absUrl, pageOrigin, outputDir);
  if (!local || !outputDir) return local;
  const full = path.join(outputDir, local);
  if (!fs.existsSync(full)) return null;
  if (!local.endsWith('.html') && isHtmlPayload(fs.readFileSync(full))) return null;
  return local;
}

function rewriteCssUrlRef(refUrl, cssPath, pageOrigin, downloaded, outputDir) {
  if (isSkipped(refUrl)) return refUrl;
  const candidates = [refUrl];
  if (!/^https?:/i.test(refUrl) && !refUrl.startsWith('/') && !refUrl.startsWith('../')) {
    candidates.push(`../${refUrl}`);
  }
  for (const candidate of candidates) {
    const abs = resolveAssetAbsolute(candidate, new URL(cssPath, `${pageOrigin}/`).href, pageOrigin)
      || resolveAbsolute(candidate, localPathAssetBase(cssPath, pageOrigin));
    if (!abs) continue;
    const local = lookupValidLocalAsset(downloaded, abs, pageOrigin, outputDir);
    if (!local) continue;
    const rel = path.posix.relative(path.posix.dirname(cssPath), local).replace(/\\/g, '/');
    return rel || local;
  }
  return refUrl;
}

function resolveLocalAssetPath(refUrl, pageUrl, pageOrigin, downloaded, outputDir = null) {
  const abs = resolveAssetAbsolute(refUrl, pageUrl, pageOrigin);
  if (!abs) {
    // Another domain (a CDN): only files the capture browser already saved are local.
    if (!/^https?:\/\//i.test(String(refUrl || '').trim())) return null;
    const cross = String(refUrl).trim().replace(/&amp;/g, '&');
    const local = downloaded.get(cross) || downloaded.get(canonicalAssetKey(cross));
    return local && (!outputDir || fs.existsSync(path.join(outputDir, local))) ? local : null;
  }
  return lookupDownloaded(downloaded, abs, pageOrigin, outputDir);
}

function rewriteAssetRef(refUrl, pageUrl, pageOrigin, sourcePath, downloaded, outputDir = null) {
  if (isSkipped(refUrl)) return refUrl;
  const local = resolveLocalAssetPath(refUrl, pageUrl, pageOrigin, downloaded, outputDir);
  if (!local) return refUrl;
  return relativeAssetFromPage(sourcePath, local);
}

function rewriteInlineRootAssets(html, pageUrl, pageOrigin, sourcePath, downloaded, outputDir) {
  if (path.posix.dirname(sourcePath) === '.') return html;

  return html
    .replace(
      /((?:src|href|poster|data-src|data-lazy-src|data-original|data-bg)\s*=\s*["'])((?:\.\.\/)?(?:assets|external|slick|bootstrap|cdn-cgi)\/[^"'?#]+)(["'])/gi,
      (match, pre, assetRef, post) => {
        if (assetRef.startsWith('../')) return match;
        const rel = rewriteAssetRef(assetRef, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);
        return rel === assetRef ? match : pre + rel + post;
      }
    )
    .replace(
      /(["'])((?:assets|external|slick|bootstrap|cdn-cgi)\/[^"'?#]+)\1/g,
      (match, quote, assetRef) => {
        if (assetRef.startsWith('../')) return match;
        const rel = rewriteAssetRef(assetRef, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);
        return rel === assetRef ? match : quote + rel + quote;
      }
    );
}

/** Rewrite live same-site absolute URLs to local clone paths */
function rewriteAbsoluteSiteAssets(html, pageUrl, pageOrigin, sourcePath, downloaded, outputDir) {
  return html.replace(
    /((?:src|href|poster|data-src|data-lazy-src|data-original)\s*=\s*["'])(https?:\/\/[^"'?#]+)(["'])/gi,
    (match, pre, absUrl, post) => {
      if (!isSameSite(absUrl, pageOrigin)) return match;
      const rel = rewriteAssetRef(absUrl, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);
      return rel === absUrl ? match : pre + rel + post;
    }
  );
}

export async function postProcessClone({ outputDir, pageUrl, html, preSaved = new Map(), sourcePath = 'index.html' }) {
  html = sanitizeHtml(html);
  const pageOrigin = new URL(pageUrl).origin;
  const downloaded = new Map(preSaved);
  const pending = new Map();
  let totalSize = 0;
  let filesCount = downloaded.size;

  const queue = (refUrl, cssLocalPath = null) => {
    const abs = cssLocalPath
      ? resolveAbsolute(refUrl, localPathAssetBase(cssLocalPath, pageOrigin))
      : resolveAssetAbsolute(refUrl, pageUrl, pageOrigin);
    if (!abs || downloaded.has(abs) || isCrawlablePage(abs, pageOrigin)) return;
    const local = assetUrlToLocal(abs, pageOrigin);
    if (!local || local.endsWith('/') || pending.has(local)) return;
    pending.set(local, abs);
  };

  const extractFromCss = (css, cssPath, fromPage = false) => {
    const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let m;
    while ((m = urlRe.exec(css)) !== null) queue(m[2].trim(), fromPage ? null : cssPath);
    const importRe = /@import\s+(?:url\()?['"]?([^'");\s]+)['"]?\)?/gi;
    while ((m = importRe.exec(css)) !== null) queue(m[1].trim(), fromPage ? null : cssPath);
  };

  const $ = cheerio.load(html, { decodeEntities: false });

  $('img').each((_, el) => {
    const $el = $(el);
    ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-bg', 'data-background'].forEach((a) => {
      const v = $el.attr(a);
      if (v) queue(v);
    });
    const srcset = $el.attr('srcset');
    if (srcset) srcset.split(',').forEach((p) => queue(p.trim().split(/\s+/)[0]));
    const ds = $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-original');
    if (ds && !$el.attr('src')) $el.attr('src', ds);
    $el.removeAttr('loading');
  });

  $('link[href], script[src], source[src], video, audio[src], embed[src], iframe[src]').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();
    if (tag === 'link') queue($el.attr('href'));
    else if (tag === 'video') {
      queue($el.attr('src'));
      queue($el.attr('poster'));
    } else {
      queue($el.attr('src'));
    }
    const srcset = $el.attr('srcset');
    if (srcset) srcset.split(',').forEach((p) => queue(p.trim().split(/\s+/)[0]));
  });

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && isRootAssetPath(href)) queue(href);
  });

  $('link[rel*="stylesheet"], link[href$=".css"]').each((_, el) => queue($(el).attr('href')));

  $('style').each((_, el) => extractFromCss($(el).html() || '', sourcePath, true));
  $('[style]').each((_, el) => extractFromCss($(el).attr('style') || '', sourcePath, true));

  for (const cssFile of collectCssFiles(outputDir)) {
    const rel = path.relative(outputDir, cssFile).replace(/\\/g, '/');
    extractFromCss(fs.readFileSync(cssFile, 'utf8'), rel);
  }

  scanHtmlForAssetPaths($.html(), (local) => queue(local));

  while (pending.size > 0 && totalSize < MAX_TOTAL_SIZE) {
    const [localPath, absolute] = pending.entries().next().value;
    pending.delete(localPath);
    if (downloaded.has(absolute)) continue;

    const result = await downloadAsset(absolute, pageOrigin);
    if (!result) {
      downloaded.set(absolute, null);
      continue;
    }

    let finalPath = localPath;
    if (!path.extname(finalPath) && MIME_EXT[result.contentType]) {
      finalPath += MIME_EXT[result.contentType];
    }

    const fullPath = path.join(outputDir, finalPath);
    if (fs.existsSync(fullPath)) {
      const existing = fs.readFileSync(fullPath);
      if (!isHtmlPayload(existing) && isHtmlPayload(result.buf, result.contentType)) {
        downloaded.set(absolute, finalPath);
        downloaded.set(canonicalAssetKey(absolute), finalPath);
        continue;
      }
    }

    if (result.contentType.includes('css') || finalPath.endsWith('.css')) {
      const css = result.buf.toString('utf8');
      extractFromCss(css, finalPath);
      safeWriteFile(fullPath, css);
    } else {
      safeWriteFile(fullPath, result.buf);
    }

    downloaded.set(absolute, finalPath);
    downloaded.set(canonicalAssetKey(absolute), finalPath);
    totalSize += result.buf.length;
    filesCount++;
  }

  const rewriteHtmlRef = (refUrl) =>
    rewriteAssetRef(refUrl, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);

  const rewriteCss = (css, cssPath) =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, ref) => {
      const trimmed = ref.trim();
      if (isSkipped(trimmed)) return match;
      const local = rewriteCssUrlRef(trimmed, cssPath, pageOrigin, downloaded, outputDir);
      if (local === trimmed) return match;
      return `url(${quote}${local}${quote})`;
    });

  for (const cssFile of collectCssFiles(outputDir)) {
    const rel = path.relative(outputDir, cssFile).replace(/\\/g, '/');
    const css = fs.readFileSync(cssFile, 'utf8');
    fs.writeFileSync(cssFile, rewriteCss(css, rel));
  }

  const rewriteAttrs = (el, attrs, keepRemote = false) => {
    const $el = $(el);
    attrs.forEach((attr) => {
      const val = $el.attr(attr);
      if (!val) return;
      if (keepRemote && isRemoteVendor(val, pageOrigin)) return;
      const next = rewriteHtmlRef(val);
      if (next === val) return;
      $el.attr(attr, next);
      $el.removeAttr('integrity');
      $el.removeAttr('crossorigin');
    });
    rewriteSrcset($, $el, rewriteHtmlRef);
  };

  $('img, source, audio, embed, iframe').each((_, el) => {
    rewriteAttrs(el, ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-bg', 'data-background']);
  });
  $('link').each((_, el) => rewriteAttrs(el, ['href'], true));
  $('script').each((_, el) => rewriteAttrs(el, ['src'], true));
  $('video').each((_, el) => rewriteAttrs(el, ['src', 'poster']));
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && isRootAssetPath(href)) rewriteAttrs(el, ['href']);
  });

  $('style').each((_, el) => $(el).html(rewriteCss($(el).html() || '', sourcePath)));
  $('[style]').each((_, el) => $(el).attr('style', rewriteCss($(el).attr('style') || '', sourcePath)));

  $('base').remove();

  let htmlOut = $.html();
  htmlOut = rewriteAbsoluteSiteAssets(htmlOut, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);
  htmlOut = rewriteInlineRootAssets(htmlOut, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);
  htmlOut = finalizeLazyImages(htmlOut);
  const healed = await healMissingLocalAssets(outputDir, pageUrl, htmlOut, downloaded);
  filesCount += healed.count;
  totalSize += healed.bytes;
  if (healed.html) htmlOut = healed.html;

  return {
    html: htmlOut,
    filesCount,
    totalSize,
    downloaded,
  };
}

const ASSET_CONCURRENCY = 10;

function queueFromHtml(html, pageUrl, queueFromPage, extractFromCss) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('img').each((_, el) => {
    const $el = $(el);
    ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-bg', 'data-background'].forEach((a) => {
      const v = $el.attr(a);
      if (v) queueFromPage(v, pageUrl);
    });
    const srcset = $el.attr('srcset');
    if (srcset) srcset.split(',').forEach((p) => queueFromPage(p.trim().split(/\s+/)[0], pageUrl));
    const ds = $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-original');
    if (ds && !$el.attr('src')) $el.attr('src', ds);
    $el.removeAttr('loading');
  });

  $('link[href], script[src], source[src], video, audio[src], embed[src], iframe[src]').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();
    if (tag === 'link') queueFromPage($el.attr('href'), pageUrl);
    else if (tag === 'video') {
      queueFromPage($el.attr('src'), pageUrl);
      queueFromPage($el.attr('poster'), pageUrl);
    } else {
      queueFromPage($el.attr('src'), pageUrl);
    }
    const srcset = $el.attr('srcset');
    if (srcset) srcset.split(',').forEach((p) => queueFromPage(p.trim().split(/\s+/)[0], pageUrl));
  });

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && isRootAssetPath(href)) queueFromPage(href, pageUrl);
  });

  $('link[rel*="stylesheet"], link[href$=".css"]').each((_, el) => queueFromPage($(el).attr('href'), pageUrl));
  $('style').each((_, el) => extractFromCss($(el).html() || '', pageUrl, true));
  $('[style]').each((_, el) => extractFromCss($(el).attr('style') || '', pageUrl, true));
  scanHtmlForAssetPaths($.html(), (local) => queueFromPage(local, pageUrl));

  return $.html();
}

function rewritePageHtml(html, pageUrl, sourcePath, downloaded, outputDir) {
  const pageOrigin = new URL(pageUrl).origin;

  const rewriteHtmlRef = (refUrl) =>
    rewriteAssetRef(refUrl, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);

  const rewriteCss = (css, cssPath) =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, ref) => {
      const trimmed = ref.trim();
      if (isSkipped(trimmed)) return match;
      const local = rewriteCssUrlRef(trimmed, cssPath, pageOrigin, downloaded, outputDir);
      if (local === trimmed) return match;
      return `url(${quote}${local}${quote})`;
    });

  const $ = cheerio.load(sanitizeHtml(html), { decodeEntities: false });

  const rewriteAttrs = (el, attrs, keepRemote = false) => {
    const $el = $(el);
    attrs.forEach((attr) => {
      const val = $el.attr(attr);
      if (!val) return;
      if (keepRemote && isRemoteVendor(val, pageOrigin)) return;
      const next = rewriteHtmlRef(val);
      if (next === val) return;
      $el.attr(attr, next);
      $el.removeAttr('integrity');
      $el.removeAttr('crossorigin');
    });
    rewriteSrcset($, $el, rewriteHtmlRef);
  };

  $('img, source, audio, embed, iframe').each((_, el) => {
    rewriteAttrs(el, ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-bg', 'data-background']);
  });
  $('link').each((_, el) => rewriteAttrs(el, ['href'], true));
  $('script').each((_, el) => rewriteAttrs(el, ['src'], true));
  $('video').each((_, el) => rewriteAttrs(el, ['src', 'poster']));
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && isRootAssetPath(href)) rewriteAttrs(el, ['href']);
  });

  $('style').each((_, el) => $(el).html(rewriteCss($(el).html() || '', sourcePath)));
  $('[style]').each((_, el) => $(el).attr('style', rewriteCss($(el).attr('style') || '', sourcePath)));
  $('base').remove();

  let htmlOut = $.html();
  htmlOut = rewriteAbsoluteSiteAssets(htmlOut, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);
  htmlOut = rewriteInlineRootAssets(htmlOut, pageUrl, pageOrigin, sourcePath, downloaded, outputDir);
  htmlOut = finalizeLazyImages(htmlOut);
  return htmlOut;
}

function cleanupNestedPageAssets(outputDir, pages) {
  const rootDirs = ['assets', 'slick', 'external'];
  for (const { sourcePath } of pages) {
    const dir = path.posix.dirname(sourcePath);
    if (!dir || dir === '.') continue;
    for (const name of rootDirs) {
      const nested = path.join(outputDir, dir, name);
      const root = path.join(outputDir, name);
      if (fs.existsSync(nested) && fs.existsSync(root)) {
        fs.rmSync(nested, { recursive: true, force: true });
      }
    }
  }
}

/** Process all pages in one pass — download assets once, rewrite all HTML */
export async function postProcessAllPages({ outputDir, pages, preSaved = new Map() }) {
  if (!pages.length) return { pages: [], filesCount: 0, totalSize: 0 };

  const pageOrigin = new URL(pages[0].pageUrl).origin;
  const downloaded = new Map();
  for (const [url, local] of preSaved) {
    if (!local) continue;
    downloaded.set(url, local);
    downloaded.set(canonicalAssetKey(url), local);
  }
  const pending = new Map();
  let totalSize = 0;
  let filesCount = downloaded.size;

  const queueFromPage = (refUrl, pageUrl) => {
    if (!refUrl) return;
    let abs = resolveAssetAbsolute(refUrl, pageUrl, pageOrigin);
    // Images on another domain (a CDN) the capture browser didn't fetch: download them too.
    const ref = String(refUrl).trim().replace(/&amp;/g, '&');
    if (!abs && /^https?:\/\/[^?#]+\.(png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i.test(ref)) abs = ref;
    if (!abs || downloaded.has(abs) || isCrawlablePage(abs, pageOrigin)) return;
    const local = assetUrlToLocal(abs, pageOrigin);
    if (!local || local.endsWith('/') || pending.has(local)) return;
    pending.set(local, abs);
  };

  const queueFromCss = (refUrl, cssPath) => {
    if (!refUrl) return;
    const abs = resolveAssetAbsolute(refUrl, new URL(cssPath, `${pageOrigin}/`).href, pageOrigin)
      || resolveAbsolute(refUrl, localPathAssetBase(cssPath, pageOrigin));
    if (!abs || downloaded.has(abs) || isCrawlablePage(abs, pageOrigin)) return;
    const local = assetUrlToLocal(abs, pageOrigin);
    if (!local || local.endsWith('/') || pending.has(local)) return;
    pending.set(local, abs);
  };

  const extractFromCss = (css, cssPathOrPageUrl, fromPage = false) => {
    const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let m;
    while ((m = urlRe.exec(css)) !== null) {
      if (fromPage) queueFromPage(m[2].trim(), cssPathOrPageUrl);
      else queueFromCss(m[2].trim(), cssPathOrPageUrl);
    }
    const importRe = /@import\s+(?:url\()?['"]?([^'");\s]+)['"]?\)?/gi;
    while ((m = importRe.exec(css)) !== null) {
      if (fromPage) queueFromPage(m[1].trim(), cssPathOrPageUrl);
      else queueFromCss(m[1].trim(), cssPathOrPageUrl);
    }
  };

  const sanitized = pages.map((p) => ({
    ...p,
    html: queueFromHtml(sanitizeHtml(p.html), p.pageUrl, queueFromPage, extractFromCss),
  }));

  for (const cssFile of collectCssFiles(outputDir)) {
    const rel = path.relative(outputDir, cssFile).replace(/\\/g, '/');
    extractFromCss(fs.readFileSync(cssFile, 'utf8'), rel);
  }

  while (pending.size > 0 && totalSize < MAX_TOTAL_SIZE) {
    const batch = [...pending.entries()].slice(0, ASSET_CONCURRENCY);
    for (const [key] of batch) pending.delete(key);

    await Promise.all(batch.map(async ([localPath, absolute]) => {
      if (downloaded.has(absolute)) return;
      const result = await downloadAsset(absolute, pageOrigin);
      if (!result) { downloaded.set(absolute, null); return; }

      let finalPath = localPath;
      if (!path.extname(finalPath) && MIME_EXT[result.contentType]) {
        finalPath += MIME_EXT[result.contentType];
      }

      const fullPath = path.join(outputDir, finalPath);
      if (fs.existsSync(fullPath)) {
        const existing = fs.readFileSync(fullPath);
        if (!isHtmlPayload(existing) && isHtmlPayload(result.buf, result.contentType)) return;
      }

      if (result.contentType.includes('css') || finalPath.endsWith('.css')) {
        const css = result.buf.toString('utf8');
        extractFromCss(css, finalPath);
        safeWriteFile(fullPath, css);
      } else {
        safeWriteFile(fullPath, result.buf);
      }

      downloaded.set(absolute, finalPath);
      downloaded.set(canonicalAssetKey(absolute), finalPath);
      totalSize += result.buf.length;
      filesCount++;
    }));
  }

  cleanupNestedPageAssets(outputDir, pages);
  rewriteCloneCssFiles(outputDir, pageOrigin, downloaded);

  const rewritten = [];
  for (const { html, pageUrl, sourcePath } of sanitized) {
    rewritten.push({
      sourcePath,
      html: rewritePageHtml(html, pageUrl, sourcePath, downloaded, outputDir),
    });
  }

  await repairCorruptedAssets(outputDir, pageOrigin);

  return { pages: rewritten, filesCount, totalSize };
}

function rewriteCloneCssFiles(outputDir, pageOrigin, downloaded) {
  const rewriteCssOnDisk = (css, cssPath) =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, ref) => {
      const trimmed = ref.trim();
      if (isSkipped(trimmed)) return match;
      const local = rewriteCssUrlRef(trimmed, cssPath, pageOrigin, downloaded, outputDir);
      if (local === trimmed) return match;
      return `url(${quote}${local}${quote})`;
    });

  for (const cssFile of collectCssFiles(outputDir)) {
    const rel = path.relative(outputDir, cssFile).replace(/\\/g, '/');
    fs.writeFileSync(cssFile, rewriteCssOnDisk(fs.readFileSync(cssFile, 'utf8'), rel));
  }
}

/** Fix asset paths in an already-cloned folder (sub-page ../ paths + inline JS) */
export function repairCloneAssets(outputDir, siteOrigin) {
  const downloaded = new Map();

  function walkFiles(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const relPath = (rel ? `${rel}/${name}` : name).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) {
        walkFiles(full, relPath);
      } else if (!relPath.endsWith('.html')) {
        const abs = new URL(relPath, `${siteOrigin}/`).href;
        downloaded.set(abs, relPath);
        downloaded.set(canonicalAssetKey(abs), relPath);
      }
    }
  }

  if (!fs.existsSync(outputDir)) return 0;
  walkFiles(outputDir);

  const htmlFiles = [];
  function walkHtml(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const relPath = (rel ? `${rel}/${name}` : name).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) {
        if (/^(assets|external|cdn-cgi|slick|bootstrap)$/i.test(name)) continue;
        walkHtml(full, relPath);
      } else if (name === 'index.html' && !/^(assets|external)\//i.test(relPath)) {
        htmlFiles.push(relPath);
      }
    }
  }
  walkHtml(outputDir);

  rewriteCloneCssFiles(outputDir, siteOrigin, downloaded);

  for (const local of htmlFiles) {
    const slug = local === 'index.html' ? '/' : `/${local.replace(/\/index\.html$/, '/')}`;
    const pageUrl = new URL(slug, `${siteOrigin}/`).href;
    const fullPath = path.join(outputDir, local);
    let html = stripSlickRuntime(fs.readFileSync(fullPath, 'utf8'));
    html = rewritePageHtml(html, pageUrl, local, downloaded, outputDir);
    fs.writeFileSync(fullPath, html);
  }

  return htmlFiles.length;
}

/** Re-download files that were incorrectly saved as HTML (homepage redirect) */
export async function repairCorruptedAssets(outputDir, siteOrigin) {
  let fixed = 0;

  async function walk(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const relPath = (rel ? `${rel}/${name}` : name).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) {
        await walk(full, relPath);
        continue;
      }
      if (relPath.endsWith('.html')) continue;
      const buf = fs.readFileSync(full);
      if (!isHtmlPayload(buf)) continue;
      const abs = relPath.startsWith('external/')
        ? `https://${relPath.slice('external/'.length)}`
        : new URL(relPath, `${siteOrigin}/`).href;
      const result = await downloadAsset(abs, siteOrigin);
      if (!result) continue;
      safeWriteFile(full, result.buf);
      fixed++;
    }
  }

  if (!fs.existsSync(outputDir)) return 0;
  await walk(outputDir);
  return fixed;
}

async function healMissingLocalAssets(outputDir, pageUrl, html, downloaded) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const missing = new Map();

  const checkLocal = (localPath) => {
    if (!localPath || /^https?:/i.test(localPath) || localPath.startsWith('data:')) return;
    const clean = localPath.split('?')[0];
    if (fs.existsSync(path.join(outputDir, clean))) return;
    const abs = resolveAssetAbsolute(clean, pageUrl, new URL(pageUrl).origin);
    if (!abs) return;
    missing.set(clean, abs);
  };

  $('img[src], script[src], link[href], source[src], video[src], video[poster]').each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    checkLocal($(el).attr(tag === 'link' ? 'href' : 'src'));
  });

  scanHtmlForAssetPaths(html, checkLocal);

  for (const cssFile of collectCssFiles(outputDir)) {
    const css = fs.readFileSync(cssFile, 'utf8');
    const rel = path.relative(outputDir, cssFile).replace(/\\/g, '/');
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_, __, ref) => {
      const trimmed = ref.trim();
      if (!trimmed.startsWith('http') && !trimmed.startsWith('data:')) {
        const abs = resolveAbsolute(trimmed, new URL(rel, pageUrl).href);
        if (abs) {
          const local = assetUrlToLocal(abs, new URL(pageUrl).origin);
          if (local && !local.endsWith('/') && !fs.existsSync(path.join(outputDir, local))) missing.set(local, abs);
        }
      }
      return '';
    });
  }

  let count = 0;
  let bytes = 0;

  const pageOrigin = new URL(pageUrl).origin;
  for (const [localPath, absolute] of missing) {
    const result = await downloadAsset(absolute, pageOrigin);
    if (!result) continue;
    const fullPath = path.join(outputDir, localPath);
    safeWriteFile(fullPath, result.buf);
    downloaded.set(absolute, localPath);
    downloaded.set(canonicalAssetKey(absolute), localPath);
    count++;
    bytes += result.buf.length;
  }

  return { count, bytes, html: count ? $.html() : null };
}

const LOCAL_ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|ico|avif|css|js|mjs|woff2?|ttf|eot|otf|mp4|webm|mp3|mov)$/i;

function walkTextFiles(dir, rel, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const relPath = (rel ? `${rel}/${name}` : name).replace(/\\/g, '/');
    if (fs.statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'external') continue;
      walkTextFiles(full, relPath, out);
    } else if (/\.(html?|php|css)$/i.test(name)) {
      out.push(relPath);
    }
  }
}

/**
 * Download local files the clone references but never saved.
 * Tries the original path, then assets/ and nypublishers/assets/.
 */
export async function repairMissingLocalFiles(outputDir, siteOrigin) {
  const files = [];
  walkTextFiles(outputDir, '', files);
  const missing = new Map();

  const consider = (fromRel, ref) => {
    if (!ref) return;
    const clean = ref.trim().split('?')[0].split('#')[0];
    if (!clean || /^(data:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(clean)) return;
    if (!LOCAL_ASSET_EXT.test(clean)) return;
    const fromDir = path.posix.dirname(fromRel);
    const rel = path.posix.normalize(clean.startsWith('/') ? clean.slice(1) : path.posix.join(fromDir, clean));
    if (!rel || rel.startsWith('..') || rel.includes('/../')) return;
    if (fs.existsSync(path.join(outputDir, rel))) return;
    missing.set(rel, rel);
  };

  for (const rel of files) {
    const text = fs.readFileSync(path.join(outputDir, rel), 'utf8');
    const attrRe = /(?:src|href|poster|data-src|data-lazy-src)=["']([^"']+)["']/gi;
    let m;
    while ((m = attrRe.exec(text)) !== null) consider(rel, m[1]);
    const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    while ((m = urlRe.exec(text)) !== null) consider(rel, m[2]);
  }

  let saved = 0;
  const queue = [...missing.keys()];
  const origin = siteOrigin.replace(/\/$/, '');

  async function fetchOne(rel) {
    const candidates = [
      `${origin}/${rel}`,
      `${origin}/assets/${rel}`,
      `${origin}/nypublishers/assets/${rel}`,
      `${origin}/nypublishers/${rel}`,
    ];
    for (const url of candidates) {
      const result = await downloadAsset(url, origin);
      if (!result) continue;
      safeWriteFile(path.join(outputDir, rel), result.buf);
      saved++;
      return;
    }
  }

  const batchSize = 4;
  for (let i = 0; i < queue.length; i += batchSize) {
    await Promise.all(queue.slice(i, i + batchSize).map(fetchOne));
  }
  return saved;
}
