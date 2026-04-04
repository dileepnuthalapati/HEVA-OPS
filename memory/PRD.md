# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Three roles: Platform Owner, Restaurant Admin, Staff. Revenue model: **0.3% commission on QR orders via Stripe Connect**.

## Architecture
```
/app/
├── backend/
│   ├── server.py, socket_manager.py, database.py, indexes.py, rate_limiter.py
│   └── routers/
│       ├── auth.py, platform.py, restaurants.py, menu.py
│       ├── orders.py        # Void modal + Manager PIN + WebSocket
│       ├── reports.py       # Local-time filtering, PDF streaming
│       ├── payments.py      # Stripe Connect: hybrid fee (0.3% QR / 0% POS)
│       ├── docs.py          # Feature Guide PDF
│       ├── receipts.py, printers.py, cash_drawer.py
│       ├── tables.py, reservations.py, qr_menu.py, kds.py, audit.py
│       └── subscriptions.py, staff.py, notifications.py, email.py, health.py
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── VoidReasonModal.js, Sidebar.js, OfflineIndicator.js
    │   ├── pages/
    │   │   ├── POSScreen.js, KitchenDisplay.js, MenuManagement.js
    │   │   ├── AdminDashboard.js, PlatformDashboard.js (+ Stripe Connect stats)
    │   │   ├── GuestMenu.js (+ conditional Pay Bill), PaymentSuccess.js
    │   │   ├── RestaurantSettings.js (+ Stripe Connect tab + Security/Manager PIN tab)
    │   │   ├── RestaurantManagement.js (+ multi-currency create/edit)
    │   │   ├── AuditLog.js, Reports.js, OrderHistory.js, TableManagement.js
    │   ├── context/AuthContext.js (+ offline login fallback)
    │   ├── services/ (api.js, socket.js, receiptGenerator.js, printer.js, db.js)
```

## Stripe Connect Architecture (Phase 5)
- **Model**: Stripe Standard Connect
- **Fee**: QR orders = 0.3% (math.ceil, rounded UP to nearest penny). POS orders = 0%
- **Charges**: Direct Charges (restaurant pays Stripe processing)
- **Metadata**: Every transaction includes `order_id` + `order_source` (qr/pos)
- **Safety**: Pay Bill hidden if restaurant hasn't connected Stripe; placeholder key guard on onboarding

## All Completed Features
1. Core POS (cart, discounts, split payments, offline mode)
2. ESC/POS Receipt Generation (CP858 encoding, chunking)
3. QR Table Ordering (public guest menu, WebSocket push)
4. Stripe Connect Pay-at-Table (hybrid 0.3% QR / 0% POS)
5. Kitchen Display System (1080p, keyboard shortcuts 1-9, color-coded)
6. Void/Audit System (quick-tap reasons, Manager PIN, immutable logs)
7. Revenue Analytics Dashboard (+ Kitchen Efficiency widget)
8. Menu Management (consolidated categories + products)
9. Report PDF Export (server-generated reportlab)
10. Feature Guide PDF for sales pitching
11. Platform Owner commission dashboard (Total Volume, Earnings, Merchants)
12. Button debouncing, overflow fixes, responsive improvements
13. Staff Management UI (CRUD, password reset)
14. Security tab with Manager PIN setup UI
15. Offline authentication (cached credential fallback)
16. Multi-currency restaurant creation fix (INR, USD, EUR, etc.)

## Bug Fixes Completed (Apr 4, 2026)
- PDF report download: Fixed auth token key (`token` -> `auth_token`)
- Feature guide download: Same auth token fix
- Manager PIN UI: Added Security tab in RestaurantSettings with PIN set/update form
- Multi-currency crash: Fixed RestaurantManagement.js payload to match backend RestaurantCreate model
- Stripe Connect error: Added placeholder key guard + helpful error message
- Offline auth: Added credential caching in AuthContext for offline login fallback

## Upcoming (P1)
- Print Void Receipt to Kitchen
- Weekly Email Digest

## Backlog (P2)
- Deliverect / Middleware API Integration
- iOS App Build Prep

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET for signature verification
- [ ] Set up Stripe webhook endpoint URL in Stripe Dashboard
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
