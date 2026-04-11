# HevaPOS - Product Requirements Document

## Overview
Multi-tenant **Modular SaaS** POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Three roles: Platform Owner, Restaurant Admin, Staff. Revenue model: **0.3% commission on QR orders via Stripe Connect**.

## Modular Architecture (Apr 11, 2026)
Every capability is an independently toggleable module per restaurant:

| Layer | Details |
|---|---|
| **Core (Always On)** | Business Profile, Staff Management, PINs, Roles, Settings, Dashboard, Reports |
| **POS Module** | POS Screen, Cart, Orders, Cash Drawer, Receipts, Printers |
| **KDS Module** | Kitchen Display System (requires POS or QR) |
| **QR Ordering** | QR codes, Guest menu, Table ordering (requires POS for menu) |
| **Workforce** | Shifts/Rota, Clock In/Out, Timesheets, Payroll, Swap Requests |

**Feature Flags:** `Restaurant.features = {pos: bool, kds: bool, qr_ordering: bool, workforce: bool}`
**Enforcement:** `require_feature()` dependency on backend, `hasFeature()` on frontend
**JWT Embedded:** Features included in login token — zero extra DB calls for access checks
**Sidebar:** Enabled modules = normal nav, Disabled = greyed with lock icon + "Upgrade to Unlock" modal

## Code Architecture
```
/app/backend/
├── dependencies.py          # require_feature(), validate_feature_dependencies()
├── models.py                # RestaurantFeatures, updated Restaurant model
├── routers/
│   ├── auth.py              # Login returns features in JWT
│   ├── restaurants.py       # Feature toggle API (PUT /restaurants/{id}/features)
│   ├── shifts.py            # Workforce: CRUD + Copy Week + Publish
│   ├── attendance.py        # Workforce: Clock In/Out, Ghost shift detection
│   ├── timesheets.py        # Workforce: Scheduled vs Actual, Approve/Lock
│   ├── payroll.py           # Workforce: Gross Pay + Efficiency Ratio
│   └── swap_requests.py     # Workforce: Shift swap workflow

/app/frontend/src/
├── context/AuthContext.js    # hasFeature(), features in user state
├── components/Sidebar.js     # Dynamic sidebar with lock icons + upgrade modal
├── pages/
│   ├── ShiftScheduler.js     # Weekly shift grid
│   ├── AttendancePage.js     # Live clock-ins + history
│   ├── TimesheetsPage.js     # Timesheets + payroll summary
│   └── RestaurantManagement.js # Module toggle checkboxes
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
27. Daily Revenue Widget (today's total, cash/card progress bar, 7-day sparkline)
28. **Modular SaaS Architecture** (Feature flags per restaurant, dependency validation)
29. **Workforce Module Phase 1** (Shift Scheduler, Attendance, Timesheets, Payroll APIs + Manager UI)
30. **Dynamic Sidebar** (enabled = normal, disabled = lock icon + upgrade modal)
31. **Cross-talk Logic** (Efficiency Ratio visible when POS + Workforce both active)

## Upcoming (P0)
- Workforce Phase 2: Staff Companion PWA (Heva Ops) — My Shifts, Clock In/Out via PIN, Swap Requests
- Guard existing POS/KDS/QR routers with their respective require_feature() guards

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
