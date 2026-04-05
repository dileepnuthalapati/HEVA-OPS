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
  const symbols = { 'GBP': '\u00a3', 'USD': '$', 'EUR': '\u20ac', 'INR': '\u20b9' };
  return symbols[currency] || currency || '\u00a3';
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
  const [activeRange, setActiveRange] = useState('30 Days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadCurrency();
    // Default to 30 days so there's always data to show
    handleRangeSelect('30 Days', 30);
    // eslint-disable-next-line
  }, []);

  const loadCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) setCurrency(restaurant.currency);
    } catch {}
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
    } catch {
      toast.error('Failed to load reports');
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomDateSearch = () => {
    if (!startDate || !endDate) return toast.error('Select both dates');
    setActiveRange('');
    loadStats(startDate, endDate);
  };

  const downloadPDF = async () => {
    if (!stats) return;
    try {
      toast.loading('Generating PDF...', { id: 'pdf' });
      const apiUrl = process.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem('auth_token');
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
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('pdf')) {
        throw new Error('Server did not return a PDF file');
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error('Empty PDF received');
      const filename = `sales_report_${startDate}_${endDate}.pdf`;

      // Create blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);
      toast.success('PDF downloaded!', { id: 'pdf' });
    } catch (error) {
      console.error('PDF download error:', error);
      toast.error('PDF download failed: ' + error.message, { id: 'pdf' });
    }
  };

  const cs = getCurrencySymbol(currency);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8 pt-16 md:pt-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <button onClick={() => navigate(-1)} className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors" data-testid="reports-back-btn">
                  <ArrowLeft className="w-4 h-4 text-slate-600" />
                </button>
                <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight text-slate-900" data-testid="reports-heading">Sales Reports</h1>
              </div>
              <p className="text-xs text-slate-400 ml-12 font-medium">Analyze your business performance</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadPDF}
                disabled={!stats || loading}
                className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 btn-haptic flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="download-pdf-btn"
              >
                <Download className="w-4 h-4" /> Download PDF
              </button>
              <button
                onClick={async () => {
                  if (!stats) return;
                  try {
                    toast.loading('Opening PDF...', { id: 'pdf-view' });
                    const apiUrl = process.env.REACT_APP_BACKEND_URL;
                    const token = localStorage.getItem('auth_token');
                    const res = await fetch(`${apiUrl}/api/reports/generate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ start_date: startDate, end_date: endDate, report_type: 'sales' }),
                    });
                    if (!res.ok) throw new Error(`Server returned ${res.status}`);
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                    window.open(url, '_blank');
                    toast.success('PDF opened in new tab', { id: 'pdf-view' });
                  } catch (e) {
                    toast.error('Failed: ' + e.message, { id: 'pdf-view' });
                  }
                }}
                disabled={!stats || loading}
                className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 btn-haptic flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="view-pdf-btn"
              >
                <FileText className="w-4 h-4" /> View PDF
              </button>
            </div>
          </div>

          {/* Range Buttons */}
          <div className="flex flex-wrap gap-1.5 mb-4" data-testid="range-buttons">
            {RANGES.map(({ label, days }) => (
              <button
                key={label}
                onClick={() => handleRangeSelect(label, days)}
                className={`h-8 px-4 rounded-full text-xs font-semibold btn-haptic transition-all ${
                  activeRange === label
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                data-testid={`range-${label.toLowerCase().replace(' ', '-')}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom Date Range */}
          <div className="flex flex-wrap items-end gap-2 mb-6">
            <div>
              <label className="text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400 mb-1 block">From</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="start-date" className="w-40 h-9 rounded-xl text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400 mb-1 block">To</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="end-date" className="w-40 h-9 rounded-xl text-sm" />
            </div>
            <button onClick={handleCustomDateSearch} className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 btn-haptic transition-all flex items-center gap-1.5" data-testid="custom-date-btn">
              <Calendar className="w-3.5 h-3.5" /> Apply
            </button>
            <button onClick={() => navigate(`/orders?from=${startDate}&to=${endDate}`)} className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 btn-haptic transition-all flex items-center gap-1.5" data-testid="view-orders-btn">
              <FileText className="w-3.5 h-3.5" /> View Orders
            </button>
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm font-medium">Loading reports...</div>
          ) : stats ? (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="stat-total-sales">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Coins className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Sales</span>
                    </div>
                    <div className="text-lg md:text-xl font-bold font-mono text-slate-900">{cs}{stats.total_sales?.toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="stat-total-orders">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                      <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Orders</span>
                    </div>
                    <div className="text-lg md:text-xl font-bold font-mono text-slate-900">{stats.total_orders}</div>
                    {(stats.completed_orders !== undefined || stats.cancelled_orders !== undefined) && (
                      <div className="flex gap-2 mt-1 text-[10px] font-semibold">
                        <span className="text-emerald-600">{stats.completed_orders || 0} completed</span>
                        {stats.cancelled_orders > 0 && <span className="text-red-500">{stats.cancelled_orders} cancelled</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="stat-avg-order">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                        <TrendingUp className="w-3.5 h-3.5 text-violet-600" />
                      </div>
                      <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Avg Order</span>
                    </div>
                    <div className="text-lg md:text-xl font-bold font-mono text-slate-900">{cs}{stats.avg_order_value?.toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="stat-cash-total">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Cash</span>
                    </div>
                    <div className="text-lg md:text-xl font-bold font-mono text-slate-900">{cs}{stats.cash_total?.toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="stat-card-total">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                        <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Card</span>
                    </div>
                    <div className="text-lg md:text-xl font-bold font-mono text-slate-900">{cs}{stats.card_total?.toFixed(2)}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Products */}
              {stats.top_products?.length > 0 && (
                <Card className="bg-white border-slate-200/60 shadow-sm" data-testid="top-products-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <BarChart3 className="w-4 h-4 text-indigo-600" /> Top Products
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="py-2.5 text-left text-[11px] font-bold tracking-wider uppercase text-slate-400">#</th>
                            <th className="py-2.5 text-left text-[11px] font-bold tracking-wider uppercase text-slate-400">Product</th>
                            <th className="py-2.5 text-right text-[11px] font-bold tracking-wider uppercase text-slate-400">Qty</th>
                            <th className="py-2.5 text-right text-[11px] font-bold tracking-wider uppercase text-slate-400">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.top_products.map((product, index) => (
                            <tr key={index} className="border-b border-slate-50 last:border-0">
                              <td className="py-2.5 text-slate-400 font-medium">{index + 1}</td>
                              <td className="py-2.5 font-semibold text-slate-800">{product.name}</td>
                              <td className="py-2.5 text-right font-mono text-slate-600">{product.quantity}</td>
                              <td className="py-2.5 text-right font-mono font-bold text-emerald-600">{cs}{product.revenue?.toFixed(2)}</td>
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
            <Card className="bg-white border-slate-200/60">
              <CardContent className="py-16 text-center text-slate-400 text-sm">
                No data for the selected period. Try selecting a wider date range.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
