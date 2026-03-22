<?php
/**
 * backend/sse/admin_feed.php
 * Server-Sent Events stream for the Admin Dashboard.
 * The browser connects once; this script pushes updates every 5 seconds.
 *
 * JS usage:
 *   const es = new EventSource('../backend/sse/admin_feed.php');
 *   es.addEventListener('stats', e => { const data = JSON.parse(e.data); ... });
 *   es.addEventListener('stock', e => { ... });
 *   es.addEventListener('pending', e => { ... });
 */

require_once __DIR__ . '/../config/db.php';
// No api_helper.php — SSE must NOT output JSON headers.

session_start();
if (empty($_SESSION['user']) || $_SESSION['user']['role'] !== 'admin') {
    http_response_code(403);
    echo "data: {\"error\":\"Forbidden\"}\n\n";
    exit;
}
// ── IMPORTANT: release the session lock immediately ───────────
// SSE scripts run for a long time. If we keep the session open,
// PHP will block every other request from this user (session locking).
session_write_close();

// ── SSE headers ───────────────────────────────────────────────────────────────
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no');   // disable Nginx buffering
header('Connection: keep-alive');

// Turn off output buffering so events flush immediately
if (ob_get_level()) ob_end_clean();
set_time_limit(0);
ignore_user_abort(true);

/**
 * Emit one SSE event.
 */
function sseEmit(string $event, mixed $data): void {
    echo "event: {$event}\n";
    echo 'data: ' . json_encode($data) . "\n\n";
    flush();
}

$db    = getDB();
$today = date('Y-m-d');

// ── Poll loop ─────────────────────────────────────────────────────────────────
while (true) {
    // Check if the client disconnected
    if (connection_aborted()) break;

    // ① Today's revenue & transaction count
    $stmt = $db->prepare('
        SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
        FROM transactions WHERE txn_date = ?
    ');
    $stmt->execute([$today]);
    $todayRow = $stmt->fetch();

    sseEmit('stats', [
        'today_revenue'      => (float)$todayRow['revenue'],
        'today_transactions' => (int)$todayRow['count'],
        'timestamp'          => date('h:i:s A'),
    ]);

    // ② Low / critical stock items
    $stmt = $db->query('
        SELECT id, name, qty, low_stock
        FROM products
        WHERE qty <= low_stock
        ORDER BY qty ASC
    ');
    $lowItems = $stmt->fetchAll();
    $critical = array_filter($lowItems, fn($p) => $p['qty'] <= floor($p['low_stock'] / 2));

    sseEmit('stock', [
        'low_count'      => count($lowItems),
        'critical_count' => count($critical),
        'low_items'      => array_values($lowItems),
        'critical_items' => array_values($critical),
    ]);

    // ③ Pending registrations count
    $pendingCount = (int)$db->query("SELECT COUNT(*) FROM users WHERE status='pending'")->fetchColumn();
    sseEmit('pending', ['count' => $pendingCount]);

    // ④ Keep-alive comment (prevents proxy timeouts)
    echo ": heartbeat " . date('H:i:s') . "\n\n";
    flush();

    sleep(5);   // poll every 5 seconds — adjust as needed
}
