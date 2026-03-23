/**
 * server.js — RITO&TATA Real-time SSE Server
 * Run:  node server.js
 */

require('dotenv').config();

const express = require('express');
const mysql2  = require('mysql2/promise');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS — accept ALL origins (works for any Laragon URL) ────────────────────
app.use(cors({ origin: true, credentials: false }));
app.use(express.json());

// ════════════════════════════════════════════════════════════════
// DATABASE POOL
// ════════════════════════════════════════════════════════════════
const db = mysql2.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASS     || '',
  database:           process.env.DB_NAME     || 'ritotata_db',
  waitForConnections: true,
  connectionLimit:    10,
});

db.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected:', process.env.DB_NAME || 'ritotata_db');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL failed:', err.message);
    process.exit(1);
  });

// ════════════════════════════════════════════════════════════════
// CLIENT REGISTRY
// ════════════════════════════════════════════════════════════════
const clients = {
  admin:   new Map(),
  cashier: new Map(),
};
let clientIdCounter = 0;

function addClient(role, res) {
  const id = ++clientIdCounter;
  clients[role].set(id, res);
  console.log(`➕ [${role}] Client #${id} connected (total: ${clients[role].size})`);
  return id;
}

function removeClient(role, id) {
  clients[role].delete(id);
  console.log(`➖ [${role}] Client #${id} disconnected (total: ${clients[role].size})`);
}

function broadcast(role, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, res] of clients[role]) {
    try {
      res.write(payload);
    } catch (err) {
      removeClient(role, id);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// SSE HEADERS
// ════════════════════════════════════════════════════════════════
function initSSE(res) {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

// ════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════

// Admin SSE feed — no auth needed, Node.js is separate from PHP sessions
app.get('/sse/admin', (req, res) => {
  initSSE(res);
  const id = addClient('admin', res);
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Admin feed connected', clientId: id })}\n\n`);
  req.on('close', () => removeClient('admin', id));
});

// Cashier SSE feed
app.get('/sse/cashier', (req, res) => {
  initSSE(res);
  const id = addClient('cashier', res);
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Cashier feed connected', clientId: id })}\n\n`);
  req.on('close', () => removeClient('cashier', id));
});

// Health check — open http://localhost:3001/health to verify server is running
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    clients: { admin: clients.admin.size, cashier: clients.cashier.size },
    uptime:  Math.floor(process.uptime()) + 's',
  });
});

// ════════════════════════════════════════════════════════════════
// DB POLLING — pushes updates to all connected clients
// ════════════════════════════════════════════════════════════════
const POLL_MS = parseInt(process.env.POLL_INTERVAL) || 3000;

let prevQtyHash      = '';  // cashier: detect any qty change
let prevAdminQtyHash = '';  // admin:   detect any qty change

async function pollAndBroadcast() {
  if (clients.admin.size === 0 && clients.cashier.size === 0) return;

  try {
    const today = new Date().toISOString().slice(0, 10);

    // ── ADMIN events ──────────────────────────────────────────
    if (clients.admin.size > 0) {

      // 1. Today's stats
      const [[row]] = await db.query(
        'SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS rev FROM transactions WHERE txn_date = ?',
        [today]
      );
      broadcast('admin', 'stats', {
        today_revenue:      parseFloat(row.rev),
        today_transactions: parseInt(row.cnt),
        timestamp:          new Date().toLocaleTimeString('en-PH'),
      });

      // 2. ALL products qty — so Product Management updates live after every sale
      const [allProducts] = await db.query(
        'SELECT id, name, category, price, qty, low_stock FROM products ORDER BY category, name'
      );
      const enrichedAll = allProducts.map(p => ({
        ...p,
        is_low:      p.qty <= p.low_stock,
        is_critical: p.qty <= Math.floor(p.low_stock / 2),
        in_stock:    p.qty > 0,
      }));
      const adminQtyHash = enrichedAll.map(p => `${p.id}:${p.qty}`).join(',');
      if (adminQtyHash !== prevAdminQtyHash) {
        prevAdminQtyHash = adminQtyHash;
        // Broadcast dedicated event so product management page can react
        broadcast('admin', 'product_qty', enrichedAll);
      }

      // 3. Stock alerts (low/critical only — for sidebar badge)
      const lowRows = enrichedAll.filter(p => p.is_low);
      broadcast('admin', 'stock', {
        low_count:      lowRows.length,
        critical_count: lowRows.filter(p => p.is_critical).length,
        low_items:      lowRows,
        critical_items: lowRows.filter(p => p.is_critical),
      });

      // 4. Pending registrations
      const [[pRow]] = await db.query("SELECT COUNT(*) AS cnt FROM users WHERE status='pending'");
      broadcast('admin', 'pending', { count: parseInt(pRow.cnt) });

      // 5. Recent transactions
      const [recent] = await db.query(`
        SELECT id, txn_code, cashier_name, total, txn_date, txn_time
        FROM transactions ORDER BY txn_date DESC, txn_time DESC LIMIT 6
      `);
      broadcast('admin', 'transactions', { transactions: recent });
    }

    // ── CASHIER events — only send when stock actually changes ──
    if (clients.cashier.size > 0) {
      const [products] = await db.query(
        'SELECT id, name, category, price, qty, low_stock FROM products ORDER BY category, name'
      );
      const enriched = products.map(p => ({
        ...p,
        in_stock: p.qty > 0,
        is_low:   p.qty <= p.low_stock,
      }));
      const qtyHash = enriched.map(p => `${p.id}:${p.qty}`).join(',');
      if (qtyHash !== prevQtyHash) {
        prevQtyHash = qtyHash;
        broadcast('cashier', 'products', enriched);
      }
    }

  } catch (err) {
    console.error('❌ Poll error:', err.message);
  }
}

setInterval(pollAndBroadcast, POLL_MS);
setTimeout(pollAndBroadcast, 500);  // immediate first run

// ════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('');
  console.log('🛒  RITO&TATA SSE Server');
  console.log(`🚀  http://localhost:${PORT}`);
  console.log(`🔄  Polling every ${POLL_MS}ms`);
  console.log(`✅  Health: http://localhost:${PORT}/health`);
  console.log('');
});
