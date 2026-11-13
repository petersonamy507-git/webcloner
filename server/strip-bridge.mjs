#!/usr/bin/env node
/**
 * One-off repair: removes editor bridge code that an older save baked into
 * cloned pages. Run with `node server/strip-bridge.mjs`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLONED = path.join(ROOT, 'cloned');

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'external') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (/\.(html?|php)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

let cleaned = 0;
for (const file of htmlFiles(CLONED)) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('__clonerEditorActive') && !html.includes('cloner-edit-hint')) continue;

  const next = html
    .replace(/<script[^>]*data-cloner-bridge[^>]*>[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?__clonerEditorActive[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<style\b[^>]*id=["']cloner-editor-style["'][^>]*>[\s\S]*?<\/style>\s*/gi, '')
    .replace(/<div class="cloner-edit-hint"[^>]*>[\s\S]*?<\/div>\s*/gi, '');

  if (next !== html) {
    fs.writeFileSync(file, next);
    cleaned += 1;
    console.log(`cleaned ${path.relative(ROOT, file)} (${html.length - next.length} bytes removed)`);
  }
}
console.log(cleaned ? `Done. ${cleaned} file(s) cleaned.` : 'Nothing to clean.');
