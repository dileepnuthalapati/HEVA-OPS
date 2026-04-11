import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { modulePricingAPI } from '../services/api';
import { Sheet, SheetContent, SheetTrigger } from '../components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import CommandSearch from './CommandSearch';
import {
  LayoutDashboard, ShoppingCart, ChefHat, FileText, Settings, Table2,
  BarChart3, Wallet, LogOut, Menu, Search, Users, Building2, Globe,
  Printer, ClipboardList, UtensilsCrossed, Lock, Calendar, Clock, Receipt,
  ArrowRightLeft
} from 'lucide-react';

const MODULE_META = {
  pos: { label: 'POS', description: 'Point of Sale terminal, orders, payments, cash drawer, receipts and printer management.' },
  kds: { label: 'KDS', description: 'Kitchen Display System — real-time order routing to kitchen screens.' },
  qr_ordering: { label: 'QR Ordering', description: 'QR table ordering with a guest-facing digital menu.' },
  workforce: { label: 'Workforce', description: 'Shift scheduling, clock in/out, timesheets, payroll and the Heva Ops staff mobile app.' },
};

const platformMenu = [
  { path: '/platform/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/restaurants', icon: Building2, label: 'Businesses' },
  { path: '/platform/reports', icon: BarChart3, label: 'Platform Reports' },
  { path: '/platform/categories', icon: Globe, label: 'Categories' },
  { path: '/platform/settings', icon: Settings, label: 'Settings' },
];

// Core items (always visible for restaurant users)
const coreMenu = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', section: 'core' },
  { path: '/settings', icon: Settings, label: 'Settings', section: 'core' },
];

// Module-specific items
const moduleItems = {
  pos: [
    { path: '/pos', icon: ShoppingCart, label: 'POS Terminal' },
    { path: '/orders', icon: FileText, label: 'Orders' },
    { path: '/menu-management', icon: UtensilsCrossed, label: 'Menu' },
    { path: '/tables', icon: Table2, label: 'Tables' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
    { path: '/printers', icon: Printer, label: 'Printers' },
  ],
  kds: [
    { path: '/kds', icon: ChefHat, label: 'Kitchen (KDS)' },
  ],
  workforce: [
    { path: '/workforce/shifts', icon: Calendar, label: 'Shift Scheduler' },
    { path: '/workforce/attendance', icon: Clock, label: 'Attendance' },
    { path: '/workforce/timesheets', icon: Receipt, label: 'Timesheets' },
  ],
};

// Staff-specific items per module
const staffModuleItems = {
  pos: [
    { path: '/pos', icon: ShoppingCart, label: 'POS' },
    { path: '/orders', icon: FileText, label: 'Orders' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  ],
  kds: [
    { path: '/kds', icon: ChefHat, label: 'Kitchen (KDS)' },
  ],
  workforce: [
    { path: '/heva-ops/shifts', icon: Calendar, label: 'My Shifts' },
    { path: '/heva-ops/clock', icon: Clock, label: 'Clock In/Out' },
    { path: '/heva-ops/pay', icon: Wallet, label: 'My Pay' },
    { path: '/heva-ops/swaps', icon: ArrowRightLeft, label: 'Swap Requests' },
  ],
};

// Reports & Audit — shown only when relevant modules are active
// (Reports = POS data, Audit = order events)

function UpgradeModal({ open, onClose, moduleName }) {
  const meta = MODULE_META[moduleName] || {};
  const [price, setPrice] = useState(null);

  useEffect(() => {
    if (open && moduleName) {
      modulePricingAPI.get()
        .then(p => setPrice(p[moduleName]))
        .catch(() => {});
    }
  }, [open, moduleName]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="upgrade-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-500" />
            Unlock {meta.label || moduleName}
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            {meta.description}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 p-4 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl border border-indigo-100">
          <p className="text-sm text-slate-700 leading-relaxed">
            {moduleName === 'workforce' 
              ? 'Unlock Workforce to give your staff the Heva Ops mobile app for shift swaps, digital clock-in, and payroll tracking.'
              : `Enable ${meta.label} to expand your restaurant operations.`
            }
          </p>
          {price != null && (
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-indigo-700">{price.toFixed(2)}</span>
              <span className="text-sm text-slate-500">/month</span>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">Contact your platform administrator to enable this module.</p>
        </div>
        <Button variant="outline" onClick={() => onClose(false)} className="mt-2 w-full" data-testid="upgrade-modal-close">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function SidebarContent({ user, onLogout, onOpenSearch }) {
  const { hasFeature } = useAuth();
  const [upgradeModule, setUpgradeModule] = useState(null);

  if (user?.role === 'platform_owner') {
    return (
      <SidebarShell user={user} onLogout={onLogout} onOpenSearch={onOpenSearch}>
        {platformMenu.map(item => <SidebarLink key={item.path} item={item} />)}
      </SidebarShell>
    );
  }

  const isAdmin = user?.role === 'admin';

  // Build the dynamic menu
  const buildMenu = () => {
    const items = [];

    // Dashboard is always first
    items.push({ path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', enabled: true });

    // Staff Management removed — it's now inside Settings → User Management tab

    // Module sections
    const modules = ['pos', 'kds', 'workforce'];
    for (const mod of modules) {
      const enabled = hasFeature(mod);
      const modItems = isAdmin ? (moduleItems[mod] || []) : (staffModuleItems[mod] || []);
      
      if (modItems.length === 0 && !enabled) continue;

      // If enabled, add all items normally
      if (enabled) {
        modItems.forEach(mi => items.push({ ...mi, enabled: true }));
      } else if (isAdmin) {
        // Disabled module — show a single locked teaser item
        const firstItem = modItems[0] || { icon: Lock, label: MODULE_META[mod]?.label || mod };
        items.push({
          path: null,
          icon: firstItem.icon,
          label: MODULE_META[mod]?.label || mod,
          enabled: false,
          locked: true,
          moduleKey: mod,
        });
      }
    }

    // Reports & Audit: only when POS or KDS is active (they track orders)
    if (isAdmin) {
      if (hasFeature('pos') || hasFeature('kds') || hasFeature('qr_ordering')) {
        items.push({ path: '/reports', icon: BarChart3, label: 'Reports', enabled: true });
        items.push({ path: '/audit', icon: ClipboardList, label: 'Audit Log', enabled: true });
      }
      items.push({ path: '/settings', icon: Settings, label: 'Settings', enabled: true });
    }

    return items;
  };

  const menuItems = buildMenu();

  return (
    <>
      <UpgradeModal open={!!upgradeModule} onClose={() => setUpgradeModule(null)} moduleName={upgradeModule || ''} />
      <SidebarShell user={user} onLogout={onLogout} onOpenSearch={onOpenSearch}>
        {menuItems.map((item, i) => {
          if (item.locked) {
            return (
              <button
                key={`locked-${item.moduleKey}`}
                onClick={() => setUpgradeModule(item.moduleKey)}
                className="sidebar-link w-full opacity-50 hover:opacity-75 transition-opacity"
                data-testid={`nav-locked-${item.moduleKey}`}
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
                <span className="flex-1 text-left">{item.label}</span>
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              </button>
            );
          }
          return <SidebarLink key={item.path || i} item={item} />;
        })}
      </SidebarShell>
    </>
  );
}

function SidebarLink({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
      data-testid={`nav-${item.label.toLowerCase().replace(/[\s()]/g, '-')}`}
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function SidebarShell({ user, onLogout, onOpenSearch, children }) {
  return (
    <div className="flex flex-col h-full">
      <div className="mb-6" data-testid="sidebar-logo">
        <h1 className="font-heading text-xl font-bold tracking-tight text-white">Heva One</h1>
        <p className="text-[11px] tracking-[0.15em] uppercase text-slate-400 mt-0.5 font-medium">
          {user?.role === 'platform_owner' ? 'Platform' : user?.role === 'admin' ? 'Business' : 'Staff'}
        </p>
      </div>
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
      <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin" data-testid="sidebar-nav">
        {children}
      </nav>
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
      <aside className="sidebar-wrapper hidden md:flex flex-col" data-testid="desktop-sidebar">
        <SidebarContent user={user} onLogout={handleLogout} onOpenSearch={() => setSearchOpen(true)} />
      </aside>
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
          <h1 className="font-heading text-base font-bold text-slate-900 tracking-tight">Heva One</h1>
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
