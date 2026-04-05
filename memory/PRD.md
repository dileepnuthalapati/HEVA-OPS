# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Three roles: Platform Owner, Restaurant Admin, Staff. Revenue model: **0.3% commission on QR orders via Stripe Connect**.

## Design System: "Modern Utility"
- **Philosophy**: Invisible Utility — minimize visual fatigue for 8-hour shift workers
- **Color Palette**: Slate & Indigo (Admin), High-contrast Light Mode (POS)
- **Semantic Colors**: Emerald (success/payments), Blue (navigation), Amber (warnings), Red (void/cancel)
- **Typography**: Manrope (body), Satoshi (headings), JetBrains Mono (prices/numbers)
- **Buttons**: Rounded-2xl, haptic (scale-95 on press), shadow-lg on primary actions
- **Layout**: Z-pattern (Pay button bottom-right), pill-shaped categories
- **Effects**: Glassmorphism on modals/overlays, micro-animations (slide-up, scale-in)
- **Global Search**: Cmd+K command palette with keyboard navigation

## Architecture
```
/app/
├── backend/
│   ├── server.py, socket_manager.py, database.py, indexes.py, models.py, dependencies.py
│   └── routers/ (auth, platform, restaurants, menu, orders, reports, payments, cash_drawer, kds, qr_menu, audit, docs, tables, reservations, receipts, printers, staff, subscriptions, notifications, email, health)
└── frontend/
    ├── src/
    │   ├── components/ (Sidebar, CommandSearch, VoidReasonModal, OfflineIndicator, ui/)
    │   ├── pages/ (POSScreen, AdminDashboard, KitchenDisplay, Reports, OrderHistory, RestaurantSettings, RestaurantManagement, GuestMenu, Login, CashDrawer, TableManagement, MenuManagement, etc.)
    │   ├── context/AuthContext.js (offline login fallback)
    │   ├── services/ (api.js, socket.js, receiptGenerator.js, printer.js, db.js)
```

## All Completed Features
1. Core POS (cart, discounts, split payments, offline mode)
2. ESC/POS Receipt Generation + Kitchen Ticket Printing
3. QR Table Ordering (public guest menu, WebSocket push)
4. Stripe Connect Pay-at-Table (hybrid 0.3% QR / 0% POS)
5. Kitchen Display System (1080p, keyboard shortcuts, back button)
6. Void/Audit System (quick-tap reasons, Manager PIN)
7. Revenue Analytics Dashboard + Kitchen Efficiency widget
8. Menu Management (consolidated categories + products)
9. Report PDF Export (server-generated reportlab)
10. Staff Management UI (CRUD, password reset)
11. Security tab with Manager PIN setup UI
12. Offline authentication (cached credential fallback)
13. Multi-currency restaurant creation
14. Cash Drawer (staff + admin access, restaurant-scoped)
15. Table management with QR hash generation
16. Order Sequencing daily reset (restaurant-scoped)
17. **Multi-tenancy security fix** (strict restaurant_id scoping on all endpoints)
18. **Design System Overhaul** (Phase 1-3: Modern Utility)
    - Login: Dark glassmorphic card, indigo CTA, dot grid background
    - Sidebar: Slate gradient, Cmd+K search trigger, active indigo state
    - Dashboard: Colored icon metric cards, indigo chart gradient, ranked top products
    - POS: Haptic product cards, pill categories, Z-pattern cart with massive pay button
    - Command+K: Global search overlay with keyboard navigation
    - CSS: Custom variables, haptic button class, glassmorphism, scroll styles, animations

## Bug Fixes History
- Multi-tenancy breach (products/orders/categories visible across restaurants)
- PDF download auth token fix
- Reports data (legacy total/total_amount field handling)
- Stripe Connect placeholder key guard
- KDS back button smart navigation
- VoidReasonModal simplified
- Cash Drawer staff access
- Order numbers restaurant-scoped

## Upcoming (P1)
- Daily email summary for restaurant admins
- Automated trial expiry email sequences (7d, 3d, 1d)
- Quick POS PIN Login for staff shift changes
- Daily revenue widget on Admin Dashboard

## Backlog (P2)
- Deliverect / Middleware API Integration
- iOS App Build Prep
- Print Void Receipt to Kitchen

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
