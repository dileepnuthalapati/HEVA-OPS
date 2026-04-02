# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor Android APK).

## Print Architecture (Final — April 2, 2026)
```
3 Plugins Installed:
├── capacitor-tcp-socket          — WiFi TCP (direct tablet→printer, no backend)
├── @kduma-autoid/capacitor-bluetooth-printer — Classic BT SPP
└── @capacitor-community/bluetooth-le        — BLE fallback

WiFi (RECOMMENDED for multi-device):
  APK → TcpSocket.connect(IP:9100) → TcpSocket.send(base64) → Printer
  Browser → backend /api/printer/send → TCP proxy → Printer
  ✅ Multiple devices can share one WiFi printer simultaneously

Bluetooth Classic SPP (single device):
  APK → BluetoothPrinter.connectAndPrint(MAC, data) → Printer
  ⚠️ One device at a time (BT limitation)

BLE (fallback):
  APK → BleClient.connect(MAC) → BleClient.write(chunks) → Printer

Print Points in POS:
  1. Place Order → auto kitchen receipt
  2. Complete Payment → auto customer receipt
  3. Print button on pending orders → manual kitchen receipt
  4. Reprint button on completed orders → manual customer receipt
  5. Test Print in Printer Settings
```

## APK Build Steps
```bash
cd frontend && yarn install && yarn build
npx cap sync android    # Registers all 3 native plugins
# Open android/ in Android Studio → Build Signed APK
```

## Completed Features
- Full POS system (menu, orders, tables, reports, staff, subscriptions, email)
- Dynamic currency, backend modularization (15 routers)
- Universal printer support (WiFi TCP + BT Classic + BLE)
- Direct WiFi TCP printing from tablet (no backend dependency)
- WiFi network scanner from tablet using TCP probing
- Print button on pending orders
- Duplicate print prevention (isPrinting + _printing lock)
- Paired device discovery + named BLE only (no Unknown Device noise)
- Multi-device WiFi recommendation & busy-printer guidance

## Upcoming
- P1: Kitchen Display System (KDS)
- P1: Revenue analytics dashboard
- P2: Deliverect API, iOS build prep
