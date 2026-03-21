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

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function dashboard(el) {
  const todayTxns = STORE.transactions.filter(t => t.date === '2025-07-14');
  const todayRev = todayTxns.reduce((s, t) => s + t.total, 0);
  const lowItems = lowStockProducts();
  const pending = (STORE.pendingUsers || []).length;

  el.innerHTML = `
  <div class="stats-grid">
    <div class="stat-card c-green animate-in">
      <div class="stat-icon c-green">💰</div>
      <div class="stat-value">${formatPeso(todayRev)}</div>
      <div class="stat-label">Today's Revenue</div>
      <div class="stat-change up">↑ ${todayTxns.length} transactions</div>
    </div>
    <div class="stat-card c-gold animate-in delay-1">
      <div class="stat-icon c-gold">📦</div>
      <div class="stat-value">${STORE.products.length}</div>
      <div class="stat-label">Total Products</div>
      <div class="stat-change ${lowItems.length ? 'warn' : 'up'}">${lowItems.length ? `⚠ ${lowItems.length} low stock` : '✓ All stocked'}</div>
    </div>
    <div class="stat-card c-teal animate-in delay-2">
      <div class="stat-icon c-teal">🛒</div>
      <div class="stat-value">${todayTxns.length}</div>
      <div class="stat-label">Today's Transactions</div>
      <div class="stat-change up">↑ Active today</div>
    </div>
    <div class="stat-card c-rose animate-in delay-3">
      <div class="stat-icon c-rose">⏳</div>
      <div class="stat-value">${pending}</div>
      <div class="stat-label">Pending Registrations</div>
      <div class="stat-change ${pending ? 'warn' : 'up'}">${pending ? 'Needs review' : '✓ None pending'}</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card animate-in delay-2">
      <div class="card-header">
        <div><div class="card-title">Recent Transactions</div><div class="card-sub">Latest sales</div></div>
        <button class="btn btn-secondary btn-sm" onclick="navigate('sales')">View All</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>TXN ID</th><th>Cashier</th><th>Total</th><th>Time</th></tr></thead>
          <tbody>
            ${STORE.transactions.slice(0,5).map(t => `
              <tr>
                <td class="font-mono text-green fw-600">${t.id}</td>
                <td>${t.cashier}</td>
                <td class="fw-600">${formatPeso(t.total)}</td>
                <td class="text-muted text-sm">${t.time}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card animate-in delay-3">
      <div class="card-header">
        <div><div class="card-title">Low Stock Alerts</div><div class="card-sub">Items to restock</div></div>
        <button class="btn btn-secondary btn-sm" onclick="navigate('inventory')">View All</button>
      </div>
      <div class="card-body" style="padding-top:10px;">
        ${lowItems.length === 0
          ? `<div class="empty-state"><div class="empty-icon">✅</div><p>All items are well stocked!</p></div>`
          : lowItems.map(p => `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="flex:1;">
                <div class="fw-600 text-sm">${p.name}</div>
                <div style="display:flex;align-items:center;gap:7px;margin-top:4px;">
                  <div class="progress-bar" style="flex:1;">
                    <div class="progress-fill ${p.qty <= p.low_stock/2 ? 'low' : 'med'}" style="width:${Math.min(100,(p.qty/p.low_stock)*100)}%"></div>
                  </div>
                  <span class="text-xs text-danger fw-600">${p.qty} left</span>
                </div>
              </div>
              <button class="btn btn-success btn-xs" onclick="quickAddStock(${p.id})">+ Stock</button>
            </div>`).join('')}
      </div>
    </div>
  </div>`;

  // Quick add stock from dashboard
  window.quickAddStock = (id) => {
    openAddStockModal(id);
  };
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

// ── REPORTS ───────────────────────────────────────────────────────────────────
function reports(el) {
  el.innerHTML = `
  <div class="section-header">
    <div><div class="section-title">Reports</div><div class="section-desc">Generate business reports</div></div>
  </div>

  <div class="grid-3 mb-18">
    <div class="card" style="cursor:pointer;" onclick="genReport('daily')">
      <div class="card-body" style="text-align:center;padding:26px;">
        <div style="font-size:2.2rem;margin-bottom:10px;">📅</div>
        <div class="card-title">Daily Sales Report</div>
        <div class="card-sub mt-4">Today's transactions & revenue</div>
        <button class="btn btn-primary btn-sm mt-16">Generate</button>
      </div>
    </div>
    <div class="card" style="cursor:pointer;" onclick="genReport('monthly')">
      <div class="card-body" style="text-align:center;padding:26px;">
        <div style="font-size:2.2rem;margin-bottom:10px;">📆</div>
        <div class="card-title">Monthly Sales Report</div>
        <div class="card-sub mt-4">Month-to-date performance</div>
        <button class="btn btn-primary btn-sm mt-16">Generate</button>
      </div>
    </div>
    <div class="card" style="cursor:pointer;" onclick="genReport('lowstock')">
      <div class="card-body" style="text-align:center;padding:26px;">
        <div style="font-size:2.2rem;margin-bottom:10px;">⚠️</div>
        <div class="card-title">Low Stock Report</div>
        <div class="card-sub mt-4">Products needing restock</div>
        <button class="btn btn-secondary btn-sm mt-16">View</button>
      </div>
    </div>
  </div>

  <div class="card" id="report-out" style="display:none;">
    <div class="card-header">
      <div class="card-title" id="report-title">Report</div>
      <button class="btn btn-secondary btn-sm" onclick="window.print()">🖨️ Print</button>
    </div>
    <div class="card-body" id="report-body"></div>
  </div>`;

  window.genReport = (type) => {
    const out   = $('report-out');
    const body  = $('report-body');
    const title = $('report-title');
    const txns  = STORE.transactions;
    const today = txns.filter(t => t.date === '2025-07-14');
    out.style.display = '';

    if (type === 'daily') {
      const rev = today.reduce((s, t) => s + t.total, 0);
      title.textContent = '📅 Daily Sales Report — July 14, 2025';
      body.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px;">
          <div class="stat-card c-green"><div class="stat-value">${today.length}</div><div class="stat-label">Transactions</div></div>
          <div class="stat-card c-gold"><div class="stat-value">${formatPeso(rev)}</div><div class="stat-label">Revenue</div></div>
          <div class="stat-card c-teal"><div class="stat-value">${formatPeso(today.length?rev/today.length:0)}</div><div class="stat-label">Avg per Sale</div></div>
        </div>
        ${renderTxnTable(today)}`;
    } else if (type === 'monthly') {
      const rev = txns.reduce((s, t) => s + t.total, 0);
      title.textContent = '📆 Monthly Sales Report — July 2025';
      body.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px;">
          <div class="stat-card c-green"><div class="stat-value">${txns.length}</div><div class="stat-label">Total Transactions</div></div>
          <div class="stat-card c-gold"><div class="stat-value">${formatPeso(rev)}</div><div class="stat-label">Total Revenue</div></div>
          <div class="stat-card c-teal"><div class="stat-value">${formatPeso(txns.length?rev/txns.length:0)}</div><div class="stat-label">Avg per Sale</div></div>
        </div>
        ${renderTxnTable(txns)}`;
    } else {
      const ls = lowStockProducts();
      title.textContent = '⚠️ Low Stock Report';
      body.innerHTML = ls.length === 0
        ? `<div class="empty-state"><div class="empty-icon">✅</div><p>All products are adequately stocked.</p></div>`
        : `<table><thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Threshold</th><th>Status</th></tr></thead>
           <tbody>${ls.map(p=>`<tr><td class="fw-600">${p.name}</td><td>${p.category}</td><td class="fw-600 text-danger font-mono">${p.qty}</td><td class="font-mono">${p.low_stock}</td><td><span class="badge badge-danger">⚠ Restock</span></td></tr>`).join('')}</tbody></table>`;
    }
    out.scrollIntoView({ behavior: 'smooth' });
    showToast('Report generated!');
  };
}
