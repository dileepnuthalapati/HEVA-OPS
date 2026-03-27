import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { orderAPI, restaurantAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Calendar } from 'lucide-react';

// Currency helper
const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GBP');

  useEffect(() => {
    loadOrders();
    loadCurrency();
  }, []);

  const loadCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) {
        setCurrency(restaurant.currency);
      }
    } catch (error) {
      // Use default currency
    }
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Order History</h1>
            <p className="text-muted-foreground">View all completed orders</p>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading orders...</div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No orders yet. Complete your first order to see it here.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} data-testid={`order-item-${order.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-bold">Order #{String(order.order_number).padStart(3, '0')}</div>
                          {order.status === 'pending' && (
                            <div className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                              Pending Payment
                            </div>
                          )}
                          {order.status === 'completed' && (
                            <div className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                              Completed - {order.payment_method?.toUpperCase()}
                            </div>
                          )}
                          {!order.synced && (
                            <div className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                              Offline
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground font-normal flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {formatDate(order.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono text-emerald-600">
                          {getCurrencySymbol(currency)}{order.total_amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">by {order.created_by}</div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {order.items.map((item, index) => (
                        <div
                          key={index}
                          data-testid={`order-item-product-${index}`}
                          className="flex justify-between items-center p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {getCurrencySymbol(currency)}{item.unit_price.toFixed(2)} × {item.quantity}
                            </div>
                          </div>
                          <div className="font-bold font-mono">{getCurrencySymbol(currency)}{item.total.toFixed(2)}</div>
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
