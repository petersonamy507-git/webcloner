/**
 * Version history panel: every saved version of the site, who made it, which
 * files changed (with a line diff), and restore for workspace admins.
 */
import { API } from './api.js';

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function timeAgo(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

export function initVersionHistory({ folder, onRestored, closeOtherPanels }) {
  const panel = document.getElementById('historyPanel');
  const list = document.getElementById('historyList');
  const statusEl = document.getElementById('historyStatus');
  const diffBox = document.getElementById('historyDiff');
  let versions = [];
  let canRestore = false;

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
  }

  async function load() {
    try {
      const res = await fetch(API.versions(folder));
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not load the version history.');
      versions = data.versions;
      canRestore = data.canRestore;
      render();
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function changeSummary(changes = {}) {
    const parts = [];
    if (changes.modified?.length) parts.push(`${changes.modified.length} changed`);
    if (changes.added?.length) parts.push(`${changes.added.length} added`);
    if (changes.removed?.length) parts.push(`${changes.removed.length} removed`);
    return parts.join(' · ') || 'no file changes';
  }

  function fileList(v) {
    const rows = [
      ...(v.changes.modified || []).map((f) => ['M', f]),
      ...(v.changes.added || []).map((f) => ['A', f]),
      ...(v.changes.removed || []).map((f) => ['D', f]),
    ];
    const more = (v.changes.total || 0) - rows.length;
    return rows.map(([kind, file]) => `
      <button type="button" class="hist-file" data-diff="${v.id}" data-file="${escapeHtml(file)}" title="Show what changed">
        <span class="hist-kind hist-kind-${kind}">${kind}</span>${escapeHtml(file)}
      </button>`).join('') + (more > 0 ? `<div class="hist-more">…and ${more} more files</div>` : '');
  }

  function render() {
    if (!versions.length) {
      list.innerHTML = '<p class="asset-empty">No versions yet. A version is saved automatically every time the site changes.</p>';
      return;
    }
    list.innerHTML = versions.map((v) => `
      <details class="hist-item${v.isCurrent ? ' current' : ''}">
        <summary>
          <span class="hist-num">v${v.number}</span>
          <span class="hist-main">
            <span class="hist-label">${escapeHtml(v.label || v.action)}</span>
            <span class="hist-meta">${escapeHtml(v.userName || v.userEmail || 'System')} · <span title="${escapeHtml(new Date(v.createdAt).toLocaleString())}">${timeAgo(v.createdAt)}</span> · ${changeSummary(v.changes)}</span>
          </span>
          ${v.isCurrent ? '<span class="hist-current">current</span>' : ''}
        </summary>
        <div class="hist-body">
          ${v.restoredFrom ? `<div class="hist-meta">Restored from version ${v.restoredFrom}</div>` : ''}
          ${fileList(v)}
          ${canRestore && !v.isCurrent ? `<button type="button" class="hist-restore" data-restore="${v.id}" data-number="${v.number}"><i class="bi bi-arrow-counterclockwise me-1"></i>Restore this version</button>` : ''}
        </div>
      </details>`).join('');
  }

  async function showDiff(id, file) {
    diffBox.classList.remove('d-none');
    diffBox.querySelector('.hist-diff-title').textContent = file;
    const pre = diffBox.querySelector('pre');
    pre.textContent = 'Loading…';
    try {
      const res = await fetch(API.versionDiff(id, file));
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not load the changes.');
      pre.innerHTML = (data.diff || 'No line changes.').split('\n').map((line) => {
        const cls = line.startsWith('+') && !line.startsWith('+++') ? 'add'
          : line.startsWith('-') && !line.startsWith('---') ? 'del'
            : line.startsWith('@@') ? 'hunk' : '';
        return `<span class="${cls}">${escapeHtml(line)}</span>`;
      }).join('\n');
    } catch (err) {
      pre.textContent = err.message;
    }
  }

  async function restore(id, number) {
    if (!confirm(`Restore the site to version ${number}?\n\nThe current state is kept as its own version, so you can switch back at any time.`)) return;
    setStatus(`Restoring version ${number}…`);
    try {
      const res = await fetch(API.restoreVersion(id), { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not restore this version.');
      setStatus(`Restored version ${number} (${data.restored} files updated${data.removed ? `, ${data.removed} removed` : ''}).`);
      await load();
      onRestored();
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function bind() {
    document.getElementById('historyPanelBtn').addEventListener('click', () => {
      const open = !panel.classList.contains('open');
      if (open) closeOtherPanels();
      panel.classList.toggle('open', open);
      if (open) { setStatus(''); load(); }
    });
    document.getElementById('historyPanelClose').addEventListener('click', () => panel.classList.remove('open'));
    document.getElementById('historyDiffClose').addEventListener('click', () => diffBox.classList.add('d-none'));
    list.addEventListener('click', (event) => {
      const fileBtn = event.target.closest('[data-diff]');
      const restoreBtn = event.target.closest('[data-restore]');
      if (fileBtn) showDiff(fileBtn.dataset.diff, fileBtn.dataset.file);
      if (restoreBtn) restore(restoreBtn.dataset.restore, restoreBtn.dataset.number);
    });
  }

  return {
    bind,
    close: () => panel.classList.remove('open'),
    /** Refresh after any change made elsewhere in the editor. */
    refresh: () => { if (panel.classList.contains('open')) load(); },
  };
}
