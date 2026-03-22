import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import axios from "axios";

// Context & Components
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import OfflineIndicator from './components/OfflineIndicator';

// Pages
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import POSScreen from './pages/POSScreen';
import ProductManagement from './pages/ProductManagement';
import CategoryManagement from './pages/CategoryManagement';
import OrderHistory from './pages/OrderHistory';
import Reports from './pages/Reports';
import CashDrawer from './pages/CashDrawer';
import RestaurantSettings from './pages/RestaurantSettings';
import RestaurantManagement from './pages/RestaurantManagement';
import TableManagement from './pages/TableManagement';
import PrinterSettings from './pages/PrinterSettings';

// Styles
import './App.css';
import './index.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// --- Components ---

const ProtectedRoute = ({ children, adminOnly = false, platformOwnerOnly = false }) => {
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
              <Navigate to="/restaurants" replace />
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
      <Route path="/restaurants" element={<ProtectedRoute platformOwnerOnly><RestaurantManagement /></ProtectedRoute>} />
      
      {/* Restaurant Admin Only */}
      <Route path="/dashboard" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute adminOnly><ProductManagement /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute adminOnly><CategoryManagement /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute adminOnly><Reports /></ProtectedRoute>} />
      <Route path="/cash-drawer" element={<ProtectedRoute adminOnly><CashDrawer /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute adminOnly><RestaurantSettings /></ProtectedRoute>} />
      <Route path="/tables" element={<ProtectedRoute adminOnly><TableManagement /></ProtectedRoute>} />
      <Route path="/printers" element={<ProtectedRoute adminOnly><PrinterSettings /></ProtectedRoute>} />
      
      {/* All Authenticated Users */}
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
