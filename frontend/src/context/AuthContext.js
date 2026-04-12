import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { initPushNotifications, teardownPushNotifications } from '../services/push';

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
    
    // Try online login first
    try {
      const response = await authAPI.login(username, password);
      const userData = {
        username: response.username,
        role: response.role,
        restaurant_id: response.restaurant_id,
        features: response.features || {},
        capabilities: response.capabilities || [],
        email: response.email || '',
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      // Initialize push notifications after login
      initPushNotifications().catch(() => {});
      // Cache credentials for offline login
      try {
        const hash = btoa(username + ':' + password);
        localStorage.setItem('offline_cred', hash);
        localStorage.setItem('offline_user', JSON.stringify(userData));
      } catch {}
      return { user: userData, ...response };
    } catch (error) {
      // If offline, try cached credentials
      if (!navigator.onLine) {
        try {
          const cachedHash = localStorage.getItem('offline_cred');
          const attemptHash = btoa(username + ':' + password);
          if (cachedHash && cachedHash === attemptHash) {
            const cachedUser = JSON.parse(localStorage.getItem('offline_user'));
            if (cachedUser) {
              setUser(cachedUser);
              localStorage.setItem('user', JSON.stringify(cachedUser));
              return { user: cachedUser, offline: true };
            }
          }
        } catch {}
        throw new Error('Offline login failed. Credentials do not match cached session.');
      }
      throw error;
    }
  };

  const pinLogin = async (pin, restaurantId) => {
    try {
      const response = await authAPI.pinLogin(pin, restaurantId);
      const userData = {
        username: response.username,
        role: response.role,
        restaurant_id: response.restaurant_id,
        features: response.features || {},
        capabilities: response.capabilities || [],
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      return { user: userData, ...response };
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    // Preserve restaurant_id for PIN login after logout
    const lastRestId = user?.restaurant_id;
    if (lastRestId) {
      localStorage.setItem('last_restaurant_id', lastRestId);
    }
    teardownPushNotifications().catch(() => {});
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

  // Feature check helper - reads from user.features (embedded in JWT)
  const hasFeature = (featureName) => {
    if (isPlatformOwner) return true; // Platform owner sees everything
    return user?.features?.[featureName] === true;
  };

  // Capability check helper - reads from user.capabilities array
  const hasCapability = (cap) => {
    if (isPlatformOwner || isRestaurantAdmin) return true;
    return (user?.capabilities || []).includes(cap);
  };

  // Device mode check
  const isTerminalMode = !!localStorage.getItem('heva_terminal');

  const features = user?.features || {};
  const capabilities = user?.capabilities || [];

  return (
    <AuthContext.Provider value={{ 
      user, 
      login,
      pinLogin,
      logout, 
      loading, 
      isPlatformOwner,
      isRestaurantAdmin,
      isRestaurantUser,
      canAccessRestaurants,
      isAdmin: isPlatformOwner || isRestaurantAdmin,
      hasFeature,
      hasCapability,
      isTerminalMode,
      features,
      capabilities,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
