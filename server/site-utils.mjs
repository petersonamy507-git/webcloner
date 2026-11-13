import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const HEX_RE = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)/gi;
const SKIP_COLORS = new Set([
  '#000', '#000000', '#fff', '#ffffff', '#111', '#111111', '#222', '#333', '#444', '#555',
  '#666', '#777', '#888', '#999', '#aaa', '#bbb', '#ccc', '#ddd', '#eee', '#f8f9fa', '#e9ecef',
]);
const BOOTSTRAP_DEFAULTS = new Set([
  '#0d6efd', '#6c757d', '#212529', '#dc3545', '#198754', '#0dcaf0', '#ffc107', '#dee2e6',
  '#f8f9fa', '#e9ecef', '#d63384', '#20c997', '#fd7e14', '#6610f2', '#3778b9', '#212326',
]);

function normalizeHex(hex) {
  if (!hex) return '';
  let h = hex.toLowerCase();
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

function collectCssFiles(dir, base = dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'external'].includes(entry.name)) files.push(...collectCssFiles(full, base));
    } else if (entry.name.endsWith('.css')) {
      files.push(full);
    }
  }
  return files;
}

function rgbToHex(r, g, b) {
  // Mixed colors arrive as floats, so channels are rounded and clamped to 00..ff.
  return `#${[r, g, b]
    .map((x) => Math.max(0, Math.min(255, Math.round(Number(x) || 0))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function countColors(text) {
  const counts = new Map();
  for (const raw of text.match(HEX_RE) || []) {
    const hex = normalizeHex(raw);
    if (SKIP_COLORS.has(hex) || BOOTSTRAP_DEFAULTS.has(hex)) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  let m;
  const rgbRe = new RegExp(RGB_RE.source, 'gi');
  while ((m = rgbRe.exec(text)) !== null) {
    const hex = normalizeHex(rgbToHex(m[1], m[2], m[3]));
    if (SKIP_COLORS.has(hex) || BOOTSTRAP_DEFAULTS.has(hex)) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return counts;
}

function topColors(counts, limit = 8) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([color, count]) => ({ color, count }));
}

function hexToRgbParts(hex) {
  const h = normalizeHex(hex).slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function colorStats(hex) {
  const { r, g, b } = hexToRgbParts(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    sat: max === 0 ? 0 : (max - min) / max,
    luma: (r * 299 + g * 587 + b * 114) / 1000,
  };
}

function isBrandColor(hex) {
  const { sat, luma } = colorStats(hex);
  return sat >= 0.35 && luma > 12 && luma < 210;
}

function channelLuma(value) {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgbParts(hex);
  return (0.2126 * channelLuma(r)) + (0.7152 * channelLuma(g)) + (0.0722 * channelLuma(b));
}

export function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function mixHex(from, to, amount) {
  const a = hexToRgbParts(from);
  const b = hexToRgbParts(to);
  return rgbToHex(
    a.r + ((b.r - a.r) * amount),
    a.g + ((b.g - a.g) * amount),
    a.b + ((b.b - a.b) * amount),
  );
}

/** Keep a theme color, shifting it only until text is readable on its background. */
export function withContrast(color, background, min = 4.5) {
  const bg = normalizeHex(background) || '#ffffff';
  const fg = normalizeHex(color) || (relativeLuminance(bg) > 0.4 ? '#111111' : '#ffffff');
  if (contrastRatio(fg, bg) >= min) return fg;
  const target = relativeLuminance(bg) > 0.4 ? '#111111' : '#ffffff';
  for (let step = 1; step <= 8; step += 1) {
    const next = mixHex(fg, target, step / 8);
    if (contrastRatio(next, bg) >= min) return next;
  }
  const dark = contrastRatio('#111111', bg);
  const light = contrastRatio('#ffffff', bg);
  return dark >= light ? '#111111' : '#ffffff';
}

function replaceColorEverywhere(text, from, to) {
  if (!from || !to || normalizeHex(from) === normalizeHex(to)) return { text, count: 0 };
  let count = 0;
  let result = text;
  const fromNorm = normalizeHex(from);
  const toNorm = normalizeHex(to);

  result = result.replace(new RegExp(fromNorm.replace('#', '\\#'), 'gi'), () => { count++; return toNorm; });

  const { r, g, b } = hexToRgbParts(fromNorm);
  const { r: nr, g: ng, b: nb } = hexToRgbParts(toNorm);
  const rgbVariants = [
    [new RegExp(`rgb\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*\\)`, 'gi'), `rgb(${nr}, ${ng}, ${nb})`],
    [new RegExp(`rgba\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*,`, 'gi'), `rgba(${nr}, ${ng}, ${nb},`],
  ];
  for (const [re, rep] of rgbVariants) {
    result = result.replace(re, () => { count++; return rep; });
  }
  return { text: result, count };
}

function applyColorMapping(text, mapping) {
  const pairs = Object.entries(mapping)
    .map(([from, to]) => ({ from: normalizeHex(from), to: normalizeHex(to) }))
    .filter((pair) => pair.from && pair.to && pair.from !== pair.to);
  if (!pairs.length) return { text, count: 0 };

  let result = text;
  let count = 0;
  const staged = pairs.map((pair, index) => ({
    ...pair,
    hexToken: `\u0000H${index}\u0000`,
    rgbToken: `\u0000R${index}\u0000`,
    rgbaToken: `\u0000A${index}\u0000`,
  }));

  for (const item of staged) {
    result = result.replace(new RegExp(item.from.replace('#', '\\#'), 'gi'), () => {
      count += 1;
      return item.hexToken;
    });
    const { r, g, b } = hexToRgbParts(item.from);
    result = result.replace(new RegExp(`rgba\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*,`, 'gi'), () => {
      count += 1;
      return item.rgbaToken;
    });
    result = result.replace(new RegExp(`rgb\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*\\)`, 'gi'), () => {
      count += 1;
      return item.rgbToken;
    });
  }

  for (const item of staged) {
    const { r, g, b } = hexToRgbParts(item.to);
    result = result.split(item.hexToken).join(item.to);
    result = result.split(item.rgbToken).join(`rgb(${r}, ${g}, ${b})`);
    result = result.split(item.rgbaToken).join(`rgba(${r}, ${g}, ${b},`);
  }
  return { text: result, count };
}

function injectOverridesLink(siteDir) {
  const linkHref = 'assets/css/cloner-theme-overrides.css';
  const htmlFiles = fs.readdirSync(siteDir).filter((f) => /\.html?$/i.test(f));
  for (const file of htmlFiles) {
    const filePath = path.join(siteDir, file);
    let html = fs.readFileSync(filePath, 'utf8');
    if (html.includes('cloner-theme-overrides.css')) continue;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `  <link rel="stylesheet" href="${linkHref}">\n</head>`);
      fs.writeFileSync(filePath, html);
    }
  }
}

const THEME_FORM_CLASSES = new Set(['form-btn', 'bnr-form-btn', 'form-btn', 'formcontainer']);

function writeThemeOverrides(siteDir, theme, commonClasses = []) {
  const btnClasses = commonClasses.filter(
    (c) => /btn|button/i.test(c) && !THEME_FORM_CLASSES.has(c) && c !== 'btn'
  );
  const bgClasses = commonClasses.filter((c) => /^bg_/i.test(c));
  const onPrimary = withContrast('#ffffff', theme.primary);
  const onSecondary = withContrast('#ffffff', theme.secondary);
  const lines = [
    '/* Cloner theme overrides — auto-generated (header/nav only) */',
    `:root { --cloner-primary: ${theme.primary}; --cloner-secondary: ${theme.secondary}; --cloner-accent: ${theme.accent}; }`,
  ];
  btnClasses.slice(0, 12).forEach((c) => {
    lines.push(
      `.header-main .${c}, .navbar .${c}, .cta-btn > .${c}, nav .${c} { background-color: ${theme.primary} !important; border-color: ${theme.primary} !important; color: ${onPrimary} !important; }`
    );
  });
  bgClasses.slice(0, 8).forEach((c) => {
    lines.push(`.header-main .${c}, .navbar .${c} { background-color: ${theme.secondary} !important; color: ${onSecondary} !important; }`);
  });
  lines.push(`.header-main a, .navbar a, nav a { color: ${onSecondary}; }`);

  const cssDir = path.join(siteDir, 'assets/css');
  if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true });
  fs.writeFileSync(path.join(cssDir, 'cloner-theme-overrides.css'), lines.join('\n'));
  injectOverridesLink(siteDir);
}

/** Regenerate safe theme overrides for an existing clone */
export function rewriteSafeThemeOverrides(siteDir) {
  const theme = loadTheme(siteDir);
  writeThemeOverrides(siteDir, theme, theme.commonClasses || []);
}

export function getThemePath(siteDir) {
  return path.join(siteDir, 'theme.json');
}

export function loadTheme(siteDir) {
  const themePath = getThemePath(siteDir);
  if (fs.existsSync(themePath)) {
    try {
      return JSON.parse(fs.readFileSync(themePath, 'utf8'));
    } catch { /* fall through */ }
  }
  return extractTheme(siteDir);
}

export function extractTheme(siteDir) {
  const indexPath = path.join(siteDir, 'index.html');
  const html = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  const $ = cheerio.load(html, { decodeEntities: false });

  const counts = new Map();
  for (const file of collectCssFiles(siteDir)) {
    const css = fs.readFileSync(file, 'utf8');
    const name = file.replace(/\\/g, '/');
    const weight = /bootstrap/i.test(name) || name.includes('/external/')
      ? 0
      : /(?:^|\/)(style|home|custom|main)\.css$/i.test(name)
        ? 40
        : name.includes('/assets/')
          ? 8
          : 4;
    for (const [c, n] of countColors(css)) {
      counts.set(c, (counts.get(c) || 0) + n * weight);
    }
  }
  for (const [c, n] of countColors(html)) {
    counts.set(c, (counts.get(c) || 0) + n * 3);
  }

  const ranked = topColors(counts, 24);
  const brands = ranked.filter((p) => isBrandColor(p.color));
  const lights = ranked.filter((p) => colorStats(p.color).luma >= 225);
  const darks = ranked.filter((p) => colorStats(p.color).luma <= 55);
  const palette = [
    ...brands.slice(0, 6).map((p) => p.color),
    ...darks.slice(0, 1).map((p) => p.color),
    ...lights.slice(0, 1).map((p) => p.color),
  ];
  const fonts = new Set();
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('fonts.googleapis.com')) fonts.add(href);
  });

  const classes = new Set();
  $('[class]').each((_, el) => {
    ($(el).attr('class') || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
  });

  const commonClasses = [...classes].filter((c) => /btn|button|section|hero|container|card|heading|title|global|bg_|text_/i.test(c)).slice(0, 40);
  const primary = brands[0]?.color || '#1d4ed8';
  const secondary = brands[1]?.color || darks[0]?.color || primary;
  const accent = brands[2]?.color || brands[0]?.color || '#f59e0b';
  const background = lights[0]?.color || '#ffffff';
  const text = darks[0]?.color || '#111827';

  const theme = {
    primary,
    secondary,
    accent,
    background,
    text,
    palette,
    sources: { primary, secondary, accent, background, text },
    fonts: [...fonts],
    commonClasses,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(getThemePath(siteDir), JSON.stringify(theme, null, 2));
  return theme;
}

function themeContentFiles(siteDir) {
  const files = listPages(siteDir).map((page) => page.file);
  for (const dir of ['views', 'includes']) {
    const full = path.join(siteDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (!name.endsWith('.php')) continue;
      if (['token.php', 'ppc_or_seo.php', 'get-dashboard.php'].includes(name)) continue;
      files.push(`${dir}/${name}`);
    }
  }
  return files;
}

function themeAssetHref(pageFile) {
  const depth = Math.max(0, pageFile.split('/').filter(Boolean).length - 1);
  return `${depth ? '../'.repeat(depth) : ''}assets/css/cloner-site-theme.css`;
}

function linkSiteTheme(siteDir) {
  const marker = 'cloner-site-theme.css';
  for (const file of themeContentFiles(siteDir)) {
    const filePath = path.join(siteDir, file);
    if (!fs.existsSync(filePath)) continue;
    let html = fs.readFileSync(filePath, 'utf8');
    if (html.includes(marker) || !html.includes('</head>')) continue;
    const href = file.endsWith('.php') ? '/assets/css/cloner-site-theme.css' : themeAssetHref(file);
    html = html.replace('</head>', `  <link rel="stylesheet" href="${href}">\n</head>`);
    fs.writeFileSync(filePath, html);
  }
}

function writeSiteTheme(siteDir, theme, commonClasses = []) {
  const background = normalizeHex(theme.background) || '#ffffff';
  const primary = normalizeHex(theme.primary) || '#1d4ed8';
  const secondary = normalizeHex(theme.secondary) || primary;
  const text = withContrast(theme.text || '#111111', background);
  const heading = withContrast(primary, background);
  const accent = withContrast(theme.accent || primary, background);
  const onPrimary = withContrast('#ffffff', primary);
  const onSecondary = withContrast('#ffffff', secondary);
  const buttonClasses = commonClasses.filter((c) => /btn|button/i.test(c) && !THEME_FORM_CLASSES.has(c) && !/close/i.test(c));
  const bgClasses = commonClasses.filter((c) => /^bg_/i.test(c));
  const buttonSel = [
    'button',
    '.btn',
    'input[type="submit"]',
    'input[type="button"]',
    ...buttonClasses.flatMap((c) => [`.${c}`, `button.${c}`, `.button_wrap .${c}`, `.${c}:hover`, `button.${c}:hover`]),
  ].join(', ');
  const lines = [
    '/* Site theme — full page */',
    `body { background-color: ${background} !important; color: ${text} !important; }`,
    `h1, h2, h3, h4, h5, h6 { color: ${heading} !important; }`,
    `header, nav, footer, .header_wrap, .navbar, .footer { background-color: ${secondary} !important; color: ${onSecondary} !important; }`,
    `header a, nav a, .header_wrap a, .navbar a, footer a, .footer a { color: ${onSecondary} !important; }`,
    `${buttonSel} { background-color: ${primary} !important; border-color: ${primary} !important; color: ${onPrimary} !important; }`,
  ];
  if (bgClasses.length) {
    lines.push(`${bgClasses.map((c) => `.${c}`).join(', ')} { background-color: ${secondary} !important; color: ${onSecondary} !important; }`);
  }
  lines.push(`a { color: ${accent}; }`);
  const cssDir = path.join(siteDir, 'assets/css');
  fs.mkdirSync(cssDir, { recursive: true });
  fs.writeFileSync(path.join(cssDir, 'cloner-site-theme.css'), `${lines.join('\n')}\n`);
  linkSiteTheme(siteDir);
}

export function applyTheme(siteDir, input) {
  const current = loadTheme(siteDir);
  const sources = current.sources || {
    primary: current.primary,
    secondary: current.secondary,
    accent: current.accent,
    background: current.background,
    text: current.text,
  };

  const next = {
    primary: normalizeHex(input.primary || current.primary),
    secondary: normalizeHex(input.secondary || current.secondary),
    accent: normalizeHex(input.accent || current.accent),
    background: normalizeHex(input.background || current.background),
    text: normalizeHex(input.text || current.text),
  };
  next.text = normalizeHex(next.text);
  next.accent = normalizeHex(next.accent || next.primary);

  const mapping = {};
  for (const key of ['primary', 'secondary', 'accent', 'background', 'text']) {
    const from = normalizeHex(sources[key]);
    const to = normalizeHex(next[key]);
    if (from && to && from !== to) mapping[from] = to;
  }

  let replacements = 0;
  let filesChanged = 0;

  if (Object.keys(mapping).length) {
    for (const file of collectCssFiles(siteDir)) {
      if (file.includes('cloner-theme-overrides.css') || file.includes('cloner-ai-page-theme.css') || file.includes('cloner-ai-fix.css')) continue;
      let css = fs.readFileSync(file, 'utf8');
      const kept = [];
      const parked = css.replace(/\/\* cloner-logo-size \*\/[\s\S]*?\/\* \/cloner-logo-size \*\//g, (block) => {
        const token = `\u0000LOGO${kept.length}\u0000`;
        kept.push(block);
        return token;
      });
      const result = applyColorMapping(parked, mapping);
      result.text = kept.reduce((text, block, index) => text.replace(`\u0000LOGO${index}\u0000`, block), result.text);
      if (result.count) {
        replacements += result.count;
        fs.writeFileSync(file, result.text);
        filesChanged++;
      }
    }

    for (const file of themeContentFiles(siteDir)) {
      const filePath = path.join(siteDir, file);
      if (!fs.existsSync(filePath)) continue;
      const html = fs.readFileSync(filePath, 'utf8');
      const result = applyColorMapping(html, mapping);
      if (result.count) {
        replacements += result.count;
        fs.writeFileSync(filePath, result.text);
        filesChanged++;
      }
    }
  }

  // A previous "Fix with AI" theme writes hard-coded !important colors here, linked after
  // the site CSS. Left in place it overrides every later theme change, so reset it.
  // (Fix with AI rewrites this file right after applyTheme with the new colors.)
  const pageThemeCss = path.join(siteDir, 'assets/css/cloner-ai-page-theme.css');
  if (fs.existsSync(pageThemeCss)) {
    fs.writeFileSync(pageThemeCss, '/* Reset: the site theme changed. */\n');
  }

  const themeOut = {
    ...current,
    ...next,
    original: current.original || sources,
    sources: next,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getThemePath(siteDir), JSON.stringify(themeOut, null, 2));

  return { theme: themeOut, filesChanged, replacements, mapping };
}

function isCatMenuBinder(html) {
  return /querySelector\(\s*['"]\.dropdown-toggle['"]\s*\)/.test(html || '')
    && /addEventListener\(\s*['"]click['"]/.test(html || '');
}

const CLONER_MAIN_MARK = '<!--CLONER_MAIN-->';

function nodeSig($, el) {
  const node = $(el);
  return `${node.get(0)?.tagName || ''} ${node.attr('id') || ''} ${node.attr('class') || ''}`;
}

function isFooterChrome($, el) {
  if (!el) return false;
  const node = $(el);
  if (node.is('footer')) return true;
  return /(?:^|[\s_-])(?:footer|m-footer|scnd-ftr|copyright|footer_bottom|site-footer|main_footer|footer-bottom)(?:$|[\s_-])/i
    .test(nodeSig($, el));
}

function isContentEndChrome($, el) {
  if (!el) return true;
  const node = $(el);
  const tag = String(node.get(0)?.tagName || '').toLowerCase();
  if (/^(script|style|link|noscript)$/i.test(tag)) return true;
  if (isFooterChrome($, el)) return true;
  // Popups / sticky widgets belong to site chrome, not page body copy
  return /popup|modal|floatbutton|overlay|cookie|trust_img|mypopup|bg-overlay|cus-overlay/i
    .test(nodeSig($, el));
}

/**
 * Build a full body shell with <!--CLONER_MAIN--> where page sections go.
 * Keeps marquee, wrapper divs (e.g. back-bg), header(s), footer bands,
 * popups, and scripts — same chrome other cloned pages use.
 */
function extractShellParts(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const headHtml = $('head').html() || '';
  const bodyClass = $('body').attr('class') || '';

  const $main = $('body main').first();
  let mainSample = '';
  const removed = [];

  const stripOrphanHomeBlocks = () => {
    // When <main> is nested, home heroes/sections can still sit as body siblings — drop them.
    for (const el of $('body').children().toArray()) {
      const node = $(el);
      const tag = String(el.tagName || '').toLowerCase();
      if (/^(header|footer|marquee|script|style|link|noscript)$/i.test(tag)) continue;
      const chunk = $.html(node) || '';
      if (chunk.includes(CLONER_MAIN_MARK)) continue;
      if (isFooterChrome($, el)) continue;
      if (/popup|modal|floatbutton|overlay|cookie|trust_img|mypopup|bg-overlay|cus-overlay/i.test(nodeSig($, el))) continue;
      if (/^(section|div|article)$/i.test(tag)) node.remove();
    }
  };

  if ($main.length) {
    mainSample = ($main.html() || '').slice(0, 12000);
    $main.replaceWith(CLONER_MAIN_MARK);
    stripOrphanHomeBlocks();
  } else {
    const $headers = $('body').find('header');
    let $header = $headers.first();
    // Body-level root that owns the header (header itself, or a wrapper like .back-bg)
    let $root = $header;
    while ($root.length && !$root.parent().is('body') && $root.parent().length) {
      $root = $root.parent();
    }

    if ($header.length && $root.length && !$root.is('header') && $root.children('header').length) {
      // Wrapper page: replace siblings after the last header inside the wrapper
      const headersInRoot = $root.children('header');
      const $lastHeader = headersInRoot.last().length ? headersInRoot.last() : $header;
      let node = $lastHeader.next();
      while (node.length) {
        const next = node.next();
        removed.push(node);
        node = next;
      }
      if (removed.length) {
        mainSample = removed.slice(0, 8).map((n) => $.html(n)).join('\n').slice(0, 12000);
        $lastHeader.after(CLONER_MAIN_MARK);
        removed.forEach((n) => n.remove());
      } else {
        $lastHeader.after(CLONER_MAIN_MARK);
      }
    } else if ($header.length) {
      // Body-level headers: drop page sections between header cluster and footer chrome
      let node = $('body').children().first();
      // Skip preamble (marquee) and consecutive headers + binder style/script
      while (node.length) {
        const tag = String(node.get(0)?.tagName || '').toLowerCase();
        if (node.is('header') || tag === 'marquee') {
          node = node.next();
          continue;
        }
        if (/^(style|script)$/i.test(tag)) {
          node = node.next();
          continue;
        }
        break;
      }
      const content = [];
      while (node.length && !isContentEndChrome($, node)) {
        content.push(node);
        node = node.next();
      }
      if (content.length) {
        mainSample = content.slice(0, 8).map((n) => $.html(n)).join('\n').slice(0, 12000);
        content[0].before(CLONER_MAIN_MARK);
        content.forEach((n) => n.remove());
      } else {
        // Insert after last leading header
        const $last = $('body > header').last();
        if ($last.length) $last.after(CLONER_MAIN_MARK);
        else $('body').prepend(CLONER_MAIN_MARK);
      }
    } else {
      // No header: try nav, else prepend
      const $nav = $('body nav').first();
      if ($nav.length) $nav.after(CLONER_MAIN_MARK);
      else $('body').prepend(CLONER_MAIN_MARK);
      mainSample = $('section').toArray().slice(0, 6).map((el) => $.html(el)).join('\n').slice(0, 12000);
    }
  }

  // Legacy slices for design brief / debugging (full chrome, not just <header>/<footer> tags)
  const bodyHtml = $('body').html() || '';
  const markAt = bodyHtml.indexOf(CLONER_MAIN_MARK);
  const headerHtml = markAt >= 0 ? bodyHtml.slice(0, markAt) : ($('header').first().length ? $.html($('header').first()) : '');
  const after = markAt >= 0 ? bodyHtml.slice(markAt + CLONER_MAIN_MARK.length) : '';
  const footerHtml = after;

  const bodyScripts = [];
  $('body script[src]').each((_, el) => {
    bodyScripts.push($.html(el));
  });

  const inlineScripts = [];
  let keptCatMenu = false;
  $('body script:not([src])').each((_, el) => {
    const block = $.html(el);
    if (isCatMenuBinder(block)) {
      if (keptCatMenu) return;
      keptCatMenu = true;
    }
    inlineScripts.push(block);
  });

  return {
    headHtml,
    headerHtml,
    headerExtras: '',
    footerHtml,
    bodyScripts,
    inlineScripts: inlineScripts.join('\n'),
    mainSample,
    bodyClass,
    bodyShell: bodyHtml.includes(CLONER_MAIN_MARK) ? bodyHtml : `${headerHtml}\n${CLONER_MAIN_MARK}\n${footerHtml}`,
  };
}

function sanitizePageName(name) {
  let file = (name || 'page').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  if (!file.endsWith('.html')) file += '.html';
  return path.basename(file);
}

function pageLabel(file) {
  if (file === 'index.html') return 'Home';
  const name = file.replace(/\/index\.html?$/i, '').replace(/\.html?$/i, '');
  const last = name.split('/').pop() || name;
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function collectHtmlFiles(dir, base = dir) {
  const pages = [];
  if (!fs.existsSync(dir)) return pages;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['external', 'node_modules'].includes(entry.name)) continue;
      pages.push(...collectHtmlFiles(full, base));
    } else if (/\.html?$/i.test(entry.name)) {
      pages.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return pages;
}

export function listPages(siteDir) {
  return collectHtmlFiles(siteDir)
    .map((file) => ({ file, label: pageLabel(file) }))
    .sort((a, b) => {
      if (a.file === 'index.html') return -1;
      if (b.file === 'index.html') return 1;
      return a.file.localeCompare(b.file);
    });
}

export function buildPageHtml({ baseHtml, pageTitle, mainContent, metaDescription = '' }) {
  const parts = extractShellParts(baseHtml);
  const title = pageTitle || 'New Page';
  let head = parts.headHtml.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  if (metaDescription && !/name=["']description["']/i.test(head)) {
    head += `\n<meta name="description" content="${metaDescription.replace(/"/g, '&quot;')}">`;
  } else if (metaDescription) {
    head = head.replace(
      /<meta\b[^>]*name=["']description["'][^>]*>/i,
      `<meta name="description" content="${metaDescription.replace(/"/g, '&quot;')}">`,
    );
  }

  const main = mainContent || `
<section class="container py-5">
  <h1>${title}</h1>
  <p class="lead">Add your content here.</p>
</section>`;

  const mainBlock = `<main data-cloner-page="main" class="cloner-generated-page">
${main}
</main>`;

  // Preserve the clone's real body chrome (marquee, wrappers, footers, popups, scripts).
  let body = String(parts.bodyShell || '');
  if (body.includes(CLONER_MAIN_MARK)) {
    body = body.replace(CLONER_MAIN_MARK, mainBlock);
  } else {
    body = `${parts.headerHtml || ''}\n${mainBlock}\n${parts.footerHtml || ''}`;
  }

  // Avoid duplicating scripts that are already in the shell.
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head}
</head>
<body class="${parts.bodyClass}">
${body}
</body>
</html>`;
}

export function createPage(siteDir, { pageName, template = 'shell', title, description }) {
  const file = sanitizePageName(pageName);
  if (file === 'index.html' && template !== 'copy') {
    throw new Error('Use a different name — index.html already exists.');
  }

  const target = path.join(siteDir, file);
  if (fs.existsSync(target)) throw new Error(`Page "${file}" already exists.`);

  const indexPath = path.join(siteDir, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error('index.html not found in clone folder.');

  const baseHtml = fs.readFileSync(indexPath, 'utf8');
  const pageTitle = title || pageLabel(file);

  let html;
  if (template === 'copy') {
    html = baseHtml.replace(/<title>[^<]*<\/title>/i, `<title>${pageTitle}</title>`);
  } else if (template === 'blank') {
    html = buildPageHtml({
      baseHtml,
      pageTitle,
      mainContent: `<section class="container py-5"><h1>${pageTitle}</h1></section>`,
      metaDescription: description,
    });
  } else {
    html = buildPageHtml({
      baseHtml,
      pageTitle,
      metaDescription: description,
    });
  }

  fs.writeFileSync(target, html);
  return { file, label: pageLabel(file) };
}

export function getSiteContext(siteDir) {
  const indexPath = path.join(siteDir, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const theme = loadTheme(siteDir);
  const parts = extractShellParts(html);

  return {
    theme,
    headerHtml: parts.headerHtml.slice(0, 4000),
    footerHtml: parts.footerHtml.slice(0, 2500),
    mainSample: parts.mainSample,
    commonClasses: theme.commonClasses,
    pages: listPages(siteDir),
  };
}

export function assembleGeneratedPage(siteDir, { pageName, pageTitle, mainContent, description }) {
  const indexPath = path.join(siteDir, 'index.html');
  const baseHtml = fs.readFileSync(indexPath, 'utf8');
  const file = sanitizePageName(pageName);
  const target = path.join(siteDir, file);
  if (fs.existsSync(target)) throw new Error(`Page "${file}" already exists.`);

  const html = buildPageHtml({
    baseHtml,
    pageTitle: pageTitle || pageLabel(file),
    mainContent,
    metaDescription: description || '',
  });

  fs.writeFileSync(target, html);
  return { file, label: pageLabel(file) };
}

function sectionVisibleText(html) {
  return String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function topLevelSections(html) {
  const tokens = [];
  const pattern = /<section\b[^>]*>|<\/section>/gi;
  let match = pattern.exec(html);
  while (match) {
    tokens.push({ index: match.index, length: match[0].length, close: match[0].startsWith('</') });
    match = pattern.exec(html);
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
  return sections.filter((section) => section.end > section.start);
}

/** Drop a later section when its wording already appears in an earlier section. */
export function removeRepeatedSections(html) {
  const source = String(html || '');
  const mainMatch = source.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  const target = mainMatch ? mainMatch[0] : source;
  const sections = topLevelSections(target);
  const kept = [];
  const remove = [];
  for (const section of sections) {
    const chunk = target.slice(section.start, section.end);
    const text = sectionVisibleText(chunk);
    const lines = text.split(/[.!?]/).map((line) => line.trim()).filter((line) => line.length >= 40);
    const shared = lines.filter((line) => kept.some((item) => item.text.includes(line)));
    const sharedLength = shared.join(' ').length;
    if (lines.length && sharedLength >= 80 && sharedLength > text.length * 0.4) remove.push(section);
    else kept.push({ text });
  }
  if (!remove.length) return { html: source, count: 0 };
  let next = target;
  for (const section of [...remove].sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, section.start)}${next.slice(section.end)}`;
  }
  const updated = mainMatch ? source.replace(mainMatch[0], next) : next;
  return { html: updated, count: remove.length };
}
