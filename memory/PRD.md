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

## Core Requirements
- Multi-tenant data isolation per restaurant
- Role-based access control with dedicated layouts/navigation
- Table management with status tracking
- Printer management (WiFi/Bluetooth ESC/POS)
- Basic reservations system
- Advanced payment options (split bills, multiple payment methods)
- Dynamic currency based on restaurant settings

---

## Implementation Status

### Completed Features (as of March 2026)
- [x] User Authentication (JWT-based)
- [x] Restaurant Management (CRUD)
- [x] Role-based architecture (shared Sidebar component)
- [x] Table Management (CRUD + status tracking)
- [x] Printer Management (WiFi/Bluetooth)
- [x] Basic Reservations
- [x] Table Selection in POS
- [x] User Creation by Platform Owner
- [x] Kitchen & Customer Receipt Printing
- [x] Split Bill functionality
- [x] Clear Table on Payment
- [x] Discounts/Coupons on orders
- [x] Order Notes for kitchen
- [x] Multiple Payment Methods (cash + card split)
- [x] Edit Pending Orders
- [x] Dynamic Currency Symbols
- [x] Railway Deployment (Backend)
- [x] Capacitor Configuration (APK)
- [x] White-labeling (Emergent badge removed)

### In Progress
- None

### Upcoming Tasks (P1)
- [ ] Subscription Management (trial → active/suspended logic)
- [ ] Email Notifications (trial expiry alerts)

### Future Tasks (P2)
- [ ] Revenue Dashboard for Platform Owner
- [ ] Payment Gateway Integration (Stripe/Square/Razorpay)
- [ ] Kitchen Display System (KDS)

### Backlog
- [ ] Backend refactoring (server.py split into routers)

---

## Technical Architecture

### Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, Capacitor
- **Backend**: FastAPI, Motor (async MongoDB)
- **Database**: MongoDB Atlas (Production), Local MongoDB (Development)
- **Hosting**: Railway (Backend)

### Key Files
- `/app/backend/server.py` - Monolithic API (~2100 lines)
- `/app/frontend/src/pages/POSScreen.js` - Main POS UI
- `/app/frontend/src/components/Sidebar.js` - Role-based navigation
- `/app/frontend/capacitor.config.json` - APK configuration

### Database Schema
- `restaurants`: {id, business_info, currency, users}
- `users`: {id, username, role, restaurant_id}
- `orders`: {notes, discount, payment_details, status}
- `tables`, `printers`, `reservations`

### Key API Endpoints
- `GET /` - Healthcheck (Railway)
- `PUT /api/restaurants/my/settings` - Update tenant settings
- `PUT /api/orders/{order_id}` - Edit pending order
- `PUT /api/orders/{order_id}/complete` - Complete with split payments

---

## Test Credentials
- Platform Owner: `platform_owner` / `admin123`
- Restaurant Admin: `restaurant_admin` / `admin123`
- Staff User: `user` / `user123`

## Deployment Notes
- Backend on Railway requires `PORT` environment variable (dynamic binding)
- MongoDB Atlas requires IP whitelist (currently `0.0.0.0/0`)
- APK built locally by user using Capacitor
- User syncs code to GitHub for Railway auto-deployment
