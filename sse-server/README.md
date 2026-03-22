# RITO&TATA — Node.js SSE Server

## What this does
A dedicated Node.js server that replaces the PHP SSE files.
It connects to the same MySQL database as the PHP backend and
pushes live updates to all connected browsers via Server-Sent Events.

---

## Setup (one time)

```bash
# 1. Go into the sse-server folder
cd sse-server

# 2. Install dependencies
npm install

# 3. Edit .env to match your Laragon settings
#    (DB credentials and your site URL)
```

---

## Start the server

```bash
# Normal start
node server.js

# Auto-restart on file changes (install nodemon first: npm i -g nodemon)
nodemon server.js
```

You should see:
```
🛒  RITO&TATA SSE Server
🚀  Listening on http://localhost:3001
🔄  Polling DB every 3000ms
🌐  CORS origin: http://rito-tata.test
✅  Connected to MySQL database: ritotata_db
```

---

## How it works

```
Browser (Admin)                   Node.js Server              MySQL DB
     │                                  │                         │
     │── GET /sse/admin ───────────────▶│                         │
     │   (connection stays open)        │                         │
     │                                  │── every 3s: query ─────▶│
     │◀── event: stats ─────────────────│◀── today revenue        │
     │◀── event: stock ─────────────────│◀── low stock items      │
     │◀── event: pending ───────────────│◀── pending count        │
     │◀── event: transactions ──────────│◀── recent sales         │
     │                   ·              │                         │
     │                   ·  (repeats every 3 seconds)
```

---

## Events reference

### Admin (`/sse/admin`)
| Event | Payload |
|-------|---------|
| `connected` | `{ message, clientId }` |
| `stats` | `{ today_revenue, today_transactions, timestamp }` |
| `stock` | `{ low_count, critical_count, low_items[], critical_items[] }` |
| `pending` | `{ count }` |
| `transactions` | `{ transactions[] }` |

### Cashier (`/sse/cashier`)
| Event | Payload |
|-------|---------|
| `connected` | `{ message, clientId }` |
| `products` | Array of `{ id, name, category, price, qty, low_stock, in_stock, is_low }` |

> Cashier products are only pushed when qty actually changes — no wasted events.

---

## Health check

```
GET http://localhost:3001/health
```
Returns connected client counts and server uptime.

---

## .env options

| Key | Default | Description |
|-----|---------|-------------|
| `DB_HOST` | localhost | MySQL host |
| `DB_USER` | root | MySQL user |
| `DB_PASS` | *(empty)* | MySQL password |
| `DB_NAME` | ritotata_db | Database name |
| `PORT` | 3001 | Node server port |
| `CORS_ORIGIN` | http://rito-tata.test | Your Laragon site URL |
| `POLL_INTERVAL` | 3000 | DB poll every N milliseconds |

---

## File structure

```
sse-server/
├── server.js      ← main server (edit this)
├── .env           ← your config (edit this)
├── package.json
└── README.md
```
