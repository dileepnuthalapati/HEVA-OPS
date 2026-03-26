import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

// DEMO_MODE must be false to use the real login screen.
const DEMO_MODE = false;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Normal auth check on app load
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Error parsing saved user", e);
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    // Perform actual login via API
    const response = await authAPI.login(username, password);
    const userData = response.user;

    // Store in state and localStorage
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    // auth_token is handled by authAPI.login calling setAuthToken in api.js

    return response;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('demo_user');
  };

  // Role check helpers
  const isPlatformOwner = user?.role === 'platform_owner';
  const isRestaurantAdmin = user?.role === 'admin';
  const isRestaurantUser = user?.role === 'user';
  const canAccessRestaurants = isPlatformOwner;

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      loading, 
      isPlatformOwner,
      isRestaurantAdmin,
      isRestaurantUser,
      canAccessRestaurants,
      isAdmin: isPlatformOwner || isRestaurantAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
