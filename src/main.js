import { API } from './api.js';
import { loadLibrary } from './clone-library.js';

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

function animateProgress() {
  progressSection.classList.remove('d-none');
  progressBar.style.width = '0%';
  let width = 0;
  const interval = setInterval(() => {
    if (width < 90) {
      width += Math.random() * 8;
      progressBar.style.width = Math.min(width, 90) + '%';
    }
  }, 400);
  return interval;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAll();

  const url = document.getElementById('websiteUrl').value.trim();
  const folderName = document.getElementById('folderName').value.trim();
  const mode = cloneMode.value;

  if (!url) {
    showError('Please enter a valid website URL.');
    return;
  }

  cloneBtn.disabled = true;
  cloneBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span>Cloning...';

  const progressInterval = animateProgress();
  progressText.textContent = mode === 'website'
    ? 'Cloning the complete website and downloading every page...'
    : 'Cloning this page and downloading its assets...';

  try {
    let response;
    try {
      response = await fetch(API.clone, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, folderName, mode }),
      });
    } catch (networkErr) {
      throw new Error(
        networkErr.message === 'Failed to fetch'
          ? 'Could not connect to the server. Make sure the backend is running (npm run api) and try again.'
          : networkErr.message
      );
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || `Server error (${response.status})`);
    }
    clearInterval(progressInterval);

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Clone failed. Please try again.');
    }

    progressBar.style.width = '100%';
    progressText.textContent = 'Done!';

    setTimeout(() => {
      progressSection.classList.add('d-none');
      successSection.classList.remove('d-none');

      document.getElementById('resultUrl').textContent = data.url;
      document.getElementById('resultFolder').textContent = data.folder;
      document.getElementById('resultPages').textContent = data.pagesCloned || 1;
      document.getElementById('resultFiles').textContent = data.filesDownloaded;
      document.getElementById('resultSize').textContent = data.totalSize;

      document.getElementById('previewBtn').href = data.previewUrl;
      document.getElementById('downloadBtn').href = data.downloadUrl;
      document.getElementById('editPreviewBtn').href =
        `/editor.html?folder=${encodeURIComponent(data.folder)}`;
      clonedFolder = data.folder;
      if (brandStatus) brandStatus.textContent = '';
      if (brandSelect) brandSelect.value = '';
      if (applyBrandBtn) applyBrandBtn.disabled = true;
      loadBrands();
      loadLibrary();
    }, 500);
  } catch (err) {
    clearInterval(progressInterval);
    progressSection.classList.add('d-none');
    showError(err.message);
  } finally {
    cloneBtn.disabled = false;
    cloneBtn.innerHTML =
      '<i class="bi bi-download me-2"></i>Clone Website';
  }
});
