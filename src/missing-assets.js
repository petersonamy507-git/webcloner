/**
 * "Some images are missing" bar in the editor.
 *
 * After a clone, broken images that couldn't be downloaded again are replaced by a red
 * "Image missing" placeholder. The user must replace each one (brand asset or upload)
 * before the site can be pushed to GitHub; this bar counts them and jumps to the next one.
 */
const PLACEHOLDER = 'cloner/missing-';
const SELECTOR = `[data-missing-asset], img[src*="${PLACEHOLDER}"], [style*="${PLACEHOLDER}"], video[poster*="${PLACEHOLDER}"]`;

export function initMissingAssets({ folder, previewFrame, getPage, goToPage, reloadPreview, flush }) {
  const preview = previewFrame.closest('.editor-preview');
  const bar = document.createElement('div');
  bar.className = 'missing-bar d-none';
  bar.setAttribute('role', 'status');
  preview?.insertBefore(bar, preview.firstChild);

  let report = null;
  let busy = false;
  let shown = -1;
  let refreshTimer = null;

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function onPage() {
    const doc = previewFrame.contentDocument;
    if (!doc?.body) return [];
    // Elements that still show a placeholder (a replaced image keeps no placeholder path).
    return [...doc.querySelectorAll(SELECTOR)].filter((el) => {
      const html = el.outerHTML.slice(0, 2000);
      return html.includes(PLACEHOLDER);
    });
  }

  function render(message) {
    if (message) {
      bar.className = 'missing-bar busy';
      bar.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${message}</span>`;
      return;
    }
    const total = report?.missing || 0;
    if (!total) {
      bar.className = 'missing-bar d-none';
      bar.innerHTML = '';
      return;
    }
    const here = onPage().length;
    bar.className = 'missing-bar';
    bar.innerHTML = `
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <span class="missing-text"><strong>Some images are missing:</strong> ${plural(total, 'image')} must be replaced before this site can go to GitHub${here ? ` (${here} on this page)` : ''}. Click a red box, then replace it with a brand asset or an upload.</span>
      <button type="button" class="btn btn-sm btn-light" data-act="next"><i class="bi bi-crosshair me-1"></i>Show next</button>
      <button type="button" class="btn btn-sm btn-outline-light" data-act="recheck" title="Try downloading the missing images again"><i class="bi bi-arrow-repeat me-1"></i>Re-check</button>`;
  }

  async function refresh() {
    try {
      const res = await fetch(`/api/missing-assets?folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      if (!res.ok || !data.success) return null;
      report = data;
      if (!busy) render();
      return data;
    } catch {
      return null;
    }
  }

  async function repair({ quiet = false } = {}) {
    if (busy) return;
    busy = true;
    render(quiet ? 'Checking this site for broken images…' : 'Trying to download the missing images again…');
    try {
      await flush?.();
      const res = await fetch('/api/repair-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        report = data;
        if (data.pagesChanged || data.recovered) reloadPreview();
      }
    } catch { /* the bar just shows the last known state */ }
    busy = false;
    render();
  }

  function showNext() {
    const items = onPage();
    if (!items.length) {
      // Nothing left here: open the next page that still has missing images.
      const page = Object.keys(report?.pages || {}).find((p) => p !== getPage());
      if (page) goToPage(page);
      return;
    }
    shown = (shown + 1) % items.length;
    const el = items[shown];
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // The editor selects whatever is clicked, which opens "Replace this image".
    setTimeout(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: previewFrame.contentWindow })), 350);
  }

  bar.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') showNext();
    if (act === 'recheck') repair();
  });

  function changed() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 600);
  }

  // Every reload (page switch, AI edit, restore) may change what's missing.
  previewFrame.addEventListener('load', () => { shown = -1; changed(); });

  return {
    async start() {
      const data = await refresh();
      // Sites cloned before this check existed get one pass the first time they're opened.
      if (data && !data.checkedAt) repair({ quiet: true });
    },
    /** Call after a save: replacing a placeholder lowers the count. */
    changed,
  };
}
