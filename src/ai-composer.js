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

export function initAiComposer({ folder, previewFrame, getSelected, getPage, reloadPreview, showSaveToast, allowImages = false }) {
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

  const suggestEl = document.getElementById('aicSuggest');
  const modesEl = document.getElementById('aicModes');
  let mode = 'change';       // 'change' an element, or 'add' a new section
  let insertPos = 'after';   // where a new section goes relative to the selected section
  const ADD_SUGGESTIONS = [
    'Testimonials with three customer quotes',
    'FAQ with five common questions',
    'Call-to-action banner with a button',
    'Pricing table with three plans',
    'Contact form with name, email and message',
    'Features grid with icons',
  ];
  const PLACEHOLDERS = {
    change: allowImages ? 'Tell AI what to change… (paste a screenshot with Ctrl/Cmd+V)' : 'Tell AI what to change…',
    add: 'Describe the section to add, e.g. “testimonials with three customer quotes”',
  };

  /** The section-sized block around the selection (a heading or button counts as its section). */
  function selectedBlock() {
    const sel = getSelected();
    const live = sel && previewFrame.contentDocument?.querySelector(`[data-cloner-id="${sel.id}"]`);
    return live ? sectionOf(live) : null;
  }

  function renderModes() {
    const block = selectedBlock();
    const where = block
      ? `<span class="aic-pos">
          <button type="button" data-pos="before" class="${insertPos === 'before' ? 'active' : ''}"><i class="bi bi-arrow-bar-up me-1"></i>Above</button>
          <button type="button" data-pos="after" class="${insertPos === 'after' ? 'active' : ''}"><i class="bi bi-arrow-bar-down me-1"></i>Below</button>
          <span class="aic-pos-note">the selected section</span>
        </span>`
      : '<span class="aic-pos"><span class="aic-pos-note">at the end of the page · or select a section to place it above or below</span></span>';
    modesEl.innerHTML = `
      <span class="aic-mode-switch">
        <button type="button" data-mode="change" class="${mode === 'change' ? 'active' : ''}"><i class="bi bi-pencil me-1"></i>Change</button>
        <button type="button" data-mode="add" class="${mode === 'add' ? 'active' : ''}"><i class="bi bi-plus-square me-1"></i>Add section</button>
      </span>
      ${mode === 'add' ? where : ''}`;
    promptEl.placeholder = PLACEHOLDERS[mode];
  }

  const TYPE_INFO = {
    image: { icon: 'bi-image', name: 'Image' },
    text: { icon: 'bi-type', name: 'Text' },
    link: { icon: 'bi-link-45deg', name: 'Link' },
    button: { icon: 'bi-hand-index', name: 'Button' },
    icon: { icon: 'bi-emoji-smile', name: 'Icon' },
    video: { icon: 'bi-play-btn', name: 'Video' },
    input: { icon: 'bi-input-cursor-text', name: 'Form field' },
  };
  const SUGGESTIONS = {
    image: ['Replace it with a similar, higher-quality photo', 'Add rounded corners and a soft shadow', 'Make it fill the full width'],
    text: ['Rewrite it to sound more professional', 'Make it bigger and bolder', 'Use the brand color for it'],
    link: ['Make this link stand out more', 'Underline it only on hover'],
    button: ['Make this button stand out more', 'Round the corners and add a hover effect', 'Change the text to “Get started”'],
    page: ['Modernize the hero section', 'Improve spacing and font sizes', 'Make the page feel more premium'],
  };

  const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** What the selected element looks like: an image thumbnail or a short text excerpt. */
  function previewOf(sel) {
    const live = previewFrame.contentDocument?.querySelector(`[data-cloner-id="${sel.id}"]`);
    if (sel.type === 'image') {
      const img = live?.tagName === 'IMG' ? live : live?.querySelector('img');
      return { thumb: img?.currentSrc || img?.src || '', text: (img?.getAttribute('alt') || sel.alt || '').trim() };
    }
    const text = (live?.innerText || sel.text || '').replace(/\s+/g, ' ').trim();
    return { thumb: '', text: text.length > 80 ? `${text.slice(0, 80)}…` : text };
  }

  function renderSuggestions(kind) {
    suggestEl.innerHTML = '';
    for (const idea of mode === 'add' ? ADD_SUGGESTIONS : (SUGGESTIONS[kind] || SUGGESTIONS.page)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = idea;
      chip.addEventListener('click', () => {
        promptEl.value = idea;
        promptEl.dispatchEvent(new Event('input'));
        promptEl.focus();
      });
      suggestEl.appendChild(chip);
    }
  }

  function renderContext() {
    renderModes();
    if (mode === 'add') {
      const block = selectedBlock();
      const label = block ? (block.getAttribute('id') ? `#${block.getAttribute('id')}` : `<${block.tagName.toLowerCase()}>`) : '';
      const text = block ? (block.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      contextEl.className = 'aic-target is-selected';
      contextEl.innerHTML = `
        <span class="aic-target-thumb"><i class="bi bi-plus-square"></i></span>
        <span class="aic-target-body">
          <span class="aic-target-kind">${block ? `New section ${insertPos === 'before' ? 'above' : 'below'} ${escapeText(label)}` : 'New section at the end of the page'}</span>
          <span class="aic-target-text">${block ? escapeText(text || 'selected section') : 'Before the footer. Select a section first to choose another place.'}</span>
        </span>`;
      renderSuggestions('add');
      return;
    }
    const sel = scopeElement();
    if (!sel) {
      const picked = getSelected();
      contextEl.className = 'aic-target is-page';
      contextEl.innerHTML = `
        <span class="aic-target-thumb"><i class="bi bi-window"></i></span>
        <span class="aic-target-body">
          <span class="aic-target-kind">Whole page</span>
          <span class="aic-target-text">${picked ? 'AI will edit the whole page.' : 'Click any element in the preview to change just that part.'}</span>
        </span>
        ${picked ? '<button type="button" class="aic-target-btn" data-scope="selection"><i class="bi bi-cursor me-1"></i>Back to selection</button>' : ''}`;
      contextEl.querySelector('[data-scope="selection"]')?.addEventListener('click', () => { wholePage = false; renderContext(); });
      renderSuggestions('page');
      return;
    }
    const info = TYPE_INFO[sel.type] || TYPE_INFO.text;
    const { thumb, text } = previewOf(sel);
    contextEl.className = 'aic-target is-selected';
    contextEl.innerHTML = `
      <span class="aic-target-thumb">${thumb ? `<img src="${escapeText(thumb)}" alt="" />` : `<i class="bi ${info.icon}"></i>`}</span>
      <span class="aic-target-body">
        <span class="aic-target-kind">Editing ${escapeText(info.name.toLowerCase())}${sel.isGlobal ? ' · all pages' : ''}</span>
        <span class="aic-target-text">${escapeText(text || sel.label || sel.tag)}</span>
      </span>
      <button type="button" class="aic-target-btn" data-scope="page" title="Edit the whole page instead"><i class="bi bi-arrows-fullscreen me-1"></i>Whole page</button>`;
    contextEl.querySelector('[data-scope="page"]').addEventListener('click', () => { wholePage = true; renderContext(); });
    renderSuggestions(SUGGESTIONS[sel.type] ? sel.type : 'text');
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

  const NO_IMAGES = 'Only admins can add screenshots. Describe the change in text instead.';

  async function addImage(source, label) {
    if (!allowImages) {
      setStatus(NO_IMAGES, 'error');
      return;
    }
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
    if (!allowImages) return setStatus(NO_IMAGES, 'error');
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

  /** Add a new section above/below the selected section, or at the end of the page. */
  async function sendAddSection(prompt) {
    const block = selectedBlock();
    let selection = null;
    if (block) {
      let selectorPath = '';
      try { selectorPath = uniqueSelector(block); } catch { selectorPath = ''; }
      selection = {
        tag: block.tagName.toLowerCase(),
        elementId: block.getAttribute('id') || '',
        classes: [...block.classList].filter((c) => !c.startsWith('cloner')).join(' '),
        outerHTML: block.outerHTML,
        selectorPath,
      };
    }
    busy = true;
    sendBtn.disabled = true;
    root.classList.add('busy');
    const idleLabel = sendBtn.innerHTML;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Adding…';
    promptEl.readOnly = true;
    setStatus('Designing the new section to match the site… (up to a minute if an image is created)');
    try {
      const res = await fetch(API.aiEdit, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          page: getPage(),
          prompt,
          images: attachments.map((a) => a.dataUrl),
          selection,
          insert: block ? insertPos : 'end',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'The AI could not add this section.');
      setStatus(`${data.summary || 'Section added.'} — saved to ${(data.filesChanged || []).join(', ')}`, 'ok');
      promptEl.value = '';
      fitPrompt();
      attachments = [];
      renderAttachments();
      reloadPreview();
      showSaveToast('New section added.');
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      busy = false;
      sendBtn.disabled = false;
      sendBtn.innerHTML = idleLabel;
      promptEl.readOnly = false;
      root.classList.remove('busy');
    }
  }

  async function send() {
    const prompt = promptEl.value.trim();
    if (busy) return;
    if (!prompt) return setStatus(mode === 'add' ? 'Describe the section you want to add.' : 'Describe the change you want.', 'error');
    if (mode === 'add') return sendAddSection(prompt);
    const sel = scopeElement();
    let selectorPath = '';
    let size = null;
    const liveEl = sel && previewFrame.contentDocument?.querySelector(`[data-cloner-id="${sel.id}"]`);
    if (liveEl) {
      try { selectorPath = uniqueSelector(liveEl); } catch { selectorPath = ''; }
      const rect = liveEl.getBoundingClientRect();
      if (rect.width && rect.height) size = { width: Math.round(rect.width), height: Math.round(rect.height) };
    }
    busy = true;
    sendBtn.disabled = true;
    root.classList.add('busy');
    const idleLabel = sendBtn.innerHTML;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Applying…';
    promptEl.readOnly = true;
    setStatus(attachments.length
      ? 'Reading your screenshots and editing the site… (up to a minute if a new image is created)'
      : 'Editing the site… (up to a minute if a new image is created)');
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
            classes: sel.classes, outerHTML: sel.outerHTML, isGlobal: sel.isGlobal, selectorPath, ...size,
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
        fitPrompt();
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
      sendBtn.innerHTML = idleLabel;
      promptEl.readOnly = false;
      root.classList.remove('busy');
    }
  }

  function fitPrompt() {
    promptEl.style.height = 'auto';
    promptEl.style.height = `${Math.max(34, promptEl.scrollHeight)}px`;
  }

  modesEl?.addEventListener('click', (event) => {
    const modeBtn = event.target.closest('[data-mode]');
    const posBtn = event.target.closest('[data-pos]');
    if (modeBtn) mode = modeBtn.dataset.mode;
    if (posBtn) insertPos = posBtn.dataset.pos;
    if (modeBtn || posBtn) { renderContext(); promptEl.focus(); }
  });

  function bind() {
    // The composer is always open; the toolbar button just jumps to the prompt.
    renderContext();
    // One line by default, growing with the text up to the CSS max-height.
    promptEl.addEventListener('input', fitPrompt);
    document.getElementById('aiComposerBtn')?.addEventListener('click', () => promptEl.focus());
    if (allowImages) {
      document.getElementById('aicAttach').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => { await addFiles(fileInput.files); fileInput.value = ''; });
      root.querySelectorAll('[data-capture]').forEach((btn) => btn.addEventListener('click', () => capture(btn.dataset.capture)));
    } else {
      // Regular users work with text only: no attach, camera or pasted/dropped screenshots.
      document.getElementById('aicAttach')?.remove();
      root.querySelector('[data-capture]')?.closest('.dropup')?.remove();
      fileInput?.remove();
      promptEl.placeholder = PLACEHOLDERS[mode];
    }
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
      addFiles(images); // refused with a message for non-admins
    });
    root.addEventListener('dragover', (event) => { event.preventDefault(); if (allowImages) root.classList.add('dragging'); });
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
      renderContext();
    },
  };
}
