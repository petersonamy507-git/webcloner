/**
 * Session guard shared by every signed-in page. Importing this module waits for
 * the current user, and sends the browser to the sign-in page when there is none.
 */
const LOGIN_PAGE = '/login.html';

function goToLogin() {
  const next = encodeURIComponent(location.pathname + location.search);
  location.replace(`${LOGIN_PAGE}?next=${next}`);
}

// Any API call that comes back 401 means the session ended mid-use.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const response = await realFetch(input, init);
  const url = typeof input === 'string' ? input : input?.url || '';
  if (response.status === 401 && url.includes('/api/') && !url.includes('/api/auth/')) goToLogin();
  return response;
};

async function loadCurrentUser() {
  try {
    const res = await realFetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.status === 401) return null;
    const data = await res.json();
    return data.success ? data.user : null;
  } catch {
    return null;
  }
}

export const currentUser = await loadCurrentUser();
if (!currentUser) {
  goToLogin();
  // Stop the page's own scripts from running against a signed-out API.
  await new Promise(() => {});
}

export const ROLE_LABELS = {
  super_admin: 'Super admin',
  entity_admin: 'Workspace admin',
  entity_user: 'Member',
};

export const isAdmin = ['super_admin', 'entity_admin'].includes(currentUser.role);

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export async function signOut() {
  await realFetch('/api/auth/logout', { method: 'POST' });
  location.replace(LOGIN_PAGE);
}

async function switchWorkspace(entityId) {
  const res = await realFetch('/api/auth/switch-entity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityId: Number(entityId) }),
  });
  if (res.ok) location.reload();
}

/** Workspace badge, workspace switcher (super admins), Admin link, and sign out. */
export function renderAccountMenu(container) {
  if (!container) return;
  const active = currentUser.activeEntity;
  const workspace = currentUser.role === 'super_admin' && currentUser.entities?.length
    ? `<select class="account-workspace-select" id="workspaceSwitcher" title="Switch workspace">
        ${currentUser.entities.map((e) => `<option value="${e.id}" ${active?.id === e.id ? 'selected' : ''}>${escapeHtml(e.name)}${e.status !== 'active' ? ' (suspended)' : ''}</option>`).join('')}
      </select>`
    : `<span class="account-workspace">${escapeHtml(active?.name || '')}</span>`;

  const wrap = document.createElement('div');
  wrap.className = 'account-menu';
  wrap.innerHTML = `
    ${workspace}
    ${isAdmin ? '<a href="/admin.html" class="account-link"><i class="bi bi-shield-lock me-1"></i>Admin</a>' : ''}
    <span class="account-user" title="${escapeHtml(currentUser.email)}">
      <i class="bi bi-person-circle me-1"></i>${escapeHtml(currentUser.name || currentUser.email)}
    </span>
    <button type="button" class="account-signout" id="signOutBtn" title="Sign out"><i class="bi bi-box-arrow-right"></i></button>`;
  container.appendChild(wrap);
  wrap.querySelector('#signOutBtn').addEventListener('click', signOut);
  wrap.querySelector('#workspaceSwitcher')?.addEventListener('change', (e) => switchWorkspace(e.target.value));
}
