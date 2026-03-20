import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { categoryAPI, productAPI, orderAPI } from '../services/api';
import printerService from '../services/printer';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Minus, Trash2, LogOut, Receipt, X, Printer, DollarSign, CreditCard, Users } from 'lucide-react';

const POSScreen = () => {
  const { user, logout } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
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

  useEffect(() => {
    loadData();
    loadPendingOrders();
    checkPrinterSupport();
  }, []);

  const checkPrinterSupport = () => {
    setPrinterConnected(printerService.isSupported());
  };

  const connectPrinter = async () => {
    try {
      await printerService.connect();
      setPrinterConnected(true);
      toast.success('Printer connected successfully');
    } catch (error) {
      toast.error('Failed to connect printer');
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
      toast.error('Failed to load data');
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

  const addToCart = (product) => {
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
    toast.success(`Added ${product.name} to cart`);
  };

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
    toast.info('Item removed from cart');
  };

  const clearCart = () => {
    setCart([]);
    toast.info('Cart cleared');
  };

  const placeOrder = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    const total = cart.reduce((sum, item) => sum + item.total, 0);

    try {
      const order = await orderAPI.create({
        items: cart,
        total_amount: total,
      });
      
      // Try thermal printer first
      if (printerConnected) {
        try {
          await printerService.printKitchenReceipt(order);
          toast.success('Order placed! Kitchen receipt printed.');
        } catch (error) {
          console.error('Thermal print failed:', error);
          // Fallback to PDF
          const kitchenReceipt = await orderAPI.printKitchenReceipt(order.id);
          downloadPDF(kitchenReceipt, `kitchen_${order.id.slice(0, 8)}.pdf`);
          toast.success('Order placed! Kitchen receipt downloaded.');
        }
      } else {
        // Download PDF
        const kitchenReceipt = await orderAPI.printKitchenReceipt(order.id);
        downloadPDF(kitchenReceipt, `kitchen_${order.id.slice(0, 8)}.pdf`);
        toast.success('Order placed! Kitchen receipt downloaded.');
      }
      
      setCart([]);
      loadPendingOrders();
    } catch (error) {
      toast.error('Failed to place order');
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
    setShowPaymentDialog(true);
  };

  const calculateTipAmount = () => {
    if (!selectedOrderToComplete) return 0;
    
    if (customTip) {
      return parseFloat(customTip) || 0;
    }
    
    if (tipPercentage > 0) {
      return (selectedOrderToComplete.subtotal * tipPercentage) / 100;
    }
    
    return 0;
  };

  const calculateGrandTotal = () => {
    if (!selectedOrderToComplete) return 0;
    return selectedOrderToComplete.subtotal + calculateTipAmount();
  };

  const calculatePerPersonAmount = () => {
    return calculateGrandTotal() / splitCount;
  };

  const completeOrder = async (paymentMethod) => {
    if (!selectedOrderToComplete) return;

    const tipAmount = calculateTipAmount();

    try {
      const completedOrder = await orderAPI.complete(
        selectedOrderToComplete.id, 
        paymentMethod,
        tipPercentage,
        tipAmount,
        splitCount
      );
      
      // Try thermal printer first
      if (printerConnected) {
        try {
          await printerService.printCustomerReceipt(completedOrder);
          toast.success(`Order completed with ${paymentMethod}! Customer receipt printed.`);
        } catch (error) {
          console.error('Thermal print failed:', error);
          // Fallback to PDF
          const customerReceipt = await orderAPI.printCustomerReceipt(selectedOrderToComplete.id);
          downloadPDF(customerReceipt, `receipt_${selectedOrderToComplete.id.slice(0, 8)}.pdf`);
          toast.success(`Order completed with ${paymentMethod}! Customer receipt downloaded.`);
        }
      } else {
        // Download PDF
        const customerReceipt = await orderAPI.printCustomerReceipt(selectedOrderToComplete.id);
        downloadPDF(customerReceipt, `receipt_${selectedOrderToComplete.id.slice(0, 8)}.pdf`);
        toast.success(`Order completed with ${paymentMethod}! Customer receipt downloaded.`);
      }
      
      setShowPaymentDialog(false);
      setSelectedOrderToComplete(null);
      setTipPercentage(0);
      setCustomTip('');
      setSplitCount(1);
      loadPendingOrders();
    } catch (error) {
      toast.error('Failed to complete order');
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
    <div className="flex h-screen">
      {/* Main Product Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-card border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
            <p className="text-sm text-muted-foreground">Welcome, {user?.username}</p>
          </div>
          <div className="flex gap-3">
            {printerService.isSupported() && !printerConnected && (
              <Button
                variant="outline"
                data-testid="connect-printer-button"
                onClick={connectPrinter}
              >
                <Printer className="w-4 h-4 mr-2" />
                Connect Printer
              </Button>
            )}
            <Button
              variant="outline"
              data-testid="pending-orders-button"
              onClick={() => setShowPendingOrders(!showPendingOrders)}
            >
              <Receipt className="w-4 h-4 mr-2" />
              Pending Orders ({pendingOrders.length})
            </Button>
            <Button variant="outline" data-testid="pos-logout-button" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
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
              className="h-10 px-6 whitespace-nowrap"
            >
              All Products
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                data-testid={`category-button-${category.id}`}
                onClick={() => setSelectedCategory(category.id)}
                className="h-10 px-6 whitespace-nowrap"
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
                pendingOrders.map((order) => (
                  <Card key={order.id} data-testid={`pending-order-${order.id}`}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-lg font-bold">Order #{order.id.slice(0, 8).toUpperCase()}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(order.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold font-mono text-emerald-600">
                            ${order.total_amount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 mb-4">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>
                              {item.product_name} x {item.quantity}
                            </span>
                            <span className="font-mono">${item.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        className="w-full btn-success"
                        data-testid={`complete-order-${order.id}`}
                        onClick={() => openCompleteDialog(order)}
                      >
                        <DollarSign className="w-4 h-4 mr-2" />
                        Complete Payment
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No products available</div>
          ) : (
            <div className="pos-grid">
              {products.map((product) => (
                <Card
                  key={product.id}
                  data-testid={`product-card-${product.id}`}
                  className="product-card"
                  onClick={() => addToCart(product)}
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-32 object-cover" />
                  ) : (
                    <div className="w-full h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      <span className="text-4xl">🍽️</span>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="font-semibold text-sm mb-1 line-clamp-1">{product.name}</div>
                    <div className="text-xs text-muted-foreground mb-2">{product.category_name}</div>
                    <div className="price text-emerald-600">${product.price.toFixed(2)}</div>
                    {!product.in_stock && <div className="text-xs text-red-500 mt-1">Out of stock</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Cart Sidebar */}
      <div className="w-96 bg-card border-l flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6" />
              <h2 className="text-xl font-bold">Current Order</h2>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" data-testid="clear-cart-button" onClick={clearCart}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 p-6">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <Card key={item.product_id} data-testid={`cart-item-${item.product_id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="font-semibold">{item.product_name}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          ${item.unit_price.toFixed(2)} each
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`remove-item-${item.product_id}`}
                        onClick={() => removeFromCart(item.product_id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
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
                        <span className="font-mono font-bold w-8 text-center">{item.quantity}</span>
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
                      <div className="font-bold font-mono text-lg">${item.total.toFixed(2)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items</span>
              <span className="font-medium">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-xl font-bold">
              <span>Total</span>
              <span className="font-mono text-2xl">${totalAmount.toFixed(2)}</span>
            </div>
          </div>
          <Button
            className="w-full h-14 text-lg bg-amber-500 hover:bg-amber-600 text-white"
            data-testid="place-order-button"
            onClick={placeOrder}
            disabled={cart.length === 0}
          >
            <Printer className="w-5 h-5 mr-2" />
            Place Order (Send to Kitchen)
          </Button>
        </div>
      </div>

      {/* Payment Method Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Payment</DialogTitle>
            <DialogDescription>
              Order #{selectedOrderToComplete?.id.slice(0, 8).toUpperCase()}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Order Summary */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between text-sm mb-2">
                <span>Subtotal:</span>
                <span className="font-mono">${selectedOrderToComplete?.subtotal?.toFixed(2)}</span>
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
                      +${calculateTipAmount().toFixed(2)}
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
                      ${calculatePerPersonAmount().toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              
              <Separator className="my-3" />
              <div className="flex justify-between font-bold text-lg">
                <span>Grand Total:</span>
                <span className="font-mono text-emerald-600">
                  ${calculateGrandTotal().toFixed(2)}
                </span>
              </div>
            </div>
            
            {/* Payment Method Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                className="h-20 flex flex-col gap-2"
                data-testid="payment-cash-button"
                onClick={() => completeOrder('cash')}
              >
                <DollarSign className="w-8 h-8" />
                <span className="text-base font-bold">Cash</span>
              </Button>
              <Button
                className="h-20 flex flex-col gap-2"
                variant="secondary"
                data-testid="payment-card-button"
                onClick={() => completeOrder('card')}
              >
                <CreditCard className="w-8 h-8" />
                <span className="text-base font-bold">Card</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSScreen;
