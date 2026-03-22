# HevaPOS - Multi-Tenant Restaurant POS System

## Problem Statement
Build and deploy a multi-tenant restaurant POS (Point of Sale) system that allows:
- Platform Owners to manage multiple restaurants
- Restaurant Admins to manage their own restaurant operations
- Staff users to process orders via POS interface

## User Personas

### 1. Platform Owner
- Manages all restaurants on the platform
- Can onboard new restaurants with custom pricing
- Views monthly revenue across all restaurants
- Access: `/restaurants` (Restaurant Management)

### 2. Restaurant Admin
- Manages their specific restaurant
- Access to dashboard, products, categories, orders, reports, cash drawer, tables, printers, settings
- Cannot see other restaurants
- Access: `/dashboard` and related admin pages

### 3. Staff User
- Operates the POS terminal
- Can create orders, view order history
- Limited access to admin features
- Access: `/pos` and `/orders`

## Core Requirements

### Authentication
- [x] JWT-based authentication
- [x] Role-based access control (platform_owner, admin, user)
- [x] Password hashing with bcrypt

### Multi-Tenancy
- [x] Platform Owner role separate from Restaurant Admin
- [x] Restaurant-specific data isolation
- [x] Custom subscription pricing per restaurant

### POS Features
- [x] Product management with categories
- [x] Order creation and management
- [x] Cash drawer operations
- [x] Kitchen and customer receipt printing (PDF)
- [x] Sales reports with PDF export

### Table Management (NEW - March 2026)
- [x] Simple numbered tables with capacity
- [x] Table status tracking (available, occupied, reserved, merged)
- [x] Merge tables for large parties
- [x] Unmerge tables when done
- [x] Clear table after payment
- [x] Table reservations with conflict detection
- [x] Today's reservations view
- [x] Seat and complete reservation actions

### ESC/POS Printing (NEW - March 2026)
- [x] WiFi printer support (IP:Port)
- [x] Bluetooth printer support (MAC address)
- [x] 58mm and 80mm paper width options
- [x] Default printer setting
- [x] Test print functionality
- [x] Kitchen receipt ESC/POS commands
- [x] Customer receipt ESC/POS commands
- [x] Base64-encoded command output for app integration

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, Capacitor (mobile)
- **Backend**: FastAPI, Motor (async MongoDB)
- **Database**: MongoDB (local for preview, Atlas for production)
- **Authentication**: JWT with passlib/bcrypt

## Credentials

| Role | Username | Password | Redirect |
|------|----------|----------|----------|
| Platform Owner | platform_owner | admin123 | /restaurants |
| Restaurant Admin | restaurant_admin | admin123 | /dashboard |
| Staff | user | user123 | /pos |

## API Endpoints

### Auth
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register
- `GET /api/auth/me` - Get current user

### Restaurants (Platform Owner only)
- `GET /api/restaurants` - List all restaurants
- `POST /api/restaurants` - Create restaurant

### Products & Categories
- `GET /api/products` - List products
- `GET /api/categories` - List categories
- CRUD operations available for admins

### Orders
- `GET /api/orders` - List orders
- `POST /api/orders` - Create order (with optional table_id)
- `PUT /api/orders/{id}/complete` - Complete order

### Tables (NEW)
- `GET /api/tables` - List all tables
- `POST /api/tables` - Create table
- `PUT /api/tables/{id}` - Update table
- `DELETE /api/tables/{id}` - Delete table
- `POST /api/tables/{id}/assign-order` - Assign order to table
- `POST /api/tables/{id}/clear` - Clear table
- `POST /api/tables/merge` - Merge multiple tables
- `POST /api/tables/{id}/unmerge` - Unmerge tables
- `POST /api/tables/{id}/split-bill` - Split bill for table

### Reservations (NEW)
- `GET /api/reservations` - List reservations (filter by date/status)
- `POST /api/reservations` - Create reservation
- `PUT /api/reservations/{id}` - Update reservation
- `DELETE /api/reservations/{id}` - Cancel reservation
- `POST /api/reservations/{id}/seat` - Mark party as seated
- `POST /api/reservations/{id}/complete` - Complete reservation

### Printers (NEW)
- `GET /api/printers` - List all printers
- `POST /api/printers` - Add printer
- `PUT /api/printers/{id}` - Update printer
- `DELETE /api/printers/{id}` - Delete printer
- `POST /api/printers/{id}/test` - Test printer (ESC/POS)
- `POST /api/print/kitchen/{order_id}` - Generate kitchen receipt ESC/POS
- `POST /api/print/customer/{order_id}` - Generate customer receipt ESC/POS

### Reports (Admin only)
- `GET /api/reports/stats` - Get sales statistics
- `POST /api/reports/generate` - Generate PDF report

---

## What's Been Implemented

### Session 1 - Core Fixes (March 2026)
- [x] Fixed MongoDB connection (using local MongoDB for preview)
- [x] Fixed bcrypt/passlib version compatibility (bcrypt==4.0.1)
- [x] Fixed login endpoint (was missing function body)
- [x] Fixed API service to use correct login endpoint
- [x] Created seed_database.py with proper user setup
- [x] Implemented Platform Owner role with separate permissions
- [x] Updated role-based routing in frontend
- [x] All 16 backend tests passing
- [x] All frontend login flows working correctly

### Session 2 - Table & Printer Features (March 2026)
- [x] Table Management backend API (CRUD, merge, split, reservations)
- [x] Reservation system with conflict detection
- [x] ESC/POS printer support (WiFi and Bluetooth)
- [x] Kitchen and customer receipt ESC/POS command generation
- [x] TableManagement.js frontend page
- [x] PrinterSettings.js frontend page
- [x] Updated navigation sidebar with new menu items
- [x] All 28 backend tests passing (100%)
- [x] All frontend UI tests passing

### Demo Data
- 1 Restaurant (Pizza Palace)
- 4 Categories (Pizzas, Drinks, Sides, Desserts)
- 11 Products
- 3 Users (platform_owner, restaurant_admin, user)
- 3 Tables (Table 1-4 seats, Table 2-6 seats, Table 3-2 seats)
- 2 Printers (Kitchen WiFi, Receipt Bluetooth)

---

## Backlog (P1 - Next Priority)

### Data Isolation Enhancement
- [ ] Ensure all product/category endpoints filter by restaurant_id
- [ ] Verify orders are restaurant-specific

### POS Integration with Tables
- [ ] Add table selection to POS order flow
- [ ] Show table status on POS screen

### Platform Owner Features
- [ ] Add user management (create restaurant admin users)
- [ ] Subscription status management (trial → active)
- [ ] Email notifications for trial expiry

---

## Future Tasks (P2+)

### Android APK Build
- User will handle the final APK build using Capacitor
- Prerequisites: All features must be working in preview first

### Phase 2: Payments
- [ ] Stripe integration for subscriptions
- [ ] Payment processing in POS

### Phase 3: Kitchen Display System
- [ ] Real-time order display for kitchen
- [ ] Order status updates

---

## Known Issues
- **MongoDB Atlas**: Cannot connect from preview environment (IP whitelist issue). Using local MongoDB for testing.
- **Railway Deployment**: Currently down. Need to verify MongoDB Atlas connectivity from Railway.

## Files of Reference
- `/app/backend/server.py` - Main backend with all API endpoints
- `/app/backend/seed_database.py` - Database seeding script
- `/app/frontend/src/context/AuthContext.js` - Auth state management
- `/app/frontend/src/App.js` - Route configuration
- `/app/frontend/src/pages/Login.js` - Login page
- `/app/frontend/src/pages/RestaurantManagement.js` - Platform Owner page
- `/app/frontend/src/pages/AdminDashboard.js` - Restaurant Admin dashboard
- `/app/frontend/src/pages/POSScreen.js` - POS interface
- `/app/frontend/src/pages/TableManagement.js` - Table management (NEW)
- `/app/frontend/src/pages/PrinterSettings.js` - Printer settings (NEW)
- `/app/frontend/src/services/api.js` - API client with tableAPI, printerAPI, reservationAPI
