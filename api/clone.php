<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

require_once __DIR__ . '/WebsiteCloner.php';

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || empty($input['url'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'URL is required.']);
    exit;
}

$url = filter_var(trim($input['url']), FILTER_SANITIZE_URL);
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    if (!filter_var('https://' . ltrim($url, '/'), FILTER_VALIDATE_URL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid URL format.']);
        exit;
    }
}

$folderName = !empty($input['folderName'])
    ? preg_replace('/[^a-zA-Z0-9_-]/', '', $input['folderName'])
    : 'clone_' . time();

if (empty($folderName)) {
    $folderName = 'clone_' . time();
}

try {
    $cloner = new WebsiteCloner($url, $folderName);
    $result = $cloner->clone();

    echo json_encode([
        'success' => true,
        'url' => $url,
        'folder' => $result['folder'],
        'filesDownloaded' => $result['filesDownloaded'],
        'totalSize' => $result['totalSize'],
        'previewUrl' => '/cloned/' . $result['folder'] . '/index.html',
        'downloadUrl' => '/api/download.php?folder=' . urlencode($result['folder']),
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
} catch (RuntimeException $e) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'An unexpected error occurred: ' . $e->getMessage()]);
}
