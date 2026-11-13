/**
 * Full-site audit & fix for cloned websites.
 * Phase 1: deterministic scan across every HTML page
 * Phase 2: automatic fixes (slick, assets, SEO, links, responsive CSS)
 * Phase 3: optional OpenAI pass for remaining issues
 */
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { loadEnvKey, openAiChatBody } from './openai-generate.mjs';
import { listPages } from './site-utils.mjs';
import {
  repairCloneAssets,
  repairCorruptedAssets,
  repairUiFidelity,
  stripSlickRuntime,
} from './clone-postprocess.mjs';
import { rewriteSafeThemeOverrides } from './site-utils.mjs';
import { FULL_AUDIT_USER_PROMPT, AUDIT_SYSTEM_PROMPT } from './audit-prompt.mjs';

/** Resolve an AI-supplied page path, refusing anything that would escape siteDir. */
function safeAuditPath(siteDir, page) {
  const rel = String(page || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return null;
  const full = path.resolve(siteDir, rel);
  if (!full.startsWith(path.resolve(siteDir) + path.sep) && full !== path.resolve(siteDir)) return null;
  return full;
}

const AUDIT_CSS = 'assets/css/cloner-ai-audit.css';

function stripJsonFences(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (match ? match[1] : trimmed).trim();
}

function detectSiteOrigin(siteDir) {
  const indexPath = path.join(siteDir, 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  const html = fs.readFileSync(indexPath, 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false });
  for (const sel of [
    ['base', 'href'],
    ['link[rel="canonical"]', 'href'],
    ['meta[property="og:url"]', 'content'],
  ]) {
    const val = $(sel[0]).attr(sel[1]);
    if (val?.startsWith('http')) {
      try { return new URL(val).origin; } catch { /* skip */ }
    }
  }
  const trust = html.match(/trustpilot\.com\/review\/([^/"'\s]+)/i);
  if (trust) {
    try { return `https://www.${trust[1].replace(/^www\./, '')}`.replace(/\/$/, ''); } catch { /* skip */ }
  }
  return null;
}

function resolveLocalPath(siteDir, pageFile, ref) {
  if (!ref || /^(https?:|data:|mailto:|tel:|#|javascript:)/i.test(ref.trim())) return null;
  const clean = ref.trim().split('?')[0].split('#')[0];
  const pageDir = path.posix.dirname(pageFile.replace(/\\/g, '/'));
  const joined = path.posix.normalize(path.posix.join(pageDir === '.' ? '' : pageDir, clean));
  const full = path.join(siteDir, joined);
  if (fs.existsSync(full)) return full;
  if (fs.existsSync(path.join(full, 'index.html'))) return path.join(full, 'index.html');
  return null;
}

function isHtmlFile(buf) {
  const head = buf.slice(0, 128).toString('utf8').trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

function patchSliderScripts(html) {
  return html.replace(
    /\$\(['"]\.mobile_portfolio['"]\)\.slick\(/g,
    "$('.home_slider, .mobile_portfolio').slick("
  );
}

function appendAuditCss(siteDir, rules) {
  if (!rules?.length) return 0;
  const cssDir = path.join(siteDir, 'assets/css');
  if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true });
  const cssPath = path.join(cssDir, 'cloner-ai-audit.css');
  const block = `\n/* AI audit fixes ${new Date().toISOString()} */\n${rules.join('\n')}\n`;
  if (fs.existsSync(cssPath)) {
    fs.appendFileSync(cssPath, block);
  } else {
    fs.writeFileSync(cssPath, block);
  }
  let linked = 0;
  for (const { file } of listPages(siteDir)) {
    const filePath = path.join(siteDir, file);
    let html = fs.readFileSync(filePath, 'utf8');
    const depth = file.includes('/') ? '../'.repeat(file.split('/').length - 1) : '';
    const href = depth + AUDIT_CSS;
    if (!html.includes('cloner-ai-audit.css') && html.includes('</head>')) {
      html = html.replace('</head>', `  <link rel="stylesheet" href="${href}">\n</head>`);
      fs.writeFileSync(filePath, html);
      linked++;
    }
  }
  return linked;
}

const DEFAULT_RESPONSIVE_CSS = [
  'html, body { max-width: 100%; overflow-x: hidden !important; }',
  'img, video, svg { max-width: 100% !important; height: auto !important; }',
  '.slick-slider, .slick-list, .slick-track { max-width: 100% !important; }',
  'table { display: block; max-width: 100%; overflow-x: auto !important; }',
  'iframe { max-width: 100% !important; }',
  '.container, .container-fluid { max-width: 100% !important; }',
];

function scanPage(siteDir, pageFile, allPages, issues) {
  const filePath = path.join(siteDir, pageFile);
  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false });
  const pageSet = new Set(allPages.map((p) => p.file));

  const push = (type, severity, message, fixable = true) => {
    issues.push({ id: `${pageFile}:${type}:${issues.length}`, page: pageFile, type, severity, message, fixable });
  };

  if (/slick-(?:initialized|track|list)/i.test(html)) {
    push('slider', 'high', 'Slick slider runtime HTML saved — sliders may show only dots on reload', true);
  }

  if (!$('title').text()?.trim()) push('seo', 'medium', 'Missing page title', true);
  if (!$('meta[name="description"]').attr('content')?.trim()) push('seo', 'medium', 'Missing meta description', true);
  if (!$('meta[name="viewport"]').length) push('responsive', 'high', 'Missing viewport meta tag', true);

  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null) push('accessibility', 'low', `Image missing alt: ${src.split('/').pop() || 'unknown'}`, true);
    if (src && !/^https?:|data:/i.test(src)) {
      const local = resolveLocalPath(siteDir, pageFile, src);
      if (!local) push('assets', 'high', `Broken image path: ${src}`, true);
      else if (isHtmlFile(fs.readFileSync(local))) push('assets', 'critical', `Corrupt image (HTML file): ${src}`, true);
    }
  });

  $('link[rel*="stylesheet"][href], script[src]').each((_, el) => {
    const attr = el.tagName === 'link' ? 'href' : 'src';
    const val = $(el).attr(attr) || '';
    if (val && !/^https?:|data:|\/\//i.test(val)) {
      const local = resolveLocalPath(siteDir, pageFile, val);
      if (!local) push('assets', 'high', `Missing ${attr} asset: ${val}`, false);
    }
  });

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (/^javscript:/i.test(href)) push('links', 'medium', `Typo in link: javscript:`, true);
    if (href && !/^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) {
      const target = href.replace(/^\//, '').split('?')[0].split('#')[0];
      if (target && !pageSet.has(target) && !pageSet.has(`${target}/index.html`) && !pageSet.has(target.replace(/\/$/, '') + '/index.html')) {
        const local = resolveLocalPath(siteDir, pageFile, href);
        if (!local) push('links', 'medium', `Possibly broken internal link: ${href}`, false);
      }
    }
  });

  $('form').each((_, el) => {
    if (!$(el).attr('action') && !$(el).find('button[type="submit"], input[type="submit"]').length) {
      push('forms', 'low', 'Form has no submit button or action', false);
    }
  });
}

function scanGlobalAssets(siteDir, issues) {
  function walk(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const relPath = (rel ? `${rel}/${name}` : name).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) {
        if (!['external', 'node_modules'].includes(name)) walk(full, relPath);
        continue;
      }
      if (relPath.endsWith('.html')) continue;
      if (isHtmlFile(fs.readFileSync(full))) {
        issues.push({
          id: `asset:${relPath}`,
          page: '(site-wide)',
          type: 'assets',
          severity: 'critical',
          message: `Corrupt asset file (contains HTML): ${relPath}`,
          fixable: true,
        });
      }
    }
  }
  if (fs.existsSync(siteDir)) walk(siteDir);
}

function buildSummary(issues) {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
  const total = issues.length;
  if (!total) return 'No issues found — site looks healthy.';
  return `Found ${total} issue(s): ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low.`;
}

function applyPageHtmlFixes(siteDir, pageFile) {
  const filePath = path.join(siteDir, pageFile);
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const stripped = stripSlickRuntime(html);
  if (stripped !== html) { html = stripped; changed = true; }

  const patched = patchSliderScripts(html);
  if (patched !== html) { html = patched; changed = true; }

  if (/javscript:/i.test(html)) {
    html = html.replace(/javscript:/gi, 'javascript:');
    changed = true;
  }

  const $ = cheerio.load(html, { decodeEntities: false });

  if (!$('meta[name="viewport"]').length && $('head').length) {
    $('head').prepend('<meta name="viewport" content="width=device-width, initial-scale=1">');
    changed = true;
  }

  $('img').each((_, el) => {
    const $el = $(el);
    if ($el.attr('alt') === undefined) {
      const name = ($el.attr('src') || '').split('/').pop()?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || 'image';
      $el.attr('alt', name);
      changed = true;
    }
    const lazy = $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-original');
    const cur = $el.attr('src') || '';
    if (lazy && (!cur || cur.startsWith('data:'))) {
      $el.attr('src', lazy);
      $el.removeAttr('data-src data-lazy-src data-original');
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(filePath, $.html());
  }
  return changed;
}

async function runDeterministicFixes(siteDir, siteOrigin, categories) {
  const all = categories.includes('all');
  const applied = { pagesFixed: 0, assetsRepaired: 0, cssLinked: 0, issuesResolved: 0, steps: [] };
  const pages = listPages(siteDir);

  const want = (cat) => all || categories.includes(cat);

  if (want('slider') || want('assets') || want('links') || want('seo') || want('accessibility')) {
    for (const { file } of pages) {
      if (applyPageHtmlFixes(siteDir, file)) {
        applied.pagesFixed++;
        applied.issuesResolved += 2;
      }
    }
    applied.steps.push(`Cleaned slick runtime & patched HTML on ${applied.pagesFixed} page(s)`);
  }

  if (siteOrigin && (want('assets') || want('links') || all)) {
    try {
      const fixed = await repairCorruptedAssets(siteDir, siteOrigin);
      if (fixed) {
        applied.assetsRepaired = fixed;
        applied.issuesResolved += fixed;
        applied.steps.push(`Re-downloaded ${fixed} corrupt asset file(s)`);
      }
      repairCloneAssets(siteDir, siteOrigin);
      applied.steps.push('Repaired asset paths and CSS url() references');
      applied.issuesResolved += 3;
    } catch (e) {
      applied.steps.push(`Asset repair skipped: ${e.message}`);
    }
  }

  if (want('assets') || want('responsive') || want('slider') || all) {
    try {
      rewriteSafeThemeOverrides(siteDir);
      const ui = await repairUiFidelity(siteDir, siteOrigin);
      if (ui.pagesFixed || ui.assetsDownloaded || ui.cssLinked) {
        applied.steps.push(
          `UI fidelity: ${ui.pagesFixed} page(s), ${ui.assetsDownloaded} CSS/JS file(s), ${ui.cssLinked} fidelity stylesheet link(s)`
        );
        applied.issuesResolved += ui.pagesFixed + ui.assetsDownloaded;
      }
    } catch (e) {
      applied.steps.push(`UI fidelity repair skipped: ${e.message}`);
    }
  }

  if (want('responsive') || all) {
    const linked = appendAuditCss(siteDir, DEFAULT_RESPONSIVE_CSS);
    applied.cssLinked = linked;
    applied.issuesResolved += 1;
    applied.steps.push('Added responsive safety CSS (overflow, images, tables)');
  }

  return applied;
}

async function runAIFixes(siteDir, issues, prompt, siteOrigin) {
  const apiKey = loadEnvKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env');

  const pages = listPages(siteDir);
  const issueSummary = issues.slice(0, 40).map((i) => `[${i.severity}] ${i.page}: ${i.message}`).join('\n');
  const samples = pages.slice(0, 5).map(({ file }) => {
    const html = fs.readFileSync(path.join(siteDir, file), 'utf8');
    return `--- ${file} ---\n${html.slice(0, 2500)}`;
  }).join('\n\n');

  const userText = `${prompt?.trim() || FULL_AUDIT_USER_PROMPT}

Site origin: ${siteOrigin || 'unknown'}
Pages: ${pages.map((p) => p.file).join(', ')}

Issues found:
${issueSummary}

Page samples:
${samples}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify(openAiChatBody({
      json: true,
      maxTokens: 8000,
      messages: [
        { role: 'system', content: AUDIT_SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
    })),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `OpenAI error (${res.status})`);
  const ai = JSON.parse(stripJsonFences(data.choices?.[0]?.message?.content || '{}'));

  const applied = { seo: 0, patches: 0, cssRules: 0 };

  for (const upd of ai.seoUpdates || []) {
    const fp = safeAuditPath(siteDir, upd.page);
    if (!fp || !fs.existsSync(fp)) continue;
    let html = fs.readFileSync(fp, 'utf8');
    const $ = cheerio.load(html, { decodeEntities: false });
    if (upd.title) {
      if ($('title').length) $('title').text(upd.title);
      else $('head').append(`<title>${upd.title}</title>`);
    }
    if (upd.description) {
      let meta = $('meta[name="description"]');
      if (!meta.length) {
        $('head').append(`<meta name="description" content="${upd.description.replace(/"/g, '&quot;')}">`);
      } else {
        meta.attr('content', upd.description);
      }
    }
    fs.writeFileSync(fp, $.html());
    applied.seo++;
  }

  for (const patch of ai.htmlPatches || []) {
    const fp = safeAuditPath(siteDir, patch.page);
    if (!fp || !fs.existsSync(fp) || !patch.find) continue;
    let html = fs.readFileSync(fp, 'utf8');
    if (!html.includes(patch.find)) continue;
    html = html.split(patch.find).join(patch.replace ?? '');
    fs.writeFileSync(fp, html);
    applied.patches++;
  }

  if (ai.cssRules?.length) {
    appendAuditCss(siteDir, ai.cssRules);
    applied.cssRules = ai.cssRules.length;
  }

  return { ai, applied };
}

export async function auditAndFixClonedSite(siteDir, options = {}) {
  const {
    mode = 'fix',
    categories = ['all'],
    prompt = FULL_AUDIT_USER_PROMPT,
    useAI = true,
  } = options;

  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');

  const pages = listPages(siteDir);
  const siteOrigin = detectSiteOrigin(siteDir);
  const issues = [];

  for (const { file } of pages) {
    scanPage(siteDir, file, pages, issues);
  }
  scanGlobalAssets(siteDir, issues);

  const pagesChecked = pages.length;

  if (mode === 'audit') {
    return {
      summary: buildSummary(issues),
      issues,
      pagesChecked,
      siteOrigin,
    };
  }

  let applied = await runDeterministicFixes(siteDir, siteOrigin, categories);
  let aiSummary = '';

  if (useAI) {
    try {
      const remaining = [];
      for (const { file } of pages) scanPage(siteDir, file, pages, remaining);
      scanGlobalAssets(siteDir, remaining);

      const { ai, applied: aiApplied } = await runAIFixes(siteDir, remaining, prompt, siteOrigin);
      applied = {
        ...applied,
        aiSeo: aiApplied.seo,
        aiPatches: aiApplied.patches,
        aiCssRules: aiApplied.cssRules,
        issuesResolved: applied.issuesResolved + aiApplied.seo + aiApplied.patches + aiApplied.cssRules,
        steps: [...(applied.steps || []), `AI: ${ai.summary || 'applied fixes'}`],
      };
      aiSummary = ai.summary || '';
    } catch (e) {
      applied.steps = [...(applied.steps || []), `AI pass skipped: ${e.message}`];
    }
  }

  const finalIssues = [];
  for (const { file } of listPages(siteDir)) {
    scanPage(siteDir, file, listPages(siteDir), finalIssues);
  }
  scanGlobalAssets(siteDir, finalIssues);

  return {
    summary: aiSummary || buildSummary(finalIssues),
    issues: finalIssues,
    pagesChecked,
    siteOrigin,
    applied,
    fixed: (issues.length - finalIssues.length),
    issuesBefore: issues.length,
  };
}
