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
│   ├── printers.py     # Printer CRUD + TCP discovery + auto-detect subnet
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
  - Welcome emails on restaurant onboarding
  - Trial expiry reminders
  - Payment reminders
  - Email config status on Settings page

## In Progress
- [ ] Email: RESEND_API_KEY needs to be added to Railway env vars
- [ ] Stripe: Waiting for user's real Stripe key

## Upcoming (P1)
- [ ] Kitchen Display System (KDS) views
- [ ] Revenue analytics dashboard with charts

## Future (P2)
- [ ] Deliverect / Middleware API Integration (UberEats, Deliveroo)
- [ ] iOS App Build Prep
- [ ] BLE device search UI (native Capacitor)

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI, Capacitor
- Backend: FastAPI, Motor (async MongoDB)
- Database: MongoDB Atlas
- Email: Resend (free tier: 100 emails/day)
- Payments: Stripe
- Hardware: ESC/POS printers (WiFi TCP + Bluetooth)
