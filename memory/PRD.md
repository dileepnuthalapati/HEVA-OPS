# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Three roles: Platform Owner, Restaurant Admin, Staff. Revenue model: **0.3% commission on QR orders via Stripe Connect**.

## Architecture
```
/app/
├── backend/
│   ├── server.py, socket_manager.py, database.py, indexes.py, rate_limiter.py, models.py, dependencies.py
│   └── routers/
│       ├── auth.py, platform.py, restaurants.py, menu.py (MULTI-TENANCY FIXED)
│       ├── orders.py (MULTI-TENANCY FIXED - restaurant_id scoped)
│       ├── reports.py (legacy total/total_amount handled)
│       ├── payments.py (Stripe Connect: hybrid 0.3% QR / 0% POS + key guard)
│       ├── cash_drawer.py (restaurant_id scoped, staff accessible)
│       ├── docs.py, receipts.py, printers.py, tables.py, reservations.py
│       ├── qr_menu.py (strict restaurant_id filtering), kds.py, audit.py
│       └── subscriptions.py, staff.py, notifications.py, email.py, health.py
└── frontend/
    ├── src/
    │   ├── components/ (VoidReasonModal simplified, Sidebar with staff cash drawer)
    │   ├── pages/ (POSScreen scrolling fixed, RestaurantSettings Security tab, Reports data+PDF fixed)
    │   ├── context/AuthContext.js (offline login fallback)
    │   ├── services/ (api.js, socket.js, receiptGenerator.js, printer.js, db.js)
```

## Completed Features (All Sessions)
1. Core POS (cart, discounts, split payments, offline mode)
2. ESC/POS Receipt Generation + Kitchen Ticket Printing
3. QR Table Ordering (public guest menu, WebSocket push)
4. Stripe Connect Pay-at-Table (hybrid 0.3% QR / 0% POS)
5. Kitchen Display System (1080p, keyboard shortcuts, back button)
6. Void/Audit System (quick-tap reasons, Manager PIN, immutable logs)
7. Revenue Analytics Dashboard + Kitchen Efficiency widget
8. Menu Management (consolidated categories + products)
9. Report PDF Export (server-generated reportlab, actual file download)
10. Staff Management UI (CRUD, password reset)
11. Security tab with Manager PIN setup UI
12. Offline authentication (cached credential fallback)
13. Multi-currency restaurant creation (INR, USD, EUR, etc.)
14. Cash Drawer (staff + admin access, restaurant-scoped)
15. Table management with QR hash generation
16. Order Sequencing daily reset (restaurant-scoped)

## Bug Fixes Completed (Apr 5, 2026 Session)

### CRITICAL - Multi-Tenancy Security Fix
- **Products/Categories**: Fixed `menu.py` to set `restaurant_id` on creation and filter queries strictly by restaurant_id (removed `None/$exists:False` fallbacks)
- **QR Menu**: Fixed `qr_menu.py` to use strict `restaurant_id` filtering
- **Orders**: Fixed `orders.py` - `get_pending_orders` and `get_orders` now filter by `restaurant_id`
- **Order Numbers**: Daily reset now scoped per restaurant
- **Cash Drawer**: Added `restaurant_id` to drawer creation, scoped current/history queries
- **Data Migration**: Updated all orphan orders with correct `restaurant_id`

### Frontend Fixes
- **PDF Download**: Fixed auth token key (`token` -> `auth_token`), removed Feature Guide button
- **Reports Data**: Fixed `total_amount` fallback to handle legacy `total` field in all report/stats endpoints
- **View Orders**: Works correctly with date range params from Reports page
- **Manager PIN UI**: New Security tab with PIN setup form, status badge, password verification
- **POS Scrolling**: Added `min-h-0` to flex containers for proper overflow
- **Cash/Card Buttons**: Improved visual distinction (rounded-xl, shadow, scale on selected)
- **Void Modal**: Simplified (removed verbose text), PIN placeholder updated
- **KDS Back Button**: Enhanced with smart navigation (history.back or role-based fallback)
- **Cash Drawer**: Staff can now access via sidebar + route unprotected
- **Stripe Connect**: Helpful error for unconfigured key instead of cryptic Stripe error
- **Offline Auth**: Credential caching with btoa hash, fallback on offline login

## Upcoming (P1)
- Full UI/UX Design System Overhaul ("Modern Utility" - Stripe/Linear + Apple whitespace)
  - Phase 1: Design system + POS Screen (Z-pattern, contextual UI, micro-interactions)
  - Phase 2: Dashboard + Command+K search
  - Phase 3: Glassmorphism, product thumbnails, table heatmap
- Daily email summary for restaurant admins
- Automated trial expiry email sequences (7d, 3d, 1d)
- Quick POS PIN Login for staff shift changes
- Daily revenue widget on Admin Dashboard

## Backlog (P2)
- Deliverect / Middleware API Integration (UberEats, Deliveroo)
- iOS App Build Prep
- Print Void Receipt to Kitchen

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET
- [ ] Set up Stripe webhook endpoint in Stripe Dashboard
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
