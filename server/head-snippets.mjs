import fs from 'fs';
import path from 'path';
import { listPages } from './site-utils.mjs';

const START = '<!-- cloner-head-snippets -->';
const END = '<!-- /cloner-head-snippets -->';
const SNIPPET_FILE = 'includes/head-snippets.html';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function injectHead(html, block) {
  const pattern = new RegExp(`\\n?${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`, 'g');
  let next = String(html || '').replace(pattern, '');
  if (!next.includes('</head>')) return null;
  if (block) next = next.replace('</head>', `${block}</head>`);
  return next;
}

export function readHeadSnippets(siteDir) {
  const filePath = path.join(siteDir, SNIPPET_FILE);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function ensureHeadPhp(siteDir) {
  const filePath = path.join(siteDir, 'includes/head.php');
  if (fs.existsSync(filePath)) return filePath;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `<?php
include_once("token.php");
include_once("ppc_or_seo.php");
?>
<head>
</head>
`,
  );
  return filePath;
}

export function applyHeadSnippets(siteDir, snippet) {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');
  const clean = String(snippet ?? '').trim();
  const snippetPath = path.join(siteDir, SNIPPET_FILE);
  fs.mkdirSync(path.dirname(snippetPath), { recursive: true });
  fs.writeFileSync(snippetPath, clean);

  const block = clean ? `\n${START}\n${clean}\n${END}\n` : '';
  const files = [ensureHeadPhp(siteDir)];
  for (const { file } of listPages(siteDir)) files.push(path.join(siteDir, file));

  let updated = 0;
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const before = fs.readFileSync(filePath, 'utf8');
    const after = injectHead(before, block);
    if (after == null || after === before) continue;
    fs.writeFileSync(filePath, after);
    updated += 1;
  }

  return { success: true, updated, snippet: clean };
}
