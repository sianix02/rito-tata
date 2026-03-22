<?php
/**
 * backend/shared/auth.php
 * Handles: login, logout, register
 * Used by both admin and cashier frontends.
 *
 * POST /backend/shared/auth.php?action=login
 * POST /backend/shared/auth.php?action=logout
 * POST /backend/shared/auth.php?action=register
 * GET  /backend/shared/auth.php?action=me
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

session_start();

$action = $_GET['action'] ?? '';

// ── LOGIN ─────────────────────────────────────────────────────────────────────
if ($action === 'login') {
    requireMethod('POST');
    $body     = getBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (!$username || !$password) {
        sendError('Please enter username and password.');
    }

    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user) {
        sendError('Invalid username or password.');
    }

    if ($user['status'] === 'pending') {
        sendError('Your account is pending admin approval.');
    }

    if ($user['status'] === 'inactive') {
        sendError('Your account is deactivated. Contact the admin.');
    }

    // Plain-text comparison for demo. In production use password_verify().
    if ($user['password'] !== $password) {
        sendError('Invalid username or password.');
    }

    // Store user in session (exclude password)
    unset($user['password']);
    $_SESSION['user'] = $user;

    sendSuccess($user, 'Login successful.');
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
if ($action === 'logout') {
    session_destroy();
    sendSuccess(null, 'Logged out.');
}

// ── REGISTER (cashier self-registration — goes to pending) ────────────────────
if ($action === 'register') {
    requireMethod('POST');
    $body      = getBody();
    $firstname = trim($body['firstname'] ?? '');
    $mi        = strtoupper(trim($body['mi'] ?? ''));
    $lastname  = trim($body['lastname'] ?? '');
    $contact   = trim($body['contact'] ?? '');
    $username  = trim($body['username'] ?? '');
    $password  = $body['password'] ?? '';

    // Basic validation
    if (!$firstname || !$lastname || !$contact || !$username || !$password) {
        sendError('Please fill in all required fields.');
    }
    if (strlen($password) < 6) {
        sendError('Password must be at least 6 characters.');
    }

    $db = getDB();

    // Check if username already exists
    $stmt = $db->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        sendError('Username already taken. Choose another.');
    }

    // Insert as pending
    $stmt = $db->prepare('
        INSERT INTO users (firstname, mi, lastname, contact, username, password, role, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, "cashier", "pending", CURDATE())
    ');
    $stmt->execute([$firstname, $mi, $lastname, $contact, $username, $password]);

    sendSuccess(null, 'Registration submitted! Please wait for admin approval.', 201);
}

// ── ME — return current session user ─────────────────────────────────────────
if ($action === 'me') {
    if (empty($_SESSION['user'])) {
        sendError('Not authenticated.', 401);
    }
    sendSuccess($_SESSION['user']);
}

sendError('Unknown action.', 404);
