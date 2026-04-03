import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { reportAPI, restaurantAPI, subscriptionAPI, tableAPI } from '../services/api';
import api from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { toast } from 'sonner';
import { 
  TrendingUp, ShoppingBag, Package, Coins, Calendar, 
  AlertTriangle, Clock, CreditCard, Banknote, QrCode,
  MonitorSmartphone, UtensilsCrossed, Power, ChefHat
} from 'lucide-react';

const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '\u00a3', 'USD': '$', 'EUR': '\u20ac', 'INR': '\u20b9' };
  return symbols[currency] || currency || '\u00a3';
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GBP');
  const [subscription, setSubscription] = useState(null);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [togglingQR, setTogglingQR] = useState(false);
  const [kdsStats, setKdsStats] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [statsData, restaurant, sub, kds] = await Promise.all([
        reportAPI.getTodayStats().catch(() => null),
        restaurantAPI.getMy().catch(() => null),
        subscriptionAPI.getMy().catch(() => null),
        api.get('/kds/stats').then(r => r.data).catch(() => null),
      ]);
      if (statsData) setStats(statsData);
      if (restaurant?.currency) setCurrency(restaurant.currency);
      if (restaurant) setQrEnabled(restaurant.qr_ordering_enabled !== false);
      if (sub) setSubscription(sub);
      if (kds) setKdsStats(kds);
    } catch (error) {
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    // Auto-refresh every 60s for live data
    const interval = setInterval(loadAll, 60000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const toggleQROrdering = async (enabled) => {
    setTogglingQR(true);
    try {
      await api.put('/restaurants/my/settings', { qr_ordering_enabled: enabled });
      setQrEnabled(enabled);
      toast.success(enabled ? 'QR ordering enabled' : 'QR ordering disabled');
    } catch (error) {
      toast.error('Failed to update QR ordering');
    } finally {
      setTogglingQR(false);
    }
  };

  const sym = getCurrencySymbol(currency);
  const today = new Date().toLocaleDateString('en-GB', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });

  // Filter hourly data to show only hours with data or current/future hours
  const now = new Date();
  const currentHour = now.getHours();
  const chartData = (stats?.hourly_revenue || []).filter(h => h.hour <= currentHour + 1 || h.revenue > 0);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2" data-testid="dashboard-heading">Today's Dashboard</h1>
              <p className="text-sm md:text-base text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>{today}</span>
              </p>
            </div>
            {/* QR Ordering Kill Switch */}
            <div
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-colors ${
                qrEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
              }`}
              data-testid="qr-ordering-toggle"
            >
              <QrCode className={`w-5 h-5 ${qrEnabled ? 'text-emerald-600' : 'text-red-500'}`} />
              <div className="text-sm">
                <p className={`font-semibold ${qrEnabled ? 'text-emerald-700' : 'text-red-700'}`}>
                  QR Ordering
                </p>
                <p className="text-xs text-muted-foreground">
                  {qrEnabled ? 'Guests can order' : 'Disabled'}
                </p>
              </div>
              <Switch
                checked={qrEnabled}
                onCheckedChange={toggleQROrdering}
                disabled={togglingQR}
                data-testid="qr-toggle-switch"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : (
            <>
              {/* Subscription Banner */}
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
                          {subscription.trial_days_left <= 3 && ' \u2014 Subscribe now to avoid interruption'}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
                <Card className="metric-card" data-testid="metric-total-sales">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">Sales</span>
                      <Coins className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="text-xl md:text-3xl font-bold font-mono">
                      {sym}{stats?.total_sales?.toFixed(2) || '0.00'}
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Banknote className="w-3 h-3" /> {sym}{stats?.cash_total?.toFixed(2) || '0.00'}</span>
                      <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> {sym}{stats?.card_total?.toFixed(2) || '0.00'}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  className="metric-card cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all" 
                  data-testid="metric-total-orders" 
                  onClick={() => navigate('/orders')}
                >
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">Orders</span>
                      <ShoppingBag className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-xl md:text-3xl font-bold font-mono">{stats?.total_orders || 0}</div>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MonitorSmartphone className="w-3 h-3" /> POS: {stats?.pos_orders || 0}</span>
                      <span className="flex items-center gap-1"><QrCode className="w-3 h-3" /> QR: {stats?.qr_orders || 0}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-avg-order">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">Avg Order</span>
                      <TrendingUp className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="text-xl md:text-3xl font-bold font-mono">
                      {sym}{stats?.avg_order_value?.toFixed(2) || '0.00'}
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-tables">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">Tables</span>
                      <UtensilsCrossed className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="text-xl md:text-3xl font-bold font-mono">
                      {stats?.open_tables || 0}<span className="text-base text-muted-foreground font-normal">/{stats?.total_tables || 0}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Open / Total</p>
                  </CardContent>
                </Card>
              </div>

              {/* Kitchen Efficiency Widget */}
              {kdsStats && (
                <Card className="mb-6 border-orange-200 bg-orange-50/30" data-testid="kitchen-efficiency-card">
                  <CardContent className="p-4 md:p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                        <ChefHat className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-orange-900">Kitchen Efficiency</p>
                        <p className="text-xs text-orange-700/70">Avg time from Acknowledged to Ready</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl md:text-3xl font-bold font-mono text-orange-700" data-testid="avg-prep-time">
                        {kdsStats.avg_prep_time_display || '--:--'}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-orange-600/80">
                        <span>{kdsStats.active_orders || 0} in kitchen</span>
                        <span>{kdsStats.completed_today || 0} completed</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Revenue Chart */}
              <Card className="mb-6" data-testid="revenue-chart-card">
                <CardHeader className="px-4 md:px-6 pb-2">
                  <CardTitle className="text-base md:text-lg font-semibold">Hourly Revenue</CardTitle>
                  <CardDescription>Today's sales by hour</CardDescription>
                </CardHeader>
                <CardContent className="px-2 md:px-4 pb-4">
                  <div className="h-48 md:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="label" 
                          tick={{ fontSize: 11 }} 
                          tickLine={false}
                          axisLine={{ stroke: '#e5e7eb' }}
                          interval="preserveStartEnd"
                        />
                        <YAxis 
                          tick={{ fontSize: 11 }} 
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${sym}${v}`}
                          width={55}
                        />
                        <Tooltip 
                          formatter={(value) => [`${sym}${value.toFixed(2)}`, 'Revenue']}
                          labelStyle={{ fontWeight: 600 }}
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#10b981" 
                          strokeWidth={2}
                          fill="url(#revenueGradient)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top Products */}
              {stats?.top_products && stats.top_products.length > 0 && (
                <Card data-testid="top-products-card">
                  <CardHeader className="px-4 md:px-6">
                    <CardTitle className="text-base md:text-lg font-semibold">Top Selling Today</CardTitle>
                    <CardDescription>Best performers this business day</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 md:px-6">
                    <div className="space-y-3">
                      {stats.top_products.map((product, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          data-testid={`top-product-${index}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                              #{index + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">{product.name}</div>
                              <div className="text-xs text-muted-foreground">{product.quantity} sold</div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className="text-sm md:text-base font-bold font-mono text-emerald-600">
                              {sym}{product.revenue.toFixed(2)}
                            </div>
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
