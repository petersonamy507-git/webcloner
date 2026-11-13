/**
 * The library of cloned sites shown on the home page, so a clone stays
 * reachable after the tab that created it is closed.
 */
import fs from 'fs';
import path from 'path';
import { loadCloneMeta } from './site-origin.mjs';
import { listPages } from './site-utils.mjs';

const SKIP_DIRS = new Set(['external', 'node_modules', '.git']);

/** Bytes on disk, and how many files make that up. */
function measure(dir) {
  let bytes = 0;
  let files = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      try {
        bytes += fs.statSync(full).size;
        files += 1;
      } catch { /* skip unreadable files */ }
    }
  };
  walk(dir);
  return { bytes, files };
}

/** A screenshot-free thumbnail: the first local image big enough to read. */
function findThumbnail(siteDir, folder) {
  const candidates = ['images', 'assets/images', 'assets/img', 'img'];
  for (const rel of candidates) {
    const dir = path.join(siteDir, rel);
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const image = entries
      .filter((e) => e.isFile() && /\.(png|jpe?g|webp|avif)$/i.test(e.name))
      .map((e) => {
        let size = 0;
        try { size = fs.statSync(path.join(dir, e.name)).size; } catch { /* skip */ }
        return { name: e.name, size };
      })
      .filter((e) => e.size > 8000)
      .sort((a, b) => b.size - a.size)[0];
    if (image) return `/cloned/${folder}/${rel}/${image.name}`;
  }
  return '';
}

function describe(clonedDir, name) {
  const siteDir = path.join(clonedDir, name);
  const meta = loadCloneMeta(siteDir) || {};
  let pages = [];
  try { pages = listPages(siteDir); } catch { /* an unreadable clone still lists */ }
  const { bytes, files } = measure(siteDir);

  let host = '';
  try { host = new URL(meta.sourceUrl).hostname.replace(/^www\./, ''); } catch { /* no meta yet */ }

  let createdAt = meta.clonedAt || '';
  if (!createdAt) {
    try { createdAt = fs.statSync(siteDir).birthtime.toISOString(); } catch { /* skip */ }
  }
  let updatedAt = meta.updatedAt || createdAt;
  try {
    const index = fs.statSync(path.join(siteDir, 'index.html'));
    if (index.mtime.toISOString() > updatedAt) updatedAt = index.mtime.toISOString();
  } catch { /* skip */ }

  return {
    folder: name,
    title: host || name,
    sourceUrl: meta.sourceUrl || '',
    host,
    createdAt,
    updatedAt,
    pageCount: pages.length,
    fileCount: files,
    bytes,
    thumbnail: findThumbnail(siteDir, name),
  };
}

/** Every clone on disk, most recently touched first. */
export function listClones(clonedDir) {
  let entries;
  try {
    entries = fs.readdirSync(clonedDir, { withFileTypes: true });
  } catch {
    return { success: true, clones: [] };
  }

  const clones = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => describe(clonedDir, e.name))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  return { success: true, clones };
}

/** Deleted clones wait here so a misclick stays recoverable. */
function trashDir(clonedDir) {
  return path.join(path.dirname(clonedDir), '.cloner-trash');
}

const KEEP_TRASHED = 10;

function pruneTrash(clonedDir) {
  const trash = trashDir(clonedDir);
  let entries;
  try {
    entries = fs.readdirSync(trash, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return;
  }
  entries
    .map((e) => {
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(path.join(trash, e.name)).mtimeMs; } catch { /* missing */ }
      return { name: e.name, mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .map((e) => e.name)
    .slice(0, Math.max(0, entries.length - KEEP_TRASHED))
    .forEach((name) => {
      try { fs.rmSync(path.join(trash, name), { recursive: true, force: true }); } catch { /* skip */ }
    });
}

export function deleteClone(clonedDir, folder) {
  const name = (folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!name) throw new Error('A clone folder name is required.');
  const target = path.join(clonedDir, name);
  if (!fs.existsSync(target)) throw new Error('That clone no longer exists.');

  const trash = trashDir(clonedDir);
  fs.mkdirSync(trash, { recursive: true });
  const trashId = `${name}--${Date.now()}`;
  fs.renameSync(target, path.join(trash, trashId));
  pruneTrash(clonedDir);
  return { success: true, folder: name, trashId };
}

export function restoreClone(clonedDir, trashId) {
  const id = (trashId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) throw new Error('A deleted site id is required.');
  const source = path.join(trashDir(clonedDir), id);
  if (!fs.existsSync(source)) throw new Error('That deleted site is no longer available.');

  const folder = id.replace(/--\d+$/, '');
  const target = path.join(clonedDir, folder);
  if (fs.existsSync(target)) throw new Error('A site with that folder name already exists.');
  fs.renameSync(source, target);
  return { success: true, folder };
}
