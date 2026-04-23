import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { modulePricingAPI } from '../services/api';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '../components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import CommandSearch from './CommandSearch';
import InstallAppButton from './InstallAppButton';
import {
  LayoutDashboard, ShoppingCart, ChefHat, FileText, Settings, Table2,
  BarChart3, Wallet, LogOut, Menu, Search, Building2, Globe,
  Printer, ClipboardList, UtensilsCrossed, Lock, Calendar, Clock, Receipt,
  ArrowRightLeft, ChevronsUpDown, Check, Store, Users as UsersIcon,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────
// Module metadata & workspace definition
// ──────────────────────────────────────────────────────────────────────

const MODULE_META = {
  pos: { label: 'POS', description: 'Point of Sale terminal, orders, payments, cash drawer, receipts and printer management.' },
  kds: { label: 'KDS', description: 'Kitchen Display System — real-time order routing to kitchen screens.' },
  qr_ordering: { label: 'QR Ordering', description: 'QR table ordering with a guest-facing digital menu.' },
  workforce: { label: 'Workforce', description: 'Shift scheduling, clock in/out, timesheets, payroll and the Heva Ops staff mobile app.' },
};

// Admin workspaces — each defines its icon, label, subtitle & page list.
// `defaultPath` is where the switcher lands the user when they pick this
// workspace. This is intentionally a fixed home (NOT the last-visited page)
// because the user prefers "start fresh" behaviour when switching contexts.
const ADMIN_WORKSPACES = {
  pos: {
    key: 'pos',
    label: 'Point of Sale',
    subtitle: 'Orders · Menu · Tables',
    icon: Store,
    requires: ['pos', 'kds', 'qr_ordering'], // any one of these enables the workspace
    defaultPath: '/dashboard',
    items: [
      { path: '/pos', icon: ShoppingCart, label: 'POS Terminal', requires: 'pos' },
      { path: '/orders', icon: FileText, label: 'Orders', requires: 'pos' },
      { path: '/menu-management', icon: UtensilsCrossed, label: 'Menu', requires: 'pos' },
      { path: '/tables', icon: Table2, label: 'Tables', requires: 'pos' },
      { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer', requires: 'pos' },
      { path: '/printers', icon: Printer, label: 'Printers', requires: 'pos' },
      { path: '/reports', icon: BarChart3, label: 'Reports' },
      { path: '/audit', icon: ClipboardList, label: 'Audit Log' },
    ],
  },
  kds: {
    key: 'kds',
    label: 'Kitchen Display',
    subtitle: 'Live tickets',
    icon: ChefHat,
    requires: ['kds'],
    defaultPath: '/kds',
    items: [
      { path: '/kds', icon: ChefHat, label: 'Kitchen (KDS)', requires: 'kds' },
    ],
  },
  workforce: {
    key: 'workforce',
    label: 'Workforce',
    subtitle: 'Schedule · HR · Payroll',
    icon: UsersIcon,
    requires: ['workforce'],
    defaultPath: '/workforce/shifts',
    items: [
      { path: '/workforce/shifts', icon: Calendar, label: 'Shift Scheduler' },
      { path: '/workforce/attendance', icon: Clock, label: 'Attendance' },
      { path: '/workforce/timesheets', icon: Receipt, label: 'Timesheets' },
    ],
  },
};

// Staff workspaces (when staff has multiple module access)
const STAFF_WORKSPACES = {
  pos: {
    key: 'pos',
    label: 'POS',
    subtitle: 'Orders · Cash',
    icon: Store,
    requires: ['pos'],
    defaultPath: '/pos',
    items: [
      { path: '/pos', icon: ShoppingCart, label: 'POS' },
      { path: '/orders', icon: FileText, label: 'Orders' },
      { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
    ],
  },
  kds: {
    key: 'kds',
    label: 'Kitchen',
    subtitle: 'Live tickets',
    icon: ChefHat,
    requires: ['kds'],
    defaultPath: '/kds',
    items: [
      { path: '/kds', icon: ChefHat, label: 'Kitchen (KDS)' },
    ],
  },
  workforce: {
    key: 'workforce',
    label: 'Heva Ops',
    subtitle: 'My shifts · pay',
    icon: UsersIcon,
    requires: ['workforce'],
    defaultPath: '/heva-ops/shifts',
    items: [
      { path: '/heva-ops/shifts', icon: Calendar, label: 'My Shifts' },
      { path: '/heva-ops/clock', icon: Clock, label: 'Clock In/Out' },
      { path: '/heva-ops/pay', icon: Wallet, label: 'My Pay' },
      { path: '/heva-ops/swaps', icon: ArrowRightLeft, label: 'Swap Requests' },
    ],
  },
};

const platformMenu = [
  { path: '/platform/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/restaurants', icon: Building2, label: 'Businesses' },
  { path: '/platform/reports', icon: BarChart3, label: 'Platform Reports' },
  { path: '/platform/categories', icon: Globe, label: 'Categories' },
  { path: '/platform/settings', icon: Settings, label: 'Settings' },
];

const WORKSPACE_STORAGE_KEY = 'heva_active_workspace';

// ──────────────────────────────────────────────────────────────────────
// Upgrade modal (unchanged behaviour, shown when clicking a locked workspace)
// ──────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────
// Workspace Switcher — the dropdown above nav links
// ──────────────────────────────────────────────────────────────────────

function WorkspaceSwitcher({ workspaces, activeKey, onSelect, lockedWorkspaces, onLockedClick }) {
  const [open, setOpen] = useState(false);
  // Holds the action queued by a menu-item click. We only execute it AFTER
  // the dropdown has fully closed (open === false has been committed + Radix
  // portal has unmounted). This is the ONLY reliable way across Chromium,
  // Safari, and Android WebView to avoid the orphaned-portal race that was
  // leaving an invisible overlay on top of the next page.
  const [pending, setPending] = useState(null);
  useEffect(() => {
    if (pending && !open) {
      const fn = pending;
      setPending(null);
      // A microtask defer ensures React has finished unmounting the portal
      // subtree before the navigation-triggered re-render begins.
      Promise.resolve().then(fn);
    }
  }, [pending, open]);

  const active = workspaces.find(w => w.key === activeKey) || workspaces[0];
  if (!active) return null;
  const ActiveIcon = active.icon;
  const hasMultiple = workspaces.length + lockedWorkspaces.length > 1;

  const handleChoose = (fn) => {
    setPending(() => fn);
    setOpen(false);
  };

  // If the user only has one workspace available, render it as a static header (no dropdown)
  if (!hasMultiple) {
    return (
      <div
        className="flex items-center gap-2 w-full px-2.5 py-2 mb-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
        data-testid="workspace-static"
      >
        <div className="w-7 h-7 rounded-md bg-indigo-500/20 flex items-center justify-center text-indigo-300">
          <ActiveIcon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{active.label}</p>
          <p className="text-[10px] text-slate-400 truncate">{active.subtitle}</p>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 w-full px-2.5 py-2 mb-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 transition-all group"
          data-testid="workspace-switcher"
        >
          <div className="w-7 h-7 rounded-md bg-indigo-500/20 flex items-center justify-center text-indigo-300 shrink-0">
            <ActiveIcon className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-semibold text-white truncate">{active.label}</p>
            <p className="text-[10px] text-slate-400 truncate">{active.subtitle}</p>
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:text-slate-200 transition-colors" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[230px]"
        data-testid="workspace-dropdown"
      >
        <DropdownMenuLabel className="text-[10px] tracking-[0.15em] uppercase text-slate-500 font-bold">
          Switch workspace
        </DropdownMenuLabel>
        {workspaces.map(ws => {
          const Icon = ws.icon;
          const isActive = ws.key === activeKey;
          return (
            <DropdownMenuItem
              key={ws.key}
              onClick={() => handleChoose(() => onSelect(ws.key))}
              className="cursor-pointer flex items-center gap-2.5 py-2"
              data-testid={`workspace-option-${ws.key}`}
            >
              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ws.label}</p>
                <p className="text-[10px] text-slate-400 truncate">{ws.subtitle}</p>
              </div>
              {isActive && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
        {lockedWorkspaces.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] tracking-[0.15em] uppercase text-slate-400 font-bold">
              Available to unlock
            </DropdownMenuLabel>
            {lockedWorkspaces.map(ws => {
              const Icon = ws.icon;
              return (
                <DropdownMenuItem
                  key={ws.key}
                  onClick={() => handleChoose(() => onLockedClick(ws.key))}
                  className="cursor-pointer flex items-center gap-2.5 py-2 opacity-70"
                  data-testid={`workspace-locked-${ws.key}`}
                >
                  <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-400 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ws.label}</p>
                    <p className="text-[10px] text-slate-400 truncate">{ws.subtitle}</p>
                  </div>
                  <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Nav link primitive
// ──────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────
// Main Sidebar content (admin + staff)
// ──────────────────────────────────────────────────────────────────────

function SidebarContent({ user, onLogout, onOpenSearch }) {
  const { hasFeature, hasCapability } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [upgradeModule, setUpgradeModule] = useState(null);

  const isPlatform = user?.role === 'platform_owner';
  const isAdmin = user?.role === 'admin';
  // Staff granted `workforce.manage_rota` → treat as admin for Workforce UI
  // purposes (see also App.js ProtectedRoute capability= override). Their
  // workspace items include the admin rota/attendance/timesheet screens.
  const canManageRota = !isAdmin && hasCapability('workforce.manage_rota');

  // Build workspace definitions on the fly for the manage-rota persona: use
  // the Staff workspaces as the base, but swap the Workforce block for the
  // admin one so they can access Shift Scheduler + Attendance + Timesheets.
  const workspaceDefs = useMemo(() => {
    if (isAdmin) return ADMIN_WORKSPACES;
    if (canManageRota) {
      return {
        ...STAFF_WORKSPACES,
        workforce: {
          ...ADMIN_WORKSPACES.workforce,
          label: 'Workforce',
          subtitle: 'Rota · Attendance · Timesheets',
        },
      };
    }
    return STAFF_WORKSPACES;
  }, [isAdmin, canManageRota]);

  // Compute which workspaces are enabled vs locked (safe even for platform owner)
  const { enabled, locked } = useMemo(() => {
    if (isPlatform) return { enabled: [], locked: [] };
    const en = [];
    for (const ws of Object.values(workspaceDefs)) {
      const isEnabled = ws.requires.some(f => hasFeature(f));
      if (isEnabled) en.push(ws);
      // Previously we pushed disabled workspaces into a "locked" list so
      // admins saw an upgrade prompt. Removed per product direction: a
      // workforce-only customer (healthcare / retail etc.) shouldn't see POS
      // or KDS upsell inside their sidebar — the switcher should only show
      // what the business actually pays for.
    }
    return { enabled: en, locked: [] };
  }, [workspaceDefs, hasFeature, isAdmin, isPlatform]);

  // Active workspace state — derived from URL first, then localStorage, then first enabled
  const [activeKey, setActiveKey] = useState(() => {
    try {
      const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (stored && workspaceDefs[stored]) return stored;
    } catch {}
    return null;
  });

  // Default to the first enabled workspace once enabled list is computed
  useEffect(() => {
    if (!activeKey && enabled.length > 0) {
      setActiveKey(enabled[0].key);
    }
  }, [enabled, activeKey]);

  // Auto-switch workspace when the user navigates to a route belonging to a
  // different workspace. We intentionally do NOT persist per-workspace last
  // paths — switching a workspace should always land on the workspace's
  // default home page (set at workspace level via `defaultPath`).
  useEffect(() => {
    if (isPlatform) return;
    const path = location.pathname;
    const matchingWs = enabled.find(ws => ws.items.some(it => it.path === path));
    if (matchingWs && matchingWs.key !== activeKey) {
      setActiveKey(matchingWs.key);
      try { localStorage.setItem(WORKSPACE_STORAGE_KEY, matchingWs.key); } catch {}
    }
  }, [location.pathname, enabled, activeKey, isPlatform]);

  // If currently active workspace got disabled (e.g. feature turned off), fall back
  useEffect(() => {
    if (isPlatform) return;
    if (activeKey && !enabled.find(w => w.key === activeKey)) {
      const fallback = enabled[0]?.key || null;
      setActiveKey(fallback);
      if (fallback) {
        try { localStorage.setItem(WORKSPACE_STORAGE_KEY, fallback); } catch {}
      }
    }
  }, [enabled, activeKey, isPlatform]);

  // Early return for platform owner — after all hooks
  if (isPlatform) {
    return (
      <SidebarShell user={user} onLogout={onLogout} onOpenSearch={onOpenSearch}>
        <div className="pt-1">
          {platformMenu.map(item => <SidebarLink key={item.path} item={item} />)}
        </div>
      </SidebarShell>
    );
  }

  const handleSelectWorkspace = (key) => {
    setActiveKey(key);
    try { localStorage.setItem(WORKSPACE_STORAGE_KEY, key); } catch {}
    // Always land on the workspace's fixed home page. We deliberately ignore
    // any "last-visited" state — users prefer predictable navigation:
    //   POS → /dashboard, KDS → /kds, Workforce → /workforce/shifts
    // Staff equivalents live in STAFF_WORKSPACES.defaultPath.
    const ws = enabled.find(w => w.key === key);
    const target = ws?.defaultPath || '/dashboard';
    if (target && target !== location.pathname) navigate(target);
  };

  const activeWorkspace = enabled.find(w => w.key === activeKey);
  // Filter items based on feature flags (items can have their own `requires`)
  const visibleItems = (activeWorkspace?.items || []).filter(
    it => !it.requires || hasFeature(it.requires)
  );

  return (
    <>
      <UpgradeModal open={!!upgradeModule} onClose={() => setUpgradeModule(null)} moduleName={upgradeModule || ''} />
      <SidebarShell user={user} onLogout={onLogout} onOpenSearch={onOpenSearch}>
        {/* Workspace Switcher (only for admin/staff, not platform owner) */}
        {enabled.length > 0 && (
          <WorkspaceSwitcher
            workspaces={enabled}
            activeKey={activeKey}
            onSelect={handleSelectWorkspace}
            lockedWorkspaces={locked}
            onLockedClick={(key) => setUpgradeModule(key)}
          />
        )}

        {/* Dashboard / Overview — pinned at the top for full admins only.
            A `workforce.manage_rota` staff is a team lead, not a business
            owner — they get their workforce items but not the business
            overview or settings (those remain exclusive to admin). */}
        {isAdmin && (
          <div className="space-y-0.5">
            <SidebarLink item={{
              path: '/dashboard',
              icon: LayoutDashboard,
              label: (enabled.length === 1 && enabled[0].key === 'workforce') ? 'Overview' : 'Dashboard',
            }} />
          </div>
        )}

        {/* Dynamic module section for current workspace */}
        {visibleItems.length > 0 && (
          <>
            <div className="mt-3 mb-0.5 px-3">
              <span className="text-[9px] tracking-[0.15em] uppercase font-bold text-slate-500">
                {activeWorkspace?.label}
              </span>
            </div>
            <div className="space-y-0.5">
              {visibleItems.map(item => (
                <SidebarLink key={item.path} item={item} />
              ))}
            </div>
          </>
        )}

        {/* Empty state: no modules enabled at all (brand new business) */}
        {enabled.length === 0 && isAdmin && (
          <div className="mt-6 px-3 py-4 rounded-xl bg-slate-800/40 border border-slate-700/40 text-center">
            <Lock className="w-5 h-5 text-amber-400 mx-auto mb-2" />
            <p className="text-xs text-slate-300 font-medium">No modules active</p>
            <p className="text-[10px] text-slate-500 mt-1">Contact your platform admin.</p>
          </div>
        )}
      </SidebarShell>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sidebar shell (logo, search, nav slot, settings pin, user pin, logout)
// ──────────────────────────────────────────────────────────────────────

function SidebarShell({ user, onLogout, onOpenSearch, children }) {
  const isPlatform = user?.role === 'platform_owner';
  return (
    <div className="flex flex-col h-full">
      <div className="mb-3" data-testid="sidebar-logo">
        <h1 className="font-heading text-lg font-bold tracking-tight text-white">Heva ONE</h1>
        <p className="text-[10px] tracking-[0.15em] uppercase text-slate-400 mt-0.5 font-medium">
          {isPlatform ? 'Platform' : user?.role === 'admin' ? 'Business' : 'Staff'}
        </p>
      </div>
      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2 w-full px-2.5 py-2 mb-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 text-xs transition-all border border-slate-700/50"
        data-testid="sidebar-search-trigger"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="hidden sm:inline text-[9px] font-mono px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 border border-slate-600">
          Ctrl K
        </kbd>
      </button>
      <nav className="flex-1 overflow-y-auto scrollbar-thin min-h-0" data-testid="sidebar-nav">
        {children}
      </nav>

      {/* Settings — permanently pinned just above the user/logout block (admin only) */}
      {user?.role === 'admin' && (
        <div className="pt-2 border-t border-slate-700/40">
          <SidebarLink item={{ path: '/settings', icon: Settings, label: 'Settings' }} />
        </div>
      )}

      {/* User + logout — pinned at the very bottom */}
      <div className="mt-1 pt-2 border-t border-slate-700/40">
        <div className="px-2 mb-2">
          <InstallAppButton variant="sidebar" />
        </div>
        <div className="flex items-center gap-2 px-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-300 text-xs font-bold">
            {(user?.username || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate" data-testid="sidebar-username">{user?.username}</p>
            <p className="text-[10px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
          data-testid="logout-button"
        >
          <LogOut className="w-[16px] h-[16px]" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Outer shell: desktop + mobile drawer
// ──────────────────────────────────────────────────────────────────────

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-close the mobile drawer whenever the route changes. Without this,
  // the Sheet's overlay can linger on top of the new page and block clicks —
  // giving the impression that the app has "frozen" and needs a hard refresh.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
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
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 glass"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
        data-testid="mobile-header"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors" data-testid="mobile-menu-toggle">
                <Menu className="w-5 h-5 text-slate-700" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 bg-gradient-to-b from-[#0F172A] to-[#1E293B] border-none">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <div className="p-5 h-full">
                <SidebarContent user={user} onLogout={handleLogout} onOpenSearch={() => setSearchOpen(true)} />
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="font-heading text-base font-bold text-slate-900 tracking-tight">Heva ONE</h1>
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
