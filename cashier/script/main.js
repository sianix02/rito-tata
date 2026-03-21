/**
 * cashier/script/main.js
 * All cashier dashboard page logic.
 */

'use strict';

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
let CURRENT_USER = null;
let CART = [];

(function init() {
  const raw = sessionStorage.getItem('currentUser');
  if (!raw) { window.location.href = '../index.html'; return; }
  CURRENT_USER = JSON.parse(raw);
  if (CURRENT_USER.role !== 'cashier') { window.location.href = '../index.html'; return; }

  const fullName = `${CURRENT_USER.firstname} ${CURRENT_USER.mi ? CURRENT_USER.mi + '. ' : ''}${CURRENT_USER.lastname}`;
  document.getElementById('user-name').textContent = fullName;
  document.getElementById('user-avatar').textContent = CURRENT_USER.firstname[0];
  document.getElementById('page-date').textContent = todayStr();

  updateClock();
  setInterval(updateClock, 1000);

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
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function showAlert(id, msg, type = 'error') {
  const el = $(id);
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.innerHTML = (type === 'error' ? '⚠ ' : '✓ ') + msg;
}
function hideAlert(id) { const el = $(id); if (el) el.classList.remove('show'); }

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
    dashboard: 'Dashboard', products: 'Available Products',
    transaction: 'New Transaction', sales: 'My Sales History', settings: 'Change Password'
  };
  $('page-title').textContent = titles[page] || page;
  const content = $('page-content');
  content.innerHTML = '';
  content.className = 'page-content animate-in';

  const pages = { dashboard, products, transaction, sales, settings };
  if (pages[page]) pages[page](content);
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function dashboard(el) {
  const fullName = `${CURRENT_USER.firstname} ${CURRENT_USER.mi ? CURRENT_USER.mi + '. ' : ''}${CURRENT_USER.lastname}`;
  const myTxns   = STORE.transactions.filter(t => t.cashierId === CURRENT_USER.id);
  const myRev    = myTxns.reduce((s, t) => s + t.total, 0);
  const todayTxns = myTxns.filter(t => t.date === '2025-07-14');
  const todayRev  = todayTxns.reduce((s, t) => s + t.total, 0);

  el.innerHTML = `
  <div class="stats-grid">
    <div class="stat-card c-green animate-in">
      <div class="stat-icon c-green">💳</div>
      <div class="stat-value">${myTxns.length}</div>
      <div class="stat-label">Total Transactions</div>
    </div>
    <div class="stat-card c-gold animate-in delay-1">
      <div class="stat-icon c-gold">💰</div>
      <div class="stat-value">${formatPeso(myRev)}</div>
      <div class="stat-label">Total Revenue</div>
    </div>
    <div class="stat-card c-teal animate-in delay-2">
      <div class="stat-icon c-teal">📅</div>
      <div class="stat-value">${todayTxns.length}</div>
      <div class="stat-label">Today's Sales</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card animate-in delay-1">
      <div class="card-header"><div class="card-title">Quick Actions</div></div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:11px;">
        <button class="btn btn-primary w-full" onclick="navigate('transaction')" style="justify-content:center;padding:12px;font-size:.92rem;">
          🛒 Start New Transaction
        </button>
        <button class="btn btn-secondary w-full" onclick="navigate('products')" style="justify-content:center;">
          🏷️ View Product Prices
        </button>
        <button class="btn btn-secondary w-full" onclick="navigate('sales')" style="justify-content:center;">
          📋 My Sales History
        </button>
        <button class="btn btn-secondary w-full" onclick="navigate('settings')" style="justify-content:center;">
          🔒 Change Password
        </button>
      </div>
    </div>

    <div class="card animate-in delay-2">
      <div class="card-header">
        <div><div class="card-title">Recent Transactions</div><div class="card-sub">Your latest sales</div></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>TXN ID</th><th>Items</th><th>Total</th><th>Time</th></tr></thead>
          <tbody>
            ${myTxns.slice(-5).reverse().map(t => `
              <tr>
                <td class="font-mono text-green fw-600">${t.id}</td>
                <td class="text-muted text-sm">${t.items.length} item(s)</td>
                <td class="fw-600">${formatPeso(t.total)}</td>
                <td class="text-sm text-muted">${t.time}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// ── PRODUCTS VIEW ─────────────────────────────────────────────────────────────
function products(el) {
  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Available Products</div><div class="section-desc">Browse all products and prices</div></div>
    <button class="btn btn-primary" onclick="navigate('transaction')">🛒 New Transaction</button>
  </div>
  <div class="card animate-in">
    <div class="card-header">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input id="prod-search" class="form-control" placeholder="Search products..." oninput="filterProds()" />
      </div>
      <select id="cat-filter" class="form-control" style="width:150px;" onchange="filterProds()">
        <option value="">All Categories</option>
        ${[...new Set(STORE.products.map(p=>p.category))].map(c=>`<option value="${c}">${c}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap" id="prod-table">
      ${renderProdTable(STORE.products)}
    </div>
  </div>`;

  window.filterProds = () => {
    const q   = ($('prod-search')?.value || '').toLowerCase();
    const cat = $('cat-filter')?.value || '';
    let list  = STORE.products;
    if (cat) list = list.filter(p => p.category === cat);
    if (q)   list = list.filter(p => p.name.toLowerCase().includes(q));
    $('prod-table').innerHTML = renderProdTable(list);
  };
}

function renderProdTable(list) {
  if (!list.length) return `<div class="empty-state"><div class="empty-icon">📦</div><p>No products found.</p></div>`;
  return `<table>
    <thead><tr><th>Product Name</th><th>Category</th><th>Price</th><th>Availability</th></tr></thead>
    <tbody>
      ${list.map(p => `
        <tr>
          <td class="fw-600">${p.name}</td>
          <td><span class="badge badge-green">${p.category}</span></td>
          <td class="fw-600 font-mono">${formatPeso(p.price)}</td>
          <td>${p.qty > 0
            ? `<span class="badge badge-success">✓ In Stock (${p.qty})</span>`
            : `<span class="badge badge-danger">Out of Stock</span>`}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// ── TRANSACTION ───────────────────────────────────────────────────────────────
function transaction(el) {
  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">New Sales Transaction</div><div class="section-desc">Select products and confirm sale</div></div>
  </div>

  <div class="grid-2" style="align-items:start;">
    <!-- Product List -->
    <div class="card animate-in">
      <div class="card-header">
        <div class="card-title">🏷️ Select Products</div>
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input id="txn-search" class="form-control" placeholder="Search..." oninput="filterTxnProds()" />
        </div>
      </div>
      <div id="product-list" style="max-height:440px;overflow-y:auto;padding:8px;">
        ${STORE.products.map(p => `
          <div class="product-row" id="prod-row-${p.id}" onclick="addToCart(${p.id})">
            <div style="flex:1;">
              <div class="fw-600 text-sm">${p.name}</div>
              <div class="text-xs text-muted">${p.category} &nbsp;·&nbsp; Stock: <span id="stock-${p.id}">${p.qty}</span></div>
            </div>
            <div class="fw-600 text-green text-sm">${formatPeso(p.price)}</div>
            <button class="btn btn-primary btn-sm" style="pointer-events:none;">Add</button>
          </div>`).join('')}
      </div>
    </div>

    <!-- Cart -->
    <div class="card animate-in delay-1">
      <div class="card-header">
        <div class="card-title">🛒 Cart <span id="cart-count" style="background:var(--g100);color:var(--g700);padding:2px 8px;border-radius:99px;font-size:.73rem;margin-left:4px;">0</span></div>
      </div>
      <div class="card-body">
        <div id="cart-items" style="min-height:80px;"></div>
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <span class="fw-700 text-green" style="font-size:.95rem;">TOTAL</span>
          <span class="font-serif fw-700" style="font-size:1.35rem;color:var(--g900);" id="cart-total">₱0.00</span>
        </div>
        <button class="btn btn-primary w-full" style="justify-content:center;padding:11px;font-size:.92rem;" onclick="processTransaction()">
          ✓ Confirm Transaction
        </button>
        <button class="btn btn-secondary w-full mt-8" style="justify-content:center;" onclick="clearCart()">
          Clear Cart
        </button>
      </div>
    </div>
  </div>

  <!-- Receipt Modal -->
  <div class="modal-overlay" id="receipt-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">✓ Transaction Complete</div>
        <button class="modal-close" onclick="closeModal('receipt-modal');navigate('transaction');">✕</button>
      </div>
      <div class="modal-body" id="receipt-body"></div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeModal('receipt-modal');navigate('transaction');">New Transaction</button>
      </div>
    </div>
  </div>`;

  renderCart();

  window.addToCart = (id) => {
    const p = STORE.products.find(x => x.id === id);
    if (!p || p.qty === 0) { showToast('Item is out of stock.', 'error'); return; }
    const existing = CART.find(x => x.id === id);
    if (existing) {
      if (existing.qty >= p.qty) { showToast('Not enough stock available.', 'warning'); return; }
      existing.qty++;
    } else {
      CART.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
    }
    renderCart();
  };

  window.changeQty = (id, delta) => {
    const idx = CART.findIndex(x => x.id === id);
    if (idx === -1) return;
    const p = STORE.products.find(x => x.id === id);
    CART[idx].qty += delta;
    if (CART[idx].qty <= 0) CART.splice(idx, 1);
    else if (p && CART[idx].qty > p.qty) { CART[idx].qty = p.qty; showToast('Max stock reached.', 'warning'); }
    renderCart();
  };

  window.removeFromCart = (id) => {
    CART = CART.filter(x => x.id !== id);
    renderCart();
  };

  window.clearCart = () => { CART = []; renderCart(); };

  window.filterTxnProds = () => {
    const q = ($('txn-search')?.value || '').toLowerCase();
    document.querySelectorAll('.product-row').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  };

  window.processTransaction = () => {
    if (!CART.length) { showToast('Cart is empty.', 'error'); return; }
    const total = CART.reduce((s, i) => s + i.price * i.qty, 0);
    const txnId = 'TXN-' + String(STORE.transactions.length + 1).padStart(3, '0');
    const txn = {
      id: txnId,
      cashierId: CURRENT_USER.id,
      cashier: `${CURRENT_USER.firstname} ${CURRENT_USER.lastname}`,
      items: CART.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
      total, date: '2025-07-14', time: nowTime()
    };
    // Deduct stock
    CART.forEach(item => {
      const p = STORE.products.find(x => x.id === item.id);
      if (p) p.qty -= item.qty;
    });
    STORE.transactions.push(txn);

    $('receipt-body').innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <div class="receipt-title">RITO&TATA Grocery Store</div>
        <div class="text-muted" style="font-size:.68rem;margin-top:3px;">Sales &amp; Inventory System</div>
        <div style="font-size:.68rem;margin-top:6px;color:var(--gray-600);">${txn.date} &nbsp;·&nbsp; ${txn.time}</div>
        <div style="font-size:.68rem;color:var(--gray-500);">Cashier: ${txn.cashier} &nbsp;·&nbsp; ${txn.id}</div>
      </div>
      ${txn.items.map(i => `<div class="receipt-row"><span>${i.name} × ${i.qty}</span><span>${formatPeso(i.price * i.qty)}</span></div>`).join('')}
      <div class="receipt-total"><span>TOTAL</span><span>${formatPeso(total)}</span></div>
      <div style="text-align:center;margin-top:12px;font-size:.66rem;color:var(--gray-400);">— Thank you for shopping! —</div>
    </div>`;

    CART = [];
    openModal('receipt-modal');
    showToast(`${txnId} completed successfully!`);
  };
}

function renderCart() {
  const cartEl  = $('cart-items');
  const totalEl = $('cart-total');
  const countEl = $('cart-count');
  if (!cartEl) return;

  const total = CART.reduce((s, i) => s + i.price * i.qty, 0);
  if (countEl) countEl.textContent = CART.length;
  if (totalEl) totalEl.textContent = formatPeso(total);

  if (!CART.length) {
    cartEl.innerHTML = `<div class="empty-state" style="padding:28px 0;"><div class="empty-icon">🛒</div><p style="font-size:.8rem;">Cart is empty</p></div>`;
    return;
  }

  cartEl.innerHTML = CART.map(item => `
    <div class="cart-item">
      <div style="flex:1;">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatPeso(item.price)} each</div>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
        <span class="qty-val">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
      </div>
      <div class="fw-600 text-sm" style="min-width:65px;text-align:right;">${formatPeso(item.price * item.qty)}</div>
      <button class="btn btn-sm" style="padding:4px 7px;background:var(--danger-light);color:var(--danger);border:none;" onclick="removeFromCart(${item.id})">✕</button>
    </div>`).join('');
}

// ── MY SALES ──────────────────────────────────────────────────────────────────
function sales(el) {
  const myTxns = STORE.transactions.filter(t => t.cashierId === CURRENT_USER.id);
  const total  = myTxns.reduce((s, t) => s + t.total, 0);

  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">My Sales History</div><div class="section-desc">All transactions recorded by you</div></div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px;">
    <div class="stat-card c-green animate-in">
      <div class="stat-icon c-green">💳</div>
      <div class="stat-value">${myTxns.length}</div>
      <div class="stat-label">Total Transactions</div>
    </div>
    <div class="stat-card c-gold animate-in delay-1">
      <div class="stat-icon c-gold">💰</div>
      <div class="stat-value">${formatPeso(total)}</div>
      <div class="stat-label">Total Revenue</div>
    </div>
    <div class="stat-card c-teal animate-in delay-2">
      <div class="stat-icon c-teal">📊</div>
      <div class="stat-value">${formatPeso(myTxns.length ? total / myTxns.length : 0)}</div>
      <div class="stat-label">Average Sale</div>
    </div>
  </div>

  <div class="card animate-in delay-2">
    <div class="card-header"><div class="card-title">Transaction Records</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>TXN ID</th><th>Items</th><th>Total</th><th>Date</th><th>Time</th><th></th></tr></thead>
        <tbody>
          ${myTxns.map(t => `
            <tr>
              <td class="font-mono text-green fw-600">${t.id}</td>
              <td class="text-muted text-sm">${t.items.length} item(s)</td>
              <td class="fw-600">${formatPeso(t.total)}</td>
              <td class="text-sm">${t.date}</td>
              <td class="text-sm text-muted">${t.time}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="viewTxn('${t.id}')">View</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Detail Modal -->
  <div class="modal-overlay" id="txn-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Transaction Details</div>
        <button class="modal-close" onclick="closeModal('txn-modal')">✕</button>
      </div>
      <div class="modal-body" id="txn-modal-body"></div>
    </div>
  </div>`;

  window.viewTxn = (id) => {
    const t = STORE.transactions.find(x => x.id === id);
    if (!t) return;
    $('txn-modal-body').innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <div class="receipt-title">RITO&TATA Grocery Store</div>
        <div style="font-size:.68rem;margin-top:4px;color:var(--gray-400);">${t.date} &nbsp;·&nbsp; ${t.time}</div>
        <div style="font-size:.68rem;color:var(--gray-500);">Cashier: ${t.cashier} &nbsp;·&nbsp; ${t.id}</div>
      </div>
      ${t.items.map(i => `<div class="receipt-row"><span>${i.name} × ${i.qty}</span><span>${formatPeso(i.price*i.qty)}</span></div>`).join('')}
      <div class="receipt-total"><span>TOTAL</span><span>${formatPeso(t.total)}</span></div>
      <div style="text-align:center;margin-top:11px;font-size:.65rem;color:var(--gray-400);">— Thank you for shopping! —</div>
    </div>`;
    openModal('txn-modal');
  };
}

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────────
function settings(el) {
  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Change Password</div><div class="section-desc">Update your login password</div></div>
  </div>

  <div class="card animate-in" style="max-width:460px;">
    <div class="card-header"><div class="card-title">🔒 Password Settings</div></div>
    <div class="card-body">
      <div class="alert alert-error" id="pw-error"></div>
      <div class="alert alert-success" id="pw-success"></div>

      <div class="form-group">
        <label class="form-label">Current Password *</label>
        <div class="pw-wrap">
          <input id="pw-current" class="form-control" type="password" placeholder="Enter current password" />
          <button class="pw-toggle" type="button" onclick="togglePw('pw-current',this)">👁</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">New Password *</label>
        <div class="pw-wrap">
          <input id="pw-new" class="form-control" type="password" placeholder="Min. 6 characters" />
          <button class="pw-toggle" type="button" onclick="togglePw('pw-new',this)">👁</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Confirm New Password *</label>
        <div class="pw-wrap">
          <input id="pw-confirm" class="form-control" type="password" placeholder="Re-enter new password" />
          <button class="pw-toggle" type="button" onclick="togglePw('pw-confirm',this)">👁</button>
        </div>
      </div>
      <button class="btn btn-primary" onclick="changePassword()" style="margin-top:4px;">
        🔒 Update Password
      </button>
    </div>
  </div>`;

  window.togglePw = (inputId, btn) => {
    const inp = $(inputId);
    if (!inp) return;
    if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
    else { inp.type = 'password'; btn.textContent = '👁'; }
  };

  window.changePassword = () => {
    hideAlert('pw-error'); hideAlert('pw-success');
    const current = $('pw-current').value;
    const newPw   = $('pw-new').value;
    const confirm = $('pw-confirm').value;

    if (!current || !newPw || !confirm) { showAlert('pw-error', 'Please fill in all fields.'); return; }

    // Verify current password against stored user
    const userInStore = STORE.users.find(u => u.id === CURRENT_USER.id);
    if (!userInStore || userInStore.password !== current) {
      showAlert('pw-error', 'Current password is incorrect.'); return;
    }
    if (newPw.length < 6) { showAlert('pw-error', 'New password must be at least 6 characters.'); return; }
    if (newPw !== confirm) { showAlert('pw-error', 'New passwords do not match.'); return; }
    if (newPw === current) { showAlert('pw-error', 'New password must be different from current password.'); return; }

    // Update store and session
    userInStore.password = newPw;
    CURRENT_USER.password = newPw;
    sessionStorage.setItem('currentUser', JSON.stringify(CURRENT_USER));

    showAlert('pw-success', 'Password updated successfully!', 'success');
    $('pw-current').value = '';
    $('pw-new').value = '';
    $('pw-confirm').value = '';
    showToast('Password changed successfully!');
  };
}
