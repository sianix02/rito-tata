<?php
/**
 * backend/config/api_helper.php
 * Shared helpers used by every API endpoint.
 */

// ── CORS headers (needed if frontend and backend are on different ports) ──────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Always respond with JSON ──────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');

/**
 * Send a success JSON response and stop execution.
 */
function sendSuccess(mixed $data = null, string $message = 'OK', int $code = 200): void {
    http_response_code($code);
    echo json_encode([
        'success' => true,
        'message' => $message,
        'data'    => $data,
    ]);
    exit;
}

/**
 * Send an error JSON response and stop execution.
 */
function sendError(string $message, int $code = 400): void {
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'message' => $message,
        'data'    => null,
    ]);
    exit;
}

/**
 * Get the JSON body sent in the request (for POST/PUT).
 */
function getBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

/**
 * Require a specific HTTP method, send 405 otherwise.
 */
function requireMethod(string ...$methods): void {
    if (!in_array($_SERVER['REQUEST_METHOD'], $methods, true)) {
        sendError('Method not allowed.', 405);
    }
}

/**
 * Simple session-based auth check.
 * Returns the current user array or sends 401.
 */
function requireAuth(string $role = ''): array {
    session_start();
    if (empty($_SESSION['user'])) {
        sendError('Not authenticated.', 401);
    }
    $user = $_SESSION['user'];
    if ($role && $user['role'] !== $role) {
        sendError('Access denied.', 403);
    }
    return $user;
}
