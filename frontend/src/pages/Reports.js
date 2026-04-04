import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { reportAPI, restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { BarChart3, TrendingUp, ShoppingBag, Coins, Calendar, ArrowLeft, Banknote, CreditCard, Download, FileText } from 'lucide-react';

const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const RANGES = [
  { label: 'Today', days: 0 },
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
];

const Reports = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GBP');
  const [activeRange, setActiveRange] = useState('Today');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadCurrency();
    handleRangeSelect('Today', 0);
  }, []);

  const loadCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) setCurrency(restaurant.currency);
    } catch (e) {}
  };

  const handleRangeSelect = (label, days) => {
    setActiveRange(label);
    const end = new Date();
    const start = new Date();
    if (days > 0) start.setDate(start.getDate() - days);
    const sd = start.toISOString().split('T')[0];
    const ed = end.toISOString().split('T')[0];
    setStartDate(sd);
    setEndDate(ed);
    loadStats(sd, ed);
  };

  const loadStats = async (from, to) => {
    setLoading(true);
    try {
      const data = await reportAPI.getStats(from, to);
      setStats(data);
    } catch (error) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomDateSearch = () => {
    setActiveRange('');
    loadStats(startDate, endDate);
  };

  const downloadPDF = async () => {
    if (!stats) return;
    try {
      toast.loading('Generating PDF...', { id: 'pdf' });
      const apiUrl = process.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/api/reports/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          report_type: 'sales',
        }),
      });
      if (!response.ok) throw new Error('PDF generation failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_report_${startDate}_${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded', { id: 'pdf' });
    } catch (error) {
      toast.error('Failed to generate PDF', { id: 'pdf' });
    }
  };

  const downloadFeatureGuide = async () => {
    try {
      toast.loading('Generating feature guide...', { id: 'guide' });
      const apiUrl = process.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/api/docs/feature-guide`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'HevaPOS_Feature_Guide.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Feature guide downloaded', { id: 'guide' });
    } catch {
      toast.error('Failed to generate feature guide', { id: 'guide' });
    }
  };

  const cs = getCurrencySymbol(currency);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
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
            <div className="flex gap-2">
              <Button onClick={downloadPDF} disabled={!stats} variant="outline" data-testid="download-pdf-btn">
                <Download className="w-4 h-4 mr-2" /> Sales PDF
              </Button>
              <Button onClick={downloadFeatureGuide} variant="outline" data-testid="download-guide-btn">
                <FileText className="w-4 h-4 mr-2" /> Feature Guide
              </Button>
            </div>
          </div>

          {/* Quick Range Buttons */}
          <div className="flex flex-wrap gap-2 mb-4" data-testid="range-buttons">
            {RANGES.map(({ label, days }) => (
              <Button
                key={label}
                variant={activeRange === label ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRangeSelect(label, days)}
                data-testid={`range-${label.toLowerCase().replace(' ', '-')}`}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Custom Date Range */}
          <div className="flex flex-wrap items-end gap-3 mb-6">
            <div>
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="start-date" className="w-40" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="end-date" className="w-40" />
            </div>
            <Button onClick={handleCustomDateSearch} variant="outline" size="sm" data-testid="custom-date-btn">
              <Calendar className="w-4 h-4 mr-1" /> Apply
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/orders?from=${startDate}&to=${endDate}`)} data-testid="view-orders-btn">
              <FileText className="w-4 h-4 mr-1" /> View Orders
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading reports...</div>
          ) : stats ? (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
                <Card data-testid="stat-total-sales">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Total Sales</span>
                    </div>
                    <div className="text-xl md:text-2xl font-bold">{cs}{stats.total_sales?.toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card data-testid="stat-total-orders">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingBag className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-muted-foreground">Orders</span>
                    </div>
                    <div className="text-xl md:text-2xl font-bold">{stats.total_orders}</div>
                  </CardContent>
                </Card>
                <Card data-testid="stat-avg-order">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-purple-500" />
                      <span className="text-xs text-muted-foreground">Avg Order</span>
                    </div>
                    <div className="text-xl md:text-2xl font-bold">{cs}{stats.avg_order_value?.toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card data-testid="stat-cash-total">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Banknote className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-muted-foreground">Cash</span>
                    </div>
                    <div className="text-xl md:text-2xl font-bold">{cs}{stats.cash_total?.toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card data-testid="stat-card-total">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="w-4 h-4 text-orange-500" />
                      <span className="text-xs text-muted-foreground">Card</span>
                    </div>
                    <div className="text-xl md:text-2xl font-bold">{cs}{stats.card_total?.toFixed(2)}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Products */}
              {stats.top_products?.length > 0 && (
                <Card data-testid="top-products-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" /> Top Products
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="py-2 text-left font-semibold">#</th>
                            <th className="py-2 text-left font-semibold">Product</th>
                            <th className="py-2 text-right font-semibold">Qty Sold</th>
                            <th className="py-2 text-right font-semibold">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.top_products.map((product, index) => (
                            <tr key={index} className="border-b last:border-0">
                              <td className="py-2 text-muted-foreground">{index + 1}</td>
                              <td className="py-2 font-medium">{product.name}</td>
                              <td className="py-2 text-right">{product.quantity}</td>
                              <td className="py-2 text-right font-medium">{cs}{product.revenue?.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No data for the selected period.</CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
