/**
 * Restructure cloned output to match ~/Downloads/americanauthors stack:
 *   index.php (scandir router) → views/*.php
 *   includes/ (head, header, footer, token, ppc_or_seo, get-dashboard)
 *   class/Api.class.php
 *   css/, js/, images/, fonts/ at project root
 *   views/leads.php, thank-you.php, 404.php
 * Keeps static index.html mirrors for editor preview.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { listPages } from './site-utils.mjs';
import { applyHeadSnippets, readHeadSnippets } from './head-snippets.mjs';
import { stripSlickRuntime } from './clone-postprocess.mjs';
import { PORTFOLIO_BANNER_CSS, SCROLL_DUPLICATE_SCRIPT } from './animation-css.mjs';
import { toPhpPageHref, toPhpPageHrefs } from './openai-generate.mjs';

const PAGE_ANIMATIONS_CSS = 'css/cloner-page-animations.css';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEAD_PHP = path.join(__dirname, 'templates', 'leads.php');
const LEAD_ACTION = '/leads/';

const AMERICANAUTHORS_REF = path.join(
  process.env.HOME || '',
  'Downloads',
  'americanauthors'
);

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileSafe(src, dest) {
  if (!fs.existsSync(src)) return false;
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirMerge(src, dest) {
  if (!fs.existsSync(src)) return;
  mkdirp(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirMerge(s, d);
    else copyFileSafe(s, d);
  }
}

function collectHtmlPages(siteDir) {
  return listPages(siteDir).map((p) => p.file);
}

/** Move all vendor + site assets → root css/, js/, images/, fonts/ */
function migrateAssets(siteDir) {
  const moves = [
    ['nypublishers/assets/css', 'css'],
    ['nypublishers/assets/js', 'js'],
    ['nypublishers/assets/images', 'images'],
    ['nypublishers/assets/fonts', 'fonts'],
    ['assets/css', 'css'],
    ['assets/inc-css', 'css'],
    ['assets/bootstrap/css', 'css'],
    ['assets/images', 'images'],
    ['assets/inc-css/images', 'images'],
    ['assets/css/images', 'images'],
    ['assets/bootstrap/js', 'js'],
    ['assets/js', 'js'],
    ['assets/slick/slick', 'js'],
    ['assets/fonts', 'fonts'],
    ['assets/font', 'font'],
    ['assets/webfonts', 'fonts'],
    ['nypublishers/assets/font', 'font'],
    ['nypublishers/assets/webfonts', 'fonts'],
    ['fonts', 'fonts'],
    ['childrens-book/css', 'css'],
    ['childrens-book/js', 'js'],
    ['childrens-book/images', 'images'],
    ['slick', 'css'],
    ['wp-content/uploads', 'images'],
  ];

  for (const [from, to] of moves) {
    copyDirMerge(path.join(siteDir, from), path.join(siteDir, to));
  }

  for (const c of ['slick/slick.css', 'assets/slick/slick/slick.css']) {
    copyFileSafe(path.join(siteDir, c), path.join(siteDir, 'css/slick.css'));
  }
  for (const j of ['slick/slick.js', 'assets/slick/slick/slick.js']) {
    copyFileSafe(path.join(siteDir, j), path.join(siteDir, 'js/slick.js'));
  }

  copyClassifiedTree(path.join(siteDir, 'assets/vendor'), siteDir);
  retargetWebfonts(siteDir);
}

const CLASSIFIED_DIRS = {
  css: 'css',
  js: 'js',
  fonts: 'fonts',
  font: 'fonts',
  webfonts: 'fonts',
  images: 'images',
  img: 'images',
  image: 'images',
};

const CLASSIFIED_EXT = {
  '.css': 'css',
  '.js': 'js',
  '.mjs': 'js',
  '.png': 'images',
  '.jpg': 'images',
  '.jpeg': 'images',
  '.gif': 'images',
  '.svg': 'images',
  '.webp': 'images',
  '.ico': 'images',
  '.avif': 'images',
  '.mp4': 'images',
  '.woff': 'fonts',
  '.woff2': 'fonts',
  '.ttf': 'fonts',
  '.eot': 'fonts',
  '.otf': 'fonts',
};

/** Copy vendor trees (bootstrap, slick, font-awesome, gsap, …) into css/, js/, images/, fonts/. */
function copyClassifiedTree(srcDir, siteDir) {
  if (!fs.existsSync(srcDir)) return;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const dest = CLASSIFIED_DIRS[entry.name.toLowerCase()];
        if (dest) copyDirMerge(full, path.join(siteDir, dest));
        else walk(full);
      } else {
        const dest = CLASSIFIED_EXT[path.extname(entry.name).toLowerCase()];
        if (dest) copyFileSafe(full, path.join(siteDir, dest, entry.name));
      }
    }
  }

  walk(srcDir);
}

function retargetWebfonts(siteDir) {
  const cssDir = path.join(siteDir, 'css');
  if (!fs.existsSync(cssDir)) return;
  for (const name of fs.readdirSync(cssDir)) {
    if (!name.endsWith('.css')) continue;
    const filePath = path.join(cssDir, name);
    const css = fs.readFileSync(filePath, 'utf8');
    const next = css.replace(/\.\.\/webfonts\//g, '../fonts/');
    if (next !== css) fs.writeFileSync(filePath, next);
  }
}

/** americanauthors uses responsive.css + plugin.css + custom.css */
function buildAmericanAuthorsCss(siteDir) {
  const cssDir = path.join(siteDir, 'css');
  mkdirp(cssDir);

  const pluginImports = [
    'bootstrap.css', 'animate.css', 'all.css', 'font-awesome.min.css',
    'slick.css', 'owl.carousel.css', 'owl.carousel.min.css', 'popup.css',
    'jquery.fancybox.css', 'jquery.fancybox.min.css',
  ].filter((f) => fs.existsSync(path.join(cssDir, f)));

  const customImports = [
    'style.css', 'popup-custom.css', 'services.css', 'new-service.css',
    'nav.css', 'footerQuote.css', 'animatecard.css', 'cloner-ui-fidelity.css',
  ].filter((f) => fs.existsSync(path.join(cssDir, f)));

  const responsiveImports = ['slick-theme.css'].filter((f) => fs.existsSync(path.join(cssDir, f)));

  const writeBundle = (name, files) => {
    if (!files.length) return;
    const content = files.map((f) => `@import url("${f}");`).join('\n') + '\n';
    fs.writeFileSync(path.join(cssDir, name), `/* americanauthors-style bundle */\n${content}`);
  };

  writeBundle('plugin.css', pluginImports);
  writeBundle('custom.css', customImports);
  writeBundle('responsive.css', responsiveImports);
}

/** Keep the site's own scripts. Do not copy them again as plugin.js or custom.js. */
function buildAmericanAuthorsJs() {}

function fieldIdentity(node, $) {
  const el = $(node);
  return [
    el.attr('type') || '',
    el.attr('name') || '',
    el.attr('id') || '',
    el.attr('placeholder') || '',
    node.tagName || '',
  ].join(' ').toLowerCase();
}

/** Quote, contact, and get-started forms. Search and login forms are left alone. */
export function isLeadForm($, form) {
  const el = $(form);
  const label = `${el.attr('class') || ''} ${el.attr('id') || ''} ${el.attr('name') || ''}`.toLowerCase();
  const fields = el.find('input, textarea, select').toArray().map((node) => fieldIdentity(node, $));
  const visible = fields.filter((field) => !/\bhidden\b/.test(field) && !/\bsubmit\b/.test(field));
  if (fields.some((field) => /\bpassword\b/.test(field))) return false;
  if (visible.length <= 2 && visible.some((field) => /\b(q|s|query|search)\b/.test(field))) return false;

  const hasEmail = fields.some((field) => /\bemail\b|e-mail/.test(field));
  const hasPhone = fields.some((field) => /\b(tel|phone|mobile)\b/.test(field));
  const hasName = fields.some((field) => /\b(full[_ ]?name|name|your-name)\b/.test(field) && !/username/.test(field));
  const hasMessage = fields.some((field) => /\b(brief|message|comment|project|inquiry|enquiry|service)\b/.test(field) || /\btextarea\b/.test(field));
  const looksLikeLead = /quote|contact|lead|get-started|get_started|inquiry|enquiry|consult|signup|sign-up/.test(label);
  return (hasEmail || hasPhone) && (hasName || hasMessage || looksLikeLead);
}

export function attachLeadForms(html) {
  if (!html || !/<form\b/i.test(html)) return { html, attached: 0, found: 0 };
  const $ = cheerio.load(html, { decodeEntities: false });
  const forms = $('form').toArray();
  const leadForms = new Set(forms.filter((form) => isLeadForm($, form)));
  if (!leadForms.size) return { html, attached: 0, found: 0 };

  let attached = 0;
  let seen = 0;
  const next = html.replace(/<form\b[^>]*>/gi, (tag) => {
    const form = forms[seen++];
    if (!form || !leadForms.has(form)) return tag;
    const action = ($(form).attr('action') || '').trim();
    const method = ($(form).attr('method') || '').trim().toLowerCase();
    if (action === LEAD_ACTION && method === 'post') return tag;
    attached += 1;
    let updated = tag;
    if (/\baction\s*=/i.test(updated)) {
      updated = updated.replace(/\baction\s*=\s*(["']).*?\1/i, 'action="/leads/"');
    } else {
      updated = updated.replace(/<form\b/i, '<form action="/leads/"');
    }
    if (/\bmethod\s*=/i.test(updated)) {
      updated = updated.replace(/\bmethod\s*=\s*(["']).*?\1/i, 'method="post"');
    } else {
      updated = updated.replace(/<form\b/i, '<form method="post"');
    }
    return updated;
  });
  return { html: next, attached, found: leadForms.size };
}

const THANK_YOU_MESSAGE = 'Thank you for your response. We will contact you as soon as possible!';

function isGeneratedThankYou(html) {
  return html.includes('id="lead-success"') || html.includes('cloner-generated-thank-you');
}


export function ensurePreviewThankYou(siteDir) {
  const dest = path.join(siteDir, 'thank-you', 'index.html');
  if (fs.existsSync(dest) && !isGeneratedThankYou(fs.readFileSync(dest, 'utf8'))) return dest;
  return writePreviewThankYou(siteDir) ? dest : '';
}

function ensureSuccessHeading(siteDir, html) {
  if (html.includes('data-success-msg') || html.includes(THANK_YOU_MESSAGE)) return;
  if (!/Back To Home/i.test(html)) return;
  const heading = `<h1 class="mb-0"><span data-success-msg>${THANK_YOU_MESSAGE}</span></h1>\n`;
  const script = `<script>
(function () {
  var message = new URLSearchParams(location.search).get('successMsg');
  var slot = document.querySelector('[data-success-msg]');
  if (message && slot) slot.textContent = message;
})();
</script>`;
  let next = html.replace(/(<a\b[^>]*>[\s\S]*?Back To Home)/i, `${heading}$1`);
  if (!next.includes("get('successMsg')")) {
    next = next.includes('</body>') ? next.replace('</body>', `${script}</body>`) : `${next}\n${script}`;
  }
  fs.writeFileSync(path.join(siteDir, 'thank-you', 'index.html'), next);
  const view = path.join(siteDir, 'views', 'thank-you.php');
  if (!fs.existsSync(view)) return;
  let php = fs.readFileSync(view, 'utf8');
  if (php.includes('successMsg') || !/Back To Home/i.test(php)) return;
  const phpHeading = `<h1 class="mb-0"><?php echo htmlspecialchars($_REQUEST['successMsg'] ?? '${THANK_YOU_MESSAGE}'); ?></h1>\n`;
  php = php.replace(/(<a\b[^>]*>[\s\S]*?Back To Home)/i, `${phpHeading}$1`);
  fs.writeFileSync(view, php);
}

function saveFetchedThankYou(siteDir, rawHtml) {
  const pageFile = 'thank-you/index.html';
  const dest = path.join(siteDir, pageFile);
  mkdirp(path.dirname(dest));
  fs.writeFileSync(dest, thankYouStaticHtml(rawHtml, pageFile, siteDir));
  writeThankYouPhpFromOriginal(siteDir, rawHtml);
  return true;
}

/** Prefer a thank-you page already in the clone; otherwise try the live source once. */
function fetchSourceThankYou(siteDir) {
  const local = [
    'thank-you/index.html',
    'thankyou/index.html',
    'thanks/index.html',
    'thank-you.html',
    'thankyou.html',
  ];
  for (const rel of local) {
    const abs = path.join(siteDir, rel);
    if (!fs.existsSync(abs)) continue;
    const html = fs.readFileSync(abs, 'utf8');
    if (html && !isGeneratedThankYou(html) && /<body\b/i.test(html) && /thank/i.test(html)) return html;
  }

  const metaPath = path.join(siteDir, 'clone-meta.json');
  if (!fs.existsSync(metaPath)) return '';
  let sourceUrl = '';
  try {
    sourceUrl = String(JSON.parse(fs.readFileSync(metaPath, 'utf8')).sourceUrl || '').replace(/\/$/, '');
  } catch {
    return '';
  }
  if (!/^https?:\/\//i.test(sourceUrl)) return '';

  for (const pathName of ['/thank-you/', '/thankyou/', '/thanks/', '/thank-you.html', '/thankyou.html']) {
    try {
      const html = execFileSync(
        'curl',
        ['-fsSL', '--max-time', '12', '-A', 'Mozilla/5.0 (compatible; WebsiteCloner/1.0)', `${sourceUrl}${pathName}`],
        { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      );
      if (html && /<body\b/i.test(html) && /thank/i.test(html)) return html;
    } catch {
      /* try next path */
    }
  }
  return '';
}

export function writePreviewThankYou(siteDir) {
  const dest = path.join(siteDir, 'thank-you', 'index.html');
  const existing = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  // A crawled thank-you already has the original body. Leave that design.
  const keptOriginal = existing
    && !isGeneratedThankYou(existing)
    && /<body\b[^>]*\bclass=/i.test(existing)
    && /thank/i.test(existing);
  if (keptOriginal) {
    ensureSuccessHeading(siteDir, existing);
    return true;
  }
  const sourceHtml = fetchSourceThankYou(siteDir);
  if (sourceHtml && saveFetchedThankYou(siteDir, sourceHtml)) return true;
  if (existing && !isGeneratedThankYou(existing)) {
    ensureSuccessHeading(siteDir, existing);
    return true;
  }
  return false;
}

function readLeadPhp() {
  if (fs.existsSync(LEAD_PHP)) return fs.readFileSync(LEAD_PHP, 'utf8');
  return readTemplate('views/leads.php', '');
}

function writeLeadPhp(siteDir) {
  const php = readLeadPhp();
  if (!php) return false;
  writeCrmFiles(siteDir);
  mkdirp(path.join(siteDir, 'views'));
  mkdirp(path.join(siteDir, 'leads'));
  fs.writeFileSync(path.join(siteDir, 'views', 'leads.php'), php);
  fs.writeFileSync(path.join(siteDir, 'leads', 'index.php'), php);
  return true;
}

function rewriteAssetPaths(html) {
  let out = html;
  const rules = [
    [/https?:\/\/[^"'()\s]+\/wp-content\/uploads\//gi, '/images/'],
    [/(?:\.\.\/)+wp-content\/uploads\//gi, '/images/'],
    [/wp-content\/uploads\//gi, '/images/'],
    [/nypublishers\/assets\/css\//gi, '/css/'],
    [/nypublishers\/assets\/js\//gi, '/js/'],
    [/nypublishers\/assets\/images\//gi, '/images/'],
    [/nypublishers\/assets\/fonts\//gi, '/fonts/'],
    [/nypublishers\/\/css\//gi, '/css/'],
    [/nypublishers\/\/js\//gi, '/js/'],
    [/nypublishers\/\/images\//gi, '/images/'],
    [/(?:\.\.\/)+nypublishers\/assets\/css\//gi, '/css/'],
    [/(?:\.\.\/)+nypublishers\/assets\/js\//gi, '/js/'],
    [/(?:\.\.\/)+nypublishers\/assets\/images\//gi, '/images/'],
    [/(?:\.\.\/)+assets\/inc-css\/images\//g, '/images/'],
    [/(?:\.\.\/)+assets\/css\/images\//g, '/images/'],
    [/(?:\.\.\/)+assets\/images\//g, '/images/'],
    [/(?:\.\.\/)+assets\/inc-css\//g, '/css/'],
    [/(?:\.\.\/)+assets\/css\//g, '/css/'],
    [/(?:\.\.\/)+assets\/bootstrap\/css\//g, '/css/'],
    [/(?:\.\.\/)+assets\/bootstrap\/js\//g, '/js/'],
    [/(?:\.\.\/)+assets\/slick\/slick\//g, '/js/'],
    [/(?:\.\.\/)+childrens-book\/css\//g, '/css/'],
    [/(?:\.\.\/)+childrens-book\/js\//g, '/js/'],
    [/(?:\.\.\/)+childrens-book\/images\//g, '/images/'],
    [/assets\/inc-css\/images\//g, '/images/'],
    [/assets\/css\/images\//g, '/images/'],
    [/assets\/images\//g, '/images/'],
    [/assets\/inc-css\//g, '/css/'],
    [/assets\/css\//g, '/css/'],
    [/assets\/bootstrap\/css\//g, '/css/'],
    [/assets\/bootstrap\/js\//g, '/js/'],
    [/assets\/vendor\/(?:[^"'()\s]+\/)*css\//gi, '/css/'],
    [/assets\/vendor\/(?:[^"'()\s]+\/)*js\//gi, '/js/'],
    [/assets\/vendor\/(?:[^"'()\s]+\/)*webfonts\//gi, '/fonts/'],
    [/assets\/vendor\/(?:[^"'()\s]+\/)*fonts\//gi, '/fonts/'],
    [/assets\/vendor\/jquery\//gi, '/js/'],
    [/assets\/vendor\/gsap\//gi, '/js/'],
    [/assets\/vendor\/isotope\//gi, '/js/'],
    [/assets\/vendor\/images-loaded\//gi, '/js/'],
    [/assets\/vendor\/vanilla-tilt\//gi, '/js/'],
    [/assets\/js\//gi, '/js/'],
    [/assets\/slick\/slick\/slick\.css/gi, '/css/slick.css'],
    [/assets\/slick\/slick\/slick\.js/gi, '/js/slick.js'],
    [/childrens-book\/css\//g, '/css/'],
    [/childrens-book\/js\//g, '/js/'],
    [/childrens-book\/images\//g, '/images/'],
    [/src="images\//g, 'src="/images/'],
    [/href="images\//g, 'href="/images/'],
    [/url\((['"]?)images\//g, 'url($1/images/'],
  ];
  for (const [re, rep] of rules) out = out.replace(re, rep);

  out = out.replace(/href=(["'])([^"']*?index\.html[^"']*)\1/gi, (full, quote, href) => `href=${quote}${toPhpPageHref(href)}${quote}`);

  out = attachLeadForms(out).html;

  // /assets/images/ used to become //images/ because the leading slash was left behind.
  out = out.replace(/(["'(=\s])\/{2,}(css|js|images|fonts|font|external)\//g, '$1/$2/');
  out = out.replace(/\.{1,2}\/\/+(css|js|images|fonts|font|external)\//g, '/$1/');

  return out;
}

export function extractShell(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const header = $('header').first();
  const bodyScripts = [];
  $('body script').each((_, el) => bodyScripts.push($.html(el)));

  let headerHtml = '';
  let closesBackBg = false;

  if (header.length) {
    const $backBg = header.closest('.back-bg');
    const $marquee = $backBg.length ? $backBg.prev('marquee') : header.prev('marquee');
    const parts = [];
    if ($marquee.length) parts.push($.html($marquee));
    if ($backBg.length) {
      parts.push('<div class="back-bg">');
      closesBackBg = true;
    }
    let node = header;
    while (node.length && String(node.get(0).tagName || '').toLowerCase() === 'header') {
      parts.push($.html(node));
      node = node.next();
    }
    while (node.length && /^(style|script)$/i.test(node.get(0).tagName || '')) {
      parts.push($.html(node));
      node = node.next();
    }
    headerHtml = parts.join('\n');
  }

  const footerStart = $('footer').first().length
    ? $('footer').first()
    : $('#m-footer').first().length
      ? $('#m-footer').first()
      : $('.main-footer').first();

  let footerHtml = '';
  if (footerStart.length) {
    const parts = [$.html(footerStart)];
    footerStart.nextAll().each((_, el) => {
      if (el.tagName === 'script') return;
      parts.push($.html(el));
    });
    footerHtml = parts.join('\n');
    if (closesBackBg) footerHtml = '</div><!-- back-bg -->\n' + footerHtml;
  }

  const headAssets = extractHeadAssets($.html());
  return {
    headerHtml,
    footerHtml,
    bodyScripts,
    headLinks: headAssets.links,
    headStyles: headAssets.styles,
    title: $('title').text()?.trim() || 'Home',
    description: $('meta[name="description"]').attr('content')?.trim() || '',
    closesBackBg,
  };
}

function tagHref(tag) {
  const match = String(tag).match(/\shref=["']([^"']+)["']/i);
  return match ? match[1].split('#')[0] : tag;
}

function dedupeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const tag of tags) {
    const key = tagHref(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Keep the original page's stylesheets, fonts, and icons so the clone matches the source. */
function shouldKeepHeadLink($, el) {
  const rel = (($(el).attr('rel') || '')).toLowerCase();
  const href = ($(el).attr('href') || '').trim();
  const as = (($(el).attr('as') || '')).toLowerCase();
  if (!href || /^(data:|javascript:)/i.test(href)) return false;
  if (rel.includes('stylesheet')) return true;
  if (rel === 'icon' || rel === 'shortcut icon' || rel === 'apple-touch-icon') return true;
  if (rel === 'preconnect' || rel === 'dns-prefetch') return true;
  if (rel === 'preload' && ['style', 'font', 'image'].includes(as)) return true;
  return false;
}

export function extractHeadAssets(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const links = [];
  const styles = [];
  $('head link').each((_, el) => {
    if (shouldKeepHeadLink($, el)) links.push($.html(el));
  });
  $('head style').each((_, el) => {
    const block = $.html(el)?.trim();
    if (block) styles.push(block);
  });
  return { links: dedupeTags(links), styles: dedupeTags(styles) };
}

function bundleScriptTags(siteDir, already = '') {
  const tags = [];
  for (const name of ['plugin.js', 'custom.js']) {
    if (!fs.existsSync(path.join(siteDir, 'js', name))) continue;
    if (already.includes(`js/${name}`)) continue;
    tags.push(`<script src="/js/${name}"></script>`);
  }
  return tags.join('\n');
}

function fallbackStylesheetTags(siteDir) {
  return ['responsive.css', 'plugin.css', 'custom.css']
    .filter((name) => fs.existsSync(path.join(siteDir, 'css', name)))
    .map((name) => `<link rel="stylesheet" type="text/css" href="/css/${name}">`);
}

function extractOrphanStyles(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const blocks = [];
  $('html > style').each((_, el) => {
    const content = $(el).html()?.trim();
    if (content) blocks.push(`<style>\n${content}\n</style>`);
  });
  return blocks.join('\n');
}

export function extractBodyContent(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('header').remove();
  $('marquee').remove();
  $('body script').remove();

  const $backBg = $('body').children('.back-bg').first();
  if ($backBg.length) {
    $backBg.children('header').remove();
    $backBg.replaceWith($backBg.contents());
  }

  const footerStart = $('footer').first().length
    ? $('footer').first()
    : $('#m-footer').first().length
      ? $('#m-footer').first()
      : $('.main-footer').first();

  if (footerStart.length) {
    footerStart.nextAll().remove();
    footerStart.remove();
  }

  $('.floatbutton, #popupform1Lead, .bg-overlay, .trust_imgg, .mypopup-wrap').remove();

  return $('body').html()?.trim() || '';
}

function readFileIfAllowed(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readTemplate(relPath, fallback = '') {
  const local = readFileIfAllowed(path.join(__dirname, 'templates', relPath));
  if (local) return local;
  const external = readFileIfAllowed(path.join(AMERICANAUTHORS_REF, relPath));
  return external || fallback;
}

function writeCrmFiles(siteDir) {
  const files = [
    ['includes/token.php', path.join(siteDir, 'includes', 'token.php')],
    ['includes/ppc_or_seo.php', path.join(siteDir, 'includes', 'ppc_or_seo.php')],
    ['includes/get-dashboard.php', path.join(siteDir, 'includes', 'get-dashboard.php')],
    ['class/Api.class.php', path.join(siteDir, 'class', 'Api.class.php')],
  ];
  for (const [rel, dest] of files) {
    const contents = readTemplate(rel, '');
    if (!contents) continue;
    mkdirp(path.dirname(dest));
    fs.writeFileSync(dest, contents);
  }
}

function writeIncludes(siteDir, shell = {}) {
  const inc = path.join(siteDir, 'includes');
  mkdirp(inc);

  const headLinks = (shell.headLinks && shell.headLinks.length)
    ? shell.headLinks
    : fallbackStylesheetTags(siteDir);
  const headStyles = shell.headStyles || [];

  // americanauthors structure — keep the source site's stylesheets
  fs.writeFileSync(
    path.join(inc, 'head.php'),
    `<?php
include_once("token.php");
include_once("ppc_or_seo.php");
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
if (isset($_SERVER['HTTPS'])) { $requesMet = "https"; } else { $requesMet = "http"; }
?>
<html lang="en">
<head>
  <base href="/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow">
  <link rel="icon" href="/favicon.png" type="image/png">
  ${headLinks.join('\n  ')}
  ${headStyles.join('\n  ')}
  <link rel="canonical" href="<?= $requesMet.'://'.$_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI'] ?>">
</head>
`
  );

  fs.writeFileSync(
    path.join(inc, 'token.php'),
    readTemplate('includes/token.php', `<?php
if (empty($_SESSION['token'])) {
  $_SESSION['token'] = bin2hex(random_bytes(32));
}
$token = $_SESSION['token'];
?>`)
  );

  fs.writeFileSync(
    path.join(inc, 'ppc_or_seo.php'),
    readTemplate('includes/ppc_or_seo.php', `<?php
function detectCampaing() {
  return isset($_GET["gclid"]) || isset($_GET["utm_source"]) || isset($_GET["utm_medium"]) || isset($_GET["utm_campaign"]);
}
function detectFbCampaign() { return isset($_GET["fbclid"]); }
if (!isset($_SESSION['lead_type'])) {
  if (detectCampaing()) $_SESSION['lead_type'] = "PPC";
  elseif (detectFbCampaign()) $_SESSION['lead_type'] = "Facebook";
  else {
    $_SESSION['lead_type'] = "OTHER";
    if (isset($_SERVER["HTTP_REFERER"]) && strpos($_SERVER["HTTP_REFERER"], 'google')) {
      $_SESSION['lead_type'] = "SEO";
    }
  }
}
?>`)
  );

  fs.writeFileSync(
    path.join(inc, 'get-dashboard.php'),
    readTemplate('includes/get-dashboard.php', `<?php
$dashboardUrl = "https://lead.ourbase.camp/api";
`)
  );
}

const MENU_DROPDOWN_CSS = `<style>
.main-menu { list-style: none; margin: 0; padding: 0; display: flex; gap: 20px; align-items: center; }
.main-menu > li { position: relative; }
.menu_wraper .main-menu a,
.menu_wraper .main-menu button.dropdown-toggle { text-decoration: none; padding: 0; display: inline-flex; align-items: center; gap: 6px; border: none; background: transparent; cursor: pointer; color: #000; font-size: 14px; font-family: 'Inter', sans-serif; font-weight: 600; text-transform: uppercase; line-height: 14px; outline: none !important; }
.menu_wraper ul.dropdown-menu { display: none !important; position: absolute; left: 0; top: calc(100% + 4px); flex: none; width: auto; min-width: 180px; margin: 6px 0 0; padding: 6px 0; list-style: none; background: #fff; border: 1px solid #ddd; box-shadow: 0 6px 18px rgba(0,0,0,0.06); z-index: 999; }
.menu_wraper ul.dropdown-menu.show { display: block !important; }
.menu_wraper ul.dropdown-menu li { margin: 0; display: block; }
.menu_wraper ul.dropdown-menu li a { display: block; padding: 10px 14px; white-space: nowrap; text-transform: none; }
</style>`;

function writeShellFiles(siteDir, shell) {
  const inc = path.join(siteDir, 'includes');
  fs.writeFileSync(path.join(inc, 'header.php'), `${rewriteAssetPaths(shell.headerHtml || '')}
${MENU_DROPDOWN_CSS}
`);

  const headerHasCatMenu = /querySelector\(\s*['"]\.dropdown-toggle['"]\s*\)/.test(shell.headerHtml || '');
  const footerScripts = shell.bodyScripts
    .filter((tag) => !(headerHasCatMenu && /querySelector\(\s*['"]\.dropdown-toggle['"]\s*\)/.test(tag) && /addEventListener\(\s*['"]click['"]/.test(tag)))
    .map(rewriteAssetPaths)
    .join('\n');
  const bundleScripts = bundleScriptTags(siteDir, footerScripts);
  const footerPhp = `${rewriteAssetPaths(shell.footerHtml || '')}
${bundleScripts}
${footerScripts}
`;
  fs.writeFileSync(path.join(inc, 'footer.php'), footerPhp);
}

function writeIndexPhp(siteDir) {
  fs.writeFileSync(
    path.join(siteDir, 'index.php'),
    readTemplate('index.php', `<?php
chdir(__DIR__);
$requestPath = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if ($requestPath !== '/' && is_file(__DIR__ . $requestPath)) {
    return false;
}
ob_start();
session_start();
$basePath = "/";
$url = $_SERVER['REQUEST_URI'];
$current_url = explode('?', $url);
$url = $current_url[0];
if ($url !== '/' && str_ends_with($url, '/index.html')) {
    $url = substr($url, 0, -strlen('index.html'));
}
if ($url !== '/' && str_ends_with($url, '.html')) {
    $url = substr($url, 0, -strlen('.html')) . '/';
}
if ($url !== '/' && !str_ends_with($url, '/')) {
    $url .= '/';
}
$dir = __DIR__.'/views';
$files = array_slice(scandir($dir), 2);
$fileWithOutExt = array();
foreach ($files as $file) {
    if (!str_ends_with($file, '.php')) continue;
    $without_extension = '/'.pathinfo($file, PATHINFO_FILENAME).'/';
    array_push($fileWithOutExt, $without_extension);
}
$checkUrl = ($basePath!="/"?$basePath."/":"/");
if ($url == $checkUrl) {
    require $dir.'/home.php';
    die();
}
if (in_array($url, $fileWithOutExt)) {
    $urlWithoutSlashes = str_replace('/', "", $url);
    require $dir.'/'.$urlWithoutSlashes.'.php';
} else {
    http_response_code(404);
    require $dir.'/404.php';
}
?>`)
  );
}

function writeHtaccess(siteDir) {
  fs.writeFileSync(
    path.join(siteDir, '.htaccess'),
    readTemplate('.htaccess', `# americanauthors-style PHP router
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^index\\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
`)
  );
}

function writeStartServer(siteDir) {
  fs.writeFileSync(
    path.join(siteDir, 'start-server.sh'),
    `#!/bin/bash
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="\${1:-8888}"
if command -v php >/dev/null 2>&1; then
  exec php -S "localhost:\${PORT}" -t "$PROJECT_DIR" "$PROJECT_DIR/index.php"
else
  echo "PHP not found. Install PHP 8.2+ or use Apache with .htaccess"
  exit 1
fi
`,
    { mode: 0o755 }
  );
}

function writeApiClass(siteDir) {
  mkdirp(path.join(siteDir, 'class'));
  const tpl = readTemplate('class/Api.class.php', '');
  fs.writeFileSync(
    path.join(siteDir, 'class/Api.class.php'),
    tpl || `<?php
class Api {
    public function hit($url, $data = null, $method = "GET") {
        if ($method == "GET" && $data) $url .= "?" . http_build_query($data);
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => $data ? json_encode($data) : null,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        ]);
        $response = curl_exec($curl);
        curl_close($curl);
        return $response;
    }
}
`
  );
}

function writeSystemViews(siteDir) {
  const viewsDir = path.join(siteDir, 'views');
  mkdirp(viewsDir);

  writeLeadPhp(siteDir);

  const thankTpl = readTemplate('views/thank-you.php', '');
  fs.writeFileSync(
    path.join(viewsDir, 'thank-you.php'),
    thankTpl || `<!DOCTYPE html>
<html>
<?php include_once("includes/head.php"); ?>
<title>Thank You</title>
<body>
<?php include_once("includes/header.php"); ?>
<section class="py-5 text-center">
  <h1><?php echo htmlspecialchars($_REQUEST['successMsg'] ?? 'Thank you!'); ?></h1>
  <a href="/" class="btn btn-primary mt-3">Go Home</a>
</section>
<?php include_once("includes/footer.php"); ?>
</body>
</html>
`
  );

  fs.writeFileSync(
    path.join(viewsDir, '404.php'),
    readTemplate('views/404.php', '') || `<!DOCTYPE html>
<html>
<?php include_once("includes/head.php"); ?>
<title>404 Not Found</title>
<body>
<?php include_once("includes/header.php"); ?>
<section class="py-5 text-center"><h1>404 — Page Not Found</h1><a href="/">Home</a></section>
<?php include_once("includes/footer.php"); ?>
</body>
</html>
`
  );
}

export function pageToSlug(pageFile) {
  if (pageFile === 'index.html') return 'home';
  return pageFile.replace(/\/index\.html$/, '').replace(/\//g, '-');
}

/** Prefix for static HTML preview served under /cloned/folder/... (Vite) */
function previewPrefix(pageFile) {
  const dir = path.posix.dirname(pageFile.replace(/\\/g, '/'));
  if (dir === '.') return '';
  return '../'.repeat(dir.split('/').length);
}

/**
 * Convert root-absolute paths (/css/, /images/) to relative paths so
 * editor/Vite preview works at localhost:5173/cloned/folder/index.html
 * PHP views keep absolute paths for ./start-server.sh deployment.
 */
export function toPreviewRelativePaths(html, pageFile) {
  const prefix = previewPrefix(pageFile);
  let out = html.replace(/<base\s+href=["']\/["']\s*\/?>/gi, '');
  out = out.replace(/(["'])\/\/+(css|js|images|fonts|font|external)\//g, '$1/$2/');

  for (const root of ['css', 'js', 'images', 'fonts', 'external', 'cdn-cgi']) {
    out = out.replace(new RegExp(`(href|src|poster|data-src|data-lazy-src)=["']/${root}/`, 'gi'), `$1="${prefix}${root}/`);
  }
  out = out.replace(/href=["']\/favicon\.png["']/gi, `href="${prefix}favicon.png"`);
  out = out.replace(/url\((['"]?)\/(css|images|js|fonts)\//gi, `url($1${prefix}$2/`);

  out = out.replace(/href="\/([^"'#?]*)"/g, (match, p) => {
    if (/^(https?:|javascript:|mailto:|tel:)/i.test(p)) return match;
    const slug = p.replace(/\/$/, '');
    if (!slug) return `href="${prefix || './'}index.html"`;
    return `href="${prefix}${slug}/index.html"`;
  });

  return out;
}

export function repairPhpAssetSlashes(siteDir) {
  const roots = ['views', 'includes'];
  for (const root of roots) {
    const dir = path.join(siteDir, root);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.php')) continue;
      const filePath = path.join(dir, name);
      const before = fs.readFileSync(filePath, 'utf8');
      const after = before.replace(/(["'])\/\/+(css|js|images|fonts|font|external)\//g, '$1/$2/');
      if (after !== before) fs.writeFileSync(filePath, after);
    }
  }
}

/** Fix all static index.html mirrors for Vite/editor preview */
export function repairStaticPreviewPaths(siteDir) {
  let fixed = 0;
  for (const pageFile of collectHtmlPages(siteDir)) {
    const filePath = path.join(siteDir, pageFile);
    const before = fs.readFileSync(filePath, 'utf8');
    const after = toPreviewRelativePaths(before, pageFile);
    if (after !== before) {
      fs.writeFileSync(filePath, after);
      fixed++;
    }
  }
  return fixed;
}

export function isThankYouPageFile(pageFile) {
  return /thank/i.test(String(pageFile || ''));
}

/** Keep the crawled thank-you document. Do not wrap it in the homepage shell. */
function thankYouStaticHtml(rawHtml, pageFile, siteDir = '') {
  let html = rewriteAssetPaths(rawHtml).replace(/<base\b[^>]*>/gi, '');
  html = toPreviewRelativePaths(html, pageFile);
  const prefix = previewPrefix(pageFile);
  html = html.replace(
    /\bhref=(["'])(?!https?:|\/\/|mailto:|tel:|javascript:|#|data:)([^"']+)\1/gi,
    (full, quote, href) => {
      if (href.startsWith('../') || href.startsWith('/') || href.startsWith('./')) return full;
      if (/\.(css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp4|pdf)(\?|#|$)/i.test(href)) return full;
      const clean = href.replace(/^\.\//, '').replace(/\/$/, '');
      if (!clean || clean === 'index.html') return `href=${quote}${prefix}index.html${quote}`;
      if (/\.html?$/i.test(clean)) return `href=${quote}${prefix}${clean}${quote}`;
      return `href=${quote}${prefix}${clean}/index.html${quote}`;
    },
  );
  if (!siteDir) return html;
  return html.replace(
    /\b(src|href)=(["'])(?!https?:|\/\/|data:|#|mailto:|tel:|javascript:)([^"']+)\2/gi,
    (full, attr, quote, url) => {
      if (url.startsWith('../') || url.startsWith('/') || url.startsWith('./')) return full;
      const rel = url.split('#')[0].split('?')[0];
      if (!rel || !fs.existsSync(path.join(siteDir, rel))) return full;
      return `${attr}=${quote}${prefix}${url}${quote}`;
    },
  );
}

function writeThankYouPhpFromOriginal(siteDir, rawHtml) {
  const views = path.join(siteDir, 'views');
  if (!fs.existsSync(views)) return;
  const rewritten = rewriteAssetPaths(rawHtml);
  const $ = cheerio.load(rewritten, { decodeEntities: false });
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content') || '';
  const bodyOpen = (rewritten.match(/<body\b[^>]*>/i) || ['<body>'])[0];
  const bodyInner = toPhpPageHrefs(extractBodyContent(rewritten));
  const php = `<!DOCTYPE html>
<html>
<?php include_once("includes/head.php"); ?>
<title>${title.replace(/</g, '&lt;')}</title>
<meta name="description" content="${description.replace(/"/g, '&quot;')}">
${bodyOpen}
<?php include_once("includes/header.php"); ?>
${bodyInner}
<?php include_once("includes/footer.php"); ?>
</body>
</html>
`;
  fs.writeFileSync(path.join(views, 'thank-you.php'), php);
}

function convertPage(siteDir, pageFile, shell, viewsDir) {
  const fullPath = path.join(siteDir, pageFile);
  let html = stripSlickRuntime(fs.readFileSync(fullPath, 'utf8'));
  if (isThankYouPageFile(pageFile)) {
    mkdirp(path.dirname(fullPath));
    fs.writeFileSync(fullPath, thankYouStaticHtml(html, pageFile, siteDir));
    writeThankYouPhpFromOriginal(siteDir, html);
    return pageToSlug(pageFile);
  }
  const orphanStyles = rewriteAssetPaths(extractOrphanStyles(html));
  html = rewriteAssetPaths(html);

  const $ = cheerio.load(html, { decodeEntities: false });
  const title = $('title').text()?.trim() || shell.title;
  const description = $('meta[name="description"]').attr('content')?.trim() || shell.description;
  const bodyInner = extractBodyContent(html);
  const hasPortfolioScroll = /portoflio-banner|first-scroll-section/i.test(bodyInner);
  const scrollScript = hasPortfolioScroll ? SCROLL_DUPLICATE_SCRIPT : '';

  const slug = pageToSlug(pageFile);
  const pageAssets = extractHeadAssets(html);
  const headLinks = pageAssets.links.length ? pageAssets.links : (shell.headLinks || fallbackStylesheetTags(siteDir));
  const headStyles = pageAssets.styles.length ? pageAssets.styles : (shell.headStyles || []);
  const shellHrefs = new Set((shell.headLinks || []).map(tagHref));
  const extraLinks = pageAssets.links.filter((tag) => !shellHrefs.has(tagHref(tag)));
  const bundleScripts = bundleScriptTags(siteDir, shell.bodyScripts.join('\n'));

  const php = `<!DOCTYPE html>
<html>
<?php include_once("includes/head.php"); ?>
<title>${title.replace(/</g, '&lt;')}</title>
<meta name="description" content="${(description || '').replace(/"/g, '&quot;')}">
${extraLinks.join('\n')}
<body>
<?php include_once("includes/header.php"); ?>
${orphanStyles}
${toPhpPageHrefs(bodyInner)}
${scrollScript}
<?php include_once("includes/footer.php"); ?>
</body>
</html>
`;

  fs.writeFileSync(path.join(viewsDir, `${slug}.php`), php);

  let staticFull = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title.replace(/</g, '&lt;')}</title>
  <meta name="description" content="${(description || '').replace(/"/g, '&quot;')}">
  ${headLinks.join('\n  ')}
  ${headStyles.join('\n  ')}
  ${hasPortfolioScroll ? `<link rel="stylesheet" href="/${PAGE_ANIMATIONS_CSS}">` : ''}
  ${orphanStyles}
</head>
<body>
${shell.headerHtml}
${bodyInner}
${shell.footerHtml}
${bundleScripts}
${shell.bodyScripts.join('\n')}
${scrollScript}
</body>
</html>`;
  staticFull = toPreviewRelativePaths(staticFull, pageFile);

  mkdirp(path.dirname(fullPath));
  fs.writeFileSync(fullPath, staticFull);

  return slug;
}

function copyFavicon(siteDir) {
  const candidates = [
    'images/favicon.png', 'images/favicon.ico', 'images/favicon_11.png',
    'assets/images/favicon.png', 'assets/images/favicon_11.png',
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(siteDir, c))) {
      copyFileSafe(path.join(siteDir, c), path.join(siteDir, 'favicon.png'));
      copyFileSafe(path.join(siteDir, c), path.join(siteDir, 'images/favicon.png'));
      break;
    }
  }
}

/** Ensure portfolio vertical-scroll CSS + duplicate-image script on pages that need it */
export function repairPageAnimations(siteDir) {
  const cssDir = path.join(siteDir, 'css');
  mkdirp(cssDir);
  const cssPath = path.join(cssDir, 'cloner-page-animations.css');
  if (!fs.existsSync(cssPath)) {
    fs.writeFileSync(cssPath, `/* Cloner page animations */\n${PORTFOLIO_BANNER_CSS}\n`);
  }

  let fixed = 0;
  for (const pageFile of collectHtmlPages(siteDir)) {
    const filePath = path.join(siteDir, pageFile);
    let html = fs.readFileSync(filePath, 'utf8');
    if (!/portoflio-banner|first-scroll-section/i.test(html)) continue;

    const prefix = previewPrefix(pageFile);
    const cssHref = `${prefix}${PAGE_ANIMATIONS_CSS}`;
    let changed = false;

    if (!html.includes('cloner-page-animations.css') && html.includes('</head>')) {
      html = html.replace('</head>', `  <link rel="stylesheet" href="${cssHref}">\n</head>`);
      changed = true;
    }
    if (!html.includes('clonerDuped') && !html.includes('clonerVerticalScroll')) {
      html = html.replace('</body>', `${SCROLL_DUPLICATE_SCRIPT}\n</body>`);
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(filePath, html);
      fixed++;
    }
  }
  return fixed;
}

function cleanupOldAssets(siteDir) {
  // Keep the original asset folders. Deleting them breaks fonts, video, and
  // images whose CSS still points at assets/font, assets/images, and similar paths.
  mkdirp(path.join(siteDir, '.hkjgdshagkjhadskjhfkjdsafhakjdsfhakjdshgf'));
}

/**
 * Detect lead forms in a clone and point them at the leads PHP handler.
 * Search and login forms are skipped. Pages with no lead form are left unchanged.
 */
export function attachLeadPhpToSite(siteDir) {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found');
  let found = 0;
  let attached = 0;
  const files = listPages(siteDir).map((page) => path.join(siteDir, page.file));
  for (const dir of ['views', 'includes']) {
    const full = path.join(siteDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith('.php') && name !== 'leads.php') files.push(path.join(full, name));
    }
  }

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const before = fs.readFileSync(filePath, 'utf8');
    const result = attachLeadForms(before);
    found += result.found;
    attached += result.attached;
    if (result.html !== before) fs.writeFileSync(filePath, result.html);
  }

  const wrotePhp = found > 0 ? writeLeadPhp(siteDir) : false;
  const thankYou = found > 0 ? writePreviewThankYou(siteDir) : false;
  return { found, attached, php: Boolean(wrotePhp), thankYou: Boolean(thankYou) };
}

/**
 * Restructure cloned folder to americanauthors PHP stack.
 */
export function restructureToPhpStack(siteDir) {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found');

  const pages = collectHtmlPages(siteDir);
  if (!pages.length) throw new Error('No HTML pages found');

  migrateAssets(siteDir);
  buildAmericanAuthorsCss(siteDir);
  buildAmericanAuthorsJs(siteDir);
  copyFavicon(siteDir);

  const homePath = path.join(siteDir, 'index.html');
  const shell = extractShell(
    rewriteAssetPaths(stripSlickRuntime(fs.readFileSync(homePath, 'utf8')))
  );

  writeIncludes(siteDir, shell);
  writeShellFiles(siteDir, shell);
  writeApiClass(siteDir);
  writeSystemViews(siteDir);

  const viewsDir = path.join(siteDir, 'views');
  mkdirp(viewsDir);

  const slugs = [];
  for (const page of pages) {
    slugs.push(convertPage(siteDir, page, shell, viewsDir));
  }

  writeIndexPhp(siteDir);
  writeHtaccess(siteDir);
  writeStartServer(siteDir);

  if (!fs.existsSync(path.join(siteDir, 'robots.txt'))) {
    fs.writeFileSync(path.join(siteDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  }

  cleanupOldAssets(siteDir);
  repairPhpAssetSlashes(siteDir);
  const previewFixed = repairStaticPreviewPaths(siteDir);
  const animationsFixed = repairPageAnimations(siteDir);
  writePreviewThankYou(siteDir);
  const savedHead = readHeadSnippets(siteDir);
  if (savedHead.trim()) applyHeadSnippets(siteDir, savedHead);

  return {
    pages: pages.length,
    views: slugs.map((s) => `${s}.php`),
    structure: 'php-americanauthors',
    previewPagesFixed: previewFixed,
    animationPagesFixed: animationsFixed,
    stack: {
      router: 'index.php',
      views: 'views/*.php',
      includes: ['head.php', 'header.php', 'footer.php', 'token.php', 'ppc_or_seo.php', 'get-dashboard.php'],
      assets: ['css/', 'js/', 'images/', 'fonts/'],
      devServer: './start-server.sh',
    },
  };
}
