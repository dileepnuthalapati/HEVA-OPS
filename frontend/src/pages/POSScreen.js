import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { categoryAPI, productAPI, orderAPI, tableAPI, printerAPI, restaurantAPI } from '../services/api';
import printerService from '../services/printer';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Minus, Trash2, LogOut, Receipt, X, Printer, DollarSign, CreditCard, Users, Percent, Tag, MessageSquare, Banknote, Search, PackagePlus, ArrowLeft } from 'lucide-react';

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
  const [printerConnected, setPrinterConnected] = useState(false);
  const [connectedPrinterName, setConnectedPrinterName] = useState(null);
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

  useEffect(() => {
    loadData();
    loadPendingOrders();
    loadRestaurantCurrency();
    loadTables();
    checkPrinterSupport();
  }, []);

  const checkPrinterSupport = () => {
    setPrinterConnected(printerService.isSupported());
  };

  const loadRestaurantCurrency = async () => {
    try {
      const restaurant = await restaurantAPI.getMy();
      if (restaurant?.currency) {
        setCurrency(restaurant.currency);
      }
    } catch (error) {
      // Use default currency
    }
  };

  const connectBluetoothPrinter = async () => {
    try {
      const device = await printerService.discoverBluetoothPrinter();
      setPrinterConnected(true);
      setConnectedPrinterName(device.name);
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      alert('Bluetooth connection failed: ' + error.message);
    }
  };

  const disconnectPrinter = async () => {
    try {
      await printerService.disconnect();
      setPrinterConnected(false);
      setConnectedPrinterName(null);
    } catch (error) {
      console.error('Failed to disconnect printer:', error);
    }
  };

  const testPrinter = async () => {
    try {
      await printerService.testPrint();
    } catch (error) {
      console.error('Test print failed:', error);
      alert('Test print failed: ' + error.message);
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
      await orderAPI.cancel(orderId);
      loadPendingOrders();
    } catch (error) {
      console.error('Failed to cancel order:', error);
    }
  };

  // Update an existing order
  const updateOrder = async () => {
    if (!editingOrder || cart.length === 0) return;
    
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    
    try {
      const updatedOrder = await orderAPI.update(editingOrder.id, {
        items: cart,
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
    if (cart.length === 0) {
      // Cart is empty - button should be disabled anyway
      return;
    }

    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);

    try {
      const order = await orderAPI.create({
        items: cart,
        total_amount: subtotal,
        table_id: selectedTable || null,
        order_notes: orderNotes || null,
        discount_type: discountType || null,
        discount_value: discountValue ? parseFloat(discountValue) : 0,
        discount_reason: discountReason || null,
      });
      
      // Try to print kitchen receipt (silently fail if no printer)
      try {
        const printResult = await printerAPI.printKitchenReceipt(order.id);
        console.log('Kitchen receipt ESC/POS commands generated:', printResult);
        
        // If we have a connected thermal printer, send the commands
        if (printerConnected && printerService.isConnected()) {
          await printerService.printRaw(printResult.commands);
        }
      } catch (printError) {
        // Silently handle print errors - receipt printing is optional
        console.log('Kitchen receipt printing skipped:', printError.message);
      }
      
      // Update table status if assigned
      if (selectedTable) {
        try {
          await tableAPI.assignOrder(selectedTable, order.id);
          loadTables();
        } catch (tableError) {
          console.error('Failed to assign table:', tableError);
        }
      }
      
      // Order placed - cart clears as visual feedback
      setLastOrderNumber(order.order_number);
      
      // Clear cart and all related states
      setCart([]);
      setSelectedTable(null);
      setOrderNotes('');
      setDiscountType('');
      setDiscountValue('');
      setDiscountReason('');
      setShowDiscountPanel(false);
      setShowNotesPanel(false);
      loadPendingOrders();
      
      // Clear order number after 5 seconds
      setTimeout(() => setLastOrderNumber(null), 5000);
    } catch (error) {
      console.error('Failed to place order:', error);
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
      
      // Try to print customer receipt (silently fail if no printer)
      try {
        const printResult = await printerAPI.printCustomerReceipt(selectedOrderToComplete.id);
        console.log('Customer receipt ESC/POS commands generated:', printResult);
        
        // If we have a connected thermal printer, send the commands
        if (printerConnected && printerService.isConnected()) {
          await printerService.printRaw(printResult.commands);
        }
      } catch (printError) {
        // Silently handle print errors - receipt printing is optional
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
    <div className="flex h-screen pos-screen">
      {/* Main Product Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-card border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Back button for admins */}
            {(user?.role === 'admin' || user?.role === 'platform_owner') && (
              <Button
                variant="outline"
                data-testid="back-to-dashboard-button"
                onClick={() => navigate(user?.role === 'platform_owner' ? '/platform/dashboard' : '/dashboard')}
                className="h-12 text-base"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Dashboard
              </Button>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">HevaPOS</h1>
              <p className="text-base text-muted-foreground">Welcome, {user?.username}</p>
            </div>
          </div>
          <div className="flex gap-3">
            {!printerConnected && (
              <Button
                variant="outline"
                data-testid="connect-printer-button"
                onClick={connectBluetoothPrinter}
                className="h-12 text-base"
              >
                <Printer className="w-5 h-5 mr-2" />
                Connect Printer
              </Button>
            )}
            {printerConnected && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Printer className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-emerald-700 font-medium truncate max-w-[120px]">{connectedPrinterName}</span>
                </div>
                <Button variant="outline" size="sm" onClick={testPrinter} className="h-10">
                  Test
                </Button>
                <Button variant="ghost" size="sm" onClick={disconnectPrinter} className="h-10 text-red-500">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              data-testid="pending-orders-button"
              onClick={() => setShowPendingOrders(!showPendingOrders)}
              className="h-12 text-base"
            >
              <Receipt className="w-5 h-5 mr-2" />
              Pending ({pendingOrders.length})
            </Button>
            <Button variant="outline" data-testid="pos-logout-button" onClick={logout} className="h-12 text-base">
              <LogOut className="w-5 h-5 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b bg-slate-50">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-12 text-lg pos-search"
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
              className="h-12 text-base whitespace-nowrap px-5"
            >
              <PackagePlus className="w-5 h-5 mr-2" />
              Custom Item
            </Button>
          </div>
        </div>

        {/* Categories */}
        <div className="px-6 py-4 border-b">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              data-testid="category-all-button"
              onClick={() => setSelectedCategory(null)}
              className="category-btn whitespace-nowrap"
            >
              All Products
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                data-testid={`category-button-${category.id}`}
                onClick={() => setSelectedCategory(category.id)}
                className="category-btn whitespace-nowrap"
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Products Grid or Pending Orders */}
        <ScrollArea className="flex-1 p-6">
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
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`edit-order-${order.id}`}
                          onClick={() => editPendingOrder(order)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          data-testid={`cancel-order-${order.id}`}
                          onClick={() => cancelPendingOrder(order.id)}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                        <Button
                          className="flex-1 btn-success"
                          data-testid={`complete-order-${order.id}`}
                          onClick={() => openCompleteDialog(order)}
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Complete Payment
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )})
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

      {/* Cart Sidebar */}
      <div className="w-[380px] bg-card border-l flex flex-col cart-sidebar">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-6 h-6" />
              <h2 className="text-xl font-bold">Cart</h2>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" data-testid="clear-cart-button" onClick={clearCart}>
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Table Selection - More Compact */}
        <div className="px-4 py-2 border-b bg-slate-50">
          <Select value={selectedTable || "no-table"} onValueChange={(v) => setSelectedTable(v === "no-table" ? null : v)}>
            <SelectTrigger data-testid="table-selector" className="w-full h-10 text-sm">
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

        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Cart empty</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
                <div key={item.product_id} data-testid={`cart-item-${item.product_id}`} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-1">
                        {item.product_name}
                        {item.is_custom && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded">Custom</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {getCurrencySymbol(currency)}{item.unit_price.toFixed(2)} × {item.quantity}
                      </div>
                    </div>
                    <div className="font-bold font-mono text-emerald-600 ml-2">
                      {getCurrencySymbol(currency)}{item.total.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`decrease-qty-${item.product_id}`}
                        onClick={() => updateQuantity(item.product_id, -1)}
                        className="h-8 w-8 p-0"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="font-mono font-bold w-6 text-center">{item.quantity}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`increase-qty-${item.product_id}`}
                        onClick={() => updateQuantity(item.product_id, 1)}
                        className="h-8 w-8 p-0"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`remove-item-${item.product_id}`}
                      onClick={() => removeFromCart(item.product_id)}
                      className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t space-y-4">
          {/* Discount and Notes Buttons */}
          <div className="flex gap-2">
            <Button
              variant={showDiscountPanel ? "secondary" : "outline"}
              className="flex-1 h-11 text-base"
              onClick={() => { setShowDiscountPanel(!showDiscountPanel); setShowNotesPanel(false); }}
              data-testid="toggle-discount-btn"
            >
              <Percent className="w-5 h-5 mr-2" />
              Discount
              {discountValue && <span className="ml-1 text-emerald-600">✓</span>}
            </Button>
            <Button
              variant={showNotesPanel ? "secondary" : "outline"}
              className="flex-1 h-11 text-base"
              onClick={() => { setShowNotesPanel(!showNotesPanel); setShowDiscountPanel(false); }}
              data-testid="toggle-notes-btn"
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Notes
              {orderNotes && <span className="ml-1 text-emerald-600">✓</span>}
            </Button>
          </div>

          {/* Discount Panel */}
          {showDiscountPanel && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={discountType === 'percentage' ? 'default' : 'outline'}
                  onClick={() => setDiscountType('percentage')}
                  className="flex-1 h-10"
                >
                  <Percent className="w-4 h-4 mr-1" />
                  Percentage
                </Button>
                <Button
                  variant={discountType === 'fixed' ? 'default' : 'outline'}
                  onClick={() => setDiscountType('fixed')}
                  className="flex-1 h-10"
                >
                  <Tag className="w-3 h-3 mr-1" />
                  Fixed
                </Button>
              </div>
              {discountType && (
                <>
                  <div>
                    <Input
                      type="number"
                      placeholder={discountType === 'percentage' ? 'Enter %' : `Enter ${getCurrencySymbol(currency)}`}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      data-testid="discount-value-input"
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Reason (optional)"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      data-testid="discount-reason-input"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setDiscountType(''); setDiscountValue(''); setDiscountReason(''); }} className="flex-1">
                      Clear
                    </Button>
                    <Button size="sm" onClick={() => setShowDiscountPanel(false)} className="flex-1">
                      Apply
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Notes Panel */}
          {showNotesPanel && (
            <div className="p-3 bg-slate-50 rounded-lg space-y-3">
              <Textarea
                placeholder="Order notes for kitchen (allergies, special requests...)"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                rows={3}
                data-testid="order-notes-input"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOrderNotes('')} className="flex-1">
                  Clear
                </Button>
                <Button size="sm" onClick={() => setShowNotesPanel(false)} className="flex-1">
                  Done
                </Button>
              </div>
            </div>
          )}

          {/* Order Summary - Compact */}
          <div className="space-y-2">
            {calculateDiscount() > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount ({discountType === 'percentage' ? `${discountValue}%` : `${getCurrencySymbol(currency)}${discountValue}`})</span>
                <span className="font-mono">-{getCurrencySymbol(currency)}{calculateDiscount().toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t">
              <div>
                <span className="text-xl font-bold">Total</span>
                <span className="text-sm text-muted-foreground ml-2">({cart.reduce((sum, item) => sum + item.quantity, 0)} items)</span>
              </div>
              <span className="cart-total font-mono text-emerald-600">{getCurrencySymbol(currency)}{calculateCartTotal().toFixed(2)}</span>
            </div>
          </div>
          
          {/* Last Order Confirmation */}
          {lastOrderNumber && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center animate-pulse">
              <div className="font-bold text-emerald-700 text-lg">
                ✓ Order #{lastOrderNumber} Sent to Kitchen!
              </div>
            </div>
          )}
          
          {/* Editing Order Banner */}
          {editingOrder && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-amber-800 text-base">Editing Order #{editingOrder.order_number}</div>
                  <div className="text-sm text-amber-600">Add items and click Update Order</div>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => {
                    setEditingOrder(null);
                    setCart([]);
                    setOrderNotes('');
                    setDiscountType('');
                    setDiscountValue('');
                    setDiscountReason('');
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}
          
          <Button
            className="place-order-btn w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            data-testid="place-order-button"
            onClick={editingOrder ? updateOrder : placeOrder}
            disabled={cart.length === 0}
          >
            <Printer className="w-6 h-6 mr-2" />
            {editingOrder ? `Update Order #${editingOrder.order_number}` : 'Place Order (Send to Kitchen)'}
          </Button>
        </div>
      </div>

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
                        <DollarSign className="w-3 h-3" /> Cash
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
                  <DollarSign className="w-8 h-8" />
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
