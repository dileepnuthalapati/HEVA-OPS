# HevaPOS - Product Requirements Document

## Original Problem Statement
Build a multi-tenant SaaS POS system called "HevaPOS" with:
- Cloud-based backend (FastAPI) and DB (MongoDB Atlas) for real-time multi-device syncing
- Android APK capability for tablets/phones via Capacitor
- Three user roles: Platform Owner, Restaurant Admin, Staff
- Full POS functionality: cart, discounts, order notes, cash/card split payments, receipt printing
- Customization per tenant (currency, receipt details, tables, menus)

## User Personas
1. **Platform Owner**: Manages all restaurants, global settings, user creation
2. **Restaurant Admin**: Manages single restaurant's dashboard, settings, POS operations
3. **Staff User**: Access only to dedicated POS screen for taking orders

## Technical Architecture

### Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, Capacitor
- **Backend**: FastAPI, Motor (async MongoDB)
- **Database**: MongoDB Atlas (Production), Local MongoDB (Development)
- **Hosting**: Railway (Backend)

### Key Files
- `/app/backend/server.py` - Monolithic API (~2400 lines)
- `/app/frontend/src/pages/POSScreen.js` - Main POS UI
- `/app/frontend/src/pages/PrinterSettings.js` - Consolidated printer management
- `/app/frontend/src/pages/OrderHistory.js` - Orders list with Reprint Receipt
- `/app/frontend/src/components/Sidebar.js` - Role-based nav, mobile hamburger sheet
- `/app/frontend/src/index.css` - Minimal global styles, pos-screen responsive rules

### Database Schema
- `restaurants`: {id, business_info, currency, users}
- `users`: {id, username, role, restaurant_id}
- `orders`: {notes, discount, payment_details, status, items}
- `tables`, `printers`, `reservations`

### Key API Endpoints
- `GET /api/dashboard/today` - Today's stats
- `GET /api/orders` - List all orders
- `POST /api/orders/{order_id}/cancel` - Cancel order
- `POST /api/orders/{order_id}/print-customer-receipt` - Reprint receipt
- `PUT /api/auth/password` - Change password

---

## Implementation Status

### Completed Features
- [x] JWT Authentication with role-based access
- [x] Restaurant Management (CRUD)
- [x] Table Management (CRUD + status tracking)
- [x] Printer Management - consolidated to PrinterSettings page
- [x] POS Screen (text-only layout, no images, compact cart)
- [x] Product Search, Custom Items, Categories
- [x] Split Payments, Discounts, Order Notes
- [x] Kitchen & Customer Receipt generation
- [x] Dynamic Currency Symbols
- [x] Railway Deployment, Capacitor Config
- [x] **Full Mobile Responsiveness** (all screen sizes: 320px → 1920px+)
  - Sidebar hidden on mobile with hamburger Sheet menu (all items visible)
  - Fixed mobile header with username + menu toggle
  - flex-col/flex-row layout switching via Tailwind md: breakpoint
  - Responsive headings (text-2xl → text-4xl), padding (p-4 → p-8)
  - POS compact header, scrollable categories, 2-col product grid on mobile
  - Cart stacks below products on mobile (40vh max)
- [x] **Reprint Receipt** button on Orders page (printer icon + download)
- [x] **Dashboard Total Orders clickable** → navigates to /orders
- [x] Printer setup removed from POS & RestaurantSettings (only in /printers)
- [x] Orders API resilient to legacy data formats (Optional defaults on model)

### Upcoming Tasks (P0)
- [ ] Bluetooth Printer Discovery fix for Android APK (Capacitor plugin)

### Upcoming Tasks (P1)
- [ ] Subscription Management (trial → active/suspended lifecycle)
- [ ] Email Notifications (trial expiry alerts)

### Future Tasks (P2)
- [ ] Payment Gateway Integration (Stripe/Square/Razorpay)
- [ ] Revenue Dashboard for Platform Owner
- [ ] Kitchen Display System (KDS)
- [ ] iOS App Build Prep

### Backlog
- [ ] Backend refactoring (split server.py ~2400 lines into routers)
- [ ] POSScreen.js split into sub-components (~1350 lines)

---

## Test Credentials
- Platform Owner: `platform_owner` / `admin123`
- Restaurant Admin: `restaurant_admin` / `admin123`
- Staff User: `user` / `user123`

## Deployment Notes
- Backend on Railway requires `PORT` env var
- MongoDB Atlas requires IP whitelist
- APK built locally via Capacitor
- User syncs to GitHub for Railway auto-deploy
