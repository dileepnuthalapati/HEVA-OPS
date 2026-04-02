import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { reportAPI, restaurantAPI, subscriptionAPI } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { TrendingUp, ShoppingBag, Package, Coins, Calendar, AlertTriangle, Clock } from 'lucide-react';

const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GBP');
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    loadStats();
    loadCurrency();
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const data = await subscriptionAPI.getMy();
      setSubscription(data);
    } catch (error) {}
  };

  const loadCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) setCurrency(restaurant.currency);
    } catch (error) {}
  };

  const loadStats = async () => {
    try {
      const data = await reportAPI.getTodayStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toLocaleDateString('en-GB', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2" data-testid="dashboard-heading">Today's Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>{today}</span>
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : (
            <>
              {/* Subscription Status Banner */}
              {subscription && (subscription.subscription_status === 'trial' || subscription.subscription_status === 'suspended') && (
                <Card className={`mb-4 ${subscription.subscription_status === 'suspended' ? 'border-red-300 bg-red-50' : subscription.trial_days_left <= 3 ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50'}`} data-testid="subscription-banner">
                  <CardContent className="p-3 md:p-4 flex items-center gap-3">
                    {subscription.subscription_status === 'suspended' ? (
                      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    ) : (
                      <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                    )}
                    <div className="text-sm">
                      {subscription.subscription_status === 'suspended' ? (
                        <span className="font-semibold text-red-700">Account suspended. Contact support to reactivate.</span>
                      ) : (
                        <span className={subscription.trial_days_left <= 3 ? 'font-semibold text-amber-700' : 'text-blue-700'}>
                          Trial: <strong>{subscription.trial_days_left} days left</strong>
                          {subscription.trial_days_left <= 3 && ' — Subscribe now to avoid interruption'}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                <Card className="metric-card" data-testid="metric-total-sales">
                  <CardHeader className="pb-2 px-4 pt-4 md:px-6 md:pt-6">
                    <CardDescription className="text-xs md:text-sm font-medium uppercase tracking-wider">
                      Today's Sales
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
                    <div className="flex items-center gap-3">
                      <Coins className="w-6 h-6 md:w-8 md:h-8 text-emerald-500 shrink-0" />
                      <div className="text-xl md:text-3xl font-bold font-mono">
                        {getCurrencySymbol(currency)}{stats?.total_sales?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      <span>Cash: <strong className="font-mono">{getCurrencySymbol(currency)}{stats?.cash_total?.toFixed(2) || '0.00'}</strong></span>
                      <span>Card: <strong className="font-mono">{getCurrencySymbol(currency)}{stats?.card_total?.toFixed(2) || '0.00'}</strong></span>
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  className="metric-card cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all" 
                  data-testid="metric-total-orders" 
                  onClick={() => navigate('/orders')}
                >
                  <CardHeader className="pb-2 px-4 pt-4 md:px-6 md:pt-6">
                    <CardDescription className="text-xs md:text-sm font-medium uppercase tracking-wider">
                      Today's Orders
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-6 h-6 md:w-8 md:h-8 text-blue-500 shrink-0" />
                      <div className="text-xl md:text-3xl font-bold font-mono">{stats?.total_orders || 0}</div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Click to view all orders</p>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-avg-order">
                  <CardHeader className="pb-2 px-4 pt-4 md:px-6 md:pt-6">
                    <CardDescription className="text-xs md:text-sm font-medium uppercase tracking-wider">
                      Avg Order Value
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-amber-500 shrink-0" />
                      <div className="text-xl md:text-3xl font-bold font-mono">
                        {getCurrencySymbol(currency)}{stats?.avg_order_value?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-top-products">
                  <CardHeader className="pb-2 px-4 pt-4 md:px-6 md:pt-6">
                    <CardDescription className="text-xs md:text-sm font-medium uppercase tracking-wider">
                      Top Products
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
                    <div className="flex items-center gap-3">
                      <Package className="w-6 h-6 md:w-8 md:h-8 text-purple-500 shrink-0" />
                      <div className="text-xl md:text-3xl font-bold font-mono">
                        {stats?.top_products?.length || 0}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {stats?.top_products && stats.top_products.length > 0 && (
                <Card data-testid="top-products-card">
                  <CardHeader className="px-4 md:px-6">
                    <CardTitle className="text-lg md:text-2xl font-semibold">Today's Top Selling</CardTitle>
                    <CardDescription>Best performers today</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 md:px-6">
                    <div className="space-y-3 md:space-y-4">
                      {stats.top_products.map((product, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 md:p-4 rounded-lg border bg-card"
                          data-testid={`top-product-${index}`}
                        >
                          <div className="flex items-center gap-3 md:gap-4 min-w-0">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm md:text-base shrink-0">
                              #{index + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm md:text-lg truncate">{product.name}</div>
                              <div className="text-xs md:text-sm text-muted-foreground">
                                {product.quantity} sold today
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className="text-base md:text-xl font-bold font-mono text-emerald-600">
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
