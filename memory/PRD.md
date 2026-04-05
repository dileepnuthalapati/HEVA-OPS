# HevaPOS - Product Requirements Document

## Overview
Multi-tenant SaaS POS system for restaurants. Cloud backend (FastAPI + MongoDB), mobile-first frontend (React + Capacitor APK). Three roles: Platform Owner, Restaurant Admin, Staff. Revenue model: **0.3% commission on QR orders via Stripe Connect**.

## Design System: "Modern Utility"
- **Color Palette**: Slate & Indigo (Admin), High-contrast Light Mode (POS)
- **Semantic Colors**: Emerald=success/payments, Indigo=navigation, Amber=warnings, Red=void/cancel
- **Typography**: Manrope (body), Satoshi (headings), JetBrains Mono (prices/numbers)
- **Buttons**: Rounded-2xl, haptic (scale-95 on press), shadow-lg on primary actions
- **Layout**: Z-pattern POS (Pay button bottom-right), pill-shaped categories
- **Effects**: Glassmorphism on login/modals, micro-animations, custom scrollbars
- **Global Search**: Cmd+K command palette with keyboard navigation

## Architecture
```
/app/backend/routers/ (auth, platform, restaurants, menu, orders, reports, payments, cash_drawer, kds, qr_menu, audit, docs, tables, reservations, receipts, printers, staff, subscriptions, notifications, email, health)
/app/frontend/src/ (pages, components, context, services)
```

## All Completed Features (Verified by Testing Agent - Iteration 24)
1. Core POS (cart, discounts, split payments, offline mode)
2. ESC/POS Receipt Generation + Kitchen Ticket Printing
3. QR Table Ordering (public guest menu, WebSocket push)
4. Stripe Connect Pay-at-Table (hybrid 0.3% QR / 0% POS)
5. Kitchen Display System (1080p, keyboard shortcuts, back button)
6. Void/Audit System (quick-tap reasons, Manager PIN)
7. Revenue Analytics Dashboard + Kitchen Efficiency widget
8. Menu Management (consolidated categories + products)
9. Report PDF Export (server-generated reportlab, actual file download - CONFIRMED WORKING)
10. Staff Management UI (CRUD, password reset)
11. Security tab with Manager PIN setup UI
12. Offline authentication (cached credential fallback)
13. Multi-currency restaurant creation with auto-seeded categories
14. Cash Drawer (staff + admin access, restaurant-scoped)
15. Table management with QR hash generation
16. Order Sequencing daily reset (restaurant-scoped)
17. Multi-tenancy security (strict restaurant_id scoping on all endpoints)
18. Design System Overhaul (Phase 1-3: Modern Utility)
19. Cmd+K Global Command Search

## Testing Status
- Backend: 90% (27/30 passed, 3 skipped due to rate limiting)
- Frontend: 100% (all UI tests passed)
- PDF Download: CONFIRMED WORKING
- Multi-tenancy: CONFIRMED WORKING
- All 3 user roles: CONFIRMED WORKING

## Upcoming (P1)
- Daily email summary for restaurant admins
- Automated trial expiry email sequences (7d, 3d, 1d)
- Quick POS PIN Login for staff shift changes
- Daily revenue widget on Admin Dashboard

## Backlog (P2)
- Deliverect / Middleware API Integration
- iOS App Build Prep

## Production Checklist
- [ ] Replace sk_test_emergent with real Stripe Platform key
- [ ] Configure STRIPE_WEBHOOK_SECRET
- [ ] Configure MongoDB Atlas connection string
- [ ] Deploy backend to Railway
- [ ] Build Android APK via Capacitor
