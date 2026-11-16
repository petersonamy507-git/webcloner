/**
 * "Ask AI" composer: a prompt box that takes pasted, dropped, attached or
 * captured screenshots alongside the text, and edits the site's real files.
 */
import { API } from './api.js';

const MAX_IMAGES = 4;
const MAX_WIDTH = 1600;
const EDITOR_OVERLAYS = '.cloner-edit-hint, .cloner-drop-indicator, .cloner-drag-ghost, .cloner-file-drop-overlay, #cloner-editor-style';

/** Downscale to MAX_WIDTH and re-encode, so screenshots stay well under the upload limit. */
async function normalizeImage(source) {
  const bitmap = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

/**
 * Load html2canvas inside the preview frame, so the page's own (relative) CSS and
 * images resolve exactly as they do on screen. The script tag is removed as soon
 * as it has run, so it can never be saved into the site's HTML.
 */
function frameHtml2canvas(win) {
  if (win.html2canvas) return Promise.resolve(win.html2canvas);
  return new Promise((resolve, reject) => {
    const script = win.document.createElement('script');
    script.src = HTML2CANVAS_URL;
    script.onload = () => { script.remove(); resolve(win.html2canvas); };
    script.onerror = () => { script.remove(); reject(new Error('could not load the screenshot tool')); };
    win.document.head.appendChild(script);
  });
}

/** A CSS selector that matches only this element, so AI styles can't leak onto similar elements. */
function uniqueSelector(el) {
  const doc = el.ownerDocument;
  const esc = (value) => doc.defaultView.CSS.escape(value);
  const parts = [];
  for (let node = el; node && node !== doc.documentElement; node = node.parentElement) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`${part}#${esc(node.id)}`);
      if (doc.querySelectorAll(parts.join(' > ')).length === 1) return parts.join(' > ');
      continue;
    }
    const classes = [...node.classList].filter((c) => !c.startsWith('cloner')).slice(0, 2);
    if (classes.length) part += classes.map((c) => `.${esc(c)}`).join('');
    const siblings = node.parentElement ? [...node.parentElement.children].filter((s) => s.matches(part)) : [];
    if (siblings.length > 1) part += `:nth-of-type(${[...node.parentElement.children].filter((s) => s.tagName === node.tagName).indexOf(node) + 1})`;
    parts.unshift(part);
    if (doc.querySelectorAll(parts.join(' > ')).length === 1 && parts.length > 1) return parts.join(' > ');
  }
  return parts.join(' > ');
}

/** The block a "section" screenshot should cover: the nearest section-like ancestor. */
function sectionOf(el) {
  const block = el.closest('section, header, footer, main, article, nav, [class*="section"], [class*="banner"], [class*="hero"]');
  if (block && block !== el.ownerDocument.body) return block;
  let node = el;
  while (node.parentElement && node.parentElement !== el.ownerDocument.body
    && node.getBoundingClientRect().height < 200) node = node.parentElement;
  return node;
}

export function initAiComposer({ folder, previewFrame, getSelected, getPage, reloadPreview, showSaveToast }) {
  const root = document.getElementById('aiComposer');
  const promptEl = document.getElementById('aicPrompt');
  const attachmentsEl = document.getElementById('aicAttachments');
  const contextEl = document.getElementById('aicContext');
  const statusEl = document.getElementById('aicStatus');
  const sendBtn = document.getElementById('aicSend');
  const fileInput = document.getElementById('aicFile');
  let attachments = [];
  let wholePage = false;
  let busy = false;

  function setStatus(message, kind = '') {
    statusEl.textContent = message;
    statusEl.className = `aic-status ${kind}`;
  }

  function scopeElement() {
    return wholePage ? null : getSelected();
  }

  function renderContext() {
    const sel = scopeElement();
    contextEl.innerHTML = '';
    const chip = document.createElement('span');
    chip.className = 'aic-chip';
    if (sel) {
      chip.textContent = `Editing: ${sel.label || sel.tag}`;
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.title = 'Edit the whole page instead';
      clear.innerHTML = '<i class="bi bi-x"></i>';
      clear.addEventListener('click', () => { wholePage = true; renderContext(); });
      chip.appendChild(clear);
    } else {
      chip.textContent = getSelected() ? 'Editing: whole page' : 'Editing: whole page · click an element to focus on it';
    }
    contextEl.appendChild(chip);
  }

  function renderAttachments() {
    attachmentsEl.innerHTML = '';
    attachmentsEl.classList.toggle('d-none', !attachments.length);
    attachments.forEach((item, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'aic-thumb';
      wrap.title = item.label;
      const img = document.createElement('img');
      img.src = item.dataUrl;
      img.alt = item.label;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.title = 'Remove';
      remove.innerHTML = '<i class="bi bi-x"></i>';
      remove.addEventListener('click', () => { attachments.splice(index, 1); renderAttachments(); });
      wrap.append(img, remove);
      attachmentsEl.appendChild(wrap);
    });
  }

  async function addImage(source, label) {
    if (attachments.length >= MAX_IMAGES) {
      setStatus(`You can attach up to ${MAX_IMAGES} screenshots.`, 'error');
      return;
    }
    try {
      attachments.push({ dataUrl: await normalizeImage(source), label });
      renderAttachments();
      setStatus('');
    } catch {
      setStatus('That image could not be read.', 'error');
    }
  }

  async function addFiles(files) {
    for (const file of files) {
      if (file.type.startsWith('image/')) await addImage(file, file.name || 'Pasted screenshot');
    }
  }

  async function capture(mode) {
    const doc = previewFrame.contentDocument;
    const win = previewFrame.contentWindow;
    if (!doc?.documentElement) return setStatus('The preview is still loading. Try again in a moment.', 'error');
    // Always render the whole document and crop: rendering a single element that
    // lives inside an iframe makes html2canvas mis-measure it.
    const options = {
      useCORS: true, logging: false, backgroundColor: '#ffffff',
      windowWidth: win.innerWidth, windowHeight: win.innerHeight,
    };
    if (mode === 'viewport') {
      Object.assign(options, { x: win.scrollX, y: win.scrollY, width: win.innerWidth, height: win.innerHeight });
    } else {
      const sel = getSelected();
      const el = sel && doc.querySelector(`[data-cloner-id="${sel.id}"]`);
      if (!el) return setStatus('Click an element in the preview first.', 'error');
      const rect = (mode === 'section' ? sectionOf(el) : el).getBoundingClientRect();
      Object.assign(options, {
        x: Math.max(0, rect.left + win.scrollX),
        y: Math.max(0, rect.top + win.scrollY),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.min(Math.round(rect.height), 4000)),
      });
    }
    options.scale = Math.min(1, MAX_WIDTH / options.width) * (win.devicePixelRatio > 1 ? 1.5 : 1);
    options.onclone = async (cloned) => {
      cloned.querySelectorAll(EDITOR_OVERLAYS).forEach((node) => node.remove());
      cloned.querySelectorAll('[data-cloner-selected], [data-cloner-inline]').forEach((node) => {
        node.removeAttribute('data-cloner-selected');
        node.removeAttribute('data-cloner-inline');
      });
      // html2canvas's copy gets the editor's URL as its base, so the site's relative
      // stylesheet and image paths would 404. Point them at the real files.
      const absolute = (value) => { try { return new URL(value, doc.baseURI).href; } catch { return value; } };
      const loading = [];
      cloned.querySelectorAll('link[rel~="stylesheet"][href]').forEach((link) => {
        const url = absolute(link.getAttribute('href'));
        if (link.href === url) return;
        loading.push(new Promise((resolve) => {
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 5000);
        }));
        link.setAttribute('href', url);
      });
      cloned.querySelectorAll('img[src]').forEach((img) => img.setAttribute('src', absolute(img.getAttribute('src'))));
      cloned.querySelectorAll('img[srcset], source[srcset]').forEach((node) => node.removeAttribute('srcset'));
      await Promise.all(loading);
    };
    setStatus('Capturing…');
    try {
      const html2canvas = await frameHtml2canvas(win);
      const canvas = await html2canvas(doc.documentElement, options);
      const labels = { viewport: 'Visible area', element: 'Selected element', section: 'Selected section' };
      await addImage(canvas, labels[mode]);
    } catch (err) {
      setStatus(`Capture failed: ${err.message}`, 'error');
    }
  }

  async function send() {
    const prompt = promptEl.value.trim();
    if (busy) return;
    if (!prompt) return setStatus('Describe the change you want.', 'error');
    const sel = scopeElement();
    let selectorPath = '';
    const liveEl = sel && previewFrame.contentDocument?.querySelector(`[data-cloner-id="${sel.id}"]`);
    if (liveEl) {
      try { selectorPath = uniqueSelector(liveEl); } catch { selectorPath = ''; }
    }
    busy = true;
    sendBtn.disabled = true;
    root.classList.add('busy');
    setStatus(attachments.length ? 'Reading your screenshots and editing the site…' : 'Editing the site…');
    try {
      const res = await fetch(API.aiEdit, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          page: getPage(),
          prompt,
          images: attachments.map((a) => a.dataUrl),
          selection: sel ? {
            tag: sel.tag, label: sel.label, elementId: sel.elementId,
            classes: sel.classes, outerHTML: sel.outerHTML, isGlobal: sel.isGlobal, selectorPath,
          } : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'The AI could not make this change.');
      if (data.changed === false) {
        setStatus(data.summary || 'Nothing needed to change.', '');
      } else {
        const files = (data.filesChanged || []).join(', ');
        setStatus(`${data.summary}${files ? ` — saved to ${files}` : ''}`, 'ok');
        promptEl.value = '';
        attachments = [];
        renderAttachments();
        reloadPreview();
        showSaveToast('AI edit saved.');
      }
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      busy = false;
      sendBtn.disabled = false;
      root.classList.remove('busy');
    }
  }

  function open() {
    root.hidden = false;
    wholePage = false;
    renderContext();
    promptEl.focus();
  }

  function bind() {
    document.getElementById('aiComposerBtn').addEventListener('click', () => (root.hidden ? open() : (root.hidden = true)));
    document.getElementById('aicClose').addEventListener('click', () => { root.hidden = true; });
    document.getElementById('aicAttach').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => { await addFiles(fileInput.files); fileInput.value = ''; });
    root.querySelectorAll('[data-capture]').forEach((btn) => btn.addEventListener('click', () => capture(btn.dataset.capture)));
    sendBtn.addEventListener('click', send);
    promptEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); }
    });
    // Ctrl/Cmd+V of a screenshot attaches it; ordinary text pastes as usual.
    root.addEventListener('paste', (event) => {
      const images = [...(event.clipboardData?.items || [])]
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!images.length) return;
      event.preventDefault();
      addFiles(images);
    });
    root.addEventListener('dragover', (event) => { event.preventDefault(); root.classList.add('dragging'); });
    root.addEventListener('dragleave', () => root.classList.remove('dragging'));
    root.addEventListener('drop', (event) => {
      event.preventDefault();
      root.classList.remove('dragging');
      addFiles(event.dataTransfer.files);
    });
  }

  return {
    bind,
    /** The editor calls this whenever the selection changes. */
    selectionChanged() {
      wholePage = false;
      if (!root.hidden) renderContext();
    },
  };
}
