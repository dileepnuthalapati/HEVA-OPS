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
- `/app/frontend/src/pages/OrderHistory.js` - Today's orders (2AM reset) + Reprint + Back
- `/app/frontend/src/pages/RestaurantSettings.js` - 3-tab: Business Info, User Management, Password
- `/app/frontend/src/pages/PrinterSettings.js` - Printer config + WiFi/BT Discovery
- `/app/frontend/src/pages/Reports.js` - Quick ranges (Today/7d/30d/90d), Cash/Card totals, PDF export
- `/app/frontend/src/pages/Login.js` - Offline detection with live event listener
- `/app/frontend/src/services/api.js` - All API methods (auth, staff, stripe, orders w/ date params)

### Database Schema
- `restaurants`: {id, business_info, currency, subscription_status, trial_ends_at, subscription_plan, price}
- `users`: {id, username, role, restaurant_id, password/password_hash}
- `orders`: {notes, discount, payment_details, payment_method, status, items, total_amount, created_at}

---

## Completed Features
- [x] JWT Authentication with role-based access
- [x] Full POS: cart, discounts, notes, split payments, custom items
- [x] Mobile cart as slide-out Sheet drawer
- [x] Full mobile responsiveness (320px -> 1920px+)
- [x] Subscription Management (trial/active/suspended/cancelled lifecycle)
- [x] Reprint Receipt button on Orders page
- [x] Bluetooth + WiFi printer support with ESC/POS
- [x] **User Management UI** - 3-tab settings (Business Info, Users, Password)
- [x] **User CRUD** - Create/Edit/Delete users, Reset passwords
- [x] **Change Own Password** - Any user can change their password
- [x] **Stripe Billing Button** - Platform owner Stripe Checkout
- [x] **Global Currency** - Removed hardcoded $ from all Platform pages + backend
- [x] **PDF Export** - Fixed KeyError + blob URL download (mobile-compatible)
- [x] **Printer Discovery** - WiFi multi-port (9100/515/631/80) + custom port + BLE native
- [x] **Back Buttons** - OrderHistory and Reports pages
- [x] **Platform Dashboard Mobile** - Fixed horizontal overflow
- [x] **Password field consistency** - Backend handles both password/password_hash
- [x] **Fixed duplicate authAPI export** - Merged into single export
- [x] **Cash/Card Totals** - Reports show correct cash and card breakdown
- [x] **Offline Warning on Login** - Live online/offline event listener with WifiOff banner
- [x] **Order History 2AM Reset** - Defaults to today's business day (today_only param)
- [x] **Reports Quick Ranges** - Today, 7 Days, 30 Days, 90 Days buttons restored
- [x] **POS $ Icon Fix** - Replaced DollarSign with Banknote icon
- [x] **Staff Security** - Passwords excluded from API responses

## Upcoming Tasks (P1)
- [ ] Stripe account connection (waiting for user's Stripe key)
- [ ] Email delivery integration (SendGrid/Resend)
- [ ] Kitchen Display System (KDS)

## Future Tasks (P2)
- [ ] Backend refactoring (split server.py into routers)
- [ ] Revenue Dashboard for Platform Owner (charts/analytics)
- [ ] iOS App Build Prep
- [ ] Deliverect/Middleware API (UberEats, Deliveroo)

## Key API Endpoints
- `GET /api/orders?today_only=true` - Today's business day orders
- `GET /api/orders?from_date=X&to_date=Y` - Date range orders
- `GET /api/restaurant/staff` - List users (no passwords)
- `POST /api/restaurant/staff` - Create user
- `PUT /api/restaurant/staff/{id}` - Update user (password optional)
- `PUT /api/auth/change-password` - Change own password
- `GET /api/reports/today` - Today's stats (cash_total, card_total)
- `POST /api/stripe/create-checkout` - Stripe billing checkout
