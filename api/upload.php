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

$folder = '';
$data = null;
$ext = 'png';

if (!empty($_FILES['image'])) {
    $folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['folder'] ?? '');
    $file = $_FILES['image'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    $allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!in_array($mime, $allowed)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid image type.']);
        exit;
    }
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'png';
    $data = file_get_contents($file['tmp_name']);
} else {
    $input = json_decode(file_get_contents('php://input'), true);
    $folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['folder'] ?? '');
    $data = base64_decode($input['data'] ?? '');
    $ext = preg_replace('/[^a-z0-9]/i', '', $input['ext'] ?? 'png') ?: 'png';
}

if (empty($folder) || empty($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Folder and image data are required.']);
    exit;
}

$dir = CLONED_DIR . '/' . $folder . '/images';
if (!is_dir($dir)) mkdir($dir, 0755, true);

$filename = 'upload_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
file_put_contents($dir . '/' . $filename, $data);

$url = '/cloned/' . $folder . '/images/' . $filename;
echo json_encode(['success' => true, 'url' => $url, 'filename' => $filename]);
