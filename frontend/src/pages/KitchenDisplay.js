import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { connectSocket, disconnectSocket, startSafetyPoll, stopSafetyPoll } from '../services/socket';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  ChefHat, Clock, QrCode, Monitor, Volume2, VolumeX,
  CheckCircle2, ArrowRight, RotateCcw, Flame
} from 'lucide-react';

const KDS_STATUS = {
  new: { label: 'NEW', color: 'bg-red-500', text: 'text-white', ring: 'ring-red-400', pulse: true },
  acknowledged: { label: 'SEEN', color: 'bg-amber-400', text: 'text-amber-900', ring: 'ring-amber-300', pulse: false },
  preparing: { label: 'COOKING', color: 'bg-yellow-300', text: 'text-yellow-900', ring: 'ring-yellow-300', pulse: false },
  ready: { label: 'READY', color: 'bg-emerald-500', text: 'text-white', ring: 'ring-emerald-400', pulse: false },
};

const formatTimer = (createdAt) => {
  if (!createdAt) return '--:--';
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 0) return '0:00';
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const isOverdue = (createdAt, thresholdMin = 15) => {
  if (!createdAt) return false;
  const diff = (Date.now() - new Date(createdAt).getTime()) / 1000;
  return diff > thresholdMin * 60;
};

export default function KitchenDisplay() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [now, setNow] = useState(Date.now());
  const prevOrderIds = useRef(new Set());

  // Tick the timers every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.7, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.2);
      });
      setTimeout(() => ctx.close(), 2000);
    } catch (e) { /* silent */ }
  }, [soundEnabled]);

  const fetchOrders = useCallback(async () => {
    try {
      const [ordersRes, statsRes] = await Promise.all([
        api.get('/kds/orders'),
        api.get('/kds/stats'),
      ]);
      const newOrders = ordersRes.data;

      // Detect truly new orders and beep
      const newIds = new Set(newOrders.map(o => o.id));
      const freshOrders = newOrders.filter(o => !prevOrderIds.current.has(o.id) && o.kds_status === 'new');
      if (freshOrders.length > 0 && prevOrderIds.current.size > 0) {
        playBeep();
      }
      prevOrderIds.current = newIds;

      setOrders(newOrders);
      setStats(statsRes.data);
    } catch (err) {
      console.warn('[KDS] Fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [playBeep]);

  // Initial load + WebSocket
  useEffect(() => {
    fetchOrders();
    if (user?.restaurant_id) {
      connectSocket(user.restaurant_id, {
        onNewQROrder: () => fetchOrders(),
        onOrderUpdate: () => fetchOrders(),
      });
      startSafetyPoll(fetchOrders);
    }
    return () => disconnectSocket();
  }, [user?.restaurant_id, fetchOrders]);

  // Bump order to next status
  const bumpOrder = async (orderId, currentStatus) => {
    const nextMap = { new: 'acknowledge', acknowledged: 'preparing', preparing: 'ready' };
    const action = nextMap[currentStatus];
    if (!action) return;
    try {
      await api.put(`/kds/orders/${orderId}/${action}`);
      fetchOrders();
    } catch (err) {
      toast.error('Failed to update order');
    }
  };

  const recallOrder = async (orderId) => {
    try {
      await api.put(`/kds/orders/${orderId}/recall`);
      toast.info('Order recalled to kitchen');
      fetchOrders();
    } catch (err) {
      toast.error('Failed to recall order');
    }
  };

  // Sort: new first, then acknowledged, then preparing, ready at end
  const statusOrder = { new: 0, acknowledged: 1, preparing: 2, ready: 3 };
  const sortedOrders = [...orders].sort((a, b) => {
    const sa = statusOrder[a.kds_status] ?? 0;
    const sb = statusOrder[b.kds_status] ?? 0;
    if (sa !== sb) return sa - sb;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  const activeCount = orders.filter(o => o.kds_status !== 'ready').length;
  const readyCount = orders.filter(o => o.kds_status === 'ready').length;

  return (
    <div className="min-h-screen bg-slate-950 text-white" data-testid="kds-page">
      {/* KDS Top Bar */}
      <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-orange-400" />
          <h1 className="text-lg font-bold tracking-tight" data-testid="kds-title">Kitchen Display</h1>
          <div className="hidden sm:flex items-center gap-2 ml-4 text-sm">
            <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-mono font-bold">
              {activeCount} active
            </span>
            <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono font-bold">
              {readyCount} ready
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-400" data-testid="kds-avg-prep">
              <Clock className="w-4 h-4" />
              Avg prep: <span className="font-mono font-bold text-white">{stats.avg_prep_time_display}</span>
            </div>
          )}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700 text-slate-500'}`}
            data-testid="kds-sound-toggle"
            title={soundEnabled ? 'Sound on' : 'Sound off'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchOrders}
            className="text-slate-300 hover:text-white"
            data-testid="kds-refresh"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Order Grid */}
      <div className="p-3 md:p-4">
        {loading ? (
          <div className="flex items-center justify-center h-[60vh] text-slate-400 text-lg">
            Loading kitchen orders...
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500" data-testid="kds-empty">
            <ChefHat className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-xl font-semibold mb-1">All Clear</p>
            <p className="text-sm">No orders in the kitchen queue</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {sortedOrders.map((order) => {
              const status = KDS_STATUS[order.kds_status] || KDS_STATUS.new;
              const overdue = isOverdue(order.created_at);
              const timer = formatTimer(order.created_at);
              const isQR = order.source === 'qr';

              return (
                <div
                  key={order.id}
                  data-testid={`kds-ticket-${order.id}`}
                  className={`rounded-2xl border overflow-hidden transition-all ${
                    order.kds_status === 'ready'
                      ? 'bg-emerald-950 border-emerald-700'
                      : order.kds_status === 'new'
                        ? 'bg-slate-800 border-red-500/50'
                        : 'bg-slate-800 border-slate-600'
                  } ${status.pulse ? 'animate-pulse' : ''}`}
                >
                  {/* Ticket Header */}
                  <div className={`flex items-center justify-between px-4 py-2 ${status.color}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-black ${status.text}`}>
                        #{String(order.order_number).padStart(3, '0')}
                      </span>
                      {isQR && (
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5">
                          <QrCode className="w-3 h-3" /> QR
                        </span>
                      )}
                      {!isQR && (
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5">
                          <Monitor className="w-3 h-3" /> POS
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-bold uppercase ${status.text}`}>{status.label}</span>
                  </div>

                  {/* Timer + Table */}
                  <div className="px-4 py-2 flex items-center justify-between border-b border-slate-700">
                    <div className="flex items-center gap-2 text-sm">
                      {order.table_name && (
                        <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded-md font-semibold text-xs">
                          {order.table_name}
                        </span>
                      )}
                      {order.guest_name && (
                        <span className="text-slate-400 text-xs truncate max-w-[100px]">{order.guest_name}</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-mono font-bold ${
                      overdue ? 'text-red-400' : 'text-slate-300'
                    }`}>
                      {overdue && <Flame className="w-3.5 h-3.5 text-red-400" />}
                      <Clock className="w-3.5 h-3.5" />
                      {timer}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="bg-slate-700 text-white rounded-md w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {item.quantity}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{item.product_name}</p>
                          {item.notes && (
                            <p className="text-xs text-amber-400 mt-0.5 truncate">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {order.guest_notes && (
                      <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-amber-300">
                        Note: {order.guest_notes}
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="px-3 pb-3">
                    {order.kds_status === 'new' && (
                      <button
                        data-testid={`kds-bump-${order.id}`}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-amber-950 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        onClick={() => bumpOrder(order.id, 'new')}
                      >
                        <CheckCircle2 className="w-4 h-4" /> Acknowledge
                      </button>
                    )}
                    {order.kds_status === 'acknowledged' && (
                      <button
                        data-testid={`kds-bump-${order.id}`}
                        className="w-full bg-yellow-400 hover:bg-yellow-300 text-yellow-950 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        onClick={() => bumpOrder(order.id, 'acknowledged')}
                      >
                        <Flame className="w-4 h-4" /> Start Cooking
                      </button>
                    )}
                    {order.kds_status === 'preparing' && (
                      <button
                        data-testid={`kds-bump-${order.id}`}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        onClick={() => bumpOrder(order.id, 'preparing')}
                      >
                        <CheckCircle2 className="w-4 h-4" /> Ready for Pickup
                      </button>
                    )}
                    {order.kds_status === 'ready' && (
                      <button
                        data-testid={`kds-recall-${order.id}`}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-colors"
                        onClick={() => recallOrder(order.id)}
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Recall
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
