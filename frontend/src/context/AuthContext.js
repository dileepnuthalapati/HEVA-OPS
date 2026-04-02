import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

// DEMO MODE: Auto-login bypass for testing
const DEMO_MODE = false; // Disabled - using real auth now
const DEMO_PLATFORM_OWNER = {
  id: 'platform_owner_1',
  username: 'admin',
  role: 'platform_owner', // New role!
  restaurant_id: null, // Platform owner has no specific restaurant
  created_at: new Date().toISOString()
};

const DEMO_RESTAURANT_ADMIN = {
  id: 'restaurant_admin_1',
  username: 'restaurant_admin',
  role: 'admin',
  restaurant_id: 'rest_demo_1', // Pizza Palace
  created_at: new Date().toISOString()
};

const DEMO_RESTAURANT_USER = {
  id: 'restaurant_user_1',
  username: 'user',
  role: 'user',
  restaurant_id: 'rest_demo_1', // Pizza Palace
  created_at: new Date().toISOString()
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // DEMO MODE: Auto-login based on URL param or default
    if (DEMO_MODE) {
      const urlParams = new URLSearchParams(window.location.search);
      const role = urlParams.get('role');
      
      let demoUser;
      if (role === 'restaurant_admin') {
        demoUser = DEMO_RESTAURANT_ADMIN;
      } else if (role === 'user') {
        demoUser = DEMO_RESTAURANT_USER;
      } else {
        demoUser = DEMO_PLATFORM_OWNER; // Default: platform owner
      }
      
      console.log(`🎭 DEMO MODE: Auto-logged in as ${demoUser.role}`);
      setUser(demoUser);
      localStorage.setItem('demo_user', JSON.stringify(demoUser));
      setLoading(false);
      return;
    }
    
    // Normal auth check
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    // DEMO MODE: Return different users based on username
    if (DEMO_MODE) {
      let demoUser;
      if (username === 'restaurant_admin' || username === 'rest_admin') {
        demoUser = DEMO_RESTAURANT_ADMIN;
      } else if (username === 'user' || username === 'staff') {
        demoUser = DEMO_RESTAURANT_USER;
      } else {
        demoUser = DEMO_PLATFORM_OWNER;
      }
      setUser(demoUser);
      return { user: demoUser };
    }
    
    // Normal login
    const response = await authAPI.login(username, password);
    const userData = {
      username: response.username,
      role: response.role,
      restaurant_id: response.restaurant_id,
    };
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    return { user: userData, ...response };
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
  const canAccessRestaurants = isPlatformOwner; // Only platform owner

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
