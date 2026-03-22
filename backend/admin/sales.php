<?php
/**
 * backend/admin/sales.php
 * Admin-only: view all transactions and generate reports.
 *
 * GET ?action=list                          — all transactions
 * GET ?action=detail&id=3                   — single transaction with items
 * GET ?action=report&period=today           — summary for a period
 *     period: today | yesterday | lastmonth | alltime | custom
 *     &from=2025-07-01&to=2025-07-14       — used when period=custom
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

requireAuth('admin');
requireMethod('GET');

$db     = getDB();
$action = $_GET['action'] ?? '';

// ── LIST ALL TRANSACTIONS ─────────────────────────────────────────────────────
if ($action === 'list') {
    $search = $_GET['search'] ?? '';

    $sql    = 'SELECT * FROM transactions WHERE 1=1';
    $params = [];

    if ($search) {
        $sql    .= ' AND (txn_code LIKE ? OR cashier_name LIKE ?)';
        $params[] = "%{$search}%";
        $params[] = "%{$search}%";
    }

    $sql .= ' ORDER BY txn_date DESC, txn_time DESC';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    sendSuccess($stmt->fetchAll());
}

// ── SINGLE TRANSACTION DETAIL (with items) ────────────────────────────────────
if ($action === 'detail') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) sendError('Invalid transaction ID.');

    $stmt = $db->prepare('SELECT * FROM transactions WHERE id = ?');
    $stmt->execute([$id]);
    $txn = $stmt->fetch();
    if (!$txn) sendError('Transaction not found.', 404);

    $stmt = $db->prepare('SELECT * FROM transaction_items WHERE transaction_id = ?');
    $stmt->execute([$id]);
    $txn['items'] = $stmt->fetchAll();

    sendSuccess($txn);
}

// ── REPORT ────────────────────────────────────────────────────────────────────
if ($action === 'report') {
    $period = $_GET['period'] ?? 'today';
    $today  = date('Y-m-d');

    // Determine date range
    switch ($period) {
        case 'today':
            $from = $to = $today;
            break;
        case 'yesterday':
            $from = $to = date('Y-m-d', strtotime('-1 day'));
            break;
        case 'lastmonth':
            $from = date('Y-m-01', strtotime('last month'));
            $to   = date('Y-m-t',  strtotime('last month'));
            break;
        case 'alltime':
            $from = '2000-01-01';
            $to   = $today;
            break;
        case 'custom':
            $from = $_GET['from'] ?? $today;
            $to   = $_GET['to']   ?? $today;
            break;
        default:
            sendError('Invalid period.');
    }

    // Summary figures
    $stmt = $db->prepare('
        SELECT
            COUNT(*)            AS total_transactions,
            COALESCE(SUM(total), 0) AS total_revenue,
            COALESCE(AVG(total), 0) AS avg_per_sale
        FROM transactions
        WHERE txn_date BETWEEN ? AND ?
    ');
    $stmt->execute([$from, $to]);
    $summary = $stmt->fetch();

    // Total items sold
    $stmt = $db->prepare('
        SELECT COALESCE(SUM(ti.qty), 0) AS total_items
        FROM transaction_items ti
        JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.txn_date BETWEEN ? AND ?
    ');
    $stmt->execute([$from, $to]);
    $summary['total_items'] = $stmt->fetchColumn();

    // Revenue per day (for bar chart)
    $stmt = $db->prepare('
        SELECT txn_date, SUM(total) AS revenue
        FROM transactions
        WHERE txn_date BETWEEN ? AND ?
        GROUP BY txn_date
        ORDER BY txn_date
    ');
    $stmt->execute([$from, $to]);
    $daily = $stmt->fetchAll();

    // Revenue by category
    $stmt = $db->prepare('
        SELECT p.category, SUM(ti.subtotal) AS revenue
        FROM transaction_items ti
        JOIN transactions t  ON t.id  = ti.transaction_id
        LEFT JOIN products p ON p.name = ti.product_name
        WHERE t.txn_date BETWEEN ? AND ?
        GROUP BY p.category
        ORDER BY revenue DESC
    ');
    $stmt->execute([$from, $to]);
    $byCategory = $stmt->fetchAll();

    // Top products
    $stmt = $db->prepare('
        SELECT
            ti.product_name,
            SUM(ti.qty)      AS units_sold,
            SUM(ti.subtotal) AS revenue
        FROM transaction_items ti
        JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.txn_date BETWEEN ? AND ?
        GROUP BY ti.product_name
        ORDER BY revenue DESC
    ');
    $stmt->execute([$from, $to]);
    $topProducts = $stmt->fetchAll();

    // Cashier performance
    $stmt = $db->prepare('
        SELECT
            cashier_name,
            COUNT(*) AS transactions,
            SUM(total) AS revenue
        FROM transactions
        WHERE txn_date BETWEEN ? AND ?
        GROUP BY cashier_name
        ORDER BY revenue DESC
    ');
    $stmt->execute([$from, $to]);
    $byCashier = $stmt->fetchAll();

    sendSuccess([
        'period'      => ['from' => $from, 'to' => $to, 'label' => $period],
        'summary'     => $summary,
        'daily'       => $daily,
        'by_category' => $byCategory,
        'top_products'=> $topProducts,
        'by_cashier'  => $byCashier,
    ]);
}

sendError('Unknown action.', 404);
