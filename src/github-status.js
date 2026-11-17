/**
 * "Push to GitHub" builds the PHP project on the server and pushes it to a private repo.
 * This shows that push's progress in a small corner notice.
 */
import { API } from './api.js';

const POLL_MS = 2500;
const GIVE_UP_MS = 4 * 60 * 1000;
let box = null;

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'gh-push';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  const style = document.createElement('style');
  style.textContent = `
    .gh-push { position: fixed; right: 16px; bottom: 16px; z-index: 2000; max-width: min(380px, calc(100vw - 32px));
      display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.7rem 0.85rem; border-radius: 12px;
      background: #101a2e; color: #e8edf6; border: 1px solid rgba(148,163,184,0.28);
      box-shadow: 0 12px 32px rgba(0,0,0,0.4); font-size: 0.85rem; line-height: 1.35; }
    .gh-push[hidden] { display: none; }
    .gh-push a { color: #93c5fd; }
    .gh-push .gh-close { margin-left: auto; border: 0; background: none; color: #94a3b8; padding: 0 0.15rem; font-size: 1rem; line-height: 1; }
    .gh-push.ok i.bi { color: #7ee2a8; } .gh-push.err i.bi { color: #ff9ca0; }`;
  document.head.appendChild(style);
  document.body.appendChild(box);
  return box;
}

function show(kind, html) {
  const el = ensureBox();
  el.hidden = false;
  el.className = `gh-push ${kind}`;
  const icon = kind === 'busy'
    ? '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>'
    : `<i class="bi ${kind === 'ok' ? 'bi-github' : 'bi-exclamation-triangle'}"></i>`;
  el.innerHTML = `${icon}<div>${html}</div><button type="button" class="gh-close" title="Close">×</button>`;
  el.querySelector('.gh-close').addEventListener('click', () => { el.hidden = true; });
}

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Follow the GitHub push of `folder` that was started at `since` (ms). */
export function watchGithubPush(folder, since = Date.now()) {
  const started = since;
  const poll = async () => {
    let data;
    try {
      const res = await fetch(`${API.githubStatus}?folder=${encodeURIComponent(folder)}`);
      data = await res.json();
    } catch {
      data = null;
    }
    if (data?.state === 'not-configured') {
      box.hidden = true; // GitHub isn't set up on this server: the download is all there is
      return;
    }
    const fresh = data?.at && Date.parse(data.at) >= started - 2000;
    if (fresh && data.state === 'pushed') {
      const link = `<a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">${escapeHtml(data.repo)}</a>`;
      const note = data.changed === false ? ' (no changes since the last push)' : '';
      const skipped = data.skipped?.length ? `<br><small>${data.skipped.length} file(s) over 95 MB were left out.</small>` : '';
      show('ok', `Pushed to GitHub: ${link}${note}${skipped}`);
      return;
    }
    if (fresh && data.state === 'error') {
      show('err', `GitHub push failed: ${escapeHtml(data.error || 'unknown error')}`);
      return;
    }
    if (fresh && data.state === 'pushing') show('busy', `Pushing to GitHub (${escapeHtml(data.repo)})…`);
    if (Date.now() - started > GIVE_UP_MS) {
      show('err', 'Still waiting for the GitHub push. Check the repository later.');
      return;
    }
    setTimeout(poll, POLL_MS);
  };
  setTimeout(poll, POLL_MS);
}

/** Build the project on the server and push it to GitHub (nothing is downloaded). */
export async function pushToGithub(folder, button) {
  if (button) button.disabled = true;
  const clickedAt = Date.now();
  show('busy', 'Preparing the project for GitHub…');
  try {
    const res = await fetch(API.githubPush, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      show('err', escapeHtml(data.error || 'Could not start the GitHub push.'));
      return;
    }
    show('busy', 'Pushing to GitHub…');
    watchGithubPush(folder, clickedAt);
  } catch (err) {
    show('err', `Could not start the GitHub push: ${escapeHtml(err.message)}`);
  } finally {
    if (button) button.disabled = false;
  }
}

/** Any element with data-github-push="<folder>" pushes that site when clicked. */
export function bindDownloadLinks(root = document) {
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-github-push]');
    if (!button || !button.dataset.githubPush) return;
    event.preventDefault();
    pushToGithub(button.dataset.githubPush, button);
  });
}
