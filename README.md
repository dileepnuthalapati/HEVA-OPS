# HevaPOS - Restaurant Point of Sale System

A modern, offline-first Progressive Web App (PWA) for restaurant point-of-sale operations with full inventory management, two-stage order processing, and automated receipt printing.

## 🚀 Features

### Core Functionality
- ✅ **Progressive Web App (PWA)** - Installable on Windows, Android, FireOS, and other platforms
- ✅ **Offline-First Architecture** - Works seamlessly offline with automatic sync when online
- ✅ **Two-Stage Order Workflow** - Place order first (kitchen), complete payment later
- ✅ **Dual Receipt System** - Kitchen receipt at order placement, customer receipt at completion
- ✅ **Role-Based Access Control** - Separate admin and user interfaces
- ✅ **Modern Minimal Design** - Clean, spacious UI following Swiss Utility design principles

### Admin Features
- 📊 **Dashboard** - Real-time sales metrics and top-selling products
- 📁 **Category Management** - Create, edit, and delete product categories
- 🍔 **Product Management** - Full CRUD operations for menu items with images and pricing
- 📋 **Order History** - View all orders (pending and completed) across all users
- 📈 **Sales Reports** - Generate reports for daily, weekly, or custom date ranges
- 📄 **PDF Export** - Download detailed sales reports as PDF

### User Features (Cashiers/Servers)
- 🛒 **POS Screen** - Fast product selection with category filtering
- 🛍️ **Cart Management** - Add, remove, and adjust quantities
- 📝 **Place Order** - Send order to kitchen with automatic kitchen receipt printing
- 💰 **Pending Orders** - View all pending orders waiting for payment
- 💳 **Payment Processing** - Complete orders with Cash or Card payment selection
- 🧾 **Customer Receipt** - Automatic customer receipt printing on payment completion
- 📜 **Order History** - View personal order history with status tracking

### Order Workflow
1. **Place Order Stage**:
   - User adds items to cart
   - Clicks "Place Order (Send to Kitchen)"
   - Order status: PENDING
   - Kitchen receipt automatically downloads (PDF)
   - Order sent to kitchen for preparation

2. **Complete Payment Stage**:
   - User clicks "Pending Orders" to view all pending orders
   - Selects order to complete
   - Chooses payment method (Cash or Card)
   - Order status changes to COMPLETED
   - Customer receipt automatically downloads (PDF)

### Technical Features
- 🔐 **JWT Authentication** - Secure user authentication
- 💾 **IndexedDB Storage** - Local data persistence for offline functionality
- 🔄 **Background Sync** - Automatic data synchronization when connection restored
- 🌐 **PWA Service Worker** - Caching and offline capabilities
- 🖨️ **Automated Receipt Printing** - PDF generation for kitchen and customer receipts
- 🎨 **Custom Fonts** - Manrope for headings, JetBrains Mono for prices

## 🏗️ Tech Stack

### Frontend
- React 19
- React Router v7
- Axios for API calls
- IndexedDB (via idb) for offline storage
- Shadcn/UI components
- Tailwind CSS for styling
- Lucide React for icons
- Sonner for toast notifications

### Backend
- FastAPI (Python)
- Motor (async MongoDB driver)
- JWT authentication with PassLib
- ReportLab for PDF generation
- Bcrypt for password hashing

### Database
- MongoDB

## 🎯 Demo Accounts

### Admin Account
- **Username:** admin
- **Password:** admin123
- **Access:** Full system access including reports, product/category management

### User Account
- **Username:** user
- **Password:** user123
- **Access:** POS screen and personal order history

## 📱 Usage

### For Users (Cashiers/Servers)

**Placing an Order:**
1. Login with user credentials
2. Navigate to POS screen (automatic redirect)
3. Select products by clicking on them (adds to cart)
4. Adjust quantities using +/- buttons if needed
5. Click "Place Order (Send to Kitchen)"
6. Kitchen receipt automatically downloads (PDF)
7. Order is now PENDING and sent to kitchen

**Completing Payment (Later):**
1. Click "Pending Orders" button to view all pending orders
2. Review order items and total
3. Click "Complete Payment" button
4. Select payment method: Cash or Card
5. Customer receipt automatically downloads (PDF)
6. Order status changes to COMPLETED

**View Order History:**
- Click on Orders tab to see all your orders
- Pending orders shown with "Pending Payment" badge
- Completed orders show payment method (CASH/CARD)

### For Admins
1. Login with admin credentials
2. Access Dashboard for sales overview
3. Manage Categories and Products
4. View all orders (pending and completed) from all users
5. Generate reports with custom date ranges
6. Download PDF reports for record-keeping

## 🌐 Offline Functionality

The app works completely offline:
- **Products & Categories** - Cached locally via IndexedDB
- **Orders** - Saved locally when offline
- **Auto-Sync** - Orders sync automatically when connection restored
- **Status Indicator** - Top-right corner shows online/offline/syncing status

## 🚧 Converting to Native APK

While this is a PWA, you can convert it to APK using:
1. **Trusted Web Activity (TWA)** - For Android APK
2. **PWA Builder** - Microsoft tool for Android/Windows packages
3. **Apache Cordova** - For full native builds
4. **Capacitor** - Modern native wrapper

## 🔄 Future Enhancements

- 📱 Native mobile app builds (APK/IPA)
- 🖼️ Built-in image upload with object storage
- 📊 Advanced analytics and charts
- 💳 Payment gateway integration
- 🖨️ Receipt printer integration
- 👥 Multi-location support
- 📦 Inventory tracking with low-stock alerts

---

**Built with ❤️ for restaurants everywhere**
