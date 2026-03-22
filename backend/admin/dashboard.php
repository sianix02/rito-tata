<?php
/**
 * backend/admin/dashboard.php
 * Admin-only: returns all KPI data for the dashboard in one request.
 *
 * GET /backend/admin/dashboard.php
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

requireAuth('admin');
requireMethod('GET');

$db    = getDB();
$today = date('Y-m-d');

// ── Today's revenue & transaction count ───────────────────────────────────────
$stmt = $db->prepare('
    SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
    FROM transactions WHERE txn_date = ?
');
$stmt->execute([$today]);
$todaySales = $stmt->fetch();

// ── Yesterday (most recent prior date in the data) ────────────────────────────
$stmt = $db->prepare("
    SELECT txn_date, COALESCE(SUM(total), 0) AS revenue
    FROM transactions
    WHERE txn_date < ?
    GROUP BY txn_date
    ORDER BY txn_date DESC
    LIMIT 1
");
$stmt->execute([$today]);
$yesterday = $stmt->fetch();

// ── Product counts ────────────────────────────────────────────────────────────
$stmt = $db->query('SELECT * FROM products');
$allProducts = $stmt->fetchAll();

$lowStock      = array_filter($allProducts, fn($p) => $p['qty'] <= $p['low_stock']);
$criticalStock = array_filter($allProducts, fn($p) => $p['qty'] <= floor($p['low_stock'] / 2));

// ── Pending registrations count ───────────────────────────────────────────────
$pendingCount = $db->query("SELECT COUNT(*) FROM users WHERE status='pending'")->fetchColumn();

// ── Hourly sales for today ────────────────────────────────────────────────────
$stmt = $db->prepare("
    SELECT
        HOUR(STR_TO_DATE(txn_time, '%h:%i %p')) AS hour_num,
        SUM(total) AS revenue
    FROM transactions
    WHERE txn_date = ?
    GROUP BY hour_num
    ORDER BY hour_num
");
$stmt->execute([$today]);
$hourlyRows = $stmt->fetchAll();

// Build a full 08–19 hour map
$hourly = [];
for ($h = 8; $h <= 19; $h++) {
    $hourly[$h] = 0;
}
foreach ($hourlyRows as $row) {
    $h = (int)$row['hour_num'];
    if (isset($hourly[$h])) $hourly[$h] = (float)$row['revenue'];
}

// ── Sales by category (all-time, for bar chart) ───────────────────────────────
$stmt = $db->query('
    SELECT p.category, SUM(ti.subtotal) AS revenue
    FROM transaction_items ti
    LEFT JOIN products p ON p.name = ti.product_name
    GROUP BY p.category
    ORDER BY revenue DESC
');
$byCategory = $stmt->fetchAll();

// ── Recent transactions ───────────────────────────────────────────────────────
$stmt = $db->query('
    SELECT id, txn_code, cashier_name, total, txn_date, txn_time
    FROM transactions
    ORDER BY txn_date DESC, txn_time DESC
    LIMIT 6
');
$recentTxns = $stmt->fetchAll();

// ── Activity feed ─────────────────────────────────────────────────────────────
$activityFeed = [];

// Today's sales events
foreach (array_slice($recentTxns, 0, 3) as $t) {
    $activityFeed[] = [
        'type' => 'sale',
        'text' => "Sale {$t['txn_code']} — ₱" . number_format($t['total'], 2) . " by {$t['cashier_name']}",
        'time' => $t['txn_time'],
    ];
}

// Critical stock alerts
foreach (array_slice(array_values($criticalStock), 0, 2) as $p) {
    $activityFeed[] = [
        'type' => 'alert',
        'text' => "🔴 Critical: \"{$p['name']}\" has only {$p['qty']} units left",
        'time' => 'Now',
    ];
}

// Low stock warnings
$lowOnly = array_filter($lowStock, fn($p) => $p['qty'] > floor($p['low_stock'] / 2));
foreach (array_slice(array_values($lowOnly), 0, 2) as $p) {
    $activityFeed[] = [
        'type' => 'alert',
        'text' => "🟡 Low: \"{$p['name']}\" approaching threshold ({$p['qty']}/{$p['low_stock']})",
        'time' => 'Now',
    ];
}

if ($pendingCount > 0) {
    $activityFeed[] = [
        'type' => 'pending',
        'text' => "{$pendingCount} registration" . ($pendingCount > 1 ? 's' : '') . " awaiting approval",
        'time' => 'Pending',
    ];
}

// ── Compose response ──────────────────────────────────────────────────────────
sendSuccess([
    'today_revenue'      => (float)$todaySales['revenue'],
    'today_transactions' => (int)$todaySales['count'],
    'yesterday_revenue'  => $yesterday ? (float)$yesterday['revenue'] : null,
    'total_products'     => count($allProducts),
    'low_stock_count'    => count($lowStock),
    'critical_count'     => count($criticalStock),
    'pending_count'      => (int)$pendingCount,
    'hourly_sales'       => $hourly,            // array keyed by hour (8–19)
    'sales_by_category'  => $byCategory,
    'recent_transactions'=> $recentTxns,
    'activity_feed'      => array_slice($activityFeed, 0, 8),
    'low_stock_items'    => array_values($lowStock),
    'critical_items'     => array_values($criticalStock),
]);
