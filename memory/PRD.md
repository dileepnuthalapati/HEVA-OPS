# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor Android APK). Three roles: Platform Owner, Restaurant Admin, Staff.

## Architecture
```
/app/
├── backend/
│   ├── server.py           # FastAPI + Socket.IO + Sentry + Rate Limiting
│   ├── socket_manager.py   # Socket.IO server for real-time events
│   ├── database.py         # MongoDB connection
│   ├── indexes.py          # DB index management (25+ indexes, runs on startup)
│   ├── rate_limiter.py     # SlowAPI rate limiter
│   ├── dependencies.py     # Auth, JWT, role guards
│   ├── models.py           # Pydantic models (Restaurant has qr_ordering_enabled)
│   └── routers/
│       ├── auth.py (rate limited), platform.py, restaurants.py, menu.py
│       ├── orders.py, reports.py (hourly_revenue, QR/POS breakdown)
│       ├── receipts.py, printers.py (+ /printer/check TCP probe)
│       ├── cash_drawer.py, tables.py (qr_hash), reservations.py
│       ├── subscriptions.py, notifications.py, staff.py
│       ├── health.py, email.py
│       └── qr_menu.py (rate limited, kill switch check)
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── AdminDashboard.js     # Revenue Analytics + QR Kill Switch + hourly chart
    │   │   ├── POSScreen.js          # POS + WebSocket + Printer Status + UUID offline + jitter
    │   │   ├── GuestMenu.js          # QR Guest Menu (public) + "Ordering Paused"
    │   │   ├── TableManagement.js    # + QR Code Generator dialog
    │   ├── services/
    │   │   ├── api.js, printer.js (chunked), receiptGenerator.js, socket.js, db.js
    │   └── components/ui/
    ├── capacitor.config.json
    └── package.json
```

## Completed Features

### Core POS
- Full POS (menu, orders, tables, reports, staff, subscriptions, email)
- Dynamic currency, backend modularization (18 routers)
- Universal printer support (WiFi TCP + BT Classic + BLE)
- Frontend ESC/POS Receipt Generation (offline, JS-based, chunked for large orders)

### QR Table Ordering
- Public URL: /menu/{restaurant_id}/{table_hash}
- Premium mobile-first UI (Manrope, earthy tones, animations)
- WebSocket notifications to POS on QR order
- QR Code Generator in Table Management (download PNG)
- **QR Ordering Kill Switch** — admin toggle on dashboard

### Revenue Analytics Dashboard
- Live Sales (Cash vs Card), Orders (POS vs QR), Avg Order, Open Tables
- Hourly Revenue chart (recharts AreaChart)
- Top Selling Products
- Subscription trial warning banner
- Auto-refresh every 60s

### Infrastructure
- MongoDB indexes (25+, auto-created on startup)
- Sentry error monitoring (env var placeholder: SENTRY_DSN)
- Rate limiting (auth 5-10/min, QR public 10-30/min)
- Offline mode (UUID orders, IndexedDB, auto-sync with jitter)
- Printer Status Indicator (TCP probe, 60s interval)
- Receipt chunking (4KB chunks with 50ms delay for large orders)
- Reconnection storm jitter (random 1-5s delay on sync)

## Upcoming (P1)
- Stripe QR Pay-at-Table integration
- Kitchen Display System (KDS) views

## Future/Backlog (P2)
- Deliverect / Middleware API Integration
- iOS App Build Prep

## Key Credentials
- Platform Owner: platform_owner / admin123
- Restaurant Admin: restaurant_admin / admin123
- Staff User: user / user123
- QR Guest Menu: /menu/rest_demo_1/KrGTedTy (Table 1)
