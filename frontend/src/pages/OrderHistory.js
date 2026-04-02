import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { orderAPI, restaurantAPI, printerAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Calendar, Printer, XCircle, ArrowLeft } from 'lucide-react';

const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const OrderHistory = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GBP');
  const [printingOrderId, setPrintingOrderId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [cancelDialog, setCancelDialog] = useState({ open: false, orderId: null });
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    loadOrders();
    loadCurrency();
  }, []);

  const loadCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) setCurrency(restaurant.currency);
    } catch (e) {}
  };

  const loadOrders = async () => {
    try {
      const fromDate = searchParams.get('from');
      const toDate = searchParams.get('to');
      let data;
      if (fromDate && toDate) {
        data = await orderAPI.getAll({ from_date: fromDate, to_date: toDate });
      } else {
        // Default: show today's business day orders (resets at 2AM)
        data = await orderAPI.getAll({ today_only: true });
      }
      setOrders(data);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) {
      toast.error('Please enter a reason for cancellation');
      return;
    }
    try {
      await orderAPI.cancel(cancelDialog.orderId, cancelReason);
      toast.success('Order cancelled');
      setCancelDialog({ open: false, orderId: null });
      setCancelReason('');
      loadOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel');
    }
  };

  const handleReprintReceipt = async (orderId) => {
    setPrintingOrderId(orderId);
    try {
      await printerAPI.printCustomerReceipt(orderId);
      toast.success('Receipt generated');
    } catch (error) {
      toast.error('Failed to generate receipt');
    } finally {
      setPrintingOrderId(null);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleString() : 'N/A';

  // Filter by date range from Reports deeplink
  const fromDate = searchParams.get('from');
  const toDate = searchParams.get('to');

  let filteredOrders = orders;
  if (fromDate || toDate) {
    filteredOrders = orders.filter(o => {
      if (!o.created_at) return false;
      const d = o.created_at.split('T')[0];
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }
  if (statusFilter !== 'all') {
    filteredOrders = filteredOrders.filter(o => o.status === statusFilter);
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 md:mb-6">
            <div className="flex items-center gap-3 mb-1">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="back-button" className="h-8 w-8 p-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight" data-testid="orders-heading">Order History</h1>
            </div>
            <p className="text-sm text-muted-foreground ml-11">
              {fromDate && toDate ? `Showing orders from ${fromDate} to ${toDate}` : `Today's orders (${orders.length})`}
            </p>
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1" data-testid="order-status-filter">
            {['all', 'pending', 'completed', 'cancelled'].map((status) => (
              <Button key={status} variant={statusFilter === status ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(status)} className="capitalize whitespace-nowrap text-xs md:text-sm">
                {status === 'all' ? `All (${filteredOrders.length})` : `${status} (${filteredOrders.filter(o => o.status === status).length})`}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No orders found.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filteredOrders.filter(o => statusFilter === 'all' || o.status === statusFilter).map((order) => (
                <Card key={order.id} data-testid={`order-item-${order.id}`}>
                  <CardHeader className="px-4 py-3 md:px-6 md:py-4">
                    <CardTitle className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base md:text-lg font-bold">Order #{String(order.order_number || 0).padStart(3, '0')}</div>
                          {order.status === 'pending' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>}
                          {order.status === 'completed' && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Completed{order.payment_method ? ` - ${order.payment_method.toUpperCase()}` : ''}</span>}
                          {order.status === 'cancelled' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>}
                        </div>
                        <div className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{formatDate(order.created_at)}</span>
                        </div>
                        {order.cancel_reason && (
                          <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded mt-1" data-testid={`cancel-reason-${order.id}`}>
                            Reason: {order.cancel_reason} {order.cancelled_by && `(by ${order.cancelled_by})`}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-lg md:text-2xl font-bold font-mono text-emerald-600">{getCurrencySymbol(currency)}{(order.total_amount || 0).toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">by {order.created_by}</div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button variant="outline" size="sm" data-testid={`reprint-receipt-${order.id}`} disabled={printingOrderId === order.id} onClick={() => handleReprintReceipt(order.id)} className="h-8 px-2" title="Reprint Receipt">
                            <Printer className="w-4 h-4" />
                          </Button>
                          {order.status === 'pending' && (
                            <Button variant="outline" size="sm" data-testid={`cancel-order-${order.id}`} onClick={() => setCancelDialog({ open: true, orderId: order.id })} className="h-8 px-2 text-red-500 hover:bg-red-50" title="Cancel Order">
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 md:px-6 md:pb-4">
                    <div className="space-y-1.5">
                      {(order.items || []).map((item, index) => (
                        <div key={index} className="flex justify-between items-center p-2 rounded-lg bg-muted/50 text-sm">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{item.product_name || 'Item'}</div>
                            <div className="text-xs text-muted-foreground">{getCurrencySymbol(currency)}{(item.unit_price || 0).toFixed(2)} x {item.quantity}</div>
                          </div>
                          <div className="font-bold font-mono shrink-0 ml-2">{getCurrencySymbol(currency)}{(item.total || 0).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Order Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => { if (!open) { setCancelDialog({ open: false, orderId: null }); setCancelReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>Please provide a reason for cancellation. This will be recorded.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Textarea placeholder="Enter reason for cancellation..." value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} data-testid="cancel-reason-input" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setCancelDialog({ open: false, orderId: null }); setCancelReason(''); }}>Back</Button>
              <Button variant="destructive" className="flex-1" data-testid="confirm-cancel-btn" onClick={handleCancelOrder} disabled={!cancelReason.trim()}>Confirm Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderHistory;
