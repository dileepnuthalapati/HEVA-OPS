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
│       ├── orders.py (void modal + manager PIN + WebSocket emit on cancel)
│       ├── reports.py (hourly_revenue, QR/POS, tables)
│       ├── receipts.py, printers.py (/printer/check), cash_drawer.py
│       ├── tables.py (qr_hash), reservations.py
│       ├── subscriptions.py, notifications.py, staff.py, health.py, email.py
│       ├── qr_menu.py (rate limited, kill switch)
│       ├── kds.py (acknowledge, preparing, ready, recall, stats)
│       └── audit.py (immutable logs with void_category, void_note, manager_approved_by)
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── VoidReasonModal.js  # Reusable: quick-tap reasons + Manager PIN gate
    │   │   └── Sidebar.js
    │   ├── pages/
    │   │   ├── AdminDashboard.js     # Revenue Analytics + QR Kill Switch
    │   │   ├── POSScreen.js          # POS + VoidReasonModal integration
    │   │   ├── KitchenDisplay.js     # KDS — Digital ticket board
    │   │   ├── GuestMenu.js          # QR Guest Menu (public)
    │   │   ├── TableManagement.js    # + QR Code Generator
    │   │   ├── AuditLog.js           # Enriched with void_category badges + manager override
    │   │   ├── OrderHistory.js       # VoidReasonModal integration
    │   ├── services/
    │   │   ├── api.js (fixed cancel payload), printer.js, receiptGenerator.js, socket.js, db.js
    │   └── context/AuthContext.js
    └── package.json
```

## Completed Features

### Core POS
- Full POS (menu, orders, tables, reports, staff, subscriptions, email)
- Dynamic currency, 19+ backend routers
- Universal printer support (WiFi TCP + BT Classic + BLE)
- Frontend ESC/POS Receipt Generation (offline, chunked for large orders)

### Audit/Void System (SaaS-Ready) — NEW (Apr 2026)
- VoidReasonModal with 5 quick-tap reasons: Mispunch, Customer Change, Kitchen Error, Testing, Out of Stock
- Optional 100-character free-text note
- Manager PIN authorization required for Staff role (validates against admin password)
- Backend stores: void_category, void_note, cancelled_by, manager_approved_by
- Immutable audit logs with enriched details
- Audit Log page shows void category badges, manager override info, and item details
- WebSocket emit on cancel so KDS removes voided tickets
- Fixed api.js bug: cancel reason was silently lost (sent `reason` instead of `cancel_reason`)

### Kitchen Display System (KDS)
- Full-screen digital ticket board at /kds
- Color-coded: NEW (red) → ACKNOWLEDGED (amber) → PREPARING (yellow) → READY (green)
- Live wait timer (mm:ss), bump workflow, sound toggle
- WebSocket real-time updates + 2-min safety poll

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
- Stripe Pay-at-Table ("pay after ordering" flow via QR guest menu)
- Print Void Receipt to Kitchen (optional paper trail)

## Future/Backlog (P2)
- Weekly Email Digest with benchmarks
- Deliverect / Middleware API Integration
- iOS App Build Prep
