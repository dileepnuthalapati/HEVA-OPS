# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor for Android/iOS APK).

## User Roles
- **Platform Owner**: Manages restaurants, subscriptions, billing, emails
- **Restaurant Admin**: Manages menu, orders, staff, reports, printers
- **Staff User**: Takes orders, processes payments, prints receipts

## Architecture (Modularized - April 2, 2026)
```
/app/backend/
├── server.py           # Slim FastAPI entrypoint (~65 lines)
├── database.py         # MongoDB connection
├── models.py           # All Pydantic models
├── dependencies.py     # Auth helpers (JWT, password hashing)
├── routers/
│   ├── auth.py         # Login, register, change-password
│   ├── platform.py     # Platform admin CRUD
│   ├── restaurants.py  # Restaurant CRUD + settings
│   ├── menu.py         # Categories + Products CRUD
│   ├── orders.py       # Order CRUD + sync
│   ├── reports.py      # Reports + stats (2AM business day)
│   ├── receipts.py     # PDF + ESC/POS receipt generation
│   ├── cash_drawer.py  # Cash drawer management
│   ├── printers.py     # Printer CRUD + TCP discovery + auto-detect subnet + default printer
│   ├── tables.py       # Table management + merge/split
│   ├── reservations.py # Reservation CRUD
│   ├── subscriptions.py# Stripe + subscription management
│   ├── notifications.py# Notification CRUD
│   ├── staff.py        # Staff management
│   ├── health.py       # Root, status, seed
│   └── email.py        # Resend email (welcome, trial, payment reminders)
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
- [x] Bluetooth printer support (Capacitor BLE plugin)
- [x] Dynamic currency (removed hardcoded $)
- [x] Staff Management UI
- [x] Subscription management + Stripe integration
- [x] Offline detection on login
- [x] Admin/Staff order syncing
- [x] Backend modularization (15 routers) - April 2, 2026
- [x] Email service (Resend) - platform owner only - April 2, 2026
- [x] **Print execution pipeline fixed** - April 2, 2026
  - WiFi printers: ESC/POS sent via backend TCP proxy (/api/printer/send)
  - BLE printers: ESC/POS sent via Capacitor BLE plugin (native APK)
  - POS Screen: Kitchen + Customer receipts now auto-print to default printer
  - Test Print button: Actually sends data to printer, shows success/failure status
  - Default printer API endpoint: GET /api/printers/default
  - Customer receipt uses dynamic currency (no more hardcoded $)

## In Progress
- [ ] Email: RESEND_API_KEY needs to be added to Railway env vars
- [ ] Stripe: Waiting for user's real Stripe key

## Upcoming (P1)
- [ ] Kitchen Display System (KDS) views
- [ ] Revenue analytics dashboard with charts

## Future (P2)
- [ ] Deliverect / Middleware API Integration (UberEats, Deliveroo)
- [ ] iOS App Build Prep
- [ ] Bluetooth Classic (SPP) support for older printers

## Print Architecture
```
WiFi Flow:   POS Screen → /api/print/kitchen/{id} → ESC/POS base64 → /api/printer/send → TCP socket → Printer
BLE Flow:    POS Screen → /api/print/kitchen/{id} → ESC/POS base64 → Capacitor BLE → Printer
Test Flow:   PrinterSettings → /api/printers/{id}/test → ESC/POS + TCP attempt → Result
Note: WiFi printing requires backend to have network access to printer IP.
      For cloud-hosted backend (Railway), printer must be on same network or use BLE.
```

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, Capacitor
- Backend: FastAPI, Motor (async MongoDB)
- Database: MongoDB Atlas
- Email: Resend (free tier: 100 emails/day)
- Payments: Stripe
- Hardware: ESC/POS printers (WiFi TCP + Bluetooth BLE)
