<?php
/**
 * backend/shared/products.php
 * Read-only product listing used by both admin and cashier.
 *
 * GET /backend/shared/products.php              — all products
 * GET /backend/shared/products.php?id=5         — single product
 * GET /backend/shared/products.php?category=Oil — filter by category
 * GET /backend/shared/products.php?search=rice  — search by name
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

requireMethod('GET');
requireAuth(); // any logged-in user

$db = getDB();

// ── Single product by ID ──────────────────────────────────────────────────────
if (!empty($_GET['id'])) {
    $stmt = $db->prepare('SELECT * FROM products WHERE id = ? LIMIT 1');
    $stmt->execute([(int)$_GET['id']]);
    $product = $stmt->fetch();
    if (!$product) sendError('Product not found.', 404);
    sendSuccess($product);
}

// ── Build dynamic query with optional filters ─────────────────────────────────
$sql    = 'SELECT * FROM products WHERE 1=1';
$params = [];

if (!empty($_GET['category'])) {
    $sql    .= ' AND category = ?';
    $params[] = $_GET['category'];
}

if (!empty($_GET['search'])) {
    $sql    .= ' AND name LIKE ?';
    $params[] = '%' . $_GET['search'] . '%';
}

$sql .= ' ORDER BY category, name';

$stmt = $db->prepare($sql);
$stmt->execute($params);
$products = $stmt->fetchAll();

// Add low_stock flag for convenience
foreach ($products as &$p) {
    $p['is_low'] = (int)$p['qty'] <= (int)$p['low_stock'];
}

sendSuccess($products);
