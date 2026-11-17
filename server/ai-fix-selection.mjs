/**
 * Fix a single selected section by comparing clone vs live original page.
 */
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { loadEnvKey, openAiChat, OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY, OPENAI_TIMEOUT_MS } from './openai-generate.mjs';
import { listPages } from './site-utils.mjs';
import { detectSiteOrigin, loadCloneMeta, pageFileToOriginalUrl } from './site-origin.mjs';

const FIX_CSS = 'assets/css/cloner-selection-fix.css';

function stripJsonFences(text) {
  const trimmed = (text || '').trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (match ? match[1] : trimmed).trim();
}

function repairNestedDocumentTags(html) {
  if (!html) return html;
  return html
    .replace(/<html><head><\/head><body>/gi, '')
    .replace(/<\/body><\/html>/gi, '');
}

export function stripEditorAttrs(html) {
  if (!html) return html;
  return html
    .replace(/\s*data-cloner-id="[^"]*"/g, '')
    .replace(/\s*data-cloner-selected="[^"]*"/g, '')
    .replace(/\s*data-cloner-inline="[^"]*"/g, '')
    .replace(/\s*contenteditable="[^"]*"/g, '');
}

function unwrapReplacementOuter(replacementOuter) {
  let html = repairNestedDocumentTags((replacementOuter || '').trim());
  const $ = cheerio.load(html, { decodeEntities: false }, false);
  const children = $.root().children();
  if (children.length === 1) {
    const only = children.first();
    if (only.is('html')) {
      const bodyChild = only.children('body').children();
      if (bodyChild.length === 1) return bodyChild.first().prop('outerHTML') || html;
      if (bodyChild.length) return bodyChild.map((_, el) => $.html(el)).get().join('');
    }
    return only.prop('outerHTML') || html;
  }
  if (children.length > 1) {
    return children.map((_, el) => $.html(el)).get().join('');
  }
  return html;
}

function localizeOriginalHtml(sectionHtml, siteOrigin, pageFile) {
  let out = repairNestedDocumentTags(sectionHtml);
  if (siteOrigin) {
    const escaped = siteOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '');
  }
  out = out.replace(/href="([^"]+)"/g, (match, href) => {
    if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(href)) return match;
    let h = href.replace(/^\//, '');
    if (!h) return match;
    if (h.endsWith('/')) h = h.slice(0, -1);
    if (!h.includes('.') && !h.endsWith('.html')) h = `${h}/index.html`;
    return `href="${h}"`;
  });
  out = out
    .replace(/src="\/([^"]+)"/g, 'src="$1"')
    .replace(/\.\.\/nypublishers\/assets\/images\//g, 'images/')
    .replace(/\.\.\/nypublishers\/images\//g, 'images/')
    .replace(/src="https?:\/\/[^"]+\/images\//g, 'src="images/');
  return out;
}

async function fetchOriginalHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WebsiteCloner/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Original page fetch failed (${res.status}): ${url}`);
  return res.text();
}

function buildSelector(selection) {
  const tag = (selection.tag || 'div').toLowerCase();
  if (selection.elementId) return `#${selection.elementId.replace(/[^\w-]/g, '')}`;
  const classes = (selection.classes || '')
    .split(/\s+/)
    .filter((c) => c && !c.startsWith('cloner-') && !c.startsWith('data-'))
    .slice(0, 3);
  if (classes.length) return `${tag}.${classes.join('.')}`;
  return tag;
}

function findTarget($, selection) {
  if (selection.elementId) {
    const byId = $(`#${selection.elementId.replace(/[^\w-]/g, '')}`);
    if (byId.length) return byId.first();
  }

  const selector = buildSelector(selection);
  const matches = $(selector);
  if (matches.length === 1) return matches.first();

  const refHtml = stripEditorAttrs(selection.outerHTML || '');
  if (matches.length > 1 && refHtml) {
    const snippet = refHtml.slice(0, 220).replace(/\s+/g, ' ');
    let best = null;
    let bestScore = 0;
    matches.each((_, el) => {
      const outer = ($(el).prop('outerHTML') || '').replace(/\s+/g, ' ');
      let score = 0;
      for (let i = 0; i < Math.min(snippet.length, outer.length); i++) {
        if (snippet[i] === outer[i]) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = $(el);
      }
    });
    if (best) return best;
  }

  if (matches.length) return matches.first();
  return null;
}

export function extractSectionHtml(html, selection) {
  const $ = cheerio.load(repairNestedDocumentTags(html), { decodeEntities: false });
  const target = findTarget($, selection);
  if (!target?.length) return null;
  return target.prop('outerHTML') || null;
}

function replaceByIdRegex(html, selection, replacementOuter) {
  if (!selection.elementId) return null;
  const tag = (selection.tag || 'section').toLowerCase();
  const id = selection.elementId.replace(/[^\w-]/g, '');
  const re = new RegExp(`<${tag}[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/${tag}>`, 'i');
  const match = html.match(re);
  if (!match || match.index === undefined) return null;
  return html.slice(0, match.index) + replacementOuter + html.slice(match.index + match[0].length);
}

function replaceSectionInHtml(html, selection, replacementOuter) {
  html = repairNestedDocumentTags(html);
  replacementOuter = unwrapReplacementOuter(replacementOuter);

  const $ = cheerio.load(html, { decodeEntities: false });
  const target = findTarget($, selection);

  if (target?.length) {
    const oldOuter = $.html(target);
    const idx = html.indexOf(oldOuter);
    if (idx !== -1) {
      return html.slice(0, idx) + replacementOuter + html.slice(idx + oldOuter.length);
    }
  }

  const byRegex = replaceByIdRegex(html, selection, replacementOuter);
  if (byRegex) return byRegex;

  const refHtml = stripEditorAttrs(selection.outerHTML || '');
  if (refHtml) {
    const idx = html.indexOf(refHtml);
    if (idx !== -1) {
      return html.slice(0, idx) + replacementOuter + html.slice(idx + refHtml.length);
    }
  }

  throw new Error('Could not locate selected section in saved page HTML.');
}

function linkFixCss(html, pageFile) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const pageDir = path.posix.dirname(pageFile.replace(/\\/g, '/'));
  const href = pageDir === '.' ? FIX_CSS : `../${FIX_CSS}`;

  if ($(`link[href="${href}"], link[href="${FIX_CSS}"]`).length) return repairNestedDocumentTags($.html());

  if ($('head').length) {
    $('head').append(`<link rel="stylesheet" href="${href}">`);
  } else {
    $('body').prepend(`<link rel="stylesheet" href="${href}">`);
  }
  return repairNestedDocumentTags($.html());
}

function appendFixCss(siteDir, css) {
  if (!css?.trim()) return false;
  const cssDir = path.join(siteDir, 'assets/css');
  if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true });
  const cssPath = path.join(cssDir, 'cloner-selection-fix.css');
  const block = `\n/* Selection fix ${new Date().toISOString()} */\n${css.trim()}\n`;
  fs.appendFileSync(cssPath, block);
  return true;
}

function injectScript(html, script) {
  if (!script?.trim()) return html;
  const $ = cheerio.load(html, { decodeEntities: false });
  const wrapped = `<script>\n${script.trim()}\n</script>`;
  if ($('body').length) $('body').append(wrapped);
  else $.root().append(wrapped);
  return repairNestedDocumentTags($.html());
}

async function aiFixSection({
  cloneSection,
  originalSection,
  pageFile,
  selection,
  userNote,
  siteOrigin,
}) {
  const apiKey = loadEnvKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env');

  const system = `You fix ONE HTML section in a cloned website so it matches the live original.
Return JSON only:
{
  "fixedOuterHTML": "<full outer HTML of the fixed element>",
  "extraCss": "optional CSS rules for this section only",
  "extraScript": "optional small JS snippet if needed for sliders/animation",
  "summary": "one sentence what you fixed"
}
Rules:
- Keep local asset paths (relative images/css/js) — rewrite original absolute URLs to match clone paths when obvious.
- Preserve user's intentional text edits unless user note says to restore original copy.
- Match structure, classes, inline styles, and scripts from original.
- Return ONLY the single root element outerHTML — never wrap in <html>, <head>, or <body>.
- If original section is missing, improve clone section based on user note.`;

  const user = `Page: ${pageFile}
Site origin: ${siteOrigin || 'unknown'}
Element: <${selection.tag}> id="${selection.elementId || ''}" class="${selection.classes || ''}"
User note: ${userNote || 'Make this section match the original live site.'}

--- CLONE (current, broken) ---
${(cloneSection || selection.outerHTML || '').slice(0, 12000)}

--- ORIGINAL (live site, target) ---
${(originalSection || 'NOT FOUND — use clone + user note').slice(0, 12000)}`;

  const data = await openAiChat(apiKey, {
    json: true,
    maxTokens: 12000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return JSON.parse(stripJsonFences(data.choices?.[0]?.message?.content || '{}'));
}

function globalIncludePaths(siteDir, selection) {
  const paths = [];
  const tag = (selection.tag || '').toLowerCase();
  const id = (selection.elementId || '').toLowerCase();
  const footerIds = new Set(['m-footer', 'top-move', 'scnd-ftr', 'popupform1lead']);

  if (tag === 'header' || tag === 'nav') {
    paths.push(path.join(siteDir, 'includes', 'header.php'));
  }
  if (tag === 'footer' || selection.isGlobal || footerIds.has(id) || id.includes('footer')) {
    paths.push(path.join(siteDir, 'includes', 'footer.php'));
  }
  return paths;
}

function patchGlobalIncludes(siteDir, selection, replacementOuter) {
  let count = 0;
  for (const includePath of globalIncludePaths(siteDir, selection)) {
    if (!fs.existsSync(includePath)) continue;
    const html = repairNestedDocumentTags(fs.readFileSync(includePath, 'utf8'));
    try {
      const updated = replaceSectionInHtml(html, selection, replacementOuter);
      if (updated !== html) {
        fs.writeFileSync(includePath, updated);
        count++;
      }
    } catch { /* include may not contain this exact block */ }
  }
  return count;
}

function propagateGlobalToPages(siteDir, selection, replacementOuter) {
  if (!selection.isGlobal) return 0;
  let count = 0;
  for (const { file } of listPages(siteDir)) {
    const fp = path.join(siteDir, file);
    let html = repairNestedDocumentTags(fs.readFileSync(fp, 'utf8'));
    try {
      const updated = replaceSectionInHtml(html, selection, replacementOuter);
      if (updated !== html) {
        fs.writeFileSync(fp, updated);
        count++;
      }
    } catch { /* page may not have this global block */ }
  }
  return count;
}

export function repairCorruptedSelectionHtml(siteDir) {
  let fixed = 0;
  for (const { file } of listPages(siteDir)) {
    const fp = path.join(siteDir, file);
    const raw = fs.readFileSync(fp, 'utf8');
    const repaired = repairNestedDocumentTags(raw);
    if (repaired !== raw) {
      fs.writeFileSync(fp, repaired);
      fixed++;
    }
  }
  for (const rel of ['includes/footer.php', 'includes/header.php']) {
    const fp = path.join(siteDir, rel);
    if (!fs.existsSync(fp)) continue;
    const raw = fs.readFileSync(fp, 'utf8');
    const repaired = repairNestedDocumentTags(raw);
    if (repaired !== raw) {
      fs.writeFileSync(fp, repaired);
      fixed++;
    }
  }
  return fixed;
}

export async function fixSelectionFromOriginal(siteDir, {
  page = 'index.html',
  selection = {},
  prompt = '',
  useAI = true,
}) {
  if (!selection?.outerHTML && !selection?.tag && !selection?.elementId) {
    throw new Error('No element selected — click a section in the preview first.');
  }

  selection = {
    ...selection,
    outerHTML: stripEditorAttrs(selection.outerHTML || ''),
  };

  repairCorruptedSelectionHtml(siteDir);

  const meta = loadCloneMeta(siteDir);
  const siteOrigin = detectSiteOrigin(siteDir);
  const originalUrl = pageFileToOriginalUrl(page, siteOrigin, meta?.sourceUrl);
  if (!originalUrl) {
    throw new Error('Original site URL not found. Re-clone the website or add clone-meta.json with sourceUrl.');
  }

  let originalSection = null;
  try {
    const originalHtml = await fetchOriginalHtml(originalUrl);
    originalSection = extractSectionHtml(originalHtml, selection);
    if (originalSection) {
      originalSection = localizeOriginalHtml(originalSection, siteOrigin, page);
    }
  } catch (err) {
    if (!useAI) throw err;
  }

  const pagePath = path.join(siteDir, page);
  if (!fs.existsSync(pagePath)) throw new Error(`Page not found: ${page}`);

  let cloneHtml = repairNestedDocumentTags(fs.readFileSync(pagePath, 'utf8'));
  const cloneSection = extractSectionHtml(cloneHtml, selection) || selection.outerHTML;

  let aiResult = null;
  if (useAI) {
    aiResult = await aiFixSection({
      cloneSection,
      originalSection,
      pageFile: page,
      selection,
      userNote: prompt,
      siteOrigin,
    });
  } else if (!originalSection) {
    throw new Error('Could not find matching section on original page.');
  } else {
    aiResult = { fixedOuterHTML: originalSection, summary: 'Restored from original HTML.' };
  }

  let fixedOuter = unwrapReplacementOuter(aiResult.fixedOuterHTML || originalSection);
  fixedOuter = localizeOriginalHtml(fixedOuter, siteOrigin, page);
  if (!fixedOuter) {
    throw new Error('No fix produced — try a more specific note or select a larger parent section.');
  }

  let updatedHtml = replaceSectionInHtml(cloneHtml, selection, fixedOuter);
  if (aiResult.extraCss) {
    appendFixCss(siteDir, aiResult.extraCss);
    updatedHtml = linkFixCss(updatedHtml, page);
  }
  if (aiResult.extraScript) {
    updatedHtml = injectScript(updatedHtml, aiResult.extraScript);
  }
  updatedHtml = repairNestedDocumentTags(updatedHtml);
  fs.writeFileSync(pagePath, updatedHtml);

  const applied = {
    page,
    originalUrl,
    summary: aiResult.summary || 'Section updated from original.',
    css: Boolean(aiResult.extraCss),
    script: Boolean(aiResult.extraScript),
    globalPages: 0,
    includes: 0,
  };

  if (selection.isGlobal) {
    applied.includes = patchGlobalIncludes(siteDir, selection, fixedOuter);
    applied.globalPages = propagateGlobalToPages(siteDir, selection, fixedOuter);
  } else {
    applied.includes = patchGlobalIncludes(siteDir, selection, fixedOuter);
  }

  return {
    success: true,
    fixed: true,
    message: applied.summary,
    fixedOuterHTML: fixedOuter,
    applied,
    originalFound: Boolean(originalSection),
  };
}

function pageAssetPrefix(pageFile) {
  const dir = path.posix.dirname(String(pageFile || 'index.html').replace(/\\/g, '/'));
  if (!dir || dir === '.') return '';
  return '../'.repeat(dir.split('/').filter(Boolean).length);
}

function saveMediaFile(siteDir, base64, ext) {
  const clean = String(ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  const video = ['mp4', 'webm', 'mov', 'ogg'].includes(clean);
  const folderName = video ? 'videos' : 'images';
  const dir = path.join(siteDir, folderName);
  fs.mkdirSync(dir, { recursive: true });
  const raw = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) throw new Error('The uploaded file was empty.');
  if (buf.length > 25 * 1024 * 1024) throw new Error('File is too large (max 25 MB).');
  const name = `ai-${Date.now()}.${clean}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `${folderName}/${name}`;
}

function setMediaSrc(outerHTML, src) {
  const $ = cheerio.load(`<div id="cloner-media-wrap">${outerHTML}</div>`, { decodeEntities: false });
  const root = $('#cloner-media-wrap').children().first();
  if (!root.length) return outerHTML;
  const tag = (root.get(0).tagName || '').toLowerCase();
  if (tag === 'img' || tag === 'source' || tag === 'iframe' || tag === 'video') {
    root.attr('src', src);
  }
  if (tag === 'video') {
    const source = root.find('source').first();
    if (source.length) source.attr('src', src);
  }
  if (tag === 'picture') {
    const img = root.find('img').first();
    if (img.length) img.attr('src', src);
  }
  const img = tag === 'img' ? root : root.find('img').first();
  if (img.length) img.attr('src', src);
  else if (!['img', 'video', 'iframe', 'source', 'picture'].includes(tag)) {
    const style = root.attr('style') || '';
    const next = style.replace(/background-image\s*:[^;]+;?/i, '').trim();
    root.attr('style', `${next}${next && !next.endsWith(';') ? ';' : ''}background-image:url('${src}')`);
  }
  return $.html(root) || outerHTML;
}

function keepSelectionId(html, selection) {
  if (!selection?.id || /data-cloner-id=/.test(html || '')) return html;
  return String(html).replace(/^<([a-z0-9]+)/i, `<$1 data-cloner-id="${selection.id}"`);
}

function wantsGeneratedImage(prompt, selection) {
  const text = `${prompt || ''} ${selection?.label || ''} ${selection?.alt || ''} ${selection?.src || ''}`;
  if (/https?:\/\//i.test(prompt || '')) return false;
  const visual = selection?.type === 'image'
    || /logo|image|photo|picture|banner|icon/i.test(text);
  return visual && /\b(generat|create|draw|design|replace|new|change|make|swap)\b/i.test(prompt || '');
}

async function generateImageFile(apiKey, prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt: String(prompt || 'A clean website image').slice(0, 1000),
      n: 1,
      size: '1024x1024',
      quality: OPENAI_IMAGE_QUALITY,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Image generation failed (${res.status})`);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no image.');
  return b64;
}

async function aiRewriteElement({ selection, prompt, newSrc }) {
  const apiKey = loadEnvKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY not found in .env');
  const system = `You edit exactly one HTML element from a cloned website.
Return JSON: {"fixedOuterHTML":"<same root tag>...</same root tag>","summary":"one sentence"}
Rules:
- Change only what the user asked (text, image, logo, video, link, colors, or nearby wording).
- Keep the root tag, classes, ids, and data-cloner-id unless the user asks to change them.
- If newSrc is provided, set img/video/source/iframe src (or the first image inside) to that exact value.
- Do not invent new external URLs. Do not wrap the result in html, head, or body.
- Keep the edit local to this element.`;
  const user = `Selected: <${selection.tag}> type=${selection.type || 'text'} label=${selection.label || ''}
User request: ${prompt || 'Apply the new media source.'}
newSrc: ${newSrc || '(none)'}

CURRENT ELEMENT:
${(selection.outerHTML || '').slice(0, 12000)}`;

  const data = await openAiChat(apiKey, {
    json: true,
    maxTokens: 12000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return JSON.parse(stripJsonFences(data.choices?.[0]?.message?.content || '{}'));
}

export async function editSelectionWithAI(siteDir, {
  page = 'index.html',
  selection = {},
  prompt = '',
  mediaBase64 = '',
  mediaExt = '',
}) {
  if (!selection?.outerHTML && !selection?.tag) {
    throw new Error('Select something in the preview first.');
  }
  const note = String(prompt || '').trim();
  if (!note && !mediaBase64) {
    throw new Error('Type what to change, or upload an image, logo, or video.');
  }
  if (selection.type === 'video' && /\bgenerat(e|ing)?\b/i.test(note) && !mediaBase64 && !/https?:\/\//i.test(note)) {
    throw new Error('Upload a video file or paste a video URL. AI can replace the player with that file or link.');
  }

  selection = { ...selection, outerHTML: stripEditorAttrs(selection.outerHTML || '') };
  const pagePath = path.join(siteDir, page);
  if (!fs.existsSync(pagePath)) throw new Error(`Page not found: ${page}`);

  let assetPath = '';
  if (mediaBase64) {
    assetPath = saveMediaFile(siteDir, mediaBase64, mediaExt || (selection.type === 'video' ? 'mp4' : 'png'));
  } else if (wantsGeneratedImage(note, selection)) {
    const apiKey = loadEnvKey();
    if (!apiKey) throw new Error('OPENAI_API_KEY not found in .env');
    const b64 = await generateImageFile(apiKey, note);
    assetPath = saveMediaFile(siteDir, b64, 'png');
  }

  const linkedUrl = (note.match(/https?:\/\/\S+/) || [])[0] || '';
  const newSrc = assetPath
    ? `${pageAssetPrefix(page)}${assetPath}`
    : (selection.type === 'video' || selection.type === 'image' ? linkedUrl : '');

  let fixedOuter = selection.outerHTML;
  let summary = 'Updated the selected element.';
  const promptIsOnlyUrl = !note || note === linkedUrl;
  if (newSrc && promptIsOnlyUrl) {
    fixedOuter = setMediaSrc(selection.outerHTML, newSrc);
    summary = assetPath ? 'Replaced the selected media.' : 'Updated the media link.';
  } else {
    const ai = await aiRewriteElement({ selection, prompt: note, newSrc });
    fixedOuter = unwrapReplacementOuter(ai.fixedOuterHTML || '');
    summary = ai.summary || summary;
    if (newSrc && fixedOuter && !fixedOuter.includes(newSrc)) {
      fixedOuter = setMediaSrc(fixedOuter, newSrc);
    }
  }

  fixedOuter = keepSelectionId(repairNestedDocumentTags(fixedOuter || ''), selection);
  if (!fixedOuter) throw new Error('AI did not return an updated element.');

  let cloneHtml = repairNestedDocumentTags(fs.readFileSync(pagePath, 'utf8'));
  const updatedHtml = replaceSectionInHtml(cloneHtml, selection, fixedOuter);
  fs.writeFileSync(pagePath, repairNestedDocumentTags(updatedHtml));

  const applied = { page, summary, includes: 0, globalPages: 0 };
  if (selection.isGlobal) {
    applied.includes = patchGlobalIncludes(siteDir, selection, fixedOuter);
    applied.globalPages = propagateGlobalToPages(siteDir, selection, fixedOuter);
  } else {
    applied.includes = patchGlobalIncludes(siteDir, selection, fixedOuter);
  }

  return {
    success: true,
    fixed: true,
    message: summary,
    fixedOuterHTML: fixedOuter,
    applied,
  };
}
