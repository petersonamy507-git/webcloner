<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

$folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['folder'] ?? '');
$page = basename($input['page'] ?? 'index.html');
$html = $input['html'] ?? '';

if (empty($folder) || empty($html)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Folder and HTML are required.']);
    exit;
}

if (!preg_match('/\.html?$/i', $page)) {
    $page = 'index.html';
}

$dir = CLONED_DIR . '/' . $folder;
$file = $dir . '/' . $page;

if (!is_dir($dir)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Clone folder not found.']);
    exit;
}

if (file_put_contents($file, $html) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not save file.']);
    exit;
}

echo json_encode(['success' => true, 'file' => $page]);
