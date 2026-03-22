<?php
/**
 * backend/cashier/dashboard.php
 * Cashier-only: returns KPI data for this cashier's dashboard.
 *
 * GET /backend/cashier/dashboard.php
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/api_helper.php';

$user = requireAuth('cashier');
requireMethod('GET');

$db    = getDB();
$today = date('Y-m-d');

// ── All my transactions ───────────────────────────────────────────────────────
$stmt = $db->prepare('
    SELECT id, txn_code, total, txn_date, txn_time
    FROM transactions
    WHERE cashier_id = ?
    ORDER BY txn_date DESC, txn_time DESC
');
$stmt->execute([$user['id']]);
$allMyTxns = $stmt->fetchAll();

// ── Today's transactions ──────────────────────────────────────────────────────
$stmt = $db->prepare('
    SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
    FROM transactions
    WHERE cashier_id = ? AND txn_date = ?
');
$stmt->execute([$user['id'], $today]);
$todayStats = $stmt->fetch();

$totalRevenue = array_sum(array_column($allMyTxns, 'total'));
$avgSale      = count($allMyTxns) ? $totalRevenue / count($allMyTxns) : 0;

sendSuccess([
    'total_transactions' => count($allMyTxns),
    'total_revenue'      => $totalRevenue,
    'today_count'        => (int)$todayStats['count'],
    'today_revenue'      => (float)$todayStats['revenue'],
    'avg_sale'           => $avgSale,
    'recent'             => array_slice($allMyTxns, 0, 5),
]);
