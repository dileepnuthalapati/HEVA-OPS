# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor Android APK).

## Architecture
```
/app/
├── backend/
│   ├── server.py           # FastAPI + Socket.IO + Sentry + Rate Limiting
│   ├── socket_manager.py   # Socket.IO server for real-time events
│   ├── database.py         # MongoDB connection
│   ├── indexes.py          # DB index management (runs on startup)
│   ├── rate_limiter.py     # SlowAPI rate limiter
│   ├── dependencies.py     # Auth, JWT, role guards
│   ├── models.py           # Pydantic models
│   └── routers/
│       ├── auth.py (rate limited), platform.py, restaurants.py, menu.py
│       ├── orders.py, reports.py, receipts.py
│       ├── printers.py (+ /printer/check health endpoint)
│       ├── cash_drawer.py, tables.py, reservations.py
│       ├── subscriptions.py, notifications.py, staff.py
│       ├── health.py, email.py
│       └── qr_menu.py (rate limited public endpoints)
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── POSScreen.js          # POS + WebSocket + Printer Status + UUID offline
    │   │   ├── GuestMenu.js          # QR Guest Menu (public, no auth)
    │   │   ├── TableManagement.js    # + QR Code Generator dialog
    │   │   ├── AdminDashboard.js, Reports.js, etc.
    │   ├── services/
    │   │   ├── api.js, printer.js, receiptGenerator.js, socket.js, db.js
    │   └── components/ui/
    ├── capacitor.config.json
    └── package.json
```

## Completed Features (as of April 3, 2026)

### Core POS
- Full POS system (menu, orders, tables, reports, staff, subscriptions, email)
- Dynamic currency, backend modularization (17 routers)
- Universal printer support (WiFi TCP + BT Classic + BLE)
- Direct WiFi TCP printing from tablet (no backend dependency)
- Frontend ESC/POS Receipt Generation (offline-capable, JS-based)

### QR Table Ordering
- Public URL format: /menu/{restaurant_id}/{table_hash}
- Premium mobile-first UI (Manrope font, earthy tones, animations)
- Category tabs, product cards, cart sheet, order confirmation
- WebSocket notifications to POS on QR order placement
- QR Code Generator in Table Management (qrcode.react, download PNG)

### Infrastructure (NEW — April 3, 2026)
- **MongoDB Database Indexes**: 25+ indexes on orders, users, tables, products, categories, restaurants, printers, reservations. Created automatically on app startup.
- **Sentry Error Monitoring**: Placeholder ready. Set `SENTRY_DSN` env var to enable.
- **Rate Limiting**: Auth endpoints (5-10/min), QR public endpoints (10-30/min). Uses SlowAPI.
- **Offline Mode Infrastructure**: UUID-based order IDs (frontend), IndexedDB fallback for offline orders, auto-sync on reconnect.
- **Printer Status Indicator**: Real-time printer health check on POS screen (green/amber/red dot, checks every 60s via /api/printer/check TCP probe).
- **QR Code Generator**: Table Management dialog with QR codes for all tables, Download PNG + Regenerate buttons.

## Upcoming (P1)
- Stripe QR Pay-at-Table integration
- Revenue Analytics Dashboard

## Future/Backlog (P2)
- Kitchen Display System (KDS) views
- Deliverect / Middleware API Integration
- iOS App Build Prep

## Key Credentials
- Platform Owner: platform_owner / admin123
- Restaurant Admin: restaurant_admin / admin123
- Staff User: user / user123
- QR Guest Menu: /menu/rest_demo_1/KrGTedTy (Table 1)
