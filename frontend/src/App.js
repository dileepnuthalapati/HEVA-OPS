import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import axios from "axios";

// Context & Components
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import OfflineIndicator from './components/OfflineIndicator';

// Pages - Platform Owner
import PlatformDashboard from './pages/PlatformDashboard';
import PlatformCategories from './pages/PlatformCategories';
import PlatformReports from './pages/PlatformReports';
import PlatformSettings from './pages/PlatformSettings';
import RestaurantManagement from './pages/RestaurantManagement';

// Pages - Restaurant Admin
import AdminDashboard from './pages/AdminDashboard';
import ProductManagement from './pages/ProductManagement';
import CategoryManagement from './pages/CategoryManagement';
import OrderHistory from './pages/OrderHistory';
import Reports from './pages/Reports';
import CashDrawer from './pages/CashDrawer';
import RestaurantSettings from './pages/RestaurantSettings';
import TableManagement from './pages/TableManagement';
import PrinterSettings from './pages/PrinterSettings';

// Pages - All Users
import Login from './pages/Login';
import POSScreen from './pages/POSScreen';

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
    return <Navigate to="/pos" replace />;
  }

  // Admin routes (platform owner OR restaurant admin)
  if (adminOnly && user.role === 'user') {
    return <Navigate to="/pos" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { user, isPlatformOwner, isRestaurantAdmin } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          user ? (
            isPlatformOwner ? (
              <Navigate to="/platform/dashboard" replace />
            ) : isRestaurantAdmin ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/pos" replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      
      {/* Platform Owner Only */}
      <Route path="/platform/dashboard" element={<ProtectedRoute platformOwnerOnly><PlatformDashboard /></ProtectedRoute>} />
      <Route path="/restaurants" element={<ProtectedRoute platformOwnerOnly><RestaurantManagement /></ProtectedRoute>} />
      <Route path="/platform/categories" element={<ProtectedRoute platformOwnerOnly><PlatformCategories /></ProtectedRoute>} />
      <Route path="/platform/reports" element={<ProtectedRoute platformOwnerOnly><PlatformReports /></ProtectedRoute>} />
      <Route path="/platform/settings" element={<ProtectedRoute platformOwnerOnly><PlatformSettings /></ProtectedRoute>} />
      
      {/* Restaurant Admin Only (not platform owner) */}
      <Route path="/dashboard" element={<ProtectedRoute restaurantAdminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/tables" element={<ProtectedRoute restaurantAdminOnly><TableManagement /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute restaurantAdminOnly><CategoryManagement /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute restaurantAdminOnly><ProductManagement /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute restaurantAdminOnly><Reports /></ProtectedRoute>} />
      <Route path="/cash-drawer" element={<ProtectedRoute restaurantAdminOnly><CashDrawer /></ProtectedRoute>} />
      <Route path="/printers" element={<ProtectedRoute restaurantAdminOnly><PrinterSettings /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute restaurantAdminOnly><RestaurantSettings /></ProtectedRoute>} />
      
      {/* POS Staff & Restaurant Admin */}
      <Route path="/pos" element={<ProtectedRoute><POSScreen /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
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
            <AppRoutes />
            <Toaster position="top-center" richColors />
          </div>
        </BrowserRouter>
      </OfflineProvider>
    </AuthProvider>
  );
}

export default App;
