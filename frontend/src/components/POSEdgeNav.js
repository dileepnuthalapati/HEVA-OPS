import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ShoppingCart, FileText, Table2, Wallet, Printer,
  BarChart3, ClipboardList, UtensilsCrossed, ChefHat, Calendar, Clock,
  Receipt, Settings, LogOut, ChevronRight, Users as UsersIcon,
} from 'lucide-react';

/**
 * POSEdgeNav — a subtle 8px hot-zone on the left edge of full-screen pages
 * (POS, KDS). Slides out a mini navigation panel on hover.
 *
 * Behaviour:
 *   • Only renders on desktop (md:flex). On touch/mobile the existing
 *     "← Dashboard" button in the top bar remains the primary escape hatch.
 *   • 8px invisible hot-strip on the left. Hovering it reveals the panel.
 *   • Panel stays open while hovered (and has a 200ms grace period after
 *     leave, so you don't lose it when moving diagonally to click a link).
 *   • Shows a small workspace switcher + Dashboard/Overview + Settings + Logout.
 */

const POS_LINKS = [
  { path: '/pos', icon: ShoppingCart, label: 'POS Terminal' },
  { path: '/orders', icon: FileText, label: 'Orders' },
  { path: '/menu-management', icon: UtensilsCrossed, label: 'Menu' },
  { path: '/tables', icon: Table2, label: 'Tables' },
  { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  { path: '/printers', icon: Printer, label: 'Printers' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/audit', icon: ClipboardList, label: 'Audit Log' },
];

const KDS_LINKS = [
  { path: '/kds', icon: ChefHat, label: 'Kitchen (KDS)' },
];

const WORKFORCE_LINKS = [
  { path: '/workforce/shifts', icon: Calendar, label: 'Shift Scheduler' },
  { path: '/workforce/attendance', icon: Clock, label: 'Attendance' },
  { path: '/workforce/timesheets', icon: Receipt, label: 'Timesheets' },
];

export default function POSEdgeNav({ currentPath = '/pos' }) {
  const navigate = useNavigate();
  const { user, logout, hasFeature } = useAuth();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);

  const hasPOS = hasFeature('pos');
  const hasKDS = hasFeature('kds');
  const hasWorkforce = hasFeature('workforce');
  const onlyWorkforce = hasWorkforce && !hasPOS && !hasKDS;
  const dashLabel = onlyWorkforce ? 'Overview' : 'Dashboard';

  const handleEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };

  useEffect(() => () => closeTimer.current && clearTimeout(closeTimer.current), []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Active workspace links based on current path
  let workspaceLinks = [];
  let workspaceLabel = '';
  if (currentPath.startsWith('/pos') || currentPath.startsWith('/orders') || currentPath.startsWith('/menu') || currentPath.startsWith('/tables') || currentPath.startsWith('/cash') || currentPath.startsWith('/printer') || currentPath.startsWith('/reports') || currentPath.startsWith('/audit')) {
    workspaceLinks = POS_LINKS.filter(() => hasPOS);
    workspaceLabel = 'Point of Sale';
  } else if (currentPath.startsWith('/kds')) {
    workspaceLinks = KDS_LINKS.filter(() => hasKDS);
    workspaceLabel = 'Kitchen';
  } else if (currentPath.startsWith('/workforce')) {
    workspaceLinks = WORKFORCE_LINKS.filter(() => hasWorkforce);
    workspaceLabel = 'Workforce';
  }

  return (
    <>
      {/* Invisible 8px hot-zone on the left edge (desktop only) */}
      <div
        className="hidden md:block fixed top-0 left-0 w-2 h-full z-40"
        onMouseEnter={handleEnter}
        data-testid="pos-edge-hot-zone"
      />

      {/* Slide-out panel */}
      <div
        className={`hidden md:flex fixed top-0 left-0 h-full z-50 flex-col bg-gradient-to-b from-[#0F172A] to-[#1E293B] shadow-2xl transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: '240px' }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        data-testid="pos-edge-nav"
      >
        <div className="p-5 flex flex-col h-full">
          <div className="mb-5">
            <h1 className="font-heading text-lg font-bold tracking-tight text-white">Heva One</h1>
            <p className="text-[10px] tracking-[0.15em] uppercase text-slate-400 mt-0.5 font-medium">Quick Nav</p>
          </div>

          {/* Dashboard / Overview pinned */}
          <button
            onClick={() => navigate(user?.role === 'platform_owner' ? '/platform/dashboard' : '/dashboard')}
            className="sidebar-link w-full mb-3"
            data-testid="pos-edge-nav-dashboard"
          >
            <LayoutDashboard className="w-[18px] h-[18px]" strokeWidth={2} />
            <span>{dashLabel}</span>
          </button>

          {/* Current workspace section */}
          {workspaceLinks.length > 0 && (
            <>
              <div className="px-3 mb-1">
                <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-slate-500">{workspaceLabel}</span>
              </div>
              <nav className="space-y-0.5 mb-3">
                {workspaceLinks.map(link => {
                  const Icon = link.icon;
                  const isActive = currentPath === link.path;
                  return (
                    <button
                      key={link.path}
                      onClick={() => navigate(link.path)}
                      className={`sidebar-link w-full ${isActive ? 'active' : ''}`}
                      data-testid={`pos-edge-nav-${link.label.toLowerCase().replace(/[\s()]/g, '-')}`}
                    >
                      <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
                      <span>{link.label}</span>
                    </button>
                  );
                })}
              </nav>
            </>
          )}

          {/* Cross-workspace jump hints (if user has others enabled) */}
          {(hasPOS + hasKDS + hasWorkforce) > 1 && (
            <>
              <div className="px-3 mb-1 mt-1">
                <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-slate-500">Switch to</span>
              </div>
              <div className="space-y-0.5 mb-3">
                {hasPOS && workspaceLabel !== 'Point of Sale' && (
                  <button onClick={() => navigate('/pos')} className="sidebar-link w-full text-slate-300" data-testid="pos-edge-jump-pos">
                    <ShoppingCart className="w-[18px] h-[18px]" />
                    <span>Point of Sale</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                  </button>
                )}
                {hasKDS && workspaceLabel !== 'Kitchen' && (
                  <button onClick={() => navigate('/kds')} className="sidebar-link w-full text-slate-300" data-testid="pos-edge-jump-kds">
                    <ChefHat className="w-[18px] h-[18px]" />
                    <span>Kitchen Display</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                  </button>
                )}
                {hasWorkforce && workspaceLabel !== 'Workforce' && (
                  <button onClick={() => navigate('/workforce/shifts')} className="sidebar-link w-full text-slate-300" data-testid="pos-edge-jump-workforce">
                    <UsersIcon className="w-[18px] h-[18px]" />
                    <span>Workforce</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                  </button>
                )}
              </div>
            </>
          )}

          {/* Bottom: Settings + Logout */}
          <div className="mt-auto pt-3 border-t border-slate-700/40">
            {user?.role === 'admin' && (
              <button
                onClick={() => navigate('/settings')}
                className="sidebar-link w-full"
                data-testid="pos-edge-nav-settings"
              >
                <Settings className="w-[18px] h-[18px]" />
                <span>Settings</span>
              </button>
            )}
            <div className="flex items-center gap-3 px-2 mt-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-300 text-sm font-bold">
                {(user?.username || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
                <p className="text-[11px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
              data-testid="pos-edge-nav-logout"
            >
              <LogOut className="w-[18px] h-[18px]" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
