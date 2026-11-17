import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import * as cheerio from 'cheerio';
import { loadEnvKey, openAiChatBody, OPENAI_CHAT_MODEL, OPENAI_FALLBACK_MODEL, OPENAI_TIMEOUT_MS } from './openai-generate.mjs';
import { loadTheme, applyTheme, extractTheme, listPages } from './site-utils.mjs';
import { applyFullPageTheme } from './fix-with-ai.mjs';

const ASSISTANT_MODEL = OPENAI_CHAT_MODEL;

const LOGO_SELECTORS = [
  'header img', 'nav img', '.logo img', 'img.logo', '#logo',
  '.navbar-brand img', 'a.logo img', '.site-logo img', '.brand img',
  'header a img', '.header-logo img',
];

function findLogoCandidates(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const seen = new Set();
  const logos = [];

  for (const sel of LOGO_SELECTORS) {
    $(sel).each((_, el) => {
      let src = $(el).attr('src');
      // Lazy-loaded logos keep a placeholder in src and the real file in a data attribute.
      if (!src || /^data:|\.svg(\?|$)/i.test(src) && !/logo/i.test(src)) {
        src = LAZY_IMG_ATTRS.map((attr) => $(el).attr(attr)).find(Boolean) || src;
      }
      if (!src || seen.has(src)) return;
      seen.add(src);
      logos.push({
        src,
        lazy: LAZY_IMG_ATTRS.map((attr) => $(el).attr(attr)).find(Boolean) || '',
        alt: $(el).attr('alt') || '',
        selector: sel,
      });
    });
  }

  return logos.slice(0, 8);
}

function stripJsonFences(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (match ? match[1] : trimmed).trim();
}

function resolveLogoForVision(logoUrl, logoBase64, siteDir, folder) {
  if (logoBase64?.startsWith('data:')) return logoBase64;
  if (logoUrl?.startsWith('/cloned/') && folder) {
    const rel = logoUrl.replace(`/cloned/${folder}/`, '');
    const filePath = safeSiteFile(siteDir, rel);
    if (filePath && fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase() || 'png';
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  }
  if (logoUrl?.startsWith('http')) return logoUrl;
  return null;
}

function toSiteRelativeLogoUrl(logoUrl, folder) {
  if (!logoUrl || !folder) return logoUrl;
  if (logoUrl.startsWith(`/cloned/${folder}/`)) {
    return logoUrl.replace(`/cloned/${folder}/`, '');
  }
  return logoUrl;
}

/** Resolve a site-relative logo path, refusing anything that would escape siteDir. */
function safeSiteFile(siteDir, relPath) {
  const rel = String(relPath || '').split('?')[0].replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..') || /^[a-zA-Z]+:\/\//.test(rel)) return null;
  const full = path.resolve(siteDir, rel);
  const root = path.resolve(siteDir);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function promptKeepsExistingTheme(prompt) {
  const text = String(prompt || '').toLowerCase();
  return /not change|do not change|don't change|dont change|keep (the )?(existing|current|original)|existing theme|without changing/.test(text);
}

function promptRecolorsLogoToTheme(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (!/logo color/.test(text) || !/theme/.test(text)) return false;
  if (/theme to (the )?logo|site theme to (the )?logo|match (the )?(whole )?site theme to (the )?logo/.test(text)) return false;
  return true;
}

function promptResizesLogo(prompt) {
  const text = String(prompt || '').toLowerCase();
  return /logo/.test(text) && /size|height|hight|width|tall|smaller|bigger|resize|reduce|fit/.test(text);
}

const HEADER_LOGO_SIZE = `header .logo img {
  height: 70px;
  max-height: 80px;
  width: auto;
  object-fit: contain;
}
@media (max-width: 1024px) {
  header .logo img {
    height: 60px;
    max-height: 70px;
  }
}
@media (max-width: 767px) {
  header .logo img {
    height: 52px;
    max-height: 60px;
  }
}`;

export function applyHeaderLogoSize(siteDir) {
  const start = '/* cloner-logo-size */';
  const end = '/* /cloner-logo-size */';
  const block = `${start}\n${HEADER_LOGO_SIZE}\n${end}\n`;
  let files = 0;
  for (const rel of ['css/style.css', 'assets/css/style.css']) {
    const file = path.join(siteDir, rel);
    if (!fs.existsSync(file)) continue;
    const current = fs.readFileSync(file, 'utf8');
    const pattern = new RegExp(`\\n*/\\* cloner-logo-size \\*/[\\s\\S]*?/\\* /cloner-logo-size \\*/\\n?`);
    const next = pattern.test(current) ? current.replace(pattern, `\n${block}`) : `${current.trimEnd()}\n\n${block}`;
    if (next !== current) fs.writeFileSync(file, next);
    files += 1;
  }
  return files;
}

async function callOpenAI({ prompt, logoUrl, logoImage, context }) {
  const apiKey = loadEnvKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env');

  const system = `You are a website branding assistant. Follow the user's request exactly. Do not add theme or color changes they did not ask for.

Return ONLY valid JSON (no markdown) with this shape:
{
  "summary": "1-2 sentence explanation of what you changed",
  "theme": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "text": "#hex"
  },
  "keepExistingTheme": false,
  "recolorLogoToTheme": false,
  "logoUrl": "new logo URL if the user provided one, otherwise empty",
  "replaceAllLogoSources": true,
  "cssRules": [],
  "suggestions": []
}

Rules:
- The user request wins over these defaults.
- If the user asks to update the logo and change only the logo colors so they match the existing site theme, or says not to change the existing theme: set keepExistingTheme true, set recolorLogoToTheme true, return the current theme hex values unchanged, and set cssRules to [].
- Change theme hex values only when the user explicitly asks to change the site colors, buttons, or theme.
- If the user gives a new logo and also asks to match the site to that logo, then set logoUrl to that exact URL and pick theme colors from the logo.
- background is the page surface and text is the words on that surface. Never swap them or give them the same hex.
- If background is light, text must be dark. If background is dark, text must be light.
- cssRules are optional extra CSS using existing site classes. Use !important. Never set color and background-color to the same or similar hex. Leave cssRules empty when the user said not to change the theme.
- Do not invent image URLs. Do not suggest extra color changes when the user said to leave the theme alone.`;

  const userText = `User request: ${prompt}

Current theme:
${JSON.stringify(context.theme, null, 2)}

Logo images found on site:
${JSON.stringify(context.logos, null, 2)}

Common CSS classes: ${context.commonClasses.join(', ') || 'none'}

Homepage sample (truncated):
${context.mainSample.slice(0, 2000)}`;

  const userContent = logoImage
    ? [
        { type: 'text', text: userText + (logoUrl ? `\n\nNew logo to apply: ${logoUrl}` : '\n\nAnalyze the attached logo image for brand colors.') },
        { type: 'image_url', image_url: { url: logoImage } },
      ]
    : [{ type: 'text', text: userText }];

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
  let model = ASSISTANT_MODEL;
  let res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    body: JSON.stringify(openAiChatBody({
      model,
      json: true,
      maxTokens: 4000,
      messages,
    })),
  });
  let data = await res.json();
  if (!res.ok && /model|not found|does not exist|verify/i.test(data.error?.message || '')) {
    model = OPENAI_FALLBACK_MODEL;
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      body: JSON.stringify(openAiChatBody({
        model,
        json: true,
        maxTokens: 4000,
        messages,
      })),
    });
    data = await res.json();
  }
  if (!res.ok) throw new Error(data.error?.message || `OpenAI error (${res.status})`);

  const raw = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(stripJsonFences(raw));
}

function logoSrcForPage(file, logoUrl) {
  const clean = String(logoUrl || '').split('?')[0].replace(/^\/+/, '');
  const depth = String(file || 'index.html').split('/').filter(Boolean).length - 1;
  return `${depth > 0 ? '../'.repeat(depth) : ''}${clean}`;
}

export function recolorLogoToTheme(filePath, theme) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const primary = theme?.primary || '#513f29';
  const secondary = theme?.secondary || '#ff6900';
  const script = `
import sys, colorsys
from PIL import Image
path, primary, secondary = sys.argv[1], sys.argv[2], sys.argv[3]

def hue_sat(hex_color):
    h = hex_color.lstrip('#')
    r, g, b = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    hh, _ll, ss = colorsys.rgb_to_hls(r, g, b)
    return hh, ss

primary_h, primary_s = hue_sat(primary)
secondary_h, secondary_s = hue_sat(secondary)
im = Image.open(path).convert('RGBA')
px = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a < 8:
            continue
        hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if ss < 0.18:
            continue
        if ll > 0.45:
            target_h, target_s = secondary_h, max(ss * 0.9, min(secondary_s, 0.85))
        else:
            target_h, target_s = primary_h, max(min(ss, 0.55), primary_s)
        nr, ng, nb = colorsys.hls_to_rgb(target_h, ll, target_s)
        px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
im.save(path, format='PNG')
`;
  const result = spawnSync('python3', ['-c', script, filePath, primary, secondary], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Could not recolor the logo to the site theme.');
  }
  return true;
}

// Lazy-load scripts copy these attributes into src at runtime, which would put the old logo back.
const LAZY_IMG_ATTRS = ['data-imgurl', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy'];

function pointImageAt($el, url) {
  $el.attr('src', url);
  for (const attr of LAZY_IMG_ATTRS) {
    if ($el.attr(attr) !== undefined) $el.attr(attr, url);
  }
  $el.removeAttr('srcset');
  $el.removeAttr('data-srcset');
}

function replaceLogosInHtml(html, oldSources, newLogoUrl) {
  if (!newLogoUrl) return html;
  const $ = cheerio.load(html, { decodeEntities: false });
  let count = 0;

  const shouldReplace = (src) => {
    if (!src) return false;
    if (oldSources.length === 0) return LOGO_SELECTORS.some((sel) => false);
    return oldSources.some((old) => src === old || src.includes(old) || old.includes(src));
  };

  $('img').each((_, el) => {
    const src = $(el).attr('src');
    const lazySrc = LAZY_IMG_ATTRS.map((attr) => $(el).attr(attr)).find(Boolean);
    const inHeader = $(el).closest('header, nav, .navbar, .header').length > 0;
    const isLogoClass = /logo|brand/i.test($(el).attr('class') || '') || /logo|brand/i.test($(el).attr('alt') || '');
    // Lazy images can share the logo as a placeholder src while their real picture sits in
    // a data attribute. Those are not logos — leave them alone.
    const lazyIsOtherImage = lazySrc && !shouldReplace(lazySrc) && !(inHeader || isLogoClass);
    if (inHeader || isLogoClass || ((shouldReplace(src) || shouldReplace(lazySrc)) && !lazyIsOtherImage)) {
      pointImageAt($(el), newLogoUrl);
      count++;
    }
  });

  if (count === 0 && oldSources.length) {
    oldSources.forEach((old) => {
      $('img[src]').each((_, el) => {
        if ($(el).attr('src') === old) {
          pointImageAt($(el), newLogoUrl);
          count++;
        }
      });
    });
  }

  return { html: $.html(), count };
}

function appendCssRules(siteDir, rules) {
  if (!rules?.length) return;
  const cssDir = path.join(siteDir, 'assets/css');
  if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true });
  const cssPath = path.join(cssDir, 'cloner-ai-custom.css');
  const block = `\n/* AI customization ${new Date().toISOString()} */\n${rules.join('\n')}\n`;
  fs.appendFileSync(cssPath, block);

  const linkHref = 'assets/css/cloner-ai-custom.css';
  listPages(siteDir).forEach(({ file }) => {
    const filePath = path.join(siteDir, file);
    let html = fs.readFileSync(filePath, 'utf8');
    if (!html.includes('cloner-ai-custom.css') && html.includes('</head>')) {
      html = html.replace('</head>', `  <link rel="stylesheet" href="${linkHref}">\n</head>`);
      fs.writeFileSync(filePath, html);
    }
  });
}

export async function customizeSiteWithAI(siteDir, { prompt, logoUrl, logoBase64, folder }) {
  if (!prompt?.trim()) throw new Error('Please describe what you want to change.');

  const indexPath = path.join(siteDir, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error('index.html not found.');

  const html = fs.readFileSync(indexPath, 'utf8');
  const theme = fs.existsSync(path.join(siteDir, 'theme.json')) ? loadTheme(siteDir) : extractTheme(siteDir);
  const logos = findLogoCandidates(html);
  const oldSources = logos.flatMap((l) => [l.src, l.lazy]).filter(Boolean);

  const rawLogoUrl = logoUrl?.trim() || '';
  const siteLogoUrl = toSiteRelativeLogoUrl(rawLogoUrl, folder);
  let logoImage = resolveLogoForVision(rawLogoUrl, logoBase64, siteDir, folder);

  // "Match the theme to the logo" with no logo attached: read the site's current
  // header logo instead of letting the model guess colors from the old theme.
  if (!logoImage && folder && /\b(logo|brand)/i.test(prompt)) {
    for (const { src } of logos) {
      if (/^(https?:)?\/\//i.test(src) || /\.svg(\?|$)/i.test(src)) continue;
      const rel = src.split('?')[0].replace(/^\/+/, '');
      logoImage = resolveLogoForVision(`/cloned/${folder}/${rel}`, '', siteDir, folder);
      if (logoImage) break;
    }
  }

  const ai = await callOpenAI({
    prompt: prompt.trim(),
    logoUrl: siteLogoUrl,
    logoImage,
    context: {
      theme,
      logos,
      commonClasses: theme.commonClasses || [],
      mainSample: html.slice(0, 4000),
    },
  });

  const applied = { theme: false, logos: 0, cssRules: 0, pages: [], logoRecolored: false, logoResized: false };
  const finalLogo = siteLogoUrl || toSiteRelativeLogoUrl(ai.logoUrl?.trim() || '', folder);
  const keepTheme = promptKeepsExistingTheme(prompt) || ai.keepExistingTheme === true;
  const recolorLogo = promptRecolorsLogoToTheme(prompt) || ai.recolorLogoToTheme === true;

  if (!keepTheme && ai.theme && Object.keys(ai.theme).length) {
    applyTheme(siteDir, ai.theme);
    applyFullPageTheme(siteDir, loadTheme(siteDir));
    applied.theme = true;
  }

  if (recolorLogo && finalLogo) {
    const logoFile = safeSiteFile(siteDir, finalLogo);
    if (logoFile && fs.existsSync(logoFile)) {
      recolorLogoToTheme(logoFile, theme);
      applied.logoRecolored = true;
    }
  }

  if (finalLogo) {
    const pages = listPages(siteDir);
    for (const { file } of pages) {
      const filePath = path.join(siteDir, file);
      let pageHtml = fs.readFileSync(filePath, 'utf8');
      const result = replaceLogosInHtml(pageHtml, oldSources, logoSrcForPage(file, finalLogo));
      if (result.count > 0) {
        fs.writeFileSync(filePath, result.html);
        applied.logos += result.count;
        applied.pages.push(file);
      }
    }
    applied.logos += updateIncludeLogos(siteDir, finalLogo, oldSources);
  }

  const cssRules = keepTheme ? [] : (ai.cssRules || []).filter((rule) => !/logo/i.test(rule));
  if (promptResizesLogo(prompt)) {
    applyHeaderLogoSize(siteDir);
    applied.logoResized = true;
  }
  if (cssRules.length) {
    appendCssRules(siteDir, cssRules);
    applied.cssRules = cssRules.length;
  }

  const summary = keepTheme && recolorLogo && applied.logoResized
    ? 'Recolored the logo to the existing site theme and set the header logo to 70px tall on desktop and 52px on mobile. The site theme was left unchanged.'
    : keepTheme && recolorLogo
      ? 'Updated the logo and recolored it to the existing site theme. The site theme was left unchanged.'
      : applied.logoResized
        ? 'Set the header logo to 70px tall on desktop and 52px on mobile, with the width following the logo shape.'
        : (ai.summary || 'Customization applied.');

  return {
    summary,
    suggestions: keepTheme ? [] : (ai.suggestions || []),
    applied,
    theme: keepTheme ? theme : (ai.theme || null),
  };
}

function updateIncludeLogos(siteDir, logoUrl, oldSources = []) {
  const fileName = path.basename(logoUrl.split('?')[0]);
  const absolute = `/images/${fileName}`;
  const knownOld = new Set(oldSources.filter(Boolean));
  let count = 0;

  const rewriteTag = (tag, isShell) => {
    const attrOf = (attr) => tag.match(new RegExp(`\\b${attr}="([^"]*)"`, 'i'))?.[1];
    const src = attrOf('src') || '';
    const lazy = LAZY_IMG_ATTRS.map(attrOf).find(Boolean) || '';
    const isLogoFile = (value) => knownOld.has(value) || (isShell && /logo|upload_/i.test(value));
    // With a lazy attribute the real picture is there; src is only a placeholder.
    const looksLikeLogo = lazy ? isLogoFile(lazy) : isLogoFile(src);
    if (!looksLikeLogo) return tag;
    count += 1;
    let next = tag.replace(/\bsrc="[^"]*"/i, `src="${absolute}"`);
    for (const attr of LAZY_IMG_ATTRS) {
      next = next.replace(new RegExp(`\\b${attr}="[^"]*"`, 'i'), `${attr}="${absolute}"`);
    }
    return next.replace(/\s(?:srcset|data-srcset)="[^"]*"/gi, '');
  };

  for (const dirName of ['includes', 'views']) {
    const dir = path.join(siteDir, dirName);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/\.php$/i.test(name)) continue;
      const isShell = dirName === 'includes' && /^(header|footer)\.php$/i.test(name);
      const filePath = path.join(dir, name);
      const html = fs.readFileSync(filePath, 'utf8');
      const next = html.replace(/<img\b[^>]*>/gi, (tag) => rewriteTag(tag, isShell));
      if (next !== html) fs.writeFileSync(filePath, next);
    }
  }
  return count;
}
