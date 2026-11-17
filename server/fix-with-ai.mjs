/**
 * Describe a problem in plain language. The model reads the page HTML and
 * matching CSS, then applies theme colors, CSS rules, and style updates.
 */
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { loadEnvKey, openAiChatBody, OPENAI_CHAT_MODEL, OPENAI_FALLBACK_MODEL, OPENAI_TIMEOUT_MS } from './openai-generate.mjs';
import { applyTheme, contrastRatio, extractTheme, listPages, loadTheme, removeRepeatedSections, withContrast } from './site-utils.mjs';

const FIX_MODELS = [OPENAI_CHAT_MODEL, OPENAI_FALLBACK_MODEL].filter((m, i, all) => all.indexOf(m) === i);

const FIX_CSS = 'assets/css/cloner-ai-fix.css';
const PAGE_THEME_CSS = 'assets/css/cloner-ai-page-theme.css';
const STYLE_PROPS = new Set([
  'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
  'object-fit', 'object-position', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'display', 'position', 'top', 'left', 'right', 'bottom', 'transform',
  'align-items', 'align-self', 'justify-content', 'flex', 'flex-direction', 'gap',
  'vertical-align', 'float', 'clear', 'z-index', 'background', 'background-color',
  'color', 'border', 'border-radius', 'opacity', 'overflow', 'text-align',
  'line-height', 'font-size', 'box-sizing',
]);

function stripJsonFences(text) {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (match ? match[1] : trimmed).trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asksForVisualChange(prompt) {
  return /\b(theme|colou?rs?|palette|background|logo|recolou?r|resize|position|align|bigger|smaller|size)\b/i.test(prompt);
}

function asksToRemoveRepeat(prompt) {
  return /\b(remove|delete|drop)\b/i.test(prompt) && /\b(repeat|repeated|duplicate|duplicated|same)\b/i.test(prompt);
}

function parseTextReplacement(prompt) {
  const text = String(prompt || '').trim();
  const patterns = [
    /^(?:please\s+)?(?:replace|change|swap|update)\s+(?:the\s+)?(?:text|word|words|wording)\s+(.+?)\s+(?:to|with|into)\s+(.+?)\.?$/i,
    /^(?:please\s+)?(?:replace|change|swap|update)\s+["“'](.+?)["”']\s+(?:to|with|into)\s+["“'](.+?)["”']\.?$/i,
    /^(?:please\s+)?(?:replace|change|swap|update)\s+(.+?)\s+(?:to|with|into)\s+(.+?)\.?$/i,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);
    if (!match) continue;
    const find = match[1].trim().replace(/^["“']|["”']$/g, '');
    const replace = match[2].trim().replace(/^["“']|["”']$/g, '');
    if (!find || !replace || find.toLowerCase() === replace.toLowerCase()) continue;
    if (asksForVisualChange(`${find} ${replace}`)) continue;
    // The last pattern is unanchored, so it also matches ordinary instructions
    // like "change the title tag to include X". Only accept it for short,
    // literal wording; everything else goes to the AI.
    if (i === patterns.length - 1 && !(looksLikeLiteralWords(find) && looksLikeLiteralWords(replace))) continue;
    return { find, replace };
  }
  return null;
}

function looksLikeLiteralWords(text) {
  if (text.split(/\s+/).length > 6) return false;
  if (/[<>]/.test(text)) return false;
  return !/\b(tag|attribute|element|selector|section|page|header|footer|html|css|class|include|add|remove)\b/i.test(text);
}

function sanitizeTextReplacements(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      find: String(item?.find || '').trim(),
      replace: String(item?.replace ?? '').trim(),
    }))
    .filter((item) => item.find && item.find.toLowerCase() !== item.replace.toLowerCase())
    .slice(0, 20);
}

function projectContentFiles(siteDir) {
  const files = new Set(listPages(siteDir).map((page) => page.file));
  const skip = new Set(['leads.php', 'token.php', 'ppc_or_seo.php', 'get-dashboard.php']);
  for (const dir of ['views', 'includes']) {
    const full = path.join(siteDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (!name.endsWith('.php') || skip.has(name)) continue;
      files.add(`${dir}/${name}`);
    }
  }
  return [...files];
}

function replaceVisibleText(html, replacements) {
  const blocks = [];
  let count = 0;
  let next = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => {
    const token = `%%CLONERBLOCK${blocks.length}%%`;
    blocks.push(block);
    return token;
  });
  const apply = (value) => {
    let updated = value;
    for (const { find, replace } of replacements) {
      const pattern = new RegExp(escapeRegExp(find), 'gi');
      updated = updated.replace(pattern, () => {
        count += 1;
        return replace;
      });
    }
    return updated;
  };
  next = next.replace(/>([^<]*)</g, (full, text) => {
    const updated = apply(text);
    return updated === text ? full : `>${updated}<`;
  });
  next = next.replace(/\b(alt|title|placeholder|aria-label)="([^"]*)"/gi, (full, attr, value) => {
    const updated = apply(value);
    return updated === value ? full : `${attr}="${updated}"`;
  });
  next = next.replace(/%%CLONERBLOCK(\d+)%%/g, (_, index) => blocks[Number(index)]);
  return { html: next, count };
}

function applyTextReplacements(siteDir, replacements) {
  let count = 0;
  let filesChanged = 0;
  for (const rel of projectContentFiles(siteDir)) {
    const filePath = path.join(siteDir, rel);
    if (!fs.existsSync(filePath)) continue;
    const current = fs.readFileSync(filePath, 'utf8');
    const updated = replaceVisibleText(current, replacements);
    if (!updated.count || updated.html === current) continue;
    fs.writeFileSync(filePath, updated.html);
    count += updated.count;
    filesChanged += 1;
  }
  return { count, filesChanged };
}

function safePage(siteDir, page) {
  const rel = String(page || 'index.html').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return 'index.html';
  const full = path.resolve(siteDir, rel);
  if (!full.startsWith(path.resolve(siteDir))) return 'index.html';
  return fs.existsSync(full) ? rel : 'index.html';
}

function resolveImageDataUrl(siteDir, pageFile, src) {
  if (!src) return null;
  const clean = String(src).trim().split('#')[0].split('?')[0];
  if (clean.startsWith('data:image/')) {
    return clean.length < 6_000_000 ? clean : null;
  }

  let rel = clean;
  const cloned = rel.match(/\/cloned\/[^/]+\/(.+)$/);
  if (cloned) rel = cloned[1];
  else if (/^https?:/i.test(rel)) return null;
  else if (rel.startsWith('/')) rel = rel.replace(/^\/+/, '');
  else {
    const pageDir = path.posix.dirname(String(pageFile || 'index.html').replace(/\\/g, '/'));
    rel = path.posix.normalize(path.posix.join(pageDir === '.' ? '' : pageDir, rel));
  }
  if (!rel || rel.split('/').includes('..')) return null;

  const full = path.resolve(siteDir, rel);
  if (!full.startsWith(path.resolve(siteDir)) || !fs.existsSync(full)) return null;
  const stat = fs.statSync(full);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) return null;
  const ext = path.extname(full).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext];
  if (!mime) return null;
  return `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`;
}

function extractRegion(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const header = $('header').first();
  const nav = $('nav').first();
  const logo = $('header img, nav img, .logo img, a.logo img, .navbar-brand img').slice(0, 4);
  const parts = [];
  if (header.length) parts.push($.html(header).slice(0, 5000));
  else if (nav.length) parts.push($.html(nav).slice(0, 5000));
  logo.each((_, el) => parts.push($.html(el)));
  const title = $('title').text();
  const logoSrc = logo.first().attr('src') || $('img').filter((_, el) => /logo/i.test(`${$(el).attr('class') || ''} ${$(el).attr('alt') || ''} ${$(el).attr('src') || ''}`)).first().attr('src') || '';
  return { title, region: parts.join('\n').slice(0, 7000), logoSrc };
}

function searchCss(siteDir) {
  const hits = [];
  const root = path.resolve(siteDir);
  function walk(dir) {
    if (hits.length >= 60) return;
    for (const name of fs.readdirSync(dir)) {
      if (hits.length >= 60) return;
      if (['node_modules', 'external', 'cdn-cgi'].includes(name)) continue;
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.css') || stat.size > 1500000) continue;
      const text = fs.readFileSync(full, 'utf8');
      const rel = path.relative(root, full).replace(/\\/g, '/');
      const chunks = text.split('}');
      for (const chunk of chunks) {
        if (hits.length >= 60) break;
        if (!/logo|header|navbar|nav-bar|brand|theme/i.test(chunk)) continue;
        const rule = `${chunk.trim()}}`.replace(/\s+/g, ' ').slice(0, 280);
        if (rule.length > 12) hits.push(`${rel}: ${rule}`);
      }
    }
  }
  if (fs.existsSync(siteDir)) walk(siteDir);
  return hits.join('\n').slice(0, 9000);
}

function sanitizeCssRules(rules) {
  const clean = [];
  for (const raw of rules || []) {
    const rule = String(raw || '').trim();
    if (!rule || rule.length > 500) continue;
    if (/[{]/.test(rule) === false || !rule.includes('}')) continue;
    if ((rule.match(/{/g) || []).length !== 1 || (rule.match(/}/g) || []).length !== 1) continue;
    if (/<|>|expression\s*\(|javascript:|@import|url\s*\(|behavior\s*:/i.test(rule)) continue;
    clean.push(rule);
    if (clean.length >= 24) break;
  }
  return clean;
}

function sanitizeStyle(style) {
  const kept = [];
  for (const part of String(style || '').split(';')) {
    const [rawProp, ...rest] = part.split(':');
    const prop = rawProp?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (!STYLE_PROPS.has(prop) || !value || value.length > 80) continue;
    if (/url\s*\(|expression|javascript:|<|>/i.test(value)) continue;
    kept.push(`${prop}: ${value}`);
  }
  return kept.join('; ');
}

function sanitizeUpdates(updates) {
  const clean = [];
  for (const item of updates || []) {
    const selector = String(item?.selector || '').trim();
    const style = sanitizeStyle(item?.style);
    if (!selector || !style || selector.length > 140) continue;
    if (/[<>{}]|javascript:/i.test(selector)) continue;
    clean.push({ selector, style });
    if (clean.length >= 12) break;
  }
  return clean;
}

function themeOrNull(theme) {
  if (!theme || typeof theme !== 'object') return null;
  const next = {};
  for (const key of ['primary', 'secondary', 'accent', 'background', 'text']) {
    const value = String(theme[key] || '').trim();
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) next[key] = value;
  }
  return Object.keys(next).length ? next : null;
}

function cssHref(pageFile, assetPath) {
  const depth = Math.max(0, pageFile.split('/').filter(Boolean).length - 1);
  return `${depth ? '../'.repeat(depth) : ''}${assetPath}`;
}

function linkStylesheet(siteDir, assetPath, marker) {
  let linked = 0;
  for (const { file } of listPages(siteDir)) {
    const filePath = path.join(siteDir, file);
    let html = fs.readFileSync(filePath, 'utf8');
    if (html.includes(marker) || !html.includes('</head>')) continue;
    const href = cssHref(file, assetPath);
    html = html.replace('</head>', `  <link rel="stylesheet" href="${href}">\n</head>`);
    fs.writeFileSync(filePath, html);
    linked += 1;
  }
  return linked;
}

function linkFixCss(siteDir) {
  return linkStylesheet(siteDir, FIX_CSS, 'cloner-ai-fix.css');
}

function luminance(hex) {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 0;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function contrastText(hex) {
  return luminance(hex) > 160 ? '#111111' : '#ffffff';
}

function readableTheme(theme) {
  const background = theme.background || '#ffffff';
  const secondary = theme.secondary || theme.primary || '#0f172a';
  const primary = theme.primary || '#1d4ed8';
  return {
    ...theme,
    background,
    primary,
    secondary,
    text: withContrast(theme.text || contrastText(background), background),
    accent: withContrast(theme.accent || primary, background),
    heading: withContrast(primary, background),
    onPrimary: withContrast(contrastText(primary), primary),
    onSecondary: withContrast(contrastText(secondary), secondary),
    outline: withContrast(primary, background),
  };
}

function separateColorAndBackground(rule) {
  const color = rule.match(/(?:^|[;{]\s*)color\s*:\s*(#[0-9a-fA-F]{3,8})/i);
  const background = rule.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/i);
  if (!color || !background || contrastRatio(color[1], background[1]) >= 4.5) return rule;
  const next = withContrast(color[1], background[1]);
  return rule.replace(color[0], color[0].replace(color[1], next));
}

function writeFullPageTheme(siteDir, theme) {
  const colors = readableTheme(theme);
  const { primary, secondary, accent, background, text, heading, onPrimary, onSecondary, outline } = colors;
  const css = `/* Full-page theme. Text is always contrasted with the surface behind it. */
body {
  background-color: ${background} !important;
  color: ${text} !important;
}
h1, h2, h3, h4, h5, h6 {
  color: ${heading} !important;
}
p, li, label, td, th, span {
  color: ${text} !important;
}
a, a span {
  color: ${accent} !important;
}
header, .header, .main_header, .header-main, nav, .navbar, .nav-bar, .top-bar,
footer, .footer, .main_footer, .site-footer {
  background-color: ${secondary} !important;
  color: ${onSecondary} !important;
}
header h1, header h2, header h3, header h4, header h5, header h6,
.header h1, .header h2, .header h3, .main_header h1, .main_header h2, .main_header h3,
nav h1, nav h2, nav h3, .navbar h1, .navbar h2, .navbar h3,
footer h1, footer h2, footer h3, footer h4, .footer h1, .footer h2, .footer h3 {
  color: ${onSecondary} !important;
}
header p, header li, header label, header span, header a,
.header p, .header li, .header span, .header a,
.main_header p, .main_header li, .main_header span, .main_header a,
nav p, nav li, nav span, nav a, .navbar p, .navbar li, .navbar span, .navbar a,
footer p, footer li, footer span, footer a, .footer p, .footer li, .footer span, .footer a {
  color: ${onSecondary} !important;
}
button, .btn, a.btn, a[class*="btn"], button[class*="btn"],
input[type="submit"], input[type="button"], .cta a, .cta button {
  background-color: ${primary} !important;
  border-color: ${primary} !important;
  color: ${onPrimary} !important;
}
button span, .btn span, a.btn span, a[class*="btn"] span {
  color: ${onPrimary} !important;
}
.btn-outline, a.btn-outline, button.btn-outline {
  background-color: transparent !important;
  color: ${outline} !important;
  border-color: ${outline} !important;
}
blockquote, .accent, .highlight, .primary-color {
  color: ${accent} !important;
}
`;
  const cssDir = path.join(siteDir, 'assets/css');
  fs.mkdirSync(cssDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, PAGE_THEME_CSS), css);
  return linkStylesheet(siteDir, PAGE_THEME_CSS, 'cloner-ai-page-theme.css');
}

/** Site-wide layer (header, footer, nav, buttons, links, headings) for the theme saved in theme.json. */
export function applyFullPageTheme(siteDir, theme) {
  return writeFullPageTheme(siteDir, readableTheme(theme));
}

function applyStyleUpdates(siteDir, updates) {
  let changed = 0;
  if (!updates.length) return changed;
  for (const { file } of listPages(siteDir)) {
    const filePath = path.join(siteDir, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html, { decodeEntities: false });
    let pageChanged = false;
    for (const update of updates) {
      let matches = 0;
      $(update.selector).each((_, el) => {
        if (matches >= 20) return;
        const prev = $(el).attr('style') || '';
        const next = prev ? `${prev.replace(/;\s*$/, '')}; ${update.style}` : update.style;
        $(el).attr('style', next);
        matches += 1;
        pageChanged = true;
        changed += 1;
      });
    }
    if (pageChanged) fs.writeFileSync(filePath, $.html());
  }
  return changed;
}

export function applyFixPlan(siteDir, plan) {
  const cssRules = sanitizeCssRules(plan.cssRules).map(separateColorAndBackground);
  const styleUpdates = sanitizeUpdates(plan.styleUpdates).map((update) => ({
    ...update,
    style: separateColorAndBackground(update.style),
  }));
  const theme = themeOrNull(plan.theme);
  const applied = { theme: false, cssRules: cssRules.length, styleUpdates: 0, pagesLinked: 0 };

  if (theme) {
    const current = fs.existsSync(path.join(siteDir, 'theme.json')) ? loadTheme(siteDir) : extractTheme(siteDir);
    const fullTheme = readableTheme({
      primary: theme.primary || current.primary || '#1d4ed8',
      secondary: theme.secondary || current.secondary || theme.primary || current.primary || '#0f172a',
      accent: theme.accent || current.accent || theme.primary || current.primary || '#f59e0b',
      background: theme.background || current.background || '#ffffff',
      text: theme.text || current.text || '#111111',
    });
    applyTheme(siteDir, { ...current, ...fullTheme });
    applied.pagesLinked += writeFullPageTheme(siteDir, fullTheme);
    applied.theme = true;
  }

  if (cssRules.length) {
    const cssDir = path.join(siteDir, 'assets/css');
    fs.mkdirSync(cssDir, { recursive: true });
    const block = `\n/* AI fix ${new Date().toISOString()} */\n${cssRules.join('\n')}\n`;
    fs.appendFileSync(path.join(siteDir, FIX_CSS), block);
    applied.pagesLinked = linkFixCss(siteDir);
  }

  applied.styleUpdates = applyStyleUpdates(siteDir, styleUpdates);
  return applied;
}

async function askModel({ prompt, page, context, imageDataUrl }) {
  const apiKey = loadEnvKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set. Add it to the .env file in the project root.');

  const system = `You fix a cloned website from a short user note. You are given the page header/logo HTML, the page content, CSS rules for the header, logo, navbar, or theme, and sometimes the selected image itself.

Return ONLY JSON:
{
  "summary": "what you changed, in one or two sentences",
  "theme": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text": "#hex" },
  "textReplacements": [{ "find": "existing words", "replace": "new words" }],
  "cssRules": ["existing-selector { property: value !important; }"],
  "styleUpdates": [{ "selector": "header .logo img", "style": "max-height: 56px; width: auto; object-fit: contain;" }]
}

Rules:
- Follow the user request exactly. Do not restyle the page when the request is about text or a repeated section.
- Use selectors that already exist in the HTML or CSS. Do not invent class names.
- Logo position, size, and alignment belong in cssRules or styleUpdates, and those selectors must target the logo image only. Do not replace the image file.
- If the user asks to replace or change wording, return "textReplacements": [{ "find": "exact existing words", "replace": "new words" }] and set theme to {}.
- Set theme only when the user asks to change colors, the theme, or the logo. A text change never includes a theme. Otherwise return theme as {}.
- A theme change always restyles the whole page: headings, body text, buttons, links, header, and footer. Do not limit colors to the header or to the selected logo.
- When an image is attached, look at its actual pixels. Pick primary and accent from the logo's main colors. Do not invent colors from the file name.
- Follow the user's wording for which colors to use. Then assign each color to the surface it belongs on. Never swap text and background.
- background is only the page surface. text is only the color of words on that surface.
- If background is light, text must be dark. If background is dark, text must be light.
- text must not equal background, and must not be a close shade of background. The same rule applies to button labels on primary, header and footer labels on secondary, and links on background.
- primary fills buttons. secondary fills the header and footer. accent colors links. Do not reuse the text hex as a fill, and do not reuse a fill hex as text.
- cssRules and styleUpdates must not set color and background-color to the same or similar hex. If a rule sets a background, its text color must contrast with that background.
- cssRules must be one selector and one declaration block. No @import, no url(), no HTML.
- style values are simple CSS lengths, colors, or keywords.
- Use header, nav, and .logo selectors only for moving or resizing the logo. Color changes belong in the theme object.`;

  const user = `User request: ${prompt}

Current page: ${page}
Page title: ${context.title || ''}

Current theme:
${JSON.stringify(context.theme || {}, null, 2)}

Header / logo HTML:
${context.region || '(none found)'}

Page content:
${context.main || '(none found)'}

CSS rules that mention logo, header, navbar, or theme:
${context.css || '(none found)'}

${imageDataUrl ? 'The selected logo or image is attached. Read its colors before choosing a theme.' : 'No image was attached. Change colors only from the written request and the existing theme.'}`;

  const userContent = imageDataUrl
    ? [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ]
    : user;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
  let lastError;
  for (const model of FIX_MODELS) {
    try {
      const body = openAiChatBody({ model, json: true, maxTokens: 4000, messages });
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `OpenAI error (${res.status})`);
      return JSON.parse(stripJsonFences(data.choices?.[0]?.message?.content || '{}'));
    } catch (err) {
      lastError = err;
      if (/api key|incorrect api key|quota|billing|rate limit|insufficient/i.test(err.message)) throw err;
    }
  }
  throw lastError;
}

export async function fixPageWithAI(siteDir, { prompt, page, imageSrc }) {
  const note = String(prompt || '').trim();
  if (!note) throw new Error('Describe what should be fixed.');
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found.');

  const pageFile = safePage(siteDir, page);
  const htmlPath = path.join(siteDir, pageFile);
  if (!fs.existsSync(htmlPath)) throw new Error('Page not found.');

  const parsedReplacement = parseTextReplacement(note);
  const visualChange = asksForVisualChange(note);
  if (parsedReplacement && !visualChange) {
    const textReplacements = applyTextReplacements(siteDir, [parsedReplacement]);
    if (!textReplacements.count) throw new Error(`Could not find “${parsedReplacement.find}” in this project.`);
    return {
      success: true,
      summary: `Replaced “${parsedReplacement.find}” with “${parsedReplacement.replace}” across the project.`,
      page: pageFile,
      imageRead: false,
      applied: { theme: false, cssRules: 0, styleUpdates: 0, textReplacements: textReplacements.count, files: textReplacements.filesChanged },
    };
  }

  if (asksToRemoveRepeat(note)) {
    const current = fs.readFileSync(htmlPath, 'utf8');
    const updated = removeRepeatedSections(current);
    let files = 0;
    if (updated.count) {
      fs.writeFileSync(htmlPath, updated.html);
      files += 1;
    }
    const slug = path.basename(pageFile).replace(/\.html?$/i, '');
    const viewPath = path.join(siteDir, 'views', `${slug}.php`);
    if (fs.existsSync(viewPath)) {
      const view = removeRepeatedSections(fs.readFileSync(viewPath, 'utf8'));
      if (view.count) {
        fs.writeFileSync(viewPath, view.html);
        files += 1;
      }
    }
    if (!updated.count && files === 0) throw new Error('No repeated section was found on this page.');
    const count = updated.count;
    return {
      success: true,
      summary: `Removed ${count} repeated section${count === 1 ? '' : 's'} from this page.`,
      page: pageFile,
      imageRead: false,
      applied: { theme: false, cssRules: 0, styleUpdates: 0, sectionsRemoved: count, files },
    };
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const region = extractRegion(html);
  const imageDataUrl = visualChange
    ? (resolveImageDataUrl(siteDir, pageFile, imageSrc) || resolveImageDataUrl(siteDir, pageFile, region.logoSrc))
    : null;
  const theme = fs.existsSync(path.join(siteDir, 'theme.json')) ? loadTheme(siteDir) : extractTheme(siteDir);
  const plan = await askModel({
    prompt: note,
    page: pageFile,
    imageDataUrl,
    context: {
      title: region.title,
      region: region.region,
      main: (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || [])[1]?.slice(0, 7000) || '',
      css: searchCss(siteDir),
      theme: {
        primary: theme.primary,
        secondary: theme.secondary,
        accent: theme.accent,
        background: theme.background,
        text: theme.text,
      },
    },
  });

  if (!visualChange) {
    plan.theme = {};
    plan.cssRules = [];
    plan.styleUpdates = [];
  }
  const applied = applyFixPlan(siteDir, plan);
  const textReplacements = applyTextReplacements(siteDir, sanitizeTextReplacements(plan.textReplacements));
  applied.textReplacements = textReplacements.count;
  applied.files = textReplacements.filesChanged;
  return {
    success: true,
    summary: plan.summary || 'Fix applied.',
    page: pageFile,
    imageRead: Boolean(imageDataUrl),
    applied,
  };
}
