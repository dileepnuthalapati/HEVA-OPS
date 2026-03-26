# HevaPOS - Multi-Tenant Restaurant POS System

## Product Overview
A comprehensive multi-tenant SaaS POS system for restaurants with role-based access, table management, and advanced payment features.

## Production URLs
- **Backend API**: https://heva-ops-production.up.railway.app
- **Database**: MongoDB Atlas
- **App ID**: com.hetupathways.app

## User Roles & Credentials
| Role | Username | Password | Access |
|------|----------|----------|--------|
| Platform Owner | platform_owner | admin123 | Manage restaurants, global settings |
| Restaurant Admin | restaurant_admin | admin123 | Manage menu, tables, staff, reports |
| Staff | user | user123 | POS screen only |

---

## Completed Features (March 2026)

### Authentication & Access Control
- [x] JWT-based authentication
- [x] Role-based access (Platform Owner, Admin, Staff)
- [x] Protected routes with role verification
- [x] Shared Sidebar component with role-specific menus

### Platform Owner Features
- [x] Restaurant management (Create, Edit, Delete)
- [x] User management per restaurant
- [x] Custom subscription pricing
- [x] Multi-currency support (GBP, USD, EUR, INR)

### Restaurant Admin Features
- [x] Restaurant settings (business info, receipt customization)
- [x] Category management (CRUD)
- [x] Product management (CRUD with images, stock status)
- [x] Table management (CRUD with status tracking)
- [x] Printer management (WiFi/Bluetooth ESC/POS)
- [x] Order history
- [x] Sales reports with date range
- [x] Cash drawer management (open/close/reconcile)

### POS Features
- [x] Product grid with categories
- [x] Cart management (add, remove, quantity)
- [x] Table selection for dine-in orders
- [x] Order notes for kitchen
- [x] Discount support (percentage & fixed)
- [x] Order placement with kitchen receipt
- [x] **Edit pending orders (add more items)**
- [x] Pending orders view

### Payment Features
- [x] Cash payment
- [x] Card payment
- [x] Split payment (part cash, part card)
- [x] Tip support (10%, 15%, 20%, custom)
- [x] Split bill by number of people
- [x] Auto-clear table after payment
- [x] Customer receipt generation

### UI/UX
- [x] Dynamic currency symbol based on restaurant location
- [x] Receipt preview with restaurant name
- [x] Clean login page (no demo credentials shown)
- [x] Consistent sidebar navigation across all pages
- [x] Silent error handling for optional features (printing)

---

## Technical Architecture

### Frontend
- React 18 with React Router
- Tailwind CSS + Shadcn UI components
- Capacitor for Android APK
- IndexedDB for offline support

### Backend
- FastAPI (Python)
- Motor (async MongoDB driver)
- JWT authentication
- ESC/POS receipt generation

### Database
- MongoDB Atlas (cloud)
- Collections: users, restaurants, categories, products, orders, tables, printers, cash_drawers

### Deployment
- Backend: Railway (auto-deploy from GitHub)
- Database: MongoDB Atlas
- Mobile: Android APK via Capacitor

---

## File Structure
```
/app/
├── backend/
│   ├── server.py          # All API endpoints (~2200 lines)
│   ├── requirements.txt
│   └── Procfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.js      # Shared role-based sidebar
│   │   │   └── ui/             # Shadcn components
│   │   ├── context/
│   │   │   └── AuthContext.js  # Auth state management
│   │   ├── pages/
│   │   │   ├── Login.js
│   │   │   ├── POSScreen.js
│   │   │   ├── AdminDashboard.js
│   │   │   ├── CategoryManagement.js
│   │   │   ├── ProductManagement.js
│   │   │   ├── TableManagement.js
│   │   │   ├── OrderHistory.js
│   │   │   ├── Reports.js
│   │   │   ├── CashDrawer.js
│   │   │   ├── RestaurantSettings.js
│   │   │   ├── PrinterSettings.js
│   │   │   ├── PlatformDashboard.js
│   │   │   └── RestaurantManagement.js
│   │   ├── services/
│   │   │   ├── api.js          # All API calls
│   │   │   └── printer.js      # Web Serial API for ESC/POS
│   │   └── App.js
│   ├── capacitor.config.json
│   └── package.json
└── memory/
    └── PRD.md
```

---

## API Endpoints Summary

### Auth
- POST /api/auth/login
- GET /api/auth/me

### Restaurants (Platform Owner)
- GET /api/restaurants
- POST /api/restaurants
- PUT /api/restaurants/{id}
- DELETE /api/restaurants/{id}
- POST /api/restaurants/{id}/users

### Restaurant Settings (Admin)
- GET /api/restaurants/my
- PUT /api/restaurants/my/settings

### Categories
- GET /api/categories
- POST /api/categories
- PUT /api/categories/{id}
- DELETE /api/categories/{id}

### Products
- GET /api/products
- POST /api/products
- PUT /api/products/{id}
- DELETE /api/products/{id}

### Orders
- GET /api/orders
- GET /api/orders/pending
- POST /api/orders
- PUT /api/orders/{id}
- PUT /api/orders/{id}/complete

### Tables
- GET /api/tables
- POST /api/tables
- PUT /api/tables/{id}
- DELETE /api/tables/{id}
- POST /api/tables/{id}/clear

### Printers
- GET /api/printers
- POST /api/printers
- DELETE /api/printers/{id}
- POST /api/printers/{id}/test

### Reports & Cash Drawer
- GET /api/reports/stats
- GET /api/cash-drawer/current
- POST /api/cash-drawer/open
- POST /api/cash-drawer/close

---

## Future Enhancements (Backlog)

### P1 - High Priority
- [ ] Subscription management (trial → active → suspended)
- [ ] Email notifications (trial expiry, payment reminders)
- [ ] Password change functionality
- [ ] User management for Restaurant Admin

### P2 - Medium Priority
- [ ] Revenue dashboard with charts
- [ ] Kitchen Display System (KDS)
- [ ] Inventory/Stock management
- [ ] Customer database & loyalty

### P3 - Low Priority
- [ ] Payment gateway integration (Stripe/Razorpay)
- [ ] Online ordering integration
- [ ] Multi-language support
- [ ] iOS app build

---

## Live Testing Status
- **Status**: Ready for Production Testing
- **Started**: March 2026
- **Feedback**: Pending from live restaurant use

---

## Change Log

### March 26, 2026
- Fixed categories/products not saving (restaurant_id issue)
- Fixed restaurant settings save error
- Added edit/delete restaurants for Platform Owner
- Added edit pending orders feature
- Dynamic currency symbol based on restaurant location
- Updated receipt preview with restaurant name
- Removed demo credentials from login page
- Silent error handling for printer operations

### March 25, 2026
- Railway deployment configured (PORT, healthcheck)
- MongoDB Atlas IP whitelist configured
- Database seeding endpoint added
- All API endpoints verified working

### Previous Sessions
- Role-based access control implemented
- Table management with status tracking
- Printer management (ESC/POS)
- Split bill and multiple payment methods
- Discount and order notes features
