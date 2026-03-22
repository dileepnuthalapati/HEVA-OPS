import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

// DEMO MODE: Auto-login bypass for testing
const DEMO_MODE = true;
const DEMO_ADMIN = {
  id: 'demo_admin',
  username: 'admin',
  role: 'admin',
  created_at: new Date().toISOString()
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // DEMO MODE: Auto-login as admin
    if (DEMO_MODE) {
      console.log('🎭 DEMO MODE: Auto-logged in as admin');
      setUser(DEMO_ADMIN);
      localStorage.setItem('demo_user', JSON.stringify(DEMO_ADMIN));
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
    // DEMO MODE: Accept any login
    if (DEMO_MODE) {
      const demoUser = username === 'user' 
        ? { ...DEMO_ADMIN, username: 'user', role: 'user', id: 'demo_user' }
        : DEMO_ADMIN;
      setUser(demoUser);
      return { user: demoUser };
    }
    
    // Normal login
    const response = await authAPI.login(username, password);
    setUser(response.user);
    localStorage.setItem('user', JSON.stringify(response.user));
    return response;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('demo_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
