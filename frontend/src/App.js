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

// Styles
import './App.css';
import './index.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// --- Components ---

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();

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

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/pos" replace />;
  }

  return children;
};

const Home = () => {
  useEffect(() => {
    const helloWorldApi = async () => {
      try {
        const response = await axios.get(`${API}/`);
        console.log(response.data.message);
      } catch (e) {
        console.error(e, `errored out requesting / api`);
      }
    };
    helloWorldApi();
  }, []);

  return (
    <header className="App-header">
      <a href="https://emergent.sh" target="_blank" rel="noopener noreferrer">
        <img src="https://avatars.githubusercontent.com/in/1201222?s=120&u=2686cf91179bbafbc7a71bfbc43004cf9ae1acea&v=4" alt="logo" />
      </a>
      <p className="mt-5">Building something incredible ~!</p>
    </header>
  );
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          user ? (
            user.role === 'admin' ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/pos" replace />
            )
          ) : (
            <Home /> 
          )
        }
      />
      <Route path="/dashboard" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/pos" element={<ProtectedRoute><POSScreen /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute adminOnly><ProductManagement /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute adminOnly><CategoryManagement /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute adminOnly><Reports /></ProtectedRoute>} />
      <Route path="/cash-drawer" element={<ProtectedRoute adminOnly><CashDrawer /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><RestaurantSettings /></ProtectedRoute>} />
      <Route path="/restaurants" element={<ProtectedRoute adminOnly><RestaurantManagement /></ProtectedRoute>} />
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