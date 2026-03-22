<?php
/**
 * backend/cashier/password.php
 * Cashier-only: change own password.
 *
 * POST /backend/cashier/password.php
 * Body: { current_password, new_password, confirm_password }
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

$user = requireAuth('cashier');
requireMethod('POST');

$body    = getBody();
$current = $body['current_password']  ?? '';
$newPw   = $body['new_password']      ?? '';
$confirm = $body['confirm_password']  ?? '';

if (!$current || !$newPw || !$confirm) {
    sendError('All three fields are required.');
}

if ($newPw !== $confirm) {
    sendError('New passwords do not match.');
}

if (strlen($newPw) < 6) {
    sendError('New password must be at least 6 characters.');
}

$db   = getDB();
$stmt = $db->prepare('SELECT password FROM users WHERE id = ?');
$stmt->execute([$user['id']]);
$row  = $stmt->fetch();

if (!$row || $row['password'] !== $current) {
    sendError('Current password is incorrect.');
}

if ($newPw === $current) {
    sendError('New password must be different from the current one.');
}

$db->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([$newPw, $user['id']]);

// Update session password copy
session_start();
if (!empty($_SESSION['user'])) {
    $_SESSION['user']['password'] = $newPw;
}

sendSuccess(null, 'Password updated successfully.');
