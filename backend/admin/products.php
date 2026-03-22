<?php
/**
 * backend/admin/products.php
 * Admin-only: full CRUD for products + restock.
 *
 * GET    ?action=list                   — all products (with low_stock flag)
 * POST   ?action=add                    — add new product
 * PUT    ?action=edit&id=3              — edit product details
 * DELETE ?action=delete&id=3           — delete a product
 * POST   ?action=restock&id=3          — add qty to existing stock
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

requireAuth('admin');

$db     = getDB();
$action = $_GET['action'] ?? '';

// ── LIST ALL PRODUCTS ─────────────────────────────────────────────────────────
if ($action === 'list') {
    requireMethod('GET');
    $stmt = $db->query('SELECT * FROM products ORDER BY category, name');
    $rows = $stmt->fetchAll();
    foreach ($rows as &$p) {
        $p['is_low']      = (int)$p['qty'] <= (int)$p['low_stock'];
        $p['is_critical'] = (int)$p['qty'] <= (int)floor($p['low_stock'] / 2);
    }
    sendSuccess($rows);
}

// ── ADD PRODUCT ───────────────────────────────────────────────────────────────
if ($action === 'add') {
    requireMethod('POST');
    $body = getBody();
    $name      = trim($body['name']      ?? '');
    $category  = trim($body['category']  ?? '');
    $price     = (float)($body['price']  ?? 0);
    $qty       = (int)  ($body['qty']    ?? 0);
    $low_stock = (int)  ($body['low_stock'] ?? 10);

    if (!$name || !$category || $price <= 0) {
        sendError('Name, category, and a valid price are required.');
    }

    $stmt = $db->prepare('
        INSERT INTO products (name, category, price, qty, low_stock)
        VALUES (?, ?, ?, ?, ?)
    ');
    $stmt->execute([$name, $category, $price, $qty, $low_stock]);
    $newId = $db->lastInsertId();

    // Return the newly created product
    $stmt = $db->prepare('SELECT * FROM products WHERE id = ?');
    $stmt->execute([$newId]);
    sendSuccess($stmt->fetch(), 'Product added.', 201);
}

// ── EDIT PRODUCT ──────────────────────────────────────────────────────────────
if ($action === 'edit') {
    requireMethod('PUT');
    $id   = (int)($_GET['id'] ?? 0);
    $body = getBody();
    $name      = trim($body['name']      ?? '');
    $category  = trim($body['category']  ?? '');
    $price     = (float)($body['price']  ?? 0);
    $qty       = (int)  ($body['qty']    ?? 0);
    $low_stock = (int)  ($body['low_stock'] ?? 10);

    if (!$id || !$name || !$category || $price <= 0) {
        sendError('All fields are required.');
    }

    $stmt = $db->prepare('
        UPDATE products SET name=?, category=?, price=?, qty=?, low_stock=?
        WHERE id=?
    ');
    $stmt->execute([$name, $category, $price, $qty, $low_stock, $id]);
    if ($stmt->rowCount() === 0) sendError('Product not found.');

    sendSuccess(null, 'Product updated.');
}

// ── DELETE PRODUCT ────────────────────────────────────────────────────────────
if ($action === 'delete') {
    requireMethod('DELETE');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) sendError('Invalid product ID.');

    $stmt = $db->prepare('DELETE FROM products WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) sendError('Product not found.');

    sendSuccess(null, 'Product deleted.');
}

// ── RESTOCK (add qty) ─────────────────────────────────────────────────────────
if ($action === 'restock') {
    requireMethod('POST');
    $id   = (int)($_GET['id'] ?? 0);
    $body = getBody();
    $addQty = (int)($body['qty'] ?? 0);

    if (!$id || $addQty < 1) sendError('Product ID and quantity >= 1 are required.');

    // Read current qty so we can return the new total
    $stmt = $db->prepare('SELECT qty, name FROM products WHERE id = ?');
    $stmt->execute([$id]);
    $product = $stmt->fetch();
    if (!$product) sendError('Product not found.');

    $db->prepare('UPDATE products SET qty = qty + ? WHERE id = ?')->execute([$addQty, $id]);
    $newQty = $product['qty'] + $addQty;

    sendSuccess(
        ['new_qty' => $newQty],
        "Added {$addQty} units to \"{$product['name']}\". New stock: {$newQty}."
    );
}

sendError('Unknown action.', 404);
