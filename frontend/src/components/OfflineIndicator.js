import React from 'react';
import { useOffline } from '../context/OfflineContext';
import { WifiOff, RefreshCw } from 'lucide-react';

const OfflineIndicator = () => {
  const { isOnline, isSyncing } = useOffline();

  // Only show when offline or syncing - don't show when online (it blocks buttons)
  if (isOnline && !isSyncing) return null;

  const getStatus = () => {
    if (isSyncing) {
      return {
        bg: 'bg-amber-500',
        text: 'Syncing...',
        icon: <RefreshCw className="w-3 h-3 animate-spin" />,
      };
    }
    return {
      bg: 'bg-slate-600',
      text: 'Offline',
      icon: <WifiOff className="w-3 h-3" />,
    };
  };

  const status = getStatus();

  return (
    <div
      data-testid="offline-indicator"
      className={`fixed bottom-2 left-2 z-40 ${status.bg} text-white flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg`}
    >
      {status.icon}
      <span>{status.text}</span>
    </div>
  );
};

export default OfflineIndicator;
