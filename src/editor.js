import './auth.js';
import { ICON_LIBRARIES } from './icon-libraries.js';
import { initSiteTools } from './site-tools.js';
import { initAiCustomize } from './ai-customize.js';
import { initAiAudit } from './ai-audit.js';
import { initFixWithAi } from './fix-with-ai.js';
import { initHeadTags } from './head-tags.js';
import { initAiFixSelection } from './ai-fix-selection.js';
import { initAiEditSelection } from './ai-edit-selection.js';
import { initProjectHistory } from './project-history.js';
import { initAssetLibrary } from './asset-library.js';
import { initAiComposer } from './ai-composer.js';
import { initVersionHistory } from './version-history.js';
import { API } from './api.js';

const params = new URLSearchParams(window.location.search);
const folder = params.get('folder');
if (!folder) window.location.href = '/';

const previewFrame = document.getElementById('previewFrame');
const pageSelect = document.getElementById('pageSelect');
const editSidebar = document.getElementById('editSidebar');
const elementLabel = document.getElementById('elementLabel');
const scopeBadge = document.getElementById('scopeBadge');
const viewSiteBtn = document.getElementById('viewSiteBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
if (downloadZipBtn) downloadZipBtn.href = API.download(folder);

/** Name the site in the toolbar so it is clear which clone is open. */
async function showProjectIdentity() {
  const nameEl = document.getElementById('projectName');
  const hostEl = document.getElementById('projectHost');
  if (!nameEl) return;
  nameEl.textContent = folder;
  try {
    const res = await fetch(API.clones);
    const data = await res.json();
    const clone = (data.clones || []).find((c) => c.folder === folder);
    if (!clone) return;
    nameEl.textContent = clone.title || folder;
    nameEl.title = clone.sourceUrl || folder;
    if (hostEl) {
      hostEl.textContent = `${clone.pageCount} page${clone.pageCount === 1 ? '' : 's'}`;
    }
  } catch { /* the toolbar still works without the name */ }
}
showProjectIdentity();

let currentPage = 'index.html';
let selectedElement = null;
let assetLibrary = null;
let aiComposer = null;
let pendingGlobalEdits = [];
let seoModal;
let iconLibraryModal;
let activeTab = 'content';
let currentAlign = '';
const installedLibs = new Set();
let activeLibId = 'bootstrap';
let customLibraries = {};
let moveMode = false;
let bridgeReady = false;
let bridgeInjecting = false;
let isRestoring = false;
let styleUndoCaptured = false;
const MAX_UNDO = 50;

/**
 * One ordered timeline for every editor change.
 * `dom` steps are unsaved preview edits, `project` steps were written to disk
 * and are reversed from a server-side snapshot.
 */
const undoStack = [];
const redoStack = [];

const projectHistory = initProjectHistory({
  folder,
  onSnapshot: (step) => pushHistoryStep({ kind: 'project', ...step }),
  flushPendingEdits,
});

/**
 * Server actions read the page off disk, so unsaved preview edits are written
 * out before one runs.
 */
async function flushPendingEdits() {
  if (isRestoring || !bridgeReady) return;
  if (!undoStack.some((step) => step.kind === 'dom')) return;
  const html = await getFrameHtml();
  if (html) await savePage(currentPage, html);
}

/** Saved edits live in the project snapshot, so drop their preview entries. */
function dropPendingEdits(page) {
  for (let i = undoStack.length - 1; i >= 0; i -= 1) {
    if (undoStack[i].kind === 'dom' && undoStack[i].page === page) undoStack.splice(i, 1);
  }
  updateUndoButtons();
}

function pushHistoryStep(step) {
  if (isRestoring) return;
  undoStack.push(step);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}

function stepLabel(step) {
  if (!step) return 'last change';
  return step.kind === 'project' ? (step.label || 'last change') : 'page edit';
}

function updateUndoButtons() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) {
    undoBtn.disabled = false;
    undoBtn.classList.toggle('is-inactive', undoStack.length === 0);
    undoBtn.title = undoStack.length
      ? `Undo ${stepLabel(undoStack[undoStack.length - 1])} (Ctrl+Z)`
      : 'Nothing to undo yet';
  }
  if (redoBtn) {
    redoBtn.disabled = false;
    redoBtn.classList.toggle('is-inactive', redoStack.length === 0);
    redoBtn.title = redoStack.length
      ? `Redo ${stepLabel(redoStack[redoStack.length - 1])} (Ctrl+Shift+Z)`
      : 'Nothing to redo yet';
  }
}

async function restoreHtml(html) {
  return new Promise((resolve) => {
    const win = previewFrame.contentWindow;
    if (!win) {
      resolve();
      return;
    }
    const timer = setTimeout(finish, 2500);
    function finish() {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve();
    }
    function handler(e) {
      if (e.data?.type === 'CLONER_RESTORED') finish();
    }
    window.addEventListener('message', handler);
    win.postMessage({ type: 'CLONER_RESTORE_HTML', html }, '*');
  });
}

function waitForPreview() {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 6000);
    function done() {
      clearTimeout(timer);
      previewFrame.removeEventListener('load', done);
      setTimeout(resolve, 250);
    }
    previewFrame.addEventListener('load', done, { once: true });
  });
}

/** Reverse one preview edit and hand back the state it replaced. */
async function applyDomStep(step) {
  if (step.page !== currentPage) {
    pageSelect.value = step.page;
    loadPreview(step.page);
    await waitForPreview();
  }
  const current = await getFrameHtml();
  await restoreHtml(step.html);
  return { kind: 'dom', page: step.page, html: current };
}

/** Reverse one saved change and hand back a step that reapplies it. */
async function applyProjectStep(step) {
  const data = await projectHistory.restore(step.id, step.label);
  await loadPages();
  loadPreview(pageSelect.value || currentPage);
  await waitForPreview();
  return { kind: 'project', id: data.redoId, label: step.label };
}

async function stepHistory(direction) {
  if (isRestoring) return;
  const from = direction === 'undo' ? undoStack : redoStack;
  const to = direction === 'undo' ? redoStack : undoStack;

  if (!from.length) {
    showSaveToast(direction === 'undo' ? 'Nothing to undo' : 'Nothing to redo');
    return;
  }
  if (from[from.length - 1].kind === 'dom' && !bridgeReady) {
    showSaveToast('Wait for the preview to finish loading');
    return;
  }

  const step = from.pop();
  isRestoring = true;
  try {
    const counterpart = step.kind === 'project'
      ? await applyProjectStep(step)
      : await applyDomStep(step);
    to.push(counterpart);
    editSidebar.classList.add('d-none');
    selectedElement = null;
    styleUndoCaptured = false;
    showSaveToast(`${direction === 'undo' ? 'Undid' : 'Redid'} ${stepLabel(step)}`);
  } catch (err) {
    from.push(step);
    showSaveToast(err.message);
  } finally {
    isRestoring = false;
    updateUndoButtons();
  }
}

function undoChange() {
  return stepHistory('undo');
}

function redoChange() {
  return stepHistory('redo');
}

function getAllLibraries() {
  return { ...ICON_LIBRARIES, ...customLibraries };
}

function getLib(id) {
  return getAllLibraries()[id];
}

function loadCustomLibraries() {
  try {
    const saved = localStorage.getItem(`cloner_custom_libs_${folder}`);
    if (saved) customLibraries = JSON.parse(saved);
  } catch { customLibraries = {}; }
}

function saveCustomLibraries() {
  localStorage.setItem(`cloner_custom_libs_${folder}`, JSON.stringify(customLibraries));
}

function makeCdnId(name) {
  return 'cloner-lib-custom-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
}

/* ── Pages ── */
async function loadPages() {
  try {
    const res = await fetch(API.pages(folder));
    const data = await res.json();
    if (data.pages?.length) {
      pageSelect.innerHTML = '';
      data.pages.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.file;
        opt.textContent = p.label;
        pageSelect.appendChild(opt);
      });
    }
  } catch { /* keep default */ }
}

function loadPreview(page) {
  currentPage = page;
  bridgeReady = false;
  const bust = `v=${Date.now()}`;
  previewFrame.src = `/cloned/${folder}/${page}?${bust}`;
  viewSiteBtn.href = `/cloned/${folder}/${page}`;
}

async function injectBridge() {
  const doc = previewFrame.contentDocument;
  const win = previewFrame.contentWindow;
  if (!doc || !win) return false;

  if (win.__clonerEditorActive) {
    win.postMessage({ type: 'CLONER_REASSIGN' }, '*');
    if (moveMode) win.postMessage({ type: 'CLONER_SET_MOVE_MODE', enabled: true }, '*');
    bridgeReady = true;
    return true;
  }

  try {
    const res = await fetch('/editor-bridge.js?t=' + Date.now());
    if (!res.ok) throw new Error('Bridge script not found');
    const code = await res.text();
    const script = doc.createElement('script');
    script.textContent = code;
    script.setAttribute('data-cloner-bridge', '1');
    (doc.body || doc.head || doc.documentElement).appendChild(script);
    return true;
  } catch (err) {
    console.error('Editor bridge inject failed:', err);
    return false;
  }
}

async function ensureBridgeReady() {
  if (bridgeInjecting) return bridgeReady;
  bridgeInjecting = true;
  bridgeReady = false;

  for (let attempt = 0; attempt < 8 && !bridgeReady; attempt++) {
    await injectBridge();
    await new Promise((r) => setTimeout(r, attempt === 0 ? 100 : 350));
  }

  bridgeInjecting = false;
  return bridgeReady;
}

function toSiteUrl(apiUrl) {
  if (!apiUrl) return apiUrl;
  const prefix = `/cloned/${folder}/`;
  return apiUrl.startsWith(prefix) ? apiUrl.slice(prefix.length) : apiUrl;
}

/** Upload into the workspace library, then copy it into this site. Returns the /cloned/ URL. */
async function uploadToLibrary(file) {
  const form = new FormData();
  form.append('files', file);
  const res = await fetch(API.assets, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
  const use = await fetch(API.useAsset(data.assets[0].id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, page: currentPage, placement: 'upload' }),
  });
  const used = await use.json();
  if (!use.ok || !used.success) throw new Error(used.error || 'Upload failed');
  return used.url;
}

async function uploadImageData(base64, ext) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const safeExt = String(ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const url = await uploadToLibrary(new File([bytes], `dropped-image.${safeExt}`));
  return toSiteUrl(url);
}

function setMoveMode(enabled) {
  moveMode = enabled;
  const btn = document.getElementById('moveModeBtn');
  btn?.classList.toggle('is-on', moveMode);
  btn?.setAttribute('aria-pressed', String(moveMode));
  const hint = document.getElementById('editorHint');
  if (hint) {
    hint.textContent = moveMode
      ? 'Move mode on · Drag an element to reposition it · Hold Shift to place it freely'
      : 'Click an element to edit it · Double-click to type inline · Drop an image to replace one';
    hint.classList.toggle('is-move', moveMode);
  }
  previewFrame.contentWindow?.postMessage({ type: 'CLONER_SET_MOVE_MODE', enabled: moveMode }, '*');
}

previewFrame.addEventListener('load', () => {
  ensureBridgeReady()
    .then(() => {
      injectLibrary('bootstrap');
      previewFrame.contentWindow?.postMessage({ type: 'CLONER_GET_LIBRARIES' }, '*');
      if (moveMode) previewFrame.contentWindow?.postMessage({ type: 'CLONER_SET_MOVE_MODE', enabled: true }, '*');
      populateLibSelect();
    })
    .catch(() => console.error('iframe access denied'));
});

pageSelect.addEventListener('change', async () => {
  editSidebar.classList.add('d-none');
  selectedElement = null;
  const nextPage = pageSelect.value;
  try {
    await flushPendingEdits();
  } catch (err) {
    console.warn('Could not save pending edits before switching pages:', err.message);
  }
  loadPreview(nextPage);
});

/* ── Tabs ── */
document.querySelectorAll('.editor-tabs .nav-link').forEach((btn) => {
  btn.addEventListener('click', () => {
    styleUndoCaptured = false;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.editor-tabs .nav-link').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('d-none'));
    document.getElementById('tab-' + activeTab).classList.remove('d-none');
  });
});

/* ── Show/hide content sections ── */
function showContentSections(type) {
  const sections = {
    text: 'textEditor', link: 'linkEditor', image: 'imageEditor',
    icon: 'iconEditor', button: 'buttonEditor', video: 'videoEditor', input: 'inputEditor',
  };
  Object.values(sections).forEach((id) => document.getElementById(id).classList.add('d-none'));
  const show = sections[type] || 'textEditor';
  document.getElementById(show).classList.remove('d-none');
  if (type === 'text') document.getElementById('textEditor').classList.remove('d-none');
}

let syncAiEditSelection = () => {};

function openSidebar(data) {
  selectedElement = data;
  styleUndoCaptured = false;
  editSidebar.classList.remove('d-none');
  elementLabel.textContent = data.label;
  syncAiEditSelection(data);

  if (data.isGlobal) {
    scopeBadge.className = 'scope-badge global';
    scopeBadge.innerHTML = '<i class="bi bi-globe me-1"></i>All pages (header/footer)';
  } else {
    scopeBadge.className = 'scope-badge';
    scopeBadge.innerHTML = '<i class="bi bi-file-earmark me-1"></i>This page';
  }

  showContentSections(data.type);
  showBrandGallery(data.type === 'image');

  // Content fields
  document.getElementById('textInput').value = data.text || '';
  document.getElementById('htmlInput').value = data.innerHTML || '';
  document.getElementById('linkTextInput').value = data.text || '';
  document.getElementById('linkUrlInput').value = data.href || '';
  document.getElementById('linkTargetInput').value = data.target || '';
  document.getElementById('imageUrlInput').value = data.src || '';
  document.getElementById('imageAltInput').value = data.alt || '';
  document.getElementById('imageWidthInput').value = data.width || '';
  document.getElementById('imageHeightInput').value = data.height || '';
  document.getElementById('imagePreview').src = data.src || '';
  document.getElementById('iconClassInput').value = data.iconClass || '';
  document.getElementById('iconColorText').value = data.iconColor || '#ffffff';
  try { document.getElementById('iconColorPicker').value = data.iconColor || '#ffffff'; } catch { /* */ }
  document.getElementById('buttonTextInput').value = data.text || '';
  document.getElementById('buttonLinkInput').value = data.href || '';
  document.getElementById('videoSrcInput').value = data.src || '';
  document.getElementById('inputPlaceholder').value = data.placeholder || '';
  document.getElementById('inputValue').value = data.value || '';

  // Style fields
  const s = data.styles || {};
  setColorField('styleColor', 'styleColorText', s.color);
  setColorField('styleBg', 'styleBgText', s.backgroundColor);
  setFontSize(s.fontSize);
  document.getElementById('styleFontWeight').value = s.fontWeight || '';
  currentAlign = s.textAlign || '';
  updateAlignButtons();
  document.getElementById('stylePadding').value = s.padding || '';
  document.getElementById('styleMargin').value = s.margin || '';
  document.getElementById('styleBorderRadius').value = s.borderRadius || '';
  document.getElementById('styleWidth').value = s.width || '';
  document.getElementById('styleHeight').value = s.height || '';
  document.getElementById('styleDisplay').value = s.display || '';
  document.getElementById('styleBgImage').value = s.backgroundImage || '';

  // Advanced
  document.getElementById('advId').value = data.elementId || '';
  document.getElementById('advClasses').value = data.classes || '';
  document.getElementById('advCustomCss').value = '';
}

function setColorField(pickerId, textId, val) {
  document.getElementById(textId).value = val || '';
  try { if (val) document.getElementById(pickerId).value = val; } catch { /* invalid color */ }
}

function setFontSize(size) {
  const sel = document.getElementById('styleFontSize');
  const custom = document.getElementById('styleFontSizeCustom');
  const opts = [...sel.options].map((o) => o.value);
  if (!size) { sel.value = ''; custom.classList.add('d-none'); return; }
  if (opts.includes(size)) { sel.value = size; custom.classList.add('d-none'); }
  else { sel.value = 'custom'; custom.value = size; custom.classList.remove('d-none'); }
}

document.getElementById('styleFontSize').addEventListener('change', (e) => {
  document.getElementById('styleFontSizeCustom').classList.toggle('d-none', e.target.value !== 'custom');
});

document.querySelectorAll('.align-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentAlign = btn.dataset.align;
    updateAlignButtons();
    if (activeTab === 'style' && selectedElement) {
      const msg = buildApplyMessage();
      if (msg) previewFrame.contentWindow.postMessage(msg, '*');
    }
  });
});

function updateAlignButtons() {
  document.querySelectorAll('.align-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.align === currentAlign);
  });
}

// Color sync
['styleColor','styleBg'].forEach((id) => {
  document.getElementById(id).addEventListener('input', (e) => {
    document.getElementById(id + 'Text').value = e.target.value;
  });
  document.getElementById(id + 'Text').addEventListener('input', (e) => {
    try { document.getElementById(id).value = e.target.value; } catch { /* */ }
  });
});

document.getElementById('imageUrlInput').addEventListener('input', (e) => {
  document.getElementById('imagePreview').src = e.target.value;
});

document.querySelectorAll('.icon-example').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('imageUrlInput').value = btn.dataset.url;
    document.getElementById('imagePreview').src = btn.dataset.url;
  });
});

document.querySelectorAll('.icon-class-example').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('iconClassInput').value = btn.dataset.class;
  });
});

document.getElementById('iconColorPicker').addEventListener('input', (e) => {
  document.getElementById('iconColorText').value = e.target.value;
});

document.getElementById('imageFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const url = await uploadToLibrary(file);
    document.getElementById('imageUrlInput').value = url;
    document.getElementById('imagePreview').src = url;
  } catch (err) {
    alert(err.message || 'Image upload failed');
  } finally {
    e.target.value = '';
  }
});

const brandGallery = document.getElementById('brandGallery');
const brandGalleryBrands = document.getElementById('brandGalleryBrands');
const brandGalleryGrid = document.getElementById('brandGalleryGrid');
const brandGalleryStatus = document.getElementById('brandGalleryStatus');
let brandGalleries = [];
let activeBrandId = '';

function assetSrcForPage(page, assetPath) {
  const parts = String(page || 'index.html').split('?')[0].split('/').filter(Boolean);
  parts.pop();
  return `${parts.length ? '../'.repeat(parts.length) : ''}${assetPath}`;
}

function setBrandGalleryStatus(message, isError = false) {
  if (!brandGalleryStatus) return;
  brandGalleryStatus.textContent = message;
  brandGalleryStatus.classList.toggle('error', isError);
}

async function loadBrandGalleries() {
  if (brandGalleries.length) return brandGalleries;
  const res = await fetch(API.brandGallery);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Could not load brand images.');
  brandGalleries = data.brands || [];
  return brandGalleries;
}

function renderBrandImages(brand) {
  if (!brandGalleryGrid) return;
  brandGalleryGrid.innerHTML = '';
  for (const image of brand?.images || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'brand-thumb';
    button.title = image.kind === 'logo' ? `${brand.name} logo` : image.label;
    button.innerHTML = `<img alt="" src="${image.url}" />${image.kind === 'logo' ? '<span>Logo</span>' : ''}`;
    button.addEventListener('click', () => replaceSelectedImage(brand, image, button));
    brandGalleryGrid.appendChild(button);
  }
}

function renderBrandButtons() {
  if (!brandGalleryBrands) return;
  brandGalleryBrands.innerHTML = '';
  for (const brand of brandGalleries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = brand.name;
    button.classList.toggle('active', brand.id === activeBrandId);
    button.addEventListener('click', () => {
      activeBrandId = brand.id;
      renderBrandButtons();
      renderBrandImages(brand);
      setBrandGalleryStatus('');
    });
    brandGalleryBrands.appendChild(button);
  }
}

async function showBrandGallery(visible) {
  if (!brandGallery) return;
  brandGallery.classList.toggle('d-none', !visible);
  if (!visible) return;
  brandGallery.closest('.sidebar-body')?.scrollTo({ top: 0 });
  setBrandGalleryStatus('');
  try {
    await loadBrandGalleries();
    if (!brandGalleries.length) {
      setBrandGalleryStatus('No brand images found.', true);
      return;
    }
    if (!brandGalleries.some((brand) => brand.id === activeBrandId)) {
      activeBrandId = brandGalleries[0].id;
    }
    renderBrandButtons();
    renderBrandImages(brandGalleries.find((brand) => brand.id === activeBrandId));
  } catch (err) {
    setBrandGalleryStatus(err.message, true);
  }
}

async function replaceSelectedImage(brand, image, button) {
  if (!selectedElement || selectedElement.type !== 'image') {
    setBrandGalleryStatus('Click an image on the page first.', true);
    return;
  }
  button.disabled = true;
  setBrandGalleryStatus('Replacing image...');
  try {
    const res = await fetch(API.brandImage, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, brand: brand.id, file: image.file }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Could not use this image.');
    if (image.kind === 'logo') {
      const swap = await fetch(API.replaceLogos, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          logoPath: data.path,
          oldSrc: selectedElement.src || '',
        }),
      });
      const swapped = await swap.json();
      if (!swap.ok || !swapped.success) throw new Error(swapped.error || 'Could not update the logo.');
      const src = assetSrcForPage(currentPage, data.path);
      selectedElement.src = src;
      document.getElementById('imageUrlInput').value = src;
      document.getElementById('imagePreview').src = data.url;
      loadPreview(currentPage);
      showSaveToast();
      setBrandGalleryStatus(`Logo updated across the project (${swapped.logosReplaced} places).`);
      return;
    }
    const src = assetSrcForPage(currentPage, data.path);
    previewFrame.contentWindow.postMessage({
      type: 'CLONER_APPLY',
      id: selectedElement.id,
      editType: 'image',
      src,
    }, '*');
    selectedElement.src = src;
    document.getElementById('imageUrlInput').value = src;
    document.getElementById('imagePreview').src = data.url;
    await savePage(currentPage, await getFrameHtml());
    setBrandGalleryStatus('Image replaced.');
  } catch (err) {
    setBrandGalleryStatus(err.message, true);
  } finally {
    button.disabled = false;
  }
}

document.getElementById('closeSidebar').addEventListener('click', () => {
  editSidebar.classList.add('d-none');
  selectedElement = null;
});

/* ── Build apply message ── */
function buildApplyMessage() {
  if (!selectedElement) return null;
  const msg = { type: 'CLONER_APPLY', id: selectedElement.id };

  // Content — skip when only editing styles/advanced so inner HTML is not wiped
  if (activeTab === 'style' || activeTab === 'advanced') {
    msg.editType = 'style-only';
  } else if (activeTab === 'html') {
    msg.editType = 'html';
    msg.innerHTML = document.getElementById('htmlInput').value;
  } else if (activeTab === 'icons') {
    msg.editType = 'style-only';
  } else {
    const type = selectedElement.type;
    msg.editType = type;
    if (type === 'image') {
      msg.src = document.getElementById('imageUrlInput').value;
      msg.alt = document.getElementById('imageAltInput').value;
      msg.width = document.getElementById('imageWidthInput').value;
      msg.height = document.getElementById('imageHeightInput').value;
    } else if (type === 'icon') {
      msg.editType = 'icon';
      msg.iconClass = document.getElementById('iconClassInput').value;
      msg.iconColor = document.getElementById('iconColorText').value;
    } else if (type === 'link') {
      msg.text = document.getElementById('linkTextInput').value;
      msg.href = document.getElementById('linkUrlInput').value;
      msg.target = document.getElementById('linkTargetInput').value;
    } else if (type === 'button') {
      msg.text = document.getElementById('buttonTextInput').value;
      msg.href = document.getElementById('buttonLinkInput').value;
    } else if (type === 'video') {
      msg.src = document.getElementById('videoSrcInput').value;
    } else if (type === 'input') {
      msg.placeholder = document.getElementById('inputPlaceholder').value;
      msg.value = document.getElementById('inputValue').value;
    } else {
      msg.text = document.getElementById('textInput').value;
    }
  }

  // Styles (always apply if on style tab or any tab)
  const fontSizeSel = document.getElementById('styleFontSize').value;
  const fontSize = fontSizeSel === 'custom'
    ? document.getElementById('styleFontSizeCustom').value
    : fontSizeSel;

  msg.styles = {
    color: document.getElementById('styleColorText').value,
    backgroundColor: document.getElementById('styleBgText').value,
    fontSize,
    fontWeight: document.getElementById('styleFontWeight').value,
    textAlign: currentAlign,
    padding: document.getElementById('stylePadding').value,
    margin: document.getElementById('styleMargin').value,
    borderRadius: document.getElementById('styleBorderRadius').value,
    width: document.getElementById('styleWidth').value,
    height: document.getElementById('styleHeight').value,
    display: document.getElementById('styleDisplay').value,
    backgroundImage: document.getElementById('styleBgImage').value,
  };

  // Advanced
  msg.elementId = document.getElementById('advId').value;
  msg.classes = document.getElementById('advClasses').value;
  msg.customCss = document.getElementById('advCustomCss').value;

  return msg;
}

async function sendApply(msg) {
  previewFrame.contentWindow.postMessage(msg, '*');
  if (selectedElement?.isGlobal) pendingGlobalEdits.push({ ...msg, tag: selectedElement.tag });
}

document.getElementById('applyBtn').addEventListener('click', async () => {
  const msg = buildApplyMessage();
  if (msg) await sendApply(msg);
});

document.getElementById('livePreviewBtn').addEventListener('click', async () => {
  const msg = buildApplyMessage();
  if (!msg) return;
  previewFrame.contentWindow.postMessage(msg, '*');
});

// Live style preview while editing Style tab
const styleInputs = [
  'styleColor', 'styleColorText', 'styleBg', 'styleBgText',
  'styleFontSize', 'styleFontSizeCustom', 'styleFontWeight',
  'stylePadding', 'styleMargin', 'styleBorderRadius',
  'styleWidth', 'styleHeight', 'styleDisplay', 'styleBgImage',
];
styleInputs.forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', async () => {
    if (activeTab !== 'style' || !selectedElement) return;
    styleUndoCaptured = true;
    const msg = buildApplyMessage();
    if (msg) previewFrame.contentWindow.postMessage(msg, '*');
  });
  el.addEventListener('change', async () => {
    if (activeTab !== 'style' || !selectedElement) return;
    styleUndoCaptured = true;
    const msg = buildApplyMessage();
    if (msg) previewFrame.contentWindow.postMessage(msg, '*');
  });
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  if (!selectedElement || !confirm('Delete this element? You can undo it afterwards.')) return;
  previewFrame.contentWindow.postMessage({ type: 'CLONER_APPLY', id: selectedElement.id, action: 'delete' }, '*');
  editSidebar.classList.add('d-none');
  selectedElement = null;
});

document.getElementById('duplicateBtn').addEventListener('click', async () => {
  if (!selectedElement) return;
  previewFrame.contentWindow.postMessage({ type: 'CLONER_APPLY', id: selectedElement.id, action: 'duplicate' }, '*');
});

/* ── SEO ── */
document.getElementById('pageSeoBtn')?.addEventListener('click', () => {
  const doc = previewFrame.contentDocument;
  if (!doc) return;
  document.getElementById('seoTitle').value = doc.title || '';
  document.getElementById('seoDescription').value = doc.querySelector('meta[name="description"]')?.content || '';
  seoModal.show();
});

document.getElementById('applySeoBtn')?.addEventListener('click', async () => {
  previewFrame.contentWindow.postMessage({
    type: 'CLONER_APPLY_SEO',
    title: document.getElementById('seoTitle').value,
    description: document.getElementById('seoDescription').value,
  }, '*');
  seoModal.hide();
});

/* ── Save ── */
document.getElementById('saveAllBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveAllBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
  try {
    await savePage(currentPage, await getFrameHtml());
    if (pendingGlobalEdits.length) await applyGlobalEdits();
    showSaveToast();
  } catch (err) {
    alert('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save me-1"></i>Save All';
  }
});

function getFrameHtml() {
  return new Promise((resolve) => {
    const requestId = Date.now() + Math.random();
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve('');
    }, 2500);
    const handler = (e) => {
      if (e.data?.type === 'CLONER_HTML' && e.data.requestId === requestId) {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(e.data.html || '');
      }
    };
    window.addEventListener('message', handler);
    previewFrame.contentWindow?.postMessage({ type: 'CLONER_GET_HTML', requestId }, '*');
  });
}

async function savePage(page, html) {
  const res = await fetch(API.save, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, page, html }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Save failed');
  dropPendingEdits(page);
}

async function applyGlobalEdits() {
  const res = await fetch(API.pages(folder));
  const data = await res.json();
  for (const page of (data.pages?.map((p) => p.file) || ['index.html'])) {
    if (page === currentPage) continue;
    let html = await (await fetch(`/cloned/${folder}/${page}`)).text();
    for (const edit of pendingGlobalEdits) html = applyEditToHtml(html, edit);
    await savePage(page, html);
  }
  pendingGlobalEdits = [];
}

function applyEditToHtml(html, edit) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('header,footer,nav,[role="banner"],[role="contentinfo"]').forEach((container) => {
    container.querySelectorAll(edit.tag).forEach((el) => {
      if (edit.editType === 'html') el.innerHTML = edit.innerHTML;
      else if (edit.editType === 'link') { el.textContent = edit.text; el.setAttribute('href', edit.href); }
      else if (edit.editType === 'image') { el.setAttribute('src', edit.src); el.setAttribute('alt', edit.alt); }
      else if (edit.text) el.textContent = edit.text;
    });
  });
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

function showSaveToast(message = 'Saved successfully!') {
  const toast = document.getElementById('saveToast');
  const text = document.getElementById('saveToastText');
  if (text) text.textContent = message;
  toast.classList.remove('d-none');
  clearTimeout(showSaveToast.timer);
  showSaveToast.timer = setTimeout(() => toast.classList.add('d-none'), 3000);
}

/* ── Icon Library ── */
function injectLibrary(libId) {
  const lib = getLib(libId);
  if (!lib) return;
  previewFrame.contentWindow.postMessage({
    type: 'CLONER_ADD_LIBRARY',
    libId,
    cdn: lib.cdn,
    cdnId: lib.cdnId,
    libType: lib.libType || 'css',
  }, '*');
  loadEditorLibAsset(lib);
}

function loadEditorLibAsset(lib) {
  const editorId = 'editor-' + lib.cdnId;
  if (document.getElementById(editorId)) return;
  if (lib.libType === 'js') {
    const script = document.createElement('script');
    script.id = editorId;
    script.src = lib.cdn;
    document.head.appendChild(script);
  } else {
    const link = document.createElement('link');
    link.id = editorId;
    link.rel = 'stylesheet';
    link.href = lib.cdn;
    document.head.appendChild(link);
  }
}

function addCustomLibrary() {
  const name = document.getElementById('customLibName').value.trim();
  const cdn = document.getElementById('customLibCdn').value.trim();
  const libType = document.getElementById('customLibType').value;
  const prefix = document.getElementById('customLibPrefix').value.trim();
  const suffix = document.getElementById('customLibSuffix').value.trim();
  const iconsRaw = document.getElementById('customLibIcons').value.trim();

  if (!name || !cdn) {
    alert('Library name and CDN URL are required.');
    return;
  }

  const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const icons = iconsRaw
    ? iconsRaw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
    : [];

  customLibraries[id] = {
    id,
    name,
    cdn,
    cdnId: makeCdnId(name),
    libType,
    prefix,
    suffix,
    classFormat: (iconName) => `${prefix}${iconName}${suffix}`.trim(),
    textContent: false,
    icons,
    custom: true,
  };

  saveCustomLibraries();
  injectLibrary(id);

  document.getElementById('customLibName').value = '';
  document.getElementById('customLibCdn').value = '';
  document.getElementById('customLibIcons').value = '';
}

function renderLibraryCards() {
  const container = document.getElementById('libraryCards');
  container.innerHTML = '';
  Object.values(ICON_LIBRARIES).forEach((lib) => {
    const card = document.createElement('div');
    card.className = 'col-md-6';
    const installed = installedLibs.has(lib.id);
    card.innerHTML = `
      <div class="library-card ${installed ? 'installed' : ''}" data-lib="${lib.id}">
        <h6>${lib.name}</h6>
        <div class="lib-preview">${getPreviewHtml(lib, lib.icons[0])}</div>
        <code class="small text-muted d-block mb-2">${lib.cdn.split('/').slice(-2).join('/')}</code>
        <button class="btn btn-sm ${installed ? 'btn-success' : 'btn-primary'} w-100 add-lib-btn" data-lib="${lib.id}">
          ${installed ? '<i class="bi bi-check2"></i> Installed' : '<i class="bi bi-plus-lg"></i> Add to Site'}
        </button>
      </div>`;
    container.appendChild(card);
  });

  Object.values(customLibraries).forEach((lib) => {
    const card = document.createElement('div');
    card.className = 'col-md-6';
    const installed = installedLibs.has(lib.id);
    card.innerHTML = `
      <div class="library-card ${installed ? 'installed' : ''}" style="border-color:#f59e0b">
        <h6>${lib.name} <span class="badge bg-warning text-dark">custom</span></h6>
        <code class="small text-muted d-block mb-2">${lib.cdn.slice(0, 50)}</code>
        <button class="btn btn-sm ${installed ? 'btn-success' : 'btn-warning text-dark'} w-100 add-lib-btn" data-lib="${lib.id}">
          ${installed ? '<i class="bi bi-check2"></i> Installed' : '<i class="bi bi-plus-lg"></i> Add to Site'}
        </button>
      </div>`;
    container.appendChild(card);
  });

  container.querySelectorAll('.add-lib-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const libId = btn.dataset.lib;
      if (!installedLibs.has(libId)) injectLibrary(libId);
    });
  });
}

function getPreviewHtml(lib, iconName) {
  // SVG preview — always visible in picker (no font CSS needed)
  if (lib.svgUrl) {
    return `<img src="${lib.svgUrl(iconName)}" width="22" height="22" alt="${iconName}" class="picker-svg-icon" />`;
  }
  if (lib.textContent) {
    return `<span class="material-icons" style="font-size:22px">${iconName}</span>`;
  }
  loadEditorLibAsset(lib);
  return `<i class="${lib.classFormat(iconName)}" style="font-size:22px"></i>`;
}

function updateInstalledList() {
  const ul = document.getElementById('installedLibs');
  ul.innerHTML = installedLibs.size
    ? [...installedLibs].map((id) => {
        const lib = getLib(id);
        if (!lib) return '';
        return `<li class="list-group-item bg-transparent text-white border-secondary py-1 d-flex justify-content-between align-items-center">
          <span><i class="bi bi-check-circle text-success me-1"></i>${lib.name}${lib.custom ? ' <span class="badge bg-warning text-dark">custom</span>' : ''}</span>
          <code class="small text-muted">${lib.cdn.slice(0, 40)}...</code>
        </li>`;
      }).join('')
    : '<li class="list-group-item bg-transparent text-muted border-secondary py-1">No library added yet</li>';

  document.getElementById('libNotAdded').classList.toggle('d-none', installedLibs.size > 0);
}

function populateLibSelect() {
  const sel = document.getElementById('activeIconLib');
  sel.innerHTML = '';

  // Preset libraries — always available for picker
  Object.values(ICON_LIBRARIES).forEach((lib) => {
    const opt = document.createElement('option');
    opt.value = lib.id;
    opt.textContent = lib.name;
    sel.appendChild(opt);
  });

  // Custom libraries
  Object.values(customLibraries).forEach((lib) => {
    const opt = document.createElement('option');
    opt.value = lib.id;
    opt.textContent = lib.name + ' (custom)';
    sel.appendChild(opt);
  });

  if (getLib(activeLibId)) sel.value = activeLibId;
  else activeLibId = 'bootstrap';
  loadEditorLibAsset(getLib(activeLibId));
  renderIconPicker();
}

function renderIconPicker(filter = '') {
  const grid = document.getElementById('iconPickerGrid');
  const lib = getLib(activeLibId);
  if (!lib || !lib.icons?.length) {
    grid.innerHTML = `
      <div class="icon-picker-empty">
        <i class="bi bi-grid-3x3-gap"></i>
        <p class="mb-1">No icons in this library</p>
        <span>Switch to a preset library above, or use Custom Class.</span>
      </div>`;
    return;
  }

  const icons = lib.icons.filter((n) => n.includes(filter.toLowerCase()));
  grid.innerHTML = icons.map((name) =>
    `<button type="button" class="icon-picker-item" data-icon="${name}" title="${name}">
      ${getPreviewHtml(lib, name)}
    </button>`
  ).join('');

  grid.querySelectorAll('.icon-picker-item').forEach((btn) => {
    btn.addEventListener('click', () => applyIconFromLibrary(btn.dataset.icon));
  });
}

async function applyFreeIconClass() {
  const iconClass = document.getElementById('freeIconClass').value.trim();
  if (!iconClass) { alert('Enter an icon class, e.g. fa-solid fa-phone'); return; }

  const iconText = document.getElementById('freeIconText').value.trim();
  const isMaterial = iconClass.includes('material-icons');
  const isBootstrap = iconClass.startsWith('bi bi-');

  let lib = null;
  let iconName = '';
  if (isBootstrap) {
    lib = ICON_LIBRARIES.bootstrap;
    iconName = iconClass.replace('bi bi-', '');
    if (!installedLibs.has('bootstrap')) injectLibrary('bootstrap');
  } else if (isMaterial) {
    lib = ICON_LIBRARIES.material;
    iconName = iconText;
    if (!installedLibs.has('material')) injectLibrary('material');
  } else if (iconClass.startsWith('fa-')) {
    lib = ICON_LIBRARIES.fontawesome;
    if (!installedLibs.has('fontawesome')) injectLibrary('fontawesome');
  }

  const msg = buildIconMessage(iconClass, isMaterial ? iconText : iconName, lib);
  if (isMaterial && iconText) {
    msg.textContent = true;
    msg.iconText = iconText;
  }
  previewFrame.contentWindow.postMessage(msg, '*');
}

function buildIconMessage(iconClass, iconName, lib) {
  const iconSize = document.getElementById('iconSizeInput').value || '24px';
  const iconColor = document.getElementById('libIconColorText').value || '#ffffff';
  const msg = {
    type: 'CLONER_USE_ICON',
    id: selectedElement?.id || null,
    iconClass,
    iconName,
    iconSize,
    iconColor,
    insert: !selectedElement,
    cdn: lib?.cdn,
    cdnId: lib?.cdnId,
    libType: lib?.libType || 'css',
  };

  if (lib?.textContent) {
    msg.textContent = true;
    msg.iconText = iconName;
  }

  // Bootstrap: use SVG for reliable display on cloned site
  if (lib?.svgUrl) {
    msg.useSvg = true;
    msg.svgUrl = lib.svgUrl(iconName);
  }

  return msg;
}

async function applyIconFromLibrary(iconName) {
  const lib = getLib(activeLibId);
  if (!lib) return;

  // Auto-inject library CDN into cloned site
  if (!installedLibs.has(activeLibId)) injectLibrary(activeLibId);

  const iconClass = lib.classFormat(iconName);
  previewFrame.contentWindow.postMessage(buildIconMessage(iconClass, iconName, lib), '*');

  if (!selectedElement) {
    editSidebar.classList.remove('d-none');
    elementLabel.textContent = 'New Icon';
  }
}

document.getElementById('addCustomLibBtn').addEventListener('click', addCustomLibrary);

document.getElementById('applyFreeIconBtn').addEventListener('click', applyFreeIconClass);

document.getElementById('iconLibraryBtn').addEventListener('click', () => {
  renderLibraryCards();
  updateInstalledList();
  iconLibraryModal.show();
});

document.getElementById('activeIconLib').addEventListener('change', (e) => {
  activeLibId = e.target.value;
  const lib = getLib(activeLibId);
  if (lib) loadEditorLibAsset(lib);
  renderIconPicker(document.getElementById('iconSearch').value);
});

document.getElementById('iconSearch').addEventListener('input', (e) => {
  renderIconPicker(e.target.value.toLowerCase());
});

document.getElementById('libIconColor').addEventListener('input', (e) => {
  document.getElementById('libIconColorText').value = e.target.value;
});

document.getElementById('moveModeBtn')?.addEventListener('click', () => setMoveMode(!moveMode));
document.getElementById('undoBtn')?.addEventListener('click', () => undoChange());
document.getElementById('redoBtn')?.addEventListener('click', () => redoChange());

function runUndoKey(shift, key) {
  if (key === 'z' && !shift) undoChange();
  else if (key === 'y' || (key === 'z' && shift)) redoChange();
}

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  const key = e.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  e.preventDefault();
  runUndoKey(e.shiftKey, key);
});

window.addEventListener('message', async (e) => {
  if (e.data?.type === 'CLONER_READY') {
    bridgeReady = true;
    updateUndoButtons();
  }
  if (e.data?.type === 'CLONER_UNDO_KEY') {
    runUndoKey(!!e.data.shift, String(e.data.key || 'z').toLowerCase());
  }
  if (e.data?.type === 'CLONER_PUSH_UNDO_HTML' && e.data.html && !isRestoring) {
    const last = undoStack[undoStack.length - 1];
    if (!(last?.kind === 'dom' && last.html === e.data.html)) {
      pushHistoryStep({ kind: 'dom', page: currentPage, html: e.data.html });
    }
  }
  if (e.data?.type === 'CLONER_SELECT') {
    try {
      openSidebar(e.data.data);
      assetLibrary?.refreshSelection();
      aiComposer?.selectionChanged();
    } catch (err) {
      console.error('Failed to open editor sidebar:', err);
    }
  }
  if (e.data?.type === 'CLONER_FILE_DROP') {
    try {
      const url = await uploadImageData(e.data.data, e.data.ext || 'png');
      previewFrame.contentWindow?.postMessage({
        type: 'CLONER_INSERT_IMAGE',
        url,
        x: e.data.x,
        y: e.data.y,
        replaceId: e.data.replaceId,
      }, '*');
      showSaveToast();
    } catch (err) {
      alert('Image upload failed: ' + err.message);
    }
  }
  if (e.data?.type === 'CLONER_ELEMENT_MOVED') {
    updateUndoButtons();
    showSaveToast();
  }
  if (e.data?.type === 'CLONER_INLINE_EDIT' && e.data.data.isGlobal) {
    pendingGlobalEdits.push({ editType: 'html', innerHTML: e.data.data.innerHTML, tag: selectedElement?.tag });
  }
  if (e.data?.type === 'CLONER_LIBRARY_ADDED') {
    installedLibs.add(e.data.libId);
    activeLibId = e.data.libId;
    updateInstalledList();
    populateLibSelect();
    renderLibraryCards();
  }
  if (e.data?.type === 'CLONER_LIBRARIES_LIST') {
    e.data.libs.forEach((l) => {
      const libId = l.cdnId.replace('cloner-lib-', '').replace('-icons', '').replace('fontawesome', 'fontawesome');
      const match = Object.values(getAllLibraries()).find((lib) => lib.cdnId === l.cdnId);
      if (match) installedLibs.add(match.id);
    });
    updateInstalledList();
    populateLibSelect();
  }
});

function initEditor() {
  assetLibrary = initAssetLibrary({
    folder,
    previewFrame,
    getSelected: () => selectedElement,
    getPage: () => currentPage,
    assetSrcForPage,
    saveCurrentPage: async () => savePage(currentPage, await getFrameHtml()),
    reloadPreview: () => loadPreview(currentPage),
    showSaveToast,
  });
  assetLibrary.bind();
  aiComposer = initAiComposer({
    folder,
    previewFrame,
    getSelected: () => selectedElement,
    getPage: () => currentPage,
    reloadPreview: () => loadPreview(currentPage),
    showSaveToast,
  });
  aiComposer.bind();
  const versionHistory = initVersionHistory({
    folder,
    closeOtherPanels: () => document.getElementById('assetPanel').classList.remove('open'),
    onRestored: () => { loadPages(); loadPreview(currentPage); showSaveToast('Version restored.'); },
  });
  versionHistory.bind();
  document.getElementById('assetLibraryBtn').addEventListener('click', () => versionHistory.close());
  fetch(API.siteOpened, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  }).catch(() => {});
  loadCustomLibraries();
  populateLibSelect();
  const seoModalEl = document.getElementById('seoModal');
  if (seoModalEl) seoModal = new bootstrap.Modal(seoModalEl);
  iconLibraryModal = new bootstrap.Modal(document.getElementById('iconLibraryModal'));
  loadPages();
  loadPreview('index.html');

  initSiteTools({
    folder,
    previewFrame,
    pageSelect,
    loadPages,
    loadPreview,
    showSaveToast,
  }).bind();

  initAiCustomize({
    folder,
    previewFrame,
    pageSelect,
    loadPreview,
    showSaveToast,
  }).bind();

  initAiAudit({
    folder,
    previewFrame,
    pageSelect,
    loadPages,
    loadPreview,
    showSaveToast,
  }).bind();

  initHeadTags({
    folder,
    loadPreview: () => loadPreview(currentPage),
    showSaveToast,
  }).bind();

  initFixWithAi({
    folder,
    pageSelect,
    loadPreview,
    showSaveToast,
    getCurrentPage: () => currentPage,
    getSelectedElement: () => selectedElement,
  }).bind();

  initAiFixSelection({
    folder,
    previewFrame,
    getSelectedElement: () => selectedElement,
    getCurrentPage: () => currentPage,
    loadPreview: (page) => loadPreview(page || currentPage),
    showSaveToast,
  }).bind();

  const aiEdit = initAiEditSelection({
    folder,
    previewFrame,
    getSelectedElement: () => selectedElement,
    getCurrentPage: () => currentPage,
    loadPreview: (page) => loadPreview(page || currentPage),
    showSaveToast,
  });
  syncAiEditSelection = aiEdit.sync;
  aiEdit.bind();
}

// auth.js resolves the session first, so DOMContentLoaded may already have fired.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEditor);
else initEditor();
