# Heva One - Product Requirements Document

## Overview
Multi-tenant **Modular SaaS** business management system. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Three roles: Platform Owner, Business Admin, Staff. Revenue model: **per-module monthly pricing + 0.3% commission on QR orders via Stripe Connect**.

## Modular Architecture (Apr 11, 2026)
Every capability is an independently toggleable module per business:

| Layer | Details |
|---|---|
| **Core (Always On)** | Business Profile, Staff/User Management (inside Settings), PINs, Roles, Settings, Dashboard, Reports |
| **POS Module** | POS Screen, Cart, Orders, Cash Drawer, Receipts, Printers |
| **KDS Module** | Kitchen Display System (requires POS or QR) |
| **QR Ordering** | QR codes, Guest menu, Table ordering (requires POS for menu) |
| **Workforce** | Shifts/Rota, Clock In/Out, Timesheets, Payroll, Swap Requests |

**Feature Flags:** `Restaurant.features = {pos: bool, kds: bool, qr_ordering: bool, workforce: bool}`
**Backend Enforcement:** `require_feature()` and `require_any_feature()` dependencies on ALL module routers
**JWT Embedded:** Features included in login token — zero extra DB calls
**Sidebar:** Enabled = normal nav, Disabled = greyed with lock icon + "Upgrade to Unlock" modal showing module price
**Module Pricing:** Platform Owner sets per-module monthly prices via Platform Settings

## Two Frontends, One Backend
| Frontend | Who | Where |
|---|---|---|
| **Heva One Manager** | Admin/Manager | Tablet/Desktop — Full admin UI |
| **Heva Ops** (Staff Companion) | Staff | Mobile phone — `/heva-ops/*` — My Shifts, Clock In/Out, Swap Requests |

## Code Architecture
```
/app/backend/
├── dependencies.py          # require_feature(), require_any_feature(), validate_feature_dependencies()
├── models.py                # RestaurantFeatures, ModulePricing
├── routers/
│   ├── auth.py              # Login returns features in JWT, PIN login with smart routing
│   ├── restaurants.py       # Feature toggle API
│   ├── platform.py          # Module pricing CRUD
│   ├── orders.py            # Guarded: require_any_feature("pos", "qr_ordering")
│   ├── menu.py              # Guarded: require_any_feature("pos", "qr_ordering")
│   ├── tables.py            # Guarded: require_any_feature("pos", "qr_ordering")
│   ├── cash_drawer.py       # Guarded: require_feature("pos")
│   ├── receipts.py          # Guarded: require_feature("pos")
│   ├── printers.py          # Guarded: require_feature("pos")
│   ├── kds.py               # Guarded: require_feature("kds")
│   ├── qr_menu.py           # Public endpoints check features inline
│   ├── shifts.py            # Guarded: require_feature("workforce")
│   ├── attendance.py        # Guarded: require_feature("workforce") + dashboard-stats endpoint
│   ├── timesheets.py        # Guarded: require_feature("workforce")
│   ├── payroll.py           # Guarded: require_feature("workforce")
│   └── swap_requests.py     # Guarded: require_feature("workforce")

/app/frontend/src/
├── context/AuthContext.js    # hasFeature(), features in user state
├── components/
│   ├── Sidebar.js           # Dynamic sidebar: module-aware, no Staff item, conditional Reports/Audit
│   ├── FloatingClockButton.js  # Whitelist: only on /dashboard, /settings, /workforce/*
├── pages/
│   ├── Login.js             # PIN default, password fallback, smart routing by features
│   ├── AdminDashboard.js    # Adaptive: Workforce widgets + POS widgets based on features
│   ├── RestaurantSettings.js # "Settings" (renamed), tabs: Business, Stripe, Users, Security
│   ├── HevaOpsLayout.js     # Staff companion shell
│   ├── StaffShifts.js, StaffClockIn.js, StaffSwapRequests.js
│   ├── ShiftScheduler.js, AttendancePage.js, TimesheetsPage.js
│   ├── PlatformSettings.js, RestaurantManagement.js
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
10. Staff Management UI (CRUD, password reset, POS PIN set/remove) — now inside Settings
11. Security tab with Manager PIN setup UI
12. Offline authentication (cached credential fallback)
13. Multi-currency business creation with auto-seeded categories
14. Cash Drawer (staff + admin access, business-scoped)
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
34. **Module Pricing System** (Platform Owner sets per-module monthly prices)
35. **Module-Aware UX Overhaul (Apr 11, 2026)**:
    - Removed redundant Staff sidebar item (moved to Settings → User Management)
    - Settings page renamed from "Restaurant Settings" to "Settings"
    - Audit Log + Reports hidden when no POS/KDS/QR modules active
    - Smart login routing: PIN default, features-based redirect (workforce→heva-ops, pos→pos)
    - Adaptive Dashboard: Workforce widgets (Team, On Shift, Scheduled, Hours) + POS widgets
    - Floating Clock-In button whitelist (only on dashboard, settings, workforce pages)
    - "Business" label in sidebar (not "Restaurant")

## Upcoming (P1)
- Daily email summary for business admins
- Automated trial expiry email sequences (7d, 3d, 1d)

## Backlog (P2)
- Print Void Receipt to Kitchen
- Split monolithic server.py into modular routers
- Deliverect / Middleware API Integration
- iOS App Build Prep
- Self-service module upgrade (business admin can enable modules and pay via Stripe)

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
