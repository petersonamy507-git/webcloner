/** Fix one selected section by comparing with the live original site */
import { API } from './api.js';

export function initAiFixSelection({
  folder,
  previewFrame,
  getSelectedElement,
  getCurrentPage,
  loadPreview,
  showSaveToast,
}) {
  let running = false;

  function setStatus(msg, isError = false) {
    const el = document.getElementById('fixFromOriginalStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'small text-danger mt-2' : 'small text-success mt-2';
  }

  function sanitizeSelection(selection) {
    if (!selection) return null;
    const cleanHtml = (html) => (html || '')
      .replace(/\s*data-cloner-id="[^"]*"/g, '')
      .replace(/\s*data-cloner-selected="[^"]*"/g, '')
      .replace(/\s*data-cloner-inline="[^"]*"/g, '')
      .replace(/\s*contenteditable="[^"]*"/g, '');
    return {
      ...selection,
      outerHTML: cleanHtml(selection.outerHTML),
      innerHTML: cleanHtml(selection.innerHTML),
    };
  }

  async function runFix() {
    if (running) return;
    const selection = sanitizeSelection(getSelectedElement?.());
    if (!selection) {
      alert('Select a section in the preview first.');
      return;
    }

    running = true;
    const btn = document.getElementById('fixFromOriginalBtn');
    const oldHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Fixing…';
    }
    setStatus('Original site se compare ho raha hai…');

    try {
      const res = await fetch(API.aiFixSelection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          page: getCurrentPage?.() || 'index.html',
          selection: {
            tag: selection.tag,
            type: selection.type,
            label: selection.label,
            outerHTML: selection.outerHTML,
            innerHTML: selection.innerHTML,
            elementId: selection.elementId,
            classes: selection.classes,
            isGlobal: selection.isGlobal,
          },
          prompt: document.getElementById('fixFromOriginalNote')?.value?.trim() || '',
          useAI: true,
        }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text || 'Server error'); }
      if (!data.success) throw new Error(data.error || 'Fix failed');

      const applied = data.applied || {};
      let msg = data.message || 'Section fixed from original.';
      if (applied.globalPages) msg += ` Updated ${applied.globalPages} page(s).`;
      if (applied.includes) msg += ` Updated ${applied.includes} include file(s).`;
      if (!data.originalFound) msg += ' (Original section approximated.)';
      setStatus(msg);

      if (data.fixedOuterHTML && selection.id) {
        previewFrame?.contentWindow?.postMessage({
          type: 'CLONER_REPLACE_OUTER',
          id: selection.id,
          outerHTML: data.fixedOuterHTML,
          saved: true,
        }, '*');
      } else {
        loadPreview?.(getCurrentPage?.());
      }

      showSaveToast?.();
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      running = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
    }
  }

  function bind() {
    document.getElementById('fixFromOriginalBtn')?.addEventListener('click', runFix);

    document.querySelectorAll('.fix-origin-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const note = document.getElementById('fixFromOriginalNote');
        if (note) note.value = chip.dataset.note || '';
      });
    });
  }

  return { bind, runFix };
}
