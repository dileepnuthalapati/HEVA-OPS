import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { reportAPI, restaurantAPI, subscriptionAPI, attendanceAPI, staffAPI } from '../services/api';
import api from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { toast } from 'sonner';
import { 
  TrendingUp, ShoppingBag, Coins, Calendar,
  AlertTriangle, Clock, CreditCard, Banknote, QrCode,
  MonitorSmartphone, UtensilsCrossed, ChefHat,
  Users, UserCheck, Timer, CalendarClock, CheckCircle, ArrowRightLeft, X
} from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import PushPromptBanner from '../components/PushPromptBanner';

const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '\u00a3', 'USD': '$', 'EUR': '\u20ac', 'INR': '\u20b9' };
  return symbols[currency] || currency || '\u00a3';
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { hasFeature } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GBP');
  const [subscription, setSubscription] = useState(null);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [togglingQR, setTogglingQR] = useState(false);
  const [kdsStats, setKdsStats] = useState(null);
  const [workforceStats, setWorkforceStats] = useState(null);
  const [pendingAdjustments, setPendingAdjustments] = useState([]);
  const [approvingId, setApprovingId] = useState(null);
  const [swapRequests, setSwapRequests] = useState([]);
  const [swapActionId, setSwapActionId] = useState(null);
  const [dropRequests, setDropRequests] = useState([]);
  const [dropActionId, setDropActionId] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [showReassignDialog, setShowReassignDialog] = useState(null);
  const [reassignTarget, setReassignTarget] = useState('');
  const [topSortBy, setTopSortBy] = useState('revenue');
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [leaveActionId, setLeaveActionId] = useState(null);

  const hasPOS = hasFeature('pos');
  const hasWorkforce = hasFeature('workforce');

  const loadAll = useCallback(async () => {
    try {
      const promises = [
        restaurantAPI.getMy().catch(() => null),
        subscriptionAPI.getMy().catch(() => null),
      ];
      // Only load POS stats if POS is enabled
      if (hasPOS) {
        promises.push(
          reportAPI.getTodayStats(topSortBy).catch(() => null),
          api.get('/kds/stats').then(r => r.data).catch(() => null),
        );
      }
      // Only load workforce stats if workforce is enabled
      if (hasWorkforce) {
        promises.push(attendanceAPI.getDashboardStats().catch(() => null));
        promises.push(attendanceAPI.getPendingAdjustments().catch(() => []));
        promises.push(api.get('/swap-requests').then(r => r.data).catch(() => []));
        promises.push(api.get('/drop-requests').then(r => r.data).catch(() => []));
        promises.push(staffAPI.getAll().catch(() => []));
        promises.push(api.get('/leave-requests/pending').then(r => r.data).catch(() => []));
      }

      const results = await Promise.all(promises);
      let idx = 0;
      const restaurant = results[idx++];
      const sub = results[idx++];

      if (hasPOS) {
        const statsData = results[idx++];
        const kds = results[idx++];
        if (statsData) setStats(statsData);
        if (kds) setKdsStats(kds);
      }
      if (hasWorkforce) {
        const wfStats = results[idx++];
        const pendAdj = results[idx++];
        const swaps = results[idx++];
        if (wfStats) setWorkforceStats(wfStats);
        if (pendAdj) setPendingAdjustments(pendAdj);
        if (swaps) setSwapRequests(swaps);
        const drops = results[idx++];
        const staff = results[idx++];
        if (drops) setDropRequests(drops);
        if (staff) setStaffList(staff);
        const leaves = results[idx++];
        if (leaves) setPendingLeaves(leaves);
      }

      if (restaurant?.currency) setCurrency(restaurant.currency);
      if (restaurant) setQrEnabled(restaurant.qr_ordering_enabled !== false);
      if (sub) setSubscription(sub);
    } catch (error) {
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  }, [hasPOS, hasWorkforce, topSortBy]);

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

  const handleApproveAdjustment = async (recordId) => {
    setApprovingId(recordId);
    try {
      await attendanceAPI.approveAdjustment(recordId);
      toast.success('Shift approved!');
      setPendingAdjustments(prev => prev.filter(r => r.id !== recordId));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to approve');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectAdjustment = async (recordId) => {
    setApprovingId(recordId);
    try {
      await api.put(`/attendance/${recordId}/reject-adjustment`);
      toast.success('Rejected — staff will be asked to re-submit');
      setPendingAdjustments(prev => prev.filter(r => r.id !== recordId));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to reject');
    } finally {
      setApprovingId(null);
    }
  };

  const handleSwapAction = async (requestId, action) => {
    setSwapActionId(requestId);
    try {
      await api.put(`/swap-requests/${requestId}/${action}`);
      toast.success(action === 'approve' ? 'Swap approved — rota updated' : 'Swap request rejected');
      setSwapRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (e) {
      toast.error(e.response?.data?.detail || `Failed to ${action}`);
    } finally {
      setSwapActionId(null);
    }
  };

  const handleDropAction = async (dropId, action) => {
    setDropActionId(dropId);
    try {
      if (action === 'open') {
        await api.put(`/drop-requests/${dropId}/approve-open`);
        toast.success('Shift opened for marketplace. All staff notified.');
      } else if (action === 'reassign') {
        if (!reassignTarget) { toast.error('Select a staff member'); setDropActionId(null); return; }
        await api.put(`/drop-requests/${dropId}/reassign`, { target_staff_id: reassignTarget });
        toast.success('Shift reassigned');
        setShowReassignDialog(null);
        setReassignTarget('');
      }
      setDropRequests(prev => prev.filter(r => r.id !== dropId));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally {
      setDropActionId(null);
    }
  };

  const handleLeaveAction = async (leaveId, action) => {
    setLeaveActionId(leaveId);
    try {
      await api.put(`/leave-requests/${leaveId}/${action}`);
      toast.success(action === 'approve' ? 'Leave approved' : 'Leave declined');
      setPendingLeaves(prev => prev.filter(r => r.id !== leaveId));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally {
      setLeaveActionId(null);
    }
  };

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
            {/* QR Ordering Kill Switch - only when POS + QR modules exist */}
            {hasPOS && (
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
            )}
          </div>

          {/* Push Notification Opt-in Banner */}
          <PushPromptBanner />

          {loading ? (
            <div className="space-y-6" data-testid="dashboard-skeleton">
              {/* Skeleton for stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-3 w-20 mb-3" />
                    <Skeleton className="h-7 w-24 mb-2" />
                    <Skeleton className="h-2.5 w-16" />
                  </Card>
                ))}
              </div>
              {/* Skeleton for chart */}
              <Card className="p-5">
                <Skeleton className="h-4 w-40 mb-4" />
                <Skeleton className="h-[200px] w-full rounded-xl" />
              </Card>
              {/* Skeleton for tables */}
              <div className="grid md:grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-4 w-32 mb-4" />
                    <div className="space-y-3">
                      {[...Array(3)].map((_, j) => (
                        <div key={j} className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="flex-1">
                            <Skeleton className="h-3 w-28 mb-1.5" />
                            <Skeleton className="h-2.5 w-20" />
                          </div>
                          <Skeleton className="h-5 w-14" />
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
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

              {/* ══════════════ POS Section — Revenue first when business has POS ══════════════ */}
              {hasPOS && (
              <>
              {/* ══════════════ Daily Revenue Widget ══════════════ */}
              {(() => {
                const todayTotal = stats?.total_sales || 0;
                const cashTotal = stats?.cash_total || 0;
                const cardTotal = stats?.card_total || 0;
                const cashPct = todayTotal > 0 ? (cashTotal / todayTotal * 100).toFixed(0) : 50;

                return (
                  <Card className="mb-4 md:mb-6 bg-white border-slate-200/60 shadow-sm overflow-hidden" data-testid="daily-revenue-widget">
                    <CardContent className="p-4 md:p-6">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Today's Revenue</span>
                      </div>
                      <div className="text-2xl md:text-4xl font-bold font-mono text-slate-900 mb-3" data-testid="revenue-total">
                        {sym}{todayTotal.toFixed(2)}
                      </div>

                      {/* Cash vs Card */}
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
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm md:text-base font-bold text-slate-900">Top Selling Today</CardTitle>
                        <CardDescription className="text-xs text-slate-400">Best performers this business day</CardDescription>
                      </div>
                      <div className="flex bg-slate-100 rounded-lg p-0.5" data-testid="top-sort-toggle">
                        <button
                          onClick={() => setTopSortBy('revenue')}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${topSortBy === 'revenue' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                          data-testid="sort-by-revenue"
                        >
                          Revenue
                        </button>
                        <button
                          onClick={() => setTopSortBy('quantity')}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${topSortBy === 'quantity' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                          data-testid="sort-by-quantity"
                        >
                          Qty Sold
                        </button>
                      </div>
                    </div>
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

              {/* ══════════════ Workforce Dashboard ══════════════ */}
              {hasWorkforce && workforceStats && (
                <div className="mb-4 md:mb-6" data-testid="workforce-dashboard">
                  <div className="mb-3">
                    <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Workforce Overview</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 mb-4">
                    <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="wf-total-staff">
                      <CardContent className="p-3 md:p-5">
                        <div className="flex items-center justify-between mb-2 md:mb-3">
                          <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Team</span>
                          <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                            <Users className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-600" />
                          </div>
                        </div>
                        <div className="text-lg md:text-2xl font-bold font-mono text-slate-900">{workforceStats.total_staff}</div>
                        <p className="text-[10px] md:text-[11px] text-slate-400 font-medium mt-1">Total members</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-emerald-200/60 shadow-sm" data-testid="wf-clocked-in">
                      <CardContent className="p-3 md:p-5">
                        <div className="flex items-center justify-between mb-2 md:mb-3">
                          <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-emerald-500">On Shift</span>
                          <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                            <UserCheck className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-600" />
                          </div>
                        </div>
                        <div className="text-lg md:text-2xl font-bold font-mono text-emerald-700">{workforceStats.clocked_in_count}</div>
                        <p className="text-[10px] md:text-[11px] text-slate-400 font-medium mt-1">On floor now</p>
                        {workforceStats.unavailable_count > 0 && (
                          <p className="text-[10px] text-amber-500 font-medium mt-0.5">{workforceStats.unavailable_count} unavailable</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="wf-scheduled">
                      <CardContent className="p-3 md:p-5">
                        <div className="flex items-center justify-between mb-2 md:mb-3">
                          <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Scheduled</span>
                          <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                            <CalendarClock className="w-3.5 h-3.5 md:w-4 md:h-4 text-violet-600" />
                          </div>
                        </div>
                        <div className="text-lg md:text-2xl font-bold font-mono text-slate-900">{workforceStats.scheduled_shifts}</div>
                        <p className="text-[10px] md:text-[11px] text-slate-400 font-medium mt-1">Shifts today</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="wf-hours-today">
                      <CardContent className="p-3 md:p-5">
                        <div className="flex items-center justify-between mb-2 md:mb-3">
                          <span className="text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400">Hours</span>
                          <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                            <Timer className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-600" />
                          </div>
                        </div>
                        <div className="text-lg md:text-2xl font-bold font-mono text-slate-900">{workforceStats.total_hours_today}h</div>
                        <p className="text-[10px] md:text-[11px] text-slate-400 font-medium mt-1">Worked today</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Currently clocked in staff list */}
                  {workforceStats.clocked_in_staff?.length > 0 && (
                    <Card className="mb-4 bg-white border-emerald-200/40 shadow-sm" data-testid="wf-live-staff">
                      <CardHeader className="px-4 md:px-6 py-3 md:pb-2">
                        <CardTitle className="text-xs md:text-base font-bold text-slate-900 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Currently On Shift
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 md:px-6 pb-4">
                        <div className="space-y-2">
                          {workforceStats.clocked_in_staff.map((s, i) => (
                            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                                  {s.name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                              </div>
                              <span className="text-xs text-slate-400 font-medium">
                                Since {s.since ? new Date(s.since).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Today's scheduled shifts */}
                  {workforceStats.shifts?.length > 0 && (
                    <Card className="mb-4 md:mb-6 bg-white border-slate-200/60 shadow-sm" data-testid="wf-todays-shifts">
                      <CardHeader className="px-4 md:px-6 py-3 md:pb-2">
                        <CardTitle className="text-xs md:text-base font-bold text-slate-900">Today's Schedule</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 md:px-6 pb-4">
                        <div className="space-y-2">
                          {workforceStats.shifts.map((s, i) => (
                            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                                  {s.staff_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-sm font-semibold text-slate-800 block truncate">{s.staff_name}</span>
                                  {s.position && <span className="text-[10px] text-slate-400">{s.position}</span>}
                                </div>
                              </div>
                              <span className="text-xs font-mono font-semibold text-slate-600 shrink-0 ml-2">
                                {s.start_time} - {s.end_time}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pending Adjustments — staff-corrected ghost shifts */}
                  {pendingAdjustments.length > 0 && (
                    <Card className="mb-4 md:mb-6 bg-white border-amber-200/60 shadow-sm" data-testid="wf-pending-adjustments">
                      <CardHeader className="px-4 md:px-6 py-3 md:pb-2">
                        <CardTitle className="text-xs md:text-base font-bold text-amber-800 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          Pending Approvals
                          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{pendingAdjustments.length}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 md:px-6 pb-4">
                        <div className="space-y-2">
                          {pendingAdjustments.map((r) => {
                            const clockIn = r.clock_in ? new Date(r.clock_in) : null;
                            const claimed = r.staff_claimed_time ? new Date(r.staff_claimed_time) : null;
                            const claimedHours = r.hours_worked;
                            return (
                              <div key={r.id} className="p-3 rounded-lg border border-amber-200/60 bg-amber-50/30" data-testid={`adjustment-${r.id}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-800">{r.staff_name || 'Staff'}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                      {r.date} &middot; {clockIn ? clockIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--'}
                                      {' → '}
                                      {claimed ? claimed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--'}
                                    </div>
                                    <div className="text-xs text-amber-700 font-medium mt-1">
                                      Claims <span className="font-bold">{claimedHours?.toFixed(1)}h</span> worked
                                    </div>
                                  </div>
                                  <div className="flex gap-1.5 shrink-0">
                                    <button
                                      onClick={() => handleApproveAdjustment(r.id)}
                                      disabled={approvingId === r.id}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                                      data-testid={`approve-${r.id}`}
                                    >
                                      {approvingId === r.id ? '...' : 'Approve'}
                                    </button>
                                    <button
                                      onClick={() => handleRejectAdjustment(r.id)}
                                      disabled={approvingId === r.id}
                                      className="px-2 py-1.5 rounded-lg bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600 text-xs font-bold transition-colors disabled:opacity-50"
                                      data-testid={`reject-adj-${r.id}`}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Leave Requests — staff requesting time off */}
                  {pendingLeaves.length > 0 && (
                    <Card className="mb-4 md:mb-6 bg-white border-blue-200/60 shadow-sm" data-testid="wf-leave-requests">
                      <CardHeader className="px-4 md:px-6 py-3 md:pb-2">
                        <CardTitle className="text-xs md:text-base font-bold text-blue-800 flex items-center gap-2">
                          <CalendarClock className="w-4 h-4 text-blue-600" />
                          Leave Requests
                          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{pendingLeaves.length}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 md:px-6 pb-4">
                        <div className="space-y-2">
                          {pendingLeaves.map((lr) => (
                            <div key={lr.id} className="p-3 rounded-lg border border-blue-200/60 bg-blue-50/30" data-testid={`leave-req-${lr.id}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-800">{lr.staff_name || 'Staff'}</div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {lr.start_date === lr.end_date ? lr.start_date : `${lr.start_date} → ${lr.end_date}`}
                                    <span className="ml-1 capitalize">({lr.leave_type?.replace('_', ' ')})</span>
                                  </div>
                                  <div className="text-xs text-blue-600 font-medium mt-1">{lr.days} day{lr.days > 1 ? 's' : ''}</div>
                                  {lr.note && <div className="text-xs text-slate-400 mt-0.5">"{lr.note}"</div>}
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    onClick={() => handleLeaveAction(lr.id, 'approve')}
                                    disabled={leaveActionId === lr.id}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                                    data-testid={`approve-leave-${lr.id}`}
                                  >
                                    {leaveActionId === lr.id ? '...' : 'Approve'}
                                  </button>
                                  <button
                                    onClick={() => handleLeaveAction(lr.id, 'decline')}
                                    disabled={leaveActionId === lr.id}
                                    className="px-2 py-1.5 rounded-lg bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600 text-xs font-bold transition-colors disabled:opacity-50"
                                    data-testid={`decline-leave-${lr.id}`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Swap Requests — staff requesting shift changes */}
                  {swapRequests.length > 0 && (
                    <Card className="mb-4 md:mb-6 bg-white border-indigo-200/60 shadow-sm" data-testid="wf-swap-requests">
                      <CardHeader className="px-4 md:px-6 py-3 md:pb-2">
                        <CardTitle className="text-xs md:text-base font-bold text-indigo-800 flex items-center gap-2">
                          <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
                          Swap Requests
                          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">{swapRequests.length}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 md:px-6 pb-4">
                        <div className="space-y-2">
                          {swapRequests.map((sr) => (
                            <div key={sr.id} className="p-3 rounded-lg border border-indigo-200/60 bg-indigo-50/30" data-testid={`swap-req-${sr.id}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-800">
                                    {sr.requester_name || 'Staff'}
                                    {sr.acceptor_name && <span className="text-indigo-600"> ↔ {sr.acceptor_name}</span>}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {sr.shift_date} &middot; {sr.shift_start} → {sr.shift_end}
                                  </div>
                                  {sr.reason && <div className="text-xs text-indigo-600 mt-1">"{sr.reason}"</div>}
                                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    sr.status === 'pending_approval' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {sr.status === 'pending_approval' ? 'Ready for approval' : 'Waiting for colleague'}
                                  </span>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  {sr.status === 'pending_approval' && (
                                    <>
                                      <button
                                        onClick={() => handleSwapAction(sr.id, 'approve')}
                                        disabled={swapActionId === sr.id}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                                        data-testid={`approve-swap-${sr.id}`}
                                      >
                                        {swapActionId === sr.id ? '...' : 'Approve'}
                                      </button>
                                      <button
                                        onClick={() => handleSwapAction(sr.id, 'reject')}
                                        disabled={swapActionId === sr.id}
                                        className="px-2 py-1.5 rounded-lg bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600 text-xs font-bold transition-colors disabled:opacity-50"
                                        data-testid={`reject-swap-${sr.id}`}
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Drop Requests — high-priority manager alerts */}
                  {dropRequests.length > 0 && (
                    <Card className="mb-4 md:mb-6 bg-white border-red-200/60 shadow-sm" data-testid="wf-drop-requests">
                      <CardHeader className="px-4 md:px-6 py-3 md:pb-2">
                        <CardTitle className="text-xs md:text-base font-bold text-red-800 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          Shift Drops
                          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">{dropRequests.length}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 md:px-6 pb-4">
                        <div className="space-y-2">
                          {dropRequests.map((dr) => (
                            <div key={dr.id} className="p-3 rounded-lg border border-red-200/60 bg-red-50/30" data-testid={`drop-req-${dr.id}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-800">{dr.requester_name}</div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {dr.shift_date} &middot; {dr.shift_start} → {dr.shift_end}
                                  </div>
                                  <div className="text-xs text-red-600 font-medium mt-1">{dr.reason_label}</div>
                                  {dr.note && <div className="text-xs text-slate-400 mt-0.5">"{dr.note}"</div>}
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    onClick={() => handleDropAction(dr.id, 'open')}
                                    disabled={dropActionId === dr.id}
                                    className="px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
                                    data-testid={`open-drop-${dr.id}`}
                                  >
                                    {dropActionId === dr.id ? '...' : 'Open'}
                                  </button>
                                  <button
                                    onClick={() => { setShowReassignDialog(dr.id); setReassignTarget(''); }}
                                    disabled={dropActionId === dr.id}
                                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                                    data-testid={`reassign-drop-${dr.id}`}
                                  >
                                    Reassign
                                  </button>
                                </div>
                              </div>
                              {/* Inline reassign picker */}
                              {showReassignDialog === dr.id && (
                                <div className="mt-2 p-2 rounded-lg bg-white border border-slate-200 flex gap-2 items-end">
                                  <div className="flex-1">
                                    <select
                                      value={reassignTarget}
                                      onChange={(e) => setReassignTarget(e.target.value)}
                                      className="w-full text-xs border rounded-lg px-2 py-1.5"
                                      data-testid={`reassign-select-${dr.id}`}
                                    >
                                      <option value="">Select staff...</option>
                                      {staffList.filter(s => s.id !== dr.requester_id).map(s => (
                                        <option key={s.id} value={s.id}>{s.username}{s.position ? ` (${s.position})` : ''}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <button
                                    onClick={() => handleDropAction(dr.id, 'reassign')}
                                    disabled={!reassignTarget || dropActionId === dr.id}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                                    data-testid={`confirm-reassign-${dr.id}`}
                                  >
                                    Confirm
                                  </button>
                                  <button onClick={() => setShowReassignDialog(null)} className="px-2 py-1.5 text-slate-400 hover:text-slate-600">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
