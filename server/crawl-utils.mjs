import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const MAX_PAGES = Number(process.env.CLONER_MAX_PAGES) || 50;
export const MAX_CRAWL_DEPTH = 3;
export const FETCH_CONCURRENCY = 8;

const NON_PAGE_PREFIX = /^\/(cdn-cgi|wp-admin|wp-json|api)\//i;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SKIP_EXT = /\.(pdf|zip|rar|tar|gz|png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot|mp4|mp3|webm|xml|json|txt|docx?|xlsx?)$/i;

function hashStr(s) {
  return crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
}

/** Convert asset URL to local file path. Returns null for page-directory URLs. */
export function assetUrlToLocal(resourceUrl, pageOrigin) {
  try {
    const u = new URL(resourceUrl);
    let pathname = u.pathname;

    // Directory-style page URLs (e.g. /book-printing/) are not asset files
    if (pathname.endsWith('/') && pathname !== '/') return null;
    if (pathname === '/') return null;

    let local = pathname.replace(/^\//, '');
    if (!local) return null;

    // Extensionless paths like /book-writing are page routes, not assets
    const ext = path.extname(local);
    if (!ext) {
      const isAssetDir = /(?:^|\/)(assets|static|media|images|img|css|js|fonts|uploads|wp-content|wp-includes|cdn|slick|bootstrap)\//i.test(local);
      if (!isAssetDir) return null;
    }

    if (u.search) {
      const ext = path.extname(local);
      const base = ext ? local.slice(0, -ext.length) : local;
      local = `${base}_${hashStr(u.search)}${ext}`;
    }

    if (!isSameSite(u.href, pageOrigin)) {
      local = path.posix.join('external', u.hostname, local);
    }

    return local;
  } catch {
    return null;
  }
}

/** Write a file safely — never write to a directory path */
export function safeWriteFile(fullPath, content) {
  let target = fullPath.replace(/[/\\]+$/, '');

  // Paths without a file extension should resolve to index.html inside
  if (!path.extname(path.posix.basename(target))) {
    target = path.join(target, 'index.html');
  }

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

/** Remove invalid entries from a pre-saved asset map */
export function sanitizeSavedMap(saved) {
  const clean = new Map();
  for (const [url, local] of saved) {
    if (!local || local.endsWith('/')) continue;
    if (!path.extname(path.posix.basename(local))) continue;
    clean.set(url, local);
  }
  return clean;
}

export function normalizePageUrl(url) {
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

export function isSkippedLink(url) {
  return !url || /^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(url.trim());
}

/** Compare origins — treats www/non-www as the same site */
export function siteHostKey(originOrUrl) {
  try {
    const u = new URL(originOrUrl);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isSameSite(url, origin) {
  try {
    const a = siteHostKey(typeof url === 'string' && url.includes('://') ? url : new URL(url, origin).href);
    const b = siteHostKey(origin);
    return Boolean(a && b && a === b);
  } catch {
    return false;
  }
}

const ROOT_ASSET_PREFIX = /^(assets|external|slick|bootstrap|static|media|images|img|fonts|uploads|wp-content|wp-includes|cdn|cdn-cgi)\//i;

export function isRootAssetPath(refUrl) {
  if (!refUrl || isSkippedLink(refUrl)) return false;
  if (/^https?:/i.test(refUrl)) return false;
  const clean = refUrl.trim().replace(/^\.\//, '').split(/[?#]/)[0];
  return ROOT_ASSET_PREFIX.test(clean)
    || /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|eot|mp4|webm|pdf|avif)$/i.test(clean);
}

export function relativeAssetFromPage(sourceLocalPath, assetLocalPath) {
  const sourceDir = path.posix.dirname(sourceLocalPath);
  if (!sourceDir || sourceDir === '.') return assetLocalPath;
  const rel = path.posix.relative(sourceDir, assetLocalPath).replace(/\\/g, '/');
  return rel || assetLocalPath;
}

/** Normalize asset URL for map lookups (www/non-www, strip hash) */
export function canonicalAssetKey(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace(/^www\./i, '');
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

/** Resolve a relative asset URL — shared folders (assets/, external/) use site root */
export function resolveAssetAbsolute(refUrl, pageUrl, pageOrigin) {
  if (!refUrl || isSkippedLink(refUrl)) return null;
  try {
    if (/^https?:/i.test(refUrl.trim())) {
      const abs = refUrl.trim();
      return isSameSite(abs, pageOrigin) ? abs : null;
    }
    const clean = refUrl.trim().replace(/^\.\//, '').replace(/^\//, '');
    if (ROOT_ASSET_PREFIX.test(clean)) {
      return new URL(clean, `${pageOrigin}/`).href;
    }
    return new URL(refUrl, pageAssetBase(pageUrl)).href;
  } catch {
    return null;
  }
}

/** Base URL for resolving relative asset refs on an HTML page or saved asset file */
export function pageAssetBase(pageUrl) {
  try {
    const u = new URL(pageUrl);
    let pathname = u.pathname;
    const baseName = path.posix.basename(pathname);
    if (baseName.includes('.') && !pathname.endsWith('/')) {
      pathname = path.posix.dirname(pathname);
    }
    if (!pathname.endsWith('/')) pathname += '/';
    return `${u.origin}${pathname}`;
  } catch {
    return pageUrl;
  }
}

/** Base URL for resolving url() refs inside a saved CSS file path */
export function localPathAssetBase(localPath, origin) {
  const dir = path.posix.dirname(localPath.replace(/\\/g, '/'));
  return `${origin}/${dir}/`;
}

/** Convert a page URL to a local file path inside the clone folder */
export function pageUrlToLocal(pageUrl, origin) {
  try {
    const u = new URL(pageUrl);
    if (!isSameSite(u.href, origin)) return null;

    let pathname = u.pathname;
    if (pathname.endsWith('/')) pathname += 'index.html';
    else if (!/\.html?$/i.test(pathname)) pathname += '/index.html';

    let local = pathname.replace(/^\//, '');
    if (local === 'index.html') return 'index.html';

    if (u.search) {
      const ext = path.extname(local);
      const base = ext ? local.slice(0, -ext.length) : local;
      local = `${base}_${hashStr(u.search)}${ext || '.html'}`;
    }

    return local;
  } catch {
    return null;
  }
}

/** Check if a URL is a crawlable same-origin HTML page */
export function isCrawlablePage(url, origin) {
  if (isSkippedLink(url)) return false;
  try {
    const u = new URL(url);
    if (!isSameSite(u.href, origin)) return false;
    const p = u.pathname.toLowerCase();
    if (SKIP_EXT.test(p)) return false;
    if (NON_PAGE_PREFIX.test(p)) return false;
    if (/email-protection/i.test(p)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Normalize URL for dedup (strip hash, trailing slash) */
export function normalizeCrawlUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    let href = u.href;
    if (u.pathname !== '/' && href.endsWith('/')) href = href.slice(0, -1);
    return href;
  } catch {
    return null;
  }
}

/** Extract same-origin page links from HTML */
export function extractInternalLinks(html, pageUrl, origin) {
  const links = new Set();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (isSkippedLink(href)) continue;
    try {
      const abs = new URL(href, pageUrl).href;
      if (isCrawlablePage(abs, origin)) {
        links.add(normalizeCrawlUrl(abs));
      }
    } catch { /* skip */ }
  }
  return links;
}

/** Canonical key for page URL lookups (aligned with normalizeCrawlUrl) */
export function canonicalPageKey(url) {
  const normalized = normalizeCrawlUrl(url);
  if (!normalized) return null;
  try {
    const u = new URL(normalized);
    if (u.pathname.endsWith('/index.html')) {
      u.pathname = u.pathname.slice(0, -'/index.html'.length) || '/';
    }
    u.hash = '';
    let href = u.href;
    if (u.pathname !== '/' && href.endsWith('/')) href = href.slice(0, -1);
    return href;
  } catch {
    return normalized;
  }
}

function lookupPageLocal(absUrl, pageMap) {
  const key = canonicalPageKey(absUrl);
  if (!key) return null;
  return pageMap.get(key) || null;
}

/** Resolve internal page link href to absolute URL (root-relative nav paths) */
export function resolvePageLinkAbsolute(href, pageUrl, origin) {
  if (isSkippedLink(href)) return null;
  try {
    let clean = href.trim();
    if (clean.startsWith('./')) clean = clean.slice(2);
    if (clean.startsWith('/')) {
      return new URL(clean, origin).href;
    }
    // Site nav uses root-relative slugs (book-shelf/, about-us/) — not page-relative
    if (!clean.startsWith('../')) {
      return new URL(clean, `${origin}/`).href;
    }
    return new URL(clean, pageAssetBase(pageUrl)).href;
  } catch {
    return null;
  }
}

/** Build a map of absolute page URL → local file path */
export function buildPageMap(pageUrls, origin) {
  const map = new Map();
  for (const url of pageUrls) {
    const local = pageUrlToLocal(url, origin);
    const key = canonicalPageKey(url);
    if (local && key) map.set(key, local);
  }
  return map;
}

/** Rewrite internal page links in HTML to local paths */
export function rewritePageLinks(html, pageUrl, origin, pageMap, sourceLocalPath = null) {
  const sourceLocal = sourceLocalPath || lookupPageLocal(pageUrl, pageMap) || 'index.html';
  const sourceDir = path.posix.dirname(sourceLocal);

  return html.replace(
    /(<a\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'])/gi,
    (match, pre, href, post) => {
      if (isSkippedLink(href)) return match;
      try {
        const abs = resolvePageLinkAbsolute(href, pageUrl, origin);
        if (!abs || !isCrawlablePage(abs, origin)) return match;
        const local = lookupPageLocal(abs, pageMap) || pageUrlToLocal(abs, origin);
        if (local) {
          let rel = path.posix.relative(sourceDir, local).replace(/\\/g, '/');
          if (rel === '') rel = 'index.html';
          return pre + rel + post;
        }
      } catch { /* keep original */ }
      return match;
    }
  );
}

const NAV_PRIORITY = /(contact|about|portfolio|testimonial|privacy|terms|home)/i;

/** Prefer nav/utility pages, then shallow URLs */
export function prioritizeLinks(links) {
  return [...links].sort((a, b) => {
    try {
      const pathA = new URL(a).pathname;
      const pathB = new URL(b).pathname;
      const navA = NAV_PRIORITY.test(pathA) ? 0 : 1;
      const navB = NAV_PRIORITY.test(pathB) ? 0 : 1;
      if (navA !== navB) return navA - navB;
      const depthA = pathA.split('/').filter(Boolean).length;
      const depthB = pathB.split('/').filter(Boolean).length;
      return depthA - depthB;
    } catch {
      return 0;
    }
  });
}

const THANK_YOU_PATHS = [
  '/thank-you/',
  '/thankyou/',
  '/thanks/',
  '/thank-you.html',
  '/thankyou.html',
  '/thank-you.php',
  '/thanks-you/',
];
const THANK_YOU_MESSAGE = 'Thank you for your response. We will contact you as soon as possible!';

async function readHtml(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (type && !/html/i.test(type)) return null;
  return { html: await res.text(), finalUrl: res.url || url };
}

function withSuccessMessage(url) {
  const next = new URL(url);
  next.searchParams.set('successMsg', THANK_YOU_MESSAGE);
  return next.href;
}

function embedSuccessHeading(html) {
  if (!html || !html.includes(THANK_YOU_MESSAGE) || html.includes('data-success-msg')) return html;
  let next = html.replace(THANK_YOU_MESSAGE, `<span data-success-msg>${THANK_YOU_MESSAGE}</span>`);
  if (next.includes("get('successMsg')")) return next;
  const script = `<script>
(function () {
  var message = new URLSearchParams(location.search).get('successMsg');
  var slot = document.querySelector('[data-success-msg]');
  if (message && slot) slot.textContent = message;
})();
</script>`;
  return next.includes('</body>') ? next.replace('</body>', `${script}</body>`) : `${next}\n${script}`;
}

async function thankYouHtmlWithMessage(url) {
  const plain = await readHtml(url);
  if (!plain) return null;
  let html = plain.html;
  let finalUrl = plain.finalUrl;
  if (!html.includes(THANK_YOU_MESSAGE)) {
    try {
      const rich = await readHtml(withSuccessMessage(finalUrl));
      if (rich && rich.html.includes(THANK_YOU_MESSAGE)) {
        html = rich.html;
        finalUrl = rich.finalUrl.split('?')[0];
      }
    } catch { /* keep the page without the query */ }
  }
  return { html: embedSuccessHeading(html), finalUrl };
}

function looksLikeThankYouPage(html) {
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
  const heading = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
  const plain = `${title} ${heading.replace(/<[^>]+>/g, ' ')}`;
  if (/thank/i.test(plain)) return true;
  return /thanksyou_sec|thank-you-page|class=["'][^"']*thank[-_ ]?you/i.test(html);
}

/**
 * Thank-you pages are usually not linked in the menu. Pull the original
 * page into the clone so every project keeps that route and design.
 */
export async function includeOriginalThankYou({ pageEntries, pageMap, origin, homeHtml, homeFinalUrl }) {
  const alreadyKey = [...pageEntries.keys()].find((url) => {
    try { return /thank/i.test(new URL(url).pathname); } catch { return false; }
  });
  if (alreadyKey) {
    const current = pageEntries.get(alreadyKey);
    const upgraded = await thankYouHtmlWithMessage(current.finalUrl || alreadyKey);
    if (upgraded && looksLikeThankYouPage(upgraded.html)) {
      const finalUrl = upgraded.finalUrl || current.finalUrl;
      pageEntries.set(alreadyKey, { ...current, html: upgraded.html, finalUrl });
      const local = pageUrlToLocal(finalUrl, origin);
      if (pageMap && local && local !== 'index.html') pageMap.set(alreadyKey, local);
      return true;
    }
  }

  const candidates = [];
  const linkRe = /href\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = linkRe.exec(homeHtml || '')) !== null) {
    if (!/thank/i.test(match[1])) continue;
    try {
      const abs = new URL(match[1], homeFinalUrl || origin).href;
      if (new URL(abs).origin === new URL(origin).origin) candidates.push(abs);
    } catch { /* skip */ }
  }
  for (const pathName of THANK_YOU_PATHS) {
    try { candidates.push(new URL(pathName, origin).href); } catch { /* skip */ }
  }

  const seen = new Set();
  for (const url of candidates) {
    const norm = normalizeCrawlUrl(url);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    try {
      const loaded = await thankYouHtmlWithMessage(url);
      if (!loaded || !looksLikeThankYouPage(loaded.html)) continue;
      const html = loaded.html;
      const finalUrl = loaded.finalUrl;
      const key = canonicalPageKey(finalUrl);
      if (!key || pageEntries.has(key)) continue;
      const local = pageUrlToLocal(finalUrl, origin);
      if (!local || local === 'index.html') continue;
      pageEntries.set(key, { html, finalUrl });
      if (pageMap) pageMap.set(key, local);
      return true;
    } catch { /* try the next candidate */ }
  }
  return false;
}

/** BFS crawl: discover + fetch pages until maxPages or queue empty */
export async function crawlSitePages({ homeHtml, homeFinalUrl, origin, maxPages = MAX_PAGES }) {
  const pageEntries = new Map();
  const homeNorm = normalizeCrawlUrl(homeFinalUrl);
  if (!homeNorm) return pageEntries;

  pageEntries.set(homeNorm, { html: homeHtml, finalUrl: homeFinalUrl });

  const seen = new Set([homeNorm]);
  let frontier = [...extractInternalLinks(homeHtml, homeFinalUrl, origin)].filter((u) => u && !seen.has(u));

  while (pageEntries.size < maxPages && frontier.length > 0) {
    const remaining = maxPages - pageEntries.size;
    const batch = prioritizeLinks(frontier).slice(0, remaining);
    const batchSet = new Set(batch);
    frontier = frontier.filter((u) => !batchSet.has(u));

    const fetched = await fetchPagesParallel(batch, batch.length);

    for (const sub of fetched) {
      const norm = normalizeCrawlUrl(sub.url);
      if (!norm || seen.has(norm)) continue;

      const finalNorm = normalizeCrawlUrl(sub.finalUrl);
      // Skip alias URLs that redirect to an already-cloned page (e.g. /e-book -> homepage)
      if (finalNorm && finalNorm !== norm && pageEntries.has(finalNorm)) {
        seen.add(norm);
        continue;
      }

      seen.add(norm);
      pageEntries.set(norm, { html: sub.html, finalUrl: sub.finalUrl });

      if (pageEntries.size >= maxPages) break;

      for (const link of extractInternalLinks(sub.html, sub.finalUrl, origin)) {
        if (link && !seen.has(link) && !frontier.includes(link)) {
          frontier.push(link);
        }
      }
    }
  }

  return pageEntries;
}

/** Fetch with retries — avoids generic "fetch failed" on slow/unstable networks */
export async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: options.signal || AbortSignal.timeout(30000),
      });
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  const msg = lastErr?.message || 'Network request failed';
  throw new Error(
    msg === 'fetch failed'
      ? `Could not reach ${url}. Check the URL, your internet connection, and try again.`
      : `Could not reach ${url}: ${msg}`
  );
}

/** Directory-style page URLs need a trailing slash on many PHP/Apache sites */
export function ensureCrawlFetchUrl(url) {
  try {
    const u = new URL(url);
    const p = u.pathname;
    if (p !== '/' && !p.endsWith('/') && !/\.\w{2,5}$/i.test(p)) {
      u.pathname = `${p}/`;
      return u.href;
    }
  } catch { /* keep original */ }
  return url;
}

/** Fast parallel HTML fetch for sub-pages (no browser) */
export async function fetchPagesParallel(urls, maxCount = MAX_PAGES - 1, concurrency = FETCH_CONCURRENCY) {
  const results = [];
  const queue = prioritizeLinks(urls).slice(0, maxCount);

  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const i = idx++;
      const url = queue[i];
      const fetchUrl = ensureCrawlFetchUrl(url);
      try {
        const res = await fetchWithRetry(fetchUrl, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
        }, 1);
        if (!res.ok) continue;
        const html = await res.text();
        const requestKey = normalizeCrawlUrl(url);
        if (!requestKey) continue;
        const finalUrl = normalizeCrawlUrl(res.url) || requestKey;
        results.push({ url: requestKey, html, finalUrl });
      } catch { /* skip failed pages */ }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}

/** Rewrite form actions to local paths */
export function rewriteFormActions(html, pageUrl, origin, pageMap, sourceLocalPath = null) {
  const sourceLocal = sourceLocalPath || lookupPageLocal(pageUrl, pageMap) || 'index.html';
  const sourceDir = path.posix.dirname(sourceLocal);

  return html.replace(
    /(<form\b[^>]*\baction\s*=\s*["'])([^"']+)(["'])/gi,
    (match, pre, action, post) => {
      if (isSkippedLink(action) || action === '') return match;
      try {
        const abs = resolvePageLinkAbsolute(action, pageUrl, origin);
        if (!abs || !isCrawlablePage(abs, origin)) return match;
        const local = lookupPageLocal(abs, pageMap) || pageUrlToLocal(abs, origin);
        if (local) {
          const rel = path.posix.relative(sourceDir, local).replace(/\\/g, '/');
          return pre + rel + post;
        }
      } catch { /* keep */ }
      return match;
    }
  );
}

/** Re-fix internal nav links in an already-cloned folder */
export function repairCloneLinks(outputDir, siteOrigin) {
  const htmlFiles = [];

  function walk(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const relPath = (rel ? `${rel}/${name}` : name).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) {
        if (/^(assets|external|cdn-cgi|slick|bootstrap)$/i.test(name)) continue;
        walk(full, relPath);
      } else if (
        name === 'index.html' &&
        !/^(assets|external|cdn-cgi|slick|bootstrap)\//i.test(relPath)
      ) {
        htmlFiles.push(relPath);
      }
    }
  }

  if (!fs.existsSync(outputDir)) return 0;
  walk(outputDir);

  const pageUrls = htmlFiles.map((local) => {
    const slug = local === 'index.html' ? '/' : `/${local.replace(/\/index\.html$/, '/')}`;
    return new URL(slug, `${siteOrigin}/`).href;
  });

  const pageMap = buildPageMap(pageUrls, siteOrigin);

  for (const local of htmlFiles) {
    const slug = local === 'index.html' ? '/' : `/${local.replace(/\/index\.html$/, '/')}`;
    const pageUrl = new URL(slug, `${siteOrigin}/`).href;
    const fullPath = path.join(outputDir, local);
    let html = fs.readFileSync(fullPath, 'utf8');
    html = rewritePageLinks(html, pageUrl, siteOrigin, pageMap, local);
    html = rewriteFormActions(html, pageUrl, siteOrigin, pageMap, local);
    fs.writeFileSync(fullPath, html);
  }

  return htmlFiles.length;
}
