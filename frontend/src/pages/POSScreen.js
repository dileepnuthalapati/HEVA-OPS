import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { categoryAPI, productAPI, orderAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Minus, Trash2, LogOut, Receipt, X } from 'lucide-react';

const POSScreen = () => {
  const { user, logout } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

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

  const checkout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    const total = cart.reduce((sum, item) => sum + item.total, 0);

    try {
      await orderAPI.create({
        items: cart,
        total_amount: total,
      });
      toast.success('Order completed successfully!');
      setCart([]);
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
            <h1 className="text-2xl font-bold tracking-tight">SwiftPOS</h1>
            <p className="text-sm text-muted-foreground">Welcome, {user?.username}</p>
          </div>
          <Button variant="outline" data-testid="pos-logout-button" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
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

        {/* Products Grid */}
        <ScrollArea className="flex-1 p-6">
          {products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No products available
            </div>
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
                    {!product.in_stock && (
                      <div className="text-xs text-red-500 mt-1">Out of stock</div>
                    )}
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
              <h2 className="text-xl font-bold">Cart</h2>
            </div>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="clear-cart-button"
                onClick={clearCart}
              >
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
                      <div className="font-bold font-mono text-lg">
                        ${item.total.toFixed(2)}
                      </div>
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
            className="w-full h-14 text-lg btn-success"
            data-testid="checkout-button"
            onClick={checkout}
            disabled={cart.length === 0}
          >
            <Receipt className="w-5 h-5 mr-2" />
            Complete Order
          </Button>
        </div>
      </div>
    </div>
  );
};

export default POSScreen;