# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor Android APK). Three roles: Platform Owner, Restaurant Admin, Staff.

## Architecture
```
/app/
├── backend/
│   ├── server.py           # FastAPI + Socket.IO + Sentry + Rate Limiting
│   ├── socket_manager.py   # Socket.IO server
│   ├── database.py, indexes.py, rate_limiter.py, dependencies.py, models.py
│   └── routers/
│       ├── auth.py, platform.py, restaurants.py, menu.py
│       ├── orders.py        # Void modal + Manager PIN + WebSocket cancel
│       ├── reports.py       # Local-time filtering, real PDF streaming
│       ├── payments.py      # Stripe Pay-at-Table (Checkout Sessions + Webhook)
│       ├── docs.py          # Feature Guide PDF generator
│       ├── receipts.py, printers.py, cash_drawer.py
│       ├── tables.py, reservations.py
│       ├── subscriptions.py, notifications.py, staff.py, health.py, email.py
│       ├── qr_menu.py, kds.py, audit.py
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── VoidReasonModal.js  # Quick-tap reasons + Manager PIN gate
    │   │   └── Sidebar.js          # Consolidated Menu item
    │   ├── pages/
    │   │   ├── AdminDashboard.js   # + Kitchen Efficiency widget
    │   │   ├── POSScreen.js        # Debounced + 3 buttons + overflow fix
    │   │   ├── KitchenDisplay.js   # Keyboard shortcuts + 1080p + position labels
    │   │   ├── MenuManagement.js   # Categories sidebar + Products grid
    │   │   ├── GuestMenu.js        # + Pay Bill via Stripe
    │   │   ├── AuditLog.js         # Enriched void badges + manager override
    │   │   ├── Reports.js          # Real PDF download + Feature Guide button
    │   │   ├── TableManagement.js  # Hidden raw QR hashes
    │   │   ├── OrderHistory.js     # VoidReasonModal
    │   ├── services/
    │   │   ├── api.js              # Fixed cancel payload
    │   │   ├── receiptGenerator.js # CP858 encoding for thermal printers
    │   │   ├── socket.js, db.js, printer.js
    │   └── context/AuthContext.js
```

## Completed Features (All Phases)

### Phase 1: Core POS & Offline
- Full POS with cart, discounts, notes, split payments
- ESC/POS receipt generation in JS (offline capable, chunked)
- CP858 encoding fix for thermal printers (£, €, etc.)
- Offline order saving + IndexedDB sync
- Button debouncing (prevents double orders)

### Phase 2: QR Table Ordering + Pay-at-Table
- Guest scan QR -> view menu -> order (public route, no login)
- WebSocket push to POS + KDS
- QR Kill Switch on admin dashboard
- Stripe Pay-at-Table: Checkout Sessions + webhook + instant POS sync
- Rate limiting on public QR endpoints

### Phase 3: Real-time KDS
- Full-screen dark-mode display (1080p optimized, 5-column grid)
- Color-coded ticket lifecycle: NEW -> SEEN -> COOKING -> READY
- Live wait timers, sound alerts, recall
- Keyboard shortcuts: 1-9 bumps tickets, R refreshes
- WebSocket-powered with safety polling fallback

### Phase 4: Revenue Analytics & Audit Logs
- Dashboard: Sales, Orders, Avg Order, Tables, Cash/Card split
- Kitchen Efficiency widget (avg prep time from Acknowledged->Ready)
- Hourly revenue chart, top products ranking
- Immutable audit trail with void_category, void_note, manager_approved_by
- VoidReasonModal: quick-tap reasons + Manager PIN for staff
- Local-time date filtering (midnight-to-midnight, not UTC 2AM)
- Real PDF report download from backend (reportlab, correct currency)

### UX Improvements (Apr 2026)
- Consolidated Menu Management (categories sidebar + products grid)
- Pending Orders: 3 buttons (Edit, Cancel, Pay) + printer icon inline
- POS overflow fix, Table Management responsive fix
- Hidden raw QR hashes in admin (show only scannable QRs)
- Feature Guide PDF for sales pitching

## Upcoming (P1)
- Print Void Receipt to Kitchen (optional paper trail)
- Weekly Email Digest with benchmarks

## Future/Backlog (P2)
- Deliverect / Middleware API Integration (UberEats, Deliveroo)
- iOS App Build Prep
