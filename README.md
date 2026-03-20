# SwiftPOS - Restaurant Point of Sale System

A modern, offline-first Progressive Web App (PWA) for restaurant point-of-sale operations with full inventory management and sales reporting.

## 🚀 Features

### Core Functionality
- ✅ **Progressive Web App (PWA)** - Installable on Windows, Android, FireOS, and other platforms
- ✅ **Offline-First Architecture** - Works seamlessly offline with automatic sync when online
- ✅ **Role-Based Access Control** - Separate admin and user interfaces
- ✅ **Modern Minimal Design** - Clean, spacious UI following Swiss Utility design principles

### Admin Features
- 📊 **Dashboard** - Real-time sales metrics and top-selling products
- 📁 **Category Management** - Create, edit, and delete product categories
- 🍔 **Product Management** - Full CRUD operations for menu items with images and pricing
- 📋 **Order History** - View all orders across all users
- 📈 **Sales Reports** - Generate reports for daily, weekly, or custom date ranges
- 📄 **PDF Export** - Download detailed sales reports as PDF

### User Features
- 🛒 **POS Screen** - Fast product selection with category filtering
- 🛍️ **Cart Management** - Add, remove, and adjust quantities
- ✅ **Quick Checkout** - Complete orders with one tap
- 📜 **Order History** - View personal order history

### Technical Features
- 🔐 **JWT Authentication** - Secure user authentication
- 💾 **IndexedDB Storage** - Local data persistence for offline functionality
- 🔄 **Background Sync** - Automatic data synchronization when connection restored
- 🌐 **PWA Service Worker** - Caching and offline capabilities
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

### For Users (Cashiers)
1. Login with user credentials
2. Navigate to POS screen (automatic redirect)
3. Select products by clicking on them
4. Adjust quantities using +/- buttons
5. Click "Complete Order" to finalize
6. View order history in Orders tab

### For Admins
1. Login with admin credentials
2. Access Dashboard for sales overview
3. Manage Categories and Products
4. Generate reports with custom date ranges
5. Download PDF reports for record-keeping

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
