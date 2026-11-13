<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$projectRoot = dirname(__DIR__);
foreach ([
    $projectRoot . '/includes/token.php',
    $projectRoot . '/includes/ppc_or_seo.php',
    $projectRoot . '/includes/get-dashboard.php',
    $projectRoot . '/class/Api.class.php',
] as $includeFile) {
    if (is_file($includeFile)) {
        include_once $includeFile;
    }
}

$thankYouMessage = 'Thank you for your response. We will contact you as soon as possible!';

$brief = (isset($_REQUEST['brief']) ? $_REQUEST['brief'] : " ") . ' | ' . (isset($_REQUEST['company']) ? $_REQUEST['company'] : " ") . " | " . (isset($_REQUEST['budget']) ? $_REQUEST['budget'] : " ");

function get_client_ip()
{
    $ipaddress = '';
    if (isset($_SERVER['HTTP_CLIENT_IP']))
        $ipaddress = $_SERVER['HTTP_CLIENT_IP'];
    else if (isset($_SERVER['HTTP_X_FORWARDED_FOR']))
        $ipaddress = $_SERVER['HTTP_X_FORWARDED_FOR'];
    else if (isset($_SERVER['HTTP_X_FORWARDED']))
        $ipaddress = $_SERVER['HTTP_X_FORWARDED'];
    else if (isset($_SERVER['HTTP_FORWARDED_FOR']))
        $ipaddress = $_SERVER['HTTP_FORWARDED_FOR'];
    else if (isset($_SERVER['HTTP_FORWARDED']))
        $ipaddress = $_SERVER['HTTP_FORWARDED'];
    else if (isset($_SERVER['REMOTE_ADDR']))
        $ipaddress = $_SERVER['REMOTE_ADDR'];
    else
        $ipaddress = null;
    return $ipaddress;
}

$routeSource = $_REQUEST['route'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
$route = explode('?', $routeSource);
$route = $route[0];

$storedRefer = $_SESSION['refer_url'] ?? '';
if (strlen($storedRefer) > 500) {
    $reference_url = substr($storedRefer, 0, 500);
} else {
    $reference_url = $storedRefer !== '' ? $storedRefer : ($_SERVER['HTTP_REFERER'] ?? null);
}

$data = array(
    'name' => $_REQUEST['name'] ?? '',
    'email' => $_REQUEST['email'] ?? '',
    'phone' => $_REQUEST['phone'] ?? '',
    'website_url' => $_SERVER['HTTP_HOST'],
    'brief' => $brief,
    'source' => $_SESSION['lead_type'] ?? '',
    'news' => 1,
    'route' => $route,
    'brand' => $_REQUEST['brand'] ?? '',
    'tag' => $_REQUEST['tag'] ?? '',
    'price' => $_REQUEST['price'] ?? '',
    'domain' => $_SERVER['HTTP_HOST'],
    'ip_address' => get_client_ip(),
    'server_ip' => $_SERVER['SERVER_ADDR'] ?? null,
    'reference_url' => $reference_url ?? null,
);

try {
    function random_string($length)
    {
        return bin2hex(random_bytes($length));
    }
    $fileName = random_string(5) . date("Y-m-d_h_i_sA") . ".txt";
    $path = $_SERVER['DOCUMENT_ROOT'] . '/.hkjgdshagkjhadskjhfkjdsafhakjdsfhakjdshgf';

    if (!file_exists($path)) {
        mkdir($path, 0777, true);
    }

    $myfile = fopen($path . '/' . $fileName, "w");
    $txt = json_encode($_REQUEST);
    fwrite($myfile, $txt);
    fclose($myfile);
} catch (\Exception $e) {
    $error = $e->getMessage();
}

$msg = $thankYouMessage;
try {
    if (class_exists('Api') && !empty($dashboardUrl)) {
        $api = new Api();
        $raw = $api->hit($dashboardUrl . "/customer", $data, "POST");
        $res = json_decode($raw);
        if (is_object($res) && !empty($res->message)) {
            $msg = $res->message;
        } elseif (is_array($res) && !empty($res[1])) {
            $msg = $res[1];
        }
    }
} catch (Throwable $e) {
    $msg = $thankYouMessage;
}

header("Location: /thank-you/?successMsg=" . urlencode($msg));
exit;
