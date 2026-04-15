import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import axios from "axios";

// Context & Components
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import OfflineIndicator from './components/OfflineIndicator';
import FloatingClockButton from './components/FloatingClockButton';

// Pages - Platform Owner
import PlatformDashboard from './pages/PlatformDashboard';
import PlatformCategories from './pages/PlatformCategories';
import PlatformReports from './pages/PlatformReports';
import PlatformSettings from './pages/PlatformSettings';
import RestaurantManagement from './pages/RestaurantManagement';
import SubscriptionManagement from './pages/SubscriptionManagement';

// Pages - Restaurant Admin
import AdminDashboard from './pages/AdminDashboard';
import ProductManagement from './pages/ProductManagement';
import CategoryManagement from './pages/CategoryManagement';
import MenuManagement from './pages/MenuManagement';
import OrderHistory from './pages/OrderHistory';
import Reports from './pages/Reports';
import CashDrawer from './pages/CashDrawer';
import RestaurantSettings from './pages/RestaurantSettings';
import TableManagement from './pages/TableManagement';
import PrinterSettings from './pages/PrinterSettings';
import AuditLog from './pages/AuditLog';

// Pages - Workforce Module
import ShiftScheduler from './pages/ShiftScheduler';
import AttendancePage from './pages/AttendancePage';
import TimesheetsPage from './pages/TimesheetsPage';

// Pages - Heva Ops (Staff Companion)
import HevaOpsLayout from './pages/HevaOpsLayout';
import StaffShifts from './pages/StaffShifts';
import StaffClockIn from './pages/StaffClockIn';
import StaffSwapRequests from './pages/StaffSwapRequests';
import StaffMyPay from './pages/StaffMyPay';
import StaffTimeOff from './pages/StaffTimeOff';

// Pages - All Users
import Login from './pages/Login';
import POSScreen from './pages/POSScreen';
import KitchenDisplay from './pages/KitchenDisplay';
import TerminalPinScreen from './pages/TerminalPinScreen';

// Pages - Public (No Auth)
import GuestMenu from './pages/GuestMenu';
import PaymentSuccess from './pages/PaymentSuccess';
import StaffOnboarding from './pages/StaffOnboarding';

// Styles
import './App.css';
import './index.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// --- Components ---

const ProtectedRoute = ({ children, adminOnly = false, platformOwnerOnly = false, restaurantAdminOnly = false }) => {
  const { user, loading, isPlatformOwner, isRestaurantAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-medium">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Platform owner only routes
  if (platformOwnerOnly && !isPlatformOwner) {
    return <Navigate to={isRestaurantAdmin ? "/dashboard" : "/pos"} replace />;
  }

  // Restaurant admin only routes (not platform owner)
  if (restaurantAdminOnly && !isRestaurantAdmin) {
    if (isPlatformOwner) {
      return <Navigate to="/platform/dashboard" replace />;
    }
    // Staff: smart redirect based on features
    const features = user.features || {};
    if (features.pos) return <Navigate to="/pos" replace />;
    if (features.workforce) return <Navigate to="/heva-ops/shifts" replace />;
    return <Navigate to="/pos" replace />;
  }

  // Admin routes (platform owner OR restaurant admin)
  if (adminOnly && user.role === 'user') {
    // Smart redirect: route to first available module
    const features = user.features || {};
    if (features.pos) return <Navigate to="/pos" replace />;
    if (features.workforce) return <Navigate to="/heva-ops/shifts" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { user, isPlatformOwner, isRestaurantAdmin, isTerminalMode } = useAuth();

  // Split-Brain: Terminal Mode → always show PIN pad when not logged in
  const isTerminal = isTerminalMode;

  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/menu/:restaurantId/:tableHash" element={<GuestMenu />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/onboarding/:token" element={<StaffOnboarding />} />
      
      {/* Terminal Kiosk: when not logged in, show PIN pad instead of login */}
      <Route path="/login" element={isTerminal ? <TerminalPinScreen /> : <Login />} />
      <Route path="/terminal" element={<TerminalPinScreen />} />
      <Route
        path="/"
        element={
          user ? (
            isPlatformOwner ? (
              <Navigate to="/platform/dashboard" replace />
            ) : isRestaurantAdmin ? (
              <Navigate to="/dashboard" replace />
            ) : (
              // Staff: route based on capabilities first, then features
              (user.capabilities?.includes('pos.access') || user.features?.pos ? <Navigate to="/pos" replace /> :
               user.features?.workforce ? <Navigate to="/heva-ops/shifts" replace /> :
               <Navigate to="/dashboard" replace />)
            )
          ) : (
            isTerminal ? <Navigate to="/terminal" replace /> : <Navigate to="/login" replace />
          )
        }
      />
      
      {/* Platform Owner Only */}
      <Route path="/platform/dashboard" element={<ProtectedRoute platformOwnerOnly><PlatformDashboard /></ProtectedRoute>} />
      <Route path="/restaurants" element={<ProtectedRoute platformOwnerOnly><RestaurantManagement /></ProtectedRoute>} />
      <Route path="/platform/categories" element={<ProtectedRoute platformOwnerOnly><PlatformCategories /></ProtectedRoute>} />
      <Route path="/platform/reports" element={<ProtectedRoute platformOwnerOnly><PlatformReports /></ProtectedRoute>} />
      <Route path="/platform/settings" element={<ProtectedRoute platformOwnerOnly><PlatformSettings /></ProtectedRoute>} />
      <Route path="/platform/subscriptions" element={<ProtectedRoute platformOwnerOnly><SubscriptionManagement /></ProtectedRoute>} />
      
      {/* Restaurant Admin Only (not platform owner) */}
      <Route path="/dashboard" element={<ProtectedRoute restaurantAdminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/tables" element={<ProtectedRoute restaurantAdminOnly><TableManagement /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute restaurantAdminOnly><CategoryManagement /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute restaurantAdminOnly><ProductManagement /></ProtectedRoute>} />
      <Route path="/menu-management" element={<ProtectedRoute restaurantAdminOnly><MenuManagement /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute restaurantAdminOnly><Reports /></ProtectedRoute>} />
      <Route path="/cash-drawer" element={<ProtectedRoute><CashDrawer /></ProtectedRoute>} />
      <Route path="/printers" element={<ProtectedRoute restaurantAdminOnly><PrinterSettings /></ProtectedRoute>} />
      <Route path="/audit" element={<ProtectedRoute restaurantAdminOnly><AuditLog /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute restaurantAdminOnly><RestaurantSettings /></ProtectedRoute>} />
      {/* /staff route removed — user management is inside Settings */}
      
      {/* Workforce Module Routes */}
      <Route path="/workforce/shifts" element={<ProtectedRoute restaurantAdminOnly><ShiftScheduler /></ProtectedRoute>} />
      <Route path="/workforce/attendance" element={<ProtectedRoute restaurantAdminOnly><AttendancePage /></ProtectedRoute>} />
      <Route path="/workforce/timesheets" element={<ProtectedRoute restaurantAdminOnly><TimesheetsPage /></ProtectedRoute>} />
      
      {/* POS Staff & Restaurant Admin */}
      <Route path="/pos" element={<ProtectedRoute><POSScreen /></ProtectedRoute>} />
      <Route path="/kds" element={<ProtectedRoute><KitchenDisplay /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
      
      {/* Heva Ops — Staff Companion (Workforce PWA) */}
      <Route path="/heva-ops" element={<ProtectedRoute><HevaOpsLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/heva-ops/shifts" replace />} />
        <Route path="shifts" element={<StaffShifts />} />
        <Route path="clock" element={<StaffClockIn />} />
        <Route path="swaps" element={<StaffSwapRequests />} />
        <Route path="pay" element={<StaffMyPay />} />
        <Route path="time-off" element={<StaffTimeOff />} />
      </Route>
    </Routes>
  );
};

// --- Main App ---

function App() {
  return (
    <AuthProvider>
      <OfflineProvider>
        <BrowserRouter>
          <div className="App">
            <OfflineIndicator />
            <FloatingClockButton />
            <AppRoutes />
            <Toaster position="bottom-right" duration={2000} closeButton toastOptions={{ style: { fontSize: '13px' } }} />
          </div>
        </BrowserRouter>
      </OfflineProvider>
    </AuthProvider>
  );
}

export default App;
