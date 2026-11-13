<?php

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (str_starts_with($uri, '/api/')) {
    $apiFile = __DIR__ . '/api/' . basename($uri);
    if (file_exists($apiFile) && is_file($apiFile)) {
        require $apiFile;
        return true;
    }
    $file = __DIR__ . $uri;
    if (file_exists($file) && is_file($file)) {
        require $file;
        return true;
    }
    http_response_code(404);
    echo json_encode(['error' => 'API endpoint not found.']);
    return true;
}

if (str_starts_with($uri, '/cloned/')) {
    $file = __DIR__ . $uri;
    if (file_exists($file) && is_file($file)) {
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $mimeTypes = [
            'html' => 'text/html',
            'css' => 'text/css',
            'js' => 'application/javascript',
            'json' => 'application/json',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            'webp' => 'image/webp',
            'ico' => 'image/x-icon',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf',
            'mp4' => 'video/mp4',
            'webm' => 'video/webm',
        ];
        $mime = $mimeTypes[$ext] ?? 'application/octet-stream';
        header('Content-Type: ' . $mime);
        readfile($file);
        return true;
    }
    http_response_code(404);
    echo 'File not found.';
    return true;
}

return false;
