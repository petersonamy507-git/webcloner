<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/config.php';

$folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['folder'] ?? '');

if (empty($folder)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Folder is required.']);
    exit;
}

$dir = CLONED_DIR . '/' . $folder;

if (!is_dir($dir)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Clone folder not found.']);
    exit;
}

$pages = [];
$files = scandir($dir);

foreach ($files as $file) {
    if (preg_match('/\.html?$/i', $file)) {
        $label = $file === 'index.html' ? 'Home' : ucfirst(str_replace(['-', '_', '.html'], [' ', ' ', ''], $file));
        $pages[] = ['file' => $file, 'label' => $label];
    }
}

usort($pages, function ($a, $b) {
    if ($a['file'] === 'index.html') return -1;
    if ($b['file'] === 'index.html') return 1;
    return strcmp($a['file'], $b['file']);
});

echo json_encode(['success' => true, 'pages' => $pages]);
