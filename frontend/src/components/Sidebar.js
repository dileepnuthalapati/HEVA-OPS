import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from './ui/sheet';
import { 
  LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, 
  Wallet, Settings, Users, Printer, BarChart3, Globe, Building2, Menu
} from 'lucide-react';

const platformOwnerMenu = [
  { path: '/platform/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/restaurants', icon: Building2, label: 'Restaurants' },
  { path: '/platform/categories', icon: Globe, label: 'Global Categories' },
  { path: '/platform/reports', icon: BarChart3, label: 'Platform Reports' },
  { path: '/platform/settings', icon: Settings, label: 'Platform Settings' },
];

const restaurantAdminMenu = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/tables', icon: Users, label: 'Tables' },
  { path: '/categories', icon: FolderTree, label: 'Categories' },
  { path: '/products', icon: Package, label: 'Products' },
  { path: '/pos', icon: ShoppingCart, label: 'POS' },
  { path: '/orders', icon: FileText, label: 'Orders' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  { path: '/printers', icon: Printer, label: 'Printers' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const posStaffMenu = [
  { path: '/pos', icon: ShoppingCart, label: 'POS' },
  { path: '/orders', icon: FileText, label: 'Orders' },
];

const Sidebar = ({ title = 'HevaPOS', subtitle = '' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isPlatformOwner, isRestaurantAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  let menuItems = posStaffMenu;
  let defaultSubtitle = 'POS Terminal';
  
  if (isPlatformOwner) {
    menuItems = platformOwnerMenu;
    defaultSubtitle = 'Platform Management';
  } else if (isRestaurantAdmin) {
    menuItems = restaurantAdminMenu;
    defaultSubtitle = 'Restaurant Admin';
  }

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="sidebar hidden md:flex">
        <div className="mb-6 flex-shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 opacity-80">{subtitle || defaultSubtitle}</p>
          {user && <p className="text-xs mt-2 opacity-60">Logged in as: {user.username}</p>}
        </div>
        <nav className="space-y-1 flex-1 overflow-y-auto">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`sidebar-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex-shrink-0 pt-4 mt-4 border-t border-white/10">
          <Button
            variant="outline"
            data-testid="logout-button"
            className="w-full justify-start bg-transparent border-white/20 text-white hover:bg-white/10"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </Button>
        </div>
      </div>

      {/* Mobile Header + Sheet Menu */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">{title}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-70">{user?.username}</span>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="text-white p-1" data-testid="mobile-menu-button">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent 
              side="right" 
              className="w-[280px] bg-slate-900 text-white border-slate-700 p-0 flex flex-col"
            >
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              
              {/* Header inside sheet */}
              <div className="p-4 pb-2 flex-shrink-0">
                <h2 className="text-xl font-bold">{title}</h2>
                <p className="text-sm opacity-70 mt-1">{subtitle || defaultSubtitle}</p>
                {user && <p className="text-xs mt-1 opacity-50">Logged in as: {user.username}</p>}
              </div>

              {/* Scrollable nav links */}
              <div className="flex-1 overflow-y-auto px-3 py-2">
                <nav className="flex flex-col gap-1">
                  {menuItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={handleNavClick}
                      data-testid={`mobile-sidebar-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                        location.pathname === item.path 
                          ? 'bg-blue-600 text-white' 
                          : 'text-white/90 hover:bg-white/10 active:bg-white/20'
                      }`}
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </nav>
              </div>

              {/* Logout pinned at bottom */}
              <div className="flex-shrink-0 p-4 border-t border-white/10">
                <Button
                  variant="outline"
                  data-testid="mobile-logout-button"
                  className="w-full justify-start bg-transparent border-white/20 text-white hover:bg-white/10"
                  onClick={handleLogout}
                >
                  <LogOut className="w-5 h-5 mr-3" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Spacer for mobile header */}
      <div className="md:hidden h-14 flex-shrink-0" />
    </>
  );
};

export default Sidebar;
