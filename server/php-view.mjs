/**
 * File formats of the custom PHP stack (index.php router, views/, includes/),
 * matching the reference project: a view starts with its <title> and meta
 * description, then includes head.php, header.php and footer.php, and
 * footer.php closes </body></html>.
 */

const esc = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function phpViewDocument({ title = '', description = '', extraHead = '', body = '' }) {
  return `<!DOCTYPE html>
<html lang="en">

<title>${esc(title)}</title>
<meta name="description"
    content="${esc(description)}">

<?php include_once("includes/head.php")?>
${extraHead ? `${extraHead}\n` : ''}
<body>

    <?php include_once("includes/header.php")?>

${body}

    <?php include_once("includes/footer.php")?>
`;
}

export const FOOTER_CLOSE = '\n</body>\n\n</html>\n';

export function headPhp({ links = [], styles = [] } = {}) {
  return `<?php
include_once("token.php");
include_once("ppc_or_seo.php");
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
if (isset($_SERVER['HTTPS'])) {
	$requesMet = "https";
}else{
	$requesMet = "http";
}
?>
<base href="<?= $requesMet.'://'.$_SERVER['HTTP_HOST'].'/' ?>">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index, follow">
    ${[...links, ...styles].join('\n    ')}
    <link rel="icon" type="image/x-icon" href="favicon.png">
</head>
`;
}

export const INDEX_PHP = `<?php
// Local preview with \`php -S\`: let the built-in server hand out real files (CSS, images, ...).
if (PHP_SAPI === 'cli-server') {
    $path = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
    if ($path !== '/' && is_file(__DIR__ . $path)) {
        return false;
    }
}
ob_start();
session_start();


$url = $_SERVER['REQUEST_URI'];

$current_url = explode('?', $url);
$url = $current_url[0];

$dir    = __DIR__.'/views';

$files = array_slice(scandir($dir), 2);

$fileWithOutExt = array();

foreach($files as $file){
    // remove end slash if you dont need traling slash
    $without_extension = '/'.pathinfo($file, PATHINFO_FILENAME).'/';
    array_push($fileWithOutExt,$without_extension);
}

if($url=="/"){
    require $dir.'/home.php';
    die();
}

// Nested pages (/en/contact/) live in views as en-contact.php.
$slug = str_replace('/', '-', trim($url, '/'));

if (in_array('/'.$slug.'/',$fileWithOutExt)) {

  require $dir.'/'.$slug.'.php';

}

else{
    header("location:/");
    require $dir.'/404.php';
}
?>`;

export const HTACCESS = `RewriteEngine on

# Force www (Ensure www is added before HTTPS redirect)
RewriteCond %{HTTP_HOST} !^www\\. [NC]
RewriteCond %{HTTP_HOST} ^(.+)$
RewriteRule ^ https://www.%1%{REQUEST_URI} [R=301,L]

# Force HTTPS (Preserve trailing slash)
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L,NE]

# Redirect index.html to root
Redirect 301 /index.html /

# Ensure URLs have a trailing slash (for non-file requests)
RewriteCond %{REQUEST_URI} !(\\.[a-zA-Z0-9]{2,4})$
RewriteCond %{REQUEST_URI} !(.*)/$
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1/ [R=301,L]

# Handle Front Controller (WordPress or custom routing)
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^(.*)$ /index.php?path=$1 [NC,L,QSA]

# HTTP Strict Transport Security (HSTS)
Header set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" env=HTTPS

# Enable Gzip Compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain text/html text/css text/javascript application/javascript application/x-javascript application/xml application/xhtml+xml application/rss+xml application/atom_xml application/json application/ld+json application/vnd.ms-fontobject font/ttf font/otf font/woff image/svg+xml
    SetEnvIfNoCase Request_URI \\.(?:gif|jpe?g|png)$ no-gzip dont-vary
    DeflateCompressionLevel 6
</IfModule>
`;

export function robotsTxt(origin) {
  return `User-agent: *
Allow: /
Allow: /leads/
${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`;
}

/** paths: site-root URL paths like "/" or "/about-us/". */
export function sitemapXml(origin, paths) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
  const base = origin || '';
  const urls = paths.map((p) => `  <url>
       <loc>${esc(base + p)}</loc>
       <lastmod>${now}</lastmod>
       <changefreq>daily</changefreq>
       <priority>${p === '/' ? '1.0000' : '0.8000'}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">

${urls}
</urlset>
`;
}
