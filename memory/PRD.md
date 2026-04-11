# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Three roles: Platform Owner, Restaurant Admin, Staff. Revenue model: **0.3% commission on QR orders via Stripe Connect**.

## Architecture
```
/app/backend/routers/ (auth, platform, restaurants, menu, orders, reports, payments, cash_drawer, kds, qr_menu, audit, docs, tables, reservations, receipts, printers, staff, subscriptions, notifications, email, health)
/app/frontend/src/ (pages, components, context, services)
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
10. Staff Management UI (CRUD, password reset, POS PIN set/remove)
11. Security tab with Manager PIN setup UI
12. Offline authentication (cached credential fallback)
13. Multi-currency restaurant creation with auto-seeded categories
14. Cash Drawer (staff + admin access, restaurant-scoped)
15. Table management with QR hash generation
16. Order Sequencing daily reset (atomic counter, race-condition safe)
17. Multi-tenancy security (strict restaurant_id scoping)
18. Design System Overhaul (Phase 1-3: Modern Utility)
19. Cmd+K Global Command Search
20. Standalone QR Menu HTML (served by FastAPI)
21. Standalone KDS Monitor HTML (PIN-protected, keyboard shortcuts)
22. PDF download via window.open (works on Capacitor WebView)
23. Quick POS PIN Login (4-digit PIN pad, auto-submit, role-based navigation)
24. Double-tap prevention (touch-action:manipulation + useRef guards)
25. Printer WiFi scan optimization (priority IPs, retry logic, 1.2s timeout)
26. KDS table names + large quantity display (enriched from tables collection)
27. **Daily Revenue Widget** (today's total, cash/card progress bar, 7-day sparkline, % change)

## Daily Revenue Widget (April 11, 2026)
- Big total revenue with % change from yesterday (green up/red down badge)
- Cash vs Card visual progress bar (emerald=cash, indigo=card)
- 7-day bar chart sparkline with today highlighted in indigo
- Backend: `GET /api/reports/weekly-trend` returns 7 days of daily totals with cash/card split
- Metric cards: Orders (POS/QR), Avg Order, Tables, Completed

## Upcoming (P1)
- Daily email summary for restaurant admins
- Automated trial expiry email sequences (7d, 3d, 1d)

## Backlog (P2)
- Print Void Receipt to Kitchen
- Split monolithic server.py into modular routers
- Deliverect / Middleware API Integration
- iOS App Build Prep

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
