/**
 * Workspace asset library inside the editor: browse, search, upload, and put an
 * asset into the selected element. Every insert is saved to the page file.
 */
import { API } from './api.js';

const KIND_LABELS = { image: 'Image', svg: 'SVG', video: 'Video', font: 'Font' };

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function initAssetLibrary({
  folder,
  previewFrame,
  getSelected,
  getPage,
  assetSrcForPage,
  saveCurrentPage,
  reloadPreview,
  showSaveToast,
}) {
  const panel = document.getElementById('assetPanel');
  const grid = document.getElementById('assetGrid');
  const statusEl = document.getElementById('assetStatus');
  const search = document.getElementById('assetSearch');
  const fileInput = document.getElementById('assetFileInput');
  const siteOnly = document.getElementById('assetSiteOnly');
  const target = document.getElementById('assetTarget');
  let kind = '';
  let assets = [];
  let searchTimer;

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
  }

  function post(message) {
    previewFrame.contentWindow?.postMessage(message, '*');
  }

  function describeTarget() {
    const sel = getSelected();
    target.textContent = sel
      ? `Selected: ${sel.label || sel.tag}${sel.type === 'image' ? ' (image)' : sel.type === 'video' ? ' (video)' : ''}`
      : 'Click an element on the page, then pick an asset.';
  }

  async function load() {
    const params = new URLSearchParams({ folder });
    if (kind) params.set('kind', kind);
    if (search.value.trim()) params.set('q', search.value.trim());
    if (siteOnly.checked) params.set('onlySite', 'true');
    try {
      const res = await fetch(`${API.assets}?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not load assets.');
      assets = data.assets;
      render();
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function thumb(asset) {
    if (asset.kind === 'image' || asset.kind === 'svg') return `<img src="${asset.url}" alt="" loading="lazy" />`;
    if (asset.kind === 'video') return `<video src="${asset.url}" muted preload="metadata"></video><i class="bi bi-play-circle asset-thumb-badge"></i>`;
    return '<span class="asset-font-sample">Aa</span>';
  }

  function render() {
    if (!assets.length) {
      grid.innerHTML = `<p class="asset-empty">${siteOnly.checked ? 'No library assets are used in this site yet.' : 'No assets yet. Upload logos, images, videos or fonts to reuse them in any site.'}</p>`;
      return;
    }
    grid.innerHTML = assets.map((a) => `
      <div class="asset-card" data-id="${a.id}">
        <button type="button" class="asset-thumb" data-pick="${a.id}" title="${escapeHtml(a.fileName)}">${thumb(a)}</button>
        <div class="asset-meta">
          <span class="asset-name" title="${escapeHtml(a.fileName)}">${escapeHtml(a.fileName)}</span>
          <span class="asset-sub">${KIND_LABELS[a.kind] || a.kind} · ${formatSize(a.size)}${a.usedInSite ? ' · in this site' : ''}</span>
        </div>
        <button type="button" class="asset-delete" data-delete="${a.id}" title="Delete from library"><i class="bi bi-trash3"></i></button>
      </div>`).join('');
  }

  /** Actions that make sense for this asset and the current selection. */
  function actionsFor(asset) {
    const sel = getSelected();
    if (!sel) return [];
    const list = [];
    if (asset.kind === 'image' || asset.kind === 'svg') {
      if (sel.type === 'image') {
        list.push({ id: 'replace', label: 'Replace selected image' });
        if (sel.inHeader) list.push({ id: 'logo', label: 'Use as logo on every page' });
      }
      list.push({ id: 'background', label: 'Set as background of selection' });
      list.push({ id: 'insert-after', label: 'Insert image after selection' });
      if (sel.type !== 'image') list.push({ id: 'insert-inside', label: 'Insert image inside selection' });
    } else if (asset.kind === 'video') {
      if (sel.type === 'video') list.push({ id: 'replace-video', label: 'Replace selected video' });
      list.push({ id: 'insert-video', label: 'Insert video after selection' });
    } else if (asset.kind === 'font') {
      list.push({ id: 'font', label: 'Use this font on the selection' });
    }
    return list;
  }

  function showActions(card, asset) {
    grid.querySelectorAll('.asset-actions').forEach((el) => el.remove());
    const actions = actionsFor(asset);
    const box = document.createElement('div');
    box.className = 'asset-actions';
    box.innerHTML = actions.length
      ? actions.map((a) => `<button type="button" data-action="${a.id}">${escapeHtml(a.label)}</button>`).join('')
      : '<span>Click an element on the page first.</span>';
    card.after(box);
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button) apply(asset, button.dataset.action, box);
    });
  }

  async function apply(asset, action, box) {
    const sel = getSelected();
    if (!sel) return setStatus('Click an element on the page first.', true);
    box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    setStatus('Adding to the site…');
    try {
      const res = await fetch(API.useAsset(asset.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, page: getPage(), placement: action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not use this asset.');
      const src = assetSrcForPage(getPage(), data.path);

      if (action === 'logo') {
        const swap = await fetch(API.replaceLogos, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder, logoPath: data.path, oldSrc: sel.src || '' }),
        });
        const swapped = await swap.json();
        if (!swap.ok || !swapped.success) throw new Error(swapped.error || 'Could not update the logo.');
        reloadPreview();
        showSaveToast(`Logo updated in ${swapped.logosReplaced} places.`);
        setStatus(`Logo updated across the site (${swapped.logosReplaced} places).`);
        box.remove();
        load();
        return;
      }

      if (action === 'replace') {
        post({ type: 'CLONER_APPLY', id: sel.id, editType: 'image', src, alt: sel.alt || asset.fileName.replace(/\.[^.]+$/, '') });
        // Keep the box the old image occupied, so the layout doesn't jump.
        post({ type: 'CLONER_APPLY', id: sel.id, editType: 'style-only', customCss: 'object-fit: cover' });
      } else if (action === 'background') {
        post({
          type: 'CLONER_APPLY', id: sel.id, editType: 'style-only',
          styles: { backgroundImage: `url("${src}")` },
          customCss: 'background-size: cover; background-position: center; background-repeat: no-repeat',
        });
      } else if (action === 'insert-after' || action === 'insert-inside') {
        post({ type: 'CLONER_INSERT_MEDIA', id: sel.id, media: 'image', src,
               alt: asset.fileName.replace(/\.[^.]+$/, ''), position: action === 'insert-after' ? 'afterend' : 'beforeend' });
      } else if (action === 'replace-video') {
        post({ type: 'CLONER_APPLY', id: sel.id, editType: 'video', src });
      } else if (action === 'insert-video') {
        post({ type: 'CLONER_INSERT_MEDIA', id: sel.id, media: 'video', src, position: 'afterend' });
      } else if (action === 'font') {
        const family = asset.fileName.replace(/\.[^.]+$/, '').replace(/[^\w -]/g, '').trim() || 'Custom Font';
        post({ type: 'CLONER_ADD_FONT', family, src });
        post({ type: 'CLONER_APPLY', id: sel.id, editType: 'style-only', customCss: `font-family: '${family}', sans-serif` });
      }

      // Let the preview apply the change, then write the page to disk.
      await new Promise((resolve) => setTimeout(resolve, 150));
      await saveCurrentPage();
      showSaveToast('Saved to the site.');
      setStatus(`${asset.fileName} added and saved.`);
      box.remove();
      load();
    } catch (err) {
      setStatus(err.message, true);
      box.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  }

  async function upload(files) {
    if (!files?.length) return;
    const form = new FormData();
    [...files].forEach((file) => form.append('files', file));
    setStatus(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);
    try {
      const res = await fetch(API.assets, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed.');
      setStatus(`Uploaded ${data.assets.length} file${data.assets.length > 1 ? 's' : ''} to your workspace library.`);
      load();
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      fileInput.value = '';
    }
  }

  async function remove(asset) {
    if (!confirm(`Delete “${asset.fileName}” from the workspace library? Sites that already use it keep their copy.`)) return;
    const res = await fetch(API.asset(asset.id), { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) return setStatus(data.error || 'Could not delete this asset.', true);
    setStatus(`Deleted ${asset.fileName}.`);
    load();
  }

  function bind() {
    document.getElementById('assetLibraryBtn').addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      if (open) { describeTarget(); load(); }
    });
    document.getElementById('assetPanelClose').addEventListener('click', () => panel.classList.remove('open'));
    document.getElementById('assetUploadBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => upload(fileInput.files));
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 250); });
    siteOnly.addEventListener('change', load);
    panel.querySelectorAll('[data-kind]').forEach((chip) => chip.addEventListener('click', () => {
      kind = chip.dataset.kind;
      panel.querySelectorAll('[data-kind]').forEach((c) => c.classList.toggle('active', c === chip));
      load();
    }));
    grid.addEventListener('click', (event) => {
      const pick = event.target.closest('[data-pick]');
      const del = event.target.closest('[data-delete]');
      if (pick) {
        const asset = assets.find((a) => a.id === Number(pick.dataset.pick));
        showActions(pick.closest('.asset-card'), asset);
      } else if (del) {
        remove(assets.find((a) => a.id === Number(del.dataset.delete)));
      }
    });
    panel.addEventListener('dragover', (event) => { event.preventDefault(); panel.classList.add('dragging'); });
    panel.addEventListener('dragleave', () => panel.classList.remove('dragging'));
    panel.addEventListener('drop', (event) => {
      event.preventDefault();
      panel.classList.remove('dragging');
      upload(event.dataTransfer.files);
    });
  }

  return { bind, refreshSelection: describeTarget };
}
