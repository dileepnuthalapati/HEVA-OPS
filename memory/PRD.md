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
30. **5 Bug Fixes (Apr 12, 2026)** — Swap visibility for admin colleagues (can_accept flag), duplicate shifts on copy (clears target week), week start day preference (Mon/Sun/Sat), cancel/delete swap requests, sick leave ghost in "Currently on Shift" (record_type + is_operational fields, "On Floor" vs "Unavailable" counts)
31. **6 More Fixes (Apr 13, 2026)** — Reject button for ghost shift adjustments, top 5 items sorted by revenue, "Shared Kiosk" generic naming, dashboard reorder (revenue first, workforce last), week_start_day API path fix, HevaPOS→Heva One branding across codebase
32. **Top Selling Toggle (Apr 14, 2026)** — Revenue vs Qty Sold toggle on dashboard Top Selling card, backend supports sort_top_by query param
33. **Leave & Availability System (Apr 14, 2026)** — Staff request time off (vacation/sick/personal/public_holiday), manager approve/decline on dashboard, recurring availability rules, scheduler overlay (hard block for approved leave, soft block for unavailability, pending leave warnings), overlapping leave detection
34. **Premium UI/UX Overhaul (Apr 14, 2026)** — Inter font, borderless inputs with bg fill, rounded-2xl cards with soft diffused shadows, gradient primary buttons with active:scale, softer dialog overlay, refined sidebar, off-white app background, tighter typography tracking
35. **Input Visibility & UI Polish (Apr 15, 2026)** — Fixed invisible text in inputs after CSS overhaul (text-slate-900, caret-indigo-600, placeholder:text-slate-400), Login page focus state fix (dark bg preserved on focus), Select/Textarea text colors harmonized, Skeleton loaders added to Dashboard/Scheduler/TimeOff
36. **Availability Delete + Partial-Day Display (Apr 15, 2026)** — Trash icon on each availability rule for quick deletion, Shift Scheduler shows specific hours (e.g. "Unavail: 09:00 - 13:00") for partial-day unavailability instead of generic "Unavailable"
37. **Username Space Validation (Apr 15, 2026)** — Frontend auto-strips spaces from username input, backend rejects usernames with spaces (400 error) in both /auth/register and /restaurant/staff endpoints
38. **Anti-Time Theft Protocol — Phase 1: Photo Audit (Apr 15, 2026)** — Terminal PIN pad silently captures front-camera 320x240 JPEG on clock-in/out, uploads async to Emergent Object Storage, links `photo_proof_path` to attendance record, Manager Timesheet shows "Proof" column with Camera icon + preview dialog, GDPR notice on terminal, 90-day retention cleanup endpoint
39. **Anti-Time Theft Protocol — Phase 2: Device Binding (Apr 15, 2026)** — Staff accounts bound to one phone (Hard Block), admins/platform_owner exempt, persistent device UUID via localStorage, login from different device returns 403 with user-friendly message, "Reset Device ID" (ShieldOff) button in Settings > User Management per staff, backend reset-device and device-status endpoints
40. **Anti-Time Theft Protocol — Phase 3: Biometric Infrastructure (Apr 15, 2026)** — Admin toggle "Require Biometric for Clock-In" in Settings > Security, backend enforces biometric_verified on clock-me when enabled, Capacitor BiometricAuth plugin integration (FaceID/TouchID), graceful web fallback, biometric badge on staff clock-in page, attendance records track biometric_verified, Photo Audit and Device Binding toggles in unified Anti-Time Theft security card
41. **3 Critical Bug Fixes (Apr 15, 2026)** — (1) Push notification permission crash: wrapped checkPermissions/requestPermissions/register in individual try/catch to prevent app crash on native devices. (2) Staff names not visible on mobile: responsive flex-col/flex-row layout in User Management. (3) Device binding now a TOGGLE (default OFF) in Settings > Security — users can login from multiple devices until admin enables binding. All existing device bindings cleared.
42. **Push Crash Root Fix + Ghost User Fix (Apr 16, 2026)** — (1) Push notifications now opt-in via PushPromptBanner shown in both staff (HevaOpsLayout) and admin (AdminDashboard) views. Banner only appears on native Capacitor devices. push.js pre-checks window.Capacitor.Plugins.PushNotifications before any native call. Login flow has ZERO push code. Settings > Security has manual fallback Enable button. (2) Staff deletion cascade-closes open attendance records (flag_reason=user_deleted). Dashboard filters deleted users from on-shift count. New admin endpoint POST /api/attendance/force-close-stale for orphan cleanup.
43. **Geofence Radius + Email Feedback (Apr 16, 2026)** — Geofence changed from hardcoded 10m to configurable per restaurant (default 50m). New "Geofence Radius" input in Settings > Business Info. Staff creation now returns email_status (sent/failed/skipped) with user-facing toast. Added "Resend Welcome Email" button (mail icon) per staff in User Management for admin to retry email delivery. Resend endpoint POST /api/restaurant/staff/{id}/resend-email.
44. **POS Critical Fixes (Apr 16, 2026)** — (1) Delta Printing: OrderItem has printed_to_kitchen flag, order updates print ONLY new items via generateDeltaKitchenReceipt(), PUT /api/orders/{id}/mark-printed marks items as printed. (2) Order Types: Takeaway/Eat In/Table selector in POS with icons, order_type on Order model, receipts show bold TAKEAWAY/EAT IN/TABLE header. (3) Receipt Text Overlap: Customer receipt uses 32-char monospaced formatLine() for proper price alignment. (4) Print Settings: 2 clean toggles (Kitchen Slip / Customer Receipt) moved to Printers page. Removed from Security tab. (5) Resend Email button for staff.
45. **Onboarding + Week Start + Reject + Auto-refresh (Apr 17, 2026)** — Fixed onboarding input focus (dark theme). TimesheetsPage reads week_start_day from restaurant settings. Reject button on timesheets sends back to employee. Dashboard auto-refresh 15s.
46. **Printer Fixes (Apr 17, 2026)** — (1) Discovery timeout 1.2s→2.5s, scans 3 ports (9100/515/631). (2) Quick Connect manual IP entry. Backend POST /api/printers/probe. (3) Print toggles now actually control POS printing. (4) 10s safety timer prevents stuck print state.
47. **Manager Workforce Enhancements (Apr 20, 2026)** — (1) **Configurable Overtime Alerts** on Admin Dashboard: per-restaurant `overtime_warn_hours` (default 40h) + `overtime_limit_hours` (default 48h UK WTD) saved in Settings > Business tab. Dashboard shows sorted alerts card with progress bar, over-limit red styling, includes hours from in-progress open shifts. Week range honors `week_start_day`. (2) **Bulk Mark Week Off** in Shift Scheduler: CalendarX icon on each staff row opens dialog (reason dropdown + note), POST /api/shifts/mark-week-off creates an auto-approved 7-day leave with `bulk_week_off: true` and deletes any existing shifts in that week. RotateCcw icon to undo; DELETE /api/shifts/clear-week-off removes only bulk leaves. Scheduler overlay shows hard-block across all 7 days. /api/scheduler/blocks now exposes `bulk_week_off` flag for frontend toggle. Route ordering ensures `/shifts/clear-week-off` is registered before `/shifts/{shift_id}` DELETE. (3) **Upcoming Shifts** for employees verified working (StaffShifts.js — next 14 days).
48. **Module Switcher Sidebar (Apr 21, 2026)** — Replaced flat 14-item sidebar with modern **Workspace Switcher** pattern (Stripe / Notion / Linear style). Admin sees a dropdown at the top of the sidebar with 3 workspaces: Point of Sale (POS Terminal · Orders · Menu · Tables · Cash Drawer · Printers · Reports · Audit Log), Kitchen Display (KDS), Workforce (Shift Scheduler · Attendance · Timesheets). Dashboard is pinned at the top of the nav list, Settings is pinned just above the user block at the bottom, Logout is the last item. URL navigation auto-switches the active workspace. Selection persists in localStorage (`heva_active_workspace`). Locked workspaces appear in the dropdown with upgrade CTA. Same behaviour on mobile drawer. Platform owner sidebar unchanged.
49. **POS Print Service Refactor (Apr 21, 2026)** — Extracted runtime print execution out of `POSScreen.js` into a dedicated service `/services/posPrintService.js` (183 lines). POSScreen.js now dropped from 1861 → 1786 lines and no longer imports `printerService`, `receiptGenerator`, or `getAuthToken` directly — it calls `posPrintService.{checkDefaultPrinterStatus, printKitchenTicket, printKitchenDelta, printCustomerReceipt, reprintKitchenTicket, sendToDefaultPrinter}` instead. Architecture clarified: PrinterSettings page = configuration; posPrintService = runtime execution; receiptGenerator = ESC/POS formatting; printer.js = low-level TCP/Capacitor transport. Concurrency lock (10s safety timeout) moved into the service. All 13 admin routes verified post-refactor via automated sidebar audit — zero JS errors on /pos.
50. **Contextual Dashboard Label + POS/KDS Edge-Hover Nav (Apr 21, 2026)** — (1) For workforce-only businesses, the sidebar's "Dashboard" link and the page H1 both render as **"Overview"** (AdminDashboard.js L222 + Sidebar.js dynamic label). Customers who never use POS no longer see POS-flavored language. (2) New `/components/POSEdgeNav.js` component — an 8px invisible hot-zone on the left edge of the full-screen POS and KDS pages slides out a premium mini-navigation panel on hover (desktop only, mobile keeps the existing top-bar Dashboard button). The panel auto-closes 200ms after the cursor leaves (grace period for diagonal cursor paths). Panel contents: Dashboard/Overview pin, current-workspace links, "Switch to" cross-workspace jumps with chevron, Settings, user profile, Logout. Keeps the kiosk UX immersive while giving desktop managers an escape hatch.
51. **Workspace Switcher Navigation + Employee Week-Day Fix (Apr 21, 2026)** — (1) Fixed `handleSelectWorkspace` in Sidebar.js: clicking a workspace in the dropdown now navigates to the first available link of that workspace (e.g. on /printers → click Workforce → lands on /workforce/shifts) instead of silently changing state. (2) Fixed employee week-day matching in `GET /api/attendance/my-summary`: backend was using Python `weekday()` (Mon=0..Sun=6) with JS-convention `week_start_day` (Sun=0, Mon=1, Sat=6) without converting — employees always saw a Monday-start week. Now applies `py_week_start = (week_start_day - 1) % 7`. (3) Also reordered `StaffTimeOff.js` DAYS_OF_WEEK (for recurring availability form) to honor week_start_day — was hardcoded Monday-first. Verified live via browser test: admin sets Sunday → staff pay view shows Sun 19 → Sat 25 ✓, recurring availability dropdown starts with Sunday ✓.

## Upcoming
- Customer Order Board ("Digital Display" on TV via /display/{venue_id} — real-time order status via Socket.io)
- Annual leave balance tracking & year-end report logic
- iOS App Build Prep (Capacitor config for iOS deployment)
- Add trial_end_date to business creation flow (auto 14-day trial)
- Add "Send Daily Summary" button in Admin Dashboard UI
- Background scheduler for automated daily email dispatch (Railway cron)

## Backlog (P2)
- Print Void Receipt to Kitchen
- Split monolithic server.py into modular routers
- Deliverect / Middleware API Integration
- Self-service module upgrade (Stripe-powered)
- **"Preview as role" impersonation** on platform owner dashboard — generate a short-lived JWT for a chosen business_admin/staff user so support can debug customer issues without knowing their password (standard SaaS practice à la Stripe/Intercom)
- Keyboard shortcuts ⌘1/⌘2/⌘3 for workspace switching
- One-time onboarding tooltip for POS edge-hover nav ("Hover the left edge for quick nav")
- Workspace badge next to Heva One logo on every page (e.g. `HevaOne · Workforce`) for clearer "where am I?" even in deep modals

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
