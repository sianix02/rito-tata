/**
 * admin/script/main.js
 * All admin dashboard page logic.
 * Uses api.js (loaded before this file) instead of shared-store.js.
 */

'use strict';

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
let CURRENT_USER = null;

(async function init() {
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

  // ── SSE state: track previous values to detect real changes ─────
  window._sseState = {
    todayTxnCount:  null,
    lowCount:       null,
    criticalCount:  null,
    pendingCount:   null,
  };

  // Helper: get which page is currently active
  function activePage() {
    return document.querySelector('.nav-item.active')?.dataset.page || '';
  }

  // Helper: refresh the current page (re-runs its load function)
  function refreshPage(delay = 600) {
    const page = activePage();
    if (page) setTimeout(() => navigate(page), delay);
  }

  // ── Start SSE stream ──────────────────────────────────────────
  window._adminSSE = SSE.adminFeed({

    // ── stats: today's revenue + transaction count ───────────────
    stats(data) {
      const prev = window._sseState;
      const page = activePage();

      // Always update KPI cards if they exist (dashboard)
      const revenueEl = document.getElementById('kpi-revenue');
      const txnEl     = document.getElementById('kpi-txn-count');
      if (revenueEl) revenueEl.textContent = formatPeso(data.today_revenue);
      if (txnEl)     txnEl.textContent     = data.today_transactions;

      // Detect new transaction
      const newTxn = prev.todayTxnCount !== null &&
                     data.today_transactions > prev.todayTxnCount;

      if (newTxn) {
        showToast('🛒 New sale recorded!', 'success');

        // Pages that need refreshing when a new sale happens
        const salesPages = ['dashboard', 'sales', 'products', 'reports'];
        if (salesPages.includes(page)) refreshPage(700);

        // Also update the sales stat cards if on sales page
        const todayRevEl = document.querySelector('.stat-card.c-green .stat-value');
        if (todayRevEl && page === 'sales') todayRevEl.textContent = formatPeso(data.today_revenue);
      }

      prev.todayTxnCount = data.today_transactions;
    },

    // ── stock: low/critical stock items ─────────────────────────
    stock(data) {
      const prev = window._sseState;
      const page = activePage();

      // Always update sidebar badge + bell dot
      const lb = document.getElementById('low-badge');
      const nd = document.getElementById('notif-dot');
      if (lb) { lb.textContent = data.low_count; lb.style.display = data.low_count ? '' : 'none'; }
      if (nd) nd.style.display = data.critical_count ? '' : 'none';

      // Detect stock level change
      const stockChanged = prev.lowCount !== null && (
        data.low_count      !== prev.lowCount ||
        data.critical_count !== prev.criticalCount
      );

      if (stockChanged) {
        // Alert for new critical items
        if (data.critical_count > (prev.criticalCount || 0)) {
          showToast('🔴 Critical stock alert! Item needs restocking.', 'error');
        } else if (data.low_count > (prev.lowCount || 0)) {
          showToast('⚠ A product is running low on stock.', 'warning');
        }

        // Refresh pages that show stock data
        const stockPages = ['dashboard', 'products'];
        if (stockPages.includes(page)) refreshPage(500);
      }

      prev.lowCount      = data.low_count;
      prev.criticalCount = data.critical_count;
    },

    // ── pending: registration count ──────────────────────────────
    pending(data) {
      const prev = window._sseState;
      const page = activePage();

      // Always update sidebar badge
      const pb = document.getElementById('pending-badge');
      if (pb) { pb.textContent = data.count; pb.style.display = data.count ? '' : 'none'; }

      // New registration came in
      if (prev.pendingCount !== null && data.count > prev.pendingCount) {
        showToast('⏳ New registration request received!', 'warning');
        if (page === 'pending') refreshPage(500);
      }

      prev.pendingCount = data.count;
    },

    // ── product_qty: ALL products changed (any qty change) ──────
    // Fires only when a product qty actually changes
    product_qty(products) {
      const page = activePage();

      // ① If on Product Management — update stock column live using data-product-id
      if (page === 'products') {
        products.forEach(p => {
          // Each <tr> has data-product-id set in renderTable()
          const row = document.querySelector(`#prod-table tbody tr[data-product-id="${p.id}"]`);
          if (!row) return;

          const stockCell  = row.querySelector('td:nth-child(4)');  // Stock qty
          const statusCell = row.querySelector('td:nth-child(6)');  // Status badge

          if (stockCell)  stockCell.textContent = p.qty;
          if (statusCell) statusCell.innerHTML  = p.is_low
            ? `<span class="badge badge-danger">⚠ Low</span>`
            : `<span class="badge badge-success">✓ OK</span>`;
        });

        // Update the product count text
        const countEl = document.getElementById('prod-count');
        if (countEl) countEl.textContent = `${products.length} products`;
      }

    },

    // ── transactions: updates dashboard feed + sales table live ──
    transactions(data) {
      const page = activePage();
      const txns = data.transactions || [];

      // ① Update recent transactions table on dashboard (bottom row)
      const dashTbody = document.querySelector('.db-bottom-row table tbody');
      if (dashTbody && txns.length) {
        dashTbody.innerHTML = txns.map(t => `
          <tr>
            <td class="font-mono text-green fw-600">${t.txn_code}</td>
            <td>${t.cashier_name}</td>
            <td class="fw-600">${formatPeso(t.total)}</td>
            <td class="text-muted text-sm">${t.txn_time}</td>
          </tr>`).join('');
      }

      // ② Update activity feed on dashboard
      const feedEl = document.querySelector('.db-chart-card .card-body[style*="padding:4px"]');
      if (feedEl && txns.length && page === 'dashboard') {
        const feedHtml = txns.slice(0, 4).map(t => `
          <div class="db-feed-item">
            <div class="db-feed-dot sale"></div>
            <div class="db-feed-text">Sale ${t.txn_code} — ${formatPeso(t.total)} by ${t.cashier_name}</div>
            <div class="db-feed-time">${t.txn_time}</div>
          </div>`).join('');
        feedEl.innerHTML = feedHtml;
      }

      // ③ Update sales monitoring transaction count badge
      const txnCountEl = document.querySelector('.stat-card.c-teal .stat-value');
      if (txnCountEl && page === 'sales') {
        txnCountEl.textContent = txns.length;
      }
    },

  });

  navigate('dashboard');
})();

function updateClock() {
  const el = document.getElementById('live-time');
  if (el) el.textContent = nowTime();
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

function openModal(id)  { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function doLogout() {
  if (window._adminSSE) window._adminSSE.close();
  Auth.logout().finally(() => {
    sessionStorage.removeItem('currentUser');
    window.location.href = '../index.html';
  });
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const titles = {
    dashboard: 'Dashboard', users: 'User Accounts', pending: 'Pending Registrations',
    products: 'Product Management',
    sales: 'Sales Monitoring', reports: 'Reports'
  };
  $('page-title').textContent = titles[page] || page;
  const content = $('page-content');
  content.innerHTML = '';
  content.className = 'page-content animate-in';

  const pages = {
    dashboard, users: userManagement, pending: pendingRegistrations,
    products: productManagement, sales: salesMonitoring, reports
  };
  if (pages[page]) pages[page](content);
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function dashboard(el) {
  el.innerHTML = '<div class="empty-state"><p>Loading dashboard…</p></div>';

  const res = await AdminDashboard.get();
  if (!res.success) {
    el.innerHTML = `<div class="empty-state"><p class="text-danger">⚠ ${res.message}</p></div>`;
    return;
  }

  const d          = res.data;
  const todayRev   = d.today_revenue;
  const todayCount = d.today_transactions;
  const pending    = d.pending_count;

  const yestRev  = d.yesterday_revenue;
  const revDelta = yestRev ? ((todayRev - yestRev) / yestRev * 100).toFixed(1) : null;

  const barLabels  = d.sales_by_category.map(c => c.category || 'Other');
  const barData    = d.sales_by_category.map(c => +parseFloat(c.revenue).toFixed(2));
  const BAR_COLORS = ['#16a34a','#22c55e','#0d9488','#ca8a04','#0369a1','#e11d48','#7c3aed','#db2777'];

  el.innerHTML = `

  <!-- ══ KPI STRIP ════════════════════════════════════════════════════════════ -->
  <div class="db-kpi-row">

    <div class="db-kpi animate-in">
      <div class="db-kpi-accent" style="background:var(--g500);"></div>
      <div class="db-kpi-icon">💰</div>
      <div class="db-kpi-val" id="kpi-revenue">${formatPeso(todayRev)}</div>
      <div class="db-kpi-label">Today's Revenue</div>
      <div class="db-kpi-delta ${revDelta === null ? 'neu' : +revDelta >= 0 ? 'up' : 'down'}">
        ${revDelta === null ? '— No prior day' : (+revDelta >= 0 ? '↑' : '↓') + ' ' + Math.abs(revDelta) + '% vs yesterday'}
      </div>
    </div>

    <div class="db-kpi animate-in delay-1">
      <div class="db-kpi-accent" style="background:var(--gold);"></div>
      <div class="db-kpi-icon">🛒</div>
      <div class="db-kpi-val" id="kpi-txn-count">${todayCount}</div>
      <div class="db-kpi-label">Today's Transactions</div>
      <div class="db-kpi-delta ${todayCount > 0 ? 'up' : 'neu'}">
        ${todayCount > 0 ? '↑ Active today' : '— None yet'}
      </div>
    </div>

    <div class="db-kpi animate-in delay-2">
      <div class="db-kpi-accent" style="background:var(--g500);"></div>
      <div class="db-kpi-icon">📦</div>
      <div class="db-kpi-val">${d.total_products}</div>
      <div class="db-kpi-label">Total Products</div>
      <div class="db-kpi-delta up">✓ In catalogue</div>
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
    <div class="db-chart-card animate-in delay-1">
      <div class="db-chart-head">
        <div>
          <div class="db-chart-title">Sales Summary</div>
          <div class="db-chart-sub">Revenue distribution by category · all-time</div>
        </div>
        <span style="font-size:.68rem;color:var(--gray-400);">${barLabels.length} categories</span>
      </div>
      <div class="db-chart-body tall" style="display:flex;align-items:center;justify-content:center;"><canvas id="db-pie-chart"></canvas></div>
    </div>
    <div class="db-chart-card animate-in delay-2">
      <div class="db-chart-head">
        <div>
          <div class="db-chart-title">Sales by Category</div>
          <div class="db-chart-sub">All-time revenue breakdown</div>
        </div>
        <span style="font-size:.68rem;color:var(--gray-400);">${barLabels.length} categories</span>
      </div>
      <div class="db-chart-body short"><canvas id="db-bar-chart"></canvas></div>
    </div>
  </div>


  <!-- ══ BOTTOM ROW ════════════════════════════════════════════════════════════ -->
  <div class="db-bottom-row">
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
          <thead><tr><th>TXN ID</th><th>Cashier</th><th>Total</th><th>Time</th></tr></thead>
          <tbody>
            ${d.recent_transactions.map(t=>`
              <tr>
                <td class="font-mono text-green fw-600">${t.txn_code}</td>
                <td>${t.cashier_name}</td>
                <td class="fw-600">${formatPeso(t.total)}</td>
                <td class="text-muted text-sm">${t.txn_time}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="db-chart-card animate-in delay-3">
      <div class="db-chart-head">
        <div>
          <div class="db-chart-title">Activity Feed</div>
          <div class="db-chart-sub">Store floor events today</div>
        </div>
        <div class="db-live-badge"><div class="db-live-dot"></div> LIVE</div>
      </div>
      <div class="card-body" style="padding:4px 16px 12px;">
        ${d.activity_feed.length === 0
          ? '<div class="empty-state" style="padding:18px 0;"><p>No activity yet today.</p></div>'
          : d.activity_feed.map(ev=>`
            <div class="db-feed-item">
              <div class="db-feed-dot ${ev.type}"></div>
              <div class="db-feed-text">${ev.text}</div>
              <div class="db-feed-time">${ev.time}</div>
            </div>`).join('')}
      </div>
    </div>
  </div>`;

  // ── Draw Charts ───────────────────────────────────────────────────────────
  function drawDashboardCharts() {
    const pieCtx = document.getElementById('db-pie-chart');
    if (pieCtx) {
      if (window._dbPieChart) window._dbPieChart.destroy();
      window._dbPieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
          labels: barLabels,
          datasets: [{
            data: barData,
            backgroundColor: BAR_COLORS.slice(0, barLabels.length).map(c => c + 'cc'),
            borderColor: BAR_COLORS.slice(0, barLabels.length),
            borderWidth: 2,
            hoverOffset: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: {
            legend: {
              display: true,
              position: 'right',
              labels: { color: '#6b7280', font: { size: 11 }, padding: 12, boxWidth: 12, usePointStyle: true }
            },
            tooltip: {
              backgroundColor: '#052e16', titleColor: '#86efac', bodyColor: '#fff',
              padding: 10, cornerRadius: 8,
              callbacks: {
                label: ctx => {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
                  const pct = Math.round(ctx.parsed / total * 100);
                  return ` ${formatPeso(ctx.parsed)}  (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }
    const barCtx = document.getElementById('db-bar-chart');
    if (barCtx) {
      if (window._dbBarChart) window._dbBarChart.destroy();
      window._dbBarChart = new Chart(barCtx, {
        type:'bar',
        data:{
          labels:barLabels,
          datasets:[{ label:'Revenue (₱)', data:barData,
            backgroundColor:BAR_COLORS.slice(0,barLabels.length).map(c=>c+'cc'),
            borderColor:BAR_COLORS.slice(0,barLabels.length),
            borderWidth:1.5, borderRadius:5, hoverBackgroundColor:BAR_COLORS.slice(0,barLabels.length) }]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false},
            tooltip:{ backgroundColor:'#052e16',titleColor:'#86efac',bodyColor:'#fff',
              padding:10,cornerRadius:8, callbacks:{label:ctx=>' '+formatPeso(ctx.parsed.y)} } },
          scales:{
            x:{ grid:{display:false}, ticks:{color:'#9ca3af',font:{size:10},maxRotation:30} },
            y:{ grid:{color:'#f0fdf4'},
              ticks:{color:'#9ca3af',font:{size:10},callback:v=>v>=1000?'₱'+(v/1000).toFixed(1)+'k':'₱'+v},
              beginAtZero:true }
          }
        }
      });
    }
  }

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
async function userManagement(el) {
  el.innerHTML = '<div class="empty-state"><p>Loading users…</p></div>';
  const res = await AdminUsers.listCashiers();
  if (!res.success) { el.innerHTML = `<p class="text-danger">${res.message}</p>`; return; }

  let users = res.data || [];

  const renderTable = () => `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Name</th><th>Username</th><th>Contact</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map(u=>`
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
            <td>${u.status==='active'
              ? `<span class="badge badge-success">✓ Active</span>`
              : `<span class="badge badge-danger">✕ Inactive</span>`}</td>
            <td class="text-sm text-muted">${u.created_at}</td>
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

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">User Account Management</div><div class="section-desc">Manage cashier/staff accounts</div></div>
  </div>
  <div class="card animate-in">
    <div class="card-header"><div class="card-title">All Staff Accounts</div><span class="badge badge-green">${users.length} Cashiers</span></div>
    <div id="user-table">${renderTable()}</div>
  </div>

  <div class="modal-overlay" id="edit-user-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Edit Staff Info</div>
        <button class="modal-close" onclick="closeModal('edit-user-modal')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="edit-user-id" />
        <div class="form-group"><label class="form-label">First Name *</label><input id="eu-firstname" class="form-control" placeholder="First name" /></div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">Middle Initial</label><input id="eu-mi" class="form-control" placeholder="e.g. A" maxlength="2" /></div>
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">Last Name *</label><input id="eu-lastname" class="form-control" placeholder="Last name" /></div>
        </div>
        <div class="form-group mt-16"><label class="form-label">Contact Number</label><input id="eu-contact" class="form-control" placeholder="09XX-XXX-XXXX" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('edit-user-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveEditUser()">Save Changes</button>
      </div>
    </div>
  </div>`;

  window.openEditUserModal = (id) => {
    const u = users.find(x => x.id === id);
    if (!u) return;
    $('edit-user-id').value = id;
    $('eu-firstname').value = u.firstname;
    $('eu-mi').value        = u.mi || '';
    $('eu-lastname').value  = u.lastname;
    $('eu-contact').value   = u.contact || '';
    openModal('edit-user-modal');
  };

  window.saveEditUser = async () => {
    const id        = parseInt($('edit-user-id').value);
    const firstname = $('eu-firstname').value.trim();
    const mi        = $('eu-mi').value.trim().toUpperCase();
    const lastname  = $('eu-lastname').value.trim();
    const contact   = $('eu-contact').value.trim();
    if (!firstname || !lastname) { showToast('First name and last name are required.','error'); return; }

    const res = await AdminUsers.edit(id, { firstname, mi, lastname, contact });
    if (!res.success) { showToast(res.message,'error'); return; }

    const idx = users.findIndex(u => u.id === id);
    if (idx !== -1) users[idx] = { ...users[idx], firstname, mi, lastname, contact };
    showToast('Staff info updated successfully!');
    closeModal('edit-user-modal');
    $('user-table').innerHTML = renderTable();
  };

  window.toggleStatus = async (id) => {
    const res = await AdminUsers.toggle(id);
    if (!res.success) { showToast(res.message,'error'); return; }
    const u = users.find(x => x.id === id);
    if (u) u.status = res.data.status;
    showToast(`Account ${res.data.status}.`, res.data.status === 'active' ? 'success' : 'warning');
    $('user-table').innerHTML = renderTable();
  };
}

// ── PENDING REGISTRATIONS ─────────────────────────────────────────────────────
async function pendingRegistrations(el) {
  el.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
  const res = await AdminUsers.listPending();
  let list  = res.data || [];

  const renderList = () => {
    if (list.length === 0)
      return `<div class="empty-state"><div class="empty-icon">✅</div><p>No pending registrations.</p></div>`;
    return list.map(u=>`
      <div class="pending-user-card animate-in" id="pending-${u.id}">
        <div class="flex items-center gap-12">
          <div class="pending-avatar">${u.firstname[0]}</div>
          <div>
            <div class="pending-info-name">${u.firstname} ${u.mi ? u.mi+'. ' : ''}${u.lastname}</div>
            <div class="pending-info-sub">@${u.username} &nbsp;·&nbsp; ${u.contact} &nbsp;·&nbsp; Registered ${u.created_at}</div>
          </div>
        </div>
        <div class="pending-actions">
          <button class="btn btn-success btn-sm" onclick="acceptUser(${u.id})">✓ Accept</button>
          <button class="btn btn-danger btn-sm" onclick="declineUser(${u.id})">✕ Decline</button>
        </div>
      </div>`).join('');
  };

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Pending Registrations</div><div class="section-desc">Review and approve new account requests</div></div>
    <span class="badge badge-warning" style="padding:6px 14px;">⏳ ${list.length} Pending</span>
  </div>
  <div id="pending-list">${renderList()}</div>`;

  window.acceptUser = async (id) => {
    const res = await AdminUsers.approve(id);
    if (!res.success) { showToast(res.message,'error'); return; }
    list = list.filter(u => u.id !== id);
    showToast(res.message);
    $('pending-list').innerHTML = renderList();
  };

  window.declineUser = async (id) => {
    const u = list.find(x => x.id === id);
    if (!confirm(`Decline registration for ${u?.firstname} ${u?.lastname}?`)) return;
    const res = await AdminUsers.decline(id);
    if (!res.success) { showToast(res.message,'error'); return; }
    list = list.filter(x => x.id !== id);
    showToast(res.message,'warning');
    $('pending-list').innerHTML = renderList();
  };
}

// ── PRODUCT MANAGEMENT ────────────────────────────────────────────────────────
async function productManagement(el) {
  el.innerHTML = '<div class="empty-state"><p>Loading products…</p></div>';
  const res = await Products.adminList();
  let allProducts = res.data || [];

  // ── renderTable now stamps data-product-id on every <tr> ──────────────────
  const renderTable = (list) => `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Product Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Threshold</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${list.map(p=>`
          <tr data-product-id="${p.id}">
            <td class="fw-600">${p.name}</td>
            <td><span class="badge badge-green">${p.category}</span></td>
            <td class="fw-600 font-mono">${formatPeso(p.price)}</td>
            <td class="font-mono">${p.qty}</td>
            <td class="font-mono text-muted">${p.low_stock}</td>
            <td>${p.is_low
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

  const filterProducts = () => {
    const q   = ($('prod-search')?.value || '').toLowerCase();
    const cat = $('cat-filter')?.value || '';
    let list  = allProducts;
    if (cat) list = list.filter(p => p.category === cat);
    if (q)   list = list.filter(p => p.name.toLowerCase().includes(q));
    $('prod-count').textContent = `${list.length} products`;
    $('prod-table').innerHTML = renderTable(list);
  };

  const categories = [...new Set(allProducts.map(p=>p.category))];

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Product Management</div><div class="section-desc">Add, edit, and remove store products</div></div>
    <button class="btn btn-primary" onclick="openAddProduct()">＋ Add Product</button>
  </div>
  <div class="card animate-in">
    <div class="card-header">
      <div class="flex items-center gap-12">
        <div class="search-box"><span class="search-icon">🔍</span><input id="prod-search" class="form-control" placeholder="Search products…" oninput="filterProducts()" /></div>
        <select id="cat-filter" class="form-control" style="width:160px;" onchange="filterProducts()">
          <option value="">All Categories</option>
          ${categories.map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <span class="text-muted text-sm" id="prod-count">${allProducts.length} products</span>
    </div>
    <div id="prod-table">${renderTable(allProducts)}</div>
  </div>

  <!-- Add/Edit Modal -->
  <div class="modal-overlay" id="product-modal">
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title" id="product-modal-title">Add New Product</div>
        <button class="modal-close" onclick="closeModal('product-modal')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="p-edit-id" />
        <div class="form-group"><label class="form-label">Product Name *</label><input id="p-name" class="form-control" placeholder="e.g. Rice (5kg)" /></div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">Category *</label><input id="p-cat" class="form-control" placeholder="e.g. Grains" /></div>
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">Price (₱) *</label><input id="p-price" class="form-control" type="number" min="0" step="0.01" placeholder="0.00" /></div>
        </div>
        <div class="form-row mt-16">
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">Stock Quantity *</label><input id="p-qty" class="form-control" type="number" min="0" placeholder="0" /></div>
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">Low Stock Threshold</label><input id="p-low" class="form-control" type="number" min="1" placeholder="10" /></div>
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
      <div class="modal-header"><div class="modal-title">➕ Add Stock</div><button class="modal-close" onclick="closeModal('stock-modal')">✕</button></div>
      <div class="modal-body">
        <input type="hidden" id="stock-product-id" />
        <div style="background:var(--g50);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;">
          <div class="fw-600" id="stock-product-name">Product Name</div>
          <div class="text-sm text-muted mt-4">Current stock: <span class="fw-600 font-mono" id="stock-current-qty">0</span> units</div>
        </div>
        <div class="form-group"><label class="form-label">Quantity to Add *</label><input id="stock-add-qty" class="form-control" type="number" min="1" placeholder="Enter quantity to add" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('stock-modal')">Cancel</button>
        <button class="btn btn-success" onclick="confirmAddStock()">✓ Add Stock</button>
      </div>
    </div>
  </div>`;

  window.filterProducts = filterProducts;

  window.openAddProduct = () => {
    ['p-name','p-cat','p-price','p-qty','p-low'].forEach(id => { if($(id)) $(id).value=''; });
    $('p-edit-id').value = '';
    $('product-modal-title').textContent = 'Add New Product';
    openModal('product-modal');
  };

  window.openEditProduct = (id) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    $('p-edit-id').value = id; $('p-name').value = p.name; $('p-cat').value = p.category;
    $('p-price').value = p.price; $('p-qty').value = p.qty; $('p-low').value = p.low_stock;
    $('product-modal-title').textContent = 'Edit Product';
    openModal('product-modal');
  };

  window.saveProduct = async () => {
    const name  = $('p-name').value.trim();
    const cat   = $('p-cat').value.trim();
    const price = parseFloat($('p-price').value);
    const qty   = parseInt($('p-qty').value);
    const low   = parseInt($('p-low').value) || 10;
    if (!name || !cat || isNaN(price) || isNaN(qty)) { showToast('Please fill all required fields.','error'); return; }

    const editId = parseInt($('p-edit-id').value);
    const res = editId
      ? await Products.edit(editId, {name, category:cat, price, qty, low_stock:low})
      : await Products.add({name, category:cat, price, qty, low_stock:low});

    if (!res.success) { showToast(res.message,'error'); return; }
    showToast(res.message);
    closeModal('product-modal');
    const fresh = await Products.adminList();
    allProducts = fresh.data || [];
    filterProducts();
  };

  window.deleteProduct = async (id) => {
    if (!confirm('Delete this product from inventory?')) return;
    const res = await Products.delete(id);
    if (!res.success) { showToast(res.message,'error'); return; }
    allProducts = allProducts.filter(p => p.id !== id);
    showToast(res.message,'warning');
    filterProducts();
  };

  window.openAddStockModal = (id) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    $('stock-product-id').value = id;
    $('stock-product-name').textContent = p.name;
    $('stock-current-qty').textContent  = p.qty;
    $('stock-add-qty').value = '';
    openModal('stock-modal');
  };

  window.confirmAddStock = async () => {
    const id  = parseInt($('stock-product-id').value);
    const qty = parseInt($('stock-add-qty').value);
    if (!qty || qty < 1) { showToast('Please enter a valid quantity.','error'); return; }
    const res = await Products.restock(id, qty);
    if (!res.success) { showToast(res.message,'error'); return; }
    showToast(res.message);
    closeModal('stock-modal');
    const fresh = await Products.adminList();
    allProducts = fresh.data || [];
    filterProducts();
  };
}

// ── SALES MONITORING ──────────────────────────────────────────────────────────
async function salesMonitoring(el) {
  el.innerHTML = '<div class="empty-state"><p>Loading sales…</p></div>';
  const res = await AdminSales.list();
  let txns  = res.data || [];

  const total    = txns.reduce((s,t)=>s+parseFloat(t.total),0);
  const today    = new Date().toISOString().slice(0,10);
  const todayRev = txns.filter(t=>t.txn_date===today).reduce((s,t)=>s+parseFloat(t.total),0);

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Sales Monitoring</div><div class="section-desc">All recorded transactions</div></div>
    <div class="search-box"><span class="search-icon">🔍</span><input id="txn-search" class="form-control" placeholder="Search by cashier or ID…" oninput="filterTxns()" /></div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">
    <div class="stat-card c-green animate-in"><div class="stat-icon c-green">💰</div><div class="stat-value">${formatPeso(todayRev)}</div><div class="stat-label">Today's Revenue</div></div>
    <div class="stat-card c-teal animate-in delay-1"><div class="stat-icon c-teal">💳</div><div class="stat-value">${txns.length}</div><div class="stat-label">Total Transactions</div></div>
    <div class="stat-card c-gold animate-in delay-2"><div class="stat-icon c-gold">📊</div><div class="stat-value">${formatPeso(txns.length?total/txns.length:0)}</div><div class="stat-label">Average Sale</div></div>
  </div>

  <div class="card animate-in delay-2">
    <div class="card-header"><div class="card-title">Transaction History</div></div>
    <div class="table-wrap" id="txn-table">${renderTxnTable(txns)}</div>
  </div>

  <div class="modal-overlay" id="txn-modal">
    <div class="modal">
      <div class="modal-header"><div class="modal-title">Transaction Details</div><button class="modal-close" onclick="closeModal('txn-modal')">✕</button></div>
      <div class="modal-body" id="txn-modal-body"></div>
    </div>
  </div>`;

  window.filterTxns = async () => {
    const q   = ($('txn-search')?.value || '');
    const res = await AdminSales.list(q);
    $('txn-table').innerHTML = renderTxnTable(res.data || []);
  };

  window.viewTxn = async (id) => {
    const res = await AdminSales.detail(id);
    if (!res.success) return;
    const t = res.data;
    $('txn-modal-body').innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <div class="receipt-title">RITO&TATA Grocery Store</div>
        <div class="text-muted text-xs" style="margin-top:4px;">${t.txn_date} &nbsp;·&nbsp; ${t.txn_time}</div>
        <div class="text-xs" style="margin-top:4px;color:var(--gray-600);">Cashier: ${t.cashier_name} &nbsp;·&nbsp; ${t.txn_code}</div>
      </div>
      ${t.items.map(i=>`<div class="receipt-row"><span>${i.product_name} × ${i.qty}</span><span>${formatPeso(i.subtotal)}</span></div>`).join('')}
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
      ${txns.map(t=>`
        <tr>
          <td class="font-mono text-green fw-600">${t.txn_code}</td>
          <td>${t.cashier_name}</td>
          <td class="text-muted text-sm">—</td>
          <td class="fw-600">${formatPeso(t.total)}</td>
          <td class="text-sm">${t.txn_date}</td>
          <td class="text-sm text-muted">${t.txn_time}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewTxn(${t.id})">View</button></td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// ── REPORTS ───────────────────────────────────────────────────────────────────
function reports(el) {
  let activePeriod = 'yesterday';

  el.innerHTML = `
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

  <div class="rpt-picker-card animate-in delay-1">
    <div class="rpt-picker-group">
      <div class="rpt-picker-label">Select Period</div>
      <div class="rpt-period-tabs">
        <button class="rpt-ptab active" id="ptab-yesterday" onclick="selectPeriod('yesterday')">Yesterday</button>
        <button class="rpt-ptab" id="ptab-lastmonth" onclick="selectPeriod('lastmonth')">Last Month</button>
        <button class="rpt-ptab" id="ptab-alltime"   onclick="selectPeriod('alltime')">All-Time</button>
        <button class="rpt-ptab" id="ptab-custom"    onclick="selectPeriod('custom')">Custom Range</button>
      </div>
    </div>
    <div class="rpt-custom-wrap" id="rpt-custom-wrap">
      <div class="rpt-picker-group"><div class="rpt-picker-label">From</div><input type="date" id="rpt-from" class="form-control" /></div>
      <div class="rpt-picker-group"><div class="rpt-picker-label">To</div><input type="date" id="rpt-to" class="form-control" /></div>
    </div>
    <button class="rpt-gen-btn" onclick="generateReport()">Generate Report →</button>
  </div>

  <div id="rpt-report-out" style="display:none;"></div>`;

  window.selectPeriod = (p) => {
    activePeriod = p;
    document.querySelectorAll('.rpt-ptab').forEach(b => b.classList.remove('active'));
    document.getElementById('ptab-' + p)?.classList.add('active');
    document.getElementById('rpt-custom-wrap')?.classList.toggle('show', p === 'custom');
  };

  window.generateReport = async () => {
    const from = $('rpt-from')?.value || '';
    const to   = $('rpt-to')?.value   || '';
    if (activePeriod === 'custom' && (!from || !to)) {
      showToast('Please select both From and To dates.','error'); return;
    }

    const res = await AdminSales.report(activePeriod, from, to);
    if (!res.success) { showToast(res.message,'error'); return; }

    const d = res.data;
    const { summary, daily, by_category, top_products, by_cashier, period } = d;
    const PALETTE = ['#16a34a','#22c55e','#4ade80','#0d9488','#ca8a04','#0369a1','#e11d48','#7c3aed'];
    const catTotal = by_category.reduce((s,c)=>s+parseFloat(c.revenue),0) || 1;

    const out = $('rpt-report-out');
    out.style.display = '';
    out.innerHTML = `
    <div class="card animate-in">
      <div class="rpt-section-head">
        <div><div class="rpt-section-title">📋 Summary — ${period.from === period.to ? period.from : period.from + ' to ' + period.to}</div>
        <div class="rpt-section-sub">${summary.total_transactions} transactions</div></div>
      </div>
      <div class="rpt-sum-grid">
        <div class="rpt-sum-cell"><div class="rpt-sum-label">Total Revenue</div><div class="rpt-sum-val">${formatPeso(summary.total_revenue)}</div><div class="rpt-sum-note">Gross sales collected</div></div>
        <div class="rpt-sum-cell"><div class="rpt-sum-label">Transactions</div><div class="rpt-sum-val">${summary.total_transactions}</div><div class="rpt-sum-note">Completed sales</div></div>
        <div class="rpt-sum-cell"><div class="rpt-sum-label">Avg. per Sale</div><div class="rpt-sum-val">${formatPeso(summary.avg_per_sale)}</div><div class="rpt-sum-note">Average basket size</div></div>
        <div class="rpt-sum-cell"><div class="rpt-sum-label">Items Sold</div><div class="rpt-sum-val">${summary.total_items}</div><div class="rpt-sum-note">Total units moved</div></div>
      </div>

      ${daily.length > 1 ? `
      <div class="rpt-section-head" style="padding-top:16px;"><div><div class="rpt-section-title">📅 Daily Revenue Breakdown</div></div></div>
      <div class="rpt-bar-wrap"><canvas id="rpt-bar-canvas"></canvas></div>` : ''}

      <div class="rpt-section-head" style="padding-top:16px;"><div><div class="rpt-section-title">🏷 Revenue by Category</div></div></div>
      <div class="rpt-cat-grid">
        ${by_category.map((c,i)=>`
        <div class="rpt-cat-pill">
          <div class="rpt-cat-dot" style="background:${PALETTE[i%PALETTE.length]}"></div>
          <div><div class="rpt-cat-name">${c.category||'Other'}</div><div class="rpt-cat-pct">${Math.round(parseFloat(c.revenue)/catTotal*100)}% of revenue</div></div>
          <div class="rpt-cat-amt">${formatPeso(c.revenue)}</div>
        </div>`).join('')}
      </div>

      <div class="rpt-section-head" style="padding-top:16px;"><div><div class="rpt-section-title">📦 Product Sales Detail</div></div></div>
      <div class="table-wrap">
        <table class="rpt-prod-table">
          <thead><tr><th>#</th><th>Product Name</th><th>Units Sold</th><th>Revenue</th><th>% of Total</th></tr></thead>
          <tbody>
            ${top_products.map((p,i)=>{
              const pct = summary.total_revenue ? Math.round(parseFloat(p.revenue)/parseFloat(summary.total_revenue)*100) : 0;
              return `<tr>
                <td class="text-muted text-xs font-mono">${i+1}</td>
                <td class="fw-600">${p.product_name}</td>
                <td class="font-mono fw-600">${p.units_sold}</td>
                <td class="font-mono fw-600 text-green">${formatPeso(p.revenue)}</td>
                <td><div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:5px;background:var(--g100);border-radius:99px;overflow:hidden;min-width:48px;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--g600),var(--g400));border-radius:99px;"></div>
                  </div>
                  <span class="text-xs text-muted">${pct}%</span>
                </div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="rpt-section-head" style="padding-top:16px;"><div><div class="rpt-section-title">👤 Cashier Performance</div></div></div>
      <div class="table-wrap">
        <table class="rpt-prod-table">
          <thead><tr><th>#</th><th>Cashier</th><th>Transactions</th><th>Total Revenue</th><th>Avg. per Sale</th></tr></thead>
          <tbody>
            ${by_cashier.map((c,i)=>`<tr>
              <td class="text-muted text-xs font-mono">${i+1}</td>
              <td class="fw-600">${c.cashier_name}</td>
              <td class="font-mono">${c.transactions}</td>
              <td class="font-mono fw-600 text-green">${formatPeso(c.revenue)}</td>
              <td class="font-mono text-muted">${formatPeso(c.transactions?parseFloat(c.revenue)/c.transactions:0)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="rpt-print-footer">
        <span>RITO&amp;TATA Grocery Store &nbsp;·&nbsp; Admin Report &nbsp;·&nbsp; ${period.from} to ${period.to}</span>
        <span>Generated: ${new Date().toLocaleString('en-PH')}</span>
      </div>
    </div>`;

    requestAnimationFrame(() => {
      const barCtx = document.getElementById('rpt-bar-canvas');
      if (!barCtx || !window.Chart) return;
      if (window._rptBarChart) window._rptBarChart.destroy();
      window._rptBarChart = new Chart(barCtx, {
        type:'bar',
        data:{ labels: daily.map(d=>d.txn_date),
          datasets:[{ label:'Revenue (₱)', data:daily.map(d=>parseFloat(d.revenue)),
            backgroundColor:'rgba(22,163,74,.18)', borderColor:'#16a34a', borderWidth:1.5, borderRadius:5 }] },
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#052e16', callbacks:{label:ctx=>' '+formatPeso(ctx.parsed.y)} } },
          scales:{ x:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:11}}},
            y:{grid:{color:'#f0fdf4'},ticks:{color:'#9ca3af',font:{size:11},callback:v=>'₱'+(v>=1000?(v/1000).toFixed(1)+'k':v)},beginAtZero:true} } }
      });
    });

    showToast('Report generated!');
    setTimeout(()=>$('rpt-report-out')?.scrollIntoView({behavior:'smooth'}), 80);
  };

  window.exportReportCSV = async () => {
    const from = $('rpt-from')?.value || '';
    const to   = $('rpt-to')?.value   || '';
    const res  = await AdminSales.report(activePeriod, from, to);
    if (!res.success || !res.data.top_products.length) { showToast('No data to export.','warning'); return; }
    const rows = [['Product','Units Sold','Revenue']];
    res.data.top_products.forEach(p => rows.push([p.product_name, p.units_sold, parseFloat(p.revenue).toFixed(2)]));
    const csv = rows.map(r=>r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `rito-tata-report-${activePeriod}-${Date.now()}.csv`;
    a.click();
    showToast('CSV exported!');
  };

  const autoRender = () => generateReport();
  if (window.Chart) autoRender();
  else {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    s.onload = autoRender;
    document.head.appendChild(s);
  }
}
