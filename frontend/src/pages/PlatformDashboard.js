import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI } from '../services/api';
import api from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Building2, TrendingUp, DollarSign, Users, AlertTriangle, CheckCircle, CreditCard, QrCode, Banknote } from 'lucide-react';

const PlatformDashboard = () => {
  const [stats, setStats] = useState({
    totalRestaurants: 0,
    activeRestaurants: 0,
    trialRestaurants: 0,
    totalRevenue: 0,
    thisMonthRevenue: 0,
    lastMonthRevenue: 0
  });
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentStats, setPaymentStats] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [data, pStats] = await Promise.all([
        restaurantAPI.getAll(),
        api.get('/payments/platform/stats').then(r => r.data).catch(() => null),
      ]);
      setRestaurants(data);
      if (pStats) setPaymentStats(pStats);
      
      // Calculate stats
      const active = data.filter(r => r.subscription_status === 'active').length;
      const trial = data.filter(r => r.subscription_status === 'trial').length;
      const totalRevenue = data.reduce((sum, r) => {
        if (r.subscription_status === 'active') {
          return sum + (r.price || 0);
        }
        return sum;
      }, 0);
      
      setStats({
        totalRestaurants: data.length,
        activeRestaurants: active,
        trialRestaurants: trial,
        totalRevenue: totalRevenue,
        thisMonthRevenue: totalRevenue,
        lastMonthRevenue: totalRevenue * 0.9 // Placeholder
      });
    } catch (error) {
      toast.error('Failed to load platform data');
    } finally {
      setLoading(false);
    }
  };

  const revenueGrowth = stats.lastMonthRevenue > 0 
    ? ((stats.thisMonthRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue * 100).toFixed(1)
    : 0;

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading platform data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2">Platform Dashboard</h1>
            <p className="text-muted-foreground">Overview of all restaurants and platform metrics</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Restaurants</CardTitle>
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalRestaurants}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Registered on platform
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">{stats.activeRestaurants}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Paying customers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Trial Users</CardTitle>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{stats.trialRestaurants}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  14-day trial period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <DollarSign className="h-5 w-5 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.thisMonthRevenue.toFixed(2)}</div>
                <p className={`text-xs mt-1 ${Number(revenueGrowth) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {Number(revenueGrowth) >= 0 ? '+' : ''}{revenueGrowth}% from last month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Stripe Connect: Commission Dashboard */}
          {paymentStats && (
            <div className="mt-6 space-y-4" data-testid="stripe-connect-stats">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" /> Stripe Connect Revenue
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-indigo-200 bg-indigo-50/30">
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Banknote className="w-4 h-4 text-indigo-600" />
                      <p className="text-xs font-medium text-indigo-700">Total Volume</p>
                    </div>
                    <div className="text-2xl font-bold font-mono text-indigo-900" data-testid="total-volume">
                      {paymentStats.total_volume.toFixed(2)}
                    </div>
                    <p className="text-xs text-indigo-600/70 mt-1">{paymentStats.total_transactions} transactions</p>
                  </CardContent>
                </Card>

                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <p className="text-xs font-medium text-emerald-700">Platform Earnings (0.3%)</p>
                    </div>
                    <div className="text-2xl font-bold font-mono text-emerald-900" data-testid="platform-earnings">
                      {paymentStats.total_platform_fees.toFixed(2)}
                    </div>
                    <p className="text-xs text-emerald-600/70 mt-1">From {paymentStats.qr_transactions} QR payments</p>
                  </CardContent>
                </Card>

                <Card className="border-purple-200 bg-purple-50/30">
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-2 mb-1">
                      <QrCode className="w-4 h-4 text-purple-600" />
                      <p className="text-xs font-medium text-purple-700">QR Volume (0.3% fee)</p>
                    </div>
                    <div className="text-2xl font-bold font-mono text-purple-900" data-testid="qr-volume">
                      {paymentStats.qr_volume.toFixed(2)}
                    </div>
                    <p className="text-xs text-purple-600/70 mt-1">{paymentStats.qr_transactions} QR orders</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-4 h-4 text-slate-600" />
                      <p className="text-xs font-medium text-slate-700">Connected Merchants</p>
                    </div>
                    <div className="text-2xl font-bold font-mono" data-testid="connected-merchants">
                      {paymentStats.connected_merchants}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{paymentStats.pending_merchants} pending</p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-restaurant breakdown table */}
              {paymentStats.merchants.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Merchant Breakdown</CardTitle>
                    <CardDescription>Per-restaurant Stripe Connect status and volume</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="merchant-table">
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="py-2 pr-4 font-medium">Restaurant</th>
                            <th className="py-2 pr-4 font-medium">Status</th>
                            <th className="py-2 pr-4 font-medium text-right">Volume</th>
                            <th className="py-2 pr-4 font-medium text-right">QR Volume</th>
                            <th className="py-2 font-medium text-right">Your Fee</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentStats.merchants.map((m, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-2 pr-4 font-medium">{m.name}</td>
                              <td className="py-2 pr-4">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                  m.charges_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {m.charges_enabled ? 'Active' : 'Pending'}
                                </span>
                              </td>
                              <td className="py-2 pr-4 text-right font-mono">{m.total_volume.toFixed(2)}</td>
                              <td className="py-2 pr-4 text-right font-mono">{m.qr_volume.toFixed(2)}</td>
                              <td className="py-2 text-right font-mono text-emerald-600 font-semibold">{m.platform_fees.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Recent Restaurants */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Restaurants</CardTitle>
              <CardDescription>Latest restaurants added to the platform</CardDescription>
            </CardHeader>
            <CardContent>
              {restaurants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No restaurants yet. Go to Restaurants to add one.
                </div>
              ) : (
                <div className="space-y-4">
                  {restaurants.slice(0, 5).map((restaurant) => (
                    <div key={restaurant.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-3">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="w-6 h-6 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{restaurant.business_info?.name || 'Unnamed'}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {restaurant.business_info?.city || 'No location'} &bull; {restaurant.owner_email}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex sm:flex-col items-center sm:items-end gap-2">
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          restaurant.subscription_status === 'active' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {restaurant.subscription_status?.toUpperCase() || 'TRIAL'}
                        </div>
                        <div className="text-sm font-medium">
                          {restaurant.currency || 'GBP'} {restaurant.price || 0}/mo
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PlatformDashboard;
