/**
 * Browser interaction guard for cloning.
 *
 * Gets ordinary UI out of the way so the page underneath can be captured:
 *   - cookie consent, newsletter, promo, region/location and notification popups
 *     are dismissed, preferring "reject" / "close" over "accept";
 *   - alert / confirm / prompt dialogs are dismissed, pop-up windows closed;
 *   - notification, location, camera and microphone requests are denied and logged.
 *
 * Genuine access controls (sign-in walls, CAPTCHAs / bot checks, paywalls, age
 * gates, HTTP 401/403) are never clicked through or hidden: they are reported, and
 * the only way past them is a session the user supplies (see parseSessionCookies).
 *
 * Nothing here edits what gets saved: overlays the guard hides are restored in
 * snapshotHtml(), and the site's own modal markup and scripts stay in the clone.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CMP_FRAME_RE = /consent|cmp|privacy-?mgmt|sourcepoint|trustarc|truste|cookielaw|onetrust|cookiebot|usercentrics|quantcast|didomi|cookieyes|iubenda|termly|osano/i;

// ---------------------------------------------------------------------------
// Runs inside the page (must be self-contained).
// action: 'inspect' | 'dismiss' | 'dismiss-frame' | 'snapshot'
function guardInPage(action) {
  const vw = innerWidth;
  const vh = innerHeight;
  const DIALOG_SEL = '[role=dialog],[role=alertdialog],[aria-modal=true],dialog[open]';
  const HINT = /cookie|consent|gdpr|ccpa|privacy|modal|popup|pop-up|overlay|newsletter|subscribe|signup|lightbox|interstitial|promo|offer|notice|dialog|geo-?(ip|loc)|region|country|locale|notification|push|backdrop|sp_message|fancybox|mfp-|klaviyo|optin|exit-intent/i;
  const RESTRICTED = [
    ['captcha', /captcha|verify (that )?you('| a)re (a )?human|are you a robot|security check|checking (if the site connection is secure|your browser)|just a moment\.\.\./i],
    ['sign-in', /please (sign|log) ?in|(sign|log) ?in (to|required)|members only|login required|enter your password/i],
    ['paywall', /subscribe to (continue|keep) reading|subscription required|reached your (free )?(article )?limit|already a subscriber\?/i],
    ['age-gate', /(are you|you must be|confirm (that )?you are) (over |at least )?(18|19|21)|enter your (date of birth|birth ?date)|age verification|(of )?legal (drinking )?age/i],
  ];
  const REJECT = /^(reject|decline|deny|refuse|disagree)( all)?( cookies| optional cookies| non-essential( cookies)?| and close)?$|^(use |accept |allow )?(only )?(strictly )?(necessary|essential|required)( cookies)?( only)?$|^(do not|don'?t) (consent|accept|agree|sell)( my (personal )?info(rmation)?)?$|^continue without (accepting|agreeing|consent)$|^opt[ -]?out$/;
  const CLOSE = /^(×|✕|✖|╳|x|close|close (this )?(dialog|popup|pop-up|modal|banner|window|message)|dismiss|no,? thanks?|no thank you|not now|not interested|maybe later|later|remind me later|skip|skip for now|got it|understood|i understand|block|don'?t allow|never|stay on (this )?(site|page))[.!]?$/;
  const ACCEPT = /^(accept|agree|ok|okay|continue|i agree|i accept|yes,? i agree|accept (all|&|and)[\w &]*|accept cookies|allow (all|cookies|all cookies)|agree (&|and) (continue|close|proceed)|continue to (site|website|shopping)|proceed|confirm( my choices)?|save( and exit| settings| preferences)?)[.!]?$/;
  const CMP_BUTTONS = {
    reject: ['#onetrust-reject-all-handler', '.ot-pc-refuse-all-handler', '#CybotCookiebotDialogBodyButtonDecline', '#didomi-notice-disagree-button',
      '[data-testid="uc-deny-all-button"]', '.osano-cm-denyAll', '.cky-btn-reject', '.cmplz-deny', '#cookie_action_close_header_reject',
      '.fc-cta-do-not-consent', '.iubenda-cs-reject-btn', '.cc-deny', '.termly-styles-root button[data-tid="banner-decline"]'],
    close: ['#onetrust-close-btn-handler', '.onetrust-close-btn-handler', '.cc-dismiss', '.cky-banner-btn-close', '.iubenda-cs-close-btn'],
    accept: ['#onetrust-accept-btn-handler', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection', '#CybotCookiebotDialogBodyButtonAccept',
      '#didomi-notice-agree-button', '[data-testid="uc-accept-all-button"]', '.cky-btn-accept', '.cmplz-accept', '.fc-cta-consent', '.iubenda-cs-accept-btn', '.cc-allow'],
  };

  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const sigOf = (el) => `${el.id || ''} ${typeof el.className === 'string' ? el.className : (el.className?.baseVal || '')} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-testid') || ''}`;
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  };
  const coverage = (el) => {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return (w * h) / (vw * vh);
  };
  const saveStyle = (el) => { if (!el.hasAttribute('data-cloner-style')) el.setAttribute('data-cloner-style', el.getAttribute('style') ?? 'cloner:none'); };
  const saveClass = (el) => { if (!el.hasAttribute('data-cloner-class')) el.setAttribute('data-cloner-class', el.getAttribute('class') ?? 'cloner:none'); };
  // Before clicking a popup that came with the page's HTML, note its markup and
  // place so snapshot can put it back (script-made popups come back on their own).
  const remember = (el) => {
    if (!window.__clonerParsed?.has(el) || el.hasAttribute('data-cloner-overlay')) return;
    const n = (window.__clonerSeq = (window.__clonerSeq || 0) + 1);
    saveStyle(el);
    saveClass(el);
    el.setAttribute('data-cloner-overlay', String(n));
    const add = (node, attr) => node?.setAttribute(attr, `${node.getAttribute(attr) || ''} ${n}`.trim());
    add(el.parentElement, 'data-cloner-parent');
    add(el.nextElementSibling, 'data-cloner-next');
    (window.__clonerOverlays ||= []).push({ n, html: el.outerHTML });
  };
  const hide = (el) => { saveStyle(el); el.setAttribute('data-cloner-hidden', '1'); el.style.setProperty('display', 'none', 'important'); };

  if (action === 'snapshot-dismissed') {
    // For pages whose scripts are removed (frozen): keep the page as it is now, after the
    // popups were answered or closed. Nothing could ever close a restored popup again.
    const copy = document.documentElement.cloneNode(true);
    copy.querySelectorAll('[data-cloner-hidden]').forEach((el) => el.remove());
    for (const el of [copy, ...copy.querySelectorAll('[data-cloner-style],[data-cloner-class],[data-cloner-overlay],[data-cloner-parent],[data-cloner-next]')]) {
      for (const a of ['style', 'class', 'hidden', 'overlay', 'parent', 'next']) el.removeAttribute(`data-cloner-${a}`);
    }
    return copy.outerHTML;
  }

  if (action === 'snapshot') {
    // The DOM as the site rendered it, minus anything the guard changed.
    const copy = document.documentElement.cloneNode(true);
    // Popups that were part of the page's HTML and that the site deleted when we
    // clicked them go back where they were, so the clone keeps them.
    for (const rec of window.__clonerOverlays || []) {
      if (document.querySelector(`[data-cloner-overlay="${rec.n}"]`)) continue;
      const parent = copy.querySelector(`[data-cloner-parent~="${rec.n}"]`) || copy.querySelector('body');
      if (!parent) continue;
      const next = [...parent.children].find((c) => (c.getAttribute('data-cloner-next') || '').split(' ').includes(String(rec.n)));
      const tpl = document.createElement('template');
      tpl.innerHTML = rec.html;
      parent.insertBefore(tpl.content, next || null);
    }
    for (const el of copy.querySelectorAll('[data-cloner-style]')) {
      const v = el.getAttribute('data-cloner-style');
      if (v === 'cloner:none') el.removeAttribute('style'); else el.setAttribute('style', v);
    }
    for (const el of [copy, ...copy.querySelectorAll('[data-cloner-class]')]) {
      if (!el.hasAttribute?.('data-cloner-class')) continue;
      const v = el.getAttribute('data-cloner-class');
      if (v === 'cloner:none') el.removeAttribute('class'); else el.setAttribute('class', v);
    }
    if (copy.hasAttribute('data-cloner-style')) {
      const v = copy.getAttribute('data-cloner-style');
      if (v === 'cloner:none') copy.removeAttribute('style'); else copy.setAttribute('style', v);
    }
    for (const el of [copy, ...copy.querySelectorAll('[data-cloner-style],[data-cloner-class],[data-cloner-hidden],[data-cloner-overlay],[data-cloner-parent],[data-cloner-next]')]) {
      for (const a of ['style', 'class', 'hidden', 'overlay', 'parent', 'next']) el.removeAttribute(`data-cloner-${a}`);
    }
    return copy.outerHTML;
  }

  const restrictedKind = (el, text) => {
    if (el.querySelector('input[type=password]') && shown(el.querySelector('input[type=password]'))) return 'sign-in';
    if (el.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare"],.g-recaptcha,.h-captcha,.cf-turnstile')) return 'captcha';
    for (const [kind, re] of RESTRICTED) if (re.test(text)) return kind;
    return null;
  };

  const labelOf = (b) => (b.innerText || b.value || b.getAttribute('aria-label') || b.getAttribute('title') || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const navigatesAway = (b) => {
    const a = b.closest('a[href]');
    if (!a) return false;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return false;
    try { const u = new URL(href, location.href); return u.origin !== location.origin || u.pathname !== location.pathname; } catch { return true; }
  };
  const isSubmitWithData = (b) => {
    const form = b.closest('form');
    return !!form && !!form.querySelector('input[type=email],input[type=tel],input[type=password],textarea');
  };
  const pickButton = (scope, allowAccept) => {
    const buttons = [...scope.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit], [aria-label], [class*=close], [id*=close], [class*=dismiss]')]
      .filter((b) => shown(b) && !navigatesAway(b) && !isSubmitWithData(b));
    const by = (test) => buttons.find((b) => { const l = labelOf(b); return l.length <= 60 && test(l, b); });
    return by((l) => REJECT.test(l))
      || by((l, b) => CLOSE.test(l) || (/(^|\b)(close|dismiss)(\b|$)/.test(`${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${typeof b.className === 'string' ? b.className : ''} ${b.id}`.toLowerCase()) && l.length <= 12))
      || (allowAccept && by((l) => ACCEPT.test(l)));
  };

  const report = { overlays: [], dismissed: [], restricted: [], acted: false };
  const clicked = [];

  if (action === 'dismiss-frame') {
    // A consent platform's own iframe (Sourcepoint, TrustArc, ...).
    const b = pickButton(document, true);
    if (b) { const label = labelOf(b) || 'close'; b.click(); report.dismissed.push({ kind: 'cookie-consent', action: label }); report.acted = true; }
    return report;
  }

  // 1. Known consent platforms by their stable selectors.
  if (action === 'dismiss') {
    outer: for (const group of ['reject', 'close', 'accept']) {
      for (const sel of CMP_BUTTONS[group]) {
        const b = document.querySelector(sel);
        if (b && shown(b)) {
          const banner = [...document.querySelectorAll(DIALOG_SEL)].find((d) => d.contains(b))
            || b.closest('[id*=onetrust-banner],[id*=onetrust-consent],#CybotCookiebotDialog,#didomi-host,#usercentrics-root,.cc-window,.cky-consent-container,.cmplz-cookiebanner,.iubenda-cs-container,.osano-cm-window,.fc-consent-root')
            || b.parentElement;
          if (banner) remember(banner);
          report.dismissed.push({ kind: 'cookie-consent', action: labelOf(b) || group });
          clicked.push(b);
          b.click();
          report.acted = true;
          break outer;
        }
      }
    }
  }

  // 2. Everything that floats above the page: dialogs and fixed/sticky layers.
  const found = new Set(document.querySelectorAll(DIALOG_SEL));
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const pos = getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'sticky') found.add(el);
  }
  const layers = [...found].filter((el) => !el.closest('[data-cloner-hidden]') && shown(el));
  const outermost = layers.filter((el) => !layers.some((other) => other !== el && other.contains(el)));

  for (const el of outermost) {
    if (clicked.some((b) => el.contains(b))) continue; // already handled above
    const text = textOf(el);
    const sig = sigOf(el);
    const cov = coverage(el);
    const r = el.getBoundingClientRect();
    const dialogish = el.matches(DIALOG_SEL) || !!el.querySelector(DIALOG_SEL);
    const hinted = HINT.test(sig) || (dialogish && HINT.test(sigOf(el.querySelector(DIALOG_SEL) || el)));
    const both = `${text} ${sig}`;

    // Site chrome: sticky headers / nav bars / chat bubbles are not overlays.
    if (!dialogish && !hinted) {
      if (el.matches('header, nav, footer, [role=banner], [role=navigation]')) continue;
      if (r.top <= 5 && r.height < vh * 0.22 && el.querySelectorAll('a').length >= 3) continue;
      if (cov < 0.08 && !/cookie|consent/i.test(text)) continue;
    }
    // A whole page wrapped in a fixed container is content, not a popup.
    if (!dialogish && text.length > 2500) continue;

    const restricted = restrictedKind(el, text);
    if (restricted) {
      report.restricted.push({ kind: restricted, text: text.slice(0, 160) });
      continue;
    }

    let kind = null;
    if (/cookie|consent|gdpr|ccpa|privacy (preferences|settings|choices)|we use cookies|personal data/i.test(both)) kind = 'cookie-consent';
    else if (/newsletter|subscribe|sign up for|join our (mailing|email|list)|e-?mail (list|updates)|get \d+ ?% off|discount code|klaviyo|optin/i.test(both)) kind = 'newsletter';
    else if (/notification|allow notifications|push|stay updated|turn on alerts/i.test(both)) kind = 'notification-prompt';
    else if (/your (location|country|region|store)|choose your (store|country|language|region)|select (your )?(country|region|language|location|city|area)|deliver(y)? to|geo-?(ip|loc)/i.test(both)) kind = 'location-prompt';
    else if (/% off|sale|promo|special offer|limited time|coupon|deal of/i.test(both) && (dialogish || hinted || cov > 0.2)) kind = 'promo';
    else if (cov > 0.35 && text.length < 5 && (/backdrop|overlay|mask|shade|dim/i.test(sig) || /blur/.test(getComputedStyle(el).backdropFilter || '') || /rgba?\([^)]*,\s*0?\.\d+\)/.test(getComputedStyle(el).backgroundColor))) kind = 'backdrop';
    else if (dialogish || (hinted && cov > 0.1)) kind = 'modal';
    if (!kind) continue;

    report.overlays.push({ kind, text: text.slice(0, 120), coverage: Math.round(cov * 100) });
    if (action !== 'dismiss') continue;

    if (kind === 'backdrop') { hide(el); report.dismissed.push({ kind, action: 'hidden' }); report.acted = true; continue; }
    remember(el);
    const button = pickButton(el, true);
    if (button) {
      report.dismissed.push({ kind, action: labelOf(button) || 'close icon' });
      button.click();
    } else {
      // No safe button: hide it for the capture only (restored in snapshot).
      hide(el);
      report.dismissed.push({ kind, action: 'hidden' });
    }
    report.acted = true;
  }

  // A page that is itself a sign-in form or bot check (no overlay involved).
  if (document.body) {
    const pageText = textOf(document.body);
    const password = [...document.querySelectorAll('input[type=password]')].find(shown);
    if (password && pageText.length < 3000) report.restricted.push({ kind: 'sign-in', text: document.title.slice(0, 160) });
    if (/just a moment|attention required|verify you are human|access denied|are you a robot/i.test(document.title)
      || document.querySelector('#challenge-form, #cf-challenge-running, iframe[src*="challenges.cloudflare"]')) {
      report.restricted.push({ kind: 'captcha', text: document.title.slice(0, 160) });
    }
  }

  // 3. Undo the scroll lock and blur a modal leaves behind — only when we acted.
  if (action === 'dismiss' && (report.acted || document.querySelector('[data-cloner-hidden]'))) {
    const LOCK = /^(modal-open|no-?scroll|overflow-hidden|scroll-?lock(ed)?|lock-?scroll|is-locked|has-modal|disable-?scroll|stop-scrolling|popup-open|cookie-?(banner-)?open)$/i;
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const lockClasses = [...el.classList].filter((c) => LOCK.test(c));
      if (lockClasses.length) { saveClass(el); lockClasses.forEach((c) => el.classList.remove(c)); }
      const s = getComputedStyle(el);
      if (s.overflow === 'hidden' || s.overflowY === 'hidden') { saveStyle(el); el.style.setProperty('overflow', 'auto', 'important'); }
      if (el === document.body && s.position === 'fixed') { saveStyle(el); el.style.setProperty('position', 'static', 'important'); el.style.removeProperty('top'); }
    }
    for (const el of [document.body, ...(document.body?.children || [])]) {
      if (el && el.tagName !== 'SCRIPT' && /blur\(/.test(getComputedStyle(el).filter)) { saveStyle(el); el.style.setProperty('filter', 'none', 'important'); }
    }
  }
  return report;
}

// Runs before any page script: deny and record permission requests, and note
// which elements came with the page's HTML.
function pageShim() {
  document.addEventListener('DOMContentLoaded', () => {
    try { window.__clonerParsed = new WeakSet(document.querySelectorAll('*')); } catch { /* ignore */ }
  }, { once: true });
  const log = (name) => { try { (window.__clonerPermissionRequests ||= []).push(name); } catch { /* ignore */ } };
  const denied = () => new DOMException('Permission denied', 'NotAllowedError');
  try {
    if (window.Notification) {
      Notification.requestPermission = function requestPermission(cb) {
        log('notifications');
        try { cb?.('denied'); } catch { /* ignore */ }
        return Promise.resolve('denied');
      };
    }
  } catch { /* ignore */ }
  try {
    const geo = navigator.geolocation;
    if (geo) {
      const fail = (err) => err && setTimeout(() => err({ code: 1, PERMISSION_DENIED: 1, message: 'User denied Geolocation' }), 0);
      geo.getCurrentPosition = (ok, err) => { log('geolocation'); fail(err); };
      geo.watchPosition = (ok, err) => { log('geolocation'); fail(err); return 0; };
    }
  } catch { /* ignore */ }
  try {
    const md = navigator.mediaDevices;
    if (md?.getUserMedia) {
      md.getUserMedia = (c = {}) => { log(c.video ? (c.audio ? 'camera+microphone' : 'camera') : 'microphone'); return Promise.reject(denied()); };
    }
  } catch { /* ignore */ }
  try {
    const perms = navigator.permissions;
    if (perms?.query) {
      const query = perms.query.bind(perms);
      const blocked = ['notifications', 'push', 'geolocation', 'camera', 'microphone', 'midi', 'clipboard-read'];
      perms.query = (d) => (blocked.includes(d?.name)
        ? Promise.resolve({ name: d.name, state: 'denied', onchange: null, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } })
        : query(d));
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------

export function newAccessReport() {
  return { dismissed: [], restricted: [], dialogs: [], permissions: [], popupWindows: 0, popupScreenshot: false, session: false };
}

export function mergeReport(report, part) {
  if (!part) return;
  for (const d of part.dismissed || []) {
    if (report.dismissed.length < 20 && !report.dismissed.some((x) => x.kind === d.kind && x.action === d.action)) report.dismissed.push(d);
  }
  for (const r of part.restricted || []) {
    if (!report.restricted.some((x) => x.kind === r.kind)) report.restricted.push(r);
  }
}

/** Close windows a site opens by itself (pop-unders, "new tab" ads). */
export function guardBrowser(browser, report) {
  const seen = new Set();
  browser.on('targetcreated', async (target) => {
    if (target.type() !== 'page' || !target.opener()) return;
    if (!seen.has(target.url())) { seen.add(target.url()); report.popupWindows += 1; }
    try {
      const popup = await target.page();
      await popup?.close().catch(() => { /* already gone */ });
    } catch { /* already gone */ }
  });
}

/** Dialog handling and permission denial; call before the first navigation. */
export async function guardPage(page, origin, report) {
  page.on('dialog', async (dialog) => {
    const entry = { type: dialog.type(), message: dialog.message().slice(0, 160) };
    if (report.dialogs.length < 10 && !report.dialogs.some((d) => d.type === entry.type && d.message === entry.message)) report.dialogs.push(entry);
    try {
      // "Leave site?" must be accepted or navigation hangs; everything else is cancelled.
      if (dialog.type() === 'beforeunload') await dialog.accept();
      else await dialog.dismiss();
    } catch { /* already handled */ }
  });
  try {
    // Grant nothing: every permission the site asks for is denied.
    await page.browserContext().overridePermissions(origin, []);
  } catch { /* older Chrome: the shim below still denies */ }
  await page.evaluateOnNewDocument(pageShim);
}

export async function recordPermissionRequests(page, report) {
  try {
    const asked = await page.evaluate(() => window.__clonerPermissionRequests || []);
    for (const name of asked) if (!report.permissions.includes(name)) report.permissions.push(name);
  } catch { /* page navigated */ }
}

export async function inspectOverlays(page) {
  try { return await page.evaluate(guardInPage, 'inspect'); } catch { return { overlays: [], restricted: [] }; }
}

/** Dismiss popups in a few rounds (one popup often opens another). */
export async function dismissOverlays(page, report, { rounds = 3, settle = 700 } = {}) {
  for (let i = 0; i < rounds; i += 1) {
    let acted = false;
    for (const frame of page.frames()) {
      if (frame === page.mainFrame() || !CMP_FRAME_RE.test(frame.url())) continue;
      try {
        const part = await frame.evaluate(guardInPage, 'dismiss-frame');
        mergeReport(report, part);
        acted ||= part.acted;
      } catch { /* frame detached */ }
    }
    try {
      const part = await page.evaluate(guardInPage, 'dismiss');
      mergeReport(report, part);
      acted ||= part.acted;
    } catch { break; }
    if (!acted) break;
    await sleep(settle);
  }
}

// ---------------------------------------------------------------------------
// Choosers: "Where do you want to land?", "Select your city / store / order type".
// Closing one leaves many sites empty (their menu or catalogue only loads after a
// choice), so the first option is picked instead. Runs in the page.
function chooserStepInPage() {
  const CHOOSER = /where (do|would) you (want|like)|choose (your|a|the) (city|branch|outlet|store|location|region|country|area|experience|order type)|select (your|a|the) (order type|city|branch|outlet|store|location|area|region|country)|please select (your )?(city|location|branch|area|outlet|store)|delivery or pick-?up|order type/i;
  const CONFIRM = /^(select|continue|confirm|done|save|apply|start|go|next|proceed|ok|okay|let'?s go|shop now|order now|start (shopping|ordering)|view menu)\b/i;
  const SKIP = /^(×|✕|x|close|cancel|dismiss|skip|no,? thanks|not now|later|back)$|current location|locate me|use my location|sign ?in|log ?in|register|sign ?up/i;
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight;
  };
  const label = (b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  const disabled = (b) => b.disabled || b.getAttribute('aria-disabled') === 'true';
  const leaves = (b) => {
    const a = b.closest('a[href]');
    if (!a) return false;
    try { return new URL(a.getAttribute('href'), location.href).origin !== location.origin; } catch { return true; }
  };
  document.querySelectorAll('[data-cloner-choose]').forEach((n) => n.removeAttribute('data-cloner-choose'));

  const layers = new Set([...document.querySelectorAll('[role=dialog],[role=alertdialog],[aria-modal=true],dialog[open]')]);
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (getComputedStyle(el).position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height >= innerWidth * innerHeight * 0.15) layers.add(el);
  }
  const candidates = [...layers].filter((el) => shown(el) && CHOOSER.test(el.innerText || '') && !el.querySelector('input[type=password]'));
  if (!candidates.length) return { action: 'none' };
  const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  const box = candidates.sort((a, b) => area(a) - area(b))[0];

  // 1. Native selects still on their placeholder.
  for (const sel of box.querySelectorAll('select')) {
    if (!shown(sel) || (sel.value && sel.selectedIndex > 0)) continue;
    const option = [...sel.options].find((o, i) => i > 0 && o.value && !o.disabled);
    if (!option) continue;
    sel.value = option.value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { action: 'selected', label: option.text.trim().slice(0, 60) };
  }
  // 2. Custom dropdowns (react-select and the like) that still show their placeholder.
  for (const combo of box.querySelectorAll('[role=combobox]')) {
    if (!shown(combo) && !shown(combo.parentElement)) continue;
    const wrap = combo.closest('[class*=control],[class*=container],[class*=select]') || combo.parentElement?.parentElement || combo;
    const text = (wrap.innerText || '').trim();
    if (text && !/^(please )?(select|choose)\b/i.test(text)) continue;
    combo.setAttribute('data-cloner-choose', 'combo');
    return { action: 'combo' };
  }
  // 3. The confirm button, once it is enabled.
  const buttons = [...box.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')]
    .filter((b) => shown(b) && !leaves(b) && !SKIP.test(label(b)) && !/close|dismiss/i.test(`${b.getAttribute('aria-label') || ''} ${typeof b.className === 'string' ? b.className : ''}`));
  const confirm = buttons.find((b) => CONFIRM.test(label(b)) && !disabled(b));
  // 4. Otherwise the first choice ("Karachi and Hyderabad", "Delivery", a store, …).
  const choice = confirm || buttons.find((b) => !disabled(b) && label(b).length >= 2 && label(b).length <= 60);
  if (!choice) return { action: 'none' };
  choice.setAttribute('data-cloner-choose', 'click');
  return { action: 'click', label: label(choice).slice(0, 60) };
}

/**
 * Work through city / store / order-type choosers by picking the first option, so the
 * page loads the content it holds back until a choice is made. Returns what was chosen.
 */
export async function completeChoosers(page, report, { maxSteps = 8, appearWithin = null } = {}) {
  const chosen = [];
  let stalled = 0;
  // Choosers often open a few seconds after load. A page that still looks empty
  // (little text: a skeleton waiting on the choice) is worth waiting longer for.
  if (appearWithin === null) {
    const textLength = await page.evaluate(() => (document.body?.innerText || '').trim().length).catch(() => 0);
    appearWithin = textLength < 1500 ? 10000 : 1500;
  }
  const waitUntil = Date.now() + appearWithin;
  for (let step = 0; step < maxSteps; step += 1) {
    let plan;
    try { plan = await page.evaluate(chooserStepInPage); } catch { break; }
    if ((!plan || plan.action === 'none') && step === 0 && Date.now() < waitUntil) {
      await sleep(500);
      step -= 1;
      continue;
    }
    if (!plan || plan.action === 'none') break;
    try {
      if (plan.action === 'click') {
        await page.click('[data-cloner-choose="click"]');
        chosen.push(plan.label);
      } else if (plan.action === 'combo') {
        await page.click('[data-cloner-choose="combo"]');
        await sleep(700);
        const option = await page.evaluate(() => {
          const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
          const opt = [...document.querySelectorAll('[role=option],[id*="-option-"],[role=listbox] li')]
            .find((o) => visible(o) && o.getAttribute('aria-disabled') !== 'true');
          if (!opt) return '';
          opt.setAttribute('data-cloner-choose', 'option');
          return (opt.innerText || '').trim().slice(0, 60) || 'first option';
        });
        if (!option) { stalled += 1; if (stalled > 1) break; continue; }
        await page.click('[data-cloner-choose="option"]');
        chosen.push(option);
      } else if (plan.action === 'selected') {
        chosen.push(plan.label);
      }
    } catch {
      stalled += 1;
      if (stalled > 1) break;
    }
    await sleep(1200);
  }
  try {
    await page.evaluate(() => document.querySelectorAll('[data-cloner-choose]').forEach((n) => n.removeAttribute('data-cloner-choose')));
  } catch { /* page navigated */ }
  if (chosen.length) {
    mergeReport(report, { dismissed: [{ kind: 'chooser', action: `chose ${chosen.map((c) => `“${c}”`).join(' → ')}` }] });
  }
  return chosen;
}

/** Wait until the page stops adding text and images (client-rendered content has arrived). */
export async function waitForContentSettled(page, { timeout = 12000, quiet = 1500 } = {}) {
  const end = Date.now() + timeout;
  let last = '';
  let stableSince = Date.now();
  while (Date.now() < end) {
    let sig = '';
    try {
      sig = await page.evaluate(() => `${(document.body?.innerText || '').length}:${document.images.length}:${[...document.images].filter((i) => i.complete).length}`);
    } catch { return; }
    if (sig !== last) { last = sig; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= quiet) return;
    await sleep(300);
  }
}

/** Rendered DOM with every guard change undone (hidden overlays come back). */
export async function snapshotHtml(page, { keepDismissed = false } = {}) {
  return page.evaluate(guardInPage, keepDismissed ? 'snapshot-dismissed' : 'snapshot');
}

/**
 * Wait for delayed popups (many appear 0.5–3 s after load). Returns early once a
 * blocking one (a dialog or anything covering a third of the screen) is up; a
 * small banner alone keeps waiting, since a bigger modal often follows it.
 */
export async function waitForOverlay(page, timeout = 3000) {
  const end = Date.now() + timeout;
  let found = { overlays: [], restricted: [] };
  while (Date.now() < end) {
    found = await inspectOverlays(page);
    if (found.restricted.length || found.overlays.some((o) => o.kind !== 'backdrop' && o.coverage >= 33)) return found;
    await sleep(400);
  }
  return found;
}

// ---------------------------------------------------------------------------
// User-supplied signed-in session.

let activeSession = { host: '', cookies: [] };

function domainMatches(host, domain) {
  const d = String(domain || '').replace(/^\./, '').toLowerCase();
  return !!d && (host === d || host.endsWith(`.${d}`));
}

/**
 * Accepts either a Cookie header ("a=1; b=2") or a JSON cookie export
 * ([{name, value, domain, path, ...}]) from the user's own signed-in browser.
 * Only cookies for the site being cloned are kept.
 */
export function parseSessionCookies(input, url) {
  const text = String(input || '').trim();
  if (!text) return [];
  const { hostname, protocol } = new URL(url);
  const host = hostname.toLowerCase();
  let list;
  if (text.startsWith('[') || text.startsWith('{')) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('The session cookies are not valid JSON. Paste a cookie export or a "name=value; name2=value2" header.'); }
    const items = Array.isArray(data) ? data : (data.cookies || []);
    list = items.filter((c) => c && c.name).map((c) => ({
      name: String(c.name),
      value: String(c.value ?? ''),
      domain: c.domain || host,
      path: c.path || '/',
      secure: c.secure ?? protocol === 'https:',
      httpOnly: !!c.httpOnly,
    }));
  } else {
    list = text.replace(/^cookie:\s*/i, '').split(';').map((part) => {
      const at = part.indexOf('=');
      return at > 0 ? { name: part.slice(0, at).trim(), value: part.slice(at + 1).trim(), domain: host, path: '/', secure: protocol === 'https:', httpOnly: false } : null;
    }).filter((c) => c && c.name);
  }
  return list.filter((c) => domainMatches(host, c.domain) || domainMatches(c.domain.replace(/^\./, ''), host));
}

export function setSession(url, cookies) {
  activeSession = { host: cookies.length ? new URL(url).hostname.toLowerCase() : '', cookies };
}

/** Add the user's session cookie to a request, only for the site it belongs to. */
export function withSession(url, headers = {}) {
  if (!activeSession.cookies.length) return headers;
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return headers; }
  const cookies = activeSession.cookies.filter((c) => domainMatches(host, c.domain));
  if (!cookies.length) return headers;
  return { ...headers, Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}
