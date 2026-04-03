import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext';
import { categoryAPI, productAPI, orderAPI, tableAPI, printerAPI, restaurantAPI, getAuthToken } from '../services/api';
import printerService from '../services/printer';
import { generateKitchenReceipt, generateCustomerReceipt } from '../services/receiptGenerator';
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
import { ShoppingCart, Plus, Minus, Trash2, LogOut, Receipt, X, Printer, CreditCard, Users, Percent, Tag, MessageSquare, Banknote, Search, PackagePlus, ArrowLeft } from 'lucide-react';

// Currency helper
const getCurrencySymbol = (currency) => {
  const symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'INR': '₹' };
  return symbols[currency] || currency || '£';
};

const POSScreen = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
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
  
  // Product search
  const [searchQuery, setSearchQuery] = useState('');
  
  // Custom/Temporary product dialog
  const [showCustomProductDialog, setShowCustomProductDialog] = useState(false);
  const [customProductName, setCustomProductName] = useState('');
  const [customProductPrice, setCustomProductPrice] = useState('');
  
  // Debounce for preventing double clicks
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  // Completed orders for today (visible in pending orders panel)
  const [completedOrders, setCompletedOrders] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false); // Prevent duplicate prints

  // WebSocket / QR Alert states
  const [qrAlert, setQrAlert] = useState(null);
  const [flashActive, setFlashActive] = useState(false);
  const [restaurantInfo, setRestaurantInfo] = useState(null);
  const audioCtxRef = useRef(null);

  // Printer status indicator
  const [printerStatus, setPrinterStatus] = useState('unknown'); // 'online', 'offline', 'unknown', 'none'
  const [defaultPrinterName, setDefaultPrinterName] = useState(null);

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

  // Check printer reachability
  const checkPrinterStatus = useCallback(async () => {
    try {
      const printer = await printerAPI.getDefault();
      if (!printer) {
        setPrinterStatus('none');
        setDefaultPrinterName(null);
        return;
      }
      setDefaultPrinterName(printer.name);
      if (printer.type === 'wifi') {
        // For WiFi printers, attempt a quick TCP connection check via the backend
        try {
          const parts = printer.address.split(':');
          const ip = parts[0];
          const port = parseInt(parts[1]) || 9100;
          const apiUrl = process.env.REACT_APP_BACKEND_URL;
          const token = getAuthToken();
          const res = await fetch(`${apiUrl}/api/printer/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ ip, port }),
            signal: AbortSignal.timeout(5000),
          });
          setPrinterStatus(res.ok ? 'online' : 'offline');
        } catch {
          setPrinterStatus('offline');
        }
      } else {
        // BT printers — mark as configured (can't ping them from web)
        setPrinterStatus('online');
      }
    } catch {
      setPrinterStatus('unknown');
    }
  }, []);

  // Sync offline orders to the backend
  const syncOfflineOrders = useCallback(async () => {
    try {
      const unsynced = await getUnsyncedOrders();
      if (unsynced.length === 0) return;
      console.log(`[POS] Syncing ${unsynced.length} offline orders...`);
      await orderAPI.sync(unsynced);
      // Mark as synced in IndexedDB
      for (const order of unsynced) {
        await saveToIndexedDB('orders', { ...order, synced: true });
      }
      toast.success(`Synced ${unsynced.length} offline order${unsynced.length > 1 ? 's' : ''}`);
      loadPendingOrders();
    } catch (err) {
      console.warn('[POS] Offline sync failed:', err.message);
    }
  }, []);

  // Helper: Send ESC/POS commands to the default printer (with duplicate prevention)
  const sendToPrinter = async (escposCommands, label = 'receipt') => {
    if (isPrinting) {
      console.log('[POS] Print already in progress, skipping');
      return;
    }
    setIsPrinting(true);
    try {
      const defaultPrinter = await printerAPI.getDefault();
      if (!defaultPrinter) {
        console.log('[POS] No default printer configured, skipping print');
        return;
      }
      const apiUrl = process.env.REACT_APP_BACKEND_URL;
      const token = getAuthToken();
      await printerService.printToDevice(defaultPrinter, escposCommands, apiUrl, token);
      console.log(`[POS] ${label} print sent successfully`);
    } catch (printErr) {
      console.warn(`[POS] ${label} print failed:`, printErr.message);
      // Show error only for user-initiated prints (not auto-prints)
      if (label !== 'kitchen-auto' && label !== 'customer-auto') {
        toast.error(`Print failed: ${printErr.message}`);
      }
    } finally {
      setIsPrinting(false);
    }
  };

  // Helper: Print a specific order's kitchen receipt (LOCAL generation — no backend needed)
  const printOrderReceipt = async (orderId, orderNumber) => {
    if (isPrinting) {
      toast.warning('Already printing, please wait...');
      return;
    }
    const toastId = toast.loading(`Printing order #${orderNumber}...`);
    try {
      // Find the order from pending/completed orders
      const order = pendingOrders.find(o => o.id === orderId) || completedOrders.find(o => o.id === orderId);
      if (!order) {
        toast.error('Order not found', { id: toastId });
        return;
      }
      // Get table info if assigned
      let tableInfo = null;
      if (order.table_id) {
        const table = tables.find(t => t.id === order.table_id);
        if (table) tableInfo = { number: table.number, name: table.name || `Table ${table.number}` };
      }
      const businessInfo = restaurantInfo?.business_info || {};
      const commands = generateKitchenReceipt(order, businessInfo, tableInfo);
      await sendToPrinter(commands, 'kitchen-manual');
      toast.success(`Order #${orderNumber} sent to printer`, { id: toastId });
    } catch (err) {
      toast.error('Failed to print: ' + (err.message || ''), { id: toastId });
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
    // Prevent double-clicks
    if (isAddingToCart) return;
    setIsAddingToCart(true);
    
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
    // Removed toast notification - too distracting during fast ordering
    
    // Reset after short delay
    setTimeout(() => setIsAddingToCart(false), 300);
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
  
  // Cancel a pending order
  const cancelPendingOrder = async (orderId) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    
    try {
      await orderAPI.cancel(orderId, 'Cancelled by staff');
      toast.success('Order cancelled');
      loadPendingOrders();
      loadCompletedOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel order');
    }
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
        order_notes: orderNotes || null,
        discount_type: discountType || null,
        discount_value: discountValue ? parseFloat(discountValue) : 0,
        discount_reason: discountReason || null,
      });
      
      // Order updated - visual feedback via cart clearing
      
      // Clear cart and states
      setCart([]);
      setEditingOrder(null);
      setSelectedTable(null);
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

    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const localId = uuidv4(); // Local UUID — no backend dependency

    try {
      const order = await orderAPI.create({
        items: cart,
        subtotal: subtotal,
        total_amount: subtotal,
        table_id: selectedTable || null,
        order_notes: orderNotes || null,
        discount_type: discountType || null,
        discount_value: discountValue ? parseFloat(discountValue) : 0,
        discount_reason: discountReason || null,
      });
      
      // Try to print kitchen receipt LOCALLY (no backend needed — works offline)
      try {
        let tableInfo = null;
        if (selectedTable) {
          const table = tables.find(t => t.id === selectedTable);
          if (table) tableInfo = { number: table.number, name: table.name || `Table ${table.number}` };
        }
        const businessInfo = restaurantInfo?.business_info || {};
        const commands = generateKitchenReceipt(order, businessInfo, tableInfo);
        await sendToPrinter(commands, 'kitchen-auto');
      } catch (printError) {
        console.log('Kitchen receipt printing skipped:', printError.message);
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
        // Still print locally
        try {
          let tableInfo = null;
          if (selectedTable) {
            const table = tables.find(t => t.id === selectedTable);
            if (table) tableInfo = { number: table.number, name: table.name || `Table ${table.number}` };
          }
          const businessInfo = restaurantInfo?.business_info || {};
          const commands = generateKitchenReceipt(offlineOrder, businessInfo, tableInfo);
          await sendToPrinter(commands, 'kitchen-offline');
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
        let tableInfo = null;
        if (selectedOrderToComplete.table_id) {
          const table = tables.find(t => t.id === selectedOrderToComplete.table_id);
          if (table) tableInfo = { number: table.number, name: table.name || `Table ${table.number}` };
        }
        const businessInfo = restaurantInfo?.business_info || {};
        const commands = generateCustomerReceipt(
          { ...selectedOrderToComplete, payment_method: paymentMethod, tip_amount: tipAmount, total_amount: grandTotal },
          businessInfo,
          tableInfo,
          currency
        );
        await sendToPrinter(commands, 'customer-auto');
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
    <div className="flex h-screen pos-screen relative">
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="bg-card border-b px-3 py-2 md:px-6 md:py-4 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            {(user?.role === 'admin' || user?.role === 'platform_owner') && (
              <Button
                variant="outline"
                data-testid="back-to-dashboard-button"
                onClick={() => navigate(user?.role === 'platform_owner' ? '/platform/dashboard' : '/dashboard')}
                className="h-9 text-sm md:h-12 md:text-base shrink-0"
              >
                <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-lg md:text-3xl font-bold tracking-tight truncate">HevaPOS</h1>
              <p className="text-xs md:text-base text-muted-foreground truncate">Welcome, {user?.username}</p>
            </div>
            {/* Printer Status Indicator */}
            <div
              data-testid="printer-status-indicator"
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                printerStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                printerStatus === 'offline' ? 'bg-red-50 text-red-700 border-red-200' :
                printerStatus === 'none' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title={defaultPrinterName ? `${defaultPrinterName}` : 'No printer configured'}
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
            <Button
              variant="outline"
              data-testid="pending-orders-button"
              onClick={() => {
                const newVal = !showPendingOrders;
                setShowPendingOrders(newVal);
                if (newVal) loadCompletedOrders();
              }}
              className="h-9 text-xs px-2 md:h-12 md:text-base md:px-4"
            >
              <Receipt className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Pending</span> ({pendingOrders.length})
            </Button>
            <Button variant="outline" data-testid="pos-logout-button" onClick={logout} className="h-9 text-xs px-2 md:h-12 md:text-base md:px-4">
              <LogOut className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-3 py-2 md:px-6 md:py-3 border-b bg-slate-50 flex-shrink-0">
          <div className="flex gap-2 md:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 md:pl-11 h-10 md:h-12 text-sm md:text-lg"
                data-testid="product-search-input"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-10 w-10 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="w-5 h-5" />
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowCustomProductDialog(true)}
              data-testid="add-custom-product-btn"
              className="h-10 md:h-12 text-sm md:text-base whitespace-nowrap px-3 md:px-5"
            >
              <PackagePlus className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Custom Item</span>
              <span className="sm:hidden">Custom</span>
            </Button>
          </div>
        </div>

        {/* Categories */}
        <div className="px-3 py-2 md:px-6 md:py-4 border-b flex-shrink-0">
          <div className="flex gap-2 md:gap-3 overflow-x-auto scrollbar-hide">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              data-testid="category-all-button"
              onClick={() => setSelectedCategory(null)}
              className="whitespace-nowrap text-sm md:text-base h-9 md:h-11 px-3 md:px-5"
            >
              All Products
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                data-testid={`category-button-${category.id}`}
                onClick={() => setSelectedCategory(category.id)}
                className="whitespace-nowrap text-sm md:text-base h-9 md:h-11 px-3 md:px-5"
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Products Grid or Pending Orders */}
        <ScrollArea className="flex-1 p-3 md:p-6">
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
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-lg font-bold flex items-center gap-2">
                            Order #{String(order.order_number).padStart(3, '0')}
                            {orderTable && (
                              <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                Table {orderTable.number}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(order.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold font-mono text-emerald-600">
                            {getCurrencySymbol(currency)}{order.total_amount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 mb-4">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>
                              {item.product_name} x {item.quantity}
                            </span>
                            <span className="font-mono">{getCurrencySymbol(currency)}{item.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <Button
                          size="sm"
                          data-testid={`print-order-${order.id}`}
                          onClick={() => printOrderReceipt(order.id, order.order_number)}
                          disabled={isPrinting}
                          className="h-10 bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          <Printer className="w-4 h-4 mr-1" />
                          Print
                        </Button>
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
                          onClick={() => cancelPendingOrder(order.id)}
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
                                  await sendToPrinter(printResult.commands);
                                  toast.success('Receipt sent to printer');
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
            <div className="pos-grid">
              {searchQuery && (
                <div className="col-span-full mb-4 text-sm text-muted-foreground">
                  Found {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} for "{searchQuery}"
                </div>
              )}
              {filteredProducts.map((product) => (
                <Card
                  key={product.id}
                  data-testid={`product-card-${product.id}`}
                  className={`product-card cursor-pointer select-none ${!product.in_stock ? 'opacity-50' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (product.in_stock !== false) {
                      addToCart(product);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="product-name mb-1 line-clamp-2">{product.name}</div>
                    <div className="product-category text-muted-foreground mb-2">{product.category_name}</div>
                    <div className="product-price text-emerald-600">{getCurrencySymbol(currency)}{product.price.toFixed(2)}</div>
                    {product.in_stock === false && <div className="text-sm text-red-500 mt-1 font-medium">Out of stock</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Cart Content - reused in desktop sidebar and mobile sheet */}
      {(() => {
        const cartContent = (
          <>
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  <h2 className="text-lg font-bold">Order</h2>
                </div>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" data-testid="clear-cart-button" onClick={clearCart}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Table Selection */}
            <div className="px-4 py-2 border-b bg-slate-50">
              <Select value={selectedTable || "no-table"} onValueChange={(v) => setSelectedTable(v === "no-table" ? null : v)}>
                <SelectTrigger data-testid="table-selector" className="w-full h-9 text-sm">
                  <SelectValue placeholder="Select table (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-table">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      Takeaway
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

            <ScrollArea className="flex-1 p-3">
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
            </ScrollArea>

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
              
              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold h-12"
                data-testid="place-order-button"
                onClick={() => { editingOrder ? updateOrder() : placeOrder(); setMobileCartOpen(false); }}
                disabled={cart.length === 0}
              >
                <Printer className="w-5 h-5 mr-2" />
                {editingOrder ? `Update Order #${editingOrder.order_number}` : 'Place Order (Send to Kitchen)'}
              </Button>
            </div>
          </>
        );

        return (
          <>
            {/* Desktop Order Sidebar - always visible */}
            <div className="hidden md:flex w-[380px] bg-card border-l flex-col cart-sidebar">
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
                <Button
                  data-testid="mobile-cart-button"
                  className="h-14 px-5 rounded-full shadow-lg bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => setMobileCartOpen(true)}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Order {cart.length > 0 && `(${cart.reduce((s, i) => s + i.quantity, 0)})`}
                  {cart.length > 0 && (
                    <span className="ml-2 font-mono font-bold">{getCurrencySymbol(currency)}{calculateCartTotal().toFixed(2)}</span>
                  )}
                </Button>
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
            
            {/* Single Payment Method Buttons */}
            {!splitPaymentMode && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  className="h-20 flex flex-col gap-2"
                  data-testid="payment-cash-button"
                  onClick={() => completeOrder('cash')}
                >
                  <Banknote className="w-8 h-8" />
                  <span className="text-base font-bold">Cash</span>
                  {splitCount > 1 && (
                    <span className="text-xs opacity-75">{getCurrencySymbol(currency)}{calculatePerPersonAmount().toFixed(2)} each</span>
                  )}
                </Button>
                <Button
                  className="h-20 flex flex-col gap-2"
                  variant="secondary"
                  data-testid="payment-card-button"
                  onClick={() => completeOrder('card')}
                >
                  <CreditCard className="w-8 h-8" />
                  <span className="text-base font-bold">Card</span>
                  {splitCount > 1 && (
                    <span className="text-xs opacity-75">{getCurrencySymbol(currency)}{calculatePerPersonAmount().toFixed(2)} each</span>
                  )}
                </Button>
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
    </div>
  );
};

export default POSScreen;
