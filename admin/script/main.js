/**
 * admin/script/main.js
 * All admin dashboard page logic.
 */

'use strict';

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
let CURRENT_USER = null;

(function init() {
  const raw = sessionStorage.getItem('currentUser');
  if (!raw) { window.location.href = '../index.html'; return; }
  CURRENT_USER = JSON.parse(raw);
  if (CURRENT_USER.role !== 'admin') { window.location.href = '../index.html'; return; }

  // Set sidebar user info
  const fullName = `${CURRENT_USER.firstname} ${CURRENT_USER.mi ? CURRENT_USER.mi + '. ' : ''}${CURRENT_USER.lastname}`;
  document.getElementById('user-name').textContent = fullName;
  document.getElementById('user-avatar').textContent = CURRENT_USER.firstname[0];
  document.getElementById('page-date').textContent = todayStr();

  // Live clock
  updateClock();
  setInterval(updateClock, 1000);

  // Update badges
  updateBadges();

  navigate('dashboard');
})();

function updateClock() {
  const el = document.getElementById('live-time');
  if (el) el.textContent = nowTime();
}

function updateBadges() {
  const pending = (STORE.pendingUsers || []).length;
  const low = lowStockProducts().length;
  const pb = document.getElementById('pending-badge');
  const lb = document.getElementById('low-badge');
  const nd = document.getElementById('notif-dot');
  if (pb) { pb.textContent = pending; pb.style.display = pending ? '' : 'none'; }
  if (lb) { lb.textContent = low; lb.style.display = low ? '' : 'none'; }
  if (nd) nd.style.display = low ? '' : 'none';
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showToast(msg, type = 'success') {
  const c = $('toast-container');
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||'✓'}</span>${msg}`;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function doLogout() {
  sessionStorage.removeItem('currentUser');
  window.location.href = '../index.html';
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const titles = {
    dashboard: 'Dashboard', users: 'User Accounts', pending: 'Pending Registrations',
    products: 'Product Management', inventory: 'Inventory Monitoring',
    sales: 'Sales Monitoring', reports: 'Reports'
  };
  $('page-title').textContent = titles[page] || page;
  const content = $('page-content');
  content.innerHTML = '';
  content.className = 'page-content animate-in';

  const pages = {
    dashboard, users: userManagement, pending: pendingRegistrations,
    products: productManagement, inventory, sales: salesMonitoring, reports
  };
  if (pages[page]) pages[page](content);
  updateBadges();
}

// ── DASHBOARD — Remodelled with Charts & Traffic-Light Alerts ─────────────────
function dashboard(el) {
  const TODAY     = '2025-07-14';
  const todayTxns = STORE.transactions.filter(t => t.date === TODAY);
  const todayRev  = todayTxns.reduce((s, t) => s + t.total, 0);
  const allTxns   = STORE.transactions;
  const lowItems  = lowStockProducts();
  const pending   = (STORE.pendingUsers || []).length;

  // ── Hourly sales from today's transactions ──────────────────────────────────
  // Build 8-hour buckets: 08:00–09:00 … 19:00–20:00 (store hours)
  const HOURS = ['08','09','10','11','12','13','14','15','16','17','18','19'];
  const hourlyRev = {};
  HOURS.forEach(h => { hourlyRev[h] = 0; });
  todayTxns.forEach(t => {
    const h = t.time ? t.time.split(':')[0] : null;
    if (h && hourlyRev.hasOwnProperty(h)) hourlyRev[h] += t.total;
  });
  // If no time data on transactions, spread evenly for demo (real POS always has time)
  const hasTimeData = todayTxns.some(t => t.time);
  if (!hasTimeData && todayTxns.length) {
    const spread = todayRev / HOURS.length;
    HOURS.forEach(h => { hourlyRev[h] = spread * (0.5 + Math.random()); });
  }
  const lineLabels = HOURS.map(h => `${+h}:00`);
  const lineData   = HOURS.map(h => +hourlyRev[h].toFixed(2));

  // ── Sales by category (bar chart) ──────────────────────────────────────────
  const catRev = {};
  allTxns.forEach(t => t.items.forEach(i => {
    const prod = STORE.products.find(p => p.name === i.name);
    const cat  = prod?.category || 'Other';
    catRev[cat] = (catRev[cat] || 0) + i.price * i.qty;
  }));
  const catEntries  = Object.entries(catRev).sort((a,b) => b[1]-a[1]);
  const barLabels   = catEntries.map(([c]) => c);
  const barData     = catEntries.map(([,v]) => +v.toFixed(2));
  const BAR_COLORS  = ['#16a34a','#22c55e','#0d9488','#ca8a04','#0369a1','#e11d48','#7c3aed','#db2777'];

  // ── Traffic-light classification ────────────────────────────────────────────
  // RED  = qty <= low_stock/2  (critical)
  // AMBER= qty <= low_stock    (warning)
  // GREEN= qty >  low_stock    (OK)
  // "Expiring" = fresh produce category items with qty > 0 (simulated; real system would use expiry date field)
  const FRESH_CATS = ['Produce','Fresh','Dairy','Meat','Bakery','Fruits','Vegetables'];
  function trafficLight(p) {
    if (p.qty <= Math.floor(p.low_stock / 2)) return 'red';
    if (p.qty <= p.low_stock)                  return 'amber';
    return 'green';
  }
  function isFresh(p) {
    return FRESH_CATS.some(c => p.category?.toLowerCase().includes(c.toLowerCase()));
  }
  const redItems   = STORE.products.filter(p => trafficLight(p) === 'red');
  const amberItems = STORE.products.filter(p => trafficLight(p) === 'amber');
  const freshItems = STORE.products.filter(p => isFresh(p) && p.qty > 0);

  // ── Revenue pulse: compare today vs yesterday (previous date in data) ───────
  const allDates   = [...new Set(allTxns.map(t=>t.date))].sort();
  const todayIdx   = allDates.indexOf(TODAY);
  const yesterday  = todayIdx > 0 ? allDates[todayIdx-1] : null;
  const yestRev    = yesterday ? allTxns.filter(t=>t.date===yesterday).reduce((s,t)=>s+t.total,0) : 0;
  const revDelta   = yestRev ? ((todayRev - yestRev) / yestRev * 100).toFixed(1) : null;

  // ── BUILD HTML ──────────────────────────────────────────────────────────────
  el.innerHTML = `
  <style>
    /* ══ Dashboard Scoped Styles ══ */

    /* KPI strip */
    .db-kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 20px;
    }
    .db-kpi {
      background: var(--white);
      border: 1px solid var(--g100);
      border-radius: var(--radius-lg);
      padding: 18px 20px;
      position: relative; overflow: hidden;
      transition: transform var(--tr), box-shadow var(--tr);
    }
    .db-kpi:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .db-kpi-accent {
      position: absolute; top: 0; left: 0;
      width: 4px; height: 100%;
      border-radius: 4px 0 0 4px;
    }
    .db-kpi-icon { font-size: 1.3rem; margin-bottom: 8px; }
    .db-kpi-val {
      font-family: 'Playfair Display', serif;
      font-size: 1.55rem; font-weight: 700;
      color: var(--g900); line-height: 1; margin-bottom: 3px;
    }
    .db-kpi-label { font-size: .72rem; color: var(--gray-400); font-weight: 500; }
    .db-kpi-delta {
      display: inline-flex; align-items: center; gap: 3px;
      margin-top: 6px; font-size: .68rem; font-weight: 700;
      padding: 2px 8px; border-radius: var(--radius-full);
    }
    .db-kpi-delta.up   { background: var(--g100);          color: var(--g700); }
    .db-kpi-delta.down { background: var(--danger-light);   color: var(--danger); }
    .db-kpi-delta.warn { background: var(--warning-light);  color: var(--warning); }
    .db-kpi-delta.neu  { background: var(--gray-100);       color: var(--gray-500); }

    /* Charts row */
    .db-charts-row {
      display: grid;
      grid-template-columns: 1.65fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .db-chart-card {
      background: var(--white);
      border: 1px solid var(--g100);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }
    .db-chart-head {
      padding: 16px 20px 10px;
      border-bottom: 1px solid var(--g50);
      display: flex; align-items: center;
      justify-content: space-between; gap: 10px; flex-wrap: wrap;
    }
    .db-chart-title {
      font-family: 'Playfair Display', serif;
      font-size: .96rem; font-weight: 700; color: var(--g900);
    }
    .db-chart-sub { font-size: .7rem; color: var(--gray-400); margin-top: 1px; }
    .db-chart-body { padding: 14px 16px 12px; position: relative; }
    .db-chart-body.tall { height: 220px; }
    .db-chart-body.short { height: 190px; }

    /* Live badge */
    .db-live-badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 9px; border-radius: var(--radius-full);
      background: var(--g100); color: var(--g700);
      font-size: .65rem; font-weight: 700; letter-spacing: .05em;
    }
    .db-live-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--g500);
      animation: db-pulse 1.8s ease-in-out infinite;
    }
    @keyframes db-pulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50%      { opacity: .4; transform: scale(.7); }
    }

    /* ── Traffic Light Panel ── */
    .db-tl-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 14px;
      margin-bottom: 16px;
    }
    .db-tl-card {
      border-radius: var(--radius-xl);
      border: 1.5px solid transparent;
      overflow: hidden;
      transition: box-shadow var(--tr);
    }
    .db-tl-card:hover { box-shadow: var(--shadow-md); }
    .db-tl-card.tl-red   { background: linear-gradient(160deg,#fff1f2,#ffe4e6); border-color: #fca5a5; }
    .db-tl-card.tl-amber { background: linear-gradient(160deg,#fffbeb,#fef3c7); border-color: #fde68a; }
    .db-tl-card.tl-green { background: linear-gradient(160deg,var(--g50),#dcfce7); border-color: var(--g200); }
    .db-tl-head {
      padding: 14px 16px 10px;
      display: flex; align-items: center; gap: 10px;
    }
    .db-tl-light {
      width: 18px; height: 18px; border-radius: 50%;
      flex-shrink: 0; box-shadow: 0 0 8px currentColor;
    }
    .tl-red   .db-tl-light { background: var(--danger); color: var(--danger); }
    .tl-amber .db-tl-light { background: var(--warning); color: var(--warning); }
    .tl-green .db-tl-light { background: var(--g500); color: var(--g500); }
    .db-tl-heading {
      font-family: 'Playfair Display', serif;
      font-size: .88rem; font-weight: 700;
    }
    .tl-red   .db-tl-heading { color: #991b1b; }
    .tl-amber .db-tl-heading { color: #92400e; }
    .tl-green .db-tl-heading { color: var(--g800); }
    .db-tl-count {
      margin-left: auto; font-size: .68rem; font-weight: 700;
      padding: 2px 8px; border-radius: var(--radius-full);
    }
    .tl-red   .db-tl-count { background: var(--danger-light); color: var(--danger); }
    .tl-amber .db-tl-count { background: var(--warning-light); color: var(--warning); }
    .tl-green .db-tl-count { background: var(--g100); color: var(--g700); }
    .db-tl-body { padding: 0 16px 14px; }
    .db-tl-item {
      display: flex; align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid rgba(0,0,0,.04);
      gap: 8px;
    }
    .db-tl-item:last-child { border-bottom: none; }
    .db-tl-item-name { font-size: .78rem; font-weight: 600; color: var(--gray-800); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .db-tl-item-qty  { font-size: .72rem; font-family: 'JetBrains Mono', monospace; font-weight: 700; flex-shrink: 0; }
    .tl-red   .db-tl-item-qty { color: var(--danger); }
    .tl-amber .db-tl-item-qty { color: var(--warning); }
    .tl-green .db-tl-item-qty { color: var(--g600); }
    .db-tl-action {
      display: block; width: 100%; text-align: center;
      margin-top: 8px; padding: 6px 0;
      border-radius: var(--radius-md); border: 1px dashed;
      font-size: .71rem; font-weight: 600; cursor: pointer;
      background: transparent; transition: all var(--tr-fast);
    }
    .tl-red   .db-tl-action { border-color: #fca5a5; color: var(--danger); }
    .tl-red   .db-tl-action:hover { background: var(--danger); color: white; border-style: solid; }
    .tl-amber .db-tl-action { border-color: #fde68a; color: var(--warning); }
    .tl-amber .db-tl-action:hover { background: var(--warning); color: white; border-style: solid; }
    .tl-green .db-tl-action { border-color: var(--g200); color: var(--g600); }
    .tl-green .db-tl-action:hover { background: var(--g600); color: white; border-style: solid; }
    .db-tl-empty { font-size: .75rem; color: var(--gray-400); padding: 8px 0 2px; font-style: italic; }

    /* ── Bottom row: Transactions + Activity ── */
    .db-bottom-row {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      margin-bottom: 8px;
    }

    /* Activity feed */
    .db-feed-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 0; border-bottom: 1px solid var(--g50);
    }
    .db-feed-item:last-child { border-bottom: none; }
    .db-feed-dot {
      width: 8px; height: 8px; border-radius: 50%;
      flex-shrink: 0; margin-top: 5px;
    }
    .db-feed-dot.sale    { background: var(--g500); }
    .db-feed-dot.alert   { background: var(--danger); }
    .db-feed-dot.pending { background: var(--warning); }
    .db-feed-text  { font-size: .79rem; color: var(--gray-700); flex: 1; line-height: 1.45; }
    .db-feed-time  { font-size: .67rem; color: var(--gray-400); flex-shrink: 0; font-family: 'JetBrains Mono', monospace; }

    /* Responsive */
    @media (max-width: 1024px) {
      .db-charts-row { grid-template-columns: 1fr; }
      .db-chart-body.tall  { height: 200px; }
      .db-chart-body.short { height: 180px; }
    }
    @media (max-width: 780px) {
      .db-kpi-row    { grid-template-columns: repeat(2, 1fr); }
      .db-tl-grid    { grid-template-columns: 1fr; }
      .db-bottom-row { grid-template-columns: 1fr; }
    }
    @media (max-width: 480px) {
      .db-kpi-row  { grid-template-columns: 1fr 1fr; gap: 10px; }
      .db-kpi-val  { font-size: 1.25rem; }
      .db-kpi      { padding: 14px 15px; }
      .db-charts-row { gap: 12px; }
    }
  </style>

  <!-- ══ KPI STRIP ════════════════════════════════════════════════════════════ -->
  <div class="db-kpi-row">

    <div class="db-kpi animate-in">
      <div class="db-kpi-accent" style="background:var(--g500);"></div>
      <div class="db-kpi-icon">💰</div>
      <div class="db-kpi-val">${formatPeso(todayRev)}</div>
      <div class="db-kpi-label">Today's Revenue</div>
      <div class="db-kpi-delta ${revDelta === null ? 'neu' : +revDelta >= 0 ? 'up' : 'down'}">
        ${revDelta === null ? '— No prior day' : (+revDelta >= 0 ? '↑' : '↓') + ' ' + Math.abs(revDelta) + '% vs yesterday'}
      </div>
    </div>

    <div class="db-kpi animate-in delay-1">
      <div class="db-kpi-accent" style="background:var(--gold);"></div>
      <div class="db-kpi-icon">🛒</div>
      <div class="db-kpi-val">${todayTxns.length}</div>
      <div class="db-kpi-label">Today's Transactions</div>
      <div class="db-kpi-delta ${todayTxns.length > 0 ? 'up' : 'neu'}">
        ${todayTxns.length > 0 ? '↑ Active today' : '— None yet'}
      </div>
    </div>

    <div class="db-kpi animate-in delay-2">
      <div class="db-kpi-accent" style="background:${redItems.length ? 'var(--danger)' : 'var(--g500)'};"></div>
      <div class="db-kpi-icon">${redItems.length ? '🚨' : '📦'}</div>
      <div class="db-kpi-val">${STORE.products.length}</div>
      <div class="db-kpi-label">Total Products</div>
      <div class="db-kpi-delta ${redItems.length ? 'down' : lowItems.length ? 'warn' : 'up'}">
        ${redItems.length ? `🔴 ${redItems.length} critical` : lowItems.length ? `⚠ ${lowItems.length} low stock` : '✓ All stocked'}
      </div>
    </div>

    <div class="db-kpi animate-in delay-3">
      <div class="db-kpi-accent" style="background:${pending ? 'var(--warning)' : 'var(--g400)'};"></div>
      <div class="db-kpi-icon">⏳</div>
      <div class="db-kpi-val">${pending}</div>
      <div class="db-kpi-label">Pending Registrations</div>
      <div class="db-kpi-delta ${pending ? 'warn' : 'up'}">
        ${pending ? 'Needs review' : '✓ None pending'}
      </div>
    </div>

  </div>

  <!-- ══ CHARTS ROW ════════════════════════════════════════════════════════════ -->
  <div class="db-charts-row">

    <!-- Line Chart — Hourly Sales Trend -->
    <div class="db-chart-card animate-in delay-1">
      <div class="db-chart-head">
        <div>
          <div class="db-chart-title">Hourly Sales Trend</div>
          <div class="db-chart-sub">Today's revenue by store hour · synced from POS</div>
        </div>
        <div class="db-live-badge"><div class="db-live-dot"></div> LIVE</div>
      </div>
      <div class="db-chart-body tall">
        <canvas id="db-line-chart"></canvas>
      </div>
    </div>

    <!-- Bar Chart — Sales by Category -->
    <div class="db-chart-card animate-in delay-2">
      <div class="db-chart-head">
        <div>
          <div class="db-chart-title">Sales by Category</div>
          <div class="db-chart-sub">All-time revenue breakdown</div>
        </div>
        <span style="font-size:.68rem;color:var(--gray-400);">${catEntries.length} categories</span>
      </div>
      <div class="db-chart-body short">
        <canvas id="db-bar-chart"></canvas>
      </div>
    </div>

  </div>

  <!-- ══ TRAFFIC-LIGHT ALERTS ══════════════════════════════════════════════════ -->
  <div class="db-tl-grid animate-in delay-2">

    <!-- 🔴 CRITICAL / RED -->
    <div class="db-tl-card tl-red">
      <div class="db-tl-head">
        <div class="db-tl-light"></div>
        <div class="db-tl-heading">Critical Stock</div>
        <div class="db-tl-count">${redItems.length} item${redItems.length!==1?'s':''}</div>
      </div>
      <div class="db-tl-body">
        ${redItems.length === 0
          ? `<div class="db-tl-empty">No critical items right now.</div>`
          : redItems.slice(0,5).map(p => `
            <div class="db-tl-item">
              <div class="db-tl-item-name" title="${p.name}">${p.name}</div>
              <div class="db-tl-item-qty">${p.qty} left</div>
            </div>`).join('')}
        ${redItems.length > 5 ? `<div class="db-tl-empty">+${redItems.length-5} more items</div>` : ''}
        <button class="db-tl-action" onclick="navigate('inventory')">
          ${redItems.length ? '➕ Restock Now' : '✓ View Inventory'}
        </button>
      </div>
    </div>

    <!-- 🟡 WARNING / AMBER -->
    <div class="db-tl-card tl-amber">
      <div class="db-tl-head">
        <div class="db-tl-light"></div>
        <div class="db-tl-heading">Low Stock Warning</div>
        <div class="db-tl-count">${amberItems.length} item${amberItems.length!==1?'s':''}</div>
      </div>
      <div class="db-tl-body">
        ${amberItems.length === 0
          ? `<div class="db-tl-empty">No low-stock warnings.</div>`
          : amberItems.slice(0,5).map(p => `
            <div class="db-tl-item">
              <div class="db-tl-item-name" title="${p.name}">${p.name}</div>
              <div class="db-tl-item-qty">${p.qty}/${p.low_stock}</div>
            </div>`).join('')}
        ${amberItems.length > 5 ? `<div class="db-tl-empty">+${amberItems.length-5} more</div>` : ''}
        <button class="db-tl-action" onclick="navigate('inventory')">
          View All Stock
        </button>
      </div>
    </div>

    <!-- 🟢 FRESH GOODS WATCH -->
    <div class="db-tl-card tl-green">
      <div class="db-tl-head">
        <div class="db-tl-light"></div>
        <div class="db-tl-heading">Fresh Goods Watch</div>
        <div class="db-tl-count">${freshItems.length} item${freshItems.length!==1?'s':''}</div>
      </div>
      <div class="db-tl-body">
        ${freshItems.length === 0
          ? `<div class="db-tl-empty">No fresh goods tracked.</div>`
          : freshItems.slice(0,5).map(p => `
            <div class="db-tl-item">
              <div class="db-tl-item-name" title="${p.name}">${p.name}</div>
              <div class="db-tl-item-qty">${p.qty} units</div>
            </div>`).join('')}
        ${freshItems.length > 5 ? `<div class="db-tl-empty">+${freshItems.length-5} more</div>` : ''}
        <button class="db-tl-action" onclick="navigate('products')">
          Check Products
        </button>
      </div>
    </div>

  </div>

  <!-- ══ BOTTOM ROW: Transactions + Activity Feed ══════════════════════════════ -->
  <div class="db-bottom-row">

    <!-- Recent Transactions -->
    <div class="db-chart-card animate-in delay-3">
      <div class="db-chart-head">
        <div>
          <div class="db-chart-title">Recent Transactions</div>
          <div class="db-chart-sub">Latest POS sales activity</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="navigate('sales')">View All →</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>TXN ID</th><th>Cashier</th><th>Total</th><th>Time</th></tr>
          </thead>
          <tbody>
            ${STORE.transactions.slice(0,6).map(t => `
              <tr>
                <td class="font-mono text-green fw-600">${t.id}</td>
                <td>${t.cashier}</td>
                <td class="fw-600">${formatPeso(t.total)}</td>
                <td class="text-muted text-sm">${t.time || t.date}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Activity Feed -->
    <div class="db-chart-card animate-in delay-3">
      <div class="db-chart-head">
        <div>
          <div class="db-chart-title">Activity Feed</div>
          <div class="db-chart-sub">Store floor events today</div>
        </div>
        <div class="db-live-badge"><div class="db-live-dot"></div> LIVE</div>
      </div>
      <div class="card-body" style="padding:4px 16px 12px;">
        ${[
          ...todayTxns.slice(0,3).map(t => ({
            type:'sale', text:`Sale ${t.id} — ${formatPeso(t.total)} by ${t.cashier}`, time: t.time || ''
          })),
          ...redItems.slice(0,2).map(p => ({
            type:'alert', text:`🔴 Critical: "${p.name}" has only ${p.qty} units left`, time:'Now'
          })),
          ...amberItems.slice(0,2).map(p => ({
            type:'alert', text:`🟡 Low: "${p.name}" approaching threshold (${p.qty}/${p.low_stock})`, time:'Now'
          })),
          ...(pending ? [{ type:'pending', text:`${pending} registration${pending>1?'s':''} awaiting approval`, time:'Pending' }] : []),
        ].slice(0,8).map(ev => `
          <div class="db-feed-item">
            <div class="db-feed-dot ${ev.type}"></div>
            <div class="db-feed-text">${ev.text}</div>
            <div class="db-feed-time">${ev.time}</div>
          </div>`).join('') || '<div class="empty-state" style="padding:18px 0;"><p>No activity yet today.</p></div>'}
      </div>
    </div>

  </div>`;

  // ── Quick add stock handler ─────────────────────────────────────────────────
  window.quickAddStock = (id) => openAddStockModal(id);

  // ── Draw Charts ─────────────────────────────────────────────────────────────
  function drawDashboardCharts() {
    // ① LINE CHART — Hourly Sales Trend
    const lineCtx = document.getElementById('db-line-chart');
    if (lineCtx) {
      if (window._dbLineChart) window._dbLineChart.destroy();
      const grad = lineCtx.getContext('2d').createLinearGradient(0, 0, 0, 200);
      grad.addColorStop(0, 'rgba(34,197,94,.20)');
      grad.addColorStop(1, 'rgba(34,197,94,.00)');
      window._dbLineChart = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: lineLabels,
          datasets: [{
            label: 'Revenue (₱)',
            data: lineData,
            fill: true,
            backgroundColor: grad,
            borderColor: '#16a34a',
            borderWidth: 2.2,
            pointBackgroundColor: '#16a34a',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 7,
            tension: 0.4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#052e16',
              titleColor: '#86efac',
              bodyColor: '#fff',
              padding: 10, cornerRadius: 8,
              callbacks: { label: ctx => ' ' + formatPeso(ctx.parsed.y) }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 0 }
            },
            y: {
              grid: { color: '#f0fdf4', lineWidth: 1 },
              ticks: {
                color: '#9ca3af', font: { size: 10 },
                callback: v => v >= 1000 ? '₱'+(v/1000).toFixed(1)+'k' : '₱'+v
              },
              beginAtZero: true
            }
          }
        }
      });
    }

    // ② BAR CHART — Sales by Category
    const barCtx = document.getElementById('db-bar-chart');
    if (barCtx) {
      if (window._dbBarChart) window._dbBarChart.destroy();
      window._dbBarChart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: barLabels,
          datasets: [{
            label: 'Revenue (₱)',
            data: barData,
            backgroundColor: BAR_COLORS.slice(0, barLabels.length).map(c => c + 'cc'),
            borderColor:     BAR_COLORS.slice(0, barLabels.length),
            borderWidth: 1.5,
            borderRadius: 5,
            hoverBackgroundColor: BAR_COLORS.slice(0, barLabels.length),
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#052e16',
              titleColor: '#86efac',
              bodyColor: '#fff',
              padding: 10, cornerRadius: 8,
              callbacks: { label: ctx => ' ' + formatPeso(ctx.parsed.y) }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 30 }
            },
            y: {
              grid: { color: '#f0fdf4' },
              ticks: {
                color: '#9ca3af', font: { size: 10 },
                callback: v => v >= 1000 ? '₱'+(v/1000).toFixed(1)+'k' : '₱'+v
              },
              beginAtZero: true
            }
          }
        }
      });
    }
  }

  // Load Chart.js if needed, then draw
  if (window.Chart) {
    drawDashboardCharts();
  } else {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    s.onload = drawDashboardCharts;
    document.head.appendChild(s);
  }
}
// ── USER MANAGEMENT ───────────────────────────────────────────────────────────
function userManagement(el) {
  const renderTable = () => {
    const users = STORE.users.filter(u => u.role === 'cashier');
    return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Contact</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>
                <div class="flex items-center gap-8">
                  <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--g600),var(--g400));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">${u.firstname[0]}</div>
                  <div>
                    <div class="fw-600">${u.firstname} ${u.mi ? u.mi+'. ' : ''}${u.lastname}</div>
                    <div class="text-xs text-muted">@${u.username}</div>
                  </div>
                </div>
              </td>
              <td class="font-mono text-muted text-sm">@${u.username}</td>
              <td class="text-sm">${u.contact || '—'}</td>
              <td>${u.status === 'active'
                ? `<span class="badge badge-success">✓ Active</span>`
                : `<span class="badge badge-danger">✕ Inactive</span>`}</td>
              <td class="text-sm text-muted">${u.created}</td>
              <td>
                <div class="flex gap-8">
                  <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${u.id})">✏️ Edit</button>
                  <button class="btn btn-sm ${u.status==='active'?'btn-warning':'btn-success'}" onclick="toggleStatus(${u.id})">${u.status==='active'?'Deactivate':'Activate'}</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  };

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">User Account Management</div><div class="section-desc">Manage cashier/staff accounts</div></div>
  </div>
  <div class="card animate-in">
    <div class="card-header"><div class="card-title">All Staff Accounts</div><span class="badge badge-green">${STORE.users.filter(u=>u.role==='cashier').length} Cashiers</span></div>
    <div id="user-table">${renderTable()}</div>
  </div>

  <!-- Edit User Modal -->
  <div class="modal-overlay" id="edit-user-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Edit Staff Info</div>
        <button class="modal-close" onclick="closeModal('edit-user-modal')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="edit-user-id" />
        <div class="form-group">
          <label class="form-label">First Name *</label>
          <input id="eu-firstname" class="form-control" placeholder="First name" />
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Middle Initial</label>
            <input id="eu-mi" class="form-control" placeholder="e.g. A" maxlength="2" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Last Name *</label>
            <input id="eu-lastname" class="form-control" placeholder="Last name" />
          </div>
        </div>
        <div class="form-group mt-16">
          <label class="form-label">Contact Number</label>
          <input id="eu-contact" class="form-control" placeholder="09XX-XXX-XXXX" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('edit-user-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveEditUser()">Save Changes</button>
      </div>
    </div>
  </div>`;

  window.openEditUserModal = (id) => {
    const u = STORE.users.find(x => x.id === id);
    if (!u) return;
    $('edit-user-id').value = id;
    $('eu-firstname').value = u.firstname;
    $('eu-mi').value = u.mi || '';
    $('eu-lastname').value = u.lastname;
    $('eu-contact').value = u.contact || '';
    openModal('edit-user-modal');
  };

  window.saveEditUser = () => {
    const id = parseInt($('edit-user-id').value);
    const firstname = $('eu-firstname').value.trim();
    const mi = $('eu-mi').value.trim().toUpperCase();
    const lastname = $('eu-lastname').value.trim();
    const contact = $('eu-contact').value.trim();
    if (!firstname || !lastname) { showToast('First name and last name are required.', 'error'); return; }
    const idx = STORE.users.findIndex(u => u.id === id);
    if (idx === -1) return;
    STORE.users[idx] = { ...STORE.users[idx], firstname, mi, lastname, contact };
    showToast('Staff info updated successfully!');
    closeModal('edit-user-modal');
    $('user-table').innerHTML = renderTable();
  };

  window.toggleStatus = (id) => {
    const u = STORE.users.find(x => x.id === id);
    if (!u) return;
    u.status = u.status === 'active' ? 'inactive' : 'active';
    showToast(`Account ${u.status === 'active' ? 'activated' : 'deactivated'}.`, u.status === 'active' ? 'success' : 'warning');
    $('user-table').innerHTML = renderTable();
    updateBadges();
  };
}

// ── PENDING REGISTRATIONS ─────────────────────────────────────────────────────
function pendingRegistrations(el) {
  const renderList = () => {
    const list = STORE.pendingUsers || [];
    if (list.length === 0) {
      return `<div class="empty-state"><div class="empty-icon">✅</div><p>No pending registrations.</p></div>`;
    }
    return list.map(u => `
      <div class="pending-user-card animate-in" id="pending-${u.id}">
        <div class="flex items-center gap-12">
          <div class="pending-avatar">${u.firstname[0]}</div>
          <div>
            <div class="pending-info-name">${u.firstname} ${u.mi ? u.mi+'. ' : ''}${u.lastname}</div>
            <div class="pending-info-sub">@${u.username} &nbsp;·&nbsp; ${u.contact} &nbsp;·&nbsp; Registered ${u.created}</div>
          </div>
        </div>
        <div class="pending-actions">
          <button class="btn btn-success btn-sm" onclick="acceptUser(${u.id})">✓ Accept</button>
          <button class="btn btn-danger btn-sm" onclick="declineUser(${u.id})">✕ Decline</button>
        </div>
      </div>
    `).join('');
  };

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Pending Registrations</div><div class="section-desc">Review and approve new account requests</div></div>
    <span class="badge badge-warning" style="padding:6px 14px;">⏳ ${(STORE.pendingUsers||[]).length} Pending</span>
  </div>
  <div id="pending-list">${renderList()}</div>`;

  window.acceptUser = (id) => {
    const idx = (STORE.pendingUsers || []).findIndex(u => u.id === id);
    if (idx === -1) return;
    const user = STORE.pendingUsers[idx];
    user.status = 'active';
    STORE.users.push(user);
    STORE.pendingUsers.splice(idx, 1);
    showToast(`${user.firstname} ${user.lastname} has been approved!`);
    $('pending-list').innerHTML = renderList();
    updateBadges();
  };

  window.declineUser = (id) => {
    const idx = (STORE.pendingUsers || []).findIndex(u => u.id === id);
    if (idx === -1) return;
    const user = STORE.pendingUsers[idx];
    if (!confirm(`Decline registration for ${user.firstname} ${user.lastname}?`)) return;
    STORE.pendingUsers.splice(idx, 1);
    showToast(`Registration for ${user.firstname} declined.`, 'warning');
    $('pending-list').innerHTML = renderList();
    updateBadges();
  };
}

// ── PRODUCT MANAGEMENT ────────────────────────────────────────────────────────
function productManagement(el) {
  const renderTable = (list) => `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Product Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Low Stock Threshold</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${list.map(p => `
          <tr>
            <td class="fw-600">${p.name}</td>
            <td><span class="badge badge-green">${p.category}</span></td>
            <td class="fw-600 font-mono">${formatPeso(p.price)}</td>
            <td class="font-mono">${p.qty}</td>
            <td class="font-mono text-muted">${p.low_stock}</td>
            <td>${p.qty <= p.low_stock
              ? `<span class="badge badge-danger">⚠ Low</span>`
              : `<span class="badge badge-success">✓ OK</span>`}</td>
            <td>
              <div class="flex gap-8">
                <button class="btn btn-secondary btn-sm" onclick="openEditProduct(${p.id})">✏️ Edit</button>
                <button class="btn btn-success btn-sm" onclick="openAddStockModal(${p.id})">+ Stock</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">🗑️</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Product Management</div><div class="section-desc">Add, edit, and remove store products</div></div>
    <button class="btn btn-primary" onclick="openAddProduct()">＋ Add Product</button>
  </div>
  <div class="card animate-in">
    <div class="card-header">
      <div class="flex items-center gap-12">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input id="prod-search" class="form-control" placeholder="Search products..." oninput="filterProducts()" />
        </div>
        <select id="cat-filter" class="form-control" style="width:160px;" onchange="filterProducts()">
          <option value="">All Categories</option>
          ${[...new Set(STORE.products.map(p=>p.category))].map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <span class="text-muted text-sm" id="prod-count">${STORE.products.length} products</span>
    </div>
    <div id="prod-table">${renderTable(STORE.products)}</div>
  </div>

  <!-- Add/Edit Product Modal -->
  <div class="modal-overlay" id="product-modal">
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title" id="product-modal-title">Add New Product</div>
        <button class="modal-close" onclick="closeModal('product-modal')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="p-edit-id" />
        <div class="form-group">
          <label class="form-label">Product Name *</label>
          <input id="p-name" class="form-control" placeholder="e.g. Rice (5kg)" />
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Category *</label>
            <input id="p-cat" class="form-control" placeholder="e.g. Grains" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Price (₱) *</label>
            <input id="p-price" class="form-control" type="number" min="0" step="0.01" placeholder="0.00" />
          </div>
        </div>
        <div class="form-row mt-16">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Stock Quantity *</label>
            <input id="p-qty" class="form-control" type="number" min="0" placeholder="0" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Low Stock Threshold</label>
            <input id="p-low" class="form-control" type="number" min="1" placeholder="10" />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('product-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveProduct()">Save Product</button>
      </div>
    </div>
  </div>

  <!-- Add Stock Modal -->
  <div class="modal-overlay" id="stock-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">➕ Add Stock</div>
        <button class="modal-close" onclick="closeModal('stock-modal')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="stock-product-id" />
        <div style="background:var(--g50);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;">
          <div class="fw-600" id="stock-product-name">Product Name</div>
          <div class="text-sm text-muted mt-4">Current stock: <span class="fw-600 font-mono" id="stock-current-qty">0</span> units</div>
        </div>
        <div class="form-group">
          <label class="form-label">Quantity to Add *</label>
          <input id="stock-add-qty" class="form-control" type="number" min="1" placeholder="Enter quantity to add" />
        </div>
        <div class="form-group">
          <label class="form-label">Note (optional)</label>
          <input id="stock-note" class="form-control" placeholder="e.g. Delivery from supplier" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('stock-modal')">Cancel</button>
        <button class="btn btn-success" onclick="confirmAddStock()">✓ Add Stock</button>
      </div>
    </div>
  </div>`;

  window.filterProducts = () => {
    const q = ($('prod-search')?.value || '').toLowerCase();
    const cat = $('cat-filter')?.value || '';
    let list = STORE.products;
    if (cat) list = list.filter(p => p.category === cat);
    if (q)   list = list.filter(p => p.name.toLowerCase().includes(q));
    $('prod-count').textContent = `${list.length} products`;
    $('prod-table').innerHTML = renderTable(list);
  };

  window.openAddProduct = () => {
    ['p-name','p-cat','p-price','p-qty','p-low'].forEach(id => { if($(id)) $(id).value=''; });
    $('p-edit-id').value = '';
    $('product-modal-title').textContent = 'Add New Product';
    openModal('product-modal');
  };

  window.openEditProduct = (id) => {
    const p = STORE.products.find(x => x.id === id);
    if (!p) return;
    $('p-edit-id').value = id;
    $('p-name').value = p.name;
    $('p-cat').value = p.category;
    $('p-price').value = p.price;
    $('p-qty').value = p.qty;
    $('p-low').value = p.low_stock;
    $('product-modal-title').textContent = 'Edit Product';
    openModal('product-modal');
  };

  window.saveProduct = () => {
    const name  = $('p-name').value.trim();
    const cat   = $('p-cat').value.trim();
    const price = parseFloat($('p-price').value);
    const qty   = parseInt($('p-qty').value);
    const low   = parseInt($('p-low').value) || 10;
    if (!name || !cat || isNaN(price) || isNaN(qty)) { showToast('Please fill all required fields.', 'error'); return; }
    const editId = parseInt($('p-edit-id').value);
    if (editId) {
      const idx = STORE.products.findIndex(p => p.id === editId);
      STORE.products[idx] = { ...STORE.products[idx], name, category:cat, price, qty, low_stock:low };
      showToast('Product updated!');
    } else {
      STORE.products.push({ id: nextId(STORE.products), name, category:cat, price, qty, low_stock:low });
      showToast('Product added!');
    }
    closeModal('product-modal');
    filterProducts();
    updateBadges();
  };

  window.deleteProduct = (id) => {
    if (!confirm('Delete this product from inventory?')) return;
    STORE.products = STORE.products.filter(p => p.id !== id);
    showToast('Product deleted.', 'warning');
    filterProducts();
    updateBadges();
  };
}

// ── ADD STOCK MODAL (shared) ──────────────────────────────────────────────────
function openAddStockModal(productId) {
  const p = STORE.products.find(x => x.id === productId);
  if (!p) return;
  const stockModal = document.getElementById('stock-modal');
  // If not found in current page DOM, inject it
  if (!stockModal) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="stock-modal">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">➕ Add Stock</div>
            <button class="modal-close" onclick="closeModal('stock-modal')">✕</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="stock-product-id" />
            <div style="background:var(--g50);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;">
              <div class="fw-600" id="stock-product-name">Product Name</div>
              <div class="text-sm text-muted mt-4">Current stock: <span class="fw-600 font-mono" id="stock-current-qty">0</span> units</div>
            </div>
            <div class="form-group">
              <label class="form-label">Quantity to Add *</label>
              <input id="stock-add-qty" class="form-control" type="number" min="1" placeholder="Enter quantity" />
            </div>
            <div class="form-group">
              <label class="form-label">Note (optional)</label>
              <input id="stock-note" class="form-control" placeholder="e.g. Delivery from supplier" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('stock-modal')">Cancel</button>
            <button class="btn btn-success" onclick="confirmAddStock()">✓ Add Stock</button>
          </div>
        </div>
      </div>`);
  }
  document.getElementById('stock-product-id').value = productId;
  document.getElementById('stock-product-name').textContent = p.name;
  document.getElementById('stock-current-qty').textContent = p.qty;
  document.getElementById('stock-add-qty').value = '';
  document.getElementById('stock-note').value = '';
  openModal('stock-modal');
}
window.openAddStockModal = openAddStockModal;

window.confirmAddStock = () => {
  const id  = parseInt(document.getElementById('stock-product-id').value);
  const qty = parseInt(document.getElementById('stock-add-qty').value);
  if (!qty || qty < 1) { showToast('Please enter a valid quantity.', 'error'); return; }
  const p = STORE.products.find(x => x.id === id);
  if (!p) return;
  p.qty += qty;
  showToast(`Added ${qty} units to "${p.name}". New stock: ${p.qty}`);
  closeModal('stock-modal');
  // Refresh current view
  navigate(document.querySelector('.nav-item.active')?.dataset.page || 'inventory');
};

// ── INVENTORY ─────────────────────────────────────────────────────────────────
function inventory(el) {
  const lowItems = lowStockProducts();

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Inventory Monitoring</div><div class="section-desc">Real-time stock levels for all products</div></div>
    ${lowItems.length ? `<span class="badge badge-danger" style="padding:6px 14px;">⚠ ${lowItems.length} Low Stock</span>` : ''}
  </div>

  ${lowItems.length ? `
  <div class="card mb-18 animate-in" style="border-left:4px solid var(--danger);">
    <div class="card-header">
      <div class="card-title" style="color:var(--danger);">⚠ Low Stock — Restock Required</div>
      <div class="card-sub">Click "+ Add Stock" to restock directly</div>
    </div>
    <div class="card-body" style="padding-top:10px;">
      ${lowItems.map(p => `
        <div class="stock-add-card">
          <div>
            <div class="product-name">${p.name}</div>
            <div class="product-meta">${p.category} &nbsp;·&nbsp; Threshold: ${p.low_stock} units</div>
          </div>
          <div class="flex items-center gap-8">
            <span class="badge badge-danger fw-700">${p.qty} left</span>
            <button class="btn btn-success btn-sm" onclick="openAddStockModal(${p.id})">➕ Add Stock</button>
          </div>
        </div>`).join('')}
    </div>
  </div>` : ''}

  <div class="card animate-in delay-1">
    <div class="card-header"><div class="card-title">All Products — Stock Overview</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product Name</th><th>Category</th><th>In Stock</th><th>Threshold</th><th>Stock Level</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${STORE.products.map(p => {
            const max = Math.max(p.low_stock * 3, p.qty, 1);
            const pct = Math.min(100, Math.round((p.qty / max) * 100));
            const cls = p.qty <= p.low_stock / 2 ? 'low' : p.qty <= p.low_stock ? 'med' : '';
            return `<tr>
              <td class="fw-600">${p.name}</td>
              <td><span class="badge badge-green">${p.category}</span></td>
              <td class="font-mono fw-600 ${p.qty <= p.low_stock ? 'text-danger' : ''}">${p.qty}</td>
              <td class="font-mono text-muted">${p.low_stock}</td>
              <td style="min-width:120px;">
                <div class="flex items-center gap-8">
                  <div class="progress-bar" style="flex:1;"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
                  <span class="text-xs">${pct}%</span>
                </div>
              </td>
              <td>${p.qty <= p.low_stock ? `<span class="badge badge-danger">⚠ Low</span>` : `<span class="badge badge-success">✓ OK</span>`}</td>
              <td><button class="btn btn-success btn-sm" onclick="openAddStockModal(${p.id})">➕ Add Stock</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── SALES MONITORING ──────────────────────────────────────────────────────────
function salesMonitoring(el) {
  const txns = STORE.transactions;
  const total = txns.reduce((s, t) => s + t.total, 0);
  const todayTxns = txns.filter(t => t.date === '2025-07-14');
  const todayRev = todayTxns.reduce((s, t) => s + t.total, 0);

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Sales Monitoring</div><div class="section-desc">All recorded transactions</div></div>
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input id="txn-search" class="form-control" placeholder="Search by cashier or ID..." oninput="filterTxns()" />
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">
    <div class="stat-card c-green animate-in">
      <div class="stat-icon c-green">💰</div>
      <div class="stat-value">${formatPeso(todayRev)}</div>
      <div class="stat-label">Today's Revenue</div>
    </div>
    <div class="stat-card c-teal animate-in delay-1">
      <div class="stat-icon c-teal">💳</div>
      <div class="stat-value">${txns.length}</div>
      <div class="stat-label">Total Transactions</div>
    </div>
    <div class="stat-card c-gold animate-in delay-2">
      <div class="stat-icon c-gold">📊</div>
      <div class="stat-value">${formatPeso(txns.length ? total / txns.length : 0)}</div>
      <div class="stat-label">Average Sale</div>
    </div>
  </div>

  <div class="card animate-in delay-2">
    <div class="card-header"><div class="card-title">Transaction History</div></div>
    <div class="table-wrap" id="txn-table">
      ${renderTxnTable(txns)}
    </div>
  </div>

  <!-- Transaction Detail Modal -->
  <div class="modal-overlay" id="txn-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Transaction Details</div>
        <button class="modal-close" onclick="closeModal('txn-modal')">✕</button>
      </div>
      <div class="modal-body" id="txn-modal-body"></div>
    </div>
  </div>`;

  window.filterTxns = () => {
    const q = ($('txn-search')?.value || '').toLowerCase();
    const list = STORE.transactions.filter(t =>
      t.id.toLowerCase().includes(q) || t.cashier.toLowerCase().includes(q));
    $('txn-table').innerHTML = renderTxnTable(list);
  };

  window.viewTxn = (id) => {
    const t = STORE.transactions.find(x => x.id === id);
    if (!t) return;
    $('txn-modal-body').innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <div class="receipt-title">RITO&TATA Grocery Store</div>
        <div class="text-muted text-xs" style="margin-top:4px;">${t.date} &nbsp;·&nbsp; ${t.time}</div>
        <div class="text-xs" style="margin-top:4px;color:var(--gray-600);">Cashier: ${t.cashier} &nbsp;·&nbsp; ${t.id}</div>
      </div>
      ${t.items.map(i => `<div class="receipt-row"><span>${i.name} × ${i.qty}</span><span>${formatPeso(i.price * i.qty)}</span></div>`).join('')}
      <div class="receipt-total"><span>TOTAL</span><span>${formatPeso(t.total)}</span></div>
      <div style="text-align:center;margin-top:12px;font-size:.68rem;color:var(--gray-400);">— Thank you for shopping! —</div>
    </div>`;
    openModal('txn-modal');
  };
}

function renderTxnTable(txns) {
  if (!txns.length) return `<div class="empty-state"><div class="empty-icon">🧾</div><p>No transactions found.</p></div>`;
  return `<table>
    <thead><tr><th>TXN ID</th><th>Cashier</th><th>Items</th><th>Total</th><th>Date</th><th>Time</th><th></th></tr></thead>
    <tbody>
      ${txns.map(t => `
        <tr>
          <td class="font-mono text-green fw-600">${t.id}</td>
          <td>${t.cashier}</td>
          <td class="text-muted text-sm">${t.items.length} item(s)</td>
          <td class="fw-600">${formatPeso(t.total)}</td>
          <td class="text-sm">${t.date}</td>
          <td class="text-sm text-muted">${t.time}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewTxn('${t.id}')">View</button></td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// ── REPORTS — The History Book (Owner / Accountant View) ──────────────────────
function reports(el) {
  // ── Shared data ─────────────────────────────────────────────────────────────
  const ALL_TXNS = STORE.transactions;
  const TODAY    = '2025-07-14';

  // All unique sorted dates in data
  const allDates = [...new Set(ALL_TXNS.map(t => t.date))].sort();

  // ── Period helpers ───────────────────────────────────────────────────────────
  const todayIdx  = allDates.indexOf(TODAY);
  const YESTERDAY = todayIdx > 0 ? allDates[todayIdx - 1] : TODAY;
  const LAST_MONTH_DATES = allDates.filter(d => d !== TODAY);

  let activePeriod = 'yesterday';

  function txnsFor(period, customFrom, customTo) {
    if (period === 'yesterday') return ALL_TXNS.filter(t => t.date === YESTERDAY);
    if (period === 'lastmonth') return ALL_TXNS.filter(t => LAST_MONTH_DATES.includes(t.date));
    if (period === 'alltime')   return ALL_TXNS;
    if (period === 'custom' && customFrom && customTo)
      return ALL_TXNS.filter(t => t.date >= customFrom && t.date <= customTo);
    return ALL_TXNS;
  }

  function periodLabel(period, customFrom, customTo) {
    if (period === 'yesterday')  return fmtDateLong(YESTERDAY);
    if (period === 'lastmonth')  return 'Last Month (All Prior Days)';
    if (period === 'alltime')    return 'All-Time Record';
    if (period === 'custom')     return `${fmtDateLong(customFrom)} — ${fmtDateLong(customTo)}`;
    return '';
  }

  // ── Formatters ───────────────────────────────────────────────────────────────
  function fmtDateLong(d) {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    const months = ['','January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    return `${months[+m]} ${+day}, ${y}`;
  }
  function fmtDateShort(d) {
    if (!d) return '—';
    const [, m, day] = d.split('-');
    const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[+m]} ${+day}`;
  }

  const PALETTE = ['#16a34a','#22c55e','#4ade80','#0d9488','#ca8a04','#0369a1','#e11d48','#7c3aed'];

  // ── Render report output ─────────────────────────────────────────────────────
  function renderReport(period, customFrom, customTo) {
    const txns  = txnsFor(period, customFrom, customTo);
    const label = periodLabel(period, customFrom, customTo);
    const total = txns.reduce((s, t) => s + t.total, 0);
    const avg   = txns.length ? total / txns.length : 0;
    const dates = [...new Set(txns.map(t => t.date))].sort();

    const revByDate = {};
    txns.forEach(t => { revByDate[t.date] = (revByDate[t.date] || 0) + t.total; });

    const prodMap = {};
    txns.forEach(t => t.items.forEach(i => {
      if (!prodMap[i.name]) prodMap[i.name] = { qty: 0, rev: 0 };
      prodMap[i.name].qty += i.qty;
      prodMap[i.name].rev += i.price * i.qty;
    }));
    const prodRows = Object.entries(prodMap).sort((a,b) => b[1].rev - a[1].rev);

    const catRev = {};
    txns.forEach(t => t.items.forEach(i => {
      const prod = STORE.products.find(p => p.name === i.name);
      const cat  = prod?.category || 'Other';
      catRev[cat] = (catRev[cat] || 0) + i.price * i.qty;
    }));
    const catEntries = Object.entries(catRev).sort((a,b) => b[1]-a[1]);
    const catTotal   = catEntries.reduce((s,[,v]) => s+v, 0) || 1;

    const out = document.getElementById('rpt-report-out');
    out.style.display = '';
    out.innerHTML = `
    <style>
      .rpt-section-head {
        padding: 18px 22px 12px;
        border-bottom: 1px solid var(--g50);
        display: flex; align-items: center;
        justify-content: space-between; gap: 12px; flex-wrap: wrap;
      }
      .rpt-section-title { font-family: 'Playfair Display', serif; font-size: 1rem; font-weight: 700; color: var(--g900); }
      .rpt-section-sub   { font-size: .72rem; color: var(--gray-400); margin-top: 2px; }
      .rpt-sum-grid {
        display: grid; grid-template-columns: repeat(4,1fr);
        gap: 0; border-bottom: 1px solid var(--g100);
      }
      .rpt-sum-cell { padding: 20px 22px; border-right: 1px solid var(--g100); }
      .rpt-sum-cell:last-child { border-right: none; }
      .rpt-sum-label { font-size: .67rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--gray-400); margin-bottom: 6px; }
      .rpt-sum-val   { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 700; color: var(--g900); line-height: 1; }
      .rpt-sum-note  { font-size: .7rem; color: var(--gray-400); margin-top: 4px; }
      .rpt-bar-wrap  { padding: 20px 22px 16px; height: 220px; position: relative; }
      .rpt-prod-table { width: 100%; border-collapse: collapse; font-size: .81rem; }
      .rpt-prod-table thead th { background: var(--g50); color: var(--g800); font-weight: 600; font-size: .68rem; letter-spacing: .07em; text-transform: uppercase; padding: 8px 16px; text-align: left; border-bottom: 2px solid var(--g100); white-space: nowrap; }
      .rpt-prod-table tbody tr { border-bottom: 1px solid var(--gray-100); transition: background var(--tr-fast); }
      .rpt-prod-table tbody tr:hover { background: var(--g50); }
      .rpt-prod-table tbody tr:last-child { border-bottom: none; }
      .rpt-prod-table tbody td { padding: 9px 16px; color: var(--gray-900); vertical-align: middle; }
      .rpt-cat-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 10px; padding: 16px 22px 20px; }
      .rpt-cat-pill { background: var(--g50); border: 1px solid var(--g100); border-radius: var(--radius-md); padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
      .rpt-cat-dot  { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .rpt-cat-name { font-size: .8rem; font-weight: 600; color: var(--g800); flex: 1; }
      .rpt-cat-amt  { font-size: .77rem; font-weight: 700; color: var(--g700); font-family: 'JetBrains Mono', monospace; }
      .rpt-cat-pct  { font-size: .67rem; color: var(--gray-400); margin-top: 1px; }
      .rpt-print-footer { padding: 14px 22px; border-top: 1px solid var(--g100); font-size: .7rem; color: var(--gray-400); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
      @media (max-width: 700px) { .rpt-sum-grid { grid-template-columns: 1fr 1fr; } .rpt-sum-cell { border-right: none; border-bottom: 1px solid var(--g100); } }
      @media (max-width: 420px) { .rpt-sum-grid { grid-template-columns: 1fr; } .rpt-sum-val { font-size: 1.25rem; } }
    </style>

    <div class="card animate-in" id="rpt-printable">

      <!-- ① SUMMARY -->
      <div class="rpt-section-head">
        <div>
          <div class="rpt-section-title">📋 Summary — ${label}</div>
          <div class="rpt-section-sub">Covering ${dates.length} day${dates.length!==1?'s':''} · ${txns.length} transaction${txns.length!==1?'s':''}</div>
        </div>
      </div>
      <div class="rpt-sum-grid">
        <div class="rpt-sum-cell">
          <div class="rpt-sum-label">Total Revenue</div>
          <div class="rpt-sum-val">${formatPeso(total)}</div>
          <div class="rpt-sum-note">Gross sales collected</div>
        </div>
        <div class="rpt-sum-cell">
          <div class="rpt-sum-label">Transactions</div>
          <div class="rpt-sum-val">${txns.length}</div>
          <div class="rpt-sum-note">Completed sales</div>
        </div>
        <div class="rpt-sum-cell">
          <div class="rpt-sum-label">Avg. per Sale</div>
          <div class="rpt-sum-val">${formatPeso(avg)}</div>
          <div class="rpt-sum-note">Average basket size</div>
        </div>
        <div class="rpt-sum-cell">
          <div class="rpt-sum-label">Items Sold</div>
          <div class="rpt-sum-val">${txns.reduce((s,t)=>s+t.items.reduce((a,i)=>a+i.qty,0),0)}</div>
          <div class="rpt-sum-note">Total units moved</div>
        </div>
      </div>

      <!-- ② DAILY BAR CHART (multi-day periods only) -->
      ${dates.length > 1 ? `
      <div class="rpt-section-head" style="padding-top:16px;">
        <div>
          <div class="rpt-section-title">📅 Daily Revenue Breakdown</div>
          <div class="rpt-section-sub">Revenue per day across the selected period</div>
        </div>
      </div>
      <div class="rpt-bar-wrap"><canvas id="rpt-bar-canvas"></canvas></div>` : ''}

      <!-- ③ REVENUE BY CATEGORY -->
      <div class="rpt-section-head" style="padding-top:16px;">
        <div>
          <div class="rpt-section-title">🏷 Revenue by Category</div>
          <div class="rpt-section-sub">Which product categories generated the most income</div>
        </div>
      </div>
      ${catEntries.length === 0
        ? `<div class="empty-state" style="padding:24px;"><div class="empty-icon">📦</div><p>No category data.</p></div>`
        : `<div class="rpt-cat-grid">
          ${catEntries.map(([cat, rev], i) => `
          <div class="rpt-cat-pill">
            <div class="rpt-cat-dot" style="background:${PALETTE[i%PALETTE.length]}"></div>
            <div>
              <div class="rpt-cat-name">${cat}</div>
              <div class="rpt-cat-pct">${Math.round((rev/catTotal)*100)}% of period revenue</div>
            </div>
            <div class="rpt-cat-amt">${formatPeso(rev)}</div>
          </div>`).join('')}
        </div>`}

      <!-- ④ PRODUCT SALES TABLE -->
      <div class="rpt-section-head" style="padding-top:16px;">
        <div>
          <div class="rpt-section-title">📦 Product Sales Detail</div>
          <div class="rpt-section-sub">Units sold and revenue per product — sorted by revenue</div>
        </div>
      </div>
      ${prodRows.length === 0
        ? `<div class="empty-state" style="padding:24px;"><p>No product data for this period.</p></div>`
        : `<div class="table-wrap">
          <table class="rpt-prod-table">
            <thead><tr><th>#</th><th>Product Name</th><th>Category</th><th>Units Sold</th><th>Revenue</th><th>% of Total</th></tr></thead>
            <tbody>
              ${prodRows.map(([name, d], i) => {
                const prod = STORE.products.find(p => p.name === name);
                const cat  = prod?.category || '—';
                const pct  = total ? Math.round((d.rev/total)*100) : 0;
                return `<tr>
                  <td class="text-muted text-xs font-mono">${i+1}</td>
                  <td class="fw-600">${name}</td>
                  <td><span class="badge badge-green">${cat}</span></td>
                  <td class="font-mono fw-600">${d.qty}</td>
                  <td class="font-mono fw-600 text-green">${formatPeso(d.rev)}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="flex:1;height:5px;background:var(--g100);border-radius:99px;overflow:hidden;min-width:48px;">
                        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--g600),var(--g400));border-radius:99px;"></div>
                      </div>
                      <span class="text-xs text-muted">${pct}%</span>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}

      <!-- ⑤ CASHIER PERFORMANCE -->
      <div class="rpt-section-head" style="padding-top:16px;">
        <div>
          <div class="rpt-section-title">👤 Cashier Performance</div>
          <div class="rpt-section-sub">Transactions and revenue per staff member</div>
        </div>
      </div>
      ${(() => {
        const cashMap = {};
        txns.forEach(t => {
          if (!cashMap[t.cashier]) cashMap[t.cashier] = { count: 0, rev: 0 };
          cashMap[t.cashier].count++;
          cashMap[t.cashier].rev += t.total;
        });
        const rows = Object.entries(cashMap).sort((a,b) => b[1].rev - a[1].rev);
        if (!rows.length) return '<div class="empty-state" style="padding:24px;"><p>No cashier data.</p></div>';
        return `<div class="table-wrap">
          <table class="rpt-prod-table">
            <thead><tr><th>#</th><th>Cashier</th><th>Transactions</th><th>Total Revenue</th><th>Avg. per Sale</th></tr></thead>
            <tbody>
              ${rows.map(([name, d], i) => `
              <tr>
                <td class="text-muted text-xs font-mono">${i+1}</td>
                <td class="fw-600">${name}</td>
                <td class="font-mono">${d.count}</td>
                <td class="font-mono fw-600 text-green">${formatPeso(d.rev)}</td>
                <td class="font-mono text-muted">${formatPeso(d.count ? d.rev/d.count : 0)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      })()}

      <!-- ⑥ FULL TRANSACTION LOG -->
      <div class="rpt-section-head" style="padding-top:16px;">
        <div>
          <div class="rpt-section-title">🧾 Transaction Log</div>
          <div class="rpt-section-sub">Complete list of all ${txns.length} transactions in this period</div>
        </div>
      </div>
      ${txns.length === 0
        ? `<div class="empty-state" style="padding:24px;"><div class="empty-icon">🧾</div><p>No transactions in this period.</p></div>`
        : `<div class="table-wrap">${renderTxnTable(txns)}</div>`}

      <!-- Footer -->
      <div class="rpt-print-footer">
        <span>RITO&amp;TATA Grocery Store &nbsp;·&nbsp; Admin Report &nbsp;·&nbsp; ${label}</span>
        <span>Generated: ${new Date().toLocaleString('en-PH')}</span>
      </div>
    </div>`;

    // Draw bar chart after DOM settles
    requestAnimationFrame(() => {
      const barCtx = document.getElementById('rpt-bar-canvas');
      if (!barCtx || !window.Chart) return;
      if (window._rptBarChart) { window._rptBarChart.destroy(); }
      window._rptBarChart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: dates.map(fmtDateShort),
          datasets: [{
            label: 'Revenue (₱)',
            data: dates.map(d => revByDate[d] || 0),
            backgroundColor: 'rgba(22,163,74,.18)',
            borderColor: '#16a34a',
            borderWidth: 1.5,
            borderRadius: 5,
            hoverBackgroundColor: 'rgba(22,163,74,.32)',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#052e16',
              titleColor: '#86efac',
              bodyColor: '#fff',
              padding: 10,
              cornerRadius: 8,
              callbacks: { label: ctx => ' ' + formatPeso(ctx.parsed.y) }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 11 } } },
            y: {
              grid: { color: '#f0fdf4' },
              ticks: { color: '#9ca3af', font: { size: 11 }, callback: v => '₱' + (v >= 1000 ? (v/1000).toFixed(1)+'k' : v) },
              beginAtZero: true
            }
          }
        }
      });
    });
  }

  // ── Page shell ──────────────────────────────────────────────────────────────
  el.innerHTML = `
  <style>
    .rpt-page-head {
      background: linear-gradient(135deg, var(--g950) 0%, var(--g900) 55%, var(--g800) 100%);
      border-radius: var(--radius-xl); padding: 24px 26px; margin-bottom: 20px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
      position: relative; overflow: hidden;
    }
    .rpt-page-head::before { content:''; position:absolute; top:-50px; right:-50px; width:180px; height:180px; background:radial-gradient(circle,rgba(74,222,128,.15) 0%,transparent 70%); pointer-events:none; }
    .rpt-head-eyebrow { font-size:.63rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--g400); margin-bottom:4px; }
    .rpt-head-title   { font-family:'Playfair Display',serif; font-size:1.4rem; font-weight:800; color:var(--white); line-height:1.2; }
    .rpt-head-sub     { font-size:.74rem; color:rgba(255,255,255,.5); margin-top:4px; }
    .rpt-picker-card  { background:var(--white); border:1px solid var(--g100); border-radius:var(--radius-lg); padding:18px 22px; margin-bottom:20px; display:flex; align-items:flex-end; gap:14px; flex-wrap:wrap; }
    .rpt-picker-group { display:flex; flex-direction:column; gap:5px; }
    .rpt-picker-label { font-size:.7rem; font-weight:700; color:var(--g800); letter-spacing:.05em; text-transform:uppercase; }
    .rpt-period-tabs  { display:flex; gap:5px; flex-wrap:wrap; }
    .rpt-ptab { padding:7px 14px; border-radius:var(--radius-md); border:1.5px solid var(--g200); font-family:'DM Sans',sans-serif; font-size:.78rem; font-weight:600; cursor:pointer; color:var(--gray-600); background:var(--white); transition:all var(--tr-fast); }
    .rpt-ptab:hover  { border-color:var(--g400); color:var(--g700); background:var(--g50); }
    .rpt-ptab.active { border-color:var(--g600); background:var(--g700); color:var(--white); }
    .rpt-custom-wrap { display:none; align-items:flex-end; gap:10px; flex-wrap:wrap; }
    .rpt-custom-wrap.show { display:flex; }
    .rpt-custom-wrap .form-control { width:148px; }
    .rpt-gen-btn { padding:8px 20px; border-radius:var(--radius-md); border:none; background:linear-gradient(135deg,var(--g700),var(--g600)); color:white; font-family:'DM Sans',sans-serif; font-size:.82rem; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(21,128,61,.28); transition:all var(--tr-fast); white-space:nowrap; }
    .rpt-gen-btn:hover { background:linear-gradient(135deg,var(--g800),var(--g700)); transform:translateY(-1px); }
    .rpt-export-btn { padding:8px 16px; border-radius:var(--radius-md); border:1.5px solid var(--g200); background:var(--white); color:var(--g700); font-family:'DM Sans',sans-serif; font-size:.82rem; font-weight:600; cursor:pointer; transition:all var(--tr-fast); white-space:nowrap; }
    .rpt-export-btn:hover { background:var(--g50); border-color:var(--g400); }
    @media (max-width:600px) { .rpt-picker-card { flex-direction:column; align-items:flex-start; } .rpt-gen-btn,.rpt-export-btn { width:100%; } }
  </style>

  <!-- PAGE HEADER -->
  <div class="rpt-page-head animate-in">
    <div>
      <div class="rpt-head-eyebrow">📖 The History Book</div>
      <div class="rpt-head-title">Sales Reports</div>
      <div class="rpt-head-sub">For the Owner &amp; Accountant — past-period analysis, tax data, and trend review</div>
    </div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;">
      <button class="rpt-export-btn" onclick="exportReportCSV()">⬇ Export CSV</button>
      <button class="rpt-export-btn" onclick="window.print()">🖨️ Print</button>
    </div>
  </div>

  <!-- PERIOD PICKER -->
  <div class="rpt-picker-card animate-in delay-1">
    <div class="rpt-picker-group">
      <div class="rpt-picker-label">Select Period</div>
      <div class="rpt-period-tabs">
        <button class="rpt-ptab active" id="ptab-yesterday" onclick="selectPeriod('yesterday')">Yesterday</button>
        <button class="rpt-ptab"        id="ptab-lastmonth" onclick="selectPeriod('lastmonth')">Last Month</button>
        <button class="rpt-ptab"        id="ptab-alltime"   onclick="selectPeriod('alltime')">All-Time</button>
        <button class="rpt-ptab"        id="ptab-custom"    onclick="selectPeriod('custom')">Custom Range</button>
      </div>
    </div>
    <div class="rpt-custom-wrap" id="rpt-custom-wrap">
      <div class="rpt-picker-group">
        <div class="rpt-picker-label">From</div>
        <input type="date" id="rpt-from" class="form-control" value="${allDates[0] || TODAY}" />
      </div>
      <div class="rpt-picker-group">
        <div class="rpt-picker-label">To</div>
        <input type="date" id="rpt-to" class="form-control" value="${allDates[allDates.length-1] || TODAY}" />
      </div>
    </div>
    <button class="rpt-gen-btn" onclick="generateReport()">Generate Report →</button>
  </div>

  <!-- REPORT OUTPUT -->
  <div id="rpt-report-out" style="display:none;"></div>`;

  // ── Interactivity ───────────────────────────────────────────────────────────
  window.selectPeriod = (p) => {
    activePeriod = p;
    document.querySelectorAll('.rpt-ptab').forEach(b => b.classList.remove('active'));
    document.getElementById('ptab-' + p)?.classList.add('active');
    const wrap = document.getElementById('rpt-custom-wrap');
    if (wrap) wrap.classList.toggle('show', p === 'custom');
  };

  window.generateReport = () => {
    const from = document.getElementById('rpt-from')?.value;
    const to   = document.getElementById('rpt-to')?.value;
    if (activePeriod === 'custom' && (!from || !to)) {
      showToast('Please select both From and To dates.', 'error'); return;
    }
    const doRender = () => renderReport(activePeriod, from, to);
    if (window.Chart) { doRender(); } else {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
      s.onload = doRender;
      document.head.appendChild(s);
    }
    showToast('Report generated!');
    setTimeout(() => document.getElementById('rpt-report-out')?.scrollIntoView({ behavior: 'smooth' }), 80);
  };

  window.exportReportCSV = () => {
    const from = document.getElementById('rpt-from')?.value;
    const to   = document.getElementById('rpt-to')?.value;
    const txns = txnsFor(activePeriod, from, to);
    if (!txns.length) { showToast('No data to export for this period.', 'warning'); return; }
    const rows = [['TXN ID','Cashier','Date','Time','Items','Total (PHP)']];
    txns.forEach(t => rows.push([t.id, t.cashier, t.date, t.time, t.items.length, t.total.toFixed(2)]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'rito-tata-report-' + activePeriod + '-' + Date.now() + '.csv';
    a.click();
    showToast('CSV exported!');
  };

  // Auto-generate default period on load
  const doAutoRender = () => renderReport('yesterday', null, null);
  if (window.Chart) { doAutoRender(); } else {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    s.onload = doAutoRender;
    document.head.appendChild(s);
  }
}
