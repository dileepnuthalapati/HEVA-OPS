import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { 
  LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, 
  Wallet, Settings, Users, Printer, Store, BarChart3, Globe, Building2, Menu
} from 'lucide-react';

// Platform Owner Menu
const platformOwnerMenu = [
  { path: '/platform/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/restaurants', icon: Building2, label: 'Restaurants' },
  { path: '/platform/categories', icon: Globe, label: 'Global Categories' },
  { path: '/platform/reports', icon: BarChart3, label: 'Platform Reports' },
  { path: '/platform/settings', icon: Settings, label: 'Platform Settings' },
];

// Restaurant Admin Menu
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

// POS Staff Menu
const posStaffMenu = [
  { path: '/pos', icon: ShoppingCart, label: 'POS' },
  { path: '/orders', icon: FileText, label: 'Orders' },
];

const Sidebar = ({ title = 'HevaPOS', subtitle = '' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isPlatformOwner, isRestaurantAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Select menu based on user role
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
    logout();
    navigate('/login');
  };

  const NavContent = ({ onItemClick }) => (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1 opacity-80">{subtitle || defaultSubtitle}</p>
        {user && (
          <p className="text-xs mt-2 opacity-60">
            Logged in as: {user.username}
          </p>
        )}
      </div>
      
      <nav className="space-y-2 flex-1">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={onItemClick}
            data-testid={`sidebar-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      
      <div className="mt-auto pt-8">
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
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="sidebar hidden md:flex">
        <NavContent />
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">{title}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-70">{user?.username}</span>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="text-white">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] bg-slate-900 text-white border-slate-700 p-4">
              <NavContent onItemClick={() => setMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Spacer for mobile header */}
      <div className="md:hidden h-14" />
    </>
  );
};

export default Sidebar;
