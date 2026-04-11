import React from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Calendar, Clock, ArrowRightLeft, LogOut, Wallet } from 'lucide-react';

export default function HevaOpsLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = [
    { path: '/heva-ops/shifts', icon: Calendar, label: 'My Shifts' },
    { path: '/heva-ops/clock', icon: Clock, label: 'Clock In' },
    { path: '/heva-ops/pay', icon: Wallet, label: 'My Pay' },
    { path: '/heva-ops/swaps', icon: ArrowRightLeft, label: 'Swaps' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" data-testid="heva-ops-layout">
      {/* Top Bar */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 flex items-center justify-between" data-testid="heva-ops-header">
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">Heva Ops</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Staff Portal</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-300">{user?.username}</span>
          <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" data-testid="heva-ops-logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

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
