/**
 * Undo/redo history for a cloned site.
 *
 * Snapshots live outside the clone folder so they never end up in a download
 * or in page/CSS listings. Only editable text files are copied, which keeps a
 * snapshot small enough to take before every editor action.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HISTORY_ROOT = path.join(ROOT, '.cloner-history');

const TEXT_EXT = new Set(['.html', '.htm', '.php', '.css', '.json']);
const SKIP_DIRS = new Set(['external', 'node_modules', '.git']);
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const KEEP_SNAPSHOTS = 40;

function historyDir(folder) {
  const safe = (folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error('Clone folder is required.');
  return path.join(HISTORY_ROOT, safe);
}

function collectTextFiles(dir, base = dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...collectTextFiles(full, base));
    } else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) {
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      if (size > MAX_FILE_BYTES) continue;
      files.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return files;
}

function pruneSnapshots(folder) {
  const root = historyDir(folder);
  if (!fs.existsSync(root)) return;
  const snaps = fs.readdirSync(root).filter((name) => name.startsWith('snap-')).sort();
  while (snaps.length > KEEP_SNAPSHOTS) {
    const oldest = snaps.shift();
    fs.rmSync(path.join(root, oldest), { recursive: true, force: true });
  }
}

/** Copy the clone's editable files into a new snapshot and return its id. */
export function snapshotSite(siteDir, folder, label = '') {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');
  const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const target = path.join(historyDir(folder), id);
  const files = collectTextFiles(siteDir);

  for (const rel of files) {
    const from = path.join(siteDir, rel);
    const to = path.join(target, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  fs.writeFileSync(
    path.join(target, 'snapshot.json'),
    JSON.stringify({ id, label, files, createdAt: new Date().toISOString() }, null, 2),
  );
  pruneSnapshots(folder);
  return { success: true, id, label, files: files.length };
}

function readManifest(folder, id) {
  const safeId = (id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.join(historyDir(folder), safeId);
  const manifestPath = path.join(dir, 'snapshot.json');
  if (!safeId || !fs.existsSync(manifestPath)) throw new Error('That history step is no longer available.');
  return { dir, manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
}

/**
 * Restore a snapshot. The current state is snapshotted first and returned as
 * `redoId` so the caller can step forward again.
 */
export function restoreSnapshot(siteDir, folder, id, label = '') {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');
  const { dir, manifest } = readManifest(folder, id);
  const redo = snapshotSite(siteDir, folder, label || 'before restore');

  const wanted = new Set(manifest.files || []);
  let restored = 0;
  for (const rel of wanted) {
    const from = path.join(dir, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(siteDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    restored += 1;
  }

  // Files added after the snapshot (a new page, a generated stylesheet) go away.
  let removed = 0;
  for (const rel of collectTextFiles(siteDir)) {
    if (wanted.has(rel)) continue;
    fs.rmSync(path.join(siteDir, rel), { force: true });
    removed += 1;
  }

  return { success: true, restored, removed, redoId: redo.id };
}

export function dropSnapshot(folder, id) {
  const safeId = (id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return { success: true };
  fs.rmSync(path.join(historyDir(folder), safeId), { recursive: true, force: true });
  return { success: true };
}
