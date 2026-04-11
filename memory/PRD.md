# Heva One - Product Requirements Document

## Overview
Multi-tenant **Modular SaaS** business management system. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Revenue model: **per-module monthly pricing + 0.3% commission on QR orders via Stripe Connect**.

## Universal App Architecture (Apr 11, 2026)
ONE app (Capacitor), TWO device modes — "Split-Brain" routing:

| Mode | Device | Boot Screen | Experience |
|---|---|---|---|
| **Terminal (Kiosk)** | Store tablet | PIN Pad | Staff enter PIN → POS or Clock-In toast |
| **Personal** | Staff phone | Email + Password | Heva Ops workspace (shifts, clock-in, swaps) |

## Staff Capabilities System
Each staff member has a `capabilities` array:
- `pos.access` — Take orders on POS terminal
- `kds.access` — View kitchen display
- `workforce.clock_in` — Clock in/out of shifts
- `workforce.manage_rota` — Create and edit shift schedules

## Staff Onboarding (Apr 11, 2026)
When admin creates a staff member, a unique onboarding link is generated. Admin shares the link (copy/paste). Staff opens on their phone, sees business name + their role, and sets their own password + 4-digit PIN. Token invalidated after use.

**Flow:** Admin creates staff → "Staff Created" dialog with copyable onboarding URL → Staff opens link → Sets password + PIN → Success → Login

**Endpoints:**
- `GET /api/onboarding/{token}` — Public: returns staff info + business name
- `POST /api/onboarding/{token}/complete` — Public: staff sets password + PIN

## All Completed Features
1. Core POS (cart, discounts, split payments, offline mode)
2. ESC/POS Receipt Generation + Kitchen Ticket Printing
3. QR Table Ordering (public guest menu, WebSocket push)
4. Stripe Connect Pay-at-Table
5. Kitchen Display System (1080p, keyboard shortcuts)
6. Void/Audit System (quick-tap reasons, Manager PIN)
7. Revenue Analytics Dashboard + Kitchen Efficiency widget
8. Menu Management (consolidated categories + products)
9. Report PDF Export (server-generated reportlab)
10. Staff Management (CRUD, email, capabilities, PIN)
11. Security tab with Manager PIN + Device Registration
12. Offline authentication (cached credential fallback)
13. Multi-currency business creation
14. Cash Drawer, Table management, QR hash generation
15. Order Sequencing daily reset (atomic counter)
16. Multi-tenancy security (strict restaurant_id scoping)
17. Design System Overhaul (Modern Utility)
18. Modular SaaS Architecture (Feature flags, JWT embedding)
19. Workforce Module (Shifts, Attendance, Timesheets, Payroll, Swaps)
20. Heva Ops Staff Companion (My Shifts, Clock In/Out, Swap Requests)
21. Module Pricing System (Platform Owner configurable)
22. Module-Aware UX (conditional sidebar, adaptive dashboard)
23. Universal App Architecture — Split-Brain Routing
24. Staff Capabilities System (pos.access, kds.access, workforce.clock_in, workforce.manage_rota)
25. Attendance entry_source tracking (mobile_app vs pos_terminal)
26. **Staff Onboarding Link (Apr 11, 2026)** — Auto-generated setup URL, staff sets own password + PIN

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
