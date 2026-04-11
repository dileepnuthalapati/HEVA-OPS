# Heva One - Product Requirements Document

## Overview
Multi-tenant **Modular SaaS** business management system. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Revenue model: **per-module monthly pricing + 0.3% commission on QR orders via Stripe Connect**.

## Universal App Architecture (Apr 11, 2026)
ONE app (Capacitor), TWO device modes — "Split-Brain" routing:

| Mode | Device | Boot Screen | Experience |
|---|---|---|---|
| **Terminal (Kiosk)** | Store tablet | PIN Pad | Staff enter PIN → POS or Clock-In toast |
| **Personal** | Staff phone | Email + Password | Heva Ops workspace (shifts, clock-in, swaps) |

**Device Registration:** Admin → Settings → Security → "Register as POS Terminal" → stores `device_mode` in localStorage → app boots to PIN Pad.
**Unregister:** Admin gear icon on PIN pad → Manager PIN → clears registration.

## Staff Capabilities System
Each staff member has a `capabilities` array:
- `pos.access` — Take orders on POS terminal
- `kds.access` — View kitchen display
- `workforce.clock_in` — Clock in/out of shifts
- `workforce.manage_rota` — Create and edit shift schedules

Capabilities shown in admin UI are **filtered by active business modules**. A workforce-only business only shows workforce capabilities.

**Terminal PIN Routing:**
- PIN → check capabilities → `pos.access` → POS screen
- PIN → check capabilities → `workforce.clock_in` only → clock in toast → 3s auto-reset to PIN pad

## Attendance Entry Source
Every clock-in/out record includes `entry_source`:
- `"mobile_app"` — via personal phone (Heva Ops or floating button) — 10m geofence enforced
- `"pos_terminal"` — via shared terminal PIN pad — no geofence (device is at the business)

## Modular Architecture
Every capability is an independently toggleable module per business:

| Layer | Details |
|---|---|
| **Core (Always On)** | Business Profile, Staff/User Management, PINs, Roles, Settings, Dashboard |
| **POS Module** | POS Screen, Cart, Orders, Cash Drawer, Receipts, Printers |
| **KDS Module** | Kitchen Display System |
| **QR Ordering** | QR codes, Guest menu, Table ordering |
| **Workforce** | Shifts/Rota, Clock In/Out, Timesheets, Payroll, Swap Requests |

## Code Architecture
```
/app/backend/
├── dependencies.py          # require_feature(), validate_feature_dependencies()
├── models.py                # StaffCreate with email + capabilities
├── routers/
│   ├── auth.py              # Email/username login, PIN login, verify-manager-pin
│   ├── staff.py             # CRUD with email + capabilities
│   ├── attendance.py        # Clock with entry_source, geofence bypass for terminal
│   ├── shifts.py, timesheets.py, payroll.py, swap_requests.py
│   ├── orders.py, menu.py, tables.py, cash_drawer.py, receipts.py, printers.py
│   ├── kds.py, qr_menu.py, restaurants.py, platform.py

/app/frontend/src/
├── context/AuthContext.js    # hasFeature(), hasCapability(), isTerminalMode
├── pages/
│   ├── Login.js             # Personal Mode: email + password only
│   ├── TerminalPinScreen.js # Kiosk Mode: PIN pad, auto-reset, admin unregister
│   ├── AdminDashboard.js    # Adaptive: Workforce + POS widgets
│   ├── RestaurantSettings.js # Settings: staff email+capabilities, terminal registration
│   ├── HevaOpsLayout.js     # Staff companion mobile layout
│   ├── StaffShifts.js, StaffClockIn.js, StaffSwapRequests.js
│   ├── ShiftScheduler.js, AttendancePage.js, TimesheetsPage.js
│   ├── POSScreen.js         # Full-screen POS, 'Lock' button in terminal mode
```

## All Completed Features
1. Core POS (cart, discounts, split payments, offline mode)
2. ESC/POS Receipt Generation + Kitchen Ticket Printing
3. QR Table Ordering (public guest menu, WebSocket push)
4. Stripe Connect Pay-at-Table (hybrid 0.3% QR / 0% POS)
5. Kitchen Display System (1080p, keyboard shortcuts)
6. Void/Audit System (quick-tap reasons, Manager PIN)
7. Revenue Analytics Dashboard + Kitchen Efficiency widget
8. Menu Management (consolidated categories + products)
9. Report PDF Export (server-generated reportlab)
10. Staff Management (CRUD, email, capabilities, password reset, POS PIN)
11. Security tab with Manager PIN + Device Registration
12. Offline authentication (cached credential fallback)
13. Multi-currency business creation with auto-seeded categories
14. Cash Drawer (staff + admin access, business-scoped)
15. Table management with QR hash generation
16. Order Sequencing daily reset (atomic counter, race-condition safe)
17. Multi-tenancy security (strict restaurant_id scoping)
18. Design System Overhaul (Modern Utility)
19. Cmd+K Global Command Search
20. Standalone QR Menu HTML + KDS Monitor HTML
21. Quick POS PIN Login (4-digit, auto-submit)
22. Daily Revenue Widget (sparkline, cash/card breakdown)
23. Modular SaaS Architecture (Feature flags, dependency validation, JWT embedding)
24. Feature Guards on ALL Module Routers
25. Workforce Module (Shift Scheduler, Attendance, Timesheets, Payroll, Swaps)
26. Dynamic Sidebar (enabled = normal, disabled = lock + upgrade modal)
27. Heva Ops Staff Companion PWA (My Shifts, Clock In/Out, Swap Requests)
28. Module Pricing System (Platform Owner sets per-module prices)
29. Module-Aware UX (conditional Reports/Audit, adaptive Dashboard, smart routing)
30. **Universal App Architecture — Split-Brain Routing (Apr 11, 2026)**
    - Terminal Mode (Kiosk PIN Pad) for shared business tablets
    - Personal Mode (Email + Password) for staff phones → Heva Ops
    - Staff Capabilities system (pos.access, kds.access, workforce.clock_in, workforce.manage_rota)
    - Device Registration in Settings > Security (Manager PIN protected)
    - Attendance entry_source tracking (mobile_app vs pos_terminal)
    - Geofencing bypassed for pos_terminal clock-ins (device is physically at business)
    - POS "Lock" button in terminal mode (returns to PIN pad)
    - Staff form: email (required) + capabilities checkboxes filtered by active modules

## Upcoming (P1)
- Automated daily email summary for business admins
- Automated trial expiry email sequences (7d, 3d, 1d)

## Backlog (P2)
- Print Void Receipt to Kitchen
- Split monolithic server.py into modular routers
- Deliverect / Middleware API Integration
- iOS App Build Prep
- Self-service module upgrade (Stripe-powered)

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
- [ ] Add real emails to existing staff accounts
