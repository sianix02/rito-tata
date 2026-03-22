/** *
 *
 * STEP 3 — Replace the code snippets below in each JS file.
 * ═══════════════════════════════════════════════════════════════
 */

// ════════════════════════════════════════════════════════════════
//  index.html  →  script.js
//  REPLACE: doLogin() function
// ════════════════════════════════════════════════════════════════

async function doLogin() {
    hideAlert('login-error');
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    if (!username || !password) {
        showAlert('login-error', 'Please enter your username and password.'); return;
    }
    setLoading('login-btn', 'login-spinner', 'login-btn-text', true);

    const res = await Auth.login(username, password);
    setLoading('login-btn', 'login-spinner', 'login-btn-text', false);

    if (!res.success) { showAlert('login-error', res.message); return; }

    const user = res.data;
    // Keep session reference in sessionStorage for page-level UI (name, avatar)
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    window.location.href = user.role === 'admin'
        ? 'admin/admin.html'
        : 'cashier/cashier.html';
}

// REPLACE: doRegister() function
async function doRegister() {
    hideAlert('reg-error'); hideAlert('reg-success');
    const data = {
        firstname: $('reg-firstname').value.trim(),
        mi:        $('reg-mi').value.trim().toUpperCase(),
        lastname:  $('reg-lastname').value.trim(),
        contact:   $('reg-contact').value.trim(),
        username:  $('reg-username').value.trim(),
        password:  $('reg-password').value,
    };
    const confirm = $('reg-confirm').value;

    if (!data.firstname || !data.lastname || !data.contact || !data.username || !data.password) {
        showAlert('reg-error', 'Please fill in all required fields.'); return;
    }
    if (data.password.length < 6) { showAlert('reg-error', 'Password must be at least 6 characters.'); return; }
    if (data.password !== confirm) { showAlert('reg-error', 'Passwords do not match.'); return; }

    setLoading('reg-btn', 'reg-spinner', 'reg-btn-text', true);
    const res = await Auth.register(data);
    setLoading('reg-btn', 'reg-spinner', 'reg-btn-text', false);

    if (!res.success) { showAlert('reg-error', res.message); return; }
    showAlert('reg-success', res.message, 'success');
    goToStep1();
}


// ════════════════════════════════════════════════════════════════
//  admin/script/main.js
//  REPLACE: the init() IIFE
// ════════════════════════════════════════════════════════════════

(async function init() {
    // Restore from sessionStorage (set during login)
    const raw = sessionStorage.getItem('currentUser');
    if (!raw) { window.location.href = '../index.html'; return; }
    CURRENT_USER = JSON.parse(raw);
    if (CURRENT_USER.role !== 'admin') { window.location.href = '../index.html'; return; }

    document.getElementById('user-name').textContent =
        `${CURRENT_USER.firstname} ${CURRENT_USER.mi ? CURRENT_USER.mi + '. ' : ''}${CURRENT_USER.lastname}`;
    document.getElementById('user-avatar').textContent = CURRENT_USER.firstname[0];
    document.getElementById('page-date').textContent = todayStr();

    updateClock();
    setInterval(updateClock, 1000);

    // ── Start SSE stream ──────────────────────────────────────────
    window._adminSSE = SSE.adminFeed({
        stats(data) {
            // Live-update KPI numbers without full page reload
            const revenueEl = document.getElementById('kpi-revenue');
            const txnEl     = document.getElementById('kpi-txn-count');
            if (revenueEl) revenueEl.textContent = formatPeso(data.today_revenue);
            if (txnEl)     txnEl.textContent     = data.today_transactions;
        },
        stock(data) {
            const lb = document.getElementById('low-badge');
            const nd = document.getElementById('notif-dot');
            if (lb) { lb.textContent = data.low_count; lb.style.display = data.low_count ? '' : 'none'; }
            if (nd) nd.style.display = data.critical_count ? '' : 'none';
        },
        pending(data) {
            const pb = document.getElementById('pending-badge');
            if (pb) { pb.textContent = data.count; pb.style.display = data.count ? '' : 'none'; }
        },
    });

    navigate('dashboard');
})();

// ADD: cleanup SSE on logout
function doLogout() {
    if (window._adminSSE) window._adminSSE.close();
    Auth.logout().finally(() => {
        sessionStorage.removeItem('currentUser');
        window.location.href = '../index.html';
    });
}


// ════════════════════════════════════════════════════════════════
//  admin/script/main.js
//  REPLACE: dashboard() function — key parts only
// ════════════════════════════════════════════════════════════════

async function dashboard(el) {
    el.innerHTML = '<div class="empty-state"><p>Loading dashboard…</p></div>';

    const res = await AdminDashboard.get();
    if (!res.success) { el.innerHTML = `<p class="text-danger">${res.message}</p>`; return; }

    const d          = res.data;
    const todayRev   = d.today_revenue;
    const todayCount = d.today_transactions;
    const redItems   = d.critical_items;
    const amberItems = d.low_stock_items.filter(p => p.qty > Math.floor(p.low_stock / 2));
    const pending    = d.pending_count;

    // Rebuild the same HTML as before — just use `d.*` instead of computing from STORE
    // (The full HTML template is the same as in the original dashboard() function)
    // ...
    // Hourly chart data from d.hourly_sales (object keyed 8..19)
    const lineLabels = Object.keys(d.hourly_sales).map(h => h + ':00');
    const lineData   = Object.values(d.hourly_sales);
    // Bar chart from d.sales_by_category
    const barLabels  = d.sales_by_category.map(c => c.category);
    const barData    = d.sales_by_category.map(c => parseFloat(c.revenue));
    // ...continue with same chart code...
}


// ════════════════════════════════════════════════════════════════
//  admin/script/main.js
//  REPLACE: userManagement() — key fetch calls
// ════════════════════════════════════════════════════════════════

async function userManagement(el) {
    const res = await AdminUsers.listCashiers();
    const users = res.data || [];
    // Use `users` instead of STORE.users.filter(...)
    // ... rest of render is identical ...
}

// REPLACE: acceptUser / declineUser in pendingRegistrations()
async function acceptUser(id) {
    const res = await AdminUsers.approve(id);
    if (!res.success) { showToast(res.message, 'error'); return; }
    showToast(res.message);
    document.getElementById('pending-list').innerHTML = renderList();
}

async function declineUser(id) {
    if (!confirm('Decline this registration?')) return;
    const res = await AdminUsers.decline(id);
    if (!res.success) { showToast(res.message, 'error'); return; }
    showToast(res.message, 'warning');
}


// ════════════════════════════════════════════════════════════════
//  admin/script/main.js  — productManagement()
// ════════════════════════════════════════════════════════════════

// REPLACE: saveProduct()
async function saveProduct() {
    const name     = $('p-name').value.trim();
    const category = $('p-cat').value.trim();
    const price    = parseFloat($('p-price').value);
    const qty      = parseInt($('p-qty').value);
    const low      = parseInt($('p-low').value) || 10;
    if (!name || !category || isNaN(price) || isNaN(qty)) {
        showToast('Please fill all required fields.', 'error'); return;
    }
    const editId = parseInt($('p-edit-id').value);
    const res = editId
        ? await Products.edit(editId, { name, category, price, qty, low_stock: low })
        : await Products.add({ name, category, price, qty, low_stock: low });
    if (!res.success) { showToast(res.message, 'error'); return; }
    showToast(res.message);
    closeModal('product-modal');
    productManagement(document.getElementById('page-content'));  // refresh
}

// REPLACE: confirmAddStock()
async function confirmAddStock() {
    const id  = parseInt(document.getElementById('stock-product-id').value);
    const qty = parseInt(document.getElementById('stock-add-qty').value);
    if (!qty || qty < 1) { showToast('Please enter a valid quantity.', 'error'); return; }
    const res = await Products.restock(id, qty);
    if (!res.success) { showToast(res.message, 'error'); return; }
    showToast(res.message);
    closeModal('stock-modal');
    navigate(document.querySelector('.nav-item.active')?.dataset.page || 'inventory');
}

// REPLACE: deleteProduct()
async function deleteProduct(id) {
    if (!confirm('Delete this product from inventory?')) return;
    const res = await Products.delete(id);
    if (!res.success) { showToast(res.message, 'error'); return; }
    showToast(res.message, 'warning');
    productManagement(document.getElementById('page-content'));
}


// ════════════════════════════════════════════════════════════════
//  cashier/script/main.js
//  REPLACE: init() IIFE
// ════════════════════════════════════════════════════════════════

(async function init() {
    const raw = sessionStorage.getItem('currentUser');
    if (!raw) { window.location.href = '../index.html'; return; }
    CURRENT_USER = JSON.parse(raw);
    if (CURRENT_USER.role !== 'cashier') { window.location.href = '../index.html'; return; }

    document.getElementById('user-name').textContent =
        `${CURRENT_USER.firstname} ${CURRENT_USER.mi ? CURRENT_USER.mi + '. ' : ''}${CURRENT_USER.lastname}`;
    document.getElementById('user-avatar').textContent = CURRENT_USER.firstname[0];
    document.getElementById('page-date').textContent = todayStr();
    updateClock();
    setInterval(updateClock, 1000);

    // ── Start SSE for live product stock ──────────────────────────
    window._cashierSSE = SSE.cashierFeed({
        products(list) {
            // If cashier is on the transaction page, update stock badges live
            list.forEach(p => {
                const stockEl = document.getElementById('stock-' + p.id);
                if (stockEl) stockEl.textContent = p.qty;
                // Gray out row if out of stock
                const row = document.getElementById('prod-row-' + p.id);
                if (row) row.style.opacity = p.in_stock ? '1' : '0.4';
            });
        },
    });

    navigate('dashboard');
})();

// REPLACE: processTransaction() — the key part
async function processTransaction() {
    if (!CART.length) { showToast('Cart is empty.', 'error'); return; }
    const items = CART.map(i => ({ product_id: i.id, qty: i.qty }));
    const res   = await CashierTxn.create(items);
    if (!res.success) { showToast(res.message, 'error'); return; }

    const txn = res.data;
    // Build receipt from returned data (same HTML as before, use txn.*)
    $('receipt-body').innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <div class="receipt-title">RITO&TATA Grocery Store</div>
        <div style="font-size:.68rem;margin-top:4px;color:var(--gray-400);">${txn.date} · ${txn.time}</div>
        <div style="font-size:.68rem;color:var(--gray-500);">Cashier: ${txn.cashier} · ${txn.txn_code}</div>
      </div>
      ${txn.items.map(i => `
        <div class="receipt-row">
          <span>${i.name} × ${i.qty}</span>
          <span>${formatPeso(i.subtotal)}</span>
        </div>`).join('')}
      <div class="receipt-total"><span>TOTAL</span><span>${formatPeso(txn.total)}</span></div>
      <div style="text-align:center;margin-top:12px;font-size:.66rem;color:var(--gray-400);">— Thank you for shopping! —</div>
    </div>`;

    CART = [];
    openModal('receipt-modal');
    showToast(`${txn.txn_code} completed!`);
}

// REPLACE: changePassword() in settings()
async function changePassword() {
    hideAlert('pw-error'); hideAlert('pw-success');
    const current = $('pw-current').value;
    const newPw   = $('pw-new').value;
    const confirm = $('pw-confirm').value;
    if (!current || !newPw || !confirm) { showAlert('pw-error', 'Please fill all fields.'); return; }

    const res = await CashierAccount.changePassword(current, newPw, confirm);
    if (!res.success) { showAlert('pw-error', res.message); return; }
    showAlert('pw-success', res.message, 'success');
    $('pw-current').value = $('pw-new').value = $('pw-confirm').value = '';
    showToast('Password changed!');
}
