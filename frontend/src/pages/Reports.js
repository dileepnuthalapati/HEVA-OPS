import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Download, Calendar, TrendingUp } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Panel</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const Reports = () => {
  const location = useLocation();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loadStats = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    setLoading(true);
    try {
      const data = await reportAPI.getStats(
        new Date(startDate).toISOString(),
        new Date(endDate).toISOString()
      );
      setStats(data);
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    setDownloading(true);
    try {
      const blob = await reportAPI.generatePDF(
        new Date(startDate).toISOString(),
        new Date(endDate).toISOString()
      );
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_report_${startDate}_to_${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('PDF downloaded successfully');
    } catch (error) {
      toast.error('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Sales Reports</h1>
            <p className="text-muted-foreground">Generate detailed sales reports for any date range</p>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold">Report Configuration</CardTitle>
              <CardDescription>Select date range to generate your sales report</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    data-testid="report-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-12"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    data-testid="report-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-12"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Quick Ranges</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    data-testid="quick-range-today"
                    onClick={() => setQuickRange(0)}
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="quick-range-week"
                    onClick={() => setQuickRange(7)}
                  >
                    Last 7 Days
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="quick-range-month"
                    onClick={() => setQuickRange(30)}
                  >
                    Last 30 Days
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="quick-range-quarter"
                    onClick={() => setQuickRange(90)}
                  >
                    Last 90 Days
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1 h-12"
                  data-testid="generate-report-button"
                  onClick={loadStats}
                  disabled={loading || !startDate || !endDate}
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  {loading ? 'Generating...' : 'Generate Report'}
                </Button>
                <Button
                  className="flex-1 h-12"
                  variant="secondary"
                  data-testid="download-pdf-button"
                  onClick={downloadPDF}
                  disabled={downloading || !startDate || !endDate}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {downloading ? 'Downloading...' : 'Download PDF'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {stats && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Card className="metric-card" data-testid="report-total-sales">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Total Sales
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono text-emerald-600">
                      ${stats.total_sales.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="report-total-orders">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Total Orders
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono">{stats.total_orders}</div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="report-avg-order">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Avg Order Value
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono text-blue-600">
                      ${stats.avg_order_value.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {stats.top_products && stats.top_products.length > 0 && (
                <Card data-testid="report-top-products">
                  <CardHeader>
                    <CardTitle className="text-2xl font-semibold">Top Selling Products</CardTitle>
                    <CardDescription>
                      From {startDate} to {endDate}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.top_products.map((product, index) => (
                        <div
                          key={index}
                          data-testid={`report-product-${index}`}
                          className="flex items-center justify-between p-4 rounded-lg border bg-card"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary">
                              #{index + 1}
                            </div>
                            <div>
                              <div className="font-semibold text-lg">{product.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {product.quantity} units sold
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold font-mono text-emerald-600">
                              ${product.revenue.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">Revenue</div>
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

export default Reports;
