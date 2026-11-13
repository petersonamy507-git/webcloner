/** Change any selected element with AI: text, image, logo, or video. */
import { API } from './api.js';

export function initAiEditSelection({
  folder,
  previewFrame,
  getSelectedElement,
  getCurrentPage,
  loadPreview,
  showSaveToast,
}) {
  let running = false;

  function setStatus(msg, isError = false) {
    const el = document.getElementById('aiEditSelectionStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'small text-danger mt-2' : 'small text-success mt-2';
  }

  function sync(selection) {
    const target = document.getElementById('aiEditSelectionTarget');
    if (!target) return;
    if (!selection) {
      target.textContent = 'Select text, an image, a logo, or a video in the preview.';
      return;
    }
    const kind = selection.type || selection.tag || 'element';
    const preview = (selection.text || selection.alt || selection.src || '').trim().slice(0, 80);
    target.textContent = preview
      ? `Selected ${selection.label || kind}: ${preview}`
      : `Selected ${selection.label || kind}. Describe the change, or upload a replacement.`;
  }

  function readUpload() {
    const input = document.getElementById('aiEditSelectionFile');
    const file = input?.files?.[0];
    if (!file) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        resolve({
          mediaBase64: dataUrl.split(',')[1] || '',
          mediaExt: (file.name.split('.').pop() || 'png').toLowerCase(),
        });
      };
      reader.onerror = () => reject(new Error('Could not read the uploaded file.'));
      reader.readAsDataURL(file);
    });
  }

  async function runEdit() {
    if (running) return;
    const selection = getSelectedElement?.();
    if (!selection) {
      setStatus('Select something in the preview first.', true);
      return;
    }
    const prompt = document.getElementById('aiEditSelectionPrompt')?.value?.trim() || '';
    const upload = await readUpload();
    if (!prompt && !upload) {
      setStatus('Type what to change, or upload an image, logo, or video.', true);
      return;
    }

    running = true;
    const btn = document.getElementById('aiEditSelectionBtn');
    const oldHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Applying…';
    }
    setStatus(upload ? 'Saving your file and updating the element…' : 'AI is updating the selected element…');

    try {
      const res = await fetch(API.aiEditSelection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          page: getCurrentPage?.() || 'index.html',
          selection: {
            id: selection.id,
            tag: selection.tag,
            type: selection.type,
            label: selection.label,
            outerHTML: selection.outerHTML,
            innerHTML: selection.innerHTML,
            text: selection.text || '',
            src: selection.src || '',
            alt: selection.alt || '',
            elementId: selection.elementId,
            classes: selection.classes,
            isGlobal: selection.isGlobal,
          },
          prompt,
          mediaBase64: upload?.mediaBase64 || '',
          mediaExt: upload?.mediaExt || '',
        }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text.slice(0, 240) || 'Server error'); }
      if (!data.success) throw new Error(data.error || 'AI edit failed');

      if (data.fixedOuterHTML && selection.id) {
        previewFrame?.contentWindow?.postMessage({
          type: 'CLONER_REPLACE_OUTER',
          id: selection.id,
          outerHTML: data.fixedOuterHTML,
        }, '*');
      } else {
        loadPreview?.(getCurrentPage?.());
      }

      const fileInput = document.getElementById('aiEditSelectionFile');
      if (fileInput) fileInput.value = '';
      setStatus(data.message || 'Updated.');
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
    document.getElementById('aiEditSelectionBtn')?.addEventListener('click', runEdit);
    document.querySelectorAll('.ai-edit-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const prompt = document.getElementById('aiEditSelectionPrompt');
        if (prompt) {
          prompt.value = chip.dataset.prompt || '';
          prompt.focus();
        }
      });
    });
  }

  return { bind, sync, runEdit };
}
