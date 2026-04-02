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
- `/app/frontend/src/pages/POSScreen.js` - POS with pending + completed orders, mobile cart Sheet
- `/app/frontend/src/pages/SubscriptionManagement.js` - Subscription lifecycle + Stripe Billing
- `/app/frontend/src/pages/OrderHistory.js` - Today's orders (2AM business day reset)
- `/app/frontend/src/pages/RestaurantSettings.js` - 3-tab: Business Info, User Management, Password
- `/app/frontend/src/pages/PrinterSettings.js` - Printer config + WiFi multi-port + BT Discovery
- `/app/frontend/src/pages/Reports.js` - Quick ranges (Today/7d/30d/90d), Cash/Card, PDF blob download
- `/app/frontend/src/pages/Login.js` - Offline detection with live event listener + network error catch

### Database Schema
- `restaurants`: {id, business_info, currency, subscription_status, trial_ends_at}
- `users`: {id, username, role, restaurant_id, password/password_hash}
- `orders`: {notes, discount, payment_details, payment_method, status, items, total_amount, created_at}

---

## Completed Features
- [x] JWT Auth with role-based access (Platform Owner, Admin, Staff)
- [x] Full POS: cart, discounts, notes, split payments, custom items
- [x] Mobile cart as slide-out Sheet drawer
- [x] Full mobile responsiveness
- [x] Subscription Management lifecycle
- [x] Reprint Receipt button
- [x] Bluetooth + WiFi printer with ESC/POS
- [x] User Management UI (3-tab settings)
- [x] User CRUD + Reset passwords + Change own password
- [x] Stripe Billing Button
- [x] Global Currency (no hardcoded $)
- [x] Printer Discovery - WiFi multi-port (9100/515/631/80) + custom port + BLE native
- [x] Back Buttons on OrderHistory and Reports
- [x] Platform Dashboard mobile overflow fix
- [x] Password field consistency (both password/password_hash handled)
- [x] Fixed duplicate authAPI export
- [x] Cash/Card totals in Reports
- [x] **Offline Warning on Login** - Live listener + catch network errors on Sign In click
- [x] **Order History 2AM Reset** - defaults to today_only (no "2AM" text shown)
- [x] **Reports Quick Ranges** - Today/7d/30d/90d buttons restored
- [x] **PDF Download** - Uses doc.save() with data URI fallback for mobile
- [x] **Completed Orders on POS** - Staff can see today's completed orders below pending
- [x] POS $ icon replaced with Banknote
- [x] Staff API excludes passwords from responses

## Upcoming Tasks (P1)
- [ ] Stripe account connection (waiting for user's Stripe key)
- [ ] Email delivery integration (SendGrid/Resend)
- [ ] Kitchen Display System (KDS)

## Future Tasks (P2)
- [ ] Backend refactoring (split server.py into routers)
- [ ] Revenue Dashboard with charts
- [ ] iOS App Build Prep
- [ ] Deliverect/Middleware API

## Key API Endpoints
- `GET /api/orders?today_only=true` - Today's business day orders
- `GET /api/orders?from_date=X&to_date=Y` - Date range orders
- `GET /api/restaurant/staff` - List users (passwords excluded)
- `POST /api/restaurant/staff` - Create user
- `PUT /api/restaurant/staff/{id}` - Update user (password optional)
- `PUT /api/auth/change-password` - Change own password
- `GET /api/reports/today` - Today's stats (cash_total, card_total)
- `POST /api/stripe/create-checkout` - Stripe billing checkout
