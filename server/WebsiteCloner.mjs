import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  MAX_PAGES,
  normalizePageUrl,
  normalizeCrawlUrl,
  pageUrlToLocal,
  buildPageMap,
  canonicalPageKey,
  rewritePageLinks,
  rewriteFormActions,
  crawlSitePages,
  includeOriginalThankYou,
  ensureCrawlFetchUrl,
  fetchWithRetry,
  safeWriteFile,
} from './crawl-utils.mjs';
import { postProcessAllPages } from './clone-postprocess.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_TOTAL_SIZE = 150 * 1024 * 1024;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MIME_EXT = {
  'text/css': '.css',
  'text/javascript': '.js',
  'application/javascript': '.js',
  'application/x-javascript': '.js',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
  'font/ttf': '.ttf',
  'font/otf': '.otf',
  'application/font-woff': '.woff',
  'application/font-woff2': '.woff2',
  'video/mp4': '.mp4',
};

function isSkipped(url) {
  return !url || /^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(url.trim());
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    fs.statSync(p).isDirectory() ? removeDir(p) : fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function hashStr(s) {
  return crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
}

/** Resolve a reference URL relative to a source file path on the site */
function resolveLocalPath(refUrl, sourceFilePath, pageUrl) {
  if (isSkipped(refUrl)) return null;

  const absolute = new URL(refUrl, pageUrl);

  if (refUrl.startsWith('http://') || refUrl.startsWith('https://') || refUrl.startsWith('//')) {
    // Absolute URL → mirror pathname under site or external/
    let local = absolute.pathname.replace(/^\//, '');
    if (!local) local = 'index.html';
    if (absolute.search) {
      const ext = path.extname(local);
      const base = ext ? local.slice(0, -ext.length) : local;
      local = `${base}_${hashStr(absolute.search)}${ext || ''}`;
    }
    // External domain → prefix with external/hostname/
    const pageOrigin = new URL(pageUrl).origin;
    if (absolute.origin !== pageOrigin) {
      local = path.posix.join('external', absolute.hostname, local);
    }
    return local;
  }

  // Relative to source file
  const sourceDir = path.posix.dirname(sourceFilePath || 'index.html');
  let local = path.posix.normalize(path.posix.join(sourceDir, refUrl));
  // A reference that climbs above the clone root (e.g. "../../../etc/passwd")
  // must not be allowed to write outside outputDir — mirror it like an
  // external asset instead of following the traversal.
  if (local.startsWith('..') || path.posix.isAbsolute(local)) {
    const safeName = local.replace(/^[./]+/, '').replace(/\.\./g, '_') || `asset_${hashStr(refUrl)}`;
    local = path.posix.join('external', '_outside', safeName);
  }
  return local;
}

function resolveAbsolute(refUrl, pageUrl) {
  if (isSkipped(refUrl)) return null;
  try {
    return new URL(refUrl, pageUrl).href;
  } catch {
    return null;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export class WebsiteCloner {
  constructor(url, folderName) {
    this.pageUrl = normalizePageUrl(url);
    this.pageOrigin = new URL(this.pageUrl).origin;
    this.outputDir = path.join(ROOT, 'cloned', folderName);
    /** absoluteUrl → localPath */
    this.downloaded = new Map();
    /** localPath → absoluteUrl */
    this.pending = new Map();
    this.totalSize = 0;
    this.filesCount = 0;

    if (fs.existsSync(this.outputDir)) removeDir(this.outputDir);
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  queueAsset(refUrl, sourceFilePath) {
    if (isSkipped(refUrl)) return;
    const localPath = resolveLocalPath(refUrl, sourceFilePath, this.pageUrl);
    const baseHref = sourceFilePath === 'index.html'
      ? this.pageUrl
      : new URL(sourceFilePath, this.pageUrl).href;
    const absolute = resolveAbsolute(refUrl, baseHref);
    if (!localPath || !absolute) return;
    if (!this.pending.has(localPath) && !this.downloaded.has(absolute)) {
      this.pending.set(localPath, absolute);
    }
  }

  extractUrlsFromCss(css, cssLocalPath) {
    const cssPageUrl = new URL(cssLocalPath, this.pageUrl).href;

    // url(...)
    const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let m;
    while ((m = urlRe.exec(css)) !== null) {
      this.queueAsset(m[2].trim(), cssLocalPath);
    }

    // @import
    const importRe = /@import\s+(?:url\()?['"]?([^'");\s]+)['"]?\)?/gi;
    while ((m = importRe.exec(css)) !== null) {
      this.queueAsset(m[1].trim(), cssLocalPath);
    }
  }

  scanHtml(html, sourceFile = 'index.html') {
    const $ = cheerio.load(html, { decodeEntities: false });

    const attrs = [
      ['img', ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-bg', 'data-background']],
      ['source', ['src', 'srcset']],
      ['video', ['src', 'poster']],
      ['audio', ['src']],
      ['script', ['src']],
      ['embed', ['src']],
      ['iframe', ['src']],
      ['input', ['src']],
      ['use', ['href', 'xlink:href']],
      ['image', ['href', 'xlink:href']],
    ];

    for (const [tag, attrList] of attrs) {
      $(tag).each((_, el) => {
        for (const attr of attrList) {
          const val = $(el).attr(attr);
          if (!val) continue;
          if (attr === 'srcset') {
            val.split(',').forEach((part) => {
              const url = part.trim().split(/\s+/)[0];
              this.queueAsset(url, sourceFile);
            });
          } else {
            this.queueAsset(val, sourceFile);
          }
        }
      });
    }

    $('link').each((_, el) => {
      const rel = ($(el).attr('rel') || '').toLowerCase();
      const href = $(el).attr('href');
      if (!href) return;
      if (
        rel.includes('stylesheet') ||
        rel.includes('icon') ||
        rel === 'preload' ||
        rel === 'prefetch' ||
        rel === 'apple-touch-icon' ||
        href.endsWith('.css')
      ) {
        this.queueAsset(href, sourceFile);
      }
    });

    $('style').each((_, el) => {
      const content = $(el).html() || '';
      this.extractUrlsFromCss(content, sourceFile);
    });

    $('[style]').each((_, el) => {
      const style = $(el).attr('style') || '';
      this.extractUrlsFromCss(style, sourceFile);
    });

    // Lazy-load: copy data-src → src so images show without JS
    $('img[data-src]').each((_, el) => {
      const dataSrc = $(el).attr('data-src');
      if (dataSrc && !$(el).attr('src')) $(el).attr('src', dataSrc);
    });
    $('img[data-lazy-src]').each((_, el) => {
      const v = $(el).attr('data-lazy-src');
      if (v) $(el).attr('src', v);
    });
    $('img[data-original]').each((_, el) => {
      const v = $(el).attr('data-original');
      if (v) $(el).attr('src', v);
    });

    $('base').remove();

    return $.html();
  }

  async fetchAsset(absoluteUrl) {
    const fetchUrl = ensureCrawlFetchUrl(absoluteUrl);
    try {
      const res = await fetchWithRetry(fetchUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: `${this.pageOrigin}/`,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      }, 1);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_FILE_SIZE) return null;
      const head = buf.slice(0, 128).toString('utf8').trim().toLowerCase();
      if (contentType.includes('text/html') || head.startsWith('<!doctype') || head.startsWith('<html')) {
        return null;
      }
      return { buf, contentType };
    } catch {
      return null;
    }
  }

  ensureExt(localPath, contentType) {
    const ext = path.extname(localPath);
    if (ext && ext !== '.bin') return localPath;
    const mimeExt = MIME_EXT[contentType];
    if (mimeExt) return localPath + mimeExt;
    return localPath;
  }

  async downloadAll() {
    while (this.pending.size > 0) {
      if (this.totalSize >= MAX_TOTAL_SIZE) break;

      const [localPath, absolute] = this.pending.entries().next().value;
      this.pending.delete(localPath);

      if (this.downloaded.has(absolute)) continue;

      const result = await this.fetchAsset(absolute);
      if (!result) {
        this.downloaded.set(absolute, null);
        continue;
      }

      let finalPath = this.ensureExt(localPath, result.contentType);
      this.totalSize += result.buf.length;

      const fullPath = path.join(this.outputDir, finalPath);
      const resolvedOutputDir = path.resolve(this.outputDir);
      if (!path.resolve(fullPath).startsWith(resolvedOutputDir + path.sep)) {
        continue; // refuse to write outside the clone folder
      }
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      let content = result.buf;

      // If CSS, scan for more assets
      if (result.contentType.includes('css') || finalPath.endsWith('.css')) {
        const css = content.toString('utf-8');
        this.extractUrlsFromCss(css, finalPath);
        fs.writeFileSync(fullPath, css);
      } else {
        fs.writeFileSync(fullPath, content);
      }

      this.downloaded.set(absolute, finalPath);
      this.filesCount++;
    }
  }

  rewriteHtml(html, sourceFile = 'index.html') {
    const $ = cheerio.load(html, { decodeEntities: false });

    const rewriteAttr = (el, attr) => {
      const val = $(el).attr(attr);
      if (!val || isSkipped(val)) return;
      const baseHref = new URL(sourceFile, this.pageUrl).href;
      const abs = resolveAbsolute(val, baseHref);
      if (!abs) return;
      const local = this.downloaded.get(abs);
      if (local) {
        const rel = path.posix.relative(path.posix.dirname(sourceFile), local).replace(/\\/g, '/');
        $(el).attr(attr, rel || local);
      }
    };

    $('*[src], link[href], use[href], image[href]').each((_, el) => {
      const tag = el.tagName?.toLowerCase();
      if (tag === 'link') rewriteAttr(el, 'href');
      else rewriteAttr(el, 'src');
      if (tag === 'use' || tag === 'image') rewriteAttr(el, 'href');
    });

    $('img, source').each((_, el) => {
      ['src', 'data-src', 'data-lazy-src', 'data-original'].forEach((a) => rewriteAttr(el, a));
      const srcset = $(el).attr('srcset');
      if (srcset) {
        const baseHref = new URL(sourceFile, this.pageUrl).href;
        const newParts = srcset.split(',').map((part) => {
          const [url, ...desc] = part.trim().split(/\s+/);
          const abs = resolveAbsolute(url, baseHref);
          const local = abs ? this.downloaded.get(abs) : null;
          if (local) {
            const rel = path.posix.relative(path.posix.dirname(sourceFile), local).replace(/\\/g, '/');
            return (rel || local) + (desc.length ? ' ' + desc.join(' ') : '');
          }
          return url + (desc.length ? ' ' + desc.join(' ') : '');
        });
        $(el).attr('srcset', newParts.join(', '));
      }
    });

    $('style').each((_, el) => {
      let css = $(el).html() || '';
      css = this.rewriteCssContent(css, sourceFile);
      $(el).html(css);
    });

    $('[style]').each((_, el) => {
      let style = $(el).attr('style') || '';
      style = this.rewriteCssContent(style, sourceFile);
      $(el).attr('style', style);
    });

    return $.html();
  }

  rewriteCssContent(css, cssLocalPath) {
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, refUrl) => {
      const trimmed = refUrl.trim();
      if (isSkipped(trimmed)) return match;
      const abs = resolveAbsolute(trimmed, new URL(cssLocalPath, this.pageUrl).href);
      if (!abs) return match;
      const local = this.downloaded.get(abs);
      if (!local) return match;
      // Rewrite to path relative to this CSS file
      const cssDir = path.posix.dirname(cssLocalPath);
      const rel = path.posix.relative(cssDir, local);
      return `url(${quote}${rel.replace(/\\/g, '/')}${quote})`;
    });
  }

  async rewriteDownloadedCss() {
    for (const [, localPath] of this.downloaded) {
      if (!localPath || !localPath.endsWith('.css')) continue;
      const fullPath = path.join(this.outputDir, localPath);
      if (!fs.existsSync(fullPath)) continue;
      let css = fs.readFileSync(fullPath, 'utf-8');
      css = this.rewriteCssContent(css, localPath);
      fs.writeFileSync(fullPath, css);
    }
  }

  async fetchPage(url) {
    try {
      const res = await fetchWithRetry(ensureCrawlFetchUrl(url), {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const html = await res.text();
      return { html, finalUrl: res.url };
    } catch (err) {
      throw new Error(err.message || 'Could not fetch the website. Check if the URL is accessible.');
    }
  }

  async clone(options = {}) {
    const maxPages = options.maxPages || MAX_PAGES;
    const home = await this.fetchPage(this.pageUrl);

    this.pageOrigin = new URL(home.finalUrl).origin;
    this.pageUrl = home.finalUrl;

    const pageEntries = await crawlSitePages({
      homeHtml: home.html,
      homeFinalUrl: home.finalUrl,
      origin: this.pageOrigin,
      maxPages,
    });

    const pageMap = buildPageMap([...pageEntries.keys()], this.pageOrigin);
    if (maxPages === 1) {
      for (const key of pageMap.keys()) pageMap.set(key, 'index.html');
    }

    await includeOriginalThankYou({
      pageEntries,
      pageMap,
      origin: this.pageOrigin,
      homeHtml: home.html,
      homeFinalUrl: home.finalUrl,
    });

    const pagesForProcess = [...pageEntries.entries()].map(([crawlUrl, { html, finalUrl }]) => ({
      html,
      pageUrl: finalUrl,
      sourcePath: pageMap.get(canonicalPageKey(crawlUrl)) || pageUrlToLocal(finalUrl, this.pageOrigin) || 'index.html',
    }));

    const { pages: processed, filesCount, totalSize } = await postProcessAllPages({
      outputDir: this.outputDir,
      pages: pagesForProcess,
      preSaved: new Map(),
    });

    for (const { sourcePath, html } of processed) {
      const crawlUrl = [...pageEntries.keys()].find((url) => {
        const local = pageUrlToLocal(pageEntries.get(url)?.finalUrl || url, this.pageOrigin);
        return local === sourcePath;
      });
      const finalUrl = (crawlUrl && pageEntries.get(crawlUrl)?.finalUrl) || home.finalUrl;

      let finalHtml = rewritePageLinks(html, finalUrl, this.pageOrigin, pageMap, sourcePath);
      finalHtml = rewriteFormActions(finalHtml, finalUrl, this.pageOrigin, pageMap, sourcePath);

      const fullPath = path.join(this.outputDir, sourcePath);
      safeWriteFile(fullPath, finalHtml);
    }

    return {
      folder: path.basename(this.outputDir),
      filesDownloaded: filesCount,
      pagesCloned: processed.length,
      totalSize: formatSize(totalSize),
    };
  }
}
