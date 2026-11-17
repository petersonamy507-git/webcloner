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
import { generateImagePng, loadEnvKey, openAiChat } from './openai-generate.mjs';
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

async function askModel(apiKey, userText, images) {
  const content = [{ type: 'text', text: userText }, ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))];
  const data = await openAiChat(apiKey, {
    json: true,
    maxTokens: 8000,
    messages: [{ role: 'system', content: systemPrompt() }, { role: 'user', content }],
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
  const generatedPath = `images/ai/generated-${Date.now()}.webp`;
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
    let png;
    try {
      png = await generateImagePng(apiKey, plan.generateImage.prompt, size, { format: 'webp' });
    } catch (err) {
      throw new Error(`Couldn't create the new image, so nothing was changed. ${err.message}`);
    }
    const dest = path.join(siteDir, generatedPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, png);
    generatedImage = generatedPath;
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
