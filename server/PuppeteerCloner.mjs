import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { postProcessAllPages } from './clone-postprocess.mjs';
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

      const localPath = assetUrlToLocal(resUrl, pageOrigin);
      if (!localPath || localPath.endsWith('/')) return;

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
  if (rawLen >= 250 && rawLen >= renderedLen * 0.4) return raw;
  return rendered;
}

async function captureHomepage(page, url) {
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
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    } catch (err) {
      if (!page.url() || page.url() === 'about:blank') throw err;
    }
    await quickScroll(page);
    await new Promise((r) => setTimeout(r, 600));
    const rendered = await page.evaluate(() => document.documentElement.outerHTML);
    const html = preferSourceHtml(rawHtml, rendered);
    const finalUrl = normalizeCrawlUrl(page.url()) || url;
    return { html, finalUrl };
  } finally {
    page.off('response', captureDocument);
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

  if (fs.existsSync(outputDir)) removeDir(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const executablePath = resolveChromePath(puppeteer.default);
  if (!executablePath) throw new Error('Chrome not found. Install Google Chrome or run: npx puppeteer browsers install chrome');

  let browser = await puppeteer.default.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
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
    const { html: homeHtml, finalUrl: homeFinalUrl } = await captureHomepage(page, pageUrl);
    await browser.close();
    browser = null;

    pageOrigin = new URL(homeFinalUrl).origin;

    // Phase 2+3: BFS discover and fetch all site pages
    const pageEntries = await crawlSitePages({
      homeHtml,
      homeFinalUrl,
      origin: pageOrigin,
      maxPages,
    });

    const pageMap = buildPageMap([...pageEntries.keys()], pageOrigin);
    if (maxPages === 1) {
      for (const key of pageMap.keys()) pageMap.set(key, 'index.html');
    }

    await includeOriginalThankYou({
      pageEntries,
      pageMap,
      origin: pageOrigin,
      homeHtml,
      homeFinalUrl,
    });

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
    };
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* already closed */ }
    }
    throw err;
  }
}
