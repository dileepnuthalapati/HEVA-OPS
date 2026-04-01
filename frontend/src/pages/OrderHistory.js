import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { orderAPI, restaurantAPI, printerAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Calendar, Printer, X } from 'lucide-react';

const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GBP');
  const [printingOrderId, setPrintingOrderId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadOrders();
    loadCurrency();
  }, []);

  const loadCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) setCurrency(restaurant.currency);
    } catch (error) {}
  };

  const loadOrders = async () => {
    try {
      const data = await orderAPI.getAll();
      setOrders(data);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleReprintReceipt = async (orderId) => {
    setPrintingOrderId(orderId);
    try {
      const blob = await printerAPI.printCustomerReceipt(orderId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt_${orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Receipt downloaded!');
    } catch (error) {
      toast.error('Failed to generate receipt');
    } finally {
      setPrintingOrderId(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const filteredOrders = statusFilter === 'all' 
    ? orders 
    : orders.filter(o => o.status === statusFilter);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 md:mb-8">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2">Order History</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              View all orders &bull; {orders.length} total
            </p>
          </div>

          {/* Status filter */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1" data-testid="order-status-filter">
            {['all', 'pending', 'completed', 'cancelled'].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize whitespace-nowrap text-xs md:text-sm"
              >
                {status === 'all' ? `All (${orders.length})` : `${status} (${orders.filter(o => o.status === status).length})`}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {statusFilter === 'all' 
                  ? 'No orders yet. Complete your first order to see it here.'
                  : `No ${statusFilter} orders found.`}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 md:space-y-4">
              {filteredOrders.map((order) => (
                <Card key={order.id} data-testid={`order-item-${order.id}`}>
                  <CardHeader className="px-4 py-3 md:px-6 md:py-4">
                    <CardTitle className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base md:text-lg font-bold">
                            Order #{String(order.order_number || 0).padStart(3, '0')}
                          </div>
                          {order.status === 'pending' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
                          )}
                          {order.status === 'completed' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              Completed{order.payment_method ? ` - ${order.payment_method.toUpperCase()}` : ''}
                            </span>
                          )}
                          {order.status === 'cancelled' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>
                          )}
                        </div>
                        <div className="text-xs md:text-sm text-muted-foreground font-normal flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{formatDate(order.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-lg md:text-2xl font-bold font-mono text-emerald-600">
                            {getCurrencySymbol(currency)}{(order.total_amount || 0).toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">by {order.created_by}</div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`reprint-receipt-${order.id}`}
                          disabled={printingOrderId === order.id}
                          onClick={() => handleReprintReceipt(order.id)}
                          className="h-8 md:h-9 px-2 md:px-3 shrink-0"
                          title="Reprint Receipt"
                        >
                          <Printer className="w-4 h-4 mr-0 md:mr-1.5" />
                          <span className="hidden md:inline text-xs">Reprint</span>
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 md:px-6 md:pb-4">
                    <div className="space-y-1.5 md:space-y-2">
                      {(order.items || []).map((item, index) => (
                        <div
                          key={index}
                          data-testid={`order-item-product-${index}`}
                          className="flex justify-between items-center p-2 md:p-3 rounded-lg bg-muted/50 text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{item.product_name || 'Item'}</div>
                            <div className="text-xs md:text-sm text-muted-foreground">
                              {getCurrencySymbol(currency)}{(item.unit_price || 0).toFixed(2)} x {item.quantity}
                            </div>
                          </div>
                          <div className="font-bold font-mono shrink-0 ml-2">
                            {getCurrencySymbol(currency)}{(item.total || 0).toFixed(2)}
                          </div>
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
    </div>
  );
};

export default OrderHistory;
