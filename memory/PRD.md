# HevaPOS - Product Requirements Document

## Original Problem Statement
Build a multi-tenant SaaS POS system called "HevaPOS" with cloud backend (FastAPI/MongoDB), Android APK (Capacitor), three user roles (Platform Owner, Restaurant Admin, Staff), and full POS functionality.

## Technical Architecture
- **Frontend**: React, Tailwind CSS, Shadcn UI, Capacitor, @capacitor-community/bluetooth-le
- **Backend**: FastAPI, Motor (async MongoDB)
- **Database**: MongoDB Atlas (Production), Local MongoDB (Dev)
- **Hosting**: Railway (Backend)

## Completed Features
- [x] JWT Auth with role-based access (Platform Owner, Admin, Staff)
- [x] Full POS: cart, discounts, notes, split payments, custom items
- [x] Mobile cart as slide-out Sheet drawer
- [x] Full mobile responsiveness
- [x] Subscription Management lifecycle + Stripe Billing button
- [x] Reprint Receipt button
- [x] User Management UI (3-tab: Business Info, Users, Password)
- [x] User CRUD + Reset passwords + Change own password
- [x] Global Currency (dynamic, no hardcoded $)
- [x] Back Buttons on OrderHistory and Reports
- [x] **Printer Discovery** — Backend TCP socket scanner (real port detection, not browser fetch)
- [x] **Bluetooth Discovery** — Filters by known printer names (Epson, Star, Bixolon etc), sorted by relevance
- [x] **Logout visible** — Red styled button always at bottom of desktop sidebar
- [x] **Colored action buttons** — Edit (amber), Cancel (red), Pay (green) equal-width grid
- [x] **Cancel order fixed** — Reason made optional, default "Cancelled by staff", removes order from list
- [x] **Orders synced** — Staff and admin see identical pending + completed orders
- [x] **Print Receipt on completed orders** — Staff can print receipt for any completed order
- [x] **PDF Report opens in new tab** — User can view, save, share the report
- [x] **Login offline recovery** — 2-second polling, auto-recovers when WiFi reconnects
- [x] **Order History 2AM Reset** — defaults to today (no "2AM" text shown)
- [x] **Reports Quick Ranges** — Today/7d/30d/90d buttons
- [x] **Completed Orders on POS** — Below pending orders, with payment method + Print Receipt

## Key API Endpoints
- `POST /api/printers/discover` — Backend TCP scanner for WiFi printer discovery
- `GET /api/orders?today_only=true` — Today's business day orders
- `GET /api/orders/pending` — All pending orders (all users see all)
- `PUT /api/orders/{id}/cancel` — Cancel with optional reason
- `GET /api/restaurant/staff` — Users (passwords excluded)

## Upcoming (P1)
- [ ] Stripe account connection (waiting for user's key)
- [ ] Email delivery (SendGrid/Resend)
- [ ] Kitchen Display System (KDS)

## Future (P2)
- [ ] Backend refactoring (split server.py)
- [ ] Revenue Dashboard with charts
- [ ] iOS App Build Prep
