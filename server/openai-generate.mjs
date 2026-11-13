import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { buildPageHtml, getSiteContext, removeRepeatedSections } from './site-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/** Single model for every AI feature: good at coding and structured edits, reads images, low cost. */
export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-5-mini';

const isReasoningModel = (model) => /^(gpt-5|o\d)/i.test(model);

export function openAiChatBody({ messages, maxTokens = 4000, json = false, model = OPENAI_CHAT_MODEL }) {
  const body = { model, messages };
  if (isReasoningModel(model)) {
    // Reasoning models reject a custom temperature, and hidden reasoning tokens
    // count against max_completion_tokens, so keep effort low and leave headroom.
    body.reasoning_effort = 'low';
    body.max_completion_tokens = maxTokens + 4000;
  } else {
    body.temperature = 0.2;
    body.max_completion_tokens = maxTokens;
  }
  if (json) body.response_format = { type: 'json_object' };
  return body;
}

export function loadEnvKey() {
  const key = process.env.OPENAI_API_KEY;
  if (key) return key;

  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('OPENAI_API_KEY='));
  if (!line) return '';
  const value = line.split('=').slice(1).join('=').trim();
  return value.replace(/^['"]|['"]$/g, '');
}

function stripCodeFences(text) {
  return text
    .replace(/^```html?\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

const PHONE_RE = /(?:\+\d{1,3}[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;
const SKIP_IMAGE = /logo|favicon|fav\.|sprite|icon-|pay-logo|social|invoice|footer\.png|brand\//i;

/**
 * Photographs and graphics that actually exist in the clone.
 * Generated pages may only point at these, because invented filenames render
 * as broken icons.
 */
function listContentImages(siteDir) {
  const found = [];
  const seen = new Set();
  const roots = ['images', 'assets/images', 'assets/img', 'img'].map((rel) => path.join(siteDir, rel));

  function walk(dir, relBase) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const rel = `${relBase}/${entry.name}`;
      if (entry.isDirectory()) {
        if (/^(external|node_modules|brand)$/i.test(entry.name)) continue;
        walk(abs, rel);
        continue;
      }
      if (!IMAGE_EXT.test(entry.name) || SKIP_IMAGE.test(rel)) continue;
      let size = 0;
      try { size = fs.statSync(abs).size; } catch { continue; }
      if (size < 8 * 1024) continue;
      const key = entry.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ rel, size });
    }
  }

  for (const dir of roots) walk(dir, path.relative(siteDir, dir).split(path.sep).join('/'));
  found.sort((a, b) => b.size - a.size);
  return found.map((item) => item.rel);
}

function imageExists(siteDir, src) {
  const clean = String(src || '').split('#')[0].split('?')[0];
  if (!clean || /^(https?:|data:|\/\/)/i.test(clean)) return true;
  const rel = clean.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return false;
  return fs.existsSync(path.join(siteDir, rel));
}

function imageKind(siteDir) {
  const photos = [];
  const icons = [];
  for (const rel of listContentImages(siteDir)) {
    const size = fs.statSync(path.join(siteDir, rel)).size;
    // Small PNGs are the icon tiles. Photographs are the large JPG and WebP files.
    if (/\.png$/i.test(rel) && size < 150 * 1024) icons.push(rel);
    else photos.push(rel);
  }
  return { photos, icons };
}

const IMAGE_FIT_BASE = `.cloner-generated-page img { max-width: 100%; }
.cloner-generated-page img.cloner-ai-photo { width: 100%; height: auto; max-height: 460px; display: block; object-fit: cover; border-radius: 8px; }`;

const IMAGE_FIT_ELEMENTOR = `.cloner-generated-page .elementor-widget-wrap { display: flex !important; flex-direction: column !important; align-items: stretch !important; width: 100% !important; }
.cloner-generated-page .elementor-widget { width: 100% !important; max-width: 100% !important; }
.cloner-generated-page .elementor-container { display: flex !important; flex-wrap: wrap !important; width: 100%; }
.cloner-generated-page .elementor-col-50 { width: 50% !important; flex: 0 0 50% !important; max-width: 50% !important; }
.cloner-generated-page .elementor-col-25 { width: 25% !important; flex: 0 0 25% !important; max-width: 25% !important; }
.cloner-generated-page .elementor-col-100 { width: 100% !important; flex: 0 0 100% !important; }
.cloner-generated-page .elementor-section { padding: 40px 0; }
.elementor-widget-image img { width: 100%; height: auto; max-height: 460px; display: block; object-fit: cover; border-radius: 8px; }
.elementor-widget-image-box .elementor-image-box-wrapper { text-align: center; }
.elementor-widget-image-box .elementor-image-box-img { width: 25%; margin: 0 auto 20px; }
.elementor-widget-image-box .elementor-image-box-img img { width: 100%; height: auto; display: block; }
.elementor-widget-image-box .elementor-image-box-img:has(img.cloner-photo-tile) { width: 100%; margin: 0 auto 16px; }
.elementor-widget-image-box .elementor-image-box-img img.cloner-photo-tile { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; }
@media (max-width: 767px) {
  .cloner-generated-page .elementor-col-50,
  .cloner-generated-page .elementor-col-25 { width: 100% !important; flex: 0 0 100% !important; max-width: 100% !important; }
}`;

function imageFitStyle(html) {
  const rules = /elementor/i.test(html) ? `${IMAGE_FIT_BASE}\n${IMAGE_FIT_ELEMENTOR}` : IMAGE_FIT_BASE;
  return `<style data-cloner-image-fit>\n${rules}\n</style>`;
}

/**
 * Point every missing picture at a real file from the clone, and size image
 * tiles the way the Home page does. Elementor stores that size on per-widget
 * ids the generated page does not have, so without this the icons fill the column.
 */
export function rewriteMissingImages(siteDir, html) {
  const { photos, icons } = imageKind(siteDir);
  const all = [...photos, ...icons];
  if (!all.length) return html;

  const cursors = { photo: 0, icon: 0, any: 0 };
  const used = new Set();
  const iconSet = new Set(icons);
  const photoSet = new Set(photos);

  function take(pool, key) {
    for (let step = 0; step < pool.length; step += 1) {
      const candidate = pool[(cursors[key] + step) % pool.length];
      if (!used.has(candidate)) {
        cursors[key] += step + 1;
        used.add(candidate);
        return candidate;
      }
    }
    const candidate = pool[cursors[key] % pool.length];
    cursors[key] += 1;
    return candidate;
  }

  const rewritten = html.replace(/<img\b[^>]*>/gi, (tag, offset) => {
    const src = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const rel = String(src).split('#')[0].split('?')[0].replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
    const before = html.slice(Math.max(0, offset - 500), offset);
    const inIcon = /elementor-image-box/.test(before);
    const missing = !imageExists(siteDir, src);
    // Badges and form icons are meant to be small. They keep their own picture.
    const decorative = /\bclass\s*=\s*["'][^"']*(?:badge|icon|-img\b)/i.test(tag);
    if (decorative && !missing) return tag;
    // A small site icon in the hero is the wrong picture. Photographs that exist stay where the page put them.
    const wrongKind = !inIcon && iconSet.has(rel) && photos.length;
    const repeatedIcon = inIcon && iconSet.has(rel) && used.has(rel);
    if (!missing && !wrongKind && !repeatedIcon) {
      if (iconSet.has(rel) || photoSet.has(rel)) used.add(rel);
      if (inIcon && photoSet.has(rel)) return markPhotoTile(tag);
      return tag;
    }

    let pool = all;
    let key = 'any';
    if (inIcon && icons.length) {
      pool = icons;
      key = 'icon';
    } else if (!inIcon && photos.length) {
      pool = photos;
      key = 'photo';
    }
    const next = take(pool, key);
    const nextTag = /\bsrc\s*=/i.test(tag)
      ? tag.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${next}"`)
      : tag.replace(/<img\b/i, `<img src="${next}"`);
    if (inIcon && photoSet.has(next)) return markPhotoTile(nextTag);
    return nextTag;
  });

  const fit = imageFitStyle(rewritten);
  if (rewritten.includes('data-cloner-image-fit')) {
    return rewritten.replace(/<style data-cloner-image-fit>[\s\S]*?<\/style>/, fit);
  }
  if (/<\/head>/i.test(rewritten)) return rewritten.replace(/<\/head>/i, `${fit}\n</head>`);
  return `${fit}\n${rewritten}`;
}

/** Tag the photographs made for this page so they fit their column on any site. */
export function markAiPhotos(html, fileNames) {
  let next = String(html || '');
  for (const name of fileNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<img\\b[^>]*images/${escaped}[^>]*>`, 'gi');
    next = next.replace(pattern, (tag) => {
      if (/cloner-ai-photo/.test(tag)) return tag;
      if (/\bclass\s*=/i.test(tag)) return tag.replace(/\bclass\s*=\s*(["'])/i, 'class=$1cloner-ai-photo ');
      return tag.replace(/<img\b/i, '<img class="cloner-ai-photo"');
    });
  }
  return next;
}

function markPhotoTile(tag) {
  if (/cloner-photo-tile/.test(tag)) return tag;
  if (/\bclass\s*=/i.test(tag)) return tag.replace(/\bclass\s*=\s*(["'])/i, 'class=$1cloner-photo-tile ');
  return tag.replace(/<img\b/i, '<img class="cloner-photo-tile"');
}

/** Contact details already printed on the home page, so a new page never invents them. */
function contactFacts(html) {
  const emails = [...new Set(html.match(EMAIL_RE) || [])].slice(0, 6);
  const phones = [...new Set(html.match(PHONE_RE) || [])].slice(0, 6);
  const lines = [];
  if (emails.length) lines.push(`Email: ${emails.join(', ')}`);
  if (phones.length) lines.push(`Phone: ${phones.join(', ')}`);
  return lines.length ? lines.join('\n') : 'None found. Use clear placeholders. Do not invent an email, phone, or address.';
}

/** Page generation uses the strongest model on the account, then falls back if that model is unavailable. */
const PAGE_MODELS = [OPENAI_CHAT_MODEL];

function pageSlug(pageName) {
  return String(pageName || 'page')
    .trim()
    .toLowerCase()
    .replace(/\.php$/i, '')
    .replace(/\.html?$/i, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '') || 'page';
}

function parseModelJson(raw) {
  const text = stripCodeFences(raw);
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('The model did not return a page.');
  }
}

async function chatCompletion(apiKey, body) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || `OpenAI API error (${res.status})`);
    err.code = data.error?.code || '';
    throw err;
  }
  return data.choices?.[0]?.message?.content || '';
}

async function requestImagePng(apiKey, body) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Image generation failed (${res.status})`);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no image.');
  return Buffer.from(b64, 'base64');
}

export async function generateImagePng(apiKey, prompt, size) {
  const body = {
    model: 'gpt-image-1',
    prompt: String(prompt).slice(0, 800),
    n: 1,
    size,
    quality: 'medium',
  };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestImagePng(apiKey, body);
    } catch (err) {
      lastError = err;
      if (/quality|unknown parameter/i.test(err.message) && body.quality) {
        delete body.quality;
        continue;
      }
      // Temporary OpenAI server errors succeed on a second try. Other errors will not.
      if (!/server had an error|try again|overloaded|temporar|timeout|\b5\d\d\b/i.test(err.message)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function upsertMarkedBlock(file, slug, body) {
  const text = String(body || '').trim();
  const start = `/* cloner-page:${slug} */`;
  const end = `/* /cloner-page:${slug} */`;
  const block = `${start}\n${text}\n${end}\n`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const pattern = new RegExp(`\\n*/\\* cloner-page:${slug} \\*/[\\s\\S]*?/\\* /cloner-page:${slug} \\*/\\n?`);
  if (!text) {
    if (pattern.test(current)) fs.writeFileSync(file, current.replace(pattern, '\n'));
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pattern.test(current) ? current.replace(pattern, `\n${block}`) : `${current.trimEnd()}\n\n${block}`);
}

function pickSiteButton(html) {
  const source = String(html || '');
  // Prefer the distinctive three-part CTA bar: Consultancy | Phone | Chat
  const ctaBar = source.match(
    /<div class="global_buttons[^"]*"[\s\S]*?(?:Chat With Us|livechat|fa-comment)[\s\S]*?<\/div>/i
  );
  if (ctaBar) return ctaBar[0].replace(/\s+/g, ' ').trim().slice(0, 900);

  const wrapped = source.match(/<div class="button_head[\s\S]*?<\/button>\s*<\/a>\s*<\/span>\s*<\/div>/i);
  if (wrapped) return wrapped[0].replace(/\s+/g, ' ').trim().slice(0, 500);

  // Full closing CTA bands such as cta-two (start a project)
  const ctaSection = source.match(/<section[^>]*(?:cta-two|cta_band|final-cta|cta-section)[^>]*>[\s\S]*?<\/section>/i)
    || source.match(/<section class="[^"]*cta[^"]*"[\s\S]*?(?:start a project|Get Free|Contact|tel:)[\s\S]*?<\/section>/i);
  if (ctaSection) return ctaSection[0].replace(/\s+/g, ' ').trim().slice(0, 900);

  const matches = [...source.matchAll(/<(?:a|button)\b[^>]*(?:\bbtn\b|global_button)[^>]*>[\s\S]*?<\/(?:a|button)>/gi)]
    .map((match) => match[0]);
  const visible = matches.filter((tag) => !/liveChat|\bnxx\b|video-frame|video-btn|youtube|\bplay\b/i.test(tag));
  const primary = visible.find((tag) => /btn--tertiary|btn-dark|btnres1|button_head|global_button|start a project|Get Free|Consultancy|Contact/i.test(tag))
    || visible[0]
    || '';
  return primary.replace(/\s+/g, ' ').trim().slice(0, 500);
}

/** Pull distinctive reusable UI blocks (CTA bars, sticky contact strips, closing CTA bands) so they can be pasted exactly. */
function extractReusableComponents(html) {
  const source = String(html || '');
  const blocks = [];
  const seen = new Set();

  const patterns = [
    // Three-part consultancy / phone / chat bar (exact project implementation)
    /<div class="global_buttons[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    // Header-style button_head strips
    /<div class="button_head[\s\S]*?<\/div>/gi,
    // Closing CTA bands used on service pages
    /<section[^>]*(?:cta-two|cta_band|final-cta|cta-sec)[^>]*>[\s\S]*?<\/section>/gi,
    /<section[^>]*id=(["'])cta[^"']*\1[^>]*>[\s\S]*?<\/section>/gi,
    /<section class="[^"]*\bcta\b[^"]*"[\s\S]*?(?:start a project|Get Free|Contact Us|tel:)[\s\S]*?<\/section>/gi,
    // Sticky / floating contact bars
    /<(?:div|section)[^>]*(?:sticky|fixed|float)[^>]*(?:contact|cta|call|chat)[^>]*>[\s\S]{0,1200}?<\/(?:div|section)>/gi,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const block = match[0].replace(/\s+/g, ' ').trim();
      const isCtaBar = /global_buttons/i.test(block) && /Get Free|Consultancy|tel:|Chat With Us|livechat|fa-phone|fa-comment/i.test(block);
      const isCtaSection = /<section\b/i.test(block) && /cta/i.test(block);
      const isOther = !/global_buttons/i.test(block) && !isCtaSection;
      if (!isCtaBar && !isCtaSection && !isOther) continue;
      if (block.length < 40 || block.length > 1800) continue;
      const key = block.slice(0, 160);
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push(block);
      if (blocks.length >= 6) return blocks;
    }
  }
  return blocks;
}

function plainText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function shortenSample(html, max, { keepForms = false } = {}) {
  const source = keepForms
    ? String(html || '')
    : String(html || '').replace(/<form\b[\s\S]*?<\/form>/gi, '<form action="/leads/" method="post"></form>');
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Small badges and form icons from the Home page keep their own pictures on a generated page. */
export function restoreDecorativeImages(mainHtml, indexHtml) {
  const decorative = new Map();
  for (const tag of String(indexHtml || '').match(/<img\b[^>]*>/gi) || []) {
    const cls = (tag.match(/\bclass\s*=\s*(["'])(.*?)\1/i) || [])[2];
    const src = (tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i) || [])[2];
    if (!cls || !src || !/badge|icon|-img\b/i.test(cls) || decorative.has(cls.trim())) continue;
    decorative.set(cls.trim(), src);
  }
  return String(mainHtml || '').replace(/<img\b[^>]*>/gi, (tag) => {
    const cls = ((tag.match(/\bclass\s*=\s*(["'])(.*?)\1/i) || [])[2] || '').trim();
    const src = decorative.get(cls);
    if (!src) return tag;
    return tag.replace(/\bsrc\s*=\s*(["'])(.*?)\1/i, `src="${src}"`);
  });
}

function topLevelChunks(html) {
  const body = (String(html || '').match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [null, html])[1] || '';
  const tokens = [];
  const pattern = /<section\b[^>]*>|<\/section>/gi;
  let match = pattern.exec(body);
  while (match) {
    tokens.push({ index: match.index, length: match[0].length, close: match[0].startsWith('</') });
    match = pattern.exec(body);
  }
  const sections = [];
  let depth = 0;
  for (const token of tokens) {
    if (!token.close) {
      depth += 1;
      if (depth === 1) sections.push({ start: token.index });
    } else if (depth === 1 && sections.length && sections[sections.length - 1].end == null) {
      sections[sections.length - 1].end = token.index + token.length;
      depth -= 1;
    } else {
      depth = Math.max(0, depth - 1);
    }
  }
  let chunks = sections
    .filter((section) => section.end > section.start)
    .map((section) => body.slice(section.start, section.end));

  // Themes without <section> (some Elementor layouts): pull banner + a few large blocks.
  if (chunks.length < 2) {
    const extras = [];
    for (const re of [
      /<div\b[^>]*(?:cmn-banner|banneroad|service-single-banner|elementor-top-section|e-con-full)[^>]*>[\s\S]{200,8000}?(?=<div\b[^>]*(?:cmn-banner|banneroad|elementor-top-section|e-con-full|cta)|$)/gi,
      /<div\b[^>]*elementor-section[^>]*>[\s\S]{120,5000}?<\/div>\s*(?:<\/div>\s*){0,6}/gi,
    ]) {
      for (const hit of body.matchAll(re)) {
        extras.push(hit[0]);
        if (extras.length >= 8) break;
      }
      if (extras.length >= 2) break;
    }
    if (extras.length > chunks.length) chunks = extras;
  }

  return chunks
    .filter((chunk) => {
      if (/banner|hero|cmn-banner|cta-two|service-single|banneroad|elementor-section/i.test(chunk)) return true;
      return plainText(chunk).length >= 40;
    })
    .filter((chunk) => !/\bid=(["'])(?:m-footer|scnd-ftr|top-move|popup)/i.test(chunk));
}

export function layoutExamples(indexHtml) {
  const sections = topLevelChunks(indexHtml);
  const opening = shortenSample(sections[0] || '', 4200, { keepForms: true });
  const content = shortenSample(sections.find((chunk, index) => index > 0 && plainText(chunk).length > 80) || '', 1600);
  const button = pickSiteButton(`${sections[0] || ''}\n${indexHtml}`);
  const contact = (indexHtml.match(/href=(["'])([^"']*contact[^"']*)\1/i) || [])[2] || '';
  const outline = sections.slice(0, 8).map((chunk, index) => {
    const heading = plainText((chunk.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1] || '').slice(0, 140);
    const id = (chunk.match(/\bid=(["'])([^"']+)\1/i) || [])[2] || '';
    return `${index + 1}. ${id ? `#${id} ` : ''}${heading || 'section'}`;
  }).join('\n');
  return { opening, content, button, contact, outline };
}

/** CSS custom properties already defined in the clone's stylesheets. */
function extractCssVariables(siteDir) {
  const files = ['css/style.css', 'assets/css/style.css', 'css/home.css', 'assets/css/cloner-site-theme.css']
    .map((rel) => path.join(siteDir, rel))
    .filter((abs) => fs.existsSync(abs));
  const found = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/--[a-zA-Z0-9_-]+\s*:\s*[^;]+;/g)) {
      found.push(match[0].replace(/\s+/g, ' ').trim());
      if (found.length >= 40) break;
    }
    if (found.length >= 40) break;
  }
  return [...new Set(found)].slice(0, 40).join('\n');
}

function headerNavLabels(html) {
  const header = (String(html || '').match(/<header\b[\s\S]*?<\/header>/i) || [''])[0];
  const labels = [];
  const seen = new Set();
  for (const match of header.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = plainText(match[1]).slice(0, 40);
    if (!text || text.length > 28 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    labels.push(text);
    if (labels.length >= 14) break;
  }
  return labels;
}

/** Rewrite ../ asset paths from a nested sample page so a root-level generated page can reuse them. */
function toRootRelativeSample(html, fromFile) {
  const depth = String(fromFile || '').split('/').filter(Boolean).length - 1;
  if (depth <= 0) return String(html || '');
  let out = String(html || '');
  for (let i = depth; i >= 1; i -= 1) {
    const prefix = '../'.repeat(i);
    out = out
      .replaceAll(`src="${prefix}`, 'src="')
      .replaceAll(`href="${prefix}`, 'href="')
      .replaceAll(`src='${prefix}`, "src='")
      .replaceAll(`href='${prefix}`, "href='");
  }
  // Site-root absolute paths used by some themes
  out = out
    .replace(/data-background="\/images\//gi, 'data-background="images/')
    .replace(/src="\/images\//gi, 'src="images/')
    .replace(/href="\/(contact-us|our-services|index)\//gi, 'href="$1/');
  return out;
}

function isAiGeneratedPage(siteDir, file) {
  const abs = path.join(siteDir, file);
  if (!fs.existsSync(abs)) return true;
  try {
    const head = fs.readFileSync(abs, 'utf8').slice(0, 12000);
    return /cloner-generated-page/i.test(head) || /data-cloner-image-fit/i.test(head);
  } catch {
    return true;
  }
}

/** Prefer a real original service page. Never reuse a previously AI-generated page as the template. */
function pickReferencePage(siteDir, pages, prompt) {
  const skipName = /^(index|thank-?you|thanks|privacy|terms|404|leads|blog|blog-single)(\.|$)/i;
  const stop = new Set([
    'page', 'pages', 'service', 'services', 'with', 'from', 'that', 'this', 'your', 'their',
    'about', 'into', 'for', 'the', 'and', 'writers', 'author', 'authors', 'website', 'company',
    'business', 'create', 'generate', 'please', 'need', 'want', 'make', 'using', 'based',
  ]);
  const rawPrompt = String(prompt || '').toLowerCase();
  const promptWords = rawPrompt
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !stop.has(word));
  const coreWords = promptWords.filter((word) => word.length > 3);
  const synonymMap = {
    editing: ['edit', 'proofread', 'proofreading', 'editorial'],
    edit: ['editing', 'proofread', 'proofreading', 'editorial'],
    proofreading: ['editing', 'edit', 'proofread', 'editorial'],
    writing: ['write', 'ghostwrit', 'manuscript'],
    publishing: ['publish', 'print'],
    marketing: ['market', 'promotion', 'advertise'],
    design: ['cover', 'illustrat', 'branding'],
    illustration: ['illustrat', 'design', 'cover'],
    children: ['childrens', 'kids', 'child'],
    childrens: ['children', 'kids', 'child'],
    amazon: ['kdp', 'kindle'],
    audio: ['audiobook', 'narration'],
  };

  // Map nav labels → files so "Book Editing" prefers the link that already says that.
  const navLinked = new Set();
  const navLabelsByFile = new Map();
  const normalizeNavFile = (href) => {
    let normalized = String(href || '').replace(/^\.\//, '').replace(/^\//, '').split(/[?#]/)[0];
    if (/^(#|mailto:|tel:|javascript:|https?:)/i.test(href || '')) return '';
    if (!normalized || normalized === 'index.html') return '';
    if (!normalized.endsWith('.html') && !normalized.endsWith('/')) {
      normalized = `${normalized.replace(/\/$/, '')}/index.html`;
    } else if (normalized.endsWith('/')) {
      normalized = `${normalized}index.html`;
    }
    return normalized;
  };
  try {
    const indexHtml = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
    const header = (indexHtml.match(/<header\b[\s\S]*?<\/header>/i) || [indexHtml.slice(0, 30000)])[0];
    for (const match of header.matchAll(/<a\b[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
      const file = normalizeNavFile(match[2]);
      if (!file) continue;
      navLinked.add(file);
      const label = plainText(match[3]).toLowerCase();
      if (!label) continue;
      const prev = navLabelsByFile.get(file) || '';
      if (label.length > prev.length) navLabelsByFile.set(file, label);
    }
  } catch { /* ignore */ }

  const pageLabel = new Map((pages || []).map((page) => [page.file, String(page.label || '').toLowerCase()]));

  const candidates = (pages || [])
    .map((page) => page.file)
    .filter((file) => /\.html?$/i.test(file))
    .filter((file) => {
      const parts = file.split('/').filter(Boolean);
      const leaf = parts[parts.length - 1].replace(/\.html?$/i, '');
      const folder = parts.length > 1 ? parts[0] : leaf;
      const key = parts.length > 1 ? folder : leaf;
      return !skipName.test(key);
    })
    .filter((file) => !isAiGeneratedPage(siteDir, file));
  if (!candidates.length) return null;

  const score = (file) => {
    const hay = file.toLowerCase().replace(/[\/_-]+/g, ' ');
    const label = `${navLabelsByFile.get(file) || ''} ${pageLabel.get(file) || ''}`.trim();
    let points = 0;
    let coreHits = 0;
    for (const word of coreWords) {
      const ownSyns = synonymMap[word] || [];
      if (hay.includes(word) || label.includes(word)) {
        points += 14;
        coreHits += 1;
      } else if (ownSyns.some((syn) => hay.includes(syn) || label.includes(syn))) {
        points += 8;
        coreHits += 1;
      }
    }
    // Generic leftover tokens (e.g. "book") score lightly so they don't beat a real match.
    for (const word of promptWords) {
      if (coreWords.includes(word)) continue;
      if (hay.includes(word) || label.includes(word)) points += 2;
    }
    if (label && coreWords.length) {
      const labelHits = coreWords.filter((word) => label.includes(word)).length;
      if (labelHits === coreWords.length) points += 30;
      else if (labelHits > 0) points += 12 * labelHits;
    }
    if (navLinked.has(file) || navLinked.has(file.replace(/^\.\//, ''))) points += 10;
    if (/service-single|services-single|service_details|service-details/i.test(hay)) points += 12;
    if (/(^|[\/\s-])services?([\/\s-]|$)/i.test(hay) || /our-services|our services/i.test(hay)) points += 8;
    if (/single/i.test(hay)) points += 3;
    if (/about|team|project|portfolio|faq|feedback|contact|blog|testimonial|privacy|terms/i.test(hay)) points -= 6;
    if (file.includes('/')) points += 2;
    if (coreHits === 0 && coreWords.length) points -= 8;
    try {
      const sample = fs.readFileSync(path.join(siteDir, file), 'utf8').slice(0, 16000);
      const titleBits = plainText((sample.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '').toLowerCase();
      for (const word of coreWords) {
        const ownSyns = synonymMap[word] || [];
        if (titleBits.includes(word)) points += 10;
        else if (ownSyns.some((syn) => titleBits.includes(syn))) points += 5;
      }
      if (/cmn-banner|service-single-banner|service-details|service-t\b|cta-two|banneroad|service-bann|custom-ban-form|elementor-section/i.test(sample)) points += 10;
      if (/class="banner"|banner__content/i.test(sample) && !/cmn-banner|banneroad|service-bann/i.test(sample)) points -= 3;
      const sectionCount = (sample.match(/<section\b|<div[^>]+elementor-section/gi) || []).length;
      if (sectionCount >= 3) points += 2;
    } catch { /* ignore */ }
    return points;
  };
  candidates.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  const file = candidates[0];
  const abs = path.join(siteDir, file);
  if (!fs.existsSync(abs)) return null;
  const html = fs.readFileSync(abs, 'utf8');
  const layout = layoutExamples(html);
  const closingCta = (html.match(/<section[^>]*(?:cta-two|cta_band|cta-sec)[^>]*>[\s\S]*?<\/section>/i)
    || html.match(/<section class="[^"]*\bcta\b[^"]*"[\s\S]*?<\/section>/i)
    || html.match(/<section[^>]*id=(["'])cta[^"']*\1[^>]*>[\s\S]*?<\/section>/i)
    || [''])[0];
  return {
    file,
    outline: layout.outline,
    opening: toRootRelativeSample(layout.opening, file),
    content: toRootRelativeSample(layout.content, file),
    button: toRootRelativeSample(layout.button, file),
    closingCta: toRootRelativeSample(shortenSample(closingCta, 900), file),
    isServiceTemplate: /service|cmn-banner|cta-two|banneroad|service-bann|cta-sec/i.test(`${file}\n${layout.opening}\n${closingCta}`),
  };
}

export function buildSiteDesignBrief(siteDir, { prompt } = {}) {
  const ctx = getSiteContext(siteDir);
  const indexHtml = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  const layout = layoutExamples(indexHtml);
  const reference = pickReferencePage(siteDir, ctx.pages, prompt);
  const theme = ctx.theme || {};
  const pages = (ctx.pages || []).slice(0, 24).map((page) => `- ${page.file}${page.label ? ` (${page.label})` : ''}`).join('\n');
  const classes = (theme.commonClasses || ctx.commonClasses || []).slice(0, 30).join(', ');
  const vars = extractCssVariables(siteDir);
  const nav = headerNavLabels(indexHtml).join(' | ');
  const reusable = extractReusableComponents(indexHtml);
  if (reference) {
    const refHtml = fs.readFileSync(path.join(siteDir, reference.file), 'utf8');
    for (const block of extractReusableComponents(refHtml)) {
      if (!reusable.some((item) => item.slice(0, 120) === block.slice(0, 120))) reusable.push(block);
    }
  }

  const primaryBlock = reference
    ? `PRIMARY LAYOUT REFERENCE — use this page's section classes, banner style, content rhythm, and closing CTA. Do NOT reuse the Home page hero for a service page when this reference exists.
File: ${reference.file}
Outline:
${reference.outline || '(none)'}

Opening / banner sample (copy these tags and classes; rewrite words for the requested service):
${reference.opening || '(none)'}

Content section sample:
${reference.content || '(none)'}

Button / CTA markup from this page:
${reference.button || '(none)'}

${reference.closingCta ? `Closing CTA section — paste this band near the end with service-specific words:\n${reference.closingCta}\n` : ''}`
    : 'No secondary service page sample available; follow the Home page patterns.';

  return {
    indexHtml,
    layout,
    reference,
    brief: `Cloned project design brief (source of truth for HOW the page looks):

Theme colors — primary ${theme.primary || ''}, secondary ${theme.secondary || ''}, accent ${theme.accent || ''}, background ${theme.background || ''}, text ${theme.text || ''}.
Palette: ${(theme.palette || []).slice(0, 10).join(', ') || '(use colors already in the HTML/CSS samples)'}.
Common classes already in use: ${classes || '(infer from the HTML samples)'}.
Header navigation labels already present: ${nav || '(see opening sample)'}.
Contact page href: ${layout.contact || 'use the contact link already on the Home page'}.
Contact details already on the Home page:
${contactFacts(indexHtml)}

Existing pages in this clone:
${pages || '- index.html'}

${vars ? `CSS custom properties already defined:\n${vars}\n` : ''}
EXACT reusable UI components — paste these verbatim when the page needs this UI. Do not redesign or approximate them:
${reusable.length ? reusable.map((block, i) => `Component ${i + 1}:\n${block}`).join('\n\n') : '(none auto-detected; still search the samples below before inventing buttons)'}

${primaryBlock}

Home page samples (shared chrome / fallback only — do not use the Home banner as a service-page hero when a PRIMARY LAYOUT REFERENCE is listed above):
Outline:
${layout.outline || '(no sections found)'}

Home opening (fallback):
${layout.opening || '(no opening section found)'}

Home button (fallback):
${layout.button || '(no button found)'}

Home content pattern (fallback):
${layout.content || '(no second section found)'}`,
  };
}

/** Drop a later block only when it repeats an earlier block word for word. */
export function polishGeneratedMain(mainHtml) {
  const html = String(mainHtml || '');
  return removeRepeatedSections(`<main>${html}</main>`).html.replace(/^<main>|<\/main>$/g, '');
}

/** index.html, /index.html, ../index.html and a bare slash all mean the home page. */
function hrefSlug(href) {
  return String(href || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/^(?:\.\/|(?:\.\.\/)+|\/)+/, '')
    .replace(/\/?index\.(?:html?|php)$/i, '')
    .replace(/\.(?:html?|php)$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function stripActiveClasses(value) {
  return String(value || '')
    .split(/\s+/)
    .filter((token) => token && !/^(?:active|current|current-menu-item|current_page_item|selected)$/i.test(token))
    .join(' ');
}

/**
 * Add one link into existing navigation.
 * Placement comes only from the user's Link placement field
 * (e.g. "Categories Dropdown", "Services", "Footer", "Main Navigation").
 * Empty placement → main header nav (after Home).
 * Supports both <ul><li><a> menus and <div class="dropdown-menu"><a> menus.
 */
export function insertNavItem(html, href, label, placement = '') {
  const source = String(html || '');
  const slug = hrefSlug(href);
  if (!slug || !source) return source;

  const place = String(placement || '').toLowerCase().trim();
  const wantFooter = /\bfooter\b/.test(place);
  const wantMain = !place
    || /^(main(\s+navigation)?|header(\s+navigation)?|navbar|top\s*nav)$/i.test(place)
    || (/\bmain\b|\bheader\b/.test(place) && !/dropdown|menu|footer/i.test(place));
  const menuName = place
    .replace(/\b(dropdown|drop\s*down|mega\s*menu|sub\s*menu|submenu|navigation|nav|menu|link|links|the|in|into|under|to|and|header|footer|main)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wantNamedMenu = Boolean(menuName) && !wantMain;

  const $ = cheerio.load(source, { decodeEntities: false, sourceCodeLocationInfo: true });
  const exists = $('a[href]').toArray().some((a) => hrefSlug($(a).attr('href')) === slug);
  if (exists) return source;

  const inChrome = (el) => $(el).closest('header, nav, [class*="header"], [class*="navbar"], [class*="menu"], [id*="header"], [id*="nav"], [id*="menu"]').length > 0;
  const inFooter = (el) => $(el).closest('footer, [class*="footer"], [id*="footer"]').length > 0;
  const linkOf = (li) => li.children('a').first().length ? li.children('a').first() : li.find('a').first();

  const dropdownTrigger = (menuEl) => {
    const $menu = $(menuEl);
    const parentLi = $menu.closest('li');
    if (parentLi.length) {
      const trigger = parentLi.children('a, button').first();
      if (trigger.length) {
        return trigger.text().replace(/\s+/g, ' ').trim().toLowerCase().replace(/[▾▼▲]/g, '').trim();
      }
    }
    const wrap = $menu.parent().closest('.dropdown, [class*="dropdown"]');
    if (wrap.length) {
      const toggle = wrap.children('a, button').first();
      if (toggle.length) {
        return toggle.text().replace(/\s+/g, ' ').trim().toLowerCase().replace(/[▾▼▲]/g, '').trim();
      }
    }
    const labelled = $menu.attr('aria-labelledby');
    if (labelled) {
      const btn = $(`[id="${labelled}"]`).first();
      if (btn.length) {
        return btn.text().replace(/\s+/g, ' ').trim().toLowerCase().replace(/[▾▼▲]/g, '').trim();
      }
    }
    const id = $menu.attr('id');
    if (id) {
      const btn = $(`[aria-controls="${id}"]`).first();
      if (btn.length) {
        return btn.text().replace(/\s+/g, ' ').trim().toLowerCase().replace(/[▾▼▲]/g, '').trim();
      }
    }
    return '';
  };

  const matchesUserMenu = (menuEl) => {
    if (!menuName) return false;
    const trigger = dropdownTrigger(menuEl);
    const id = String($(menuEl).attr('id') || '').toLowerCase();
    const cls = String($(menuEl).attr('class') || '').toLowerCase();
    const hay = `${trigger} ${id} ${cls}`;
    if (hay.includes(menuName)) return true;
    const stem = menuName.replace(/ies$/, 'y').replace(/ses$/, 's').replace(/s$/, '');
    if (stem.length >= 3 && (trigger.includes(stem) || id.includes(stem))) return true;
    return false;
  };

  const copyOf = (sampleNode) => {
    const loc = sampleNode.sourceCodeLocation;
    if (!loc) return null;
    const { startOffset, endOffset } = loc;
    const copy = cheerio.load(source.slice(startOffset, endOffset), { decodeEntities: false }, false);
    copy('*').each((_, el) => {
      const node = copy(el);
      node.removeAttr('id');
      node.removeAttr('aria-current');
      const cls = stripActiveClasses(node.attr('class'));
      if (cls) node.attr('class', cls);
      else node.removeAttr('class');
    });
    const first = copy.root().children().first();
    first.attr('class', `${first.attr('class') || ''} cloner-nav-added`.trim());
    const link = first.is('a') ? first : copy('a').first();
    link.attr('href', href);
    const span = link.find('span').first();
    if (span.length) {
      span.text(label);
    } else {
      const icons = [];
      link.children('i, svg, img').each((_, el) => icons.push(copy.html(el)));
      if (icons.length) link.html(`${icons.join('')}<span>${label}</span>`);
      else link.text(label);
    }
    return { at: endOffset, item: copy.root().html() };
  };

  const inserts = [];

  const pushIntoMenuContainer = (menuEl) => {
    if (inFooter(menuEl) && !wantFooter) return;
    if (!matchesUserMenu(menuEl)) return;
    const $menu = $(menuEl);
    const lis = $menu.children('li');
    if (lis.length) {
      const last = lis.toArray().map((li) => $(li)).reverse().find((li) => linkOf(li).length && !li.find('ul').length);
      const sample = last || $(lis.last());
      if (!sample.get(0)?.sourceCodeLocation) return;
      const piece = copyOf(sample.get(0));
      if (piece) inserts.push(piece);
      return;
    }
    // Bootstrap / custom: <div class="dropdown-menu"><a class="dropdown-item">...</a></div>
    const links = $menu.children('a');
    if (links.length) {
      const sample = $(links.last());
      if (!sample.get(0)?.sourceCodeLocation) return;
      const piece = copyOf(sample.get(0));
      if (piece) inserts.push(piece);
    }
  };

  const pushAfterHome = (ul) => {
    if (inFooter(ul) || !inChrome(ul)) return;
    if (/dropdown-menu|sub-menu|submenu/i.test($(ul).attr('class') || '')) return;
    const items = $(ul).children('li');
    if (items.length < 2) return;
    const homeLi = items.toArray().map((li) => $(li)).find((li) => {
      const a = linkOf(li);
      if (!a.length) return false;
      const text = a.text().replace(/\s+/g, ' ').trim().toLowerCase();
      return text === 'home' || (text === '' && hrefSlug(a.attr('href')) === '' && /home|logo/i.test(a.attr('class') || ''));
    });
    if (!homeLi || !homeLi.get(0).sourceCodeLocation) return;
    const piece = copyOf(homeLi.get(0));
    if (piece) inserts.push(piece);
  };

  if (wantNamedMenu) {
    // ul menus and div.dropdown-menu panels
    $('ul, div.dropdown-menu, div[class*="dropdown-menu"], .dropdown-menu').each((_, el) => {
      pushIntoMenuContainer(el);
    });
  }

  if (wantFooter) {
    $('ul').each((_, ul) => {
      if (!inFooter(ul)) return;
      const items = $(ul).children('li');
      if (items.length < 2) return;
      const last = items.toArray().map((li) => $(li)).reverse().find((li) => linkOf(li).length);
      if (last?.get(0)?.sourceCodeLocation) {
        const piece = copyOf(last.get(0));
        if (piece) inserts.push(piece);
      }
    });
  }

  if (!wantNamedMenu || (!inserts.length && wantMain && !wantNamedMenu)) {
    if (!wantNamedMenu) {
      $('ul').each((_, ul) => pushAfterHome(ul));
      if (!inserts.length) {
        $('a').each((_, a) => {
          const parent = $(a).parent();
          if (!parent.length || parent.is('li, ul')) return;
          if (inFooter(a) || !inChrome(a)) return;
          if ($(a).text().replace(/\s+/g, ' ').trim().toLowerCase() !== 'home') return;
          if (parent.children('a').length < 2) return;
          const piece = copyOf(a);
          if (piece) inserts.push(piece);
        });
      }
    }
  }

  // Also support Home wrapped in div.dropdown inside li (NY Publishers style)
  if (!wantNamedMenu && !inserts.length) {
    $('li.nav-item, li').each((_, li) => {
      const $li = $(li);
      if (inFooter(li) || !inChrome(li)) return;
      const a = $li.find('a').first();
      if (!a.length) return;
      if (a.text().replace(/\s+/g, ' ').trim().toLowerCase() !== 'home') return;
      if (!$li.get(0)?.sourceCodeLocation) return;
      const piece = copyOf($li.get(0));
      if (piece) inserts.push(piece);
    });
  }

  if (!inserts.length) return source;
  let next = source;
  for (const { at, item } of inserts.sort((a, b) => b.at - a.at)) {
    next = `${next.slice(0, at)}\n${item}${next.slice(at)}`;
  }
  return next;
}

// Menus on many sites are sized to their original items. A tighter gap lets the extra item fit on one line.
const NAV_FIT_CSS = `@media (min-width: 992px) {
  ul:has(> li.cloner-nav-added) > li > a,
  ul:has(> li.cloner-nav-added) > li > .dropdown > a { margin-left: 0 !important; white-space: nowrap; }
  .dropdown-menu a.cloner-nav-added { display: block; }
}`;

export function addPageToHeaders(siteDir, slug, label, placement = '') {
  const safeLabel = String(label || slug).replace(/[<>]/g, '');
  let inserted = false;
  const headerPhp = path.join(siteDir, 'includes/header.php');
  if (fs.existsSync(headerPhp)) {
    const html = fs.readFileSync(headerPhp, 'utf8');
    const next = insertNavItem(html, `/${slug}/`, safeLabel, placement);
    if (next !== html) {
      fs.writeFileSync(headerPhp, next);
      inserted = true;
    }
  }
  const footerPhp = path.join(siteDir, 'includes/footer.php');
  if (fs.existsSync(footerPhp) && /footer/i.test(String(placement || ''))) {
    const html = fs.readFileSync(footerPhp, 'utf8');
    const next = insertNavItem(html, `/${slug}/`, safeLabel, placement || 'Footer Services');
    if (next !== html) {
      fs.writeFileSync(footerPhp, next);
      inserted = true;
    }
  }
  const pages = [];
  function walk(dir, rel = '') {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['external', 'node_modules', 'views', 'includes', 'cdn-cgi'].includes(entry.name)) continue;
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), nextRel);
      else if (/\.html?$/i.test(entry.name)) pages.push(nextRel);
    }
  }
  walk(siteDir);
  for (const file of pages) {
    const abs = path.join(siteDir, file);
    const html = fs.readFileSync(abs, 'utf8');
    const depth = file.split('/').length - 1;
    const href = `${depth ? '../'.repeat(depth) : ''}${slug}.html`;
    const next = insertNavItem(html, href, safeLabel, placement);
    if (next !== html) {
      fs.writeFileSync(abs, next);
      inserted = true;
    }
  }
  if (inserted) {
    for (const cssFile of ['css/style.css', 'assets/css/style.css']) {
      const abs = path.join(siteDir, cssFile);
      if (fs.existsSync(abs)) upsertMarkedBlock(abs, 'nav-fit', NAV_FIT_CSS);
    }
  }
}

export function toPhpPageHref(href) {
  if (/^(https?:|mailto:|tel:|#|javascript:|data:)/i.test(href)) return href;
  if (/\.(css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp4|pdf)(\?|#|$)/i.test(href)) return href;
  if (/^(?:\.\/|(?:\.\.\/)+|\/)?(css|js|images|fonts|external|assets)\//i.test(href)) return href;
  const hash = (href.match(/#.*$/) || [''])[0];
  let page = href.replace(/#.*$/, '').replace(/^(?:\.\/|(?:\.\.\/)+)/, '').replace(/^\/+/, '');
  page = page.replace(/\/index\.html$/i, '').replace(/\.html$/i, '').replace(/\/$/, '');
  if (!page || page === 'index') return `/${hash}`;
  return `/${page}/${hash}`;
}

export function toPhpPageHrefs(html) {
  return html.replace(/\bhref=(["'])([^"']+)\1/gi, (full, quote, href) => `href=${quote}${toPhpPageHref(href)}${quote}`);
}

function writePhpView(siteDir, slug, { title, description, mainHtml }) {
  const views = path.join(siteDir, 'views');
  if (!fs.existsSync(views)) return '';
  const phpMain = mainHtml
    .replace(/\bsrc=(["'])(?!https?:|\/|data:|#)([^"']+)\1/gi, 'src=$1/$2$1')
    .replace(/\bhref=(["'])([^"']+)\1/gi, (full, quote, href) => `href=${quote}${toPhpPageHref(href)}${quote}`);
  const scriptFile = path.join(siteDir, 'js/script.js');
  const hasScript = fs.existsSync(scriptFile) && fs.readFileSync(scriptFile, 'utf8').trim();
  const php = `<!DOCTYPE html>
<html>
<?php include_once("includes/head.php"); ?>
<title>${title.replace(/</g, '')}</title>
<meta name="description" content="${String(description || '').replace(/"/g, '&quot;')}">
<body>
<?php include_once("includes/header.php"); ?>
<main data-cloner-page="main" class="cloner-generated-page">
${phpMain}
</main>
<?php include_once("includes/footer.php"); ?>
${hasScript ? '<script src="/js/script.js"></script>' : ''}
</body>
</html>
`;
  fs.writeFileSync(path.join(views, `${slug}.php`), php);
  const footer = path.join(siteDir, 'includes/footer.php');
  if (hasScript && fs.existsSync(footer)) {
    const text = fs.readFileSync(footer, 'utf8');
    if (!text.includes('/js/script.js')) {
      fs.writeFileSync(footer, text.replace('</footer>', '</footer>\n<script src="/js/script.js"></script>\n'));
    }
  }
  return `views/${slug}.php`;
}

const PAGE_GEN_SYSTEM = `You generate one new service page for an already-cloned website.

CORE GOAL
The goal is not a merely valid webpage. Produce the highest-quality page that looks, feels, and behaves as if the original designers and developers of this cloned website built it themselves.
Reason about visual hierarchy, design language, composition, section sequencing, brand personality, content density, typography, spacing rhythm, component usage, responsive behavior, conversion flow, and overall visual polish. Do not treat generation as simple component assembly.

MOST IMPORTANT RULE
USER PROMPT = WHAT page/service to create (subject, content, intent, purpose).
CLONED PROJECT = HOW the page must look (theme, structure, visual language, UI patterns, components, layout).
Never let the service description override the website's visual identity unless the user explicitly asks for a redesign.

EXISTING THEME IS MANDATORY
Use the cloned project's existing theme for colors, backgrounds, typography, buttons, cards, borders, shadows, radius, icons, spacing, header/nav (already provided by the shell — do not regenerate them), footer (already provided), grid/layout, responsive behavior, hover/animation patterns, and UI components.
Reuse existing classes, CSS variables, design tokens, and markup patterns from the provided samples.
Do not invent random colors, fonts, button styles, cards, spacing systems, shadows, radii, layout patterns, animations, or visual effects.

ANALYZE BEFORE GENERATING
Internally decide: design system in use, theme values, most similar existing pages, reusable components, best hero style, established content layouts, background/section alternation, heading hierarchy, CTA placement, cards/grids/imagery/icons, what makes this site distinctive, and how to apply that to the requested page.
When the design brief includes a PRIMARY LAYOUT REFERENCE (for example service-single or our-services), that page is the structural template. Match its banner classes (such as cmn-banner), content section classes, and closing CTA band. Do not use the Home page hero for a service page when a primary service reference is provided.

DO NOT JUST COPY A PAGE
Do not duplicate an existing page and only change text. Understand the design system, select the strongest patterns for this service, combine them intelligently, and create a structure suited to the request. Content and composition should be unique while remaining unmistakably part of the same website.

INTELLIGENT STRUCTURE
Choose only sections that strengthen this service page. Possible sections when appropriate: Hero, Service Overview, Benefits, Features/Capabilities, Problems/Solutions, detailed text/image sections, Use Cases, Process/How It Works, Why Choose Us (only claims supported by existing content), Social Proof (only if already present in the clone), FAQ, Final CTA.
Do not force every section onto every page. Do not use identical section structure for every generation.

VISUAL QUALITY
Vary existing layout patterns for good pacing. Avoid endless identical card grids, excessive centered text, repetitive layouts, too many boxes, generic SaaS patterns, arbitrary gradients, random decorative effects, huge empty space, or overcrowded sections. Maintain clear hierarchy between hero, main sections, supporting sections, and CTAs.

CONTENT QUALITY
Write realistic, professional, service-specific copy. No lorem ipsum, placeholders, empty buzzwords, or repetitive AI phrasing. Headlines must be specific. CTAs should match existing site language when possible (Get Started, Request a Consultation, Talk to Our Team, Get a Quote, etc.).

NEVER FABRICATE TRUST SIGNALS
Do not invent customer counts, revenue, awards, certifications, ratings, reviews, client names, testimonials, case studies, partnerships, or performance claims. Reuse them only when they already appear in the provided clone samples.

EXACT EXISTING UI / COMPONENT PRESERVATION
Distinctive shared UI on the clone — consultation CTA bars, phone call buttons, chat buttons, sticky contact bars, header actions, floating buttons, custom forms, pricing cards, tabs, accordions, sliders, custom CTA sections — must NOT be visually approximated or redesigned.
EXISTING IMPLEMENTATION > AI-GENERATED REPLACEMENT.
If a component already exists in the project samples, reuse its exact HTML structure, CSS classes, JavaScript behavior, icons, colors, widths, heights, padding, gaps, alignment, border radius, borders/outlines, font size/weight, icon size/position, backgrounds, and hover/focus/active/responsive states.
Do not recreate from memory, simplify, replace with generic buttons, or change proportions/spacing/icon library.
Example: a horizontal bar like "Get Free Consultancy | Phone Number | Chat With Us" must be pasted from the EXACT reusable UI components / button samples provided below — preserve the three-part layout, original widths/height, red consultancy section, dark-blue phone and chat sections, exact icons, radius, outline, text sizing, vertical centering, icon-text spacing, shadows, hover, and mobile stacking.
After generating, mentally compare reused components against existing pages (width, height, vertical centering, icon size/position, padding, colors, radius, borders, alignment, responsive behavior). Fix any visible difference before finishing.

TECHNICAL RULES FOR THIS PIPELINE
- Return one JSON object only:
{
  "pageTitle": "browser title",
  "navLabel": "header menu label of one to three words. Do not repeat a label already in the header.",
  "linkPlacement": "where the link should go when known: Services Dropdown, Main Navigation, Footer Services, Header + Footer, or empty for auto",
  "metaDescription": "one sentence",
  "mainHtml": "inner HTML only. No html, head, body, header, or footer tags.",
  "css": "",
  "js": "",
  "images": [{ "file": "kebab-case.png", "prompt": "a photograph with no text, letters, or watermark" }]
}
- mainHtml must reuse the clone's existing section tags, column classes, containers, and button markup from the samples.
- When a PRIMARY LAYOUT REFERENCE is provided, follow that page's section order and class names first.
- When the design brief lists EXACT reusable UI components, paste those blocks verbatim wherever that UI is needed.
- If an opening sample includes a lead form, keep that form exactly (fields, hidden inputs, action) and change only surrounding copy. If there is no form in the samples, do not invent one.
- Keep small decorative images (badges, form icons, logos) with their original src when they appear in the samples. Put generated photographs only in content sections.
- Buttons use the same tags/classes as the site samples and point at the contact page. Use only listed contact details. Never use a video play button as the primary CTA.
- css and js stay empty unless the request truly needs a small page-local interaction. Do not restyle the whole site. Do not insert header links in JavaScript.
- When images are needed, add one images entry per photograph with src="images/<file>" using that exact kebab-case.png name.
- Fully responsive using the site's existing responsive conventions.
- Semantic, accessible HTML. Do not break shared components or invent a new framework.

PRIORITY WHEN REQUIREMENTS CONFLICT
1) Preserve the cloned theme and brand identity
2) Preserve exact existing shared UI components
3) Preserve existing functionality and forms
4) Reuse existing components and patterns
5) Strongest structure for the requested service
6) High-quality service-specific content
7) Responsive, accessible, production-quality markup

Quality and visual consistency matter more than speed.`;

export async function generatePageWithAI(siteDir, { pageName, pageTitle, prompt, description, linkPlacement }) {
  const apiKey = loadEnvKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to a .env file in the project root.');
  }

  const title = pageTitle || pageName.replace(/\.html?$/i, '').replace(/[-_]/g, ' ');
  const slug = pageSlug(pageName);
  const placementFromPrompt = (String(prompt || '').match(/Requested link placement:\s*\**\s*([^\n*]+)/i) || [])[1]?.trim() || '';
  const placement = String(linkPlacement || placementFromPrompt || '').trim();
  const resolvedPrompt = String(prompt || '')
    .replaceAll('{{PAGE_NAME}}', pageName || `${slug}.php`)
    .replaceAll('{{SERVICE_NAME}}', pageTitle || title)
    .replaceAll('{{LINK_PLACEMENT}}', placement);
  const design = buildSiteDesignBrief(siteDir, { prompt: resolvedPrompt });
  const indexHtml = design.indexHtml;

  const userPrompt = `Generate a new service page based on the service or page description below.

User's requested page/service:
${resolvedPrompt}

Page file name: ${slug}.php
Suggested page title: "${title}"
Requested navigation link placement: ${placement || '(empty — add after Home in the main header nav)'}

${design.brief}

Build the strongest page for this request while staying visually native to the cloned project. Prefer the closest existing service page patterns when they fit; otherwise adapt Home patterns. Include only sections that serve this request. Navigation links are added by the pipeline using the existing menu markup — set navLabel and linkPlacement in the JSON.`;

  const messages = [
    { role: 'system', content: PAGE_GEN_SYSTEM },
    { role: 'user', content: userPrompt },
  ];
  let raw = '';
  let model = PAGE_MODELS[0];
  let lastError;
  for (const candidate of PAGE_MODELS) {
    model = candidate;
    try {
      const body = openAiChatBody({ model, maxTokens: 14000, json: true, messages });
      raw = await chatCompletion(apiKey, body);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (/api key|incorrect api key|quota|billing|rate limit|insufficient/i.test(err.message)) throw err;
    }
  }
  if (lastError) throw lastError;

  const page = parseModelJson(raw);
  let mainContent = String(page.mainHtml || '').trim();
  if (!mainContent) throw new Error('The model returned an empty page.');
  const wrapped = mainContent.match(/^<main\b[^>]*>([\s\S]*)<\/main>$/i);
  if (wrapped) mainContent = wrapped[1].trim();
  mainContent = restoreDecorativeImages(mainContent, indexHtml);

  const images = Array.isArray(page.images) ? page.images.slice(0, 6) : [];
  const saved = await Promise.all(images.map(async (image) => {
    const file = String(image.file || '').replace(/[^a-z0-9._-]/gi, '').replace(/^\.+/, '');
    if (!file || !IMAGE_EXT.test(file)) return null;
    try {
      const png = await generateImagePng(
        apiKey,
        `${image.prompt || file}. Professional photograph, no text, no letters, no watermark.`,
        '1024x1024',
      );
      const pngName = file.replace(/\.\w+$/, '.png');
      for (const dir of ['images', 'assets/images']) {
        const folder = path.join(siteDir, dir);
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, pngName), png);
      }
      return { file, pngName };
    } catch (err) {
      console.warn('Page image skipped:', err.message);
      return null;
    }
  }));
  for (const item of saved) {
    if (item) mainContent = mainContent.replaceAll(`images/${item.file}`, `images/${item.pngName}`);
  }
  mainContent = markAiPhotos(mainContent, saved.filter(Boolean).map((item) => item.pngName));

  mainContent = polishGeneratedMain(mainContent);
  mainContent = rewriteMissingImages(siteDir, mainContent);
  const finalTitle = page.pageTitle || title;
  const meta = page.metaDescription || description || '';
  const css = String(page.css || '');
  const js = String(page.js || '');
  for (const cssFile of ['css/style.css', 'assets/css/style.css']) {
    upsertMarkedBlock(path.join(siteDir, cssFile), slug, css);
  }
  for (const jsFile of ['js/script.js', 'assets/js/script.js']) {
    upsertMarkedBlock(path.join(siteDir, jsFile), slug, js);
  }

  let html = buildPageHtml({
    baseHtml: indexHtml,
    pageTitle: finalTitle,
    mainContent,
    metaDescription: meta,
  });
  const scriptFile = path.join(siteDir, 'js/script.js');
  if (
    fs.existsSync(scriptFile)
    && fs.readFileSync(scriptFile, 'utf8').trim()
    && !/src=["'](?:\.\/)?js\/script\.js["']/i.test(html)
  ) {
    html = html.replace(/<\/body>/i, '<script src="js/script.js"></script>\n</body>');
  }
  fs.writeFileSync(path.join(siteDir, `${slug}.html`), html);

  const phpFile = writePhpView(siteDir, slug, { title: finalTitle, description: meta, mainHtml: mainContent });
  addPageToHeaders(siteDir, slug, page.navLabel || finalTitle, page.linkPlacement || placement);

  return {
    file: `${slug}.html`,
    phpFile,
    label: finalTitle,
    model,
    preview: mainContent.slice(0, 500),
  };
}
