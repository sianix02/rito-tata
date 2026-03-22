<?php
/**
 * backend/cashier/transaction.php
 * Cashier-only: create a new transaction (POST) or get cashier's own list (GET).
 *
 * GET  ?action=list        — my transactions
 * GET  ?action=detail&id=3 — single transaction with items
 * POST ?action=create      — submit a new sale
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

$user = requireAuth('cashier');
$db   = getDB();

$action = $_GET['action'] ?? '';

// ── MY TRANSACTION LIST ───────────────────────────────────────────────────────
if ($action === 'list') {
    requireMethod('GET');
    $stmt = $db->prepare('
        SELECT id, txn_code, total, txn_date, txn_time
        FROM transactions
        WHERE cashier_id = ?
        ORDER BY txn_date DESC, txn_time DESC
    ');
    $stmt->execute([$user['id']]);
    sendSuccess($stmt->fetchAll());
}

// ── SINGLE TRANSACTION DETAIL ─────────────────────────────────────────────────
if ($action === 'detail') {
    requireMethod('GET');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) sendError('Invalid ID.');

    $stmt = $db->prepare('SELECT * FROM transactions WHERE id = ? AND cashier_id = ?');
    $stmt->execute([$id, $user['id']]);
    $txn = $stmt->fetch();
    if (!$txn) sendError('Transaction not found.', 404);

    $stmt = $db->prepare('SELECT * FROM transaction_items WHERE transaction_id = ?');
    $stmt->execute([$id]);
    $txn['items'] = $stmt->fetchAll();

    sendSuccess($txn);
}

// ── CREATE NEW TRANSACTION ────────────────────────────────────────────────────
if ($action === 'create') {
    requireMethod('POST');
    $body  = getBody();
    $items = $body['items'] ?? [];   // array of { product_id, qty }

    if (empty($items)) sendError('Cart is empty.');

    $db->beginTransaction();     // all-or-nothing: either every stock deduction succeeds or none
    try {
        $total         = 0;
        $lineItems     = [];

        foreach ($items as $item) {
            $productId = (int)($item['product_id'] ?? 0);
            $qty       = (int)($item['qty']        ?? 0);
            if ($productId < 1 || $qty < 1) throw new \Exception("Invalid item in cart.");

            // Lock the row and read current stock
            $stmt = $db->prepare('SELECT id, name, price, qty FROM products WHERE id = ? FOR UPDATE');
            $stmt->execute([$productId]);
            $product = $stmt->fetch();
            if (!$product) throw new \Exception("Product ID {$productId} not found.");
            if ($product['qty'] < $qty) {
                throw new \Exception("Not enough stock for \"{$product['name']}\" (available: {$product['qty']}).");
            }

            // Deduct stock
            $db->prepare('UPDATE products SET qty = qty - ? WHERE id = ?')->execute([$qty, $productId]);

            $subtotal    = $product['price'] * $qty;
            $total      += $subtotal;
            $lineItems[] = [
                'name'      => $product['name'],
                'qty'       => $qty,
                'price'     => $product['price'],
                'subtotal'  => $subtotal,
            ];
        }

        // Generate txn_code  e.g. TXN-007
        $nextNum  = (int)$db->query('SELECT COUNT(*) FROM transactions')->fetchColumn() + 1;
        $txnCode  = 'TXN-' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);

        $cashierName = trim("{$user['firstname']} {$user['lastname']}");
        $now         = new \DateTime('now', new \DateTimeZone('Asia/Manila'));

        $stmt = $db->prepare('
            INSERT INTO transactions (txn_code, cashier_id, cashier_name, total, txn_date, txn_time)
            VALUES (?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            $txnCode,
            $user['id'],
            $cashierName,
            $total,
            $now->format('Y-m-d'),
            $now->format('h:i A'),
        ]);
        $txnId = $db->lastInsertId();

        // Insert line items
        $iStmt = $db->prepare('
            INSERT INTO transaction_items (transaction_id, product_name, qty, unit_price, subtotal)
            VALUES (?, ?, ?, ?, ?)
        ');
        foreach ($lineItems as $li) {
            $iStmt->execute([$txnId, $li['name'], $li['qty'], $li['price'], $li['subtotal']]);
        }

        $db->commit();

        sendSuccess([
            'txn_id'   => $txnId,
            'txn_code' => $txnCode,
            'total'    => $total,
            'items'    => $lineItems,
            'date'     => $now->format('Y-m-d'),
            'time'     => $now->format('h:i A'),
            'cashier'  => $cashierName,
        ], "{$txnCode} completed successfully!", 201);

    } catch (\Exception $e) {
        $db->rollBack();
        sendError($e->getMessage());
    }
}

sendError('Unknown action.', 404);
