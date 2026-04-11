import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { reportAPI, restaurantAPI, subscriptionAPI, tableAPI } from '../services/api';
import api from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { toast } from 'sonner';
import { 
  TrendingUp, TrendingDown, ShoppingBag, Package, Coins, Calendar, 
  AlertTriangle, Clock, CreditCard, Banknote, QrCode,
  MonitorSmartphone, UtensilsCrossed, Power, ChefHat, ArrowUpRight, ArrowDownRight
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
  const [weeklyTrend, setWeeklyTrend] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [statsData, restaurant, sub, kds, weekly] = await Promise.all([
        reportAPI.getTodayStats().catch(() => null),
        restaurantAPI.getMy().catch(() => null),
        subscriptionAPI.getMy().catch(() => null),
        api.get('/kds/stats').then(r => r.data).catch(() => null),
        reportAPI.getWeeklyTrend().catch(() => null),
      ]);
      if (statsData) setStats(statsData);
      if (restaurant?.currency) setCurrency(restaurant.currency);
      if (restaurant) setQrEnabled(restaurant.qr_ordering_enabled !== false);
      if (sub) setSubscription(sub);
      if (kds) setKdsStats(kds);
      if (weekly) setWeeklyTrend(weekly);
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
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8 pt-16 md:pt-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 md:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-3">
            <div>
              <h1 className="font-heading text-xl md:text-3xl font-bold tracking-tight text-slate-900 mb-0.5" data-testid="dashboard-heading">Dashboard</h1>
              <p className="text-[10px] md:text-sm text-slate-400 flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
                <span>{today}</span>
              </p>
            </div>
            {/* QR Ordering Kill Switch */}
            <div
              className={`flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 rounded-xl border transition-colors ${
                qrEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
              }`}
              data-testid="qr-ordering-toggle"
            >
              <QrCode className={`w-4 h-4 md:w-5 md:h-5 ${qrEnabled ? 'text-emerald-600' : 'text-red-500'}`} />
              <div className="text-xs md:text-sm">
                <p className={`font-semibold ${qrEnabled ? 'text-emerald-700' : 'text-red-700'}`}>
                  QR Ordering
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

              {/* ══════════════ Daily Revenue Widget ══════════════ */}
              {(() => {
                const todayTotal = stats?.total_sales || 0;
                const cashTotal = stats?.cash_total || 0;
                const cardTotal = stats?.card_total || 0;
                const yesterdayData = weeklyTrend?.days?.[5]; // 2nd to last = yesterday
                const yesterdayTotal = yesterdayData?.total || 0;
                const pctChange = yesterdayTotal > 0 
                  ? ((todayTotal - yesterdayTotal) / yesterdayTotal * 100).toFixed(1)
                  : todayTotal > 0 ? 100 : 0;
                const isUp = pctChange >= 0;
                const cashPct = todayTotal > 0 ? (cashTotal / todayTotal * 100).toFixed(0) : 50;

                return (
                  <Card className="mb-4 md:mb-6 bg-white border-slate-200/60 shadow-sm overflow-hidden" data-testid="daily-revenue-widget">
                    <CardContent className="p-0">
                      {/* Mobile: stacked compact / Desktop: side-by-side */}
                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_280px] xl:grid-cols-[1fr_1px_340px]">
                        {/* Revenue Info */}
                        <div className="p-4 md:p-6">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Today's Revenue</span>
                            {pctChange != 0 && (
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-bold ${
                                isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                              }`} data-testid="revenue-pct-change">
                                {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {Math.abs(pctChange)}%
                              </span>
                            )}
                          </div>
                          <div className="text-2xl md:text-4xl font-bold font-mono text-slate-900 mb-3" data-testid="revenue-total">
                            {sym}{todayTotal.toFixed(2)}
                          </div>

                          {/* Cash vs Card - compact on mobile */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs md:text-sm">
                              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                                <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Cash
                              </span>
                              <span className="font-bold font-mono text-slate-800">{sym}{cashTotal.toFixed(2)}</span>
                            </div>
                            <div className="w-full h-2.5 md:h-3 bg-slate-100 rounded-full overflow-hidden flex">
                              <div className="h-full bg-emerald-500 rounded-l-full transition-all duration-500" style={{ width: `${cashPct}%` }} data-testid="cash-bar" />
                              <div className="h-full bg-indigo-500 rounded-r-full transition-all duration-500" style={{ width: `${100 - cashPct}%` }} data-testid="card-bar" />
                            </div>
                            <div className="flex items-center justify-between text-xs md:text-sm">
                              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                                <CreditCard className="w-3.5 h-3.5 text-indigo-500" /> Card
                              </span>
                              <span className="font-bold font-mono text-slate-800">{sym}{cardTotal.toFixed(2)}</span>
                            </div>
                          </div>

                          {/* Mobile-only: inline mini sparkline below cash/card */}
                          {weeklyTrend?.days && (
                            <div className="lg:hidden mt-3 pt-3 border-t border-slate-100">
                              <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-slate-400 mb-1.5 block">Last 7 Days</span>
                              <div className="h-[64px]" data-testid="weekly-chart-mobile">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={weeklyTrend.days} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                    <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={24}>
                                      {weeklyTrend.days.map((entry, index) => (
                                        <Cell key={index} fill={index === weeklyTrend.days.length - 1 ? '#4F46E5' : '#cbd5e1'} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Divider - desktop only */}
                        <div className="hidden lg:block bg-slate-100" />

                        {/* Desktop: 7-Day Chart */}
                        <div className="hidden lg:block p-5 md:p-6">
                          <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400 mb-3 block">Last 7 Days</span>
                          {weeklyTrend?.days ? (
                            <div className="h-[120px]" data-testid="weekly-chart">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={weeklyTrend.days} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                  <Tooltip
                                    formatter={(value) => [`${sym}${value.toFixed(2)}`, 'Revenue']}
                                    labelFormatter={(label, payload) => payload?.[0]?.payload?.date || label}
                                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, padding: '6px 10px' }}
                                  />
                                  <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={32}>
                                    {weeklyTrend.days.map((entry, index) => (
                                      <Cell key={index} fill={index === weeklyTrend.days.length - 1 ? '#4F46E5' : '#cbd5e1'} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="h-[120px] flex items-center justify-center text-sm text-slate-400">Loading...</div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
                <Card 
                  className="bg-white border-slate-200/60 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-indigo-300" 
                  data-testid="metric-total-orders" 
                  onClick={() => navigate('/orders')}
                >
                  <CardContent className="p-3 md:p-5">
                    <div className="flex items-center justify-between mb-2 md:mb-3">
                      <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Orders</span>
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                        <ShoppingBag className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-600" />
                      </div>
                    </div>
                    <div className="text-lg md:text-2xl font-bold font-mono text-slate-900">{stats?.total_orders || 0}</div>
                    <div className="flex gap-2 md:gap-3 mt-1.5 md:mt-2.5 text-[10px] md:text-[11px] text-slate-400 font-medium">
                      <span className="flex items-center gap-0.5"><MonitorSmartphone className="w-3 h-3" /> {stats?.pos_orders || 0}</span>
                      <span className="flex items-center gap-0.5"><QrCode className="w-3 h-3" /> {stats?.qr_orders || 0}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-slate-200/60 shadow-sm hover:shadow-md transition-shadow" data-testid="metric-avg-order">
                  <CardContent className="p-3 md:p-5">
                    <div className="flex items-center justify-between mb-2 md:mb-3">
                      <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Avg Order</span>
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                        <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-600" />
                      </div>
                    </div>
                    <div className="text-lg md:text-2xl font-bold font-mono text-slate-900">
                      {sym}{stats?.avg_order_value?.toFixed(2) || '0.00'}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-slate-200/60 shadow-sm hover:shadow-md transition-shadow" data-testid="metric-tables">
                  <CardContent className="p-3 md:p-5">
                    <div className="flex items-center justify-between mb-2 md:mb-3">
                      <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Tables</span>
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                        <UtensilsCrossed className="w-3.5 h-3.5 md:w-4 md:h-4 text-violet-600" />
                      </div>
                    </div>
                    <div className="text-lg md:text-2xl font-bold font-mono text-slate-900">
                      {stats?.open_tables || 0}<span className="text-xs md:text-sm text-slate-400 font-medium ml-0.5">/ {stats?.total_tables || 0}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  className="bg-white border-slate-200/60 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-emerald-300" 
                  data-testid="metric-completed"
                  onClick={() => navigate('/reports')}
                >
                  <CardContent className="p-3 md:p-5">
                    <div className="flex items-center justify-between mb-2 md:mb-3">
                      <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Completed</span>
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Coins className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-600" />
                      </div>
                    </div>
                    <div className="text-lg md:text-2xl font-bold font-mono text-slate-900">{stats?.total_orders || 0}</div>
                    <p className="text-[10px] md:text-[11px] text-slate-400 font-medium mt-1.5 md:mt-2.5">View reports</p>
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
              <Card className="mb-4 md:mb-6 bg-white border-slate-200/60 shadow-sm" data-testid="revenue-chart-card">
                <CardHeader className="px-4 md:px-6 py-3 md:pb-2">
                  <CardTitle className="text-xs md:text-base font-bold text-slate-900">Hourly Revenue</CardTitle>
                </CardHeader>
                <CardContent className="px-1 md:px-4 pb-3 md:pb-4">
                  <div className="h-40 md:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="label" 
                          tick={{ fontSize: 11, fill: '#94a3b8' }} 
                          tickLine={false}
                          axisLine={{ stroke: '#e2e8f0' }}
                          interval="preserveStartEnd"
                        />
                        <YAxis 
                          tick={{ fontSize: 11, fill: '#94a3b8' }} 
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${sym}${v}`}
                          width={55}
                        />
                        <Tooltip 
                          formatter={(value) => [`${sym}${value.toFixed(2)}`, 'Revenue']}
                          labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                          contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#4F46E5" 
                          strokeWidth={2.5}
                          fill="url(#revenueGradient)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top Products */}
              {stats?.top_products && stats.top_products.length > 0 && (
                <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="top-products-card">
                  <CardHeader className="px-4 md:px-6">
                    <CardTitle className="text-sm md:text-base font-bold text-slate-900">Top Selling Today</CardTitle>
                    <CardDescription className="text-xs text-slate-400">Best performers this business day</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 md:px-6">
                    <div className="space-y-2">
                      {stats.top_products.map((product, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                          data-testid={`top-product-${index}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              index === 0 ? 'bg-amber-100 text-amber-700' :
                              index === 1 ? 'bg-slate-200 text-slate-600' :
                              index === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              #{index + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-slate-800 truncate">{product.name}</div>
                              <div className="text-[11px] text-slate-400 font-medium">{product.quantity} sold</div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className="text-sm font-bold font-mono text-emerald-600">
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
