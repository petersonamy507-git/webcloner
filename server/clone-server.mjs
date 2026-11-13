import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { WebsiteCloner } from './WebsiteCloner.mjs';
import { puppeteerClone } from './PuppeteerCloner.mjs';
import { MAX_PAGES } from './crawl-utils.mjs';
import { loadTheme, extractTheme, applyTheme, createPage, listPages } from './site-utils.mjs';
import { generatePageWithAI } from './openai-generate.mjs';
import { customizeSiteWithAI } from './ai-customize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CLONED_DIR = path.join(ROOT, 'cloned');

if (!fs.existsSync(CLONED_DIR)) fs.mkdirSync(CLONED_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

async function handleClone(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body || '{}');
  if (!input.url) return sendJson(res, 400, { success: false, error: 'URL is required.' });

  const folderName = input.folderName
    ? input.folderName.replace(/[^a-zA-Z0-9_-]/g, '')
    : `clone_${Date.now()}`;

  const mode = input.mode || 'website';
  const maxPages = mode === 'landing' || mode === 'page' ? 1 : MAX_PAGES;

  try {
    let result;
    if (mode !== 'static') {
      try {
        result = await puppeteerClone(input.url, folderName || `clone_${Date.now()}`, { maxPages });
      } catch (puppeteerErr) {
        console.warn('Puppeteer clone failed, falling back to static:', puppeteerErr.message);
        const cloner = new WebsiteCloner(input.url, folderName || `clone_${Date.now()}`);
        result = await cloner.clone({ maxPages });
        result.fallback = true;
      }
    } else {
      const cloner = new WebsiteCloner(input.url, folderName || `clone_${Date.now()}`);
      result = await cloner.clone({ maxPages });
    }
    sendJson(res, 200, {
      success: true,
      url: input.url,
      folder: result.folder,
      filesDownloaded: result.filesDownloaded,
      pagesCloned: result.pagesCloned || 1,
      totalSize: result.totalSize,
      previewUrl: `/cloned/${result.folder}/index.html`,
      downloadUrl: `/api/download.php?folder=${encodeURIComponent(result.folder)}`,
    });
  } catch (e) {
    sendJson(res, 422, { success: false, error: e.message });
  }
}

function handleDownload(req, res, folder) {
  folder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.join(CLONED_DIR, folder);
  if (!fs.existsSync(dir)) {
    res.writeHead(404);
    return res.end('Clone not found.');
  }

  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${folder}.zip"`,
  });

  const archive = archiver('zip');
  archive.pipe(res);
  archive.directory(dir, false);
  archive.finalize();
}

function resolveClonedFile(filePath) {
  const full = path.join(ROOT, filePath);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;

  // Directory URL like /cloned/folder/about-us/ → about-us/index.html
  const withIndex = path.join(full, 'index.html');
  if (fs.existsSync(withIndex) && fs.statSync(withIndex).isFile()) return withIndex;

  // Path without trailing slash but is a directory
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    const idx = path.join(full, 'index.html');
    if (fs.existsSync(idx)) return idx;
  }

  // Add .html extension if missing: /cloned/folder/about-us → about-us.html or about-us/index.html
  if (!path.extname(full)) {
    const asHtml = full + '.html';
    if (fs.existsSync(asHtml)) return asHtml;
    const asDirIndex = path.join(full, 'index.html');
    if (fs.existsSync(asDirIndex)) return asDirIndex;
  }

  return null;
}

function serveCloned(req, res, filePath) {
  const full = resolveClonedFile(filePath);
  if (!full) {
    res.writeHead(404);
    return res.end('File not found.');
  }
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}

function siteDir(folder) {
  folder = (folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(CLONED_DIR, folder);
}

function handlePages(req, res, folder) {
  const dir = siteDir(folder);
  if (!fs.existsSync(dir)) return sendJson(res, 404, { success: false, error: 'Clone folder not found.' });
  sendJson(res, 200, { success: true, pages: listPages(dir) });
}

async function handleCreatePage(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body || '{}');
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) return sendJson(res, 404, { success: false, error: 'Clone folder not found.' });

  try {
    const page = createPage(dir, {
      pageName: input.pageName,
      template: input.template || 'shell',
      title: input.title,
      description: input.description,
    });
    sendJson(res, 200, { success: true, page });
  } catch (e) {
    sendJson(res, 422, { success: false, error: e.message });
  }
}

function handleThemeGet(res, folder, refresh) {
  const dir = siteDir(folder);
  if (!fs.existsSync(dir)) return sendJson(res, 404, { success: false, error: 'Clone folder not found.' });
  try {
    const theme = refresh ? extractTheme(dir) : loadTheme(dir);
    sendJson(res, 200, { success: true, theme });
  } catch (e) {
    sendJson(res, 422, { success: false, error: e.message });
  }
}

async function handleThemePost(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body || '{}');
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) return sendJson(res, 404, { success: false, error: 'Clone folder not found.' });

  try {
    const result = applyTheme(dir, input.theme || input);
    sendJson(res, 200, { success: true, ...result });
  } catch (e) {
    sendJson(res, 422, { success: false, error: e.message });
  }
}

async function handleAiCustomize(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body || '{}');
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) return sendJson(res, 404, { success: false, error: 'Clone folder not found.' });

  try {
    const result = await customizeSiteWithAI(dir, {
      prompt: input.prompt,
      logoUrl: input.logoUrl,
      logoBase64: input.logoBase64,
      folder: input.folder,
    });
    sendJson(res, 200, { success: true, ...result });
  } catch (e) {
    sendJson(res, 422, { success: false, error: e.message });
  }
}

async function handleGeneratePage(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body || '{}');
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) return sendJson(res, 404, { success: false, error: 'Clone folder not found.' });

  try {
    const page = await generatePageWithAI(dir, {
      pageName: input.pageName,
      pageTitle: input.pageTitle,
      prompt: input.prompt,
      description: input.description,
      linkPlacement: input.linkPlacement,
    });
    sendJson(res, 200, { success: true, page });
  } catch (e) {
    sendJson(res, 422, { success: false, error: e.message });
  }
}

async function handleUpload(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body || '{}');

  const folder = (input.folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const data = input.data ? Buffer.from(input.data, 'base64') : null;
  const ext = (input.ext || 'png').replace(/[^a-z0-9]/gi, '') || 'png';

  if (!folder || !data) return sendJson(res, 400, { success: false, error: 'Folder and image data are required.' });

  const dir = path.join(CLONED_DIR, folder, 'images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), data);

  sendJson(res, 200, { success: true, url: `/cloned/${folder}/images/${filename}`, filename });
}

async function handleSave(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body || '{}');

  const folder = (input.folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const page = path.basename(input.page || 'index.html');
  const html = input.html || '';

  if (!folder || !html) return sendJson(res, 400, { success: false, error: 'Folder and HTML are required.' });

  const dir = path.join(CLONED_DIR, folder);
  if (!fs.existsSync(dir)) return sendJson(res, 404, { success: false, error: 'Clone folder not found.' });

  const filePath = path.join(dir, page);
  fs.writeFileSync(filePath, html);
  sendJson(res, 200, { success: true, file: page });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  if (url.pathname === '/api/clone.php' && req.method === 'POST') {
    return handleClone(req, res);
  }

  if (url.pathname === '/api/download.php') {
    return handleDownload(req, res, url.searchParams.get('folder') || '');
  }

  if (url.pathname === '/api/pages.php' && req.method === 'GET') {
    return handlePages(req, res, url.searchParams.get('folder') || '');
  }

  if (url.pathname === '/api/create-page.php' && req.method === 'POST') {
    return handleCreatePage(req, res);
  }

  if (url.pathname === '/api/theme.php' && req.method === 'GET') {
    return handleThemeGet(res, url.searchParams.get('folder') || '', url.searchParams.get('refresh') === '1');
  }

  if (url.pathname === '/api/theme.php' && req.method === 'POST') {
    return handleThemePost(req, res);
  }

  if (url.pathname === '/api/generate-page.php' && req.method === 'POST') {
    return handleGeneratePage(req, res);
  }

  if (url.pathname === '/api/ai-customize.php' && req.method === 'POST') {
    return handleAiCustomize(req, res);
  }

  if (url.pathname === '/api/save.php' && req.method === 'POST') {
    return handleSave(req, res);
  }

  if (url.pathname === '/api/upload.php' && req.method === 'POST') {
    return handleUpload(req, res);
  }

  if (url.pathname.startsWith('/cloned/')) {
    return serveCloned(req, res, url.pathname);
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`Clone API server running at http://localhost:${PORT}`);
});
