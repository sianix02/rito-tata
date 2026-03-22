-- =============================================================
-- RITO & TATA Grocery Store — Database Setup
-- File: backend/database.sql
-- Run this in phpMyAdmin or: mysql -u root < database.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS ritotata_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ritotata_db;

-- ─────────────────────────────────────────────────────────────
-- TABLE: users
-- Stores both admin and cashier accounts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  firstname  VARCHAR(50)  NOT NULL,
  mi         VARCHAR(5)   DEFAULT '',
  lastname   VARCHAR(50)  NOT NULL,
  contact    VARCHAR(20)  DEFAULT '',
  username   VARCHAR(50)  NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,   -- plain text for demo; use password_hash() in production
  role       ENUM('admin','cashier') NOT NULL DEFAULT 'cashier',
  status     ENUM('active','inactive','pending') NOT NULL DEFAULT 'pending',
  created_at DATE NOT NULL DEFAULT (CURDATE())
);

-- ─────────────────────────────────────────────────────────────
-- TABLE: products
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  category   VARCHAR(50)  NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  qty        INT NOT NULL DEFAULT 0,
  low_stock  INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- TABLE: transactions
-- One row per completed sale
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  txn_code     VARCHAR(20) NOT NULL UNIQUE,   -- e.g. TXN-001
  cashier_id   INT NOT NULL,
  cashier_name VARCHAR(100) NOT NULL,
  total        DECIMAL(10,2) NOT NULL,
  txn_date     DATE NOT NULL,
  txn_time     VARCHAR(20) NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cashier_id) REFERENCES users(id)
);

-- ─────────────────────────────────────────────────────────────
-- TABLE: transaction_items
-- Line items for each transaction
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  product_name   VARCHAR(100) NOT NULL,
  qty            INT NOT NULL,
  unit_price     DECIMAL(10,2) NOT NULL,
  subtotal       DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

-- =============================================================
-- SAMPLE DATA  (mirrors shared-store.js)
-- =============================================================

-- ── Users ────────────────────────────────────────────────────
INSERT INTO users (id, firstname, mi, lastname, contact, username, password, role, status, created_at) VALUES
(1, 'Evelyn',    'A', 'Dela Cruz',  '09171234567', 'rito',   'admin123', 'admin',   'active',   '2024-01-10'),
(2, 'Tata',      'L', 'Reyes',      '09181234567', 'tata',   'admin123', 'admin',   'active',   '2024-01-10'),
(3, 'Catherine', 'A', 'Estomago',   '09191234567', 'katirin','staff123', 'cashier', 'active',   '2024-02-14'),
(4, 'Juan',      'D', 'Dela Cruz',  '09201234567', 'juan',   'staff123', 'cashier', 'active',   '2024-03-05'),
(5, 'Ana',       'B', 'Lim',        '09211234567', 'ana',    'staff123', 'cashier', 'inactive', '2024-04-20'),
-- Pending registrations (status = pending)
(1001, 'Carlo',  'R', 'Magsino',   '09321234567', 'carlo',  'carlo123', 'cashier', 'pending',  '2025-07-12'),
(1002, 'Lovely', 'S', 'Bautista',  '09451234567', 'lovely', 'lovely123','cashier', 'pending',  '2025-07-13'),
(1003, 'Ramon',  'T', 'Villanueva','09561234567', 'ramon',  'ramon123', 'cashier', 'pending',  '2025-07-14');

-- ── Products ─────────────────────────────────────────────────
INSERT INTO products (id, name, category, price, qty, low_stock) VALUES
(1,  'Rice (5kg)',        'Grains',    280.00, 120, 20),
(2,  'Cooking Oil (1L)', 'Oil',        85.00,   8, 15),
(3,  'Sugar (1kg)',      'Condiment',  65.00,  55, 10),
(4,  'Salt (500g)',      'Condiment',  18.00,  80, 10),
(5,  'Canned Sardines',  'Canned',     35.00, 200, 30),
(6,  'Eggs (dozen)',     'Dairy',     110.00,   5, 10),
(7,  'Instant Noodles',  'Noodles',    12.00, 350, 50),
(8,  'Soy Sauce (500ml)','Condiment',  38.00,  45, 10),
(9,  'Vinegar (500ml)',  'Condiment',  28.00,  40, 10),
(10, 'Powdered Milk',   'Dairy',     320.00,  22,  8);

-- ── Transactions ─────────────────────────────────────────────
INSERT INTO transactions (id, txn_code, cashier_id, cashier_name, total, txn_date, txn_time) VALUES
(1, 'TXN-001', 3, 'Catherine Estomago', 625.00, '2025-07-14', '09:14 AM'),
(2, 'TXN-002', 4, 'Juan Dela Cruz',     211.00, '2025-07-14', '10:45 AM'),
(3, 'TXN-003', 3, 'Catherine Estomago', 195.00, '2025-07-14', '11:30 AM'),
(4, 'TXN-004', 4, 'Juan Dela Cruz',     356.00, '2025-07-14', '01:02 PM'),
(5, 'TXN-005', 3, 'Catherine Estomago', 196.00, '2025-07-13', '03:20 PM'),
(6, 'TXN-006', 4, 'Juan Dela Cruz',     280.00, '2025-07-13', '04:55 PM');

-- ── Transaction Items ─────────────────────────────────────────
INSERT INTO transaction_items (transaction_id, product_name, qty, unit_price, subtotal) VALUES
-- TXN-001
(1, 'Rice (5kg)',        2, 280.00, 560.00),
(1, 'Sugar (1kg)',       1,  65.00,  65.00),
-- TXN-002
(2, 'Canned Sardines',   5,  35.00, 175.00),
(2, 'Instant Noodles',   3,  12.00,  36.00),
-- TXN-003
(3, 'Eggs (dozen)',      1, 110.00, 110.00),
(3, 'Cooking Oil (1L)', 1,  85.00,  85.00),
-- TXN-004
(4, 'Powdered Milk',    1, 320.00, 320.00),
(4, 'Salt (500g)',      2,  18.00,  36.00),
-- TXN-005
(5, 'Instant Noodles', 10,  12.00, 120.00),
(5, 'Soy Sauce (500ml)',2,  38.00,  76.00),
-- TXN-006
(6, 'Rice (5kg)',        1, 280.00, 280.00);

-- Reset AUTO_INCREMENT after manual IDs
ALTER TABLE users AUTO_INCREMENT = 2000;
ALTER TABLE products AUTO_INCREMENT = 11;
ALTER TABLE transactions AUTO_INCREMENT = 7;
