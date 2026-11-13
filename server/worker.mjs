#!/usr/bin/env node
/**
 * Unified Node worker — called by FastAPI via stdin/stdout JSON.
 * Usage: echo '{"action":"clone",...}' | node server/worker.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { puppeteerClone, resolveChromePath } from './PuppeteerCloner.mjs';
import { MAX_PAGES } from './crawl-utils.mjs';
import { WebsiteCloner } from './WebsiteCloner.mjs';
import { repairCloneAssets, repairCorruptedAssets, repairMissingLocalFiles, repairUiFidelity } from './clone-postprocess.mjs';
import { loadTheme, extractTheme, applyTheme, createPage } from './site-utils.mjs';
import { generatePageWithAI } from './openai-generate.mjs';
import { customizeSiteWithAI } from './ai-customize.mjs';
import { auditAndFixClonedSite } from './ai-audit.mjs';
import { restructureToPhpStack } from './php-restructure.mjs';
import { restructureToLaravelStack } from './laravel-restructure.mjs';
import { applyHeadSnippets, readHeadSnippets } from './head-snippets.mjs';
import { saveCloneMeta } from './site-origin.mjs';
import { editSelectionWithAI, fixSelectionFromOriginal } from './ai-fix-selection.mjs';
import { applyBrand, listBrands, replaceProjectLogos } from './apply-brand.mjs';
import { fixPageWithAI } from './fix-with-ai.mjs';
import { restoreSnapshot, snapshotSite } from './history.mjs';
import { deleteClone, listClones, restoreClone } from './clone-library.mjs';
import { generateInvoiceBands } from './invoice-brand.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CLONED_DIR = path.join(ROOT, 'cloned');

function siteDir(folder) {
  return path.join(CLONED_DIR, (folder || '').replace(/[^a-zA-Z0-9_-]/g, ''));
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

async function canUsePuppeteer() {
  try {
    const puppeteer = await import('puppeteer');
    return Boolean(resolveChromePath(puppeteer.default));
  } catch {
    return false;
  }
}

async function handleClone(input) {
  const url = (input.url || '').trim();
  if (!url) throw new Error('URL is required.');

  const folderName = input.folderName
    ? input.folderName.replace(/[^a-zA-Z0-9_-]/g, '') || `clone_${Date.now()}`
    : `clone_${Date.now()}`;
  const mode = input.mode || 'website';
  // landing = the URL you entered only. website / full = every page on the site.
  const maxPages = mode === 'landing' || mode === 'page' ? 1 : MAX_PAGES;
  let result;

  try {
    if (mode !== 'static' && (await canUsePuppeteer())) {
      try {
        result = await puppeteerClone(url, folderName, { maxPages });
      } catch (err) {
        console.warn('Puppeteer failed, falling back to static:', err.message);
        const cloner = new WebsiteCloner(url, folderName);
        result = await cloner.clone({ maxPages });
        result.fallback = true;
      }
    } else {
      const cloner = new WebsiteCloner(url, folderName);
      result = await cloner.clone({ maxPages });
      if (mode !== 'static') result.fallback = true;
    }
  } catch (err) {
    const msg = err.message || 'Clone failed';
    if (/fetch failed/i.test(msg)) {
      throw new Error('Could not reach the website. Check the URL (include https://) and your internet connection, then try again.');
    }
    throw err;
  }
  const outDir = siteDir(result.folder);
  const normalizedUrl = (url.startsWith('http') ? url : `https://${url}`).replace(/\/$/, '');
  const siteOrigin = new URL(normalizedUrl).origin;
  try {
    saveCloneMeta(outDir, { sourceUrl: normalizedUrl, clonedAt: new Date().toISOString() });
    await repairCorruptedAssets(outDir, siteOrigin);
    repairCloneAssets(outDir, siteOrigin);
    await repairUiFidelity(outDir, siteOrigin);
  } catch { /* non-fatal */ }

  let phpStructure = null;
  try {
    phpStructure = restructureToPhpStack(outDir);
  } catch (err) {
    console.warn('PHP restructure skipped:', err.message);
  }
  try {
    const healed = await repairMissingLocalFiles(outDir, siteOrigin);
    if (phpStructure && healed) phpStructure = { ...phpStructure, missingAssetsRestored: healed };
  } catch (err) {
    console.warn('Missing asset repair skipped:', err.message);
  }

  let invoice = null;
  try {
    invoice = await generateInvoiceBands(outDir);
  } catch (err) {
    // The clone itself is fine without them; they can be made from the editor.
    console.warn('Invoice bands skipped:', err.message);
  }

  return {
    success: true,
    url: input.url,
    folder: result.folder,
    invoice,
    phpStructure,
    filesDownloaded: result.filesDownloaded,
    pagesCloned: result.pagesCloned || 1,
    totalSize: result.totalSize,
    previewUrl: `/cloned/${result.folder}/index.html`,
    phpPreview: phpStructure ? `cd cloned/${result.folder} && ./start-server.sh` : null,
    downloadUrl: `/api/download?folder=${encodeURIComponent(result.folder)}`,
    fallback: result.fallback || false,
  };
}

async function handleThemeGet(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const theme = input.refresh ? extractTheme(dir) : loadTheme(dir);
  return { success: true, theme };
}

async function handleThemePost(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const result = applyTheme(dir, input.theme || input);
  return { success: true, ...result };
}

async function handleCreatePage(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const page = createPage(dir, {
    pageName: input.pageName,
    template: input.template || 'shell',
    title: input.title,
    description: input.description,
  });
  return { success: true, page };
}

async function handleGeneratePage(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const page = await generatePageWithAI(dir, {
    pageName: input.pageName,
    pageTitle: input.pageTitle,
    prompt: input.prompt,
    description: input.description,
    linkPlacement: input.linkPlacement,
  });
  return { success: true, page };
}

async function handleFixWithAi(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  return fixPageWithAI(dir, {
    prompt: input.prompt,
    page: input.page,
    imageSrc: input.imageSrc,
  });
}

async function handleAiCustomize(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const result = await customizeSiteWithAI(dir, {
    prompt: input.prompt,
    logoUrl: input.logoUrl,
    logoBase64: input.logoBase64,
    folder: input.folder,
  });
  return { success: true, ...result };
}

function handleListBrands() {
  return { success: true, brands: listBrands() };
}

async function handleApplyBrand(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  return applyBrand(dir, input.brand);
}

function handleReplaceLogos(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  return replaceProjectLogos(dir, input.logoPath, input.oldSrc || '');
}

async function handlePhpRestructure(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const result = restructureToPhpStack(dir);
  return { success: true, ...result };
}

async function handleLaravelRestructure(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const result = restructureToLaravelStack(dir);
  return { success: true, ...result };
}

async function handleAiAudit(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const result = await auditAndFixClonedSite(dir, {
    mode: input.mode || 'audit',
    categories: input.categories || ['all'],
    prompt: input.prompt || '',
    useAI: input.useAI !== false,
  });
  return { success: true, ...result };
}

async function handleAiFixSelection(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  const result = await fixSelectionFromOriginal(dir, {
    page: input.page || 'index.html',
    selection: input.selection || {},
    prompt: input.prompt || '',
    useAI: input.useAI !== false,
  });
  return result;
}

async function handleHeadSnippets(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  if (input.snippet == null) return { success: true, snippet: readHeadSnippets(dir) };
  return applyHeadSnippets(dir, input.snippet);
}

async function handleAiEditSelection(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  return editSelectionWithAI(dir, {
    page: input.page || 'index.html',
    selection: input.selection || {},
    prompt: input.prompt || '',
    mediaBase64: input.mediaBase64 || '',
    mediaExt: input.mediaExt || '',
  });
}

function handleHistorySnapshot(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  return snapshotSite(dir, input.folder, input.label || '');
}

function handleHistoryRestore(input) {
  const dir = siteDir(input.folder);
  if (!fs.existsSync(dir)) throw new Error('Clone folder not found.');
  return restoreSnapshot(dir, input.folder, input.id, input.label || '');
}

function handleListClones() {
  return listClones(CLONED_DIR);
}

function handleDeleteClone(input) {
  return deleteClone(CLONED_DIR, input.folder);
}

function handleRestoreClone(input) {
  return restoreClone(CLONED_DIR, input.trashId);
}

const handlers = {
  clone: handleClone,
  'list-clones': handleListClones,
  'delete-clone': handleDeleteClone,
  'restore-clone': handleRestoreClone,
  'history-snapshot': handleHistorySnapshot,
  'history-restore': handleHistoryRestore,
  'theme-get': handleThemeGet,
  'theme-post': handleThemePost,
  'create-page': handleCreatePage,
  'generate-page': handleGeneratePage,
  'ai-customize': handleAiCustomize,
  'fix-with-ai': handleFixWithAi,
  'ai-audit': handleAiAudit,
  'ai-fix-selection': handleAiFixSelection,
  'ai-edit-selection': handleAiEditSelection,
  'php-restructure': handlePhpRestructure,
  'laravel-restructure': handleLaravelRestructure,
  'head-snippets': handleHeadSnippets,
  'list-brands': handleListBrands,
  'apply-brand': handleApplyBrand,
  'replace-logos': handleReplaceLogos,
};

try {
  const input = await readInput();
  const handler = handlers[input.action];
  if (!handler) throw new Error(`Unknown action: ${input.action}`);
  const result = await handler(input);
  process.stdout.write(JSON.stringify(result));
} catch (err) {
  process.stdout.write(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
}
