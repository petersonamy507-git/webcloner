(function () {
  if (window.__clonerEditorActive) return;
  window.__clonerEditorActive = true;

  const EDITABLE = [
    'h1','h2','h3','h4','h5','h6','p','a','img','button','li','label','td','th',
    'blockquote','small','figcaption','span','div','section','article','aside',
    'main','header','footer','nav','form','input','textarea','select','video',
    'iframe','i','em','strong','b','u','figure','ul','ol','dl','dt','dd',
    'table','tr','caption','hgroup','picture','source'
  ].join(',');

  const GLOBAL_SELECTORS = 'header,footer,nav,[role="banner"],[role="contentinfo"]';
  const SKIP_TAGS = new Set(['script','style','noscript','svg','path','meta','link','head']);
  let selectedEl = null;
  let idCounter = 0;
  let currentAlign = '';
  let moveMode = false;
  let dragState = null;
  let dropIndicator = null;
  let fileDropOverlay = null;
  let fileDropDepth = 0;

  const style = document.createElement('style');
  style.textContent = `
    html.cloner-editor-mode, html.cloner-editor-mode body { scroll-behavior: auto; }
    html.cloner-editor-mode .bg-overlay,
    html.cloner-editor-mode .cus-overlay,
    html.cloner-editor-mode .modal-backdrop,
    html.cloner-editor-mode [class*="zopim"],
    html.cloner-editor-mode [id*="zopim"],
    html.cloner-editor-mode [class*="chat-widget"],
    html.cloner-editor-mode [id*="launcher"],
    html.cloner-editor-mode iframe[style*="position: fixed"] {
      pointer-events: none !important;
    }
    [data-cloner-id] { cursor: pointer !important; transition: outline 0.12s; }
    [data-cloner-id]:hover { outline: 2px dashed #3b82f6 !important; outline-offset: 2px; }
    [data-cloner-selected] { outline: 2px solid #3b82f6 !important; outline-offset: 2px; }
    [data-cloner-inline] { outline: 2px solid #ef4444 !important; outline-offset: 1px; }
    /* Sits at the bottom so it never covers the cloned site's own header. */
    .cloner-edit-hint {
      position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%);
      background: rgba(16, 26, 46, 0.92); color: #e8edf6; padding: 7px 14px;
      border: 1px solid rgba(148, 163, 184, 0.28); border-radius: 999px;
      font-size: 12px; z-index: 999999; pointer-events: none;
      font-family: 'Inter', system-ui, sans-serif; white-space: nowrap;
      backdrop-filter: blur(8px); box-shadow: 0 6px 20px rgba(0,0,0,0.35);
      transition: opacity 0.4s ease;
    }
    .cloner-edit-hint.is-faded { opacity: 0.25; }
    .cloner-move-mode [data-cloner-id] { cursor: grab !important; }
    .cloner-move-mode [data-cloner-id].cloner-dragging { cursor: grabbing !important; opacity: 0.45; }
    .cloner-drag-ghost {
      position: fixed; pointer-events: none; z-index: 999997;
      opacity: 0.85; outline: 2px dashed #3b82f6; background: rgba(59,130,246,0.08);
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    }
    .cloner-drop-indicator {
      position: fixed; height: 4px; background: #3b82f6; border-radius: 2px;
      z-index: 999998; pointer-events: none; box-shadow: 0 0 0 1px #fff;
    }
    .cloner-drop-target {
      outline: 2px dashed #22c55e !important; outline-offset: 2px;
    }
    .cloner-file-drop-overlay {
      position: fixed; inset: 0; z-index: 999996;
      background: rgba(30,64,175,0.55); border: 3px dashed #93c5fd;
      display: none; align-items: center; justify-content: center;
      font-family: sans-serif; color: #fff; font-size: 18px; font-weight: 600;
      pointer-events: none;
    }
    .cloner-file-drop-overlay.visible { display: flex; }
  `;

  let hint = null;

  function ensureEditorChrome() {
    if (!document.head) return false;
    if (!document.getElementById('cloner-editor-style')) {
      style.id = 'cloner-editor-style';
      document.head.appendChild(style);
    }
    if (!document.body) return false;
    // The editing hint lives in the editor's Ask AI bar, not on top of the page.
    document.documentElement.classList.add('cloner-editor-mode');
    return true;
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '';
    if (rgb.startsWith('#')) return rgb;
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return '';
    return '#' + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('');
  }

  function assignIds() {
    document.querySelectorAll(EDITABLE).forEach((el) => {
      if (el.closest('.cloner-edit-hint') || SKIP_TAGS.has(el.tagName.toLowerCase())) return;
      if (!el.dataset.clonerId) el.dataset.clonerId = 'c' + (++idCounter);
    });
  }

  function isGlobal(el) {
    return !!el.closest(GLOBAL_SELECTORS);
  }

  function getLabel(el) {
    const tag = el.tagName.toLowerCase();
    const map = {
      h1:'H1 Heading',h2:'H2 Heading',h3:'H3 Heading',h4:'H4 Heading',
      h5:'H5 Heading',h6:'H6 Heading',img:'Image',a:'Link',button:'Button',
      video:'Video',iframe:'iframe',input:'Input',textarea:'Textarea',
      section:'Section',article:'Article',header:'Header',footer:'Footer',
      nav:'Navigation',form:'Form',ul:'List',ol:'List',table:'Table',
    };
    return map[tag] || (tag.toUpperCase() + ' Element');
  }

  function isIconElement(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'i' || tag === 'svg') return true;
    const cls = el.className?.toString?.() || '';
    return /(?:^|\s)(bi|fa[srlbd]?|ri-|material-icons|material-symbols)/.test(cls);
  }

  function getElementType(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'img' || tag === 'picture') return 'image';
    if (isIconElement(el)) return 'icon';
    if (tag === 'a') return 'link';
    if (tag === 'button' || (tag === 'input' && ['submit','button'].includes(el.type))) return 'button';
    if (tag === 'video' || tag === 'iframe') return 'video';
    if (['input','textarea','select'].includes(tag)) return 'input';
    return 'text';
  }

  function getComputedStyles(el) {
    const cs = window.getComputedStyle(el);
    const bgImg = cs.backgroundImage;
    let bgImageUrl = '';
    if (bgImg && bgImg !== 'none') bgImageUrl = bgImg.replace(/^url\(["']?|["']?\)$/g, '');
    return {
      color: rgbToHex(cs.color),
      backgroundColor: rgbToHex(cs.backgroundColor),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      textAlign: cs.textAlign,
      padding: cs.padding !== '0px' ? cs.padding : '',
      margin: cs.margin !== '0px' ? cs.margin : '',
      borderRadius: cs.borderRadius !== '0px' ? cs.borderRadius : '',
      width: el.style.width || (cs.width !== 'auto' ? cs.width : ''),
      height: el.style.height || (cs.height !== 'auto' ? cs.height : ''),
      display: cs.display === 'none' ? 'none' : (el.style.display || ''),
      backgroundImage: bgImageUrl,
    };
  }

  function getElementInfo(el) {
    const tag = el.tagName.toLowerCase();
    const type = getElementType(el);
    const info = {
      id: el.dataset.clonerId,
      tag,
      type,
      isGlobal: isGlobal(el),
      label: getLabel(el),
      innerHTML: el.innerHTML,
      outerHTML: el.outerHTML,
      elementId: el.id || '',
      classes: el.className?.toString?.() || '',
      styles: getComputedStyles(el),
    };

    if (type === 'image') {
      const img = tag === 'picture' ? el.querySelector('img') || el : el;
      info.src = img.getAttribute('src') || '';
      info.alt = img.getAttribute('alt') || '';
      info.width = img.getAttribute('width') || img.style.width || '';
      info.height = img.getAttribute('height') || img.style.height || '';
      info.inHeader = Boolean(el.closest('header, nav, .navbar, .header'));
    } else if (type === 'icon') {
      info.iconClass = el.className?.toString?.() || '';
      info.iconColor = el.style.color || '';
      if (el.tagName === 'IMG') {
        info.iconSrc = el.getAttribute('src') || '';
      } else if (el.classList.contains('material-icons')) {
        info.iconText = el.textContent?.trim() || '';
      }
    } else if (type === 'link') {
      info.text = el.textContent.trim();
      info.href = el.getAttribute('href') || '';
      info.target = el.getAttribute('target') || '';
    } else if (type === 'button') {
      info.text = el.textContent?.trim() || el.value || '';
      info.href = el.closest('a')?.href || el.getAttribute('onclick') || '';
    } else if (type === 'video') {
      info.src = el.getAttribute('src') || el.querySelector('source')?.src || '';
    } else if (type === 'input') {
      info.placeholder = el.placeholder || '';
      info.value = el.value || '';
    } else {
      info.text = el.innerText?.trim() || '';
    }

    return info;
  }

  function safeGetElementInfo(el) {
    try {
      const info = getElementInfo(el);
      if (info.outerHTML?.length > 250000) info.outerHTML = info.outerHTML.slice(0, 250000);
      if (info.innerHTML?.length > 250000) info.innerHTML = info.innerHTML.slice(0, 250000);
      return info;
    } catch {
      return {
        id: el.dataset.clonerId,
        tag: el.tagName.toLowerCase(),
        type: 'text',
        isGlobal: isGlobal(el),
        label: getLabel(el),
        text: el.innerText?.trim() || '',
        innerHTML: '',
        outerHTML: '',
        elementId: el.id || '',
        classes: el.className?.toString?.() || '',
        styles: {},
      };
    }
  }

  function blockEditableEvent(e) {
    const el = e.target?.closest?.('[data-cloner-id]');
    if (!el) return null;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    return el;
  }

  function selectElement(el) {
    if (!el?.dataset?.clonerId) return;
    if (selectedEl) selectedEl.removeAttribute('data-cloner-selected');
    selectedEl = el;
    el.setAttribute('data-cloner-selected', '1');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.parent.postMessage({ type: 'CLONER_SELECT', data: safeGetElementInfo(el) }, '*');
  }

  function isSiteMenuEvent(e) {
    const target = e.target;
    if (!target?.closest) return false;
    return !!target.closest('.dropdown-toggle, #catToggle, .dropdown-menu, .main-menu .dropdown');
  }

  function handleSelectEvent(e) {
    if (isSiteMenuEvent(e)) return;
    const el = e.target?.closest?.('[data-cloner-id]');
    if (!el) return;
    if (moveMode || dragState) return;
    blockEditableEvent(e);
    selectElement(el);
  }

  window.addEventListener('pointerdown', handleSelectEvent, true);
  window.addEventListener('click', (e) => {
    if (isSiteMenuEvent(e)) return;
    const el = e.target?.closest?.('[data-cloner-id]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  }, true);

  function ensureDropIndicator() {
    if (!dropIndicator) {
      dropIndicator = document.createElement('div');
      dropIndicator.className = 'cloner-drop-indicator';
      document.body.appendChild(dropIndicator);
    }
    return dropIndicator;
  }

  function hideDropIndicator() {
    if (dropIndicator) dropIndicator.style.display = 'none';
    document.querySelectorAll('.cloner-drop-target').forEach((n) => n.classList.remove('cloner-drop-target'));
  }

  function getDropTarget(clientX, clientY, draggingEl) {
    const ghost = document.querySelector('.cloner-drag-ghost');
    if (ghost) ghost.style.display = 'none';
    const raw = document.elementFromPoint(clientX, clientY);
    if (ghost) ghost.style.display = '';
    if (!raw) return null;
    const target = raw.closest('[data-cloner-id]');
    if (!target || target === draggingEl || (draggingEl && draggingEl.contains(target))) return null;
    return target;
  }

  function moveElementToTarget(el, target, clientX, clientY, freePosition) {
    if (!target || el === target || el.contains(target)) return false;

    if (freePosition) {
      const container = target.closest('section, article, div, header, footer, main, aside, nav, form, figure')
        || target.parentElement
        || document.body;
      if (container === el || el.contains(container)) return false;
      const rect = container.getBoundingClientRect();
      if (window.getComputedStyle(container).position === 'static') {
        container.style.setProperty('position', 'relative', 'important');
      }
      container.appendChild(el);
      el.style.setProperty('position', 'absolute', 'important');
      el.style.setProperty('left', Math.max(0, clientX - rect.left) + 'px', 'important');
      el.style.setProperty('top', Math.max(0, clientY - rect.top) + 'px', 'important');
      el.style.setProperty('z-index', '20', 'important');
      return true;
    }

    const rect = target.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;
    const parent = target.parentNode;
    if (!parent) return false;

    if (before) parent.insertBefore(el, target);
    else parent.insertBefore(el, target.nextSibling);
    return true;
  }

  let lastUndoHtml = '';
  let styleUndoOpen = false;
  let styleUndoTimer = 0;

  function captureSnapshotHtml() {
    const clone = document.documentElement.cloneNode(true);
    cleanForSave(clone);
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function requestUndoSnapshot() {
    const html = captureSnapshotHtml();
    if (!html || html === lastUndoHtml) return;
    lastUndoHtml = html;
    window.parent.postMessage({ type: 'CLONER_PUSH_UNDO_HTML', html }, '*');
  }

  function beginStyleUndoBurst() {
    if (styleUndoOpen) {
      clearTimeout(styleUndoTimer);
      styleUndoTimer = setTimeout(() => { styleUndoOpen = false; }, 900);
      return;
    }
    requestUndoSnapshot();
    styleUndoOpen = true;
    clearTimeout(styleUndoTimer);
    styleUndoTimer = setTimeout(() => { styleUndoOpen = false; }, 900);
  }

  function restorePageHtml(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const bridgeScripts = [...document.querySelectorAll('script[data-cloner-bridge]')];
    const clonerStyleEl = document.getElementById('cloner-editor-style');
    const clonerStyleClone = clonerStyleEl ? clonerStyleEl.cloneNode(true) : null;

    if (parsed.title) document.title = parsed.title;
    document.head.innerHTML = parsed.head.innerHTML;
    if (clonerStyleClone && !document.getElementById('cloner-editor-style')) {
      document.head.appendChild(clonerStyleClone);
    }

    document.body.innerHTML = parsed.body.innerHTML;
    bridgeScripts.forEach((script) => document.body.appendChild(script));

    if (selectedEl) {
      selectedEl.removeAttribute('data-cloner-selected');
      selectedEl = null;
    }

    ensureEditorChrome();
    assignIds();
    lastUndoHtml = html;
    window.parent.postMessage({ type: 'CLONER_RESTORED' }, '*');
  }

  function startElementDrag(el, e) {
    requestUndoSnapshot();
    const rect = el.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'cloner-drag-ghost';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);
    el.classList.add('cloner-dragging');
    selectElement(el);

    dragState = {
      el,
      ghost,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
    };
  }

  function updateElementDrag(e) {
    if (!dragState) return;
    dragState.moved = true;
    dragState.ghost.style.left = (e.clientX - dragState.offsetX) + 'px';
    dragState.ghost.style.top = (e.clientY - dragState.offsetY) + 'px';

    const target = getDropTarget(e.clientX, e.clientY, dragState.el);
    hideDropIndicator();
    if (!target) return;

    target.classList.add('cloner-drop-target');
    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const indicator = ensureDropIndicator();
    indicator.style.display = 'block';
    indicator.style.left = rect.left + 'px';
    indicator.style.width = rect.width + 'px';
    indicator.style.top = (before ? rect.top : rect.bottom) + 'px';
  }

  function endElementDrag(e) {
    if (!dragState) return;
    const { el, ghost, moved } = dragState;
    ghost.remove();
    el.classList.remove('cloner-dragging');
    hideDropIndicator();

    if (moved) {
      const target = getDropTarget(e.clientX, e.clientY, el);
      if (target) {
        moveElementToTarget(el, target, e.clientX, e.clientY, e.shiftKey);
        window.parent.postMessage({
          type: 'CLONER_ELEMENT_MOVED',
          data: { id: el.dataset.clonerId, freePosition: !!e.shiftKey },
        }, '*');
      }
      selectElement(el);
    }

    dragState = null;
  }

  window.addEventListener('pointerdown', (e) => {
    if (!moveMode) return;
    const el = e.target.closest('[data-cloner-id]');
    if (!el || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    let tracking = true;

    function onMove(ev) {
      if (!tracking) return;
      if (!dragState && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
        startElementDrag(el, ev);
      }
      if (dragState) updateElementDrag(ev);
    }

    function onUp(ev) {
      tracking = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (dragState) endElementDrag(ev);
      else selectElement(el);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, true);

  function ensureFileDropOverlay() {
    if (!fileDropOverlay) {
      fileDropOverlay = document.createElement('div');
      fileDropOverlay.className = 'cloner-file-drop-overlay';
      fileDropOverlay.innerHTML = '<span><i style="font-size:28px;display:block;text-align:center;margin-bottom:8px">⬆</i>Drop image to upload</span>';
      document.body.appendChild(fileDropOverlay);
    }
    return fileDropOverlay;
  }

  function hasImageFiles(dt) {
    return dt?.types?.includes('Files') && [...(dt.items || [])].some((item) => item.kind === 'file' && item.type.startsWith('image/'));
  }

  document.addEventListener('dragenter', (e) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    fileDropDepth++;
    ensureFileDropOverlay().classList.add('visible');
  }, false);

  document.addEventListener('dragover', (e) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    ensureFileDropOverlay().classList.add('visible');
  }, false);

  document.addEventListener('dragleave', () => {
    fileDropDepth = Math.max(0, fileDropDepth - 1);
    if (fileDropDepth === 0) fileDropOverlay?.classList.remove('visible');
  }, false);

  document.addEventListener('drop', (e) => {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    fileDropDepth = 0;
    fileDropOverlay?.classList.remove('visible');

    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      window.parent.postMessage({
        type: 'CLONER_FILE_DROP',
        x: e.clientX,
        y: e.clientY,
        replaceId: selectedEl?.dataset?.clonerId || null,
        fileName: file.name,
        data: reader.result.split(',')[1],
        ext: (file.name.split('.').pop() || 'png').toLowerCase(),
      }, '*');
    };
    reader.readAsDataURL(file);
  }, false);

  /** Keep an image's on-page box when its file is replaced, so the layout doesn't change. */
  function keepImageBox(img, box = img) {
    const r = box.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    img.style.setProperty('width', `min(${Math.round(r.width)}px, 100%)`);
    img.style.setProperty('height', 'auto');
    img.style.setProperty('aspect-ratio', `${Math.round(r.width)} / ${Math.round(r.height)}`);
    img.style.setProperty('object-fit', 'cover');
  }

  function insertImageAtPoint(url, clientX, clientY, replaceId) {
    if (replaceId) {
      const existing = document.querySelector(`[data-cloner-id="${replaceId}"]`);
      if (existing) {
        if (existing.tagName === 'IMG') {
          keepImageBox(existing);
          existing.setAttribute('src', url);
          selectElement(existing);
          return existing;
        }
        const img = document.createElement('img');
        keepImageBox(img, existing);
        img.src = url;
        img.alt = '';
        img.style.maxWidth = '100%';
        img.dataset.clonerId = existing.dataset.clonerId;
        existing.parentNode.replaceChild(img, existing);
        selectElement(img);
        return img;
      }
    }

    const target = getDropTarget(clientX, clientY, null) || document.elementFromPoint(clientX, clientY);
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.style.maxWidth = '100%';
    img.dataset.clonerId = 'c' + (++idCounter);

    if (target?.dataset?.clonerId) {
      const rect = target.getBoundingClientRect();
      const before = clientY < rect.top + rect.height / 2;
      if (before) target.parentNode.insertBefore(img, target);
      else target.parentNode.insertBefore(img, target.nextSibling);
    } else if (target) {
      target.appendChild(img);
    } else {
      document.body.appendChild(img);
    }

    selectElement(img);
    return img;
  }

  document.addEventListener('beforeinput', (e) => {
    const el = e.target?.closest?.('[contenteditable="true"]');
    if (!el || el.dataset.clonerUndoArmed) return;
    el.dataset.clonerUndoArmed = '1';
    requestUndoSnapshot();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    e.preventDefault();
    window.parent.postMessage({ type: 'CLONER_UNDO_KEY', key, shift: e.shiftKey }, '*');
  }, true);

  window.addEventListener('dblclick', (e) => {
    const el = e.target.closest('[data-cloner-id]');
    if (!el || ['IMG','VIDEO','IFRAME','INPUT'].includes(el.tagName)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    requestUndoSnapshot();
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-cloner-inline', '1');
    el.focus();
    const onBlur = () => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-cloner-inline');
      el.removeEventListener('blur', onBlur);
      window.parent.postMessage({
        type: 'CLONER_INLINE_EDIT',
        data: { id: el.dataset.clonerId, innerHTML: el.innerHTML, isGlobal: isGlobal(el) },
      }, '*');
    };
    el.addEventListener('blur', onBlur);
  }, true);

  function applyStyles(el, styles) {
    if (!styles) return;
    const map = {
      color: 'color',
      backgroundColor: 'background-color',
      fontSize: 'font-size',
      fontWeight: 'font-weight',
      textAlign: 'text-align',
      padding: 'padding',
      margin: 'margin',
      borderRadius: 'border-radius',
      width: 'width',
      height: 'height',
      display: 'display',
    };
    Object.entries(map).forEach(([key, prop]) => {
      if (styles[key] !== undefined && styles[key] !== '') {
        el.style.setProperty(prop, styles[key], 'important');
      } else if (styles[key] === '') {
        el.style.removeProperty(prop);
      }
    });
    if (styles.backgroundImage) {
      const bg = styles.backgroundImage.startsWith('url')
        ? styles.backgroundImage : `url(${styles.backgroundImage})`;
      el.style.setProperty('background-image', bg, 'important');
    } else if (styles.backgroundImage === '') {
      el.style.removeProperty('background-image');
    }
  }

  function applyEdit(msg) {
    const el = document.querySelector(`[data-cloner-id="${msg.id}"]`);
    if (!el) return;
    if (msg.editType === 'style-only') beginStyleUndoBurst();
    else {
      styleUndoOpen = false;
      clearTimeout(styleUndoTimer);
      requestUndoSnapshot();
    }

    if (msg.action === 'delete') { el.remove(); return; }

    if (msg.action === 'duplicate') {
      const clone = el.cloneNode(true);
      clone.dataset.clonerId = 'c' + (++idCounter);
      clone.removeAttribute('data-cloner-selected');
      el.parentNode.insertBefore(clone, el.nextSibling);
      return;
    }

    const styleOnly = msg.editType === 'style-only';

    if (!styleOnly && msg.editType === 'html' && msg.innerHTML !== undefined) {
      el.innerHTML = msg.innerHTML;
    }

    if (msg.elementId !== undefined && msg.elementId !== '') el.id = msg.elementId;
    if (msg.classes !== undefined && msg.classes !== '') el.className = msg.classes;
    if (msg.customCss) {
      msg.customCss.split(';').forEach((rule) => {
        const [prop, val] = rule.split(':').map((s) => s.trim());
        if (prop && val) el.style.setProperty(prop, val, 'important');
      });
    }

    if (!styleOnly) {
      if (msg.editType === 'image') {
        const img = el.tagName === 'PICTURE' ? (el.querySelector('img') || el) : el;
        if (msg.src) {
          if (msg.src !== img.getAttribute('src') && !msg.width && !msg.height) keepImageBox(img);
          img.setAttribute('src', msg.src);
          img.removeAttribute('srcset');
          // Lazy-load scripts copy these into src later, which would bring the old image back.
          ['data-src', 'data-imgurl', 'data-lazy-src', 'data-original', 'data-lazy', 'data-srcset']
            .forEach((attr) => { if (img.hasAttribute(attr)) img.setAttribute(attr, attr === 'data-srcset' ? '' : msg.src); });
          const picture = img.closest('picture');
          if (picture) picture.querySelectorAll('source').forEach((source) => source.removeAttribute('srcset'));
        }
        if (msg.alt !== undefined) img.setAttribute('alt', msg.alt);
        if (msg.width) img.style.setProperty('width', msg.width, 'important');
        if (msg.height) img.style.setProperty('height', msg.height, 'important');
      } else if (msg.editType === 'icon') {
        if (msg.iconClass !== undefined) el.className = msg.iconClass;
        if (msg.iconColor) el.style.setProperty('color', msg.iconColor, 'important');
      } else if (msg.editType === 'link') {
        if (msg.text !== undefined) el.textContent = msg.text;
        if (msg.href) el.setAttribute('href', msg.href);
        if (msg.target) el.setAttribute('target', msg.target);
        else el.removeAttribute('target');
      } else if (msg.editType === 'button') {
        if (msg.text !== undefined && msg.text !== '') {
          if (el.tagName === 'A') { el.textContent = msg.text; if (msg.href) el.href = msg.href; }
          else if (el.tagName === 'INPUT') el.value = msg.text;
          else if (!el.querySelector('a, svg, img')) el.textContent = msg.text;
        }
      } else if (msg.editType === 'video') {
        if (el.tagName === 'IFRAME' || el.tagName === 'VIDEO') el.setAttribute('src', msg.src);
        else { const s = el.querySelector('source'); if (s) s.src = msg.src; }
      } else if (msg.editType === 'input') {
        if (msg.placeholder !== undefined) el.placeholder = msg.placeholder;
        if (msg.value !== undefined) el.value = msg.value;
      } else if (msg.editType === 'text' && msg.text !== undefined) {
        if (!el.querySelector('a, img, svg, br')) el.textContent = msg.text;
        else if (msg.text !== '') el.textContent = msg.text;
      }
    }

    if (msg.styles) applyStyles(el, msg.styles);
  }

  function stripSlickForSave(root) {
    root.querySelectorAll('.slick-initialized').forEach((el) => {
      if (el.closest('.slick-initialized') !== el) return;
      el.querySelectorAll('.slick-dots, .slick-arrow').forEach((n) => n.remove());
      const track = el.querySelector(':scope > .slick-list > .slick-track, :scope > .slick-track');
      if (!track) return;
      const items = [];
      track.querySelectorAll(':scope > .slick-slide:not(.slick-cloned)').forEach((slide) => {
        let node = slide.firstElementChild;
        if (node?.children.length === 1 && /^(LI|DIV)$/i.test(node.firstElementChild?.tagName)) {
          node = node.firstElementChild;
        }
        if (node) items.push(node.cloneNode(true));
      });
      el.replaceChildren(...items);
      el.className = el.className.split(/\s+/).filter((c) => c && !c.startsWith('slick-')).join(' ');
      el.removeAttribute('style');
    });
    root.querySelectorAll('.slick-dots, .slick-arrow').forEach((n) => n.remove());
  }

  function cleanForSave(root) {
    stripSlickForSave(root);
    root.querySelectorAll('.cloner-edit-hint,.cloner-drag-ghost,.cloner-drop-indicator,.cloner-file-drop-overlay').forEach((n) => n.remove());
    root.querySelectorAll('.cloner-dragging,.cloner-drop-target').forEach((el) => {
      el.classList.remove('cloner-dragging', 'cloner-drop-target');
    });
    root.querySelectorAll('#cloner-editor-style').forEach((n) => n.remove());
    root.querySelectorAll('style').forEach((s) => {
      if (s.textContent.includes('data-cloner-id')) s.remove();
    });
    // The editor's own bridge must never end up in the saved or exported site.
    root.querySelectorAll('script').forEach((s) => {
      if (s.hasAttribute('data-cloner-bridge') || s.textContent.includes('__clonerEditorActive')) s.remove();
    });
    root.querySelectorAll('[data-cloner-id],[data-cloner-selected],[data-cloner-inline]').forEach((el) => {
      el.removeAttribute('data-cloner-id');
      el.removeAttribute('data-cloner-selected');
      el.removeAttribute('data-cloner-inline');
      el.removeAttribute('data-cloner-undo-armed');
      el.removeAttribute('contenteditable');
    });
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg?.type) return;

    if (msg.type === 'CLONER_SET_MOVE_MODE') {
      moveMode = !!msg.enabled;
      document.body.classList.toggle('cloner-move-mode', moveMode);
      if (hint) {
        hint.classList.remove('is-faded');
        hint.textContent = moveMode
          ? 'Move mode on · Drag an element to reposition it · Hold Shift to place it freely'
          : 'Click an element to edit it · Double-click to type inline · Drop an image to replace one';
        setTimeout(() => hint?.classList.add('is-faded'), 6000);
      }
    }

    if (msg.type === 'CLONER_INSERT_IMAGE') {
      requestUndoSnapshot();
      const el = insertImageAtPoint(msg.url, msg.x, msg.y, msg.replaceId);
      if (el) {
        window.parent.postMessage({
          type: 'CLONER_SELECT',
          data: getElementInfo(el),
        }, '*');
      }
    }

    if (msg.type === 'CLONER_APPLY') applyEdit(msg);

    // Insert a library image or video next to (or inside) the selected element.
    if (msg.type === 'CLONER_INSERT_MEDIA') {
      const anchor = msg.id ? document.querySelector(`[data-cloner-id="${msg.id}"]`) : null;
      if (!anchor || !msg.src) return;
      requestUndoSnapshot();
      let media;
      if (msg.media === 'video') {
        media = document.createElement('video');
        media.setAttribute('controls', '');
        media.setAttribute('playsinline', '');
        media.setAttribute('preload', 'metadata');
      } else {
        media = document.createElement('img');
        media.setAttribute('alt', msg.alt || '');
        media.setAttribute('loading', 'lazy');
      }
      media.setAttribute('src', msg.src);
      media.style.setProperty('max-width', '100%');
      media.style.setProperty('height', 'auto');
      const position = ['beforebegin', 'afterend', 'afterbegin', 'beforeend'].includes(msg.position) ? msg.position : 'afterend';
      anchor.insertAdjacentElement(position, media);
      assignIds();
      selectElement(media);
    }

    // Make an uploaded font available on the page (idempotent per family).
    if (msg.type === 'CLONER_ADD_FONT') {
      if (!msg.family || !msg.src) return;
      const family = String(msg.family).replace(/['"\\<>]/g, '');
      if (document.querySelector(`style[data-cloner-font="${CSS.escape(family)}"]`)) return;
      const style = document.createElement('style');
      style.setAttribute('data-cloner-font', family);
      style.textContent = `@font-face{font-family:'${family}';src:url("${String(msg.src).replace(/["\\]/g, '')}");font-display:swap;}`;
      document.head.appendChild(style);
    }

    if (msg.type === 'CLONER_REPLACE_OUTER') {
      const el = msg.id ? document.querySelector(`[data-cloner-id="${msg.id}"]`) : null;
      if (!el || !msg.outerHTML) return;
      // An AI result is already saved on disk (and undoable from there), so it isn't a pending preview edit.
      if (!msg.saved) requestUndoSnapshot();
      const template = document.createElement('template');
      template.innerHTML = msg.outerHTML.trim();
      const newEl = template.content.firstElementChild;
      if (!newEl) return;
      el.replaceWith(newEl);
      assignIds();
      selectElement(newEl);
    }

    if (msg.type === 'CLONER_APPLY_SEO') {
      requestUndoSnapshot();
      document.title = msg.title || document.title;
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
      meta.content = msg.description || '';
    }

    if (msg.type === 'CLONER_GET_HTML') {
      document.querySelectorAll('[data-cloner-selected],[data-cloner-inline]').forEach((el) => {
        el.removeAttribute('data-cloner-selected');
        el.removeAttribute('data-cloner-inline');
        el.removeAttribute('contenteditable');
      });
      const clone = document.documentElement.cloneNode(true);
      cleanForSave(clone);
      window.parent.postMessage({
        type: 'CLONER_HTML', requestId: msg.requestId,
        html: '<!DOCTYPE html>\n' + clone.outerHTML,
      }, '*');
    }

    if (msg.type === 'CLONER_REASSIGN') assignIds();

    if (msg.type === 'CLONER_RESTORE_HTML' && msg.html) {
      restorePageHtml(msg.html);
    }

    if (msg.type === 'CLONER_ADD_LIBRARY') {
      if (!document.getElementById(msg.cdnId)) {
        if (msg.libType === 'js') {
          const script = document.createElement('script');
          script.id = msg.cdnId;
          script.src = msg.cdn;
          document.head.appendChild(script);
        } else {
          const link = document.createElement('link');
          link.id = msg.cdnId;
          link.rel = 'stylesheet';
          link.href = msg.cdn;
          document.head.appendChild(link);
        }
      }
      window.parent.postMessage({ type: 'CLONER_LIBRARY_ADDED', libId: msg.libId }, '*');
    }

    function createIconEl(msg) {
      // SVG image mode — always visible, no font needed
      if (msg.useSvg && msg.svgUrl) {
        const img = document.createElement('img');
        img.src = msg.svgUrl;
        img.alt = msg.iconName || 'icon';
        img.style.width = msg.iconSize || '24px';
        img.style.height = msg.iconSize || '24px';
        img.style.display = 'inline-block';
        img.style.verticalAlign = 'middle';
        if (msg.iconColor) img.style.filter = colorToFilter(msg.iconColor);
        return img;
      }

      const icon = document.createElement(msg.textContent || msg.iconText ? 'span' : 'i');
      icon.className = msg.iconClass || '';
      icon.setAttribute('aria-hidden', 'true');
      if (msg.textContent || msg.iconText) {
        icon.textContent = msg.iconText || msg.iconName || '';
      }
      icon.style.display = 'inline-block';
      icon.style.lineHeight = '1';
      icon.style.verticalAlign = 'middle';
      if (msg.iconSize) icon.style.fontSize = msg.iconSize;
      if (msg.iconColor) icon.style.color = msg.iconColor;
      return icon;
    }

    function colorToFilter(hex) {
      // Simple white icon filter for dark backgrounds
      if (!hex || hex === '#ffffff' || hex === '#fff' || hex === 'white') {
        return 'brightness(0) invert(1)';
      }
      return 'none';
    }

    function replaceWithIcon(el, msg) {
      const newEl = createIconEl(msg);
      newEl.dataset.clonerId = el.dataset.clonerId || ('c' + (++idCounter));
      if (el.parentNode) el.parentNode.replaceChild(newEl, el);
      return newEl;
    }

    if (msg.type === 'CLONER_USE_ICON') {
      requestUndoSnapshot();
      // Ensure library CSS is loaded first
      if (msg.cdn && msg.cdnId && !document.getElementById(msg.cdnId)) {
        if (msg.libType === 'js') {
          const s = document.createElement('script');
          s.id = msg.cdnId; s.src = msg.cdn;
          document.head.appendChild(s);
        } else {
          const l = document.createElement('link');
          l.id = msg.cdnId; l.rel = 'stylesheet'; l.href = msg.cdn;
          document.head.appendChild(l);
        }
      }

      let el = msg.id
        ? document.querySelector(`[data-cloner-id="${msg.id}"]`)
        : selectedEl;

      if (el) {
        // SVG icons or non-<i> targets → replace element so text like "phone" never shows raw
        if (msg.useSvg || el.tagName !== 'I') {
          el = replaceWithIcon(el, msg);
        } else {
          el.className = msg.iconClass || '';
          if (msg.textContent || msg.iconText) {
            el.textContent = msg.iconText || msg.iconName || '';
          }
          el.style.display = 'inline-block';
          if (msg.iconSize) el.style.fontSize = msg.iconSize;
          if (msg.iconColor) el.style.color = msg.iconColor;
        }
        selectElement(el);
      } else if (msg.insert) {
        const icon = createIconEl(msg);
        icon.dataset.clonerId = 'c' + (++idCounter);
        if (selectedEl && selectedEl.parentNode) {
          selectedEl.parentNode.insertBefore(icon, selectedEl.nextSibling);
        } else {
          document.body.appendChild(icon);
        }
        selectElement(icon);
      }
    }

    if (msg.type === 'CLONER_GET_LIBRARIES') {
      const libs = [];
      document.querySelectorAll('link[id^="cloner-lib-"]').forEach((l) => {
        libs.push({ cdnId: l.id, cdn: l.href });
      });
      window.parent.postMessage({ type: 'CLONER_LIBRARIES_LIST', libs }, '*');
    }
  });

  function boot() {
    if (!ensureEditorChrome()) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
      } else {
        requestAnimationFrame(boot);
      }
      return;
    }

    assignIds();

    const observer = new MutationObserver(() => assignIds());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.parent.postMessage({ type: 'CLONER_READY' }, '*');
  }

  boot();
})();
