import { currentUser, isAdmin, renderAccountMenu, ROLE_LABELS } from './auth.js';

if (!isAdmin) location.replace('/');
renderAccountMenu(document.querySelector('.app-nav-links'));

const isSuper = currentUser.role === 'super_admin';
const $ = (id) => document.getElementById(id);
let entities = [];

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function when(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function status(message, isError = false) {
  const box = $('adminStatus');
  box.textContent = message;
  box.className = `admin-status ${isError ? 'is-error' : 'is-ok'}`;
  clearTimeout(status.timer);
  status.timer = setTimeout(() => box.classList.add('d-none'), 6000);
}

async function api(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showLink(label, link) {
  $('linkLabel').textContent = label;
  $('linkValue').value = link;
  $('linkBox').classList.remove('d-none');
}

$('copyLinkBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('linkValue').value);
  status('Link copied.');
});

/* ── Tabs ── */
function openTab(name) {
  document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('d-none', p.dataset.panel !== name));
  if (name === 'entities') loadEntities();
  if (name === 'users') loadUsers();
  if (name === 'activity') loadActivity();
}
document.querySelectorAll('.admin-tab').forEach((tab) => tab.addEventListener('click', () => openTab(tab.dataset.tab)));

/* ── Workspaces ── */
async function refreshEntities() {
  entities = (await api('/entities')).entities;
  const options = entities.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
  $('userEntity').innerHTML = options;
  $('userFilter').innerHTML = `<option value="">All workspaces</option>${options}`;
  $('activityFilter').innerHTML = `<option value="">All workspaces</option>${options}`;
}

async function loadEntities() {
  try {
    await refreshEntities();
    $('entityRows').innerHTML = entities.map((e) => `
      <tr>
        <td>${escapeHtml(e.name)}</td>
        <td><code>${escapeHtml(e.slug)}</code></td>
        <td>${e.userCount}</td>
        <td>${e.projectCount}</td>
        <td><span class="pill ${e.status === 'active' ? 'pill-ok' : 'pill-off'}">${e.status}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-ghost" data-rename="${e.id}">Rename</button>
          <button class="btn btn-sm ${e.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success'}" data-toggle="${e.id}" data-status="${e.status}">
            ${e.status === 'active' ? 'Suspend' : 'Activate'}
          </button>
        </td>
      </tr>`).join('');
  } catch (err) {
    status(err.message, true);
  }
}

$('entityForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const { entity } = await api('/entities', {
      method: 'POST',
      body: JSON.stringify({ name: $('entityName').value, slug: $('entitySlug').value || null }),
    });
    $('entityForm').reset();
    status(`Workspace “${entity.name}” created.`);
    loadEntities();
  } catch (err) {
    status(err.message, true);
  }
});

$('entityRows').addEventListener('click', async (event) => {
  const rename = event.target.closest('[data-rename]');
  const toggle = event.target.closest('[data-toggle]');
  try {
    if (rename) {
      const entity = entities.find((e) => e.id === Number(rename.dataset.rename));
      const name = prompt('New workspace name', entity.name);
      if (!name || name === entity.name) return;
      await api(`/entities/${entity.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      status('Workspace renamed.');
    } else if (toggle) {
      const suspend = toggle.dataset.status === 'active';
      if (suspend && !confirm('Suspend this workspace? Its users are signed out and can’t sign in until you activate it again.')) return;
      await api(`/entities/${toggle.dataset.toggle}`, {
        method: 'PATCH', body: JSON.stringify({ status: suspend ? 'suspended' : 'active' }),
      });
      status(suspend ? 'Workspace suspended.' : 'Workspace activated.');
    } else {
      return;
    }
    loadEntities();
  } catch (err) {
    status(err.message, true);
  }
});

/* ── Users ── */
const roleChoices = isSuper ? ['entity_user', 'entity_admin', 'super_admin'] : ['entity_user', 'entity_admin'];
$('userRole').innerHTML = roleChoices.map((r) => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('');

function syncEntityPicker() {
  $('userEntity').classList.toggle('d-none', !isSuper || $('userRole').value === 'super_admin');
}
$('userRole').addEventListener('change', syncEntityPicker);

let users = [];

async function loadUsers() {
  try {
    if (!entities.length) await refreshEntities();
    const filter = $('userFilter').value;
    users = (await api(`/users${filter ? `?entityId=${filter}` : ''}`)).users;
    $('userRows').innerHTML = users.map((u) => {
      const self = u.id === currentUser.id;
      const roleSelect = self || (!isSuper && u.role === 'super_admin')
        ? ROLE_LABELS[u.role]
        : `<select class="form-select form-select-sm" data-role="${u.id}">
            ${roleChoices.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
          </select>`;
      return `
      <tr>
        <td><div>${escapeHtml(u.name || '—')}</div><div class="admin-sub">${escapeHtml(u.email)}</div></td>
        <td>${roleSelect}</td>
        <td>${escapeHtml(u.entityName || (u.role === 'super_admin' ? 'All' : '—'))}</td>
        <td>${when(u.lastLoginAt)}</td>
        <td><span class="pill ${u.isActive ? 'pill-ok' : 'pill-off'}">${u.isActive ? 'active' : 'disabled'}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-ghost" data-reset="${u.id}">Reset link</button>
          ${self ? '' : `<button class="btn btn-sm ${u.isActive ? 'btn-outline-danger' : 'btn-outline-success'}" data-active="${u.id}" data-value="${!u.isActive}">${u.isActive ? 'Disable' : 'Enable'}</button>`}
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    status(err.message, true);
  }
}

$('userFilter').addEventListener('change', loadUsers);

$('userForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const role = $('userRole').value;
    const data = await api('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: $('userEmail').value,
        name: $('userName').value,
        role,
        entityId: isSuper && role !== 'super_admin' ? Number($('userEntity').value) : null,
      }),
    });
    $('userEmail').value = '';
    $('userName').value = '';
    if (data.setPasswordLink) showLink(`Set-password link for ${data.user.email} (expires in 24 hours)`, data.setPasswordLink.link);
    status(`User ${data.user.email} added.`);
    loadUsers();
  } catch (err) {
    status(err.message, true);
  }
});

$('userRows').addEventListener('click', async (event) => {
  const reset = event.target.closest('[data-reset]');
  const active = event.target.closest('[data-active]');
  try {
    if (reset) {
      const user = users.find((u) => u.id === Number(reset.dataset.reset));
      const data = await api(`/users/${user.id}/reset-link`, { method: 'POST' });
      showLink(`Reset link for ${user.email} (expires in 24 hours)`, data.link);
    } else if (active) {
      await api(`/users/${active.dataset.active}`, {
        method: 'PATCH', body: JSON.stringify({ isActive: active.dataset.value === 'true' }),
      });
      status('User updated.');
      loadUsers();
    }
  } catch (err) {
    status(err.message, true);
  }
});

$('userRows').addEventListener('change', async (event) => {
  const select = event.target.closest('[data-role]');
  if (!select) return;
  try {
    await api(`/users/${select.dataset.role}`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) });
    status('Role updated.');
    loadUsers();
  } catch (err) {
    status(err.message, true);
    loadUsers();
  }
});

/* ── Activity ── */
const ACTION_LABELS = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.password_reset': 'Reset password',
  'auth.change_password': 'Changed password', 'auth.switch_entity': 'Switched workspace',
  'entity.create': 'Created workspace', 'entity.update': 'Updated workspace',
  'user.create': 'Added user', 'user.update': 'Updated user', 'user.reset_link': 'Issued reset link',
  'site.clone': 'Cloned site', 'site.delete': 'Deleted site', 'site.restore': 'Restored site',
  'site.save': 'Saved page', 'site.upload': 'Uploaded image', 'site.download': 'Downloaded site',
  'site.theme': 'Changed theme', 'site.history_restore': 'Undid a change',
  'site.open': 'Opened editor', 'site.version_restore': 'Restored a version', 'site.create_page': 'Added page',
  'site.ai.edit': 'AI edit (Ask AI)', 'site.ai.edit_failed': 'AI edit failed', 'site.ai.fix': 'Fix with AI',
  'site.ai.customize': 'AI Assistant', 'site.ai.audit': 'AI audit', 'site.ai.edit_selection': 'AI element edit',
  'site.ai.fix_selection': 'AI section fix', 'site.ai.generate_page': 'AI page',
  'asset.upload': 'Uploaded asset', 'asset.use': 'Used asset', 'asset.delete': 'Deleted asset',
};

let activityCursor = null;

function activityParams() {
  const params = new URLSearchParams();
  const pairs = {
    entityId: $('activityFilter').value, category: $('activityCategory').value, user: $('activityUser').value.trim(),
    site: $('activitySite').value.trim(), dateFrom: $('activityFrom').value, dateTo: $('activityTo').value,
  };
  Object.entries(pairs).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params;
}

function detailHtml(a) {
  const d = { ...(a.details || {}) };
  const shots = Array.isArray(d.screenshots) ? d.screenshots : [];
  delete d.screenshots;
  const text = Object.entries(d)
    .filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  const thumbs = shots.map((name) => {
    const url = `/api/admin/activity/${a.id}/screenshot/${encodeURIComponent(name)}`;
    return `<a href="${url}" target="_blank" rel="noopener" class="audit-shot" title="Screenshot sent with this edit"><img src="${url}" alt="" loading="lazy" /></a>`;
  }).join('');
  return `${escapeHtml(text)}${thumbs ? `<div class="audit-shots">${thumbs}</div>` : ''}`;
}

async function loadActivity(append = false) {
  try {
    if (!entities.length) await refreshEntities();
    const params = activityParams();
    if (append && activityCursor) params.set('before', activityCursor);
    const data = await api(`/activity?${params}`);
    activityCursor = data.nextBefore;
    const html = data.activity.map((a) => `
      <tr>
        <td class="text-nowrap">${when(a.createdAt)}</td>
        <td>${escapeHtml(a.userEmail || '—')}</td>
        <td>${escapeHtml(ACTION_LABELS[a.action] || a.action)}</td>
        <td>${escapeHtml(a.target)}</td>
        <td class="admin-sub">${detailHtml(a)}</td>
      </tr>`).join('');
    if (append) $('activityRows').insertAdjacentHTML('beforeend', html);
    else $('activityRows').innerHTML = html || '<tr><td colspan="5" class="admin-sub">No activity matches these filters.</td></tr>';
    $('activityMore').classList.toggle('d-none', !activityCursor);
  } catch (err) {
    status(err.message, true);
  }
}
$('activityFilters').addEventListener('submit', (event) => { event.preventDefault(); loadActivity(); });
$('activityFilter').addEventListener('change', () => loadActivity());
$('activityMore').addEventListener('click', () => loadActivity(true));
$('activityExport').addEventListener('click', () => {
  const params = activityParams();
  params.set('format', 'csv');
  location.href = `/api/admin/activity?${params}`;
});

/* ── Start ── */
if (!isSuper) {
  $('tabEntities').classList.add('d-none');
  $('userFilterWrap').classList.add('d-none');
  $('activityFilterWrap').classList.add('d-none');
}
syncEntityPicker();
openTab(isSuper ? 'entities' : 'users');
