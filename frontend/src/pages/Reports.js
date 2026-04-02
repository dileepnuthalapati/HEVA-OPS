import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { reportAPI, restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { BarChart3, TrendingUp, ShoppingBag, Coins, Calendar, ArrowLeft, Banknote, CreditCard, Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';

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

  const downloadPDF = () => {
    if (!stats) return;
    try {
      const doc = new jsPDF();
      const cs = getCurrencySymbol(currency);
      
      doc.setFontSize(20);
      doc.text('Sales Report', 105, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`Period: ${startDate} to ${endDate}`, 105, 30, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 36, { align: 'center' });
      
      // Summary
      doc.setFontSize(14);
      doc.text('Summary', 14, 50);
      doc.setFontSize(11);
      const summaryY = 60;
      doc.text(`Total Sales: ${cs}${stats.total_sales?.toFixed(2) || '0.00'}`, 14, summaryY);
      doc.text(`Total Orders: ${stats.total_orders || 0}`, 14, summaryY + 8);
      doc.text(`Average Order: ${cs}${stats.avg_order_value?.toFixed(2) || '0.00'}`, 14, summaryY + 16);
      doc.text(`Cash Total: ${cs}${stats.cash_total?.toFixed(2) || '0.00'}`, 14, summaryY + 24);
      doc.text(`Card Total: ${cs}${stats.card_total?.toFixed(2) || '0.00'}`, 14, summaryY + 32);
      
      // Product breakdown
      if (stats.top_products?.length > 0) {
        doc.setFontSize(14);
        doc.text('Top Products', 14, summaryY + 50);
        doc.setFontSize(10);
        let y = summaryY + 60;
        stats.top_products.forEach((p, i) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(`${i + 1}. ${p.name} — Qty: ${p.quantity}, Revenue: ${cs}${p.revenue?.toFixed(2)}`, 14, y);
          y += 8;
        });
      }
      
      // Open PDF in a new tab so user can view, save, or share
      const pdfDataUri = doc.output('dataurlstring');
      window.open(pdfDataUri, '_blank');
      
      toast.success('Report opened in new tab');
    } catch (error) {
      toast.error('Failed to generate PDF');
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
            <Button onClick={downloadPDF} disabled={!stats} variant="outline" data-testid="download-pdf-btn">
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </Button>
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
