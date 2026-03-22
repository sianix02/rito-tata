# RITO & TATA — PHP/MySQL Backend
## Setup Guide for Laragon

---

## Folder Structure

```
ritotata/                        ← copy your existing project here
├── index.html
├── style.css
├── script.js
├── api.js                       ← NEW: shared JS API client
├── shared-store.js              ← KEEP during transition; remove after
│
├── admin/
│   ├── admin.html
│   ├── css/style.css
│   └── script/main.js
│
├── cashier/
│   ├── cashier.html
│   ├── css/style.css
│   └── script/main.js
│
└── backend/                     ← NEW: all PHP lives here
    ├── database.sql
    ├── INTEGRATION_GUIDE.js
    │
    ├── config/
    │   ├── db.php               ← edit DB credentials here
    │   └── api_helper.php
    │
    ├── shared/                  ← used by both admin & cashier
    │   ├── auth.php             (login / logout / register)
    │   └── products.php         (read-only product list)
    │
    ├── admin/                   ← admin-only endpoints
    │   ├── dashboard.php
    │   ├── users.php
    │   ├── products.php         (full CRUD + restock)
    │   └── sales.php            (transactions + reports)
    │
    ├── cashier/                 ← cashier-only endpoints
    │   ├── dashboard.php
    │   ├── transaction.php      (create sale)
    │   └── password.php         (change password)
    │
    └── sse/                     ← real-time live updates
        ├── admin_feed.php
        └── cashier_feed.php
```

---

## Step 1 — Place project in Laragon's www folder

```
C:\laragon\www\ritotata\
```

Then open: http://ritotata.test  (or http://localhost/ritotata)

---

## Step 2 — Create the database

1. Open **phpMyAdmin**: http://localhost/phpmyadmin
2. Click **Import** tab
3. Choose file: `backend/database.sql`
4. Click **Go**

This creates `ritotata_db` with all tables and sample data.

---

## Step 3 — Check DB credentials

Open `backend/config/db.php` and confirm:

```php
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');        // Laragon default is blank
define('DB_NAME', 'ritotata_db');
```

---

## Step 4 — Add api.js to your HTML files

**index.html** — add before `script.js`:
```html
<script src="api.js"></script>
```

**admin/admin.html** — add before `script/main.js`:
```html
<script src="../api.js"></script>
```

**cashier/cashier.html** — add before `script/main.js`:
```html
<script src="../api.js"></script>
```

---

## Step 5 — Apply integration changes

Open `backend/INTEGRATION_GUIDE.js` and apply each code
replacement in the corresponding JS file.

The guide is organized by file and function — each section
shows exactly which function to replace and with what.

---

## Default Login Credentials

| Username | Password  | Role    |
|----------|-----------|---------|
| rito     | admin123  | Admin   |
| tata     | admin123  | Admin   |
| katirin  | staff123  | Cashier |
| juan     | staff123  | Cashier |

---

## How SSE (Real-Time Updates) Works

```
Browser                           PHP (Laragon)
   │                                    │
   │── GET /backend/sse/admin_feed.php ─▶│
   │                                    │ loop every 5s:
   │◀── event: stats  { revenue… } ─────│   query DB → emit
   │◀── event: stock  { low_count… } ───│   query DB → emit
   │◀── event: pending { count… } ──────│   query DB → emit
   │                   ·                │
   │                   ·  (keeps the connection open)
```

- No page refresh needed.
- The KPI numbers and badge counts update automatically.
- Cashiers see product stock change in real-time after a sale.

---

## API Reference (quick cheatsheet)

| File | Action | Method | What it does |
|------|--------|--------|-------------|
| shared/auth.php | login | POST | Sign in |
| shared/auth.php | logout | POST | Sign out |
| shared/auth.php | register | POST | New cashier registration |
| shared/products.php | — | GET | List products (any user) |
| admin/dashboard.php | — | GET | All KPI data |
| admin/users.php | list_cashiers | GET | All cashier accounts |
| admin/users.php | list_pending | GET | Pending registrations |
| admin/users.php | approve | POST | Approve registration |
| admin/users.php | decline | POST | Decline registration |
| admin/users.php | toggle | POST | Activate/deactivate |
| admin/users.php | edit | PUT | Edit staff info |
| admin/products.php | list | GET | All products + flags |
| admin/products.php | add | POST | Add product |
| admin/products.php | edit | PUT | Edit product |
| admin/products.php | delete | DELETE | Delete product |
| admin/products.php | restock | POST | Add stock qty |
| admin/sales.php | list | GET | All transactions |
| admin/sales.php | detail | GET | One transaction + items |
| admin/sales.php | report | GET | Period report |
| cashier/transaction.php | list | GET | My transactions |
| cashier/transaction.php | create | POST | New sale (deducts stock) |
| cashier/dashboard.php | — | GET | My KPIs |
| cashier/password.php | — | POST | Change password |
| sse/admin_feed.php | — | SSE | Live stats stream |
| sse/cashier_feed.php | — | SSE | Live stock stream |
