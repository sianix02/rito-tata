<?php
/**
 * backend/admin/users.php
 * Admin-only: manage user accounts and pending registrations.
 *
 * GET    ?action=list_cashiers    — list all cashier accounts
 * GET    ?action=list_pending     — list pending registrations
 * POST   ?action=approve&id=1001  — approve a pending user
 * POST   ?action=decline&id=1001  — decline (delete) a pending user
 * POST   ?action=toggle&id=3      — toggle active/inactive
 * PUT    ?action=edit&id=3        — edit name/contact
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

requireAuth('admin');   // Admin only

$db     = getDB();
$action = $_GET['action'] ?? '';

// ── LIST CASHIERS ─────────────────────────────────────────────────────────────
if ($action === 'list_cashiers') {
    requireMethod('GET');
    $stmt = $db->query("
        SELECT id, firstname, mi, lastname, contact, username, status, created_at
        FROM users
        WHERE role = 'cashier' AND status != 'pending'
        ORDER BY firstname
    ");
    sendSuccess($stmt->fetchAll());
}

// ── LIST PENDING ──────────────────────────────────────────────────────────────
if ($action === 'list_pending') {
    requireMethod('GET');
    $stmt = $db->query("
        SELECT id, firstname, mi, lastname, contact, username, created_at
        FROM users
        WHERE status = 'pending'
        ORDER BY created_at DESC
    ");
    sendSuccess($stmt->fetchAll());
}

// ── APPROVE PENDING USER ──────────────────────────────────────────────────────
if ($action === 'approve') {
    requireMethod('POST');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) sendError('Invalid user ID.');

    $stmt = $db->prepare("UPDATE users SET status = 'active' WHERE id = ? AND status = 'pending'");
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) sendError('User not found or already approved.');

    sendSuccess(null, 'User approved successfully.');
}

// ── DECLINE (delete) PENDING USER ────────────────────────────────────────────
if ($action === 'decline') {
    requireMethod('POST');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) sendError('Invalid user ID.');

    $stmt = $db->prepare("DELETE FROM users WHERE id = ? AND status = 'pending'");
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) sendError('Pending user not found.');

    sendSuccess(null, 'Registration declined and removed.');
}

// ── TOGGLE ACTIVE / INACTIVE ──────────────────────────────────────────────────
if ($action === 'toggle') {
    requireMethod('POST');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) sendError('Invalid user ID.');

    // Read current status
    $stmt = $db->prepare("SELECT status FROM users WHERE id = ? AND role = 'cashier'");
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user) sendError('Cashier not found.');

    $newStatus = $user['status'] === 'active' ? 'inactive' : 'active';
    $db->prepare("UPDATE users SET status = ? WHERE id = ?")->execute([$newStatus, $id]);

    sendSuccess(['status' => $newStatus], "Account set to {$newStatus}.");
}

// ── EDIT USER (name / contact) ────────────────────────────────────────────────
if ($action === 'edit') {
    requireMethod('PUT');
    $id   = (int)($_GET['id'] ?? 0);
    $body = getBody();
    $firstname = trim($body['firstname'] ?? '');
    $mi        = strtoupper(trim($body['mi'] ?? ''));
    $lastname  = trim($body['lastname'] ?? '');
    $contact   = trim($body['contact'] ?? '');

    if (!$id || !$firstname || !$lastname) sendError('First name, last name, and ID are required.');

    $stmt = $db->prepare("
        UPDATE users SET firstname=?, mi=?, lastname=?, contact=?
        WHERE id=? AND role='cashier'
    ");
    $stmt->execute([$firstname, $mi, $lastname, $contact, $id]);
    if ($stmt->rowCount() === 0) sendError('Cashier not found or nothing changed.');

    sendSuccess(null, 'Staff info updated.');
}

sendError('Unknown action.', 404);
