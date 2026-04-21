import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext';
import { categoryAPI, productAPI, orderAPI, tableAPI, printerAPI, restaurantAPI } from '../services/api';
import posPrintService from '../services/posPrintService';
import { connectSocket, disconnectSocket, startSafetyPoll, stopSafetyPoll } from '../services/socket';
import { saveToIndexedDB, getUnsyncedOrders } from '../services/db';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Minus, Trash2, LogOut, Receipt, X, Printer, CreditCard, Users, Percent, Tag, MessageSquare, Banknote, Search, PackagePlus, ArrowLeft, Calendar, ShoppingBag, UtensilsCrossed, Clock } from 'lucide-react';
import VoidReasonModal from '../components/VoidReasonModal';

// Currency helper
const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const POSScreen = () => {
  const navigate = useNavigate();
  const { user, logout, isTerminalMode } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [orderType, setOrderType] = useState('takeaway');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedOrderToComplete, setSelectedOrderToComplete] = useState(null);
  const [tipPercentage, setTipPercentage] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [splitCount, setSplitCount] = useState(1);
  const [currency, setCurrency] = useState('GBP');
  
  // Edit order state
  const [editingOrder, setEditingOrder] = useState(null);
  
  // Last placed order number for display
  const [lastOrderNumber, setLastOrderNumber] = useState(null);
  
  // New states for discounts, notes, and split payment
  const [orderNotes, setOrderNotes] = useState('');
  const [discountType, setDiscountType] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  
  // Split payment mode (cash/card amounts)
  const [splitPaymentMode, setSplitPaymentMode] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  
  // Product search
  const [searchQuery, setSearchQuery] = useState('');
  
  // Custom/Temporary product dialog
  const [showCustomProductDialog, setShowCustomProductDialog] = useState(false);
  const [customProductName, setCustomProductName] = useState('');
  const [customProductPrice, setCustomProductPrice] = useState('');
  
  // Debounce for preventing double clicks
  const placingOrderRef = useRef(false);
  const addingToCartRef = useRef(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Completed orders for today (visible in pending orders panel)
  const [completedOrders, setCompletedOrders] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false); // Prevent duplicate prints
  const [printSettings, setPrintSettings] = useState({ print_kitchen_slip: true, print_customer_receipt: true });

  // WebSocket / QR Alert states
  const [qrAlert, setQrAlert] = useState(null);
  const [flashActive, setFlashActive] = useState(false);
  const [restaurantInfo, setRestaurantInfo] = useState(null);
  const audioCtxRef = useRef(null);

  // Printer status indicator
  const [printerStatus, setPrinterStatus] = useState('unknown'); // 'online', 'offline', 'unknown', 'none'
  const [defaultPrinterName, setDefaultPrinterName] = useState(null);
  const [defaultPaperWidth, setDefaultPaperWidth] = useState(80);

  // Void modal state
  const [voidModal, setVoidModal] = useState({ open: false, orderId: null, orderNumber: null });

  // Play loud BEEP sound for QR order alerts
  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Play 3 quick beeps
      [0, 0.3, 0.6].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.8, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.2);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.25);
      });
      setTimeout(() => ctx.close(), 2000);
    } catch (e) {
      console.warn('[POS] Audio beep failed:', e);
    }
  }, []);

  // Handle incoming QR order alert
  const handleQROrder = useCallback((data) => {
    console.log('[POS] QR Order received!', data);
    setQrAlert(data);
    setFlashActive(true);
    playBeep();
    setTimeout(() => setFlashActive(false), 5000);
    setTimeout(() => setQrAlert(null), 15000);
    loadPendingOrders();
  }, [playBeep]);

  // Check printer reachability (delegated to posPrintService)
  const checkPrinterStatus = useCallback(async () => {
    const { status, name, paperWidth } = await posPrintService.checkDefaultPrinterStatus();
    setPrinterStatus(status);
    setDefaultPrinterName(name);
    setDefaultPaperWidth(paperWidth);
  }, []);

  // Sync offline orders to the backend (with jitter to prevent reconnection storms)
  const syncOfflineOrders = useCallback(async () => {
    try {
      const unsynced = await getUnsyncedOrders();
      if (unsynced.length === 0) return;
      // Add random jitter (1-5s) to prevent all tablets syncing at once
      const jitter = 1000 + Math.random() * 4000;
      await new Promise(r => setTimeout(r, jitter));
      console.log(`[POS] Syncing ${unsynced.length} offline orders (after ${(jitter/1000).toFixed(1)}s jitter)...`);
      await orderAPI.sync(unsynced);
      for (const order of unsynced) {
        await saveToIndexedDB('orders', { ...order, synced: true });
      }
      toast.success(`Synced ${unsynced.length} offline order${unsynced.length > 1 ? 's' : ''}`);
      loadPendingOrders();
    } catch (err) {
      console.warn('[POS] Offline sync failed:', err.message);
    }
  }, []);

  // Print a specific order's kitchen receipt (manual action on Orders list)
  const printOrderReceipt = async (orderId, orderNumber) => {
    if (isPrinting) {
      toast.warning('Already printing, please wait...');
      return;
    }
    const toastId = toast.loading(`Printing order #${orderNumber}...`);
    setIsPrinting(true);
    try {
      const order = pendingOrders.find(o => o.id === orderId) || completedOrders.find(o => o.id === orderId);
      if (!order) {
        toast.error('Order not found', { id: toastId });
        return;
      }
      const res = await posPrintService.reprintKitchenTicket({
        order,
        tables,
        businessInfo: restaurantInfo?.business_info || {},
        paperWidth: defaultPaperWidth,
      });
      if (res.ok) {
        toast.success(`Order #${orderNumber} sent to printer`, { id: toastId });
      } else {
        toast.error(`Print failed: ${res.error || 'unknown'}`, { id: toastId });
      }
    } catch (err) {
      toast.error('Failed to print: ' + (err.message || ''), { id: toastId });
    } finally {
      setIsPrinting(false);
    }
  };

  useEffect(() => {
    loadData();
    loadPendingOrders();
    loadRestaurantCurrency();
    loadTables();
    checkPrinterStatus();
    syncOfflineOrders();
    // Re-check printer status every 60 seconds
    const printerCheckInterval = setInterval(checkPrinterStatus, 60000);
    return () => clearInterval(printerCheckInterval);
  }, []);

  // WebSocket connection for real-time QR order alerts
  useEffect(() => {
    if (!user?.restaurant_id) return;
    const socket = connectSocket(user.restaurant_id, {
      onNewQROrder: handleQROrder,
      onConnect: () => console.log('[POS] Socket connected'),
      onDisconnect: (reason) => console.log('[POS] Socket disconnected:', reason),
    });
    // Safety poll: fetch pending orders every 2 min as fallback
    startSafetyPoll(loadPendingOrders);
    return () => {
      disconnectSocket();
    };
  }, [user?.restaurant_id, handleQROrder]);

  const loadRestaurantCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) {
        setCurrency(restaurant.currency);
      }
      setRestaurantInfo(restaurant);
    } catch (error) {
      // Use default currency
    }
    // Load print settings
    try {
      const sec = await restaurantAPI.getSecuritySettings();
      setPrintSettings({ print_kitchen_slip: sec.print_kitchen_slip !== false, print_customer_receipt: sec.print_customer_receipt !== false });
    } catch {}
  };

  useEffect(() => {
    if (selectedCategory) {
      loadProducts(selectedCategory);
    } else {
      loadProducts();
    }
  }, [selectedCategory]);

  const loadData = async () => {
    try {
      const [cats, prods] = await Promise.all([
        categoryAPI.getAll(),
        productAPI.getAll(),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async (categoryId = null) => {
    try {
      const prods = await productAPI.getAll(categoryId);
      setProducts(prods);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const loadPendingOrders = async () => {
    try {
      const orders = await orderAPI.getPending();
      setPendingOrders(orders);
    } catch (error) {
      console.error('Failed to load pending orders:', error);
    }
  };

  const loadCompletedOrders = async () => {
    try {
      const orders = await orderAPI.getAll({ today_only: true });
      setCompletedOrders(orders.filter(o => o.status === 'completed'));
    } catch (error) {
      console.error('Failed to load completed orders:', error);
    }
  };

  const loadTables = async () => {
    try {
      const tablesData = await tableAPI.getAll();
      setTables(tablesData);
    } catch (error) {
      console.error('Failed to load tables:', error);
    }
  };

  const addToCart = (product) => {
    // Prevent double-clicks using ref (synchronous guard)
    if (addingToCartRef.current) return;
    addingToCartRef.current = true;
    
    const existing = cart.find((item) => item.product_id === product.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unit_price }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price: product.price,
          total: product.price,
        },
      ]);
    }
    
    // Reset after short delay
    setTimeout(() => { addingToCartRef.current = false; }, 250);
  };
  
  // Add custom/temporary product to cart
  const addCustomProductToCart = () => {
    if (!customProductName.trim() || !customProductPrice) {
      // Visual feedback via dialog staying open
      return;
    }
    
    const price = parseFloat(customProductPrice);
    if (isNaN(price) || price <= 0) {
      // Visual feedback via dialog staying open
      return;
    }
    
    const customId = `custom_${Date.now()}`;
    setCart([
      ...cart,
      {
        product_id: customId,
        product_name: customProductName.trim(),
        quantity: 1,
        unit_price: price,
        total: price,
        is_custom: true,
      },
    ]);
    
    // Custom item added - cart updates visually
    setCustomProductName('');
    setCustomProductPrice('');
    setShowCustomProductDialog(false);
  };
  
  // Filter products by search query
  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.category_name && product.category_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const updateQuantity = (productId, delta) => {
    setCart(
      cart
        .map((item) => {
          if (item.product_id === productId) {
            const newQuantity = item.quantity + delta;
            if (newQuantity <= 0) return null;
            return {
              ...item,
              quantity: newQuantity,
              total: newQuantity * item.unit_price,
            };
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.product_id !== productId));
    // Cart updates visually - no toast needed
  };

  const clearCart = () => {
    setCart([]);
    setOrderNotes('');
    setDiscountType('');
    setDiscountValue('');
    setDiscountReason('');
    setEditingOrder(null);
    // Cart clears visually - no toast needed
  };

  // Edit a pending order - load items into cart
  const editPendingOrder = (order) => {
    // Load order items into cart
    setCart(order.items.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
    })));
    
    // Set order details
    setEditingOrder(order);
    setSelectedTable(order.table_id || null);
    setOrderNotes(order.order_notes || '');
    setDiscountType(order.discount_type || '');
    setDiscountValue(order.discount_value ? order.discount_value.toString() : '');
    setDiscountReason(order.discount_reason || '');
    
    // Close pending orders panel
    setShowPendingOrders(false);
    // Editing banner shows - no toast needed
  };
  
  // Cancel a pending order — opens VoidReasonModal
  const cancelPendingOrder = (orderId, orderNumber) => {
    setVoidModal({ open: true, orderId, orderNumber });
  };

  const handleVoidConfirm = async (payload) => {
    await orderAPI.cancel(voidModal.orderId, payload);
    toast.success('Order voided');
    loadPendingOrders();
    loadCompletedOrders();
  };

  // Update an existing order
  const updateOrder = async () => {
    if (!editingOrder || cart.length === 0) return;
    
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    
    try {
      const updatedOrder = await orderAPI.update(editingOrder.id, {
        items: cart,
        subtotal: subtotal,
        total_amount: subtotal,
        table_id: selectedTable || null,
        order_type: selectedTable ? 'dine_in' : orderType,
        order_notes: orderNotes || null,
        discount_type: discountType || null,
        discount_value: discountValue ? parseFloat(discountValue) : 0,
        discount_reason: discountReason || null,
      });
      
      // Delta print: only print NEW items to kitchen
      try {
        const deltaOrder = { ...updatedOrder, items: cart };
        const res = await posPrintService.printKitchenDelta({
          order: deltaOrder,
          cartItems: cart,
          tables,
          businessInfo: restaurantInfo?.business_info || {},
          paperWidth: defaultPaperWidth,
          settings: printSettings,
        });
        if (res.ok) {
          orderAPI.markPrinted(editingOrder.id).catch(() => {});
        }
      } catch (e) {
        // silently skip print
      }
      
      // Clear cart and states
      setCart([]);
      setEditingOrder(null);
      setSelectedTable(null);
      setOrderType('takeaway');
      setOrderNotes('');
      setDiscountType('');
      setDiscountValue('');
      setDiscountReason('');
      setShowDiscountPanel(false);
      setShowNotesPanel(false);
      loadPendingOrders();
    } catch (error) {
      console.error('Failed to update order:', error);
    }
  };

  // Calculate discount amount
  const calculateDiscount = () => {
    if (!discountType || !discountValue) return 0;
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    if (discountType === 'percentage') {
      return subtotal * (parseFloat(discountValue) / 100);
    } else if (discountType === 'fixed') {
      return Math.min(parseFloat(discountValue), subtotal);
    }
    return 0;
  };

  // Calculate cart total after discount
  const calculateCartTotal = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const discount = calculateDiscount();
    return subtotal - discount;
  };

  const placeOrder = async () => {
    if (cart.length === 0) return;
    // Synchronous ref guard - prevents double-tap race condition
    if (placingOrderRef.current) return;
    placingOrderRef.current = true;
    setIsPlacingOrder(true);

    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const localId = uuidv4(); // Local UUID — no backend dependency

    try {
      const order = await orderAPI.create({
        items: cart,
        subtotal: subtotal,
        total_amount: subtotal,
        table_id: selectedTable || null,
        order_type: selectedTable ? 'dine_in' : orderType,
        order_notes: orderNotes || null,
        discount_type: discountType || null,
        discount_value: discountValue ? parseFloat(discountValue) : 0,
        discount_reason: discountReason || null,
      });
      
      // Print kitchen receipt in BACKGROUND (fire-and-forget — no UI blocking)
      try {
        posPrintService.printKitchenTicket({
          order,
          tables,
          businessInfo: restaurantInfo?.business_info || {},
          paperWidth: defaultPaperWidth,
          settings: printSettings,
          label: 'kitchen-auto',
        }).catch(() => {});
        // Mark all items as printed
        orderAPI.markPrinted(order.id).catch(() => {});
      } catch (e) {
        // silently skip
      }
      
      if (selectedTable) {
        try {
          await tableAPI.assignOrder(selectedTable, order.id);
          loadTables();
        } catch (tableError) {
          console.error('Failed to assign table:', tableError);
        }
      }
      
      setLastOrderNumber(order.order_number);
      setCart([]);
      setSelectedTable(null);
      setOrderNotes('');
      setDiscountType('');
      setDiscountValue('');
      setDiscountReason('');
      setShowDiscountPanel(false);
      setShowNotesPanel(false);
      loadPendingOrders();
      setTimeout(() => setLastOrderNumber(null), 5000);
    } catch (error) {
      // OFFLINE FALLBACK: Save order locally with UUID
      console.warn('[POS] Backend unreachable, saving order offline:', error.message);
      const offlineOrder = {
        id: localId,
        order_number: `OFF-${Date.now() % 10000}`,
        items: cart,
        subtotal,
        total_amount: subtotal,
        table_id: selectedTable || null,
        status: 'pending',
        created_by: user?.username || 'offline',
        created_at: new Date().toISOString(),
        synced: false,
      };
      try {
        await saveToIndexedDB('orders', offlineOrder);
        toast.info('Saved offline — will sync when connected');
        // Still print locally (offline path always attempts, ignoring kitchen toggle)
        try {
          await posPrintService.printKitchenTicket({
            order: offlineOrder,
            tables,
            businessInfo: restaurantInfo?.business_info || {},
            paperWidth: defaultPaperWidth,
            settings: { print_kitchen_slip: true },
            label: 'kitchen-offline',
          });
        } catch {}
        setLastOrderNumber(offlineOrder.order_number);
        setCart([]);
        setSelectedTable(null);
        setOrderNotes('');
        setDiscountType('');
        setDiscountValue('');
        setDiscountReason('');
        setTimeout(() => setLastOrderNumber(null), 5000);
      } catch (dbErr) {
        toast.error('Failed to save order');
      }
    } finally {
      placingOrderRef.current = false;
      setIsPlacingOrder(false);
    }
  };

  const downloadPDF = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const openCompleteDialog = (order) => {
    setSelectedOrderToComplete(order);
    setTipPercentage(0);
    setCustomTip('');
    setSplitCount(1);
    setSplitPaymentMode(false);
    setCashAmount('');
    setCardAmount('');
    setShowPaymentDialog(true);
  };

  const calculateTipAmount = () => {
    if (!selectedOrderToComplete) return 0;
    
    if (customTip) {
      return parseFloat(customTip) || 0;
    }
    
    if (tipPercentage > 0) {
      const baseAmount = (selectedOrderToComplete.subtotal || 0) - (selectedOrderToComplete.discount_amount || 0);
      return (baseAmount * tipPercentage) / 100;
    }
    
    return 0;
  };

  const calculateGrandTotal = () => {
    if (!selectedOrderToComplete) return 0;
    const baseAmount = (selectedOrderToComplete.subtotal || 0) - (selectedOrderToComplete.discount_amount || 0);
    return baseAmount + calculateTipAmount();
  };

  const calculatePerPersonAmount = () => {
    return calculateGrandTotal() / splitCount;
  };

  // Auto-calculate remaining amount for split payment
  const calculateRemainingAmount = () => {
    const total = calculateGrandTotal();
    const cash = parseFloat(cashAmount) || 0;
    const card = parseFloat(cardAmount) || 0;
    return total - cash - card;
  };

  const completeOrder = async (paymentMethod) => {
    if (!selectedOrderToComplete) return;

    const tipAmount = calculateTipAmount();
    const grandTotal = calculateGrandTotal();
    
    // Handle split payment validation
    let paymentDetails = null;
    if (splitPaymentMode) {
      const cash = parseFloat(cashAmount) || 0;
      const card = parseFloat(cardAmount) || 0;
      const totalPaid = cash + card;
      
      if (Math.abs(totalPaid - grandTotal) > 0.02) {
        // Payment mismatch - dialog stays open, amounts shown in red
        return;
      }
      
      paymentMethod = 'split';
      paymentDetails = { cash, card };
    }

    try {
      const completedOrder = await orderAPI.complete(
        selectedOrderToComplete.id, 
        paymentMethod,
        tipPercentage,
        tipAmount,
        splitCount,
        paymentDetails
      );
      
      // Try to print customer receipt LOCALLY (no backend needed — works offline)
      try {
        const receiptOrder = {
          ...selectedOrderToComplete,
          payment_method: paymentMethod,
          tip_amount: tipAmount,
          total_amount: grandTotal,
        };
        await posPrintService.printCustomerReceipt({
          order: receiptOrder,
          tables,
          businessInfo: restaurantInfo?.business_info || {},
          currency,
          paperWidth: defaultPaperWidth,
          settings: printSettings,
        });
      } catch (printError) {
        console.log('Receipt printing skipped:', printError.message);
      }
      
      // Clear the table if this order had a table assigned
      if (selectedOrderToComplete.table_id) {
        try {
          await tableAPI.clear(selectedOrderToComplete.table_id);
          console.log('Table cleared after payment');
          loadTables();
        } catch (clearError) {
          console.error('Failed to clear table:', clearError);
        }
      }
      
      // Order completed - dialog closes as visual feedback
      setShowPaymentDialog(false);
      setSelectedOrderToComplete(null);
      setTipPercentage(0);
      setCustomTip('');
      setSplitCount(1);
      setSplitPaymentMode(false);
      setCashAmount('');
      setCardAmount('');
      loadPendingOrders();
      loadCompletedOrders();
      
      // Return to POS view (hide pending orders panel)
      setShowPendingOrders(false);
    } catch (error) {
      console.error('Failed to complete order:', error);
    }
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-medium">Loading POS...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen pos-screen relative overflow-x-hidden">
      {/* QR Order Flash Overlay */}
      {flashActive && (
        <div
          className="fixed inset-0 z-[100] pointer-events-none"
          style={{
            animation: 'qr-flash 0.5s ease-in-out 3',
            background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)',
          }}
          data-testid="qr-flash-overlay"
        />
      )}
      <style>{`
        @keyframes qr-flash {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* QR Order Alert Banner */}
      {qrAlert && (
        <div
          className="fixed top-0 left-0 right-0 z-[90] bg-orange-500 text-white px-4 py-3 flex items-center justify-between shadow-lg animate-pulse"
          data-testid="qr-order-alert"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#x1F4F1;</span>
            <div>
              <p className="font-bold text-sm">New QR Order #{String(qrAlert.order_number).padStart(3, '0')}</p>
              <p className="text-xs opacity-90">
                {qrAlert.table_name} &middot; {qrAlert.items_count} item{qrAlert.items_count > 1 ? 's' : ''} 
                {qrAlert.guest_name ? ` &middot; ${qrAlert.guest_name}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setQrAlert(null); setFlashActive(false); }}
            className="bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 text-xs font-bold"
            data-testid="dismiss-qr-alert"
          >
            Got it
          </button>
        </div>
      )}
      {/* Main Product Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Bar */}
        <div className="bg-white/80 backdrop-blur-lg border-b border-slate-200/60 px-3 py-2 md:px-6 md:py-3 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            {(user?.role === 'admin' || user?.role === 'platform_owner') && (
              <button
                data-testid="back-to-dashboard-button"
                onClick={() => navigate(user?.role === 'platform_owner' ? '/platform/dashboard' : '/dashboard')}
                className="h-9 md:h-10 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium btn-haptic flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            )}
            <div className="min-w-0">
              <h1 className="font-heading text-lg md:text-2xl font-bold tracking-tight text-slate-900 truncate">POS Terminal</h1>
              <p className="text-[11px] md:text-xs text-slate-400 font-medium tracking-wide truncate">{user?.username}</p>
            </div>
            {/* Printer Status */}
            <div
              data-testid="printer-status-indicator"
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${
                printerStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                printerStatus === 'offline' ? 'bg-red-50 text-red-700 border-red-200' :
                printerStatus === 'none' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title={defaultPrinterName || 'No printer configured'}
            >
              <Printer className="w-3 h-3" />
              <span className={`w-1.5 h-1.5 rounded-full ${
                printerStatus === 'online' ? 'bg-emerald-500' :
                printerStatus === 'offline' ? 'bg-red-500' :
                printerStatus === 'none' ? 'bg-slate-400' :
                'bg-amber-500'
              }`} />
              <span className="hidden md:inline">
                {printerStatus === 'online' ? defaultPrinterName || 'Ready' :
                 printerStatus === 'offline' ? 'Offline' :
                 printerStatus === 'none' ? 'No Printer' : 'Checking...'}
              </span>
            </div>
          </div>
          <div className="flex gap-1.5 md:gap-2 shrink-0">
            {/* Switch to Workforce for dual-access users */}
            {user?.capabilities?.includes('workforce.clock_in') && (
              <button
                data-testid="switch-to-workforce-btn"
                onClick={() => navigate('/heva-ops/shifts')}
                className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs md:text-sm font-medium transition-colors"
                title="Switch to Clock In / Shifts"
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">My Shifts</span>
              </button>
            )}
            <button
              data-testid="pending-orders-button"
              onClick={() => {
                const newVal = !showPendingOrders;
                setShowPendingOrders(newVal);
                if (newVal) loadCompletedOrders();
              }}
              className={`h-9 md:h-10 px-3 md:px-4 rounded-xl text-xs md:text-sm font-semibold btn-haptic flex items-center gap-1.5 transition-all border ${
                showPendingOrders 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span className="hidden sm:inline">Pending</span>
              <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md text-[11px]">{pendingOrders.length}</span>
            </button>
            <button
              data-testid="pos-logout-button"
              onClick={() => { logout(); if (isTerminalMode) navigate('/terminal'); }}
              className="h-9 md:h-10 px-3 rounded-xl border border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 text-xs md:text-sm font-medium btn-haptic flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{isTerminalMode ? 'Lock' : 'Logout'}</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-3 py-2 md:px-6 md:py-3 border-b border-slate-100 bg-white flex-shrink-0">
          <div className="flex gap-2 md:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-400" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 md:pl-12 h-10 md:h-11 text-sm md:text-base rounded-xl border-slate-200 bg-slate-50 focus:bg-white"
                data-testid="product-search-input"
              />
              {searchQuery && (
                <button
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowCustomProductDialog(true)}
              data-testid="add-custom-product-btn"
              className="h-10 md:h-11 px-3 md:px-4 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 text-sm font-medium btn-haptic flex items-center gap-1.5 transition-all"
            >
              <PackagePlus className="w-4 h-4" />
              <span className="hidden sm:inline">Custom Item</span>
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="px-3 py-2 md:px-6 md:py-3 border-b border-slate-100 flex-shrink-0 bg-white">
          <div className="flex gap-1.5 md:gap-2 overflow-x-auto scrollbar-thin pb-1">
            <button
              data-testid="category-all-button"
              onClick={() => setSelectedCategory(null)}
              className={`whitespace-nowrap text-xs md:text-sm h-8 md:h-9 px-4 md:px-5 rounded-full font-semibold btn-haptic transition-all ${
                selectedCategory === null
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                data-testid={`category-button-${category.id}`}
                onClick={() => setSelectedCategory(category.id)}
                className={`whitespace-nowrap text-xs md:text-sm h-8 md:h-9 px-4 md:px-5 rounded-full font-semibold btn-haptic transition-all ${
                  selectedCategory === category.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid or Pending Orders */}
        <div className="flex-1 overflow-y-auto p-3 md:p-6 min-h-0">
          {showPendingOrders ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-4">Pending Orders</h2>
              {pendingOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No pending orders</div>
              ) : (
                pendingOrders.map((order) => {
                  const orderTable = order.table_id ? tables.find(t => t.id === order.table_id) : null;
                  return (
                  <Card key={order.id} data-testid={`pending-order-${order.id}`}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-bold">
                            Order #{String(order.order_number).padStart(3, '0')}
                          </div>
                          {orderTable && (
                            <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              Table {orderTable.number}
                            </span>
                          )}
                          <button
                            data-testid={`print-order-${order.id}`}
                            onClick={() => printOrderReceipt(order.id, order.order_number)}
                            disabled={isPrinting}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Print receipt"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-xl font-bold font-mono text-emerald-600">
                          {getCurrencySymbol(currency)}{order.total_amount.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {new Date(order.created_at).toLocaleString()}
                      </div>
                      <div className="space-y-1 mb-3">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>{item.product_name} x {item.quantity}</span>
                            <span className="font-mono">{getCurrencySymbol(currency)}{item.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          size="sm"
                          data-testid={`edit-order-${order.id}`}
                          onClick={() => editPendingOrder(order)}
                          className="h-10 bg-amber-500 hover:bg-amber-600 text-white"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          className="h-10 bg-red-500 hover:bg-red-600 text-white"
                          data-testid={`cancel-order-${order.id}`}
                          onClick={() => cancelPendingOrder(order.id, order.order_number)}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-10 bg-emerald-500 hover:bg-emerald-600 text-white"
                          data-testid={`complete-order-${order.id}`}
                          onClick={() => openCompleteDialog(order)}
                        >
                          <CreditCard className="w-4 h-4 mr-1" />
                          Pay
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )})
              )}

              {/* Completed Orders for Today */}
              <h2 className="text-xl font-bold mt-8 mb-3 pt-4 border-t" data-testid="completed-orders-heading">
                Completed Today ({completedOrders.length})
              </h2>
              {completedOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No completed orders yet today</div>
              ) : (
                completedOrders.map((order) => {
                  const orderTable = order.table_id ? tables.find(t => t.id === order.table_id) : null;
                  return (
                    <Card key={order.id} data-testid={`completed-order-${order.id}`} className="opacity-80">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-base font-bold flex items-center gap-2">
                              Order #{String(order.order_number).padStart(3, '0')}
                              {orderTable && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                  Table {orderTable.number}
                                </span>
                              )}
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                                {order.payment_method === 'card' ? 'Card' : order.payment_method === 'split' ? 'Split' : 'Cash'}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {new Date(order.created_at).toLocaleTimeString()} &bull; by {order.created_by}
                            </div>
                          </div>
                          <div className="text-lg font-bold font-mono">
                            {getCurrencySymbol(currency)}{order.total_amount.toFixed(2)}
                          </div>
                        </div>
                        <div className="mt-2 space-y-1">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                              <span>{item.product_name} x {item.quantity}</span>
                              <span>{getCurrencySymbol(currency)}{item.total.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`print-completed-${order.id}`}
                            onClick={async () => {
                              try {
                                const printResult = await printerAPI.printCustomerReceipt(order.id);
                                if (printResult?.commands) {
                                  const res = await posPrintService.sendToDefaultPrinter(printResult.commands, 'customer-manual');
                                  if (res.ok) toast.success('Receipt sent to printer');
                                  else toast.error(`Print failed: ${res.error || 'unknown'}`);
                                } else {
                                  toast.error('No print data generated');
                                }
                              } catch (err) {
                                toast.error('Failed to print receipt: ' + (err.message || ''));
                              }
                            }}
                            className="h-8"
                          >
                            <Printer className="w-3.5 h-3.5 mr-1" /> Print Receipt
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? (
                <>
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No products found for "{searchQuery}"</p>
                  <Button variant="link" onClick={() => setSearchQuery('')}>Clear search</Button>
                </>
              ) : (
                <p>No products available</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4">
              {searchQuery && (
                <div className="col-span-full mb-2 text-xs font-semibold tracking-wide uppercase text-slate-400">
                  {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''} for "{searchQuery}"
                </div>
              )}
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  data-testid={`product-card-${product.id}`}
                  className={`group relative text-left rounded-2xl border-2 transition-all duration-150 btn-haptic select-none ${
                    !product.in_stock
                      ? 'opacity-40 cursor-not-allowed border-slate-200 bg-slate-50'
                      : cart.some(c => c.product_id === product.id)
                        ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                  }`}
                  style={{ touchAction: 'manipulation' }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (product.in_stock !== false) addToCart(product);
                  }}
                >
                  <div className="p-3 md:p-4">
                    <p className="font-semibold text-sm md:text-base text-slate-800 leading-tight line-clamp-2 mb-1">
                      {product.name}
                    </p>
                    <p className="text-[11px] text-slate-400 font-medium mb-3 truncate">
                      {product.category_name || 'Uncategorized'}
                    </p>
                    <p className="font-mono text-lg md:text-xl font-bold text-emerald-600 tracking-tight">
                      {getCurrencySymbol(currency)}{product.price.toFixed(2)}
                    </p>
                    {product.in_stock === false && (
                      <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                        Out of stock
                      </span>
                    )}
                    {cart.some(c => c.product_id === product.id) && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                        {cart.find(c => c.product_id === product.id)?.quantity || 0}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Content - reused in desktop sidebar and mobile sheet */}
      {(() => {
        const cartContent = (
          <>
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="font-heading text-base font-bold text-slate-900">Current Order</h2>
                    <p className="text-[11px] text-slate-400 font-medium">{cart.length} item{cart.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {cart.length > 0 && (
                  <button data-testid="clear-cart-button" onClick={clearCart} className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Order Type & Table Selection */}
            <div className="px-4 py-2 border-b border-slate-100">
              <Select value={selectedTable || orderType || "takeaway"} onValueChange={(v) => {
                if (v === "takeaway" || v === "eat_in") {
                  setSelectedTable(null);
                  setOrderType(v);
                } else {
                  setSelectedTable(v);
                  setOrderType("dine_in");
                }
              }}>
                <SelectTrigger data-testid="table-selector" className="w-full h-9 text-sm rounded-xl border-slate-200 bg-slate-50">
                  <SelectValue placeholder="Select order type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="takeaway">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-orange-500" />
                      Takeaway
                    </div>
                  </SelectItem>
                  <SelectItem value="eat_in">
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed className="w-4 h-4 text-emerald-500" />
                      Eat In
                    </div>
                  </SelectItem>
                  {tables.filter(t => t.status === 'available' || t.status === 'occupied').map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      <div className="flex items-center gap-2">
                        Table {table.number}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          table.status === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {table.status === 'available' ? 'Free' : 'In Use'}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {cart.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No items yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.product_id} data-testid={`cart-item-${item.product_id}`} className="p-2.5 bg-slate-50 rounded-lg">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate flex items-center gap-1">
                            {item.product_name}
                            {item.is_custom && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded">Custom</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {getCurrencySymbol(currency)}{item.unit_price.toFixed(2)} x {item.quantity}
                          </div>
                        </div>
                        <div className="font-bold font-mono text-emerald-600 text-sm ml-2">
                          {getCurrencySymbol(currency)}{item.total.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" data-testid={`decrease-qty-${item.product_id}`} onClick={() => updateQuantity(item.product_id, -1)} className="h-7 w-7 p-0">
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="font-mono font-bold w-5 text-center text-sm">{item.quantity}</span>
                          <Button size="sm" variant="outline" data-testid={`increase-qty-${item.product_id}`} onClick={() => updateQuantity(item.product_id, 1)} className="h-7 w-7 p-0">
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <Button variant="ghost" size="sm" data-testid={`remove-item-${item.product_id}`} onClick={() => removeFromCart(item.product_id)} className="h-7 w-7 p-0 text-red-500 hover:bg-red-50">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={showDiscountPanel ? "secondary" : "outline"}
                  className="flex-1 h-10 text-sm"
                  onClick={() => { setShowDiscountPanel(!showDiscountPanel); setShowNotesPanel(false); }}
                  data-testid="toggle-discount-btn"
                >
                  <Percent className="w-4 h-4 mr-1" />
                  Discount
                  {discountValue && <span className="ml-1 text-emerald-600 text-xs">ON</span>}
                </Button>
                <Button
                  variant={showNotesPanel ? "secondary" : "outline"}
                  className="flex-1 h-10 text-sm"
                  onClick={() => { setShowNotesPanel(!showNotesPanel); setShowDiscountPanel(false); }}
                  data-testid="toggle-notes-btn"
                >
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Notes
                  {orderNotes && <span className="ml-1 text-emerald-600 text-xs">ON</span>}
                </Button>
              </div>

              {showDiscountPanel && (
                <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <Button variant={discountType === 'percentage' ? 'default' : 'outline'} onClick={() => setDiscountType('percentage')} className="flex-1 h-9 text-sm">
                      <Percent className="w-3 h-3 mr-1" /> %
                    </Button>
                    <Button variant={discountType === 'fixed' ? 'default' : 'outline'} onClick={() => setDiscountType('fixed')} className="flex-1 h-9 text-sm">
                      <Tag className="w-3 h-3 mr-1" /> Fixed
                    </Button>
                  </div>
                  {discountType && (
                    <>
                      <Input type="number" placeholder={discountType === 'percentage' ? 'Enter %' : `Enter ${getCurrencySymbol(currency)}`} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} data-testid="discount-value-input" className="h-9" />
                      <Input placeholder="Reason (optional)" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} data-testid="discount-reason-input" className="h-9" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setDiscountType(''); setDiscountValue(''); setDiscountReason(''); }} className="flex-1">Clear</Button>
                        <Button size="sm" onClick={() => setShowDiscountPanel(false)} className="flex-1">Apply</Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {showNotesPanel && (
                <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <Textarea placeholder="Order notes for kitchen..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows={2} data-testid="order-notes-input" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setOrderNotes('')} className="flex-1">Clear</Button>
                    <Button size="sm" onClick={() => setShowNotesPanel(false)} className="flex-1">Done</Button>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {calculateDiscount() > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Discount</span>
                    <span className="font-mono">-{getCurrencySymbol(currency)}{calculateDiscount().toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t">
                  <div>
                    <span className="text-lg font-bold">Total</span>
                    <span className="text-xs text-muted-foreground ml-1">({cart.reduce((sum, item) => sum + item.quantity, 0)} items)</span>
                  </div>
                  <span className="text-xl font-bold font-mono text-emerald-600">{getCurrencySymbol(currency)}{calculateCartTotal().toFixed(2)}</span>
                </div>
              </div>
              
              {lastOrderNumber && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-center text-sm animate-pulse">
                  <span className="font-bold text-emerald-700">Order #{lastOrderNumber} Sent!</span>
                </div>
              )}
              
              {editingOrder && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-amber-800 text-sm">Editing Order #{editingOrder.order_number}</div>
                      <div className="text-xs text-amber-600">Modify items, then Update</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingOrder(null); setCart([]); setOrderNotes(''); setDiscountType(''); setDiscountValue(''); setDiscountReason(''); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              
              <button
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-14 rounded-2xl btn-haptic text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                data-testid="place-order-button"
                style={{ touchAction: 'manipulation' }}
                onClick={() => { editingOrder ? updateOrder() : placeOrder(); setMobileCartOpen(false); }}
                disabled={cart.length === 0 || isPlacingOrder}
              >
                <Printer className="w-5 h-5" />
                {isPlacingOrder ? 'Sending...' : editingOrder ? `Update Order #${editingOrder.order_number}` : 'Place Order'}
              </button>
            </div>
          </>
        );

        return (
          <>
            {/* Desktop Order Sidebar */}
            <div className="hidden md:flex w-[340px] lg:w-[380px] xl:w-[400px] bg-white border-l border-slate-200/60 flex-col cart-sidebar">
              {cartContent}
            </div>

            {/* Mobile Order - Sheet drawer */}
            <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
              <SheetContent side="right" className="w-[340px] sm:w-[380px] p-0 flex flex-col">
                <SheetTitle className="sr-only">Current Order</SheetTitle>
                {cartContent}
              </SheetContent>
            </Sheet>

            {/* Mobile floating cart button */}
            {!mobileCartOpen && (
              <div className="md:hidden fixed bottom-4 right-4 z-40">
                <button
                  data-testid="mobile-cart-button"
                  className="h-14 px-5 rounded-2xl shadow-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold btn-haptic flex items-center gap-2 transition-all"
                  onClick={() => setMobileCartOpen(true)}
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span>Order</span>
                  {cart.length > 0 && (
                    <span className="font-mono bg-white/20 px-2.5 py-0.5 rounded-lg text-sm">
                      {cart.reduce((s, i) => s + i.quantity, 0)} &middot; {getCurrencySymbol(currency)}{calculateCartTotal().toFixed(2)}
                    </span>
                  )}
                </button>
              </div>
            )}
          </>
        );
      })()}

      {/* Payment Method Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Complete Payment
              {selectedOrderToComplete?.table_id && (
                <span className="text-sm font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  Table {tables.find(t => t.id === selectedOrderToComplete.table_id)?.number || '?'}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Order #{String(selectedOrderToComplete?.order_number || '').padStart(3, '0')}
              {selectedOrderToComplete?.items?.length > 0 && (
                <span className="ml-2">• {selectedOrderToComplete.items.length} items</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Order Summary */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between text-sm mb-2">
                <span>Subtotal:</span>
                <span className="font-mono">{getCurrencySymbol(currency)}{selectedOrderToComplete?.subtotal?.toFixed(2)}</span>
              </div>
              
              {/* Tip Section */}
              <Separator className="my-3" />
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Add Tip</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 15, 20].map((percent) => (
                    <Button
                      key={percent}
                      size="sm"
                      variant={tipPercentage === percent ? 'default' : 'outline'}
                      onClick={() => {
                        setTipPercentage(percent);
                        setCustomTip('');
                      }}
                      data-testid={`tip-${percent}-button`}
                    >
                      {percent}%
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={customTip ? 'default' : 'outline'}
                    onClick={() => setTipPercentage(0)}
                    data-testid="tip-custom-button"
                  >
                    Custom
                  </Button>
                </div>
                
                {(tipPercentage === 0 || customTip) && (
                  <div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Enter custom tip amount"
                      value={customTip}
                      onChange={(e) => {
                        setCustomTip(e.target.value);
                        setTipPercentage(0);
                      }}
                      data-testid="custom-tip-input"
                      className="h-10"
                    />
                  </div>
                )}
                
                {(tipPercentage > 0 || customTip) && (
                  <div className="flex justify-between text-sm">
                    <span>Tip Amount:</span>
                    <span className="font-mono text-emerald-600">
                      +{getCurrencySymbol(currency)}{calculateTipAmount().toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Split Payment Section */}
              <Separator className="my-3" />
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Split Payment
                </Label>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSplitCount(Math.max(1, splitCount - 1))}
                    data-testid="split-decrease"
                    className="h-8 w-8 p-0"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="font-mono font-bold w-12 text-center">{splitCount}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSplitCount(splitCount + 1)}
                    data-testid="split-increase"
                    className="h-8 w-8 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {splitCount > 1 ? `(${splitCount} people)` : 'people'}
                  </span>
                </div>
                
                {splitCount > 1 && (
                  <div className="flex justify-between text-sm">
                    <span>Per Person:</span>
                    <span className="font-mono text-blue-600">
                      {getCurrencySymbol(currency)}{calculatePerPersonAmount().toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              
              <Separator className="my-3" />
              <div className="flex justify-between font-bold text-lg">
                <span>Grand Total:</span>
                <span className="font-mono text-emerald-600">
                  {getCurrencySymbol(currency)}{calculateGrandTotal().toFixed(2)}
                </span>
              </div>
              
              {/* Table info if assigned */}
              {selectedOrderToComplete?.table_id && (
                <div className="mt-2 p-2 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Table will be cleared after payment
                </div>
              )}
            </div>
            
            {/* Split Payment Method Toggle */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={splitPaymentMode ? "default" : "outline"}
                  onClick={() => setSplitPaymentMode(!splitPaymentMode)}
                  data-testid="toggle-split-payment-mode"
                  className="w-full"
                >
                  <Banknote className="w-4 h-4 mr-2" />
                  {splitPaymentMode ? "Split Payment Mode ON" : "Pay with Multiple Methods"}
                </Button>
              </div>
              
              {/* Split Payment Method Inputs */}
              {splitPaymentMode && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                  <div className="text-sm font-medium text-amber-800">Enter amounts for each payment method:</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Banknote className="w-3 h-3" /> Cash
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                        data-testid="split-cash-input"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <CreditCard className="w-3 h-3" /> Card
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={cardAmount}
                        onChange={(e) => setCardAmount(e.target.value)}
                        data-testid="split-card-input"
                        className="h-10"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span>Total Entered:</span>
                    <span className={`font-mono font-bold ${Math.abs((parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) - calculateGrandTotal()) <= 0.02 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {getCurrencySymbol(currency)}{((parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0)).toFixed(2)}
                    </span>
                  </div>
                  {calculateRemainingAmount() > 0.02 && (
                    <div className="text-xs text-amber-700">
                      Remaining: {getCurrencySymbol(currency)}{calculateRemainingAmount().toFixed(2)}
                    </div>
                  )}
                  <Button
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
                    data-testid="complete-split-payment"
                    onClick={() => completeOrder('split')}
                    disabled={Math.abs((parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) - calculateGrandTotal()) > 0.02}
                  >
                    Complete Split Payment
                  </Button>
                </div>
              )}
            </div>
            
            {/* Single Payment Method Selection */}
            {!splitPaymentMode && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`h-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all font-semibold btn-haptic ${
                      selectedPaymentMethod === 'cash'
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200 text-emerald-800 shadow-lg shadow-emerald-100'
                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50 text-slate-500'
                    }`}
                    data-testid="payment-cash-button"
                    onClick={() => setSelectedPaymentMethod('cash')}
                  >
                    <Banknote className="w-7 h-7" strokeWidth={2} />
                    <span className="text-sm font-bold">Cash</span>
                  </button>
                  <button
                    className={`h-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all font-semibold btn-haptic ${
                      selectedPaymentMethod === 'card'
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 text-blue-800 shadow-lg shadow-blue-100'
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 text-slate-500'
                    }`}
                    data-testid="payment-card-button"
                    onClick={() => setSelectedPaymentMethod('card')}
                  >
                    <CreditCard className="w-7 h-7" strokeWidth={2} />
                    <span className="text-sm font-bold">Card</span>
                  </button>
                </div>
                {/* MASSIVE PAY BUTTON - Z Pattern anchor */}
                <button
                  className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-bold rounded-2xl btn-haptic transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="confirm-payment-button"
                  onClick={() => completeOrder(selectedPaymentMethod)}
                  disabled={!selectedPaymentMethod}
                >
                  <span>Complete Payment</span>
                  <span className="font-mono bg-white/20 px-3 py-1 rounded-xl text-base">
                    {getCurrencySymbol(currency)}{calculateGrandTotal().toFixed(2)}
                  </span>
                </button>
              </div>
            )}
            
            {/* Split Bill Summary */}
            {splitCount > 1 && (
              <div className="mt-3 p-3 bg-slate-100 rounded-lg">
                <div className="text-sm font-semibold mb-2">Split Summary</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Array.from({ length: splitCount }, (_, i) => (
                    <div key={i} className="flex justify-between p-2 bg-white rounded border">
                      <span>Person {i + 1}</span>
                      <span className="font-mono font-medium">{getCurrencySymbol(currency)}{calculatePerPersonAmount().toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Product Dialog */}
      <Dialog open={showCustomProductDialog} onOpenChange={setShowCustomProductDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5" />
              Add Custom Item
            </DialogTitle>
            <DialogDescription>
              Add a temporary item that's not in the menu
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="custom-name">Item Name</Label>
              <Input
                id="custom-name"
                placeholder="e.g., Special Request, Extra Sauce"
                value={customProductName}
                onChange={(e) => setCustomProductName(e.target.value)}
                data-testid="custom-product-name-input"
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="custom-price">Price ({getCurrencySymbol(currency)})</Label>
              <Input
                id="custom-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={customProductPrice}
                onChange={(e) => setCustomProductPrice(e.target.value)}
                data-testid="custom-product-price-input"
              />
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowCustomProductDialog(false);
                  setCustomProductName('');
                  setCustomProductPrice('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={addCustomProductToCart}
                data-testid="add-custom-product-confirm-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add to Cart
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Void Reason Modal */}
      <VoidReasonModal
        open={voidModal.open}
        onClose={() => setVoidModal({ open: false, orderId: null, orderNumber: null })}
        onConfirm={handleVoidConfirm}
        userRole={user?.role}
        orderNumber={voidModal.orderNumber}
      />
    </div>
  );
};

export default POSScreen;
