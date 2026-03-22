<?php
/**
 * backend/config/db.php
 * Database connection — edit host/user/pass to match your Laragon setup.
 * Laragon defaults: host=localhost, user=root, pass='' (empty)
 */

define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');          // Laragon default is empty password
define('DB_NAME', 'ritotata_db');

function getDB(): PDO {
    static $pdo = null;         // reuse the same connection per request
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}
