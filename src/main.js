import { renderAccountMenu } from './auth.js';
import { API } from './api.js';
import { loadLibrary } from './clone-library.js';

renderAccountMenu(document.querySelector('.app-nav-links'));

const form = document.getElementById('cloneForm');
const cloneBtn = document.getElementById('cloneBtn');
const cloneMode = document.getElementById('cloneMode');
const cloneModeHelp = document.getElementById('cloneModeHelp');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const errorAlert = document.getElementById('errorAlert');
const errorMessage = document.getElementById('errorMessage');
const successSection = document.getElementById('successSection');
const brandSelect = document.getElementById('brandSelect');
const applyBrandBtn = document.getElementById('applyBrandBtn');
const brandStatus = document.getElementById('brandStatus');
let clonedFolder = '';

const MODE_HELP = {
  landing: 'Clones only the page at the URL you entered, including its HTML, CSS, JavaScript, images, and fonts.',
  website: 'Clones the complete website: every page found on the site, plus HTML, CSS, JavaScript, images, and fonts. This can take a few minutes.',
};

function updateModeHelp() {
  if (!cloneModeHelp || !cloneMode) return;
  cloneModeHelp.textContent = MODE_HELP[cloneMode.value] || MODE_HELP.landing;
}

cloneMode?.addEventListener('change', updateModeHelp);
loadBrands();

async function loadBrands() {
  if (!brandSelect || brandSelect.options.length > 1) return;
  try {
    const res = await fetch(API.brands);
    const data = await res.json();
    for (const brand of data.brands || []) {
      const option = document.createElement('option');
      option.value = brand.id;
      option.textContent = brand.name;
      brandSelect.appendChild(option);
    }
  } catch {
    if (brandStatus) brandStatus.textContent = 'Could not load brands.';
  }
}

brandSelect?.addEventListener('change', () => {
  if (applyBrandBtn) applyBrandBtn.disabled = !brandSelect.value;
  if (brandStatus) brandStatus.textContent = '';
});

applyBrandBtn?.addEventListener('click', async () => {
  const brand = brandSelect.value;
  if (!brand || !clonedFolder) return;
  applyBrandBtn.disabled = true;
  applyBrandBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Applying...';
  brandStatus.className = 'small mt-2 text-muted';
  brandStatus.textContent = 'Replacing logo, portfolio, and brand details...';
  try {
    const res = await fetch(API.applyBrand, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: clonedFolder, brand }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Could not apply this brand.');
    brandStatus.className = 'small mt-2 text-success';
    brandStatus.textContent = `Applied ${data.brand}. Updated ${data.pagesUpdated} pages, ${data.logosReplaced} logos, and ${data.portfolioImages} portfolio images.`;
  } catch (err) {
    brandStatus.className = 'small mt-2 text-danger';
    brandStatus.textContent = err.message;
  } finally {
    applyBrandBtn.disabled = !brandSelect.value;
    applyBrandBtn.textContent = 'Apply brand';
  }
});

function hideAll() {
  errorAlert.classList.add('d-none');
  successSection.classList.add('d-none');
  progressSection.classList.add('d-none');
}

function showError(msg) {
  hideAll();
  errorMessage.textContent = msg;
  errorAlert.classList.remove('d-none');
}

const cancelBtn = document.getElementById('cancelCloneBtn');
const jobsWrap = document.getElementById('cloneJobsWrap');
const jobList = document.getElementById('cloneJobList');
let activeJobId = null;
let jobsTimer = null;

const STATUS_LABELS = { queued: 'Queued', running: 'Cloning', succeeded: 'Done', failed: 'Failed', cancelled: 'Cancelled' };

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function getJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function resetCloneButton() {
  cloneBtn.disabled = false;
  cloneBtn.innerHTML = '<i class="bi bi-download me-2"></i>Clone Website';
}

function showProgress(job) {
  progressSection.classList.remove('d-none');
  progressBar.style.width = `${Math.max(3, job.progress)}%`;
  progressText.textContent = job.status === 'queued'
    ? 'Waiting for a free slot…'
    : `${job.stage}… ${job.progress}%`;
}

function renderChecks(validation) {
  const box = document.getElementById('resultChecks');
  if (!validation || validation.total === null || validation.total === undefined) {
    box.classList.add('d-none');
    return;
  }
  const sev = validation.bySeverity || {};
  const serious = (sev.critical || 0) + (sev.high || 0);
  box.className = `clone-checks ${serious ? 'warn' : 'ok'}`;
  box.innerHTML = serious
    ? `<i class="bi bi-exclamation-triangle me-1"></i><strong>Check found ${serious} important issue${serious === 1 ? '' : 's'}</strong> (${validation.total} in total across ${validation.pagesChecked} page${validation.pagesChecked === 1 ? '' : 's'}). Open the editor and run the AI audit to fix them.`
    : `<i class="bi bi-check2-circle me-1"></i>Checked ${validation.pagesChecked} page${validation.pagesChecked === 1 ? '' : 's'}: no important issues${validation.total ? ` (${validation.total} minor)` : ''}.`;
}

function renderShots(shots = {}) {
  const box = document.getElementById('resultShots');
  const devices = ['desktop', 'tablet', 'mobile'].filter((d) => shots[d]);
  box.classList.toggle('d-none', !devices.length);
  box.innerHTML = devices.length
    ? `<div class="clone-shots-title">Original site on each device</div><div class="clone-shots-row">${devices.map((d) => `
        <a href="${shots[d]}" target="_blank" rel="noopener" class="clone-shot clone-shot-${d}">
          <img src="${shots[d]}" alt="${d} screenshot" loading="lazy" /><span>${d}</span>
        </a>`).join('')}</div>`
    : '';
}

function showResult(job) {
  const data = job.result || {};
  progressSection.classList.add('d-none');
  successSection.classList.remove('d-none');
  document.getElementById('resultUrl').textContent = data.url || job.url;
  document.getElementById('resultFolder').textContent = data.folder || job.folder;
  document.getElementById('resultPages').textContent = data.pagesCloned || 1;
  document.getElementById('resultFiles').textContent = data.filesDownloaded ?? '—';
  document.getElementById('resultSize').textContent = data.totalSize || '—';
  document.getElementById('previewBtn').href = data.previewUrl || `/cloned/${job.folder}/index.html`;
  document.getElementById('downloadBtn').href = data.downloadUrl || API.download(job.folder);
  document.getElementById('editPreviewBtn').href = `/editor.html?folder=${encodeURIComponent(job.folder)}`;
  clonedFolder = job.folder;
  if (brandStatus) brandStatus.textContent = '';
  if (brandSelect) brandSelect.value = '';
  if (applyBrandBtn) applyBrandBtn.disabled = true;
  renderChecks(data.validation);
  renderShots(job.screenshots);
  loadBrands();
  loadLibrary();
}

async function watchJob(id) {
  activeJobId = id;
  hideAll();
  cloneBtn.disabled = true;
  cloneBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Cloning...';
  while (activeJobId === id) {
    let job;
    try {
      ({ job } = await getJson(API.cloneJob(id)));
    } catch (err) {
      showError(err.message);
      break;
    }
    if (job.status === 'succeeded') { showResult(job); break; }
    if (job.status === 'failed') { showError(job.error || 'Clone failed. Please try again.'); break; }
    if (job.status === 'cancelled') { showError('Clone cancelled.'); break; }
    showProgress(job);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  if (activeJobId === id) activeJobId = null;
  resetCloneButton();
  loadJobs();
}

cancelBtn?.addEventListener('click', async () => {
  if (!activeJobId) return;
  cancelBtn.disabled = true;
  try {
    await getJson(API.cancelCloneJob(activeJobId), { method: 'POST' });
    progressText.textContent = 'Cancelling…';
  } catch (err) {
    progressText.textContent = err.message;
  } finally {
    cancelBtn.disabled = false;
  }
});

function jobRow(job) {
  const when = new Date(job.createdAt).toLocaleString();
  const running = job.status === 'queued' || job.status === 'running';
  const thumbs = Object.entries(job.screenshots || {}).map(([d, url]) =>
    `<img src="${url}" alt="${d}" title="${d}" class="job-thumb job-thumb-${d}" loading="lazy" />`).join('');
  const open = job.status === 'succeeded'
    ? `<a class="btn btn-sm btn-ghost" href="/editor.html?folder=${encodeURIComponent(job.folder)}"><i class="bi bi-pencil-square me-1"></i>Edit</a>`
    : running ? `<button type="button" class="btn btn-sm btn-ghost" data-watch="${job.id}">Show progress</button>` : '';
  return `
    <div class="job-row">
      <div class="job-main">
        <div class="job-top">
          <span class="job-status job-${job.status}">${STATUS_LABELS[job.status] || job.status}</span>
          <span class="job-url" title="${escapeHtml(job.url)}">${escapeHtml(job.url)}</span>
        </div>
        <div class="job-meta">${escapeHtml(job.folder)} · ${escapeHtml(job.userEmail || '')} · ${when}${running ? ` · ${escapeHtml(job.stage)} ${job.progress}%` : ''}${job.status === 'failed' && job.error ? ` · ${escapeHtml(job.error)}` : ''}</div>
        ${running ? `<div class="progress job-progress"><div class="progress-bar" style="width:${Math.max(3, job.progress)}%"></div></div>` : ''}
      </div>
      <div class="job-thumbs">${thumbs}</div>
      <div class="job-actions">${open}</div>
    </div>`;
}

async function loadJobs() {
  clearTimeout(jobsTimer);
  try {
    const { jobs } = await getJson(API.cloneJobs);
    jobsWrap.classList.toggle('d-none', !jobs.length);
    jobList.innerHTML = jobs.map(jobRow).join('');
    const running = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    if (running.length) jobsTimer = setTimeout(loadJobs, 3000);
    return jobs;
  } catch {
    return [];
  }
}

jobList?.addEventListener('click', (event) => {
  const watch = event.target.closest('[data-watch]');
  if (watch) {
    watchJob(Number(watch.dataset.watch));
    form.scrollIntoView({ behavior: 'smooth' });
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAll();
  const url = document.getElementById('websiteUrl').value.trim();
  const folderName = document.getElementById('folderName').value.trim();
  if (!url) {
    showError('Please enter a valid website URL.');
    return;
  }
  cloneBtn.disabled = true;
  showProgress({ status: 'queued', progress: 0, stage: 'Starting' });
  try {
    const { job } = await getJson(API.cloneJobs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, folderName, mode: cloneMode.value }),
    });
    loadJobs();
    watchJob(job.id);
  } catch (err) {
    showError(err.message === 'Failed to fetch'
      ? 'Could not connect to the server. Make sure the backend is running and try again.'
      : err.message);
    resetCloneButton();
  }
});

// Pick up a clone that is still running from an earlier visit.
loadJobs().then((jobs) => {
  const running = jobs.find((j) => j.status === 'running' || j.status === 'queued');
  if (running && !activeJobId) watchJob(running.id);
});
