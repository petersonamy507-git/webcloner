import fs from 'fs';
import { rangeProgress, reportProgress } from './progress.mjs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { MIME_EXT, postProcessAllPages } from './clone-postprocess.mjs';
import {
  completeChoosers,
  dismissOverlays,
  guardBrowser,
  guardPage,
  mergeReport,
  newAccessReport,
  recordPermissionRequests,
  snapshotHtml,
  waitForContentSettled,
  waitForOverlay,
} from './browser-guard.mjs';
import {
  MAX_PAGES,
  normalizePageUrl,
  normalizeCrawlUrl,
  pageUrlToLocal,
  assetUrlToLocal,
  safeWriteFile,
  sanitizeSavedMap,
  buildPageMap,
  canonicalAssetKey,
  canonicalPageKey,
  rewritePageLinks,
  rewriteFormActions,
  crawlSitePages,
  includeOriginalThankYou,
} from './crawl-utils.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SYSTEM_CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function resolveChromePath(puppeteer) {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  try {
    const bundled = puppeteer?.executablePath?.();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch { /* use system Chrome */ }
  return SYSTEM_CHROME.find((candidate) => fs.existsSync(candidate));
}

const BLOCKED_URL_RE = /google-analytics|googletagmanager|facebook\.net|hotjar|clarity\.ms|doubleclick|googleads|analytics|tracking|pixel|zendesk|zdassets/i;

function hashStr(s) {
  return crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    fs.statSync(p).isDirectory() ? removeDir(p) : fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function quickScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = Math.max(document.body.scrollHeight / 10, 400);
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(timer); resolve(); }, 4000);
    });
  });
}

function attachAssetSaver(page, outputDir, pageOrigin, saved, stats) {
  page.on('response', async (response) => {
    try {
      const resUrl = response.url();
      const status = response.status();
      if (status < 200 || status >= 400) return;
      if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;
      if (BLOCKED_URL_RE.test(resUrl)) return;

      const ct = response.headers()['content-type'] || '';
      if (ct.includes('text/html')) return;

      let localPath = assetUrlToLocal(resUrl, pageOrigin);
      if (!localPath || localPath.endsWith('/')) return;
      // Extensionless URLs (Next.js /_next/image or /api/images?url=…, CDN resizers) get
      // their type's extension; without one the file would be written as <path>/index.html.
      if (!path.extname(localPath)) {
        const ext = MIME_EXT[ct.split(';')[0].trim().toLowerCase()];
        if (!ext) return;
        localPath += ext;
      }

      const buf = await response.buffer();
      if (!buf?.length) return;
      const head = buf.slice(0, 128).toString('utf8').trim().toLowerCase();
      if (head.startsWith('<!doctype') || head.startsWith('<html')) return;

      const fullPath = path.join(outputDir, localPath);
      safeWriteFile(fullPath, buf);

      saved.set(resUrl, localPath);
      try {
        const href = new URL(resUrl).href;
        saved.set(href, localPath);
        saved.set(canonicalAssetKey(href), localPath);
      } catch { /* ignore */ }

      stats.networkBytes += buf.length;
      stats.networkCount++;
    } catch { /* skip */ }
  });
}

function visibleTextLength(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .length;
}

/**
 * Puppeteer HTML is the DOM after GSAP/Slick have split text and frozen
 * mid-animation (opacity, transforms). The server HTML is what the original
 * site starts from, so scripts can play the same way on the clone.
 * JavaScript-only apps still use the rendered DOM when the source is empty.
 */
function preferSourceHtml(raw, rendered) {
  if (!raw || !/<\s*(?:html|body)\b/i.test(raw)) return rendered;
  const rawLen = visibleTextLength(raw);
  const renderedLen = visibleTextLength(rendered);
  // The server's HTML is cleaner, but only when it already holds the page's content;
  // client-rendered sites send a skeleton and fill it in with JavaScript.
  if (rawLen >= 250 && rawLen >= renderedLen * 0.75) return raw;
  return rendered;
}

const FRAMEWORK_SCRIPT_SRC = /\/_next\/|\/_nuxt\/|\/_app\/immutable\/|\/webpack-runtime-[^"']*\.js|\/page-data\//i;
const FRAMEWORK_INLINE = /self\.__next_f|__NEXT_DATA__|window\.__NUXT__|__nuxt_|___gatsby|__remixContext|__sveltekit/;

/** A page whose content a client framework (Next.js, Nuxt, Gatsby, SvelteKit, Remix) draws in the browser. */
function isClientFramework(html) {
  return /<script\b[^>]*\bsrc=["'][^"']*(\/_next\/|\/_nuxt\/|\/_app\/immutable\/)/i.test(html) || FRAMEWORK_INLINE.test(html);
}

/**
 * Keep a rendered snapshot as captured. Offline, the framework runtime would start
 * over: ask for a city again, call the site's API (which the clone doesn't have) and
 * redraw its loading skeletons over the real content. Styles and other scripts stay.
 */
function freezeRenderedPage(html) {
  return html
    .replace(/<script\b[^>]*\bsrc=["'][^"']*["'][^>]*>\s*<\/script>/gi, (tag) => (FRAMEWORK_SCRIPT_SRC.test(tag) ? '' : tag))
    .replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (tag, body) => (FRAMEWORK_INLINE.test(body) ? '' : tag))
    .replace(/<link\b[^>]*\brel=["'](?:preload|modulepreload)["'][^>]*>/gi, (tag) => (
      (/\bas=["']script["']/i.test(tag) || /modulepreload/i.test(tag)) && FRAMEWORK_SCRIPT_SRC.test(tag) ? '' : tag));
}

/**
 * Load the page, get ordinary popups out of the way (screenshotting the page with
 * the popup first), scroll so lazy content loads, then keep the rendered DOM as the
 * site produced it: the guard's own changes are undone in snapshotHtml().
 */
async function captureHomepage(page, url, { report, screenshotDir } = {}) {
  let rawHtml = '';
  const captureDocument = async (response) => {
    try {
      if (response.request().resourceType() !== 'document') return;
      if (response.status() < 200 || response.status() >= 300) return;
      const text = await response.text();
      if (text && text.length > rawHtml.length) rawHtml = text;
    } catch { /* body already consumed */ }
  };
  page.on('response', captureDocument);
  try {
    let response = null;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    } catch (err) {
      if (!page.url() || page.url() === 'about:blank') throw err;
    }
    const status = response?.status?.() || 0;
    if (status === 401 || status === 403) {
      mergeReport(report, { restricted: [{ kind: status === 401 ? 'sign-in' : 'forbidden', text: `The site answered HTTP ${status}.` }] });
    }

    reportProgress(12, 'Checking for popups and permission prompts');
    const first = await waitForOverlay(page, 3000);
    mergeReport(report, { restricted: first.restricted });
    if (screenshotDir && first.overlays.some((o) => o.kind !== 'backdrop')) {
      try {
        fs.mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({ path: path.join(screenshotDir, 'desktop-popup.jpg'), type: 'jpeg', quality: 78 });
        report.popupScreenshot = true;
      } catch (err) {
        console.warn('popup screenshot skipped:', err.message);
      }
    }
    // City / store / order-type pickers: choose, don't close, or the content never loads.
    await completeChoosers(page, report);
    await dismissOverlays(page, report);
    await quickScroll(page);
    await new Promise((r) => setTimeout(r, 600));
    await dismissOverlays(page, report, { rounds: 2 }); // scroll- and timer-triggered popups
    // Image optimizer URLs (Next.js /_next/image, /api/images/…?url=…&w=…) are often refused
    // to automated browsers. Point those images at the original file their url= names.
    await page.evaluate(() => {
      const unwrap = (value) => {
        try {
          const u = new URL(value, location.href);
          if (!/\/(_next\/image|_vercel\/image|api\/images?\/)/i.test(u.pathname)) return null;
          const source = u.searchParams.get('url');
          if (!source || !u.searchParams.has('w')) return null;
          return new URL(source, location.origin).href;
        } catch { return null; }
      };
      document.querySelectorAll('img, picture source').forEach((el) => {
        const srcset = el.getAttribute('srcset') || '';
        const fromSet = srcset.split(/,\s+/).map((p) => unwrap(p.trim().split(/\s+/)[0])).filter(Boolean).pop();
        const target = unwrap(el.getAttribute('src') || '') || fromSet;
        if (!target) return;
        if (fromSet) { el.removeAttribute('srcset'); el.removeAttribute('sizes'); }
        el.setAttribute(el.tagName === 'IMG' ? 'src' : 'srcset', target);
      });
    }).catch(() => {});
    // Lazy images below the fold are only fetched when scrolled to. Load them now, in this
    // browser, because sites behind bot protection refuse the later plain download.
    await page.evaluate(() => {
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
        img.setAttribute('data-cloner-lazy', '1');
        img.loading = 'eager';
      });
    }).catch(() => {});
    await waitForContentSettled(page);
    await page.waitForFunction(() => [...document.images].every((img) => img.complete), { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll('img[data-cloner-lazy]').forEach((img) => {
        img.removeAttribute('data-cloner-lazy');
        img.setAttribute('loading', 'lazy');
      });
    }).catch(() => {});
    await recordPermissionRequests(page, report);

    const rendered = await snapshotHtml(page);
    let html = preferSourceHtml(rawHtml, rendered);
    if (html === rendered && isClientFramework(rendered)) html = freezeRenderedPage(rendered);
    const finalUrl = normalizeCrawlUrl(page.url()) || url;
    return { html, finalUrl };
  } finally {
    page.off('response', captureDocument);
  }
}

const DEVICES = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'tablet', width: 768, height: 1024, isMobile: true },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];
const MAX_SHOT_HEIGHT = 3600;

/** Desktop, tablet and mobile screenshots of the original page, for reference and comparison. */
async function captureDeviceScreenshots(page, dir, report) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [index, device] of DEVICES.entries()) {
    reportProgress(21 + index * 3, `Capturing ${device.name} screenshot`);
    try {
      await page.evaluate(() => { window.__clonerSameLoad = true; });
      await page.setViewport({ width: device.width, height: device.height, isMobile: device.isMobile, hasTouch: device.isMobile, deviceScaleFactor: 1 });
      // Switching to a touch device reloads the page, which brings its popups back.
      const reloaded = await page.evaluate(() => !window.__clonerSameLoad).catch(() => true);
      if (reloaded) {
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 }).catch(() => {});
        await waitForOverlay(page, 3000);
        await dismissOverlays(page, report);
        await quickScroll(page);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 900));
      // Popups that only show on this layout, or on a timer.
      await dismissOverlays(page, report, { rounds: 2, settle: 400 });
      const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0));
      await page.screenshot({
        path: path.join(dir, `${device.name}.jpg`),
        type: 'jpeg',
        quality: 78,
        clip: { x: 0, y: 0, width: device.width, height: Math.max(device.height, Math.min(height, MAX_SHOT_HEIGHT)) },
        captureBeyondViewport: true,
      });
    } catch (err) {
      console.warn(`${device.name} screenshot skipped:`, err.message);
    }
  }
}

export async function puppeteerClone(url, folderName, options = {}) {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error('Puppeteer not installed. Run: npm install puppeteer');
  }

  const maxPages = options.maxPages || MAX_PAGES;
  const pageUrl = normalizePageUrl(url);
  const outputDir = path.join(ROOT, 'cloned', folderName);
  const saved = new Map();
  const stats = { networkBytes: 0, networkCount: 0 };
  let pageOrigin = new URL(pageUrl).origin;
  const access = newAccessReport();
  const sessionCookies = options.sessionCookies || [];
  access.session = sessionCookies.length > 0;

  if (fs.existsSync(outputDir)) removeDir(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const executablePath = resolveChromePath(puppeteer.default);
  if (!executablePath) throw new Error('Chrome not found. Install Google Chrome or run: npx puppeteer browsers install chrome');

  let browser = await puppeteer.default.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  guardBrowser(browser, access);

  try {
    const page = await browser.newPage();
    await guardPage(page, pageOrigin, access);
    if (sessionCookies.length) await page.setCookie(...sessionCookies);
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (BLOCKED_URL_RE.test(u)) { req.abort(); return; }
      req.continue();
    });

    attachAssetSaver(page, outputDir, pageOrigin, saved, stats);

    // Phase 1: Browser capture homepage only (fast)
    reportProgress(8, 'Opening the site in a real browser');
    const { html: homeHtml, finalUrl: homeFinalUrl } = await captureHomepage(page, pageUrl, {
      report: access,
      screenshotDir: options.screenshotDir,
    });
    reportProgress(20, 'Home page captured');
    if (options.screenshotDir) await captureDeviceScreenshots(page, options.screenshotDir, access);
    await recordPermissionRequests(page, access);
    await browser.close();
    browser = null;

    pageOrigin = new URL(homeFinalUrl).origin;

    // Phase 2+3: BFS discover and fetch all site pages
    reportProgress(30, maxPages > 1 ? 'Finding the site\'s pages' : 'Preparing the page');
    const pageEntries = await crawlSitePages({
      homeHtml,
      homeFinalUrl,
      origin: pageOrigin,
      maxPages,
      onPage: (done, total) => rangeProgress(30, 55, done, total, `Downloading pages (${done} found)`),
    });

    const pageMap = buildPageMap([...pageEntries.keys()], pageOrigin);
    if (maxPages === 1) {
      for (const key of pageMap.keys()) pageMap.set(key, 'index.html');
    }
    // The home page is always the site root, even when the site redirects "/" somewhere
    // like /en/home. Otherwise there is no index.html to preview, edit or export.
    const homeKey = canonicalPageKey(homeFinalUrl);
    if (homeKey) pageMap.set(homeKey, 'index.html');

    await includeOriginalThankYou({
      pageEntries,
      pageMap,
      origin: pageOrigin,
      homeHtml,
      homeFinalUrl,
    });

    reportProgress(58, 'Downloading images, styles, scripts and fonts');
    // Phase 4: Single batch post-process (assets downloaded once)
    const pagesForProcess = [...pageEntries.entries()].map(([crawlUrl, { html, finalUrl }]) => ({
      html,
      pageUrl: finalUrl,
      sourcePath: pageMap.get(canonicalPageKey(crawlUrl)) || pageUrlToLocal(finalUrl, pageOrigin) || 'index.html',
    }));

    const { pages: processed, filesCount, totalSize: postSize } = await postProcessAllPages({
      outputDir,
      pages: pagesForProcess,
      preSaved: sanitizeSavedMap(saved),
    });

    reportProgress(80, 'Saving pages');
    // Phase 5: Rewrite internal links and save
    for (const { sourcePath, html } of processed) {
      const crawlUrl = [...pageEntries.keys()].find((url) => {
        const local = pageUrlToLocal(pageEntries.get(url)?.finalUrl || url, pageOrigin);
        return local === sourcePath;
      });
      const finalUrl = (crawlUrl && pageEntries.get(crawlUrl)?.finalUrl) || homeFinalUrl;

      let finalHtml = rewritePageLinks(html, finalUrl, pageOrigin, pageMap, sourcePath);
      finalHtml = rewriteFormActions(finalHtml, finalUrl, pageOrigin, pageMap, sourcePath);

      const fullPath = path.join(outputDir, sourcePath);
      const doctype = finalHtml.includes('<!DOCTYPE') ? '' : '<!DOCTYPE html>\n';
      safeWriteFile(fullPath, doctype + finalHtml);
    }

    const totalSize = stats.networkBytes + postSize;

    return {
      folder: folderName,
      filesDownloaded: filesCount,
      pagesCloned: processed.length,
      totalSize: formatSize(totalSize),
      access,
    };
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* already closed */ }
    }
    throw err;
  }
}
