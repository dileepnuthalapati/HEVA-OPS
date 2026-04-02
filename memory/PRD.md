# HevaPOS - Product Requirements Document

## Original Problem Statement
Build a multi-tenant SaaS POS system called "HevaPOS" with cloud backend (FastAPI/MongoDB), Android APK (Capacitor), three user roles (Platform Owner, Restaurant Admin, Staff), and full POS functionality.

## Technical Architecture
- **Frontend**: React, Tailwind CSS, Shadcn UI, Capacitor, @capacitor-community/bluetooth-le
- **Backend**: FastAPI, Motor (async MongoDB)
- **Database**: MongoDB Atlas (Production), Local MongoDB (Dev)
- **Hosting**: Railway (Backend)

### Key Files
- `/app/backend/server.py` - API (~2600 lines)
- `/app/frontend/src/pages/POSScreen.js` - POS with mobile cart Sheet
- `/app/frontend/src/pages/SubscriptionManagement.js` - Subscription lifecycle
- `/app/frontend/src/pages/OrderHistory.js` - Orders + Reprint Receipt
- `/app/frontend/src/components/Sidebar.js` - Responsive nav + mobile sheet
- `/app/frontend/src/services/printer.js` - BLE native + Web Bluetooth
- `/app/frontend/src/index.css` - Minimal, responsive CSS

### Database Schema
- `restaurants`: {id, business_info, currency, subscription_status, trial_ends_at, subscription_plan, price}
- `users`: {id, username, role, restaurant_id}
- `orders`: {notes, discount, payment_details, status, items}
- `notifications`: {id, restaurant_id, type, message, email, status, created_at, sent_at}
- `tables`, `printers`, `reservations`

---

## Completed Features
- [x] JWT Authentication with role-based access
- [x] Full POS: cart, discounts, notes, split payments, custom items
- [x] Mobile cart as slide-out Sheet drawer (floating button trigger)
- [x] Desktop cart as always-visible right sidebar
- [x] Full mobile responsiveness (320px → 1920px+, all screen sizes)
- [x] Mobile hamburger sidebar with ALL menu items visible + logout
- [x] Subscription Management (trial/active/suspended/cancelled lifecycle)
- [x] Trial expiration checking + auto-suspend
- [x] Notifications system (pending/sent, platform owner dashboard)
- [x] Admin dashboard subscription banner (trial days warning)
- [x] Reprint Receipt button on Orders page
- [x] Dashboard Total Orders → click navigates to /orders
- [x] Bluetooth Printer: native BLE (@capacitor-community/bluetooth-le) + Web Bluetooth fallback
- [x] WiFi/Network printer support
- [x] OfflineIndicator only shows when offline (no "Online" badge blocking UI)
- [x] Toast notifications: bottom-right, 2s, non-intrusive
- [x] Printer setup consolidated to /printers page only
- [x] Orders API resilient to legacy data formats

## Upcoming Tasks (P1)
- [ ] Email delivery integration (SendGrid/Resend) for notification emails
- [ ] Payment Gateway Integration (Stripe/Square/Razorpay)

## Future Tasks (P2)
- [ ] Revenue Dashboard for Platform Owner (charts/analytics)
- [ ] Kitchen Display System (KDS)
- [ ] iOS App Build Prep
- [ ] Deliverect/Middleware API (UberEats, Deliveroo)

## Backlog
- [ ] Backend refactoring (split server.py into routers)
- [ ] POSScreen.js split into sub-components

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
- `GET /api/notifications/my` - Own notifications
- `PUT /api/notifications/{id}/mark-sent` - Mark as sent
- `GET /api/dashboard/today` - Today's stats
- `GET /api/orders` - All orders
- `POST /api/orders/{id}/print-customer-receipt` - Reprint receipt
