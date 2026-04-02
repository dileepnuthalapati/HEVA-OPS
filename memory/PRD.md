# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor for Android/iOS APK).

## User Roles
- **Platform Owner**: Manages restaurants, subscriptions, billing, emails
- **Restaurant Admin**: Manages menu, orders, staff, reports, printers
- **Staff User**: Takes orders, processes payments, prints receipts

## Architecture (Modularized)
```
/app/backend/
├── server.py           # Slim FastAPI entrypoint
├── database.py         # MongoDB connection
├── models.py           # All Pydantic models
├── dependencies.py     # Auth helpers (JWT, password hashing)
├── routers/            # 15 modular routers
│   ├── auth.py, platform.py, restaurants.py, menu.py, orders.py
│   ├── reports.py, receipts.py, cash_drawer.py, printers.py, tables.py
│   ├── reservations.py, subscriptions.py, notifications.py, staff.py
│   ├── health.py, email.py
```

## Completed Features
- [x] Auth system (JWT, role-based access)
- [x] Menu management (Categories + Products CRUD)
- [x] Order management (Create, Edit, Complete, Cancel with reasons)
- [x] POS Screen (mobile-responsive, color-coded buttons)
- [x] Table management (CRUD, merge, split bill)
- [x] Reservation system
- [x] Cash drawer management
- [x] Reports with 2AM business day reset
- [x] PDF receipt generation (kitchen + customer)
- [x] ESC/POS thermal printer support
- [x] WiFi printer TCP discovery with auto-subnet detection
- [x] Dynamic currency (removed hardcoded $)
- [x] Staff Management UI
- [x] Subscription management + Stripe integration
- [x] Offline detection on login
- [x] Admin/Staff order syncing
- [x] Backend modularization (15 routers)
- [x] Email service (Resend) - platform owner only
- [x] **Universal Print Pipeline (April 2, 2026)**
  - Bluetooth Classic (SPP): @kduma-autoid/capacitor-bluetooth-printer
  - Bluetooth Low Energy (BLE): @capacitor-community/bluetooth-le
  - WiFi: Backend TCP proxy (/api/printer/send)
  - Strategy: Try Classic SPP first → Fall back to BLE → Error with guidance
  - Discovery: Shows paired BT devices + BLE scan results
  - POS Screen auto-prints kitchen/customer receipts to default printer
  - Test Print shows actual success/failure (no more raw base64 display)
  - Customer receipt uses dynamic currency symbol
  - API: GET /api/printers/default

## Print Architecture
```
Bluetooth (APK):
  POS → /api/print/kitchen/{id} → base64 ESC/POS → printer.js
    → Try Classic SPP (BluetoothPrinter.connectAndPrint)
    → Fall back to BLE (BleClient.write)
    → Printer receives data

WiFi:
  POS → /api/print/kitchen/{id} → base64 ESC/POS
    → /api/printer/send → backend TCP socket → Printer
  Note: Backend must be on same network as printer (not Railway)

Discovery:
  Bluetooth: BluetoothPrinter.list() (paired) + BleClient scan (nearby)
  WiFi: Backend TCP scanner on port 9100/515/631
```

## In Progress
- [ ] Email: RESEND_API_KEY needs to be added to Railway env vars
- [ ] Stripe: Waiting for user's real Stripe key

## Upcoming (P1)
- [ ] Kitchen Display System (KDS) views
- [ ] Revenue analytics dashboard with charts

## Future (P2)
- [ ] Deliverect / Middleware API Integration (UberEats, Deliveroo)
- [ ] iOS App Build Prep
- [ ] Direct TCP from APK for WiFi printing (capacitor-tcp-socket-manager)

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, Capacitor
- Backend: FastAPI, Motor (async MongoDB)
- Database: MongoDB Atlas
- Email: Resend
- Payments: Stripe
- Printing: 
  - Classic BT: @kduma-autoid/capacitor-bluetooth-printer (SPP)
  - BLE: @capacitor-community/bluetooth-le
  - WiFi: Raw TCP via backend proxy

## APK Build Steps (for user)
1. `cd frontend && yarn build`
2. `npx cap sync android`
3. Open `android/` in Android Studio
4. Build > Generate Signed APK
Note: `npx cap sync` will auto-register both BT plugins
