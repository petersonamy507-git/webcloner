<?php

require_once __DIR__ . '/config.php';

class WebsiteCloner
{
    private string $baseUrl;
    private string $baseHost;
    private string $outputDir;
    private array $downloaded = [];
    private int $totalSize = 0;
    private int $filesCount = 0;

    public function __construct(string $url, string $folderName)
    {
        $url = $this->normalizeUrl($url);
        $parsed = parse_url($url);

        if (!$parsed || empty($parsed['host'])) {
            throw new InvalidArgumentException('Invalid URL provided.');
        }

        $this->baseUrl = $this->getBaseUrl($parsed);
        $this->baseHost = $parsed['scheme'] . '://' . $parsed['host'];
        $this->outputDir = CLONED_DIR . '/' . $folderName;

        if (is_dir($this->outputDir)) {
            $this->removeDir($this->outputDir);
        }
        mkdir($this->outputDir, 0755, true);
    }

    public function clone(): array
    {
        $html = $this->fetch($this->baseUrl);
        if ($html === null) {
            throw new RuntimeException('Could not fetch the website. Check if the URL is accessible.');
        }

        $dom = new DOMDocument('1.0', 'UTF-8');
        libxml_use_internal_errors(true);
        $dom->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'));
        libxml_clear_errors();

        $this->processStylesheets($dom);
        $this->processScripts($dom);
        $this->processImages($dom);
        $this->processLinks($dom);
        $this->processMedia($dom);
        $this->processFavicons($dom);
        $this->processInlineStyles($dom);

        $this->removeBaseTag($dom);

        $finalHtml = $dom->saveHTML();
        file_put_contents($this->outputDir . '/index.html', $finalHtml);

        return [
            'folder' => basename($this->outputDir),
            'filesDownloaded' => $this->filesCount,
            'totalSize' => $this->formatSize($this->totalSize),
            'totalBytes' => $this->totalSize,
        ];
    }

    private function processStylesheets(DOMDocument $dom): void
    {
        $links = $dom->getElementsByTagName('link');
        foreach ($links as $link) {
            $rel = strtolower($link->getAttribute('rel'));
            if (!in_array($rel, ['stylesheet', 'preload', 'prefetch'])) {
                continue;
            }
            $href = $link->getAttribute('href');
            if (empty($href) || $this->isSkippedUrl($href)) {
                continue;
            }

            $absoluteUrl = $this->resolveUrl($href);
            $localPath = $this->downloadAsset($absoluteUrl, 'css');
            if ($localPath) {
                $link->setAttribute('href', $localPath);
            }
        }
    }

    private function processScripts(DOMDocument $dom): void
    {
        $scripts = $dom->getElementsByTagName('script');
        foreach ($scripts as $script) {
            $src = $script->getAttribute('src');
            if (empty($src) || $this->isSkippedUrl($src)) {
                continue;
            }

            $absoluteUrl = $this->resolveUrl($src);
            $localPath = $this->downloadAsset($absoluteUrl, 'js');
            if ($localPath) {
                $script->setAttribute('src', $localPath);
            }
        }
    }

    private function processImages(DOMDocument $dom): void
    {
        $tags = ['img', 'source', 'input'];
        $attrs = ['src', 'srcset', 'data-src', 'data-lazy-src'];

        foreach ($tags as $tag) {
            $elements = $dom->getElementsByTagName($tag);
            foreach ($elements as $el) {
                foreach ($attrs as $attr) {
                    $value = $el->getAttribute($attr);
                    if (empty($value)) {
                        continue;
                    }

                    if ($attr === 'srcset') {
                        $el->setAttribute($attr, $this->processSrcset($value));
                    } else {
                        if ($this->isSkippedUrl($value)) {
                            continue;
                        }
                        $absoluteUrl = $this->resolveUrl($value);
                        $localPath = $this->downloadAsset($absoluteUrl, 'images');
                        if ($localPath) {
                            $el->setAttribute($attr, $localPath);
                        }
                    }
                }
            }
        }
    }

    private function processLinks(DOMDocument $dom): void
    {
        $links = $dom->getElementsByTagName('a');
        foreach ($links as $link) {
            $href = $link->getAttribute('href');
            if (empty($href) || str_starts_with($href, '#') || str_starts_with($href, 'mailto:') || str_starts_with($href, 'tel:')) {
                continue;
            }
            if ($this->isExternalUrl($href)) {
                $link->setAttribute('target', '_blank');
                $link->setAttribute('rel', 'noopener noreferrer');
            }
        }
    }

    private function processMedia(DOMDocument $dom): void
    {
        foreach (['video', 'audio'] as $tag) {
            $elements = $dom->getElementsByTagName($tag);
            foreach ($elements as $el) {
                $src = $el->getAttribute('src');
                if (!empty($src) && !$this->isSkippedUrl($src)) {
                    $localPath = $this->downloadAsset($this->resolveUrl($src), 'media');
                    if ($localPath) {
                        $el->setAttribute('src', $localPath);
                    }
                }
            }
        }
    }

    private function processFavicons(DOMDocument $dom): void
    {
        $links = $dom->getElementsByTagName('link');
        foreach ($links as $link) {
            $rel = strtolower($link->getAttribute('rel'));
            if (!str_contains($rel, 'icon') && $rel !== 'apple-touch-icon') {
                continue;
            }
            $href = $link->getAttribute('href');
            if (empty($href) || $this->isSkippedUrl($href)) {
                continue;
            }
            $localPath = $this->downloadAsset($this->resolveUrl($href), 'images');
            if ($localPath) {
                $link->setAttribute('href', $localPath);
            }
        }
    }

    private function processInlineStyles(DOMDocument $dom): void
    {
        $elements = $dom->getElementsByTagName('*');
        foreach ($elements as $el) {
            $style = $el->getAttribute('style');
            if (!empty($style)) {
                $el->setAttribute('style', $this->rewriteCssUrls($style));
            }
        }
    }

    private function removeBaseTag(DOMDocument $dom): void
    {
        $bases = $dom->getElementsByTagName('base');
        while ($bases->length > 0) {
            $bases->item(0)->parentNode->removeChild($bases->item(0));
        }
    }

    private function downloadAsset(string $url, string $subdir): ?string
    {
        if (isset($this->downloaded[$url])) {
            return $this->downloaded[$url];
        }

        if ($this->totalSize >= MAX_TOTAL_SIZE) {
            return null;
        }

        $content = $this->fetch($url);
        if ($content === null) {
            return null;
        }

        $size = strlen($content);
        if ($size > MAX_FILE_SIZE) {
            return null;
        }

        $this->totalSize += $size;

        $ext = $this->getExtensionFromUrl($url);
        $filename = $this->sanitizeFilename(basename(parse_url($url, PHP_URL_PATH) ?: 'file'));
        if (empty(pathinfo($filename, PATHINFO_EXTENSION)) && $ext) {
            $filename .= '.' . $ext;
        }
        if ($filename === '.' || $filename === '') {
            $filename = 'asset_' . md5($url) . ($ext ? '.' . $ext : '');
        }

        $dir = $this->outputDir . '/' . $subdir;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $filepath = $dir . '/' . $filename;
        $counter = 1;
        $base = pathinfo($filename, PATHINFO_FILENAME);
        $extPart = pathinfo($filename, PATHINFO_EXTENSION);
        while (file_exists($filepath)) {
            $filepath = $dir . '/' . $base . '_' . $counter . ($extPart ? '.' . $extPart : '');
            $counter++;
        }

        if ($subdir === 'css' || str_ends_with($filename, '.css')) {
            $content = $this->rewriteCssUrls($content);
            $this->downloadCssAssets($content, $url);
        }

        file_put_contents($filepath, $content);

        $relativePath = $subdir . '/' . basename($filepath);
        $this->downloaded[$url] = $relativePath;
        $this->filesCount++;

        return $relativePath;
    }

    private function downloadCssAssets(string $css, string $cssUrl): void
    {
        preg_match_all('/url\(\s*[\'"]?([^\'"\)]+)[\'"]?\s*\)/i', $css, $matches);
        foreach ($matches[1] as $assetUrl) {
            $assetUrl = trim($assetUrl);
            if ($this->isSkippedUrl($assetUrl)) {
                continue;
            }
            $absolute = $this->resolveUrl($assetUrl, $cssUrl);
            $this->downloadAsset($absolute, 'images');
        }

        preg_match_all('/@import\s+[\'"]([^\'"]+)[\'"]/i', $css, $imports);
        foreach ($imports[1] as $importUrl) {
            $absolute = $this->resolveUrl($importUrl, $cssUrl);
            $this->downloadAsset($absolute, 'css');
        }
    }

    private function rewriteCssUrls(string $css): string
    {
        return preg_replace_callback(
            '/url\(\s*[\'"]?([^\'"\)]+)[\'"]?\s*\)/i',
            function ($match) {
                $url = trim($match[1]);
                if ($this->isSkippedUrl($url)) {
                    return $match[0];
                }
                $absolute = $this->resolveUrl($url);
                if (isset($this->downloaded[$absolute])) {
                    $local = $this->downloaded[$absolute];
                    $depth = substr_count($local, '/');
                    return 'url(' . $local . ')';
                }
                return $match[0];
            },
            $css
        );
    }

    private function processSrcset(string $srcset): string
    {
        $parts = explode(',', $srcset);
        $result = [];
        foreach ($parts as $part) {
            $part = trim($part);
            $pieces = preg_split('/\s+/', $part, 2);
            $url = $pieces[0];
            $descriptor = $pieces[1] ?? '';

            if (!$this->isSkippedUrl($url)) {
                $local = $this->downloadAsset($this->resolveUrl($url), 'images');
                if ($local) {
                    $url = $local;
                }
            }
            $result[] = $url . ($descriptor ? ' ' . $descriptor : '');
        }
        return implode(', ', $result);
    }

    private function fetch(string $url): ?string
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => REQUEST_TIMEOUT,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => USER_AGENT,
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.5',
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $httpCode >= 400) {
            return null;
        }

        return $response;
    }

    private function resolveUrl(string $url, ?string $base = null): string
    {
        $url = trim($url);

        if (str_starts_with($url, 'data:') || str_starts_with($url, 'blob:') || str_starts_with($url, 'javascript:')) {
            return $url;
        }

        if (preg_match('/^https?:\/\//i', $url)) {
            return $url;
        }

        if (str_starts_with($url, '//')) {
            $scheme = parse_url($base ?? $this->baseUrl, PHP_URL_SCHEME) ?: 'https';
            return $scheme . ':' . $url;
        }

        $baseForResolve = $base ?? $this->baseUrl;

        if (str_starts_with($url, '/')) {
            return $this->baseHost . $url;
        }

        $basePath = parse_url($baseForResolve, PHP_URL_PATH) ?: '/';
        $baseDir = dirname($basePath);
        if ($baseDir === '\\' || $baseDir === '.') {
            $baseDir = '/';
        }

        $resolved = $this->baseHost . rtrim($baseDir, '/') . '/' . $url;
        $resolved = preg_replace('/\/+/', '/', $resolved);
        $resolved = str_replace(':/', '://', $resolved);

        return $resolved;
    }

    private function isSkippedUrl(string $url): bool
    {
        return str_starts_with($url, 'data:')
            || str_starts_with($url, 'blob:')
            || str_starts_with($url, 'javascript:')
            || str_starts_with($url, '#');
    }

    private function isExternalUrl(string $url): bool
    {
        if (!preg_match('/^https?:\/\//i', $url)) {
            return false;
        }
        $host = parse_url($url, PHP_URL_HOST);
        $baseHost = parse_url($this->baseHost, PHP_URL_HOST);
        return $host !== $baseHost;
    }

    private function normalizeUrl(string $url): string
    {
        $url = trim($url);
        if (!preg_match('/^https?:\/\//i', $url)) {
            $url = 'https://' . $url;
        }
        return $url;
    }

    private function getBaseUrl(array $parsed): string
    {
        $url = $parsed['scheme'] . '://' . $parsed['host'];
        if (!empty($parsed['port'])) {
            $url .= ':' . $parsed['port'];
        }
        $path = $parsed['path'] ?? '/';
        if (!str_ends_with($path, '/')) {
            $path = dirname($path) . '/';
        }
        return $url . $path;
    }

    private function getExtensionFromUrl(string $url): string
    {
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $map = [
            'jpeg' => 'jpg',
            'svg+xml' => 'svg',
        ];
        return $map[$ext] ?? $ext;
    }

    private function sanitizeFilename(string $name): string
    {
        $name = urldecode($name);
        $name = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
        return $name ?: 'file';
    }

    private function formatSize(int $bytes): string
    {
        if ($bytes < 1024) {
            return $bytes . ' B';
        }
        if ($bytes < 1048576) {
            return round($bytes / 1024, 1) . ' KB';
        }
        return round($bytes / 1048576, 1) . ' MB';
    }

    private function removeDir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $items = scandir($dir);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . '/' . $item;
            is_dir($path) ? $this->removeDir($path) : unlink($path);
        }
        rmdir($dir);
    }
}
