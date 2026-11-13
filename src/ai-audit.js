/** AI Full Website Audit & Fix — one-click runs full QA prompt */
import { API } from './api.js';

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function initAiAudit({ folder, previewFrame, pageSelect, loadPages, loadPreview, showSaveToast }) {
  let modal;
  let running = false;

  function setStatus(msg, isError = false) {
    const el = document.getElementById('aiAuditStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'small text-danger mt-2' : 'small text-success mt-2';
  }

  function setProgress(msg) {
    const el = document.getElementById('aiAuditProgress');
    if (el) el.textContent = msg;
  }

  function renderIssues(issues) {
    const box = document.getElementById('aiAuditResults');
    if (!box) return;

    if (!issues?.length) {
      box.innerHTML = '<div class="alert alert-success py-2 mb-0"><i class="bi bi-check-circle me-1"></i>All checks passed — no remaining issues!</div>';
      return;
    }

    const sevClass = { critical: 'danger', high: 'warning', medium: 'info', low: 'secondary' };
    const grouped = issues.reduce((acc, i) => {
      (acc[i.page] ||= []).push(i);
      return acc;
    }, {});

    let html = `<p class="small text-muted mb-2">${issues.length} remaining issue(s)</p><div class="ai-audit-list">`;
    for (const [page, items] of Object.entries(grouped)) {
      html += `<div class="mb-2"><div class="small fw-semibold text-info">${escapeHtml(page)}</div><ul class="small mb-0 ps-3">`;
      for (const item of items.slice(0, 8)) {
        const cls = sevClass[item.severity] || 'secondary';
        html += `<li><span class="badge bg-${cls} me-1">${escapeHtml(item.severity)}</span>${escapeHtml(item.message)}</li>`;
      }
      if (items.length > 8) html += `<li class="text-muted">+${items.length - 8} more…</li>`;
      html += '</ul></div>';
    }
    html += '</div>';
    box.innerHTML = html;
  }

  async function runFullAudit() {
    if (running) return;
    running = true;

    const btn = document.getElementById('aiAuditBtn');
    const oldBtnHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Auditing…';
    }

    setProgress('Step 1/3: Scanning every page, route, image, link, slider, and form…');
    setStatus('Running full website audit & fix — please wait…');

    try {
      const res = await fetch(API.aiAudit, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          mode: 'fix',
          categories: ['all'],
          direct: true,
          useAI: true,
        }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text || 'Server error'); }
      if (!data.success) throw new Error(data.error || 'Audit failed');

      setProgress('Complete!');
      document.getElementById('aiAuditSpinner')?.classList.add('d-none');
      renderIssues(data.issues || []);

      const summaryEl = document.getElementById('aiAuditSummary');
      if (summaryEl) {
        summaryEl.textContent = data.summary || 'Audit complete.';
        summaryEl.classList.remove('d-none');
      }

      const a = data.applied || {};
      const parts = [];
      if (a.pagesFixed) parts.push(`${a.pagesFixed} pages cleaned`);
      if (a.assetsRepaired) parts.push(`${a.assetsRepaired} assets repaired`);
      if (a.aiPatches) parts.push(`${a.aiPatches} AI patches`);
      if (a.aiSeo) parts.push(`${a.aiSeo} SEO updates`);
      if (a.aiCssRules) parts.push(`${a.aiCssRules} CSS rules`);

      setStatus(
        `Done! ${data.pagesChecked} pages checked. Fixed ${data.fixed ?? 0} of ${data.issuesBefore ?? 0} issue(s).` +
        (parts.length ? ` ${parts.join(', ')}.` : '')
      );

      await loadPages?.();
      loadPreview(pageSelect.value);
      showSaveToast?.();
    } catch (err) {
      setProgress('');
      document.getElementById('aiAuditSpinner')?.classList.add('d-none');
      setStatus(err.message, true);
    } finally {
      running = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldBtnHtml;
      }
    }
  }

  function bind() {
    modal = new bootstrap.Modal(document.getElementById('aiAuditModal'));

    document.getElementById('aiAuditBtn')?.addEventListener('click', () => {
      document.getElementById('aiAuditResults').innerHTML = '';
      document.getElementById('aiAuditSummary')?.classList.add('d-none');
      document.getElementById('aiAuditSpinner')?.classList.remove('d-none');
      setStatus('');
      setProgress('Inspecting every page, fixing images, links, sliders, SEO, responsive layout, forms…');
      modal.show();
      runFullAudit();
    });
  }

  return { bind };
}
