/**
 * "My Sites" — the list of clones on the home page, so a cloned site stays
 * reachable after the tab that created it is closed.
 */
import { API } from './api.js';

const grid = document.getElementById('libraryGrid');
const loading = document.getElementById('libraryLoading');
const empty = document.getElementById('libraryEmpty');
const subtitle = document.getElementById('librarySubtitle');
const refreshBtn = document.getElementById('refreshLibraryBtn');
const navCount = document.getElementById('navLibraryCount');
const deleteModalEl = document.getElementById('deleteCloneModal');
const deleteNameEl = document.getElementById('deleteCloneName');
const confirmDeleteBtn = document.getElementById('confirmDeleteCloneBtn');

let deleteModal = null;
let pendingDelete = null;

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function formatWhen(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const steps = [
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
  ];
  let value = seconds / 60;
  let unit = 'minute';
  for (const [divisor, name] of steps) {
    unit = name;
    if (Math.abs(value) < divisor) break;
    value /= divisor;
  }
  const rounded = Math.round(value);
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'} ago`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function cardHtml(clone) {
  const editUrl = `/editor.html?folder=${encodeURIComponent(clone.folder)}`;
  const name = escapeHtml(clone.title || clone.folder);
  const thumb = clone.thumbnail
    ? `<img src="${escapeHtml(clone.thumbnail)}" alt="" loading="lazy" />`
    : `<div class="thumb-fallback"><i class="bi bi-globe2"></i></div>`;

  return `
    <article class="site-card" data-folder="${escapeHtml(clone.folder)}">
      <a class="site-thumb" href="${editUrl}" aria-label="Edit ${name}">
        ${thumb}
        <span class="site-thumb-overlay"><i class="bi bi-pencil-square"></i>Edit site</span>
      </a>
      <div class="site-card-body">
        <h3 class="site-name" title="${escapeHtml(clone.sourceUrl || clone.folder)}">${name}</h3>
        <p class="site-meta">
          ${clone.pageCount} page${clone.pageCount === 1 ? '' : 's'}
          <span class="dot">·</span>${formatBytes(clone.bytes)}
          <span class="dot">·</span>${escapeHtml(formatWhen(clone.updatedAt))}
        </p>
        <div class="site-actions">
          <a class="btn btn-primary btn-sm" href="${editUrl}">
            <i class="bi bi-pencil-square me-1"></i>Edit
          </a>
          <a class="btn btn-ghost btn-sm" href="/cloned/${encodeURIComponent(clone.folder)}/index.html" target="_blank" rel="noreferrer" title="Open the site in a new tab">
            <i class="bi bi-box-arrow-up-right"></i>
          </a>
          <a class="btn btn-ghost btn-sm" href="${API.download(clone.folder)}" title="Download as a PHP site">
            <i class="bi bi-file-zip"></i>
          </a>
          <button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-action="delete" title="Delete this site">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>
    </article>`;
}

export async function loadLibrary() {
  if (!grid) return;
  loading?.classList.remove('d-none');
  try {
    const res = await fetch(API.clones);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not load your sites.');
    render(data.clones || []);
  } catch (err) {
    grid.innerHTML = `<div class="library-error"><i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(err.message)}</div>`;
    empty?.classList.add('d-none');
  }
}

function render(clones) {
  loading?.classList.add('d-none');
  if (navCount) {
    navCount.textContent = String(clones.length);
    navCount.classList.toggle('d-none', clones.length === 0);
  }
  if (!clones.length) {
    grid.innerHTML = '';
    empty?.classList.remove('d-none');
    if (subtitle) subtitle.textContent = 'Every site you clone stays here, ready to edit.';
    return;
  }
  empty?.classList.add('d-none');
  grid.innerHTML = clones.map(cardHtml).join('');
  if (subtitle) {
    subtitle.textContent = `${clones.length} site${clones.length === 1 ? '' : 's'} saved. Pick one to keep editing.`;
  }
}

grid?.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action="delete"]');
  if (!button) return;
  const card = button.closest('.site-card');
  pendingDelete = card?.dataset.folder || null;
  if (!pendingDelete) return;
  if (deleteNameEl) {
    deleteNameEl.textContent = card.querySelector('.site-name')?.textContent || pendingDelete;
  }
  if (!deleteModal && deleteModalEl) deleteModal = new bootstrap.Modal(deleteModalEl);
  deleteModal?.show();
});

const undoToast = document.getElementById('undoToast');
const undoToastText = document.getElementById('undoToastText');
const undoDeleteBtn = document.getElementById('undoDeleteBtn');
let lastTrashId = null;
let undoTimer = null;

function showUndoToast(name, trashId) {
  lastTrashId = trashId;
  if (undoToastText) undoToastText.textContent = `${name} deleted.`;
  undoToast?.classList.remove('d-none');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => undoToast?.classList.add('d-none'), 12000);
}

confirmDeleteBtn?.addEventListener('click', async () => {
  if (!pendingDelete) return;
  const name = deleteNameEl?.textContent || pendingDelete;
  confirmDeleteBtn.disabled = true;
  try {
    const res = await fetch(API.deleteClone(pendingDelete), { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not delete this site.');
    deleteModal?.hide();
    await loadLibrary();
    showUndoToast(name, data.trashId);
  } catch (err) {
    if (deleteNameEl) deleteNameEl.textContent = err.message;
  } finally {
    confirmDeleteBtn.disabled = false;
    pendingDelete = null;
  }
});

undoDeleteBtn?.addEventListener('click', async () => {
  if (!lastTrashId) return;
  undoDeleteBtn.disabled = true;
  try {
    const res = await fetch(API.restoreClone(lastTrashId), { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not restore this site.');
    undoToast?.classList.add('d-none');
    lastTrashId = null;
    await loadLibrary();
  } catch (err) {
    if (undoToastText) undoToastText.textContent = err.message;
  } finally {
    undoDeleteBtn.disabled = false;
  }
});

refreshBtn?.addEventListener('click', () => loadLibrary());

loadLibrary();
