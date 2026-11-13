/** AI Site Assistant — logo, theme, and prompt-based branding */
import { API } from './api.js';

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function initAiCustomize({ folder, previewFrame, pageSelect, loadPreview, showSaveToast }) {
  let modal;

  function setStatus(msg, isError = false) {
    const el = document.getElementById('aiCustomizeStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'small text-danger mt-2' : 'small text-success mt-2';
  }

  function fillPrompt(text) {
    document.getElementById('aiCustomizePrompt').value = text;
  }

  async function uploadLogo(file) {
    const ext = file.name.split('.').pop() || 'png';
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          const res = await fetch(API.upload, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder, data: reader.result.split(',')[1], ext }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || 'Upload failed');
          resolve(data.url);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function runCustomize() {
    const btn = document.getElementById('aiCustomizeBtn');
    const prompt = document.getElementById('aiCustomizePrompt').value.trim();
    let logoUrl = document.getElementById('aiCustomizeLogoUrl').value.trim();

    if (!prompt) {
      setStatus('Describe what you want to change.', true);
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>AI is working...';
    setStatus('Analyzing your site and applying changes...');

    try {
      const file = document.getElementById('aiCustomizeLogoFile').files[0];
      let logoBase64 = '';
      if (file) {
        logoBase64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        if (!logoUrl) {
          logoUrl = await uploadLogo(file);
          document.getElementById('aiCustomizeLogoUrl').value = logoUrl;
        }
      }

      const res = await fetch(API.aiCustomize, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, prompt, logoUrl, logoBase64 }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || 'Server error');
      }
      if (!data.success) throw new Error(data.error || 'AI customize failed');

      const parts = [];
      if (data.applied?.logoRecolored) parts.push('logo colors matched to the site theme');
      if (data.applied?.logoResized) parts.push('header logo height 70px, 52px on mobile');
      if (data.applied?.theme) parts.push('theme colors');
      if (data.applied?.logos) parts.push(`logo (${data.applied.logos} places)`);
      if (data.applied?.cssRules) parts.push(`${data.applied.cssRules} style rules`);

      setStatus(data.summary + (parts.length ? ` — Updated: ${parts.join(', ')}.` : ''));
      loadPreview(pageSelect.value);
      showSaveToast?.();

      if (data.suggestions?.length) {
        const sug = document.getElementById('aiCustomizeSuggestions');
        sug.innerHTML = data.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
        sug.classList.remove('d-none');
      }
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-magic me-1"></i>Apply with AI';
    }
  }

  function bind() {
    modal = new bootstrap.Modal(document.getElementById('aiCustomizeModal'));

    document.getElementById('aiAssistantBtn')?.addEventListener('click', () => {
      setStatus('');
      document.getElementById('aiCustomizeSuggestions').classList.add('d-none');
      modal.show();
    });

    document.getElementById('aiCustomizeBtn')?.addEventListener('click', runCustomize);

    document.querySelectorAll('.ai-prompt-chip').forEach((chip) => {
      chip.addEventListener('click', () => fillPrompt(chip.dataset.prompt));
    });

    document.getElementById('aiCustomizeLogoFile')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('aiCustomizeLogoPreview').src = URL.createObjectURL(file);
        document.getElementById('aiCustomizeLogoPreview').classList.remove('d-none');
      }
    });
  }

  return { bind };
}
