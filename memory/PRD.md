# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor Android APK).

## Architecture
```
/app/
├── backend/
│   ├── server.py          # FastAPI + Socket.IO ASGI app
│   ├── socket_manager.py  # Socket.IO server for real-time events
│   ├── database.py        # MongoDB connection
│   ├── dependencies.py    # Auth, JWT, role guards
│   ├── models.py          # Pydantic models
│   └── routers/
│       ├── auth.py, platform.py, restaurants.py, menu.py
│       ├── orders.py, reports.py, receipts.py, printers.py
│       ├── cash_drawer.py, tables.py, reservations.py
│       ├── subscriptions.py, notifications.py, staff.py
│       ├── health.py, email.py
│       └── qr_menu.py     # QR Table Ordering (public + admin)
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── POSScreen.js          # POS with WebSocket alerts + local receipt gen
    │   │   ├── GuestMenu.js          # QR Guest Menu (public, no auth)
    │   │   ├── AdminDashboard.js, Reports.js, etc.
    │   ├── services/
    │   │   ├── api.js                # Axios API client
    │   │   ├── printer.js            # Native printer service (BT/WiFi/BLE)
    │   │   ├── receiptGenerator.js   # JS ESC/POS receipt generator (offline)
    │   │   └── socket.js             # Socket.IO client
    │   └── components/ui/            # Shadcn UI components
    ├── capacitor.config.json
    └── package.json
```

## Print Architecture (Final)
```
3 Plugins + 1 JS Generator:
├── capacitor-tcp-socket          — WiFi TCP (direct tablet→printer)
├── @kduma-autoid/capacitor-bluetooth-printer — Classic BT SPP
├── @capacitor-community/bluetooth-le        — BLE fallback
└── receiptGenerator.js           — JS ESC/POS generation (OFFLINE)

Receipt Generation: Frontend JS (no backend dependency)
  - generateKitchenReceipt(order, businessInfo, tableInfo)
  - generateCustomerReceipt(order, businessInfo, tableInfo, currency)
  - generateTestReceipt(printer)
```

## Completed Features (as of April 3, 2026)
- Full POS system (menu, orders, tables, reports, staff, subscriptions, email)
- Dynamic currency, backend modularization (17 routers)
- Universal printer support (WiFi TCP + BT Classic + BLE)
- Direct WiFi TCP printing from tablet (no backend dependency)
- WiFi network scanner from tablet using TCP probing
- Duplicate print prevention (isPrinting + _printing lock)
- **Frontend ESC/POS Receipt Generation** (offline-capable, JS-based)
- **QR Table Ordering Guest Menu** (public URL, premium UI, cart + order)
- **Real-time WebSocket Alerts** (Socket.IO, beep/flash on POS for QR orders)
- **Safety Poll Fallback** (2-min polling for missed socket events)

## QR Table Ordering
- Public URL format: /menu/{restaurant_id}/{table_hash}
- No auth required for guests
- Auto-generated table QR hashes (secrets.token_urlsafe)
- Categories, products, cart, order placement
- Order confirmation with 3D golden cloche
- WebSocket notification to POS on order placement

## Upcoming
- P1: Stripe QR Pay-at-Table integration
- P1: Revenue Analytics Dashboard
- P1: Offline Mode Infrastructure (UUID orders, cached auth)

## Future/Backlog
- P2: Kitchen Display System (KDS) views
- P2: Deliverect / Middleware API Integration
- P2: iOS App Build Prep

## Key Credentials
- Platform Owner: platform_owner / admin123
- Restaurant Admin: restaurant_admin / admin123
- Staff User: user / user123
- QR Guest Menu: /menu/rest_demo_1/KrGTedTy (Table 1)
