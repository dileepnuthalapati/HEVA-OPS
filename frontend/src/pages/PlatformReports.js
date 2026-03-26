import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { BarChart3, Download, Building2, TrendingUp, DollarSign, Calendar } from 'lucide-react';

const PlatformReports = () => {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('this_month');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    avgRevenuePerRestaurant: 0,
    trialConversionRate: 0,
    churnRate: 0,
    newSignups: 0
  });

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  const loadData = async () => {
    try {
      const data = await restaurantAPI.getAll();
      setRestaurants(data);
      
      // Calculate platform stats
      const active = data.filter(r => r.subscription_status === 'active');
      const trials = data.filter(r => r.subscription_status === 'trial');
      const totalRevenue = active.reduce((sum, r) => sum + (r.price || 0), 0);
      
      setStats({
        totalRevenue: totalRevenue,
        avgRevenuePerRestaurant: active.length > 0 ? totalRevenue / active.length : 0,
        trialConversionRate: data.length > 0 ? (active.length / data.length * 100) : 0,
        churnRate: 2.5, // Placeholder
        newSignups: trials.length
      });
    } catch (error) {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = () => {
    toast.success('Report export started - feature coming soon!');
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading reports...</div>
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
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Platform Reports</h1>
              <p className="text-muted-foreground">Analytics and insights across all restaurants</p>
            </div>
            <div className="flex items-center gap-4">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="this_quarter">This Quarter</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleExportReport}>
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Total MRR
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</div>
                <p className="text-xs text-emerald-600">Monthly recurring revenue</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Avg Revenue/Restaurant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${stats.avgRevenuePerRestaurant.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Per active customer</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Trial Conversion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.trialConversionRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">Trial to paid</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  New Signups
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.newSignups}</div>
                <p className="text-xs text-muted-foreground">Active trials</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Churn Rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.churnRate}%</div>
                <p className="text-xs text-amber-600">Monthly churn</p>
              </CardContent>
            </Card>
          </div>

          {/* Restaurant Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Restaurant Performance</CardTitle>
              <CardDescription>Revenue breakdown by restaurant</CardDescription>
            </CardHeader>
            <CardContent>
              {restaurants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No restaurants to display
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Restaurant</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Plan</th>
                        <th className="text-right py-3 px-4 font-medium">Monthly Fee</th>
                        <th className="text-left py-3 px-4 font-medium">Since</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restaurants.map((restaurant) => (
                        <tr key={restaurant.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium">{restaurant.business_info?.name || 'Unnamed'}</div>
                              <div className="text-sm text-muted-foreground">{restaurant.owner_email}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              restaurant.subscription_status === 'active' 
                                ? 'bg-emerald-100 text-emerald-700'
                                : restaurant.subscription_status === 'trial'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {restaurant.subscription_status?.toUpperCase() || 'TRIAL'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            {restaurant.subscription_plan || 'Standard'}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            ${restaurant.price || 0}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {new Date(restaurant.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PlatformReports;
