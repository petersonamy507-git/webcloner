/**
 * Prompt + screenshot editing. The model sees the request, any pasted
 * screenshots, the selected element's real source, related CSS, and the
 * workspace's assets, and answers with exact find/replace edits plus optional
 * new CSS. Every edit is validated against the actual files before anything is
 * written, so a request either lands completely or not at all.
 */
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { loadEnvKey, openAiChat } from './openai-generate.mjs';
import { generateImage, referenceFromFile } from './gemini-image.mjs';
import { localImageFile } from './image-fit.mjs';
import { listPages } from './site-utils.mjs';
import { extractSectionHtml, stripEditorAttrs } from './ai-fix-selection.mjs';

const EDIT_CSS = 'assets/css/cloner-ai-edits.css';
const EDITABLE_EXT = /\.(html?|css|php)$/i;
const ASSET_TOKEN = /\{\{asset:(\d+)\}\}/g;
const SITE_IMAGE_TOKEN = /\{\{site:(\d+)\}\}/g;
const GENERATED_TOKEN = /\{\{generated\}\}/g;
const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536'];
// New code the model may not add: it could run in every visitor's browser.
const UNSAFE = /<\s*script\b|\son[a-z]+\s*=|javascript:|<\s*iframe\b|<\s*object\b|<\s*embed\b/gi;

function countUnsafe(text) {
  return (String(text || '').match(UNSAFE) || []).length;
}

function resolveInSite(siteDir, rel) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.split('/').includes('..')) return null;
  const full = path.resolve(siteDir, clean);
  const root = path.resolve(siteDir);
  return full.startsWith(root + path.sep) ? { full, rel: clean } : null;
}

/** The selected element as it appears byte-for-byte in the file, plus a little context after it. */
function rawSourceFor(html, selection) {
  if (!selection) return '';
  const serialized = extractSectionHtml(html, selection) || stripEditorAttrs(selection.outerHTML || '');
  if (!serialized) return '';
  const exact = html.indexOf(serialized);
  if (exact !== -1) return html.slice(exact, exact + Math.min(serialized.length, 14000));
  for (const len of [200, 120, 70, 40]) {
    const probe = serialized.slice(0, len);
    const at = probe.length > 20 ? html.indexOf(probe) : -1;
    if (at !== -1) return html.slice(at, at + Math.min(serialized.length + 400, 14000));
  }
  return '';
}

function selectorsFor(selection) {
  if (!selection) return [];
  const list = [];
  if (selection.elementId) list.push(`#${selection.elementId}`);
  String(selection.classes || '').split(/\s+/).filter((c) => c && !c.startsWith('cloner')).slice(0, 8)
    .forEach((c) => list.push(`.${c}`));
  return list;
}

/** Read-only CSS context: existing rules that mention the selection's classes or id. */
function relatedCss(siteDir, selection) {
  const needles = selectorsFor(selection);
  if (!needles.length) return '';
  const hits = [];
  const root = path.resolve(siteDir);
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (hits.length >= 40) return;
      if (['node_modules', 'external', 'cdn-cgi', 'laravel'].includes(name)) continue;
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.css') || stat.size > 1500000) continue;
      const rel = path.relative(root, full).replace(/\\/g, '/');
      for (const chunk of fs.readFileSync(full, 'utf8').split('}')) {
        if (hits.length >= 40) break;
        const selectorPart = chunk.split('{')[0] || '';
        if (needles.some((n) => selectorPart.includes(n))) {
          hits.push(`/* ${rel} */ ${chunk.trim().replace(/\s+/g, ' ').slice(0, 300)}}`);
        }
      }
    }
  };
  walk(siteDir);
  return hits.join('\n');
}

/**
 * Every image the site already uses, with what identifies it (file name, alt text,
 * the text next to it such as a product name), so the model can pick one itself.
 */
function siteImageCatalog(siteDir, currentPage) {
  const root = path.resolve(siteDir);
  const found = new Map();
  const pages = listPages(siteDir).map((p) => p.file);
  pages.sort((a, b) => (a === currentPage ? -1 : b === currentPage ? 1 : 0));
  for (const file of pages.slice(0, 40)) {
    let $;
    try { $ = cheerio.load(fs.readFileSync(path.join(siteDir, file), 'utf8')); } catch { continue; }
    $('img, picture source').each((_, el) => {
      const node = $(el);
      const raw = node.attr('src') || node.attr('data-src') || node.attr('data-lazy-src')
        || String(node.attr('srcset') || node.attr('data-srcset') || '').split(',')[0].trim().split(/\s+/)[0];
      if (!raw || /^(data:|https?:|\/\/)/i.test(raw)) return;
      let rel;
      try { rel = decodeURIComponent(raw.split(/[?#]/)[0]); } catch { rel = raw.split(/[?#]/)[0]; }
      const full = rel.startsWith('/') ? path.resolve(root, `.${rel}`) : path.resolve(root, path.dirname(file), rel);
      if (!full.startsWith(root + path.sep) || !IMAGE_FILE.test(full) || !fs.existsSync(full)) return;
      const sitePath = path.relative(root, full).replace(/\\/g, '/');
      const img = node.is('img') ? node : node.closest('picture').find('img').first();
      const alt = String(img.attr('alt') || img.attr('title') || '').trim();
      const card = node.closest('a, li, figure, article, [class*=card], [class*=item], [class*=product]').first();
      const near = card.length ? card.text().replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      const prev = found.get(sitePath);
      if (!prev || (!prev.alt && alt) || (!prev.near && near)) {
        found.set(sitePath, { sitePath, alt: alt || prev?.alt || '', near: near || prev?.near || '' });
      }
    });
    if (found.size >= 400) break;
  }
  // Described images first: those are the ones the model can match to a request.
  return [...found.values()]
    .sort((a, b) => Number(Boolean(b.alt || b.near)) - Number(Boolean(a.alt || a.near)))
    .slice(0, 150)
    .map((img, i) => ({ ...img, id: i + 1 }));
}

function systemPrompt() {
  return `You edit a cloned website's real source files. Make the smallest change that does what the user asks.

Return JSON only:
{
  "summary": "one or two sentences describing what you changed",
  "edits": [{ "file": "relative/path.html", "find": "exact text copied from the source", "replace": "new text" }],
  "css": "new CSS rules to add (or empty string)",
  "generateImage": null
}

Rules:
- "find" must be copied character-for-character from a SOURCE block below, and must appear exactly once in that file. Keep it short but unique (usually one opening tag or one line). Never paraphrase it.
- Only edit the files shown in SOURCE blocks. Only .html, .css and .php files.
- Change only what the request is about. Keep every other element, class, attribute, link, animation and script as it is.
- Put visual changes (colors, spacing, fonts, sizes, animations, dark designs) in "css" as new rules. When a unique selector is given, scope every rule to it; never style bare shared classes like .row, .container or .btn on their own, or the change would spread across the site. Use @keyframes in "css" for animations. Use !important only when needed to win over existing rules.
- Use "edits" for text, structure, images and attributes.
- Never add <script>, inline event handlers (onclick=...), javascript: links, iframes, objects or embeds.
- To use one of the workspace assets, write {{asset:ID}} where its URL goes (in HTML src/href or CSS url()). The server turns it into the right path.
- Changing an image: never give up because no file was uploaded. In order:
  1. Look through SITE IMAGES for one that matches what the user wants (by file name, alt text or nearby text such as a product name) and use it with {{site:ID}}. Prefer a workspace asset if the user refers to one.
  2. If none fits, create one: add "generateImage": { "prompt": "...", "size": "1024x1024" | "1536x1024" | "1024x1536" } to your answer and write {{generated}} where its URL goes. Pick the size closest to the selected element's shape. Write the prompt as a detailed description of a realistic, professional image that matches the look of the image being replaced (style, background, framing, lighting; use the screenshots). No text, logos or trademarks in it unless the user asks for them.
- When you replace an <img>, update every source of it so the new image really shows: src, srcset, data-src, data-srcset, data-lazy-src and any <source srcset> in the same <picture> (point them at the new image, or remove srcset/<source>). Keep the element's classes, alt (update it to describe the new image) and size.
- Screenshots show what the user is looking at; use them to understand which part and what change they mean.
- If the request can't be done safely, return no edits, empty css, and explain why in summary.`;
}

function buildUserText({ page, prompt, selection, sourceExcerpt, pageExcerpt, cssContext, assets, siteImages = [], failures }) {
  const parts = [`User request: ${prompt}`, `Current page file: ${page}`];
  if (selection) {
    parts.push(`Selected element: <${selection.tag || '?'}>${selection.label ? ` "${String(selection.label).slice(0, 80)}"` : ''}` +
      `${selection.elementId ? ` id="${selection.elementId}"` : ''}${selection.classes ? ` class="${String(selection.classes).slice(0, 160)}"` : ''}` +
      `${selection.width && selection.height ? ` shown at ${selection.width}x${selection.height}px` : ''}`);
  }
  if (selection?.selectorPath) {
    parts.push(`Unique CSS selector for the selected element: ${selection.selectorPath}\nScope every new CSS rule to this selector (or its descendants) so only the selected element changes.`);
  }
  if (sourceExcerpt) parts.push(`SOURCE ${page} (the selected element, exactly as in the file):\n${sourceExcerpt}`);
  if (pageExcerpt) parts.push(`SOURCE ${page}${selection ? ' (rest of the page)' : ''}:\n${pageExcerpt}`);
  if (cssContext) parts.push(`Existing CSS for the selection (read-only, for reference):\n${cssContext}`);
  parts.push(assets.length
    ? `Workspace assets you may use:\n${assets.map((a) => `- {{asset:${a.id}}} ${a.kind} "${a.fileName}"`).join('\n')}`
    : 'Workspace assets: none.');
  parts.push(siteImages.length
    ? `SITE IMAGES (already in this site; use with {{site:ID}}):\n${siteImages.map((img) => `- {{site:${img.id}}} ${img.sitePath}${img.alt ? ` alt="${img.alt.slice(0, 80)}"` : ''}${img.near ? ` near "${img.near}"` : ''}`).join('\n')}`
    : 'SITE IMAGES: none.');
  if (failures?.length) {
    parts.push(`Your previous answer could not be applied:\n${failures.map((f) => `- ${f}`).join('\n')}\nReturn the full corrected answer.`);
  }
  return parts.join('\n\n');
}

function pageExcerptFor(html, hasSelection) {
  const body = (html.match(/<body\b[\s\S]*<\/body>/i) || [html])[0];
  const limit = hasSelection ? 6000 : 26000;
  return body.length > limit ? `${body.slice(0, limit)}\n<!-- …page continues, truncated… -->` : body;
}

async function askModel(apiKey, userText, images, system = systemPrompt()) {
  const content = [{ type: 'text', text: userText }, ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))];
  const data = await openAiChat(apiKey, {
    json: true,
    maxTokens: 8000,
    messages: [{ role: 'system', content: system }, { role: 'user', content }],
  });
  const raw = data.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new Error('The AI returned an unreadable answer. Try rephrasing the request.');
  }
}

/** Replace {{asset:ID}}, {{site:ID}} and {{generated}} with paths relative to the file they appear in. */
function resolveAssets(text, fileRel, assetsById, used, errors, extra = {}) {
  const rel = (target) => path.posix.relative(path.posix.dirname(fileRel), target) || target;
  return String(text || '')
    .replace(ASSET_TOKEN, (token, id) => {
      const asset = assetsById.get(Number(id));
      if (!asset) {
        errors.push(`${token} is not one of the listed workspace assets.`);
        return token;
      }
      used.add(asset.id);
      return rel(asset.sitePath);
    })
    .replace(SITE_IMAGE_TOKEN, (token, id) => {
      const img = extra.siteImages?.find((i) => i.id === Number(id));
      if (!img) {
        errors.push(`${token} is not one of the listed site images.`);
        return token;
      }
      return rel(img.sitePath);
    })
    .replace(GENERATED_TOKEN, (token) => {
      if (!extra.generatedPath) {
        errors.push('{{generated}} is used but "generateImage" with a prompt is missing.');
        return token;
      }
      extra.generatedUsed = true;
      return rel(extra.generatedPath);
    });
}

/** Validate a plan against the files in memory. Returns the new file contents or the reasons it failed. */
export function planChanges(siteDir, plan, assetsById, extra = {}) {
  const errors = [];
  const files = new Map();
  const used = new Set();
  const edits = Array.isArray(plan.edits) ? plan.edits.slice(0, 25) : [];

  for (const [i, edit] of edits.entries()) {
    const label = `Edit ${i + 1} (${edit?.file || 'no file'})`;
    const target = resolveInSite(siteDir, edit?.file);
    if (!target || !EDITABLE_EXT.test(target.rel) || !fs.existsSync(target.full)) {
      errors.push(`${label}: file must be an existing .html, .css or .php file in the site.`);
      continue;
    }
    const find = String(edit.find ?? '');
    if (!find.trim()) { errors.push(`${label}: "find" is empty.`); continue; }
    const before = files.has(target.rel) ? files.get(target.rel) : fs.readFileSync(target.full, 'utf8');
    const occurrences = before.split(find).length - 1;
    if (occurrences !== 1) {
      errors.push(`${label}: "find" text ${occurrences ? `appears ${occurrences} times` : 'was not found'}; copy a unique snippet exactly from the SOURCE.`);
      continue;
    }
    const replace = resolveAssets(edit.replace, target.rel, assetsById, used, errors, extra);
    if (countUnsafe(replace) > countUnsafe(find)) {
      errors.push(`${label}: adds a script, event handler, iframe or javascript: link, which isn't allowed.`);
      continue;
    }
    const at = before.indexOf(find);
    files.set(target.rel, before.slice(0, at) + replace + before.slice(at + find.length));
  }

  const css = resolveAssets(plan.css, EDIT_CSS, assetsById, used, errors, extra).trim();
  if (css) {
    if (countUnsafe(css) || /@import|expression\s*\(|<\//i.test(css)) errors.push('The CSS contains @import, expressions or markup, which isn\'t allowed.');
    const open = (css.match(/\{/g) || []).length;
    if (open !== (css.match(/\}/g) || []).length) errors.push('The CSS has unbalanced braces.');
  }
  for (const [rel, text] of files) {
    if (/\.html?$/i.test(rel) && !cheerio.load(text)('body').length) errors.push(`${rel} would no longer be a valid page.`);
  }
  return { errors, files, css, used };
}

function linkEditCss(siteDir) {
  for (const { file } of listPages(siteDir)) {
    const full = path.join(siteDir, file);
    const html = fs.readFileSync(full, 'utf8');
    if (html.includes('cloner-ai-edits.css') || !html.includes('</head>')) continue;
    const href = path.posix.relative(path.posix.dirname(file), EDIT_CSS);
    fs.writeFileSync(full, html.replace('</head>', `  <link rel="stylesheet" href="${href}">\n</head>`));
  }
}

/** Keep the exported PHP views in step with the HTML pages they mirror. */
function mirrorToPhp(siteDir, originals, changed) {
  const sources = ['views', 'includes'].flatMap((dir) => {
    const full = path.join(siteDir, dir);
    return fs.existsSync(full) ? fs.readdirSync(full).filter((n) => n.endsWith('.php')).map((n) => path.join(full, n)) : [];
  });
  let mirrored = 0;
  for (const [rel, updated] of changed) {
    if (!/\.html?$/i.test(rel) || !sources.length) continue;
    const before = originals.get(rel);
    // The changed span of the HTML, padded with a little context to anchor it in the PHP copy.
    let start = 0;
    while (start < before.length && before[start] === updated[start]) start++;
    if (start === before.length && before.length === updated.length) continue;
    let common = 0;
    while (common < before.length - start && common < updated.length - start
      && before[before.length - 1 - common] === updated[updated.length - 1 - common]) common++;
    const from = Math.max(0, start - 40);
    const oldSpan = before.slice(from, before.length - common + 40);
    const newSpan = updated.slice(from, updated.length - common + 40);
    if (oldSpan.length < 20) continue;
    for (const php of sources) {
      const text = fs.readFileSync(php, 'utf8');
      if (text.split(oldSpan).length !== 2) continue;
      fs.writeFileSync(php, text.replace(oldSpan, () => newSpan));
      mirrored++;
    }
  }
  return mirrored;
}

/**
 * The image currently on the page that an AI image change replaces: the selected <img>, or the
 * only image (or background image) inside the selection. Sent to Gemini as the reference.
 */
function currentImageReference(siteDir, pageRel, sel) {
  const html = String(sel?.outerHTML || '');
  if (!html) return null;
  const decode = (v) => v.replace(/&amp;/g, '&').trim();
  const srcs = [...html.matchAll(/<img\b[^>]*?\s(?:src|data-src|data-lazy-src)\s*=\s*["']([^"']+)["']/gi)].map((m) => decode(m[1]));
  const bgs = [...html.matchAll(/url\(\s*(?:&quot;|['"])?([^'")&]+)(?:&quot;|['"])?\s*\)/gi)].map((m) => decode(m[1]));
  const isImage = /^(img|picture)$/i.test(sel.tag || '');
  const unique = [...new Set(srcs)];
  const candidates = isImage || unique.length === 1 ? unique.slice(0, 1) : (!unique.length && bgs.length === 1 ? bgs : []);
  for (const src of candidates) {
    const file = localImageFile(siteDir, pageRel, src);
    const ref = file && referenceFromFile(file);
    if (ref) return ref;
  }
  return null;
}

/** Write a generated image; Gemini may answer in another format than .png, so fix the name. */
function saveGenerated(siteDir, plannedPath, made) {
  const finalPath = plannedPath.replace(/\.png$/, made.ext || '.png');
  const dest = path.join(siteDir, finalPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, made.buffer);
  const swap = (text) => (finalPath === plannedPath || !text ? text
    : text.split(path.posix.basename(plannedPath)).join(path.posix.basename(finalPath)));
  return { finalPath, swap };
}

const SIZE_WORDS = /\b(size|resize|width|height|wide|wider|narrow|tall|taller|short|bigger|smaller|larger|full[- ]?width|full[- ]?screen|stretch|shrink|enlarge|scale|crop|aspect|square|circle|round)\b/i;

/**
 * When an image is changed by AI, it keeps the box it had on the page (same width, capped
 * at 100% for small screens, and the same proportions), unless the request or the AI's own
 * CSS is about its size.
 */
function imageSizeLock(sel, note, css) {
  if (!sel || !/^(img|picture)$/i.test(sel.tag || '') || !sel.selectorPath) return '';
  const w = Math.round(Number(sel.width)), h = Math.round(Number(sel.height));
  if (!(w > 0 && h > 0) || SIZE_WORDS.test(note) || /\b(width|height|aspect-ratio)\s*:/i.test(css || '')) return '';
  const target = /^picture$/i.test(sel.tag) ? `${sel.selectorPath} img` : sel.selectorPath;
  return `/* keep the image at its previous size */\n${target} { width: min(${w}px, 100%); height: auto; aspect-ratio: ${w} / ${h}; object-fit: cover; }`;
}

export async function aiEditSite(siteDir, { page = 'index.html', prompt = '', images = [], selection = null, assets = [] }) {
  const note = String(prompt || '').trim();
  if (!note) throw new Error('Describe the change you want.');
  const apiKey = loadEnvKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env.');
  const pageTarget = resolveInSite(siteDir, page);
  if (!pageTarget || !/\.html?$/i.test(pageTarget.rel) || !fs.existsSync(pageTarget.full)) throw new Error('Page not found.');

  const html = fs.readFileSync(pageTarget.full, 'utf8');
  const sel = selection && (selection.outerHTML || selection.elementId || selection.tag) ? selection : null;
  const sourceExcerpt = rawSourceFor(html, sel);
  const context = {
    page: pageTarget.rel,
    prompt: note,
    selection: sel,
    sourceExcerpt,
    pageExcerpt: pageExcerptFor(html, Boolean(sourceExcerpt)),
    cssContext: relatedCss(siteDir, sel),
    assets,
    siteImages: siteImageCatalog(siteDir, pageTarget.rel),
  };
  const assetsById = new Map(assets.map((a) => [Number(a.id), a]));
  const generatedPath = `images/ai/generated-${Date.now()}.png`;
  const extraFor = (p) => ({
    siteImages: context.siteImages,
    generatedPath: p?.generateImage?.prompt ? generatedPath : '',
  });

  let plan = await askModel(apiKey, buildUserText(context), images);
  let extra = extraFor(plan);
  let result = planChanges(siteDir, plan, assetsById, extra);
  if (result.errors.length) {
    plan = await askModel(apiKey, buildUserText({ ...context, failures: result.errors }), images);
    extra = extraFor(plan);
    result = planChanges(siteDir, plan, assetsById, extra);
  }
  if (result.errors.length) {
    throw new Error(`The AI's change couldn't be applied safely, so nothing was changed. ${result.errors[0]}`);
  }
  if (!result.files.size && !result.css) {
    return { success: true, changed: false, summary: plan.summary || 'No change was needed.', filesChanged: [], assetsUsed: [] };
  }

  // A new image the plan asked for: made before anything is written, so a failed
  // generation leaves the site untouched.
  let generatedImage = null;
  if (extra.generatedUsed) {
    const size = IMAGE_SIZES.includes(plan.generateImage.size) ? plan.generateImage.size : '1024x1024';
    // Nano Banana 2 (Gemini); the image being replaced goes along as the reference.
    const reference = currentImageReference(siteDir, pageTarget.rel, sel);
    let made;
    try {
      made = await generateImage(plan.generateImage.prompt, {
        size: sel?.width && sel?.height ? { width: sel.width, height: sel.height } : size,
        references: reference ? [reference] : [],
      });
    } catch (err) {
      throw new Error(`Couldn't create the new image, so nothing was changed. ${err.message}`);
    }
    const saved = saveGenerated(siteDir, generatedPath, made);
    for (const [rel, text] of result.files) result.files.set(rel, saved.swap(text));
    result.css = saved.swap(result.css);
    generatedImage = saved.finalPath;
  }

  // Everything validated; now write.
  for (const id of result.used) {
    const asset = assetsById.get(id);
    const dest = path.join(siteDir, asset.sitePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(asset.source, dest);
  }
  const originals = new Map();
  for (const [rel, text] of result.files) {
    const full = path.join(siteDir, rel);
    originals.set(rel, fs.readFileSync(full, 'utf8'));
    fs.writeFileSync(full, text);
  }
  const filesChanged = [...result.files.keys()];
  const sizeLock = imageSizeLock(sel, note, result.css);
  if (sizeLock) result.css = `${sizeLock}\n${result.css || ''}`.trim();
  if (result.css) {
    const cssPath = path.join(siteDir, EDIT_CSS);
    fs.mkdirSync(path.dirname(cssPath), { recursive: true });
    fs.appendFileSync(cssPath, `\n/* AI edit ${new Date().toISOString()}: ${note.replace(/\*\//g, '').slice(0, 120)} */\n${result.css}\n`);
    linkEditCss(siteDir);
    filesChanged.push(EDIT_CSS);
  }
  const phpMirrored = mirrorToPhp(siteDir, originals, result.files);

  return {
    success: true,
    changed: true,
    summary: plan.summary || 'Done.',
    filesChanged,
    phpMirrored,
    assetsUsed: [...result.used],
    generatedImage,
  };
}


// ── Add a new section anywhere on a page ─────────────────────────────────────

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Where an element that starts at `start` ends in the raw file (balanced same-name tags). */
function elementEnd(html, start) {
  const open = /^<([a-zA-Z][\w-]*)\b[^>]*>/.exec(html.slice(start));
  if (!open) return -1;
  const tag = open[1].toLowerCase();
  if (VOID_TAGS.has(tag) || open[0].endsWith('/>')) return start + open[0].length;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1]) depth -= 1;
    else if (!m[0].endsWith('/>')) depth += 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/** The selected block's byte range in the file, or null when it can't be found exactly. */
function anchorRange(html, sel) {
  if (!sel) return null;
  const serialized = extractSectionHtml(html, sel) || stripEditorAttrs(sel.outerHTML || '');
  if (!serialized) return null;
  const exact = html.indexOf(serialized);
  if (exact !== -1) return { start: exact, end: exact + serialized.length };
  for (const len of [240, 160, 100, 60]) {
    const probe = serialized.slice(0, len);
    if (probe.length < 30) continue;
    const at = html.indexOf(probe);
    if (at !== -1 && html.indexOf(probe, at + 1) === -1) {
      const end = elementEnd(html, at);
      if (end > at) return { start: at, end };
    }
  }
  return null;
}

/** Without a selection: just before the footer, or at the end of <body>. */
function endOfPageOffset(html) {
  const bodyAt = html.search(/<body\b/i);
  const footer = html.slice(Math.max(bodyAt, 0)).search(/<footer\b/i);
  if (bodyAt !== -1 && footer !== -1) return bodyAt + footer;
  const close = html.search(/<\/body>/i);
  return close !== -1 ? close : html.length;
}

function sectionSystemPrompt(scope) {
  return `You design one new section for an existing website. It must look like it was always part of that site.

Return JSON only:
{
  "summary": "one sentence describing the section you added",
  "html": "the section's inner HTML (it is placed inside <section class=\\"${scope}\\">…</section> for you)",
  "css": "CSS for the section; every selector must start with .${scope}",
  "generateImage": null
}

Rules:
- Match the site: reuse the fonts, colors, spacing, button and heading styles you see in the NEARBY SECTION, its CSS and the screenshots. Reusing the site's existing classes (container, row, buttons, headings) is good.
- Write real, specific content for this site (its business, products, tone), not placeholder text like "Lorem ipsum".
- Every CSS selector must begin with .${scope} so nothing else on the site changes (inside @media too). @keyframes names must start with ${scope}-.
- Make it responsive (stack columns on small screens).
- Never use <script>, inline event handlers (onclick=...), javascript: links, iframes, objects or embeds. Forms may post to "/leads/".
- Images: use one from SITE IMAGES with {{site:ID}}, a workspace asset with {{asset:ID}}, or create one with "generateImage": { "prompt": "...", "size": "1024x1024" | "1536x1024" | "1024x1536" } and write {{generated}} where its URL goes (at most one generated image).
- If the request can't be done safely, return empty html and explain in summary.`;
}

function cssScopeErrors(css, scope) {
  const errors = [];
  const flat = String(css || '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '');
  for (const m of flat.matchAll(/([^{}]+)\{/g)) {
    const selectorList = m[1].trim();
    if (!selectorList || selectorList.startsWith('@')) continue;
    for (const selector of selectorList.split(',')) {
      if (!selector.trim().startsWith(`.${scope}`)) errors.push(`CSS selector "${selector.trim().slice(0, 60)}" must start with .${scope}.`);
    }
  }
  return errors.slice(0, 5);
}

/**
 * Add a new AI-designed section above or below the selected block, or at the end of the
 * page. The insertion point is found by the server, so the AI only writes the new section.
 */
export async function aiInsertSection(siteDir, { page = 'index.html', prompt = '', images = [], selection = null, assets = [], position = 'after' }) {
  const note = String(prompt || '').trim();
  if (!note) throw new Error('Describe the section you want to add.');
  const apiKey = loadEnvKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env.');
  const pageTarget = resolveInSite(siteDir, page);
  if (!pageTarget || !/\.html?$/i.test(pageTarget.rel) || !fs.existsSync(pageTarget.full)) throw new Error('Page not found.');

  const html = fs.readFileSync(pageTarget.full, 'utf8');
  const sel = selection && (selection.outerHTML || selection.elementId || selection.tag) ? selection : null;
  let offset;
  let nearby = '';
  if (sel && position !== 'end') {
    const range = anchorRange(html, sel);
    if (!range) throw new Error('Couldn\'t find the selected part in the page file. Select a nearby section and try again.');
    offset = position === 'before' ? range.start : range.end;
    nearby = html.slice(range.start, Math.min(range.end, range.start + 7000));
  } else {
    offset = endOfPageOffset(html);
    nearby = html.slice(Math.max(0, offset - 7000), offset);
  }

  const scope = `cloner-ai-section-${Date.now().toString(36)}`;
  const themeFile = path.join(siteDir, 'theme.json');
  const theme = fs.existsSync(themeFile) ? fs.readFileSync(themeFile, 'utf8').slice(0, 1500) : '';
  const siteImages = siteImageCatalog(siteDir, pageTarget.rel);
  const userText = (failures = []) => [
    `Add this section: ${note}`,
    `It goes ${sel && position !== 'end' ? (position === 'before' ? 'directly above' : 'directly below') + ' the NEARBY SECTION' : 'at the end of the page, before the footer'} on ${pageTarget.rel}.`,
    `NEARBY SECTION (style reference, exactly as in the file):\n${nearby}`,
    `Existing CSS for nearby elements (read-only):\n${relatedCss(siteDir, sel) || 'none found'}`,
    theme ? `Site theme colors:\n${theme}` : '',
    `SOURCE ${pageTarget.rel} (excerpt of the page):\n${pageExcerptFor(html, true)}`,
    assets.length ? `Workspace assets you may use:\n${assets.map((a) => `- {{asset:${a.id}}} ${a.kind} "${a.fileName}"`).join('\n')}` : 'Workspace assets: none.',
    siteImages.length ? `SITE IMAGES (use with {{site:ID}}):\n${siteImages.map((img) => `- {{site:${img.id}}} ${img.sitePath}${img.alt ? ` alt="${img.alt.slice(0, 80)}"` : ''}`).join('\n')}` : 'SITE IMAGES: none.',
    failures.length ? `Your previous answer could not be used:\n${failures.map((f) => `- ${f}`).join('\n')}\nReturn the full corrected answer.` : '',
  ].filter(Boolean).join('\n\n');

  const assetsById = new Map(assets.map((a) => [Number(a.id), a]));
  const generatedPath = `images/ai/generated-${Date.now()}.png`;
  const build = (plan) => {
    const errors = [];
    const used = new Set();
    const extra = { siteImages, generatedPath: plan?.generateImage?.prompt ? generatedPath : '' };
    const inner = resolveAssets(String(plan?.html || ''), pageTarget.rel, assetsById, used, errors, extra).trim();
    const css = resolveAssets(String(plan?.css || ''), EDIT_CSS, assetsById, used, errors, extra).trim();
    if (!inner) errors.push('"html" is empty.');
    if (countUnsafe(inner)) errors.push('The section contains a script, event handler, iframe or javascript: link, which isn\'t allowed.');
    if (/<\/?(html|head|body)\b/i.test(inner)) errors.push('Return only the section\'s inner HTML, not a whole page.');
    if (css && (countUnsafe(css) || /@import|expression\s*\(|<\//i.test(css))) errors.push('The CSS contains @import, expressions or markup.');
    if ((css.match(/\{/g) || []).length !== (css.match(/\}/g) || []).length) errors.push('The CSS has unbalanced braces.');
    errors.push(...cssScopeErrors(css, scope));
    return { errors, inner, css, used, extra };
  };

  let plan = await askModel(apiKey, userText(), images, sectionSystemPrompt(scope));
  let built = build(plan);
  if (built.errors.length) {
    plan = await askModel(apiKey, userText(built.errors), images, sectionSystemPrompt(scope));
    built = build(plan);
  }
  if (built.errors.length) throw new Error(`The AI's section couldn't be added safely, so nothing was changed. ${built.errors[0]}`);

  let generatedImage = null;
  if (built.extra.generatedUsed) {
    const size = IMAGE_SIZES.includes(plan.generateImage.size) ? plan.generateImage.size : '1536x1024';
    let made;
    try {
      made = await generateImage(plan.generateImage.prompt, { size }); // Nano Banana 2 (Gemini)
    } catch (err) {
      throw new Error(`Couldn't create the section's image, so nothing was changed. ${err.message}`);
    }
    const saved = saveGenerated(siteDir, generatedPath, made);
    built.inner = saved.swap(built.inner);
    built.css = saved.swap(built.css);
    generatedImage = saved.finalPath;
  }
  for (const id of built.used) {
    const asset = assetsById.get(id);
    const dest = path.join(siteDir, asset.sitePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(asset.source, dest);
  }

  const section = `\n<section class="cloner-ai-section ${scope}">\n${built.inner}\n</section>\n`;
  const updated = html.slice(0, offset) + section + html.slice(offset);
  if (!cheerio.load(updated)('body').length) throw new Error('Adding the section would break the page, so nothing was changed.');
  fs.writeFileSync(pageTarget.full, updated);
  const filesChanged = [pageTarget.rel];
  if (built.css) {
    const cssPath = path.join(siteDir, EDIT_CSS);
    fs.mkdirSync(path.dirname(cssPath), { recursive: true });
    fs.appendFileSync(cssPath, `\n/* AI section ${new Date().toISOString()}: ${note.replace(/\*\//g, '').slice(0, 120)} */\n${built.css}\n`);
    linkEditCss(siteDir);
    filesChanged.push(EDIT_CSS);
  }
  const phpMirrored = mirrorToPhp(siteDir, new Map([[pageTarget.rel, html]]), new Map([[pageTarget.rel, updated]]));
  return {
    success: true,
    changed: true,
    summary: plan.summary || 'Section added.',
    filesChanged,
    phpMirrored,
    assetsUsed: [...built.used],
    generatedImage,
    insertedSection: scope,
  };
}

/** Placement helpers, exposed for tests. */
export const _sectionInternals = { elementEnd, anchorRange, endOfPageOffset, cssScopeErrors };
