/**
 * server.js — RITO&TATA Real-time SSE Server
 * ─────────────────────────────────────────────────────────────
 * This Node.js server:
 *   1. Connects to MySQL (same DB as PHP backend)
 *   2. Keeps a registry of connected SSE clients (admin / cashier)
 *   3. Polls the DB every POLL_INTERVAL ms for changes
 *   4. Pushes named events to every connected client
 *
 * Start:  node server.js
 * Dev:    nodemon server.js
 *
 * Endpoints:
 *   GET /sse/admin    — admin dashboard live feed
 *   GET /sse/cashier  — cashier product stock feed
 *   GET /health       — quick health check
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const express = require('express');
const mysql2  = require('mysql2/promise');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────
// Allow requests from your Laragon site
app.use(cors({
  origin:      process.env.CORS_ORIGIN || 'http://rito-tata.test',
  credentials: true,   // needed if you ever send cookies
}));

app.use(express.json());

// ════════════════════════════════════════════════════════════════
// DATABASE POOL
// mysql2 connection pool — reuses connections efficiently
// ════════════════════════════════════════════════════════════════
const db = mysql2.createPool({
  host:            process.env.DB_HOST || 'localhost',
  user:            process.env.DB_USER || 'root',
  password:        process.env.DB_PASS || '',
  database:        process.env.DB_NAME || 'ritotata_db',
  waitForConnections: true,
  connectionLimit:    10,
});

// Test DB connection on startup
db.getConnection()
  .then(conn => {
    console.log('✅ Connected to MySQL database:', process.env.DB_NAME);
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  });

// ════════════════════════════════════════════════════════════════
// CLIENT REGISTRY
// Keeps track of all connected SSE clients, separated by role.
// Each entry: { id, role, res (Express response object) }
// ════════════════════════════════════════════════════════════════
const clients = {
  admin:   new Map(),   // clientId → response
  cashier: new Map(),
};

let clientIdCounter = 0;

/**
 * Add a new SSE client to the registry.
 */
function addClient(role, res) {
  const id = ++clientIdCounter;
  clients[role].set(id, res);
  console.log(`➕ [${role}] Client #${id} connected  (total: ${clients[role].size})`);
  return id;
}

/**
 * Remove a client when they disconnect.
 */
function removeClient(role, id) {
  clients[role].delete(id);
  console.log(`➖ [${role}] Client #${id} disconnected (total: ${clients[role].size})`);
}

/**
 * Push a named SSE event to all clients of a given role.
 * @param {string} role   - 'admin' or 'cashier'
 * @param {string} event  - event name (e.g. 'stats', 'stock')
 * @param {object} data   - JSON-serialisable payload
 */
function broadcast(role, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, res] of clients[role]) {
    try {
      res.write(payload);
    } catch (err) {
      // Client disconnected mid-write — clean up
      console.warn(`⚠️  Failed to write to [${role}] client #${id}:`, err.message);
      removeClient(role, id);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// SSE HELPER — set the correct headers for an SSE response
// ════════════════════════════════════════════════════════════════
function initSSE(res) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // disable Nginx buffering
  res.flushHeaders();   // flush immediately so browser knows the stream is open
}

// ════════════════════════════════════════════════════════════════
// ROUTE: GET /sse/admin
// Admin dashboard live feed
// ════════════════════════════════════════════════════════════════
app.get('/sse/admin', (req, res) => {
  initSSE(res);
  const id = addClient('admin', res);

  // Send a welcome event so the browser knows it connected
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Admin feed connected', clientId: id })}\n\n`);

  // Remove client when connection closes
  req.on('close', () => removeClient('admin', id));
});

// ════════════════════════════════════════════════════════════════
// ROUTE: GET /sse/cashier
// Cashier product stock feed
// ════════════════════════════════════════════════════════════════
app.get('/sse/cashier', (req, res) => {
  initSSE(res);
  const id = addClient('cashier', res);

  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Cashier feed connected', clientId: id })}\n\n`);

  req.on('close', () => removeClient('cashier', id));
});

// ════════════════════════════════════════════════════════════════
// ROUTE: GET /health
// Quick check that the server is running
// ════════════════════════════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    clients: {
      admin:   clients.admin.size,
      cashier: clients.cashier.size,
    },
    uptime: process.uptime(),
  });
});

// ════════════════════════════════════════════════════════════════
// DATABASE POLLING — runs every POLL_INTERVAL ms
// Queries the DB and broadcasts updates to connected clients
// ════════════════════════════════════════════════════════════════
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 3000;

// ── Previous state snapshots (used to detect changes) ────────
let prevState = {
  todayRevenue:   null,
  todayTxnCount:  null,
  lowCount:       null,
  criticalCount:  null,
  pendingCount:   null,
  productQtyHash: '',   // a quick string fingerprint of all product qtys
};

async function pollAndBroadcast() {
  // Skip if no clients are connected at all
  if (clients.admin.size === 0 && clients.cashier.size === 0) return;

  try {
    const today = new Date().toISOString().slice(0, 10);

    // ── 1. Today's revenue & transaction count (admin) ────────
    if (clients.admin.size > 0) {
      const [[todayRow]] = await db.query(`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS rev
        FROM transactions WHERE txn_date = ?
      `, [today]);

      const todayRevenue  = parseFloat(todayRow.rev);
      const todayTxnCount = parseInt(todayRow.cnt);

      // Always broadcast stats (used for live clock-style KPI updates)
      broadcast('admin', 'stats', {
        today_revenue:      todayRevenue,
        today_transactions: todayTxnCount,
        timestamp:          new Date().toLocaleTimeString('en-PH'),
      });

      // ── 2. Stock alerts (admin) ─────────────────────────────
      const [stockRows] = await db.query(`
        SELECT id, name, qty, low_stock,
               qty <= FLOOR(low_stock / 2) AS is_critical
        FROM products
        WHERE qty <= low_stock
        ORDER BY qty ASC
      `);

      const lowCount      = stockRows.length;
      const criticalCount = stockRows.filter(p => p.is_critical).length;

      broadcast('admin', 'stock', {
        low_count:      lowCount,
        critical_count: criticalCount,
        low_items:      stockRows,
        critical_items: stockRows.filter(p => p.is_critical),
      });

      // ── 3. Pending registrations count (admin) ──────────────
      const [[pendingRow]] = await db.query(`
        SELECT COUNT(*) AS cnt FROM users WHERE status = 'pending'
      `);
      const pendingCount = parseInt(pendingRow.cnt);

      broadcast('admin', 'pending', { count: pendingCount });

      // ── 4. Recent transactions feed (admin) ─────────────────
      const [recentTxns] = await db.query(`
        SELECT id, txn_code, cashier_name, total, txn_date, txn_time
        FROM transactions
        ORDER BY txn_date DESC, txn_time DESC
        LIMIT 6
      `);

      broadcast('admin', 'transactions', { transactions: recentTxns });
    }

    // ── 5. Product stock for cashiers ─────────────────────────
    if (clients.cashier.size > 0) {
      const [products] = await db.query(`
        SELECT id, name, category, price, qty, low_stock
        FROM products
        ORDER BY category, name
      `);

      // Attach computed flags
      const enriched = products.map(p => ({
        ...p,
        in_stock: p.qty > 0,
        is_low:   p.qty <= p.low_stock,
      }));

      // Only broadcast if something actually changed (compare qty fingerprint)
      const qtyHash = enriched.map(p => `${p.id}:${p.qty}`).join(',');
      if (qtyHash !== prevState.productQtyHash) {
        prevState.productQtyHash = qtyHash;
        broadcast('cashier', 'products', enriched);
      }
    }

  } catch (err) {
    console.error('❌ Poll error:', err.message);
  }
}

// Start polling loop
setInterval(pollAndBroadcast, POLL_INTERVAL);

// Run once immediately on startup so clients get data right away
setTimeout(pollAndBroadcast, 500);

// ════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('');
  console.log('🛒  RITO&TATA SSE Server');
  console.log(`🚀  Listening on http://localhost:${PORT}`);
  console.log(`🔄  Polling DB every ${POLL_INTERVAL}ms`);
  console.log(`🌐  CORS origin: ${process.env.CORS_ORIGIN || 'http://rito-tata.test'}`);
  console.log('');
});
