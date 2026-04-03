# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor Android APK). Three roles: Platform Owner, Restaurant Admin, Staff.

## Architecture
```
/app/
├── backend/
│   ├── server.py           # FastAPI + Socket.IO + Sentry + Rate Limiting
│   ├── socket_manager.py   # Socket.IO server (new_qr_order, order_update)
│   ├── database.py, indexes.py, rate_limiter.py, dependencies.py, models.py
│   └── routers/
│       ├── auth.py, platform.py, restaurants.py, menu.py
│       ├── orders.py (emits WebSocket on create)
│       ├── reports.py (hourly_revenue, QR/POS, tables)
│       ├── receipts.py, printers.py (/printer/check), cash_drawer.py
│       ├── tables.py (qr_hash), reservations.py
│       ├── subscriptions.py, notifications.py, staff.py, health.py, email.py
│       ├── qr_menu.py (rate limited, kill switch)
│       └── kds.py (acknowledge, preparing, ready, recall, stats)
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── AdminDashboard.js     # Revenue Analytics + QR Kill Switch
    │   │   ├── POSScreen.js          # POS + WebSocket + Printer Status + Offline
    │   │   ├── KitchenDisplay.js     # KDS — Digital ticket board
    │   │   ├── GuestMenu.js          # QR Guest Menu (public)
    │   │   ├── TableManagement.js    # + QR Code Generator
    │   ├── services/
    │   │   ├── api.js, printer.js (chunked), receiptGenerator.js, socket.js, db.js
    │   └── components/ (Sidebar with KDS link)
    └── package.json
```

## Completed Features

### Core POS
- Full POS (menu, orders, tables, reports, staff, subscriptions, email)
- Dynamic currency, 19 backend routers
- Universal printer support (WiFi TCP + BT Classic + BLE)
- Frontend ESC/POS Receipt Generation (offline, chunked for large orders)

### Kitchen Display System (KDS) — NEW
- Full-screen digital ticket board at /kds
- Color-coded: NEW (red) → ACKNOWLEDGED (amber) → PREPARING (yellow) → READY (green)
- Live wait timer (mm:ss) on each ticket, turns red + flame icon after 15 min
- QR/POS source badge on each ticket
- Bump workflow: Acknowledge → Start Cooking → Ready for Pickup → Recall
- Sound toggle for new order beeps
- Avg prep time stat (tracked from acknowledged_at to ready_at)
- WebSocket real-time updates + 2-min safety poll
- Accessible by all roles (admin + staff)

### QR Table Ordering
- Public URL: /menu/{restaurant_id}/{table_hash}
- Premium mobile-first UI, WebSocket notifications to POS + KDS
- QR Code Generator in Table Management (download PNG)
- QR Ordering Kill Switch on Admin Dashboard

### Revenue Analytics Dashboard
- Sales (Cash/Card), Orders (POS/QR), Avg Order, Open Tables
- Hourly Revenue chart (recharts), Top Products, Subscription banner

### Infrastructure
- MongoDB indexes (25+), Sentry placeholder, Rate limiting
- Offline mode (UUID orders, IndexedDB, jitter sync)
- Printer Status Indicator, Receipt chunking, Reconnection storm jitter

## Upcoming (P1)
- Audit/Void Logs (security — who deleted/voided, why)
- Stripe Pay-at-Table ("pay after ordering" flow)

## Future/Backlog (P2)
- Weekly Email Digest with benchmarks
- Deliverect / Middleware API Integration
- iOS App Build Prep
