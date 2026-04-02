# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor for Android/iOS APK).

## Completed Features
- [x] Full POS system (menu, orders, tables, reports, staff, subscriptions, email)
- [x] Dynamic currency support
- [x] Backend modularization (15 routers)
- [x] **Universal Printer Support**
  - Bluetooth Classic (SPP) + BLE + WiFi TCP
  - Static import for `@kduma-autoid/capacitor-bluetooth-printer`
  - Discovery: Paired devices first, named BLE only (no "Unknown Device" noise)
  - Duplicate print prevention (both UI-level isPrinting + service-level _printing lock)
  - Print button on pending orders (Print/Edit/Cancel/Pay grid)
  - Auto-prints don't show toast errors, manual prints do
  - Busy printer detection with WiFi recommendation for multi-device setups
  - Multi-device sharing tip in PrinterSettings help section

## Print Architecture
```
Pending Order Print: User taps Print → printOrderReceipt() → /api/print/kitchen/{id} → sendToPrinter()
Auto Kitchen Print:  Place Order → /api/print/kitchen/{id} → sendToPrinter('kitchen-auto')
Auto Customer Print: Complete Payment → /api/print/customer/{id} → sendToPrinter('customer-auto')
Reprint Receipt:     Completed order → Reprint button → /api/print/customer/{id} → sendToPrinter()

Bluetooth: Classic SPP first → BLE fallback → Error with WiFi recommendation
WiFi: Backend TCP proxy (/api/printer/send)
Multi-device: WiFi recommended (TCP supports multiple connections), BT is 1-to-1 only
```

## APK Build Steps
1. `cd frontend && yarn install && yarn build`
2. `npx cap sync android` ← Registers BluetoothPrinter native plugin
3. Open `android/` in Android Studio → Build Signed APK

## Upcoming
- P1: Kitchen Display System (KDS)
- P1: Revenue analytics dashboard
- P2: Deliverect API, iOS build prep

## Tech Stack
Frontend: React, Tailwind CSS, Shadcn UI, Capacitor
Backend: FastAPI, Motor (async MongoDB)
Printing: @kduma-autoid/capacitor-bluetooth-printer (Classic SPP), @capacitor-community/bluetooth-le (BLE)
