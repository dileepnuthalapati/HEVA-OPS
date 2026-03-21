import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, TrendingUp, DollarSign, ShoppingBag, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const Sidebar = ({ active }) => {
  const { logout } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/restaurants', icon: Store, label: 'Restaurants' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Panel</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            data-testid={`sidebar-link-${item.label.toLowerCase()}`}
            className={`sidebar-link ${active === item.path ? 'active' : ''}`}
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
          onClick={logout}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const location = useLocation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const data = await reportAPI.getStats(weekAgo, today);
      setStats(data);
    } catch (error) {
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your restaurant performance</p>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card className="metric-card" data-testid="metric-total-sales">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Total Sales
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-8 h-8 text-emerald-500" />
                      <div className="text-3xl font-bold font-mono">
                        ${stats?.total_sales?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-total-orders">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Total Orders
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-8 h-8 text-blue-500" />
                      <div className="text-3xl font-bold font-mono">{stats?.total_orders || 0}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-avg-order">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Avg Order Value
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-8 h-8 text-amber-500" />
                      <div className="text-3xl font-bold font-mono">
                        ${stats?.avg_order_value?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-top-products">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Top Products
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Package className="w-8 h-8 text-purple-500" />
                      <div className="text-3xl font-bold font-mono">
                        {stats?.top_products?.length || 0}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {stats?.top_products && stats.top_products.length > 0 && (
                <Card data-testid="top-products-card">
                  <CardHeader>
                    <CardTitle className="text-2xl font-semibold">Top Selling Products</CardTitle>
                    <CardDescription>Best performers in the last 7 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {stats.top_products.map((product, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 rounded-lg border bg-card"
                          data-testid={`top-product-${index}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary">
                              #{index + 1}
                            </div>
                            <div>
                              <div className="font-semibold text-lg">{product.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {product.quantity} units sold
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold font-mono text-emerald-600">
                              ${product.revenue.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">Revenue</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;