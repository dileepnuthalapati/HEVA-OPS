# HevaPOS - Product Requirements Document

## Original Problem Statement
Build a multi-tenant SaaS POS system called "HevaPOS" with cloud backend (FastAPI/MongoDB), Android APK (Capacitor), three user roles (Platform Owner, Restaurant Admin, Staff), and full POS functionality.

## Technical Architecture
- **Frontend**: React, Tailwind CSS, Shadcn UI, Capacitor, @capacitor-community/bluetooth-le
- **Backend**: FastAPI, Motor (async MongoDB)
- **Database**: MongoDB Atlas (Production), Local MongoDB (Dev)
- **Hosting**: Railway (Backend)

### Key Files
- `/app/backend/server.py` - API (~2700 lines)
- `/app/frontend/src/pages/POSScreen.js` - POS with mobile cart Sheet
- `/app/frontend/src/pages/SubscriptionManagement.js` - Subscription lifecycle + Stripe Billing
- `/app/frontend/src/pages/OrderHistory.js` - Orders + Reprint Receipt + Back button
- `/app/frontend/src/pages/RestaurantSettings.js` - 3-tab settings (Business Info, Staff Mgmt, Password)
- `/app/frontend/src/pages/PrinterSettings.js` - Printer config + WiFi/BT Discovery
- `/app/frontend/src/components/Sidebar.js` - Responsive nav + mobile sheet
- `/app/frontend/src/services/api.js` - All API methods (auth, staff, stripe, etc.)
- `/app/frontend/src/services/printer.js` - BLE native + Web Bluetooth

### Database Schema
- `restaurants`: {id, business_info, currency, subscription_status, trial_ends_at, subscription_plan, price}
- `users`: {id, username, role, restaurant_id, password/password_hash}
- `orders`: {notes, discount, payment_details, status, items, total_amount}
- `notifications`: {id, restaurant_id, type, message, email, status, created_at}
- `tables`, `printers`, `reservations`

---

## Completed Features
- [x] JWT Authentication with role-based access
- [x] Full POS: cart, discounts, notes, split payments, custom items
- [x] Mobile cart as slide-out Sheet drawer (floating button trigger)
- [x] Desktop cart as always-visible right sidebar
- [x] Full mobile responsiveness (320px -> 1920px+)
- [x] Mobile hamburger sidebar with ALL menu items visible + logout
- [x] Subscription Management (trial/active/suspended/cancelled lifecycle)
- [x] Trial expiration checking + auto-suspend
- [x] Notifications system (pending/sent, platform owner dashboard)
- [x] Admin dashboard subscription banner (trial days warning)
- [x] Reprint Receipt button on Orders page
- [x] Dashboard Total Orders -> click navigates to /orders
- [x] Bluetooth Printer: native BLE + Web Bluetooth fallback
- [x] WiFi/Network printer support
- [x] OfflineIndicator only shows when offline
- [x] Toast notifications: bottom-right, 2s, non-intrusive
- [x] Printer setup consolidated to /printers page only
- [x] Orders API resilient to legacy data formats
- [x] **Staff Management UI** - 3-tab settings (Business Info, Staff, Password)
- [x] **Staff CRUD** - Create/Edit/Delete staff, Reset passwords
- [x] **Change Own Password** - Any user can change their password
- [x] **Stripe Billing Button** - Platform owner can open Stripe Checkout
- [x] **Global Currency** - Removed hardcoded $/$ from Platform pages
- [x] **PDF Export** - Fixed KeyError in report generation endpoint
- [x] **Printer Discovery** - WiFi network scan + Bluetooth BLE discovery UI
- [x] **Back Buttons** - Added to OrderHistory and Reports pages
- [x] **Platform Dashboard Mobile** - Fixed horizontal overflow
- [x] **Password field consistency** - Backend handles both password/password_hash
- [x] **Fixed duplicate authAPI export** - Merged changePassword into single export

## Upcoming Tasks (P1)
- [ ] Email delivery integration (SendGrid/Resend) for notification emails
- [ ] Kitchen Display System (KDS)

## Future Tasks (P2)
- [ ] Backend refactoring (split server.py into routers)
- [ ] Revenue Dashboard for Platform Owner (charts/analytics)
- [ ] iOS App Build Prep
- [ ] Deliverect/Middleware API (UberEats, Deliveroo)
- [ ] POSScreen.js split into sub-components

## Backlog
- [ ] Full mDNS/Zeroconf native printer discovery (requires native plugin)

---

## Test Credentials
- Platform Owner: `platform_owner` / `admin123`
- Restaurant Admin: `restaurant_admin` / `admin123`
- Staff User: `user` / `user123`

## Key API Endpoints
- `GET /api/subscriptions` - List all (platform owner)
- `PUT /api/subscriptions/{id}` - Change status
- `GET /api/subscriptions/my` - Own subscription
- `POST /api/subscriptions/check-trials` - Check + auto-suspend expired
- `GET /api/notifications` - List notifications
- `PUT /api/notifications/{id}/mark-sent` - Mark as sent
- `GET /api/dashboard/today` - Today's stats
- `GET /api/orders` - All orders
- `POST /api/orders/{id}/print-customer-receipt` - Reprint receipt
- `GET /api/restaurant/staff` - List staff
- `POST /api/restaurant/staff` - Create staff
- `PUT /api/restaurant/staff/{id}` - Update staff
- `PUT /api/restaurant/staff/{id}/reset-password` - Reset staff password
- `DELETE /api/restaurant/staff/{id}` - Delete staff
- `PUT /api/auth/change-password` - Change own password
- `POST /api/stripe/create-checkout` - Stripe billing checkout
- `POST /api/reports/generate` - Generate PDF report
