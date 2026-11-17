/**
 * Download export in the custom PHP stack's exact layout:
 *
 *   index.php  .htaccess  favicon.png  robots.txt  sitemap.xml
 *   assets/    css, js, images, fonts and every other static file
 *   class/     Api.class.php
 *   includes/  head.php header.php footer.php token.php ppc_or_seo.php get-dashboard.php
 *   views/     home.php, <page>.php, leads.php, thank-you.php, 404.php
 *
 * It is built from a temporary copy of the site, so the latest page edits are
 * included and the live clone (which the editor previews) is never modified.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { restructureToPhpStack } from './php-restructure.mjs';
import { HTACCESS, INDEX_PHP } from './php-view.mjs';

const STACK_DIRS = new Set(['views', 'includes', 'class']);
const ROOT_FILES = new Set(['index.php', '.htaccess', 'robots.txt', 'sitemap.xml', 'favicon.png']);
// Working files of the cloner itself; they never belong in a deliverable.
const NEVER = new Set(['laravel', 'leads', 'start-server.sh', 'clone-meta.json', 'theme.json', 'node_modules',
  '.hkjgdshagkjhadskjhfkjdsafhakjdsfhakjdshgf', '.cloner-head-snippets.html']);
const SKIP_REF = /^(https?:|\/\/|data:|mailto:|tel:|#|javascript:|<\?|\{\{)/i;

function copyTree(from, to, { skipHtml = false } = {}) {
  let copied = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copied += copyTree(src, dest, { skipHtml });
    } else if (!(skipHtml && /\.html?$/i.test(entry.name))) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      copied += 1;
    }
  }
  return copied;
}

function walk(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, test, out);
    else if (test(entry.name)) out.push(full);
  }
  return out;
}

/** Point a reference at assets/ only when the file really lives there now. */
function relocate(value, out, { rootRelativeOnly = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw || SKIP_REF.test(raw)) return value;
  if (rootRelativeOnly && !raw.startsWith('/')) return value;
  // With <base href="/">, "../../x" from a nested page still means the site-root "x".
  const clean = raw.replace(/^(?:\.{1,2}\/)+/, '').replace(/^\/+/, '');
  if (!clean || clean.startsWith('assets/')) return value;
  let file = clean.split(/[?#]/)[0];
  try { file = decodeURIComponent(file); } catch { /* keep as is */ }
  if (!file || file.includes('..') || file.endsWith('/')) return value;
  const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  if (isFile(path.join(out, file))) return value;
  return isFile(path.join(out, 'assets', file)) ? `/assets/${clean}` : value;
}

function rewriteReferences(text, out, options) {
  return text
    .replace(/(\b(?:src|href|poster|data-src|data-lazy-src|data-imgurl|data-bg|data-background|data-original|content)\s*=\s*)(["'])([^"']*)\2/gi,
      (m, attr, q, v) => `${attr}${q}${relocate(v, out, options)}${q}`)
    .replace(/(\bsrcset\s*=\s*)(["'])([^"']*)\2/gi,
      (m, attr, q, v) => `${attr}${q}${v.split(',').map((part) => {
        const [url, ...rest] = part.trim().split(/\s+/);
        return [relocate(url, out, options), ...rest].join(' ');
      }).join(', ')}${q}`)
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, v) => `url(${q}${relocate(v, out, options)}${q})`);
}

export function buildPhpExport(siteDir, outDir) {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cloner-php-'));
  try {
    for (const entry of fs.readdirSync(siteDir)) {
      if (entry === 'laravel' || entry === '.DS_Store') continue;
      fs.cpSync(path.join(siteDir, entry), path.join(work, entry), { recursive: true });
    }
    const structure = restructureToPhpStack(work);

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    copyTree(path.join(work, 'views'), path.join(outDir, 'views'));
    copyTree(path.join(work, 'includes'), path.join(outDir, 'includes'));
    fs.mkdirSync(path.join(outDir, 'class'), { recursive: true });
    if (fs.existsSync(path.join(work, 'class', 'Api.class.php'))) {
      fs.copyFileSync(path.join(work, 'class', 'Api.class.php'), path.join(outDir, 'class', 'Api.class.php'));
    }

    // Everything else that isn't a page goes under assets/, keeping its path.
    const moved = [];
    for (const entry of fs.readdirSync(work, { withFileTypes: true })) {
      const name = entry.name;
      if (STACK_DIRS.has(name) || ROOT_FILES.has(name) || NEVER.has(name) || name.startsWith('.')) continue;
      const src = path.join(work, name);
      if (entry.isDirectory()) {
        const target = name === 'assets' ? path.join(outDir, 'assets') : path.join(outDir, 'assets', name);
        if (copyTree(src, target, { skipHtml: true }) && name !== 'assets') moved.push(`${name}/`);
      } else if (!/\.html?$/i.test(name)) {
        fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
        fs.copyFileSync(src, path.join(outDir, 'assets', name));
        moved.push(name);
      }
    }

    fs.writeFileSync(path.join(outDir, 'index.php'), INDEX_PHP);
    fs.writeFileSync(path.join(outDir, '.htaccess'), HTACCESS);
    for (const name of ['robots.txt', 'sitemap.xml']) {
      if (fs.existsSync(path.join(work, name))) fs.copyFileSync(path.join(work, name), path.join(outDir, name));
    }
    const favicon = ['favicon.png', 'images/favicon.png', 'favicon.ico'].map((f) => path.join(work, f)).find((f) => fs.existsSync(f));
    if (favicon) fs.copyFileSync(favicon, path.join(outDir, 'favicon.png'));

    // With <base href="/"> every path in a view is site-root relative; CSS keeps its
    // relative paths (its folder moved with it), so only root-absolute ones change there.
    for (const file of walk(outDir, (n) => n.endsWith('.php') && !n.startsWith('.'))) {
      if (file.startsWith(path.join(outDir, 'assets'))) continue;
      const before = fs.readFileSync(file, 'utf8');
      const after = rewriteReferences(before, outDir);
      if (after !== before) fs.writeFileSync(file, after);
    }
    for (const file of walk(path.join(outDir, 'assets'), (n) => n.endsWith('.css'))) {
      const before = fs.readFileSync(file, 'utf8');
      const after = rewriteReferences(before, outDir, { rootRelativeOnly: true });
      if (after !== before) fs.writeFileSync(file, after);
    }

    return {
      success: true,
      outDir,
      views: fs.readdirSync(path.join(outDir, 'views')).filter((f) => f.endsWith('.php')).length,
      movedToAssets: moved,
      pages: structure.pages,
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
