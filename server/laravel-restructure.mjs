/**
 * Export a cloned site as a generic Laravel project.
 *
 * Unlike php-restructure.mjs (which targets one specific hand-built PHP
 * stack), this works for any cloned site: it reuses the same site-agnostic
 * header/footer/lead-form extraction already used by the PHP exporter, but
 * writes a standard Laravel 11 project (routes, Blade views, a lead
 * controller) into an isolated `<site>/laravel/` subfolder so it never
 * touches the static HTML the in-browser editor serves.
 *
 * All generated routes/links/asset references are root-absolute ("/..."),
 * so correctness does not depend on guessing a particular site's folder
 * naming convention — assets are mirrored byte-for-byte under laravel/public/
 * at their original relative path.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { listPages } from './site-utils.mjs';
import { stripSlickRuntime } from './clone-postprocess.mjs';
import {
  extractShell,
  extractHeadAssets,
  extractBodyContent,
  isThankYouPageFile,
  attachLeadForms,
} from './php-restructure.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THANK_YOU_FALLBACK = 'Thank you for your response. We will contact you as soon as possible!';

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, contents) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, contents);
}

/** Resolve a ref relative to the page that referenced it into a project-root-absolute path. */
function toRootAbsolute(ref, pageDir) {
  if (!ref) return ref;
  if (/^(https?:)?\/\//i.test(ref) || /^(data:|mailto:|tel:|javascript:|#)/i.test(ref)) return ref;
  if (ref.startsWith('/')) return ref;
  const [clean, hash] = ref.split('#');
  const resolved = path.posix.normalize(path.posix.join(pageDir, clean));
  const safe = resolved.replace(/^(\.\.\/)+/, '').replace(/^\.+\//, '');
  return `/${safe}${hash ? `#${hash}` : ''}`;
}

/** Absolutize every src/href/poster/srcset/url() reference in a page's HTML. */
function absolutizeReferences(html, pageDir) {
  let out = html.replace(
    /\b(src|href|poster|data-src|data-lazy-src)=(["'])([^"']*)\2/gi,
    (full, attr, quote, value) => `${attr}=${quote}${toRootAbsolute(value, pageDir)}${quote}`,
  );
  out = out.replace(/\bsrcset=(["'])([^"']*)\1/gi, (full, quote, value) => {
    const next = value
      .split(',')
      .map((part) => {
        const [url, descriptor] = part.trim().split(/\s+/, 2);
        if (!url) return part;
        return descriptor ? `${toRootAbsolute(url, pageDir)} ${descriptor}` : toRootAbsolute(url, pageDir);
      })
      .join(', ');
    return `srcset=${quote}${next}${quote}`;
  });
  out = out.replace(/url\((['"]?)([^'")]+)\1\)/gi, (full, quote, value) => {
    if (/^(https?:)?\/\/|^data:/i.test(value)) return full;
    return `url(${quote}${toRootAbsolute(value, pageDir)}${quote})`;
  });
  return out;
}

function phpSingleQuote(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const PASSTHROUGH_HREF_RE = /^(https?:|mailto:|tel:|#|javascript:|data:)/i;
const ASSET_EXT_RE = /\.(css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|otf|mp4|webm|mp3|pdf|json|xml|txt)(\?|#|$)/i;

/** Turn an arbitrary (possibly percent-encoded / unicode / punctuation-heavy) path
 *  segment into a safe, predictable slug for both a Laravel route and a Blade
 *  view filename — independent of whatever naming convention the source site used. */
function slugifySegment(seg) {
  let s = seg;
  try { s = decodeURIComponent(seg); } catch { /* keep raw if malformed */ }
  s = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'page';
}

/** Any href that points at another cloned page becomes a clean, filesystem-safe route;
 *  asset/external links pass through untouched. */
function toSafePageHref(href) {
  if (PASSTHROUGH_HREF_RE.test(href)) return href;
  if (ASSET_EXT_RE.test(href)) return href;
  const hash = (href.match(/#.*$/) || [''])[0];
  let page = href.replace(/#.*$/, '').split('?')[0];
  page = page.replace(/^(?:\.\/|(?:\.\.\/)+)/, '').replace(/^\/+/, '');
  page = page.replace(/\/index\.html$/i, '').replace(/\.html$/i, '').replace(/\/$/, '');
  if (!page || page === 'index') return `/${hash}`;
  const slug = page.split('/').filter(Boolean).map(slugifySegment).join('/');
  return `/${slug}/${hash}`;
}

/** services/plumbing.html -> "services/plumbing" ; index.html -> "" */
function routeSlug(pageFile) {
  return toSafePageHref(pageFile).replace(/^\/+|\/+$/g, '');
}

function viewNameFor(slug) {
  return slug ? `pages.${slug.replace(/\//g, '.')}` : 'pages.home';
}

/** Mirror every non-HTML, non-generated file under siteDir into destDir, preserving paths. */
const SKIP_TOP_LEVEL = new Set([
  'laravel', 'index.php', 'views', 'includes', 'class', '.htaccess', 'start-server.sh',
  'robots.txt', 'clone-meta.json', '.hkjgdshagkjhadskjhfkjdsafhakjdsfhakjdshgf', 'favicon.png',
]);

function copyAssets(siteDir, destDir, relDir = '') {
  const srcDir = path.join(siteDir, relDir);
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (!relDir && SKIP_TOP_LEVEL.has(entry.name)) continue;
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      copyAssets(siteDir, destDir, relPath);
    } else if (!/\.html?$/i.test(entry.name)) {
      const dest = path.join(destDir, relPath);
      mkdirp(path.dirname(dest));
      fs.copyFileSync(path.join(siteDir, relPath), dest);
    }
  }
}

function loadCrmCredentials() {
  try {
    const dashboard = fs.readFileSync(
      path.join(__dirname, 'templates', 'includes', 'get-dashboard.php'),
      'utf8',
    );
    const apiClass = fs.readFileSync(
      path.join(__dirname, 'templates', 'class', 'Api.class.php'),
      'utf8',
    );
    const url = dashboard.match(/\$dashboardUrl\s*=\s*"([^"]+)"/)?.[1] || '';
    const token = apiClass.match(/Authorization:\s*Bearer\s+([^"']+)/)?.[1] || '';
    return { url, token };
  } catch {
    return { url: '', token: '' };
  }
}

function generateAppKey() {
  return `base64:${crypto.randomBytes(32).toString('base64')}`;
}

function buildHeadExtras(shell) {
  return [...(shell.headLinks || []), ...(shell.headStyles || [])].join('\n  ');
}

function writeSkeleton(laravelDir, { appKey, crmUrl, crmToken }) {
  write(path.join(laravelDir, 'composer.json'), JSON.stringify({
    name: 'cloner/exported-site',
    type: 'project',
    description: 'Laravel export of a cloned website, generated by Website Cloner.',
    require: { php: '^8.2', 'laravel/framework': '^11.31' },
    autoload: { 'psr-4': { 'App\\': 'app/' } },
    scripts: { 'post-autoload-dump': ['@php artisan package:discover --ansi'] },
    config: { 'optimize-autoloader': true, 'preferred-install': 'dist', 'sort-packages': true },
    'minimum-stability': 'stable',
    'prefer-stable': true,
  }, null, 2) + '\n');

  write(path.join(laravelDir, 'artisan'), `#!/usr/bin/env php
<?php

use Symfony\\Component\\Console\\Input\\ArgvInput;

define('LARAVEL_START', microtime(true));

require __DIR__.'/vendor/autoload.php';

$status = (require_once __DIR__.'/bootstrap/app.php')
    ->handleCommand(new ArgvInput);

exit($status);
`);

  write(path.join(laravelDir, 'bootstrap', 'app.php'), `<?php

use Illuminate\\Foundation\\Application;
use Illuminate\\Foundation\\Configuration\\Exceptions;
use Illuminate\\Foundation\\Configuration\\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // The cloned site's forms are plain HTML (no @csrf field), so the
        // lead endpoint is excluded from CSRF verification.
        $middleware->validateCsrfTokens(except: [
            'leads',
            'leads/*',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
`);

  write(path.join(laravelDir, 'bootstrap', 'providers.php'), `<?php

return [
    App\\Providers\\AppServiceProvider::class,
];
`);

  write(path.join(laravelDir, 'public', 'index.php'), `<?php

use Illuminate\\Http\\Request;

define('LARAVEL_START', microtime(true));

if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/../vendor/autoload.php';

(require_once __DIR__.'/../bootstrap/app.php')
    ->handleRequest(Request::capture());
`);

  write(path.join(laravelDir, 'routes', 'console.php'), `<?php

use Illuminate\\Foundation\\Inspiring;
use Illuminate\\Support\\Facades\\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
`);

  write(path.join(laravelDir, 'app', 'Http', 'Controllers', 'Controller.php'), `<?php

namespace App\\Http\\Controllers;

abstract class Controller
{
    //
}
`);

  write(path.join(laravelDir, 'app', 'Providers', 'AppServiceProvider.php'), `<?php

namespace App\\Providers;

use Illuminate\\Support\\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        //
    }
}
`);

  write(path.join(laravelDir, 'app', 'Http', 'Controllers', 'LeadController.php'), `<?php

namespace App\\Http\\Controllers;

use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Http;
use Illuminate\\Support\\Facades\\Log;

/** Posts a captured lead form to the configured CRM — same contract the clone's original lead form used. */
class LeadController extends Controller
{
    public function store(Request $request)
    {
        $url = config('services.crm.dashboard_url');
        $token = config('services.crm.token');

        $brief = trim($request->input('brief', '') . ' | ' . $request->input('company', '') . ' | ' . $request->input('budget', ''));
        $referer = $request->headers->get('referer', '');
        $route = explode('?', $request->input('route', $referer))[0];

        $payload = [
            'name' => $request->input('name', ''),
            'email' => $request->input('email', ''),
            'phone' => $request->input('phone', ''),
            'website_url' => $request->getHost(),
            'brief' => $brief,
            'source' => $this->leadSource($request, $referer),
            'news' => 1,
            'route' => $route,
            'brand' => $request->input('brand', ''),
            'tag' => $request->input('tag', ''),
            'price' => $request->input('price', ''),
            'domain' => $request->getHost(),
            'ip_address' => $request->ip(),
            'server_ip' => $request->server('SERVER_ADDR'),
            'reference_url' => $referer ?: null,
        ];

        $message = 'Thank you for your response. We will contact you as soon as possible!';

        if ($url && $token) {
            try {
                $response = Http::withToken($token)->timeout(15)->post(rtrim($url, '/') . '/customer', $payload);
                $data = $response->json();
                if (is_array($data) && !empty($data['message'])) {
                    $message = $data['message'];
                } elseif (is_array($data) && !empty($data[1])) {
                    $message = $data[1];
                }
            } catch (\\Throwable $e) {
                Log::warning('CRM lead submission failed: ' . $e->getMessage());
            }
        }

        return redirect()->route('thank-you', ['successMsg' => $message]);
    }

    private function leadSource(Request $request, string $referer): string
    {
        if ($request->hasAny(['gclid', 'utm_source', 'utm_medium', 'utm_campaign'])) return 'PPC';
        if ($request->has('fbclid')) return 'Facebook';
        if ($referer && str_contains($referer, 'google')) return 'SEO';
        return 'OTHER';
    }
}
`);

  write(path.join(laravelDir, 'config', 'app.php'), `<?php

return [
    'name' => env('APP_NAME', 'Cloned Site'),
    'env' => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url' => env('APP_URL', 'http://localhost'),
    'timezone' => 'UTC',
    'locale' => 'en',
    'fallback_locale' => 'en',
    'faker_locale' => 'en_US',
    'cipher' => 'AES-256-CBC',
    'key' => env('APP_KEY'),
    'maintenance' => ['driver' => 'file'],
];
`);

  write(path.join(laravelDir, 'config', 'services.php'), `<?php

return [
    'crm' => [
        'dashboard_url' => env('CRM_DASHBOARD_URL'),
        'token' => env('CRM_API_TOKEN'),
    ],
];
`);

  write(path.join(laravelDir, 'config', 'session.php'), `<?php

return [
    'driver' => env('SESSION_DRIVER', 'file'),
    'lifetime' => (int) env('SESSION_LIFETIME', 120),
    'expire_on_close' => false,
    'encrypt' => false,
    'files' => storage_path('framework/sessions'),
    'connection' => env('SESSION_CONNECTION'),
    'table' => 'sessions',
    'store' => env('SESSION_STORE'),
    'lottery' => [2, 100],
    'cookie' => env('SESSION_COOKIE', 'laravel_session'),
    'path' => '/',
    'domain' => env('SESSION_DOMAIN'),
    'secure' => env('SESSION_SECURE_COOKIE'),
    'http_only' => true,
    'same_site' => 'lax',
    'partitioned' => false,
];
`);

  write(path.join(laravelDir, 'config', 'cache.php'), `<?php

return [
    'default' => env('CACHE_STORE', 'file'),
    'stores' => [
        'array' => ['driver' => 'array', 'serialize' => false],
        'file' => [
            'driver' => 'file',
            'path' => storage_path('framework/cache/data'),
            'lock_path' => storage_path('framework/cache/data'),
        ],
    ],
    'prefix' => env('CACHE_PREFIX', 'laravel_cache_'),
];
`);

  write(path.join(laravelDir, 'config', 'filesystems.php'), `<?php

return [
    'default' => env('FILESYSTEM_DISK', 'local'),
    'disks' => [
        'local' => ['driver' => 'local', 'root' => storage_path('app/private'), 'serve' => true, 'throw' => false],
        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL') . '/storage',
            'visibility' => 'public',
            'throw' => false,
        ],
    ],
    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],
];
`);

  write(path.join(laravelDir, 'config', 'logging.php'), `<?php

return [
    'default' => env('LOG_CHANNEL', 'single'),
    'deprecations' => ['channel' => env('LOG_DEPRECATIONS_CHANNEL', 'null'), 'trace' => false],
    'channels' => [
        'single' => ['driver' => 'single', 'path' => storage_path('logs/laravel.log'), 'level' => env('LOG_LEVEL', 'debug')],
        'null' => ['driver' => 'monolog', 'handler' => \\Monolog\\Handler\\NullHandler::class],
    ],
];
`);

  write(path.join(laravelDir, 'config', 'database.php'), `<?php

return [
    'default' => env('DB_CONNECTION', 'sqlite'),
    'connections' => [
        'sqlite' => [
            'driver' => 'sqlite',
            'url' => env('DB_URL'),
            'database' => env('DB_DATABASE', database_path('database.sqlite')),
            'prefix' => '',
            'foreign_key_constraints' => env('DB_FOREIGN_KEYS', true),
        ],
    ],
    'migrations' => ['table' => 'migrations', 'update_date_on_publish' => true],
];
`);

  const envBody = `APP_NAME="Cloned Site"
APP_ENV=production
APP_KEY=${appKey}
APP_DEBUG=false
APP_URL=http://localhost

LOG_CHANNEL=single
LOG_LEVEL=debug

DB_CONNECTION=sqlite

SESSION_DRIVER=file
SESSION_LIFETIME=120

CACHE_STORE=file

CRM_DASHBOARD_URL=${crmUrl}
CRM_API_TOKEN=${crmToken}
`;
  write(path.join(laravelDir, '.env'), envBody);
  write(
    path.join(laravelDir, '.env.example'),
    envBody
      .replace(`APP_KEY=${appKey}`, 'APP_KEY=')
      .replace(`CRM_DASHBOARD_URL=${crmUrl}`, 'CRM_DASHBOARD_URL=')
      .replace(`CRM_API_TOKEN=${crmToken}`, 'CRM_API_TOKEN='),
  );

  write(path.join(laravelDir, '.gitignore'), '/vendor\n/node_modules\n.env\n/storage/*.key\n/bootstrap/cache/*.php\n');

  for (const dir of ['framework/cache/data', 'framework/sessions', 'framework/views', 'framework/testing', 'logs', 'app/public']) {
    write(path.join(laravelDir, 'storage', dir, '.gitkeep'), '');
  }
  write(path.join(laravelDir, 'bootstrap', 'cache', '.gitkeep'), '');
  write(path.join(laravelDir, 'database', '.gitkeep'), '');

  write(path.join(laravelDir, 'README.md'), `# Exported Laravel site

Generated by Website Cloner from a cloned website.

## Run it

\`\`\`bash
composer install
php artisan serve
\`\`\`

The app is pre-configured with a generated \`APP_KEY\` and the CRM credentials used by the original lead form, so it works out of the box — no \`php artisan key:generate\` or database setup required.
`);
}

export function restructureToLaravelStack(siteDir) {
  if (!fs.existsSync(siteDir)) throw new Error('Clone folder not found');

  const pages = listPages(siteDir).map((p) => p.file);
  if (!pages.length) throw new Error('No HTML pages found');

  const laravelDir = path.join(siteDir, 'laravel');
  fs.rmSync(laravelDir, { recursive: true, force: true });
  mkdirp(laravelDir);

  const { url: crmUrl, token: crmToken } = loadCrmCredentials();
  writeSkeleton(laravelDir, { appKey: generateAppKey(), crmUrl, crmToken });

  copyAssets(siteDir, path.join(laravelDir, 'public'));

  const homePath = path.join(siteDir, 'index.html');
  const homeHtml = fs.existsSync(homePath) ? stripSlickRuntime(fs.readFileSync(homePath, 'utf8')) : '';
  const shell = extractShell(rewritePageHrefs(absolutizeReferences(homeHtml, '.')));
  const siteTitle = shell.title || 'Cloned Site';

  write(path.join(laravelDir, 'resources', 'views', 'layouts', 'app.blade.php'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>@yield('title', '${phpSingleQuote(siteTitle)}')</title>
  <meta name="description" content="@yield('description', '')">
@verbatim
  ${buildHeadExtras(shell)}
@endverbatim
</head>
<body>
@verbatim
${shell.headerHtml}
@endverbatim
@yield('content')
@verbatim
${shell.footerHtml}
${(shell.bodyScripts || []).join('\n')}
@endverbatim
</body>
</html>
`);

  let leadFormsFound = 0;
  let thankYouWritten = false;
  const routes = [];

  for (const pageFile of pages) {
    const pageDir = path.posix.dirname(pageFile);
    const rawHtml = stripSlickRuntime(fs.readFileSync(path.join(siteDir, pageFile), 'utf8'));
    let html = absolutizeReferences(rawHtml, pageDir);
    html = rewritePageHrefs(html);

    const { html: withLeads, found } = attachLeadForms(html);
    html = withLeads;
    leadFormsFound += found;

    const $ = cheerio.load(html, { decodeEntities: false });
    const title = $('title').text()?.trim() || siteTitle;
    const description = $('meta[name="description"]').attr('content')?.trim() || '';
    const bodyInner = extractBodyContent(html);
    const pageAssets = extractHeadAssets(html);
    const extraLinks = pageAssets.links.filter((tag) => !(shell.headLinks || []).includes(tag));

    const slug = routeSlug(pageFile);
    const isThankYou = isThankYouPageFile(pageFile) || slug === 'thank-you';

    if (isThankYou) {
      write(path.join(laravelDir, 'resources', 'views', 'thank-you.blade.php'), `@extends('layouts.app')

@section('title', '${phpSingleQuote(title)}')
@section('description', '${phpSingleQuote(description)}')

@section('content')
@if($successMsg ?? false)
<p class="cloner-lead-message" style="padding:1rem;text-align:center;">{{ $successMsg }}</p>
@endif
@verbatim
${extraLinks.join('\n')}
${bodyInner}
@endverbatim
@endsection
`);
      thankYouWritten = true;
      continue;
    }

    const viewName = viewNameFor(slug);
    const viewPath = path.join(laravelDir, 'resources', 'views', `${viewName.replace(/\./g, '/')}.blade.php`);
    write(viewPath, `@extends('layouts.app')

@section('title', '${phpSingleQuote(title)}')
@section('description', '${phpSingleQuote(description)}')

@section('content')
@verbatim
${extraLinks.join('\n')}
${bodyInner}
@endverbatim
@endsection
`);

    routes.push({ path: slug ? `/${slug}/` : '/', view: viewName });
  }

  if (!thankYouWritten) {
    write(path.join(laravelDir, 'resources', 'views', 'thank-you.blade.php'), `@extends('layouts.app')

@section('title', 'Thank You')

@section('content')
<div style="max-width:640px;margin:4rem auto;padding:0 1.5rem;text-align:center;font-family:sans-serif;">
  <h1>Thank you!</h1>
  <p>{{ $successMsg ?? '${phpSingleQuote(THANK_YOU_FALLBACK)}' }}</p>
</div>
@endsection
`);
  }

  const routeLines = routes
    .map(({ path: p, view }) => `Route::view(${JSON.stringify(p)}, ${JSON.stringify(view)});`)
    .join('\n');

  write(path.join(laravelDir, 'routes', 'web.php'), `<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\LeadController;

Route::post('/leads', [LeadController::class, 'store'])->name('leads.store');
Route::post('/leads/', [LeadController::class, 'store']);

Route::get('/thank-you', function (\\Illuminate\\Http\\Request $request) {
    return view('thank-you', ['successMsg' => $request->query('successMsg')]);
})->name('thank-you');

${routeLines}
`);

  return {
    pages: pages.length,
    leadFormsFound,
    structure: 'laravel',
    stack: {
      router: 'routes/web.php',
      views: 'resources/views/pages/**/*.blade.php',
      controllers: ['app/Http/Controllers/LeadController.php'],
      assets: 'public/',
      run: 'composer install && php artisan serve',
    },
  };
}

/** Rewrite every href="..." in the document to a safe, slugified route. */
function rewritePageHrefs(html) {
  return html.replace(/\bhref=(["'])([^"']*)\1/gi, (full, quote, href) => `href=${quote}${toSafePageHref(href)}${quote}`);
}
