<?php
/**
 * backend/sse/cashier_feed.php
 * Server-Sent Events stream for the Cashier Dashboard.
 * Pushes product stock updates so cashiers see availability in real time.
 *
 * JS usage:
 *   const es = new EventSource('../backend/sse/cashier_feed.php');
 *   es.addEventListener('products', e => {
 *     const list = JSON.parse(e.data);
 *     // update product availability badges in the UI
 *   });
 */

require_once __DIR__ . '/../config/db.php';

session_start();
if (empty($_SESSION['user']) || $_SESSION['user']['role'] !== 'cashier') {
    http_response_code(403);
    echo "data: {\"error\":\"Forbidden\"}\n\n";
    exit;
}
// ── IMPORTANT: release the session lock immediately ───────────
// SSE scripts run for a long time. If we keep the session open,
// PHP will block every other request from this user (session locking).
session_write_close();

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no');
header('Connection: keep-alive');

if (ob_get_level()) ob_end_clean();
set_time_limit(0);
ignore_user_abort(true);

function sseEmit(string $event, mixed $data): void {
    echo "event: {$event}\n";
    echo 'data: ' . json_encode($data) . "\n\n";
    flush();
}

$db = getDB();

while (true) {
    if (connection_aborted()) break;

    // Send current product stock levels
    $stmt = $db->query('
        SELECT id, name, category, price, qty, low_stock
        FROM products
        ORDER BY category, name
    ');
    $products = $stmt->fetchAll();
    foreach ($products as &$p) {
        $p['in_stock'] = (int)$p['qty'] > 0;
        $p['is_low']   = (int)$p['qty'] <= (int)$p['low_stock'];
    }

    sseEmit('products', $products);

    echo ": heartbeat " . date('H:i:s') . "\n\n";
    flush();

    sleep(5);
}
