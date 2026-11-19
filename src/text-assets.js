/**
 * "Company details": the text assets of this site's entity brands (name, phones, emails,
 * address, website, tagline). Shown when text is selected, like "Replace this image" for
 * images. Clicking a detail puts it into the selected text: a phone or email replaces just
 * the number/address inside (and its tel:/mailto: link); anything else replaces the text.
 */
const ICONS = { name: 'bi-building', phone: 'bi-telephone', email: 'bi-envelope', address: 'bi-geo-alt', website: 'bi-globe2', tagline: 'bi-chat-quote' };
const LABELS = { name: 'Company name', phone: 'Phone', email: 'Email', address: 'Address', website: 'Website', tagline: 'Tagline' };
const PHONE = /\+?\(?\d[\d\s().-]{6,18}\d/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** What the selected text most likely is, so the matching details come first. */
export function detailKind(text, href = '') {
  const t = String(text || '').trim();
  if (/^tel:|^callto:|^sms:/i.test(href) || (PHONE.test(t) && t.replace(/\D/g, '').length >= 7 && t.length < 40)) return 'phone';
  if (/^mailto:/i.test(href) || EMAIL.test(t)) return 'email';
  if (/^https?:\/\//i.test(t)) return 'website';
  if (/\d/.test(t) && /,/.test(t) && t.length < 160) return 'address';
  if (/\b(?:street|st\.|road|avenue|ave|suite|floor|blvd|drive)\b/i.test(t) && t.length < 160) return 'address';
  return '';
}

function detailsOf(brand) {
  const list = [];
  const add = (kind, value) => { if (value && !list.some((d) => d.kind === kind && d.value === value)) list.push({ kind, value }); };
  add('name', brand.name);
  (brand.phones?.length ? brand.phones : [brand.phone]).forEach((v) => add('phone', v));
  (brand.emails?.length ? brand.emails : [brand.email]).forEach((v) => add('email', v));
  add('address', brand.address);
  add('website', brand.website);
  add('tagline', brand.tagline);
  return list;
}

export function initTextAssets({ folder, previewFrame, getSelected }) {
  const sidebarBody = document.querySelector('#editSidebar .sidebar-body') || document.querySelector('.sidebar-body');
  const box = document.createElement('div');
  box.id = 'textAssets';
  box.className = 'brand-gallery text-assets d-none';
  box.innerHTML = `
    <div class="brand-gallery-title">Company details</div>
    <p class="brand-gallery-hint">Click a detail to put it in the selected text. A phone number or email replaces just the number or address inside it.</p>
    <div class="brand-gallery-brands" data-role="brands"></div>
    <div class="text-asset-list" data-role="list"></div>
    <div class="brand-gallery-status" data-role="status"></div>`;
  sidebarBody?.insertBefore(box, sidebarBody.firstChild);
  const brandsEl = box.querySelector('[data-role="brands"]');
  const listEl = box.querySelector('[data-role="list"]');
  const statusEl = box.querySelector('[data-role="status"]');

  let brands = null;
  let activeId = '';
  let loading = null;

  const setStatus = (text, error = false) => {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', Boolean(error));
  };

  async function load() {
    if (brands) return brands;
    loading ||= fetch(`/api/brands?folder=${encodeURIComponent(folder)}`)
      .then((r) => r.json())
      .then((data) => {
        brands = (data.brands || []).filter((b) => b.usable);
        return brands;
      })
      .catch(() => { brands = []; return brands; });
    return loading;
  }

  function render() {
    const sel = getSelected();
    const kind = detailKind(sel?.text, sel?.href);
    brandsEl.innerHTML = brands.map((b) => `<button type="button" class="brand-chip${b.id === activeId ? ' active' : ''}" data-brand="${esc(b.id)}">${esc(b.name)}</button>`).join('');
    const brand = brands.find((b) => b.id === activeId) || brands[0];
    if (!brand) {
      listEl.innerHTML = '';
      setStatus("This site's entity has no brands with company details yet.");
      return;
    }
    // The details that match what's selected (a phone for a phone number…) come first.
    const details = detailsOf(brand).sort((a, b) => (b.kind === kind) - (a.kind === kind));
    listEl.innerHTML = details.map((d, i) => `
      <button type="button" class="text-asset${d.kind === kind ? ' match' : ''}" data-index="${i}" title="Put this ${LABELS[d.kind].toLowerCase()} in the selected text">
        <i class="bi ${ICONS[d.kind]}" aria-hidden="true"></i>
        <span class="text-asset-body"><small>${LABELS[d.kind]}${d.kind === kind ? ' · matches your selection' : ''}</small><span>${esc(d.value)}</span></span>
      </button>`).join('');
    listEl._details = details;
    setStatus('');
  }

  brandsEl.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-brand]');
    if (!chip) return;
    activeId = chip.dataset.brand;
    render();
  });

  listEl.addEventListener('click', (event) => {
    const row = event.target.closest('.text-asset');
    const sel = getSelected();
    if (!row || !sel) return;
    const detail = listEl._details?.[Number(row.dataset.index)];
    if (!detail) return;
    previewFrame.contentWindow?.postMessage({ type: 'CLONER_REPLACE_TEXT', id: sel.id, kind: detail.kind, value: detail.value }, '*');
    setStatus(`${LABELS[detail.kind]} placed.`);
  });

  return {
    /** The editor calls this whenever something is selected. */
    async show(visible) {
      box.classList.toggle('d-none', !visible);
      if (!visible) return;
      await load();
      if (!activeId && brands[0]) activeId = brands[0].id;
      render();
    },
  };
}
