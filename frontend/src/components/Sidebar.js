import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { 
  LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, 
  Wallet, Settings, Users, Printer, Store, BarChart3, Globe, Building2
} from 'lucide-react';

// Platform Owner Menu - manages all restaurants
const platformOwnerMenu = [
  { path: '/platform/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/restaurants', icon: Building2, label: 'Restaurants' },
  { path: '/platform/categories', icon: Globe, label: 'Global Categories' },
  { path: '/platform/reports', icon: BarChart3, label: 'Platform Reports' },
  { path: '/platform/settings', icon: Settings, label: 'Platform Settings' },
];

// Restaurant Admin Menu - manages their restaurant
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

// POS Staff Menu - limited to POS operations
const posStaffMenu = [
  { path: '/pos', icon: ShoppingCart, label: 'POS' },
  { path: '/orders', icon: FileText, label: 'Orders' },
];

const Sidebar = ({ title = 'HevaPOS', subtitle = '' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isPlatformOwner, isRestaurantAdmin } = useAuth();

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

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle || defaultSubtitle}</p>
        {user && (
          <p className="text-xs text-muted-foreground mt-2 opacity-70">
            Logged in as: {user.username}
          </p>
        )}
      </div>
      
      <nav className="space-y-2 flex-1">
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
      
      <div className="mt-auto pt-8">
        <Button
          variant="outline"
          data-testid="logout-button"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
