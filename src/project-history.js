/**
 * Project-level undo history.
 *
 * Editor actions that write files (theme, Fix with AI, logo swap, Save All,
 * head tags, generated pages) are wrapped here: the site is snapshotted on the
 * server first, so the toolbar undo button can step back through them.
 */
import { API } from './api.js';

/** POST endpoints that change HTML, PHP, or CSS on disk. */
const WRITE_ENDPOINTS = [
  [API.themePost, 'theme change'],
  [API.save, 'page edit'],
  [API.createPage, 'new page'],
  [API.generatePage, 'AI page'],
  [API.aiCustomize, 'AI assistant change'],
  [API.aiAudit, 'AI audit fix'],
  [API.fixWithAi, 'Fix with AI'],
  [API.aiFixSelection, 'section fix'],
  [API.aiEditSelection, 'AI edit'],
  [API.aiEdit, 'AI edit'],
  [API.headSnippets, 'SEO tags'],
  [API.replaceLogos, 'logo change'],
  [API.applyBrand, 'brand change'],
];

/** Reuse one snapshot when the same action fires several writes in a row. */
const COALESCE_MS = 2000;

function describe(url) {
  const match = WRITE_ENDPOINTS.find(([endpoint]) => url.includes(endpoint));
  return match ? match[1] : '';
}

export function initProjectHistory({ folder, onSnapshot, flushPendingEdits }) {
  let lastSnapshotAt = 0;
  let lastLabel = '';
  let flushing = false;

  async function callHistory(body) {
    const res = await fetch(API.history, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, ...body }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(text || 'History request failed'); }
    if (!data.success) throw new Error(data.error || 'History request failed');
    return data;
  }

  async function snapshot(label) {
    const now = Date.now();
    if (label === lastLabel && now - lastSnapshotAt < COALESCE_MS) return;
    lastSnapshotAt = now;
    lastLabel = label;
    const data = await callHistory({ action: 'snapshot', label });
    onSnapshot?.({ id: data.id, label });
  }

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = (init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    if (method === 'POST' && !url.includes(API.history)) {
      const label = describe(url);
      // When an outer action (e.g. theme change) flushes pending edits first,
      // that flush itself saves the page through this same patched fetch
      // (label 'page edit'). Skip it here — the outer action records its own
      // snapshot once the flush completes, so this nested save needs none.
      if (label && !(flushing && label === 'page edit')) {
        try {
          // Server actions read the page off disk, so unsaved preview edits
          // have to land there first or they are lost on the next reload.
          if (!flushing && label !== 'page edit') {
            flushing = true;
            try { await flushPendingEdits?.(); } finally { flushing = false; }
          }
          await snapshot(label);
        } catch (err) {
          console.warn('Could not save an undo step:', err.message);
        }
      }
    }
    return realFetch(input, init);
  };

  return {
    /** Roll the site back to a snapshot and return the step that reapplies it. */
    async restore(id, label) {
      const data = await callHistory({ action: 'restore', id, label });
      lastSnapshotAt = 0;
      return data;
    },
  };
}
