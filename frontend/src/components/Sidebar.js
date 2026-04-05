import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sheet, SheetContent, SheetTrigger } from '../components/ui/sheet';
import CommandSearch from './CommandSearch';
import {
  LayoutDashboard, ShoppingCart, ChefHat, FileText, Settings, Table2,
  BarChart3, Wallet, LogOut, Menu, Search, Users, Building2, Globe
} from 'lucide-react';

const platformMenu = [
  { path: '/platform/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/restaurants', icon: Building2, label: 'Restaurants' },
  { path: '/platform/reports', icon: BarChart3, label: 'Platform Reports' },
  { path: '/platform/categories', icon: Globe, label: 'Categories' },
  { path: '/platform/settings', icon: Settings, label: 'Settings' },
];

const adminMenu = [
  { path: '/pos', icon: ShoppingCart, label: 'POS Terminal' },
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/kds', icon: ChefHat, label: 'Kitchen (KDS)' },
  { path: '/orders', icon: FileText, label: 'Orders' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/menu', icon: FileText, label: 'Menu' },
  { path: '/tables', icon: Table2, label: 'Tables' },
  { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  { path: '/staff', icon: Users, label: 'Staff' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const posStaffMenu = [
  { path: '/pos', icon: ShoppingCart, label: 'POS' },
  { path: '/kds', icon: ChefHat, label: 'Kitchen (KDS)' },
  { path: '/orders', icon: FileText, label: 'Orders' },
  { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
];

function SidebarContent({ user, onLogout, onOpenSearch }) {
  const menuItems = user?.role === 'platform_owner' ? platformMenu
    : user?.role === 'admin' ? adminMenu
    : posStaffMenu;

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="mb-6" data-testid="sidebar-logo">
        <h1 className="font-heading text-xl font-bold tracking-tight text-white">HevaPOS</h1>
        <p className="text-[11px] tracking-[0.15em] uppercase text-slate-400 mt-0.5 font-medium">
          {user?.role === 'platform_owner' ? 'Platform' : user?.role === 'admin' ? 'Restaurant' : 'Staff'}
        </p>
      </div>

      {/* Search Trigger */}
      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 mb-4 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 text-sm transition-all border border-slate-700/50"
        data-testid="sidebar-search-trigger"
      >
        <Search className="w-4 h-4" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 border border-slate-600">
          Ctrl K
        </kbd>
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin" data-testid="sidebar-nav">
        {menuItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              data-testid={`nav-${item.label.toLowerCase().replace(/[\s()]/g, '-')}`}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="mt-auto pt-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-300 text-sm font-bold">
            {(user?.username || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate" data-testid="sidebar-username">{user?.username}</p>
            <p className="text-[11px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
          data-testid="logout-button"
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Global Ctrl+K shortcut
  React.useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <CommandSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Desktop Sidebar */}
      <aside className="sidebar-wrapper hidden md:flex flex-col" data-testid="desktop-sidebar">
        <SidebarContent user={user} onLogout={handleLogout} onOpenSearch={() => setSearchOpen(true)} />
      </aside>

      {/* Mobile Menu */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 glass" data-testid="mobile-header">
        <div className="flex items-center justify-between px-4 py-3">
          <Sheet>
            <SheetTrigger asChild>
              <button className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors" data-testid="mobile-menu-toggle">
                <Menu className="w-5 h-5 text-slate-700" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 bg-gradient-to-b from-[#0F172A] to-[#1E293B] border-none">
              <div className="p-5 h-full">
                <SidebarContent user={user} onLogout={handleLogout} onOpenSearch={() => setSearchOpen(true)} />
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="font-heading text-base font-bold text-slate-900 tracking-tight">HevaPOS</h1>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 -mr-2 rounded-lg hover:bg-slate-100 transition-colors"
            data-testid="mobile-search-button"
          >
            <Search className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
