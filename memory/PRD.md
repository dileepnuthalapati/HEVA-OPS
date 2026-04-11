# HevaPOS - Product Requirements Document

## Overview
Multi-tenant **Modular SaaS** POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Three roles: Platform Owner, Restaurant Admin, Staff. Revenue model: **per-module monthly pricing + 0.3% commission on QR orders via Stripe Connect**.

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
**Backend Enforcement:** `require_feature()` and `require_any_feature()` dependencies on ALL module routers
**JWT Embedded:** Features included in login token — zero extra DB calls
**Sidebar:** Enabled = normal nav, Disabled = greyed with lock icon + "Upgrade to Unlock" modal showing module price
**Module Pricing:** Platform Owner sets per-module monthly prices via Platform Settings → shown in upgrade modal

## Two Frontends, One Backend
| Frontend | Who | Where |
|---|---|---|
| **HevaPOS Manager** | Admin/Manager | Tablet/Desktop — Full admin UI |
| **Heva Ops** (Staff Companion) | Staff | Mobile phone — `/heva-ops/*` — My Shifts, Clock In/Out, Swap Requests |

## Code Architecture
```
/app/backend/
├── dependencies.py          # require_feature(), require_any_feature(), validate_feature_dependencies()
├── models.py                # RestaurantFeatures, ModulePricing
├── routers/
│   ├── auth.py              # Login returns features in JWT
│   ├── restaurants.py       # Feature toggle API (PUT /restaurants/{id}/features)
│   ├── platform.py          # Module pricing CRUD (GET/PUT /platform/module-pricing)
│   ├── orders.py            # Guarded: require_any_feature("pos", "qr_ordering")
│   ├── menu.py              # Guarded: require_any_feature("pos", "qr_ordering")
│   ├── tables.py            # Guarded: require_any_feature("pos", "qr_ordering")
│   ├── cash_drawer.py       # Guarded: require_feature("pos")
│   ├── receipts.py          # Guarded: require_feature("pos")
│   ├── printers.py          # Guarded: require_feature("pos")
│   ├── kds.py               # Guarded: require_feature("kds")
│   ├── qr_menu.py           # Public endpoints check features.qr_ordering inline
│   ├── shifts.py            # Guarded: require_feature("workforce")
│   ├── attendance.py        # Guarded: require_feature("workforce")
│   ├── timesheets.py        # Guarded: require_feature("workforce")
│   ├── payroll.py           # Guarded: require_feature("workforce")
│   └── swap_requests.py     # Guarded: require_feature("workforce")

/app/frontend/src/
├── context/AuthContext.js    # hasFeature(), features in user state
├── components/Sidebar.js     # Dynamic sidebar with lock icons, upgrade modal with pricing
├── pages/
│   ├── HevaOpsLayout.js      # Staff companion shell (header + bottom tabs)
│   ├── StaffShifts.js        # My Shifts (2-week view)
│   ├── StaffClockIn.js       # Clock In/Out (live clock, PIN pad, auto-submit)
│   ├── StaffSwapRequests.js  # Request/view shift swaps
│   ├── ShiftScheduler.js     # Manager: weekly shift grid
│   ├── AttendancePage.js     # Manager: live clock-ins + history
│   ├── TimesheetsPage.js     # Manager: timesheets + payroll summary
│   ├── PlatformSettings.js   # Module Pricing card (Platform Owner)
│   └── RestaurantManagement.js # Module toggle checkboxes (Platform Owner)
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
28. Modular SaaS Architecture (Feature flags, dependency validation, JWT embedding)
29. Feature Guards on ALL Module Routers (POS, KDS, QR, Workforce)
30. Workforce Module Phase 1 (Shift Scheduler, Attendance, Timesheets, Payroll APIs + Manager UI)
31. Dynamic Sidebar (enabled = normal, disabled = lock icon + upgrade modal with pricing)
32. Cross-talk Logic (Efficiency Ratio visible when POS + Workforce both active)
33. **Heva Ops Staff Companion PWA** (My Shifts, Clock In/Out PIN pad, Shift Swap Requests)
34. **Module Pricing System** (Platform Owner sets per-module monthly prices, shown in upgrade modals)

## Upcoming (P1)
- Daily email summary for restaurant admins
- Automated trial expiry email sequences (7d, 3d, 1d)

## Backlog (P2)
- Print Void Receipt to Kitchen
- Split monolithic server.py into modular routers
- Deliverect / Middleware API Integration
- iOS App Build Prep
- Self-service module upgrade (restaurant admin can enable modules and pay via Stripe)

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
