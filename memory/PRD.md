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
- Access to dashboard, products, categories, orders, reports, cash drawer, settings
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
- `POST /api/orders` - Create order
- `PUT /api/orders/{id}/complete` - Complete order

### Reports (Admin only)
- `GET /api/reports/stats` - Get sales statistics
- `POST /api/reports/generate` - Generate PDF report

---

## What's Been Implemented (March 2026)

### Session 1 - Core Fixes
- [x] Fixed MongoDB connection (using local MongoDB for preview)
- [x] Fixed bcrypt/passlib version compatibility (bcrypt==4.0.1)
- [x] Fixed login endpoint (was missing function body)
- [x] Fixed API service to use correct login endpoint
- [x] Created seed_database.py with proper user setup
- [x] Implemented Platform Owner role with separate permissions
- [x] Updated role-based routing in frontend
- [x] All 16 backend tests passing
- [x] All frontend login flows working correctly

### Demo Data Seeded
- 1 Restaurant (Pizza Palace)
- 4 Categories (Pizzas, Drinks, Sides, Desserts)
- 11 Products
- 3 Users (platform_owner, restaurant_admin, user)

---

## Backlog (P1 - Next Priority)

### Data Isolation Enhancement
- [ ] Ensure all product/category endpoints filter by restaurant_id
- [ ] Verify orders are restaurant-specific

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

### Phase 3: Printing
- [ ] Bluetooth/WiFi printer support
- [ ] Receipt customization

### Phase 4: Table Management
- [ ] Table layout configuration
- [ ] Table-based order assignment

### Phase 5: Kitchen Display System
- [ ] Real-time order display for kitchen
- [ ] Order status updates

---

## Known Issues
- **MongoDB Atlas**: Cannot connect from preview environment (IP whitelist issue). Using local MongoDB for testing. Production deployment on Railway should work with proper configuration.
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
