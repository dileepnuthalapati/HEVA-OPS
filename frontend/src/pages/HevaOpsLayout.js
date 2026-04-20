import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Calendar, Clock, ArrowRightLeft, LogOut, Wallet, Bell, X, CalendarDays } from 'lucide-react';
import api from '../services/api';
import { toast } from 'sonner';
import PushPromptBanner from '../components/PushPromptBanner';

export default function HevaOpsLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Poll for notifications every 60s
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/notifications/my');
        setNotifications(res.data);
      } catch {}
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const dismissNotification = async (id) => {
    try {
      await api.put(`/notifications/${id}/dismiss`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

  const unreadCount = notifications.length;

  const navItems = [
    { path: '/heva-ops/shifts', icon: Calendar, label: 'Shifts' },
    { path: '/heva-ops/clock', icon: Clock, label: 'Clock In' },
    { path: '/heva-ops/time-off', icon: CalendarDays, label: 'Time Off' },
    { path: '/heva-ops/swaps', icon: ArrowRightLeft, label: 'Swaps' },
    { path: '/heva-ops/pay', icon: Wallet, label: 'Pay' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" data-testid="heva-ops-layout">
      {/* Top Bar */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 flex items-center justify-between" data-testid="heva-ops-header">
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">Heva Ops</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Staff Portal</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Switch to POS for dual-access users */}
          {user?.capabilities?.includes('pos.access') && (
            <button
              data-testid="switch-to-pos-btn"
              onClick={() => window.location.href = '/pos'}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 hover:text-white text-xs font-medium transition-colors"
            >
              <span className="text-[10px]">POS</span>
            </button>
          )}
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors relative"
              data-testid="notification-bell"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center" data-testid="notif-badge">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifs && (
              <div className="absolute right-0 top-10 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden" data-testid="notif-dropdown">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Notifications</span>
                  <button onClick={() => setShowNotifs(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-slate-400">No notifications</div>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    {notifications.map(n => (
                      <div key={n.id} className="px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50" data-testid={`notif-${n.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                          </div>
                          <button
                            onClick={() => dismissNotification(n.id)}
                            className="shrink-0 text-slate-300 hover:text-slate-500 mt-0.5"
                            data-testid={`dismiss-${n.id}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <span className="text-xs text-slate-300">{user?.username}</span>
          <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" data-testid="heva-ops-logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Push Notification Opt-in Banner */}
      <PushPromptBanner />

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex" data-testid="heva-ops-tabs">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                }`
              }
              data-testid={`tab-${item.label.toLowerCase().replace(/[\s/]/g, '-')}`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
