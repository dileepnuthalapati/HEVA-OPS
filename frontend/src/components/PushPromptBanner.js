import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { isPushAvailable, initPushNotifications, wasPushEnabled } from '../services/push';

/**
 * One-time notification opt-in banner.
 * Shows once for staff and admin until they enable or dismiss.
 * Only appears on native Capacitor devices.
 */
export default function PushPromptBanner() {
  const [show, setShow] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    const check = async () => {
      // Don't show if already enabled or dismissed
      if (wasPushEnabled() || localStorage.getItem('heva_push_dismissed')) return;
      // Only show on native devices where push is available
      const available = await isPushAvailable();
      if (available) setShow(true);
    };
    check();
  }, []);

  if (!show) return null;

  const handleEnable = async () => {
    setEnabling(true);
    try {
      const result = await initPushNotifications();
      if (result.success) {
        toast.success('Notifications enabled!');
        setShow(false);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Failed to enable notifications');
    } finally {
      setEnabling(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('heva_push_dismissed', 'true');
    setShow(false);
  };

  return (
    <div className="mx-4 mt-3 mb-1 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3" data-testid="push-prompt-banner">
      <Bell className="w-5 h-5 text-blue-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-blue-800">Enable Notifications?</p>
        <p className="text-[10px] text-blue-600 mt-0.5">Get alerts for shifts, swaps & reminders</p>
      </div>
      <Button size="sm" onClick={handleEnable} disabled={enabling} className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700" data-testid="push-enable-btn">
        {enabling ? '...' : 'Enable'}
      </Button>
      <button onClick={handleDismiss} className="text-blue-300 hover:text-blue-500 shrink-0" data-testid="push-dismiss-btn">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
