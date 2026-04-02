import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { reportAPI, restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { BarChart3, TrendingUp, ShoppingBag, Coins, Calendar, ArrowLeft, Banknote, CreditCard } from 'lucide-react';
import jsPDF from 'jspdf';

const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const Reports = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [currency, setCurrency] = useState('GBP');

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = now.toISOString().split('T')[0];
    setDateRange({ start, end });
    loadCurrency();
  }, []);

  useEffect(() => {
    if (dateRange.start && dateRange.end) loadStats();
  }, [dateRange]);

  const loadCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) setCurrency(restaurant.currency);
    } catch (e) {}
  };

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await reportAPI.getStats(dateRange.start, dateRange.end);
      setStats(data);
    } catch (error) {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (!stats) return;
    const doc = new jsPDF();
    const cs = getCurrencySymbol(currency);
    doc.setFontSize(20);
    doc.text('HevaPOS Sales Report', 20, 20);
    doc.setFontSize(11);
    doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 20, 30);
    doc.setFontSize(14);
    doc.text('Summary', 20, 45);
    doc.setFontSize(11);
    doc.text(`Total Sales: ${cs}${stats.total_sales?.toFixed(2)}`, 20, 55);
    doc.text(`Cash: ${cs}${stats.cash_total?.toFixed(2) || '0.00'}  |  Card: ${cs}${stats.card_total?.toFixed(2) || '0.00'}`, 20, 62);
    doc.text(`Total Orders: ${stats.total_orders}`, 20, 69);
    doc.text(`Average Order Value: ${cs}${stats.avg_order_value?.toFixed(2)}`, 20, 76);
    
    if (stats.top_products?.length > 0) {
      doc.setFontSize(14);
      doc.text('Top Products', 20, 92);
      doc.setFontSize(11);
      stats.top_products.forEach((p, i) => {
        doc.text(`${i + 1}. ${p.name} - ${p.quantity} sold - ${cs}${p.revenue.toFixed(2)}`, 25, 102 + i * 8);
      });
    }
    
    doc.save(`HevaPOS_Report_${dateRange.start}_${dateRange.end}.pdf`);
    toast.success('PDF downloaded');
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="reports-back-btn" className="h-8 w-8 p-0">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-2xl md:text-4xl font-bold tracking-tight" data-testid="reports-heading">Sales Reports</h1>
              </div>
              <p className="text-sm text-muted-foreground ml-11">Analyze your business performance</p>
            </div>
            <Button onClick={downloadPDF} disabled={!stats} data-testid="download-pdf-btn" className="shrink-0">
              <BarChart3 className="w-4 h-4 mr-2" /> Download PDF
            </Button>
          </div>

          {/* Date Range */}
          <Card className="mb-6">
            <CardContent className="p-4 flex flex-wrap gap-4 items-end">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="w-40" data-testid="start-date" />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="w-40" data-testid="end-date" />
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
                <Card data-testid="report-total-sales">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardDescription className="text-xs font-medium uppercase">Total Sales</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex items-center gap-2">
                      <Coins className="w-6 h-6 text-emerald-500 shrink-0" />
                      <span className="text-xl md:text-2xl font-bold font-mono">{getCurrencySymbol(currency)}{stats.total_sales?.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Banknote className="w-3 h-3" /> Cash: <strong className="font-mono">{getCurrencySymbol(currency)}{stats.cash_total?.toFixed(2) || '0.00'}</strong></span>
                      <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Card: <strong className="font-mono">{getCurrencySymbol(currency)}{stats.card_total?.toFixed(2) || '0.00'}</strong></span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all" data-testid="report-total-orders" onClick={() => navigate(`/orders?from=${dateRange.start}&to=${dateRange.end}`)}>
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardDescription className="text-xs font-medium uppercase">Total Orders</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-6 h-6 text-blue-500 shrink-0" />
                      <span className="text-xl md:text-2xl font-bold font-mono">{stats.total_orders}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Click to view orders</p>
                  </CardContent>
                </Card>

                <Card data-testid="report-avg-order">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardDescription className="text-xs font-medium uppercase">Avg Order Value</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-amber-500 shrink-0" />
                      <span className="text-xl md:text-2xl font-bold font-mono">{getCurrencySymbol(currency)}{stats.avg_order_value?.toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="report-top-count">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardDescription className="text-xs font-medium uppercase">Products Sold</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-6 h-6 text-purple-500 shrink-0" />
                      <span className="text-xl md:text-2xl font-bold font-mono">{stats.top_products?.length || 0}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {stats.top_products?.length > 0 && (
                <Card data-testid="report-top-products">
                  <CardHeader className="px-4">
                    <CardTitle className="text-lg">Top Products</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    <div className="space-y-2">
                      {stats.top_products.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-sm shrink-0">#{i + 1}</div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground">{p.quantity} sold</div>
                            </div>
                          </div>
                          <div className="font-bold font-mono text-emerald-600 shrink-0 ml-2">{getCurrencySymbol(currency)}{p.revenue.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Reports;
