import React, { createContext, useContext, useState, useEffect } from 'react';
import { orderAPI } from '../services/api';
import { toast } from 'sonner';

const OfflineContext = createContext();

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
};

export const OfflineProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      toast.success('Back online! Syncing data...');
      await syncData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('You are offline. Orders will be saved locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncData = async () => {
    if (!isOnline) return;
    
    setIsSyncing(true);
    try {
      const result = await orderAPI.sync();
      if (result.message && result.message !== 'No orders to sync') {
        toast.success(result.message);
      }
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('Failed to sync offline orders');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <OfflineContext.Provider value={{ isOnline, isSyncing, syncData }}>
      {children}
    </OfflineContext.Provider>
  );
};