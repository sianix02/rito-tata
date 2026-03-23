/**
 * api.js  — Shared fetch wrapper used by both admin and cashier.
 * Place this at the ROOT level, same as index.html.
 *
 * Every function returns a Promise<{ success, message, data }>.
 * The BASE_URL is relative so it works with Laragon on any port.
 */

'use strict';

// ── Base path to the PHP backend folder ──────────────────────────────────────
// When loaded from admin/ or cashier/, adjust the path accordingly.
// admin/admin.html  → needs '../backend'
// cashier/cashier.html → needs '../backend'
// index.html (root) → needs './backend'
const API_BASE = (function () {
  const path = window.location.pathname;
  if (path.includes('/admin/') || path.includes('/cashier/')) {
    return '../backend';
  }
  return './backend';
})();

// ════════════════════════════════════════════════════════════════
// SHARED UI HELPERS
// These replace the helpers that were in shared-store.js
// ════════════════════════════════════════════════════════════════

/** Format a number as Philippine Peso: ₱1,234.56 */
window.formatPeso = function (n) {
  return '₱' + Number(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/** Returns today's date as a long readable string, e.g. "Monday, July 14, 2025" */
window.todayStr = function () {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
};

/** Returns the current time as a string, e.g. "09:14 AM" */
window.nowTime = function () {
  return new Date().toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit',
  });
};

/**
 * Generic fetch helper.
 * @param {string} url       - Full URL (built by helper fns below)
 * @param {string} method    - GET | POST | PUT | DELETE
 * @param {object} body      - JSON body (ignored for GET)
 * @returns {Promise<object>}
 */
async function apiFetch(url, method = 'GET', body = null) {
    const opts = {
        method,
        credentials: 'same-origin',    // sends the PHP session cookie
        headers: { 'Content-Type': 'application/json' },
    };
    if (body && method !== 'GET') {
        opts.body = JSON.stringify(body);
    }
    const res  = await fetch(url, opts);
    const json = await res.json();
    return json;   // always { success, message, data }
}

// ════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════
const Auth = {
    login:    (username, password) =>
        apiFetch(`${API_BASE}/shared/auth.php?action=login`, 'POST', { username, password }),

    logout:   () =>
        apiFetch(`${API_BASE}/shared/auth.php?action=logout`, 'POST'),

    register: (data) =>
        apiFetch(`${API_BASE}/shared/auth.php?action=register`, 'POST', data),

    me:       () =>
        apiFetch(`${API_BASE}/shared/auth.php?action=me`),
};

// ════════════════════════════════════════════════════════════════
// PRODUCTS  (shared read, admin write)
// ════════════════════════════════════════════════════════════════
const Products = {
    // Any authenticated user — list / search
    list:   (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`${API_BASE}/shared/products.php${qs ? '?' + qs : ''}`);
    },
    get: (id) => apiFetch(`${API_BASE}/shared/products.php?id=${id}`),

    // Admin only
    adminList: () =>
        apiFetch(`${API_BASE}/admin/products.php?action=list`),

    add: (data) =>
        apiFetch(`${API_BASE}/admin/products.php?action=add`, 'POST', data),

    edit: (id, data) =>
        apiFetch(`${API_BASE}/admin/products.php?action=edit&id=${id}`, 'PUT', data),

    delete: (id) =>
        apiFetch(`${API_BASE}/admin/products.php?action=delete&id=${id}`, 'DELETE'),

    restock: (id, qty) =>
        apiFetch(`${API_BASE}/admin/products.php?action=restock&id=${id}`, 'POST', { qty }),
};

// ════════════════════════════════════════════════════════════════
// ADMIN — USERS
// ════════════════════════════════════════════════════════════════
const AdminUsers = {
    listCashiers: () =>
        apiFetch(`${API_BASE}/admin/users.php?action=list_cashiers`),

    listPending: () =>
        apiFetch(`${API_BASE}/admin/users.php?action=list_pending`),

    approve: (id) =>
        apiFetch(`${API_BASE}/admin/users.php?action=approve&id=${id}`, 'POST'),

    decline: (id) =>
        apiFetch(`${API_BASE}/admin/users.php?action=decline&id=${id}`, 'POST'),

    toggle: (id) =>
        apiFetch(`${API_BASE}/admin/users.php?action=toggle&id=${id}`, 'POST'),

    edit: (id, data) =>
        apiFetch(`${API_BASE}/admin/users.php?action=edit&id=${id}`, 'PUT', data),
};

// ════════════════════════════════════════════════════════════════
// ADMIN — SALES & REPORTS
// ════════════════════════════════════════════════════════════════
const AdminSales = {
    list: (search = '') =>
        apiFetch(`${API_BASE}/admin/sales.php?action=list&search=${encodeURIComponent(search)}`),

    detail: (id) =>
        apiFetch(`${API_BASE}/admin/sales.php?action=detail&id=${id}`),

    report: (period, from = '', to = '') => {
        let url = `${API_BASE}/admin/sales.php?action=report&period=${period}`;
        if (from) url += `&from=${from}`;
        if (to)   url += `&to=${to}`;
        return apiFetch(url);
    },
};

// ════════════════════════════════════════════════════════════════
// ADMIN — DASHBOARD
// ════════════════════════════════════════════════════════════════
const AdminDashboard = {
    get: () => apiFetch(`${API_BASE}/admin/dashboard.php`),
};

// ════════════════════════════════════════════════════════════════
// CASHIER — TRANSACTIONS
// ════════════════════════════════════════════════════════════════
const CashierTxn = {
    list: () =>
        apiFetch(`${API_BASE}/cashier/transaction.php?action=list`),

    detail: (id) =>
        apiFetch(`${API_BASE}/cashier/transaction.php?action=detail&id=${id}`),

    // items = [{ product_id, qty }, ...]
    create: (items) =>
        apiFetch(`${API_BASE}/cashier/transaction.php?action=create`, 'POST', { items }),
};

// ════════════════════════════════════════════════════════════════
// CASHIER — DASHBOARD & PASSWORD
// ════════════════════════════════════════════════════════════════
const CashierDashboard = {
    get: () => apiFetch(`${API_BASE}/cashier/dashboard.php`),
};

const CashierAccount = {
    changePassword: (current_password, new_password, confirm_password) =>
        apiFetch(`${API_BASE}/cashier/password.php`, 'POST',
            { current_password, new_password, confirm_password }),
};

// ════════════════════════════════════════════════════════════════
// SSE HELPERS — connects to Node.js SSE server on port 3001
// EventSource does NOT send cookies, so no session issues.
// ════════════════════════════════════════════════════════════════

const SSE_SERVER = 'http://localhost:3001';

const SSE = {

    adminFeed(handlers = {}) {
        const es = new EventSource(`${SSE_SERVER}/sse/admin`);

        es.addEventListener('connected',    e => console.log('[SSE Admin] Connected ✅'));
        es.addEventListener('stats',        e => handlers.stats        && handlers.stats(JSON.parse(e.data)));
        es.addEventListener('stock',        e => handlers.stock        && handlers.stock(JSON.parse(e.data)));
        es.addEventListener('pending',      e => handlers.pending      && handlers.pending(JSON.parse(e.data)));
        es.addEventListener('transactions', e => handlers.transactions && handlers.transactions(JSON.parse(e.data)));
        es.addEventListener('product_qty',  e => handlers.product_qty  && handlers.product_qty(JSON.parse(e.data)));

        es.onerror = () => {
            console.warn('[SSE Admin] ⚠ Connection lost — make sure node server.js is running in sse-server/');
        };
        return es;
    },

    cashierFeed(handlers = {}) {
        const es = new EventSource(`${SSE_SERVER}/sse/cashier`);

        es.addEventListener('connected', e => console.log('[SSE Cashier] Connected ✅'));
        es.addEventListener('products',  e => handlers.products && handlers.products(JSON.parse(e.data)));

        es.onerror = () => {
            console.warn('[SSE Cashier] ⚠ Connection lost — make sure node server.js is running in sse-server/');
        };
        return es;
    },
};
