/** Fix with AI — describe a page problem and apply the code fix. */
import { API } from './api.js';

const EXAMPLES = [
  'Fix the logo position in the header so it sits in line with the menu.',
  'The logo is too big after I replaced it. Make it fit the header.',
  'Match the site theme colors to the logo.',
  'Change the theme to dark navy and gold.',
];

export function initFixWithAi({ folder, pageSelect, loadPreview, showSaveToast, getCurrentPage, getSelectedElement }) {
  let modal;
  let running = false;

  function setStatus(message, isError = false) {
    const el = document.getElementById('fixWithAiStatus');
    if (!el) return;
    el.textContent = message;
    el.className = isError ? 'small text-danger mt-2' : 'small text-success mt-2';
  }

  async function runFix() {
    if (running) return;
    const prompt = document.getElementById('fixWithAiPrompt')?.value.trim();
    if (!prompt) {
      setStatus('Describe what is wrong or what you want changed.', true);
      return;
    }

    running = true;
    const btn = document.getElementById('fixWithAiRunBtn');
    const oldHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Fixing...';
    }
    const selected = getSelectedElement?.();
    const imageSrc = selected?.type === 'image' ? selected.src : '';
    setStatus(imageSrc
      ? 'Sending the selected image so the model can read its colors...'
      : 'Reading the page code and applying the fix...');

    try {
      const page = getCurrentPage?.() || pageSelect?.value || 'index.html';
      const res = await fetch(API.fixWithAi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, page, prompt, imageSrc }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text || 'Server error'); }
      if (!res.ok || !data.success) throw new Error(data.error || 'Fix failed.');

      const applied = data.applied || {};
      const parts = [];
      if (applied.sectionsRemoved) parts.push(`${applied.sectionsRemoved} repeated section${applied.sectionsRemoved === 1 ? '' : 's'} removed`);
      if (data.imageRead) parts.push('read the image');
      if (applied.textReplacements) parts.push(applied.files ? `text updated in ${applied.files} file${applied.files === 1 ? '' : 's'}` : 'text updated');
      if (applied.theme) parts.push('theme updated');
      if (applied.cssRules) parts.push(`${applied.cssRules} CSS rule${applied.cssRules === 1 ? '' : 's'}`);
      if (applied.styleUpdates) parts.push(`${applied.styleUpdates} style update${applied.styleUpdates === 1 ? '' : 's'}`);
      setStatus(`${data.summary}${parts.length ? ` (${parts.join(', ')})` : ''}`);
      loadPreview(pageSelect?.value || page);
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
    modal = new bootstrap.Modal(document.getElementById('fixWithAiModal'));
    const chips = document.getElementById('fixWithAiExamples');
    if (chips) {
      chips.innerHTML = EXAMPLES.map((text) => (
        `<button type="button" class="btn btn-sm btn-outline-info fix-ai-chip">${text}</button>`
      )).join('');
      chips.querySelectorAll('.fix-ai-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const input = document.getElementById('fixWithAiPrompt');
          if (input) input.value = chip.textContent;
        });
      });
    }
    function showImageNote() {
      const note = document.getElementById('fixWithAiImageNote');
      if (!note) return;
      const selected = getSelectedElement?.();
      if (selected?.type === 'image' && selected.src) {
        note.textContent = 'The image you selected will be sent to the model so it can read the logo colors.';
      } else {
        note.textContent = 'No image is selected. The logo is sent only when the request is about the logo or colors.';
      }
    }
    document.getElementById('fixWithAiBtn')?.addEventListener('click', () => {
      setStatus('');
      showImageNote();
      modal.show();
    });
    document.getElementById('fixWithAiOpenBtn')?.addEventListener('click', () => {
      setStatus('');
      showImageNote();
      modal.show();
    });
    document.getElementById('fixWithAiRunBtn')?.addEventListener('click', runFix);
  }

  return { bind };
}
