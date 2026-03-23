# HevaPOS - Multi-Tenant Restaurant POS System

## Problem Statement
Build and deploy a multi-tenant restaurant POS (Point of Sale) system that allows:
- Platform Owners to manage multiple restaurants
- Restaurant Admins to manage their own restaurant operations
- Staff users to process orders via POS interface

## User Personas & Access Control

### 1. Platform Owner (role: `platform_owner`)
**Purpose**: Manages all restaurants on the platform
**Access**: `/platform/dashboard`, `/restaurants`, `/platform/categories`, `/platform/reports`, `/platform/settings`
**Credentials**: `platform_owner` / `admin123`
**Sidebar Menu**:
- Dashboard (platform metrics)
- Restaurants (onboard/manage restaurants)
- Global Categories (default categories for onboarding)
- Platform Reports (MRR, churn, conversions)
- Platform Settings (subscription defaults, Stripe config)

### 2. Restaurant Admin (role: `admin`)
**Purpose**: Manages their specific restaurant
**Access**: `/dashboard`, `/tables`, `/categories`, `/products`, `/pos`, `/orders`, `/reports`, `/cash-drawer`, `/printers`, `/settings`
**Credentials**: `restaurant_admin` / `admin123`
**Sidebar Menu**:
- Dashboard (restaurant sales metrics)
- Tables (table management, reservations)
- Categories (restaurant categories)
- Products (product management)
- POS (point of sale)
- Orders (order history)
- Reports (sales reports)
- Cash Drawer (cash management)
- Printers (ESC/POS printer config)
- Settings (restaurant settings)

### 3. Staff User (role: `user`)
**Purpose**: Operates the POS terminal only
**Access**: `/pos`, `/orders`
**Credentials**: `user` / `user123`
**UI**: Standalone POS view without sidebar (optimized for tablet/terminal use)

## Architecture

### Route Protection
- Platform Owner routes redirect to `/platform/dashboard` if wrong role
- Restaurant Admin routes redirect away if platform_owner or staff
- POS routes accessible to all authenticated users

### Shared Components
- `/app/frontend/src/components/Sidebar.js` - Role-based navigation component
- Menus dynamically generated based on user role

## Core Features

### Authentication ✅
- [x] JWT-based authentication
- [x] Role-based access control (platform_owner, admin, user)
- [x] Password hashing with bcrypt

### Multi-Tenancy ✅
- [x] Platform Owner role separate from Restaurant Admin
- [x] Restaurant-specific data isolation
- [x] Custom subscription pricing per restaurant

### Table Management ✅ (March 2026)
- [x] Simple numbered tables with capacity
- [x] Table status tracking (available, occupied, reserved, merged)
- [x] Merge/unmerge tables
- [x] Table reservations with conflict detection

### ESC/POS Printing ✅ (March 2026)
- [x] WiFi and Bluetooth printer support
- [x] Kitchen and customer receipt generation
- [x] 58mm and 80mm paper width support

### Platform Owner Features ✅ (March 2026)
- [x] Platform Dashboard with MRR, subscriptions, trial stats
- [x] Global Categories for onboarding templates
- [x] Platform Reports with revenue breakdown
- [x] Platform Settings with Stripe configuration

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, Capacitor (mobile)
- **Backend**: FastAPI, Motor (async MongoDB)
- **Database**: MongoDB (local for preview, Atlas for production)
- **Authentication**: JWT with passlib/bcrypt

## API Endpoints Summary

### Platform Owner Only
- `GET/POST /api/restaurants` - Manage restaurants
- Platform-specific endpoints in development

### Restaurant Admin
- Tables: CRUD, merge, split, reservations
- Products/Categories: CRUD
- Orders: CRUD, complete
- Reports: Stats, PDF generation
- Printers: CRUD, test, receipt generation

### All Users
- `POST /api/auth/login` - Login
- `GET /api/orders` - Order history (filtered by role)

---

## What's Been Implemented

### Session 1 - Core Fixes (March 2026)
- [x] Fixed MongoDB connection and bcrypt compatibility
- [x] Fixed login endpoint and authentication flow
- [x] Created seed_database.py with 3 user types

### Session 2 - Table & Printer Features (March 2026)
- [x] Table Management backend API
- [x] ESC/POS printer support
- [x] TableManagement.js and PrinterSettings.js pages

### Session 3 - Role-Based Architecture (March 2026)
- [x] Fixed navigation issues - pages no longer disappear
- [x] Created shared Sidebar.js component with role-based menus
- [x] Platform Owner now has dedicated pages (no POS, Cash Drawer)
- [x] Platform Dashboard, Categories, Reports, Settings pages
- [x] POS has standalone view (no sidebar)
- [x] Route protection prevents cross-role access

### Session 4 - POS & User Management (March 2026)
- [x] **Table Selection in POS** - Dropdown in cart to assign orders to tables
- [x] **Restaurant User Creation** - Platform Owner can create admin/staff users
- [x] **User Management Dialog** - View, add, delete users per restaurant
- [x] **Kitchen Receipt Auto-Print** - ESC/POS commands generated on order creation
- [x] **PDF Fallback** - When no printer connected, downloads PDF receipt
- [x] **Pending Orders Table Info** - Shows table badge on orders with tables
- [x] All 41 backend tests passing (100%)

### Session 5 - Payment Features (March 2026)
- [x] **Clear Table on Payment** - Table auto-cleared when order completed
- [x] **Split Bill UI** - Visual breakdown of per-person amounts
- [x] **Split Summary** - Shows each person's portion clearly
- [x] **Cash/Card Per-Person Amount** - Buttons show individual amount when split
- [x] **Customer Receipt Print** - ESC/POS commands generated after payment
- [x] **Table Info in Payment Dialog** - Shows table badge and clear message
- [x] **Tip + Split Calculation** - Correct math: (subtotal + tip) / split_count
- [x] All 52 backend tests passing (100%)

---

## Backlog (P1 - Next Priority)

### POS Enhancements
- [ ] Multiple payment methods (part cash, part card) for single order
- [ ] Order notes/special instructions
- [ ] Discounts and coupons

### Platform Owner
- [ ] Subscription status management API (trial → active → suspended)
- [ ] Email notifications for trial expiry
- [ ] Revenue dashboard with charts

---

## Future Tasks (P2+)

### Android APK Build
- User will handle via Capacitor

### Payments
- [ ] Stripe subscription integration
- [ ] POS payment processing

### Kitchen Display System
- [ ] Real-time order display
- [ ] Order status updates

---

## Files of Reference
- `/app/frontend/src/components/Sidebar.js` - Shared navigation component
- `/app/frontend/src/App.js` - Route configuration with role protection
- `/app/frontend/src/pages/PlatformDashboard.js` - Platform owner dashboard
- `/app/frontend/src/pages/PlatformCategories.js` - Global categories
- `/app/frontend/src/pages/PlatformReports.js` - Platform analytics
- `/app/frontend/src/pages/PlatformSettings.js` - Platform configuration
- `/app/frontend/src/pages/AdminDashboard.js` - Restaurant admin dashboard
- `/app/frontend/src/pages/TableManagement.js` - Table management
- `/app/frontend/src/pages/PrinterSettings.js` - Printer configuration
- `/app/frontend/src/pages/POSScreen.js` - POS interface (standalone)
- `/app/backend/server.py` - All backend APIs
