<?php

require_once __DIR__ . '/config.php';

$folder = $_GET['folder'] ?? '';
$folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $folder);

if (empty($folder)) {
    http_response_code(400);
    echo 'Invalid folder name.';
    exit;
}

$dir = CLONED_DIR . '/' . $folder;
if (!is_dir($dir)) {
    http_response_code(404);
    echo 'Clone not found.';
    exit;
}

$zipPath = sys_get_temp_dir() . '/' . $folder . '.zip';
$zip = new ZipArchive();

if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    http_response_code(500);
    echo 'Could not create ZIP file.';
    exit;
}

$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::LEAVES_ONLY
);

foreach ($files as $file) {
    if ($file->isFile()) {
        $filePath = $file->getRealPath();
        $relativePath = substr($filePath, strlen($dir) + 1);
        $zip->addFile($filePath, $relativePath);
    }
}

$zip->close();

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $folder . '.zip"');
header('Content-Length: ' . filesize($zipPath));
readfile($zipPath);
unlink($zipPath);
