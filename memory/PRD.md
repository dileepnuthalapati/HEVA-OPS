# Heva One - Product Requirements Document

## Overview
Multi-tenant **Modular SaaS** business management system. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Revenue model: **per-module monthly pricing + 0.3% commission on QR orders via Stripe Connect**.

## Universal App Architecture
ONE app (Capacitor), TWO device modes — "Split-Brain" routing:

| Mode | Device | Boot Screen | Experience |
|---|---|---|---|
| **Terminal (Kiosk)** | Store tablet | PIN Pad | Staff enter PIN -> POS or Clock-In toast |
| **Personal** | Staff phone | Email + Password | Heva Ops workspace (shifts, clock-in, swaps) |

## Email System (Apr 12, 2026)
**Provider:** Resend (API key in .env)
**Sender:** `noreply@hetupathways.com` (domain verified)

**Endpoints:**
- `POST /api/email/test` — Send test email to current admin (requires auth)
- `POST /api/email/daily-summary/send` — Send yesterday's summary to current business admin
- `POST /api/email/daily-summary/send-all` — Platform owner sends to ALL businesses
- `POST /api/email/trial-reminders/send` — Platform owner triggers trial expiry checks (7d, 3d, 1d)

**Daily Summary includes:** Total revenue, order count, cash/card breakdown, avg order value, top 5 sellers, staff performance
**Trial Reminders:** Sent at 7, 3, 1, 0 days before `trial_end_date` on restaurant document

**For production:** Set up Railway cron job to call `/api/email/daily-summary/send-all` daily at 8 AM

## All Completed Features
1. Core POS (cart, discounts, split payments, offline mode)
2. ESC/POS Receipt + Kitchen Ticket Printing
3. QR Table Ordering (guest menu, WebSocket push)
4. Stripe Connect Pay-at-Table
5. Kitchen Display System
6. Void/Audit System (Manager PIN)
7. Revenue Analytics Dashboard
8. Menu Management + Report PDF Export
9. Staff Management (email, capabilities, PIN)
10. Security (Manager PIN, Device Registration)
11. Multi-currency, Multi-tenancy, Offline Auth
12. Modular SaaS Architecture (Feature flags, JWT embedding)
13. Workforce Module (Shifts, Attendance, Timesheets, Payroll, Swaps)
14. Heva Ops Staff Companion
15. Universal App — Split-Brain Routing
16. Staff Capabilities System
17. Staff Onboarding Link (self-service password + PIN setup)
18. Automated Email System (Apr 12, 2026) — Resend integration, daily summaries, trial reminders
19. **Pre-Launch Fixes (Apr 12, 2026)** — Pay types (hourly/monthly), strict 10m geofencing, onboarding link domain fix, Staff My Pay view
20. **One-Tap Clock-In (Apr 12, 2026)** — Personal devices use JWT auth for clock-in (no PIN), "Use My Current Location" button in Settings for easy geofence setup
21. **Smart Attendance Handling (Apr 12, 2026)** — 14-hour smart buffer (no more midnight auto-close), staff self-correction flow for ghost shifts, manager Pending Approvals dashboard widget, full audit trail (auto_close_time, staff_claimed_time, manager_approved_time)
22. **Shift Nudge Notifications (Apr 12, 2026)** — In-app notification bell in Heva Ops, background task checks every 30min for shifts >10h, creates "Still on shift?" nudge, staff can dismiss via dropdown
23. **Dashboard Cleanup (Apr 12, 2026)** — Removed outdated 7-day POS bar chart widget, simplified Today's Revenue card
24. **Native Push Notification Infrastructure (Apr 12, 2026)** — Firebase Admin SDK integration with graceful dry-run mode, device token registration/unregistration API, push sending on long shift nudges and ghost shifts, Capacitor push registration on login/teardown on logout. Firebase credentials LIVE.
25. **Staff Welcome Email (Apr 12, 2026)** — Auto-sends onboarding email via Resend when staff is created with email
26. **Shift Management Bug Fixes (Apr 12, 2026)** — Auto-select staff in shift dialog, double-tap prevention, Stripe tab hidden for workforce-only businesses
27. **Three-Way Handshake Swap (Apr 12, 2026)** — Staff A requests → eligible colleagues notified → Staff B accepts → Manager approves → shift auto-reassigns on rota
28. **Drop Shift Escalation (Apr 12, 2026)** — Staff drops with mandatory reason (Emergency/Sickness/Unresolved Swap) → Manager opens to marketplace OR directly reassigns → Sickness auto-logs to attendance/leave
29. **Open Shift Marketplace (Apr 12, 2026)** — Blast notification to all staff → first to claim gets the shift (no manager approval needed) → admin notified of claim

## Upcoming
- iOS App Build Prep (Capacitor config for iOS deployment)
- Add trial_end_date to business creation flow (auto 14-day trial)
- Add "Send Daily Summary" button in Admin Dashboard UI
- Background scheduler for automated daily email dispatch (Railway cron)

## Backlog (P2)
- Print Void Receipt to Kitchen
- Split monolithic server.py into modular routers
- Deliverect / Middleware API Integration
- Self-service module upgrade (Stripe-powered)

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
- [ ] Set up Railway cron for daily email dispatch
- [ ] Add real emails to all staff accounts
- [ ] Build iOS via Capacitor (upcoming)
- [ ] Add Firebase credentials (FIREBASE_CREDENTIALS_PATH) to enable native push notifications
- [ ] Upload APNs key in Firebase console for iOS push
