import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Building2, TrendingUp, DollarSign, Users, AlertTriangle, CheckCircle } from 'lucide-react';

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await restaurantAPI.getAll();
      setRestaurants(data);
      
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
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading platform data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Platform Dashboard</h1>
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
                <div className="text-3xl font-bold">${stats.thisMonthRevenue.toFixed(2)}</div>
                <p className={`text-xs mt-1 ${Number(revenueGrowth) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {Number(revenueGrowth) >= 0 ? '+' : ''}{revenueGrowth}% from last month
                </p>
              </CardContent>
            </Card>
          </div>

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
                    <div key={restaurant.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold">{restaurant.business_info?.name || 'Unnamed'}</div>
                          <div className="text-sm text-muted-foreground">
                            {restaurant.business_info?.city || 'No location'} • {restaurant.owner_email}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          restaurant.subscription_status === 'active' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {restaurant.subscription_status?.toUpperCase() || 'TRIAL'}
                        </div>
                        <div className="text-sm font-medium mt-1">
                          ${restaurant.price || 0}/mo
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
