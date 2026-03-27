import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { reportAPI, restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { TrendingUp, DollarSign, ShoppingBag, Package, Coins } from 'lucide-react';
import { toast } from 'sonner';

// Currency helper
const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GBP');

  useEffect(() => {
    loadStats();
    loadCurrency();
  }, []);

  const loadCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) {
        setCurrency(restaurant.currency);
      }
    } catch (error) {
      // Use default currency
    }
  };

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
      <Sidebar />
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
                      <Coins className="w-8 h-8 text-emerald-500" />
                      <div className="text-3xl font-bold font-mono">
                        {getCurrencySymbol(currency)}{stats?.total_sales?.toFixed(2) || '0.00'}
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
                        {getCurrencySymbol(currency)}{stats?.avg_order_value?.toFixed(2) || '0.00'}
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
                              {getCurrencySymbol(currency)}{product.revenue.toFixed(2)}
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