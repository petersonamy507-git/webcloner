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

let canLock = false;
let allClones = [];
const entityFilter = document.getElementById('libraryEntityFilter');

function cardHtml(clone) {
  const editUrl = `/editor.html?folder=${encodeURIComponent(clone.folder)}`;
  // A locked site is view-only for regular users; admins keep every action.
  const editable = !clone.locked || canLock;
  const name = escapeHtml(clone.title || clone.folder);
  const thumb = clone.thumbnail
    ? `<img src="${escapeHtml(clone.thumbnail)}" alt="" loading="lazy" />`
    : `<div class="thumb-fallback"><i class="bi bi-globe2"></i></div>`;

  return `
    <article class="site-card" data-folder="${escapeHtml(clone.folder)}">
      ${editable
    ? `<a class="site-thumb" href="${editUrl}" aria-label="Edit ${name}">
        ${thumb}
        <span class="site-thumb-overlay"><i class="bi bi-pencil-square"></i>Edit site</span>
      </a>`
    : `<div class="site-thumb">${thumb}</div>`}
      <div class="site-card-body">
        <h3 class="site-name" title="${escapeHtml(clone.sourceUrl || clone.folder)}">${name}${clone.locked ? ' <span class="site-lock-badge" title="Locked by an admin"><i class="bi bi-lock-fill"></i>Locked</span>' : ''}</h3>
        <p class="site-meta">
          ${clone.pageCount} page${clone.pageCount === 1 ? '' : 's'}
          <span class="dot">·</span>${formatBytes(clone.bytes)}
          <span class="dot">·</span>${escapeHtml(formatWhen(clone.updatedAt))}
          ${clone.entityName ? `<span class="dot">·</span><span class="site-entity">${escapeHtml(clone.entityName)}</span>` : ''}
          ${clone.createdBy ? `<span class="dot">·</span><span class="site-owner" title="Cloned by ${escapeHtml(clone.createdBy)}">by ${escapeHtml(clone.createdBy.split('@')[0])}</span>` : ''}
          ${clone.githubUrl ? `<span class="dot">·</span><a class="site-gh-link" href="${escapeHtml(clone.githubUrl)}" target="_blank" rel="noopener" title="${escapeHtml(clone.githubRepo)}"><i class="bi bi-github me-1"></i>On GitHub</a>` : ''}
        </p>
        <div class="site-actions">
          ${editable ? `<a class="btn btn-primary btn-sm" href="${editUrl}">
            <i class="bi bi-pencil-square me-1"></i>Edit
          </a>` : ''}
          <a class="btn btn-ghost btn-sm" href="/cloned/${encodeURIComponent(clone.folder)}/index.html" target="_blank" rel="noreferrer" title="Open the site in a new tab">
            <i class="bi bi-box-arrow-up-right"></i>
          </a>
          ${clone.githubUrl ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-github-push="${escapeHtml(clone.folder)}" title="Push this site to GitHub (once)">
            <i class="bi bi-github"></i>
          </button>`}
          ${canLock ? `<button type="button" class="btn btn-ghost btn-sm" data-action="lock" data-locked="${clone.locked ? '1' : ''}" title="${clone.locked ? 'Unlock: let users edit and delete this site' : 'Lock: users can no longer edit or delete this site'}">
            <i class="bi ${clone.locked ? 'bi-lock-fill' : 'bi-unlock'}"></i>
          </button>` : ''}
          ${editable ? `<button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-action="delete" title="Delete this site">
            <i class="bi bi-trash3"></i>
          </button>` : ''}
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
    canLock = Boolean(data.canLock);
    allClones = data.clones || [];
    setupEntityFilter(Boolean(data.allEntities));
    render(filteredClones());
  } catch (err) {
    grid.innerHTML = `<div class="library-error"><i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(err.message)}</div>`;
    empty?.classList.add('d-none');
  }
}

/** The super admin sees every entity's sites, with a filter to narrow them to one entity. */
function setupEntityFilter(enabled) {
  if (!entityFilter) return;
  entityFilter.classList.toggle('d-none', !enabled);
  if (!enabled) return;
  const chosen = entityFilter.value;
  const names = [...new Set(allClones.map((c) => c.entityName).filter(Boolean))].sort();
  entityFilter.innerHTML = `<option value="">All entities (${allClones.length})</option>${names.map((n) => {
    const count = allClones.filter((c) => c.entityName === n).length;
    return `<option value="${escapeHtml(n)}">${escapeHtml(n)} (${count})</option>`;
  }).join('')}`;
  if (names.includes(chosen)) entityFilter.value = chosen;
}

function filteredClones() {
  const name = entityFilter && !entityFilter.classList.contains('d-none') ? entityFilter.value : '';
  return name ? allClones.filter((c) => c.entityName === name) : allClones;
}

entityFilter?.addEventListener('change', () => render(filteredClones()));

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

grid?.addEventListener('click', async (e) => {
  const lockBtn = e.target.closest('[data-action="lock"]');
  if (lockBtn) {
    const folder = lockBtn.closest('.site-card')?.dataset.folder;
    lockBtn.disabled = true;
    try {
      const res = await fetch(API.lockClone, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, locked: !lockBtn.dataset.locked }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not change the lock.');
      await loadLibrary();
    } catch (err) {
      alert(err.message);
      lockBtn.disabled = false;
    }
    return;
  }
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
    if (undoToastText && data.github?.deleted) undoToastText.textContent = `${name} deleted, and its GitHub repo ${data.github.repo}.`;
    if (undoToastText && data.github?.error) undoToastText.textContent = `${name} deleted. ${data.github.error}`;
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
