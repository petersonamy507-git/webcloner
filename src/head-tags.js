import { API } from './api.js';

export function initHeadTags({ folder, loadPreview, showSaveToast }) {
  const modalEl = document.getElementById('headTagsModal');
  const input = document.getElementById('headTagsInput');
  const status = document.getElementById('headTagsStatus');
  const applyBtn = document.getElementById('headTagsApplyBtn');
  if (!modalEl || !input || !applyBtn) return { bind() {} };

  let loadToken = 0;

  function modalInstance() {
    return bootstrap.Modal.getOrCreateInstance(modalEl);
  }

  function closeModal() {
    const instance = modalInstance();
    if (instance._isTransitioning) {
      modalEl.addEventListener('shown.bs.modal', () => instance.hide(), { once: true });
      return;
    }
    instance.hide();
  }

  function setStatus(message, kind = '') {
    if (!status) return;
    status.textContent = message;
    status.className = `head-tags-status${kind ? ` is-${kind}` : ''}`;
  }

  async function open() {
    const token = ++loadToken;
    setStatus('');
    input.value = '';
    modalInstance().show();
    try {
      const res = await fetch(API.headSnippets, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      });
      const data = await res.json().catch(() => ({}));
      if (token !== loadToken) return;
      if (!res.ok || data.success === false) {
        setStatus(data.error || 'Saved tags could not be loaded. You can still paste a new snippet.', 'error');
        return;
      }
      input.value = data.snippet || '';
    } catch {
      if (token !== loadToken) return;
      setStatus('Saved tags could not be loaded. You can still paste a new snippet.', 'error');
    }
  }

  async function apply() {
    const snippet = input.value;
    applyBtn.disabled = true;
    setStatus('Saving…');
    try {
      const res = await fetch(API.headSnippets, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, snippet }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || 'Could not save the snippet.');
      loadToken += 1;
      input.value = '';
      setStatus('');
      showSaveToast?.(snippet.trim() ? 'SEO tags applied successfully' : 'SEO tags removed');
      closeModal();
      await loadPreview?.();
    } catch (err) {
      setStatus(err.message || 'Could not save the snippet.', 'error');
    } finally {
      applyBtn.disabled = false;
    }
  }

  function bind() {
    document.getElementById('headTagsBtn')?.addEventListener('click', open);
    applyBtn.addEventListener('click', apply);
  }

  return { bind };
}
