import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { orderAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Calendar } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout, isAdmin } = useAuth();

  const adminMenuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
  ];

  const userMenuItems = [
    { path: '/pos', icon: ShoppingCart, label: 'POS' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
  ];

  const menuItems = isAdmin ? adminMenuItems : userMenuItems;

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">{isAdmin ? 'Admin Panel' : 'User Panel'}</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const OrderHistory = () => {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await orderAPI.getAll();
      setOrders(data);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Order History</h1>
            <p className="text-muted-foreground">View all completed orders</p>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading orders...</div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No orders yet. Complete your first order to see it here.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} data-testid={`order-item-${order.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-bold">Order #{order.id.slice(0, 8)}</div>
                          {order.status === 'pending' && (
                            <div className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                              Pending Payment
                            </div>
                          )}
                          {order.status === 'completed' && (
                            <div className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                              Completed - {order.payment_method?.toUpperCase()}
                            </div>
                          )}
                          {!order.synced && (
                            <div className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                              Offline
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground font-normal flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {formatDate(order.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono text-emerald-600">
                          ${order.total_amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">by {order.created_by}</div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {order.items.map((item, index) => (
                        <div
                          key={index}
                          data-testid={`order-item-product-${index}`}
                          className="flex justify-between items-center p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-sm text-muted-foreground">
                              ${item.unit_price.toFixed(2)} × {item.quantity}
                            </div>
                          </div>
                          <div className="font-bold font-mono">${item.total.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderHistory;