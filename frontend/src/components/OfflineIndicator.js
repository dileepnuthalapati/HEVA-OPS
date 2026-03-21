import React from 'react';
import { useOffline } from '../context/OfflineContext';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

const OfflineIndicator = () => {
  const { isOnline, isSyncing } = useOffline();

  const getStatus = () => {
    if (isSyncing) {
      return {
        bg: 'bg-amber-500',
        text: 'Syncing...',
        icon: <RefreshCw className="w-4 h-4 animate-spin" />,
      };
    }
    if (isOnline) {
      return {
        bg: 'bg-emerald-500',
        text: 'Online',
        icon: <Wifi className="w-4 h-4" />,
      };
    }
    return {
      bg: 'bg-slate-500',
      text: 'Offline Mode',
      icon: <WifiOff className="w-4 h-4" />,
    };
  };

  const status = getStatus();

  return (
    <div
      data-testid="offline-indicator"
      className={`offline-indicator ${status.bg} text-white flex items-center gap-2`}
    >
      {status.icon}
      <span>{status.text}</span>
    </div>
  );
};

export default OfflineIndicator;