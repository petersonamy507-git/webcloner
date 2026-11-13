<?php

define('CLONED_DIR', dirname(__DIR__) . '/cloned');
define('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10 MB per file
define('MAX_TOTAL_SIZE', 50 * 1024 * 1024); // 50 MB total
define('REQUEST_TIMEOUT', 30);
define('USER_AGENT', 'WebsiteCloner/1.0');

if (!is_dir(CLONED_DIR)) {
    mkdir(CLONED_DIR, 0755, true);
}
