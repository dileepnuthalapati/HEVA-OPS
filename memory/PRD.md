# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor for Android/iOS APK).

## User Roles
- **Platform Owner**: Manages restaurants, subscriptions, billing, emails
- **Restaurant Admin**: Manages menu, orders, staff, reports, printers
- **Staff User**: Takes orders, processes payments, prints receipts

## Architecture
```
/app/backend/routers/ — 15 modular FastAPI routers
/app/frontend/src/services/printer.js — Universal print service (Classic BT + BLE + WiFi)
/app/frontend/src/pages/PrinterSettings.js — Printer management UI
```

## Completed Features
- [x] Full POS system (menu, orders, tables, reports, staff, subscriptions)
- [x] Dynamic currency support
- [x] Backend modularization (15 routers)
- [x] Resend email integration
- [x] **Universal Printer Support (April 2, 2026)**
  - Bluetooth Classic (SPP): `@kduma-autoid/capacitor-bluetooth-printer` — STATIC import
  - Bluetooth LE: `@capacitor-community/bluetooth-le` — fallback
  - WiFi: Backend TCP proxy `/api/printer/send`
  - Strategy: Classic SPP first → BLE fallback → clear error with troubleshooting tips
  - Discovery: Shows PAIRED devices first (from Android BT settings), then named BLE devices only
  - BLE scan filters out unnamed "Unknown Device" entries
  - POS auto-prints kitchen/customer receipts to default printer
  - Test Print shows actual success/failure status

## Print Architecture
```
Bluetooth (APK):
  POS → backend generates ESC/POS → printer.js
    → Try Classic SPP (BluetoothPrinter.connectAndPrint) [Most printers]
    → Fall back to BLE (BleClient.write) [BLE-only printers]

WiFi:
  POS → backend generates ESC/POS → /api/printer/send → TCP → Printer
  Note: Backend must be on same network as printer

Discovery:
  1. BluetoothPrinter.list() → paired devices from Android Settings
  2. BleClient.requestLEScan() → only named nearby devices
```

## APK Build Steps
1. `cd frontend && yarn install && yarn build`
2. `npx cap sync android`  ← Registers BluetoothPrinter native plugin
3. Open `android/` in Android Studio → Build Signed APK

## Upcoming (P1)
- [ ] Kitchen Display System (KDS)
- [ ] Revenue analytics dashboard

## Future (P2)
- [ ] Deliverect / Middleware API
- [ ] iOS App Build Prep
- [ ] Direct TCP from APK for WiFi printing

## Tech Stack
Frontend: React, Tailwind CSS, Shadcn UI, Capacitor
Backend: FastAPI, Motor (async MongoDB)
Printing: @kduma-autoid/capacitor-bluetooth-printer (Classic SPP), @capacitor-community/bluetooth-le (BLE)
