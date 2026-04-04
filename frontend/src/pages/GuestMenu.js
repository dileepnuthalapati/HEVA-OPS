import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, ArrowRight, X, ShoppingCart, MapPin, CaretDown } from '@phosphor-icons/react';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CURRENCY_SYMBOLS = { GBP: '\u00a3', USD: '$', EUR: '\u20ac', INR: '\u20b9' };
const getCurrSym = (c) => CURRENCY_SYMBOLS[c] || c + ' ';

export default function GuestMenu() {
  const { restaurantId, tableHash } = useParams();
  const [menuData, setMenuData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [orderPlaced, setOrderPlaced] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [payEnabled, setPayEnabled] = useState(false);
  const categoryRef = useRef(null);

  useEffect(() => {
    fetchMenu();
    // Check if restaurant accepts online payments
    axios.get(`${API_URL}/api/payments/connect/status/${restaurantId}`)
      .then(r => setPayEnabled(r.data.pay_enabled))
      .catch(() => {});
  }, [restaurantId, tableHash]);

  const fetchMenu = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/qr/${restaurantId}/${tableHash}`);
      setMenuData(res.data);
      if (res.data.categories?.length > 0) {
        setSelectedCategory(null); // "All" by default
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Menu not found');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    setCart((prev) => ({
      ...prev,
      [product.id]: {
        ...product,
        qty: (prev[product.id]?.qty || 0) + 1,
      },
    }));
  };

  const updateQty = (productId, delta) => {
    setCart((prev) => {
      const current = prev[productId]?.qty || 0;
      const next = current + delta;
      if (next <= 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: { ...prev[productId], qty: next } };
    });
  };

  const cartItems = Object.values(cart).filter((i) => i.qty > 0);
  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);
  const cartTotal = cartItems.reduce((sum, i) => sum + i.qty * i.price, 0);
  const sym = getCurrSym(menuData?.restaurant?.currency);

  const filteredProducts = menuData?.products?.filter(
    (p) => !selectedCategory || p.category_id === selectedCategory
  ) || [];

  const placeOrder = async () => {
    if (cartItems.length === 0 || placing) return;
    setPlacing(true);
    try {
      const items = cartItems.map((i) => ({
        product_id: i.id,
        product_name: i.name,
        quantity: i.qty,
        unit_price: i.price,
        total: i.qty * i.price,
      }));
      const res = await axios.post(`${API_URL}/api/qr/${restaurantId}/${tableHash}/order`, {
        items,
        guest_name: guestName || null,
        guest_notes: guestNotes || null,
      });
      setOrderPlaced(res.data);
      setCart({});
      setCartOpen(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-stone-50 flex items-center justify-center" style={{ fontFamily: 'Manrope, sans-serif' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-stone-400 text-lg">
          Loading menu...
        </motion.div>
      </div>
    );
  }

  // Error state
  if (error) {
    const isDisabled = error.includes('temporarily disabled');
    return (
      <div className="max-w-md mx-auto min-h-screen bg-stone-50 flex items-center justify-center px-6" style={{ fontFamily: 'Manrope, sans-serif' }}>
        <div className="text-center">
          <div className="text-6xl mb-4">{isDisabled ? '\u23F8\uFE0F' : '\uD83D\uDE15'}</div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">
            {isDisabled ? 'Ordering Paused' : 'Menu Not Found'}
          </h2>
          <p className="text-stone-500" data-testid="error-message">
            {isDisabled ? 'The restaurant has temporarily paused QR ordering. Please ask your server to place your order.' : error}
          </p>
        </div>
      </div>
    );
  }

  // Order confirmation screen
  if (orderPlaced) {
    const handlePayBill = async () => {
      try {
        const res = await axios.post(`${API_URL}/api/payments/create-checkout-session`, {
          order_id: orderPlaced.order_id,
          origin_url: window.location.origin,
        });
        if (res.data.url) {
          window.location.href = res.data.url;
        }
      } catch (err) {
        alert(err.response?.data?.detail || 'Payment failed. Please ask your server.');
      }
    };

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-md mx-auto min-h-screen bg-stone-900 text-white flex flex-col items-center justify-center p-6 text-center"
        style={{ fontFamily: 'Manrope, sans-serif' }}
        data-testid="order-confirmation-screen"
      >
        <motion.img
          src="https://static.prod-images.emergentagent.com/jobs/2b672dd2-6031-4dbc-beee-28f993a94294/images/da8c7d5e636d088b4e27aee1b3a1f301c253a10f24c261905720097e040211f8.png"
          alt="Order confirmed"
          className="w-48 h-48 object-contain mb-8"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        />
        <motion.h1
          className="text-3xl sm:text-4xl font-black tracking-tight mb-3"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Order Sent to Kitchen
        </motion.h1>
        <motion.p
          className="text-stone-400 text-lg mb-2"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Your food is being prepared.
        </motion.p>
        <motion.p
          className="text-stone-500 text-sm mb-8"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Order #{String(orderPlaced.order_number).padStart(3, '0')} &middot; {orderPlaced.table}
        </motion.p>
        <motion.button
          data-testid="order-again-button"
          className="bg-orange-600 text-white px-8 py-3 rounded-full font-semibold text-base"
          whileTap={{ scale: 0.95 }}
          onClick={() => setOrderPlaced(null)}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          Order More
        </motion.button>
        {payEnabled && (
          <motion.button
            data-testid="pay-bill-button"
            className="mt-4 bg-emerald-600 text-white px-8 py-3 rounded-full font-semibold text-base flex items-center gap-2 mx-auto"
            whileTap={{ scale: 0.95 }}
            onClick={handlePayBill}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            Pay Bill &middot; {sym}{orderPlaced.total?.toFixed(2) || '0.00'}
          </motion.button>
        )}
      </motion.div>
    );
  }

  const restaurant = menuData.restaurant;
  const table = menuData.table;
  const categories = menuData.categories || [];

  return (
    <div
      className="max-w-md mx-auto w-full min-h-screen bg-stone-50 shadow-2xl relative overflow-x-hidden"
      style={{ fontFamily: 'Manrope, sans-serif' }}
      data-testid="guest-menu-page"
    >
      {/* Hero */}
      <div className="h-56 relative w-full overflow-hidden" data-testid="hero-section">
        <img
          src="https://images.unsplash.com/photo-1768051297578-1ea70392c307?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwxfHxyZXN0YXVyYW50JTIwaW50ZXJpb3IlMjBjYWZlJTIwd2FybSUyMGxpZ2h0aW5nfGVufDB8fHx8MTc3NTIyMzAwN3ww&ixlib=rb-4.1.0&q=85"
          alt="Restaurant"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-50 via-stone-50/40 to-transparent" />
        <div className="absolute bottom-4 left-5 right-5">
          <h1
            className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight leading-tight"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
            data-testid="restaurant-name"
          >
            {restaurant.name}
          </h1>
        </div>
      </div>

      {/* Sticky header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-white/20 px-5 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 text-stone-500 text-sm">
          <MapPin size={14} weight="bold" />
          <span>{restaurant.name}</span>
        </div>
        <div
          className="bg-stone-100 text-stone-900 px-3 py-1 rounded-full text-xs font-bold"
          data-testid="table-badge"
        >
          {table.name}
        </div>
      </div>

      {/* Category Tabs */}
      <div
        ref={categoryRef}
        className="sticky top-[52px] z-30 bg-stone-50/90 backdrop-blur-md py-3 px-4 flex gap-3 overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        data-testid="category-tabs"
      >
        <style>{`.category-scroll::-webkit-scrollbar { display: none; }`}</style>
        <motion.button
          data-testid="category-tab-all"
          className={`whitespace-nowrap px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
            !selectedCategory
              ? 'bg-stone-900 text-white shadow-md'
              : 'bg-white text-stone-600 border border-stone-200'
          }`}
          whileTap={{ scale: 0.95 }}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </motion.button>
        {categories.map((cat) => (
          <motion.button
            key={cat.id}
            data-testid={`category-tab-${cat.id}`}
            className={`whitespace-nowrap px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
              selectedCategory === cat.id
                ? 'bg-stone-900 text-white shadow-md'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.name}
          </motion.button>
        ))}
      </div>

      {/* Products */}
      <div className="pb-32 pt-2">
        <AnimatePresence mode="popLayout">
          {filteredProducts.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 text-stone-400"
            >
              No items in this category
            </motion.div>
          ) : (
            filteredProducts.map((product, idx) => {
              const inCart = cart[product.id]?.qty || 0;
              return (
                <motion.div
                  key={product.id}
                  data-testid={`product-card-${product.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex gap-4 p-4 mb-3 mx-4 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100"
                >
                  {/* Product image placeholder */}
                  <div className="w-24 h-24 rounded-2xl bg-stone-100 shrink-0 flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl text-stone-300">
                        {product.name?.charAt(0)?.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <h3 className="font-semibold text-stone-900 text-base leading-tight truncate">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-xs text-stone-400 mt-1 line-clamp-2">{product.description}</p>
                      )}
                    </div>
                    <div className="flex justify-between items-end mt-2">
                      <span className="font-bold text-stone-900 text-base">
                        {sym}{product.price?.toFixed(2)}
                      </span>

                      {/* Add / Qty controls */}
                      {inCart === 0 ? (
                        <motion.button
                          data-testid={`add-to-cart-${product.id}`}
                          className="bg-stone-100 text-stone-900 hover:bg-orange-600 hover:text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors"
                          whileTap={{ scale: 0.85 }}
                          onClick={() => addToCart(product)}
                        >
                          <Plus size={18} weight="bold" />
                        </motion.button>
                      ) : (
                        <div className="flex items-center gap-2 bg-stone-100 rounded-full px-1 py-1">
                          <motion.button
                            data-testid={`qty-minus-${product.id}`}
                            className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm"
                            whileTap={{ scale: 0.85 }}
                            onClick={() => updateQty(product.id, -1)}
                          >
                            <Minus size={14} weight="bold" />
                          </motion.button>
                          <span className="text-sm font-bold min-w-[18px] text-center">{inCart}</span>
                          <motion.button
                            data-testid={`qty-plus-${product.id}`}
                            className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-sm"
                            whileTap={{ scale: 0.85 }}
                            onClick={() => updateQty(product.id, 1)}
                          >
                            <Plus size={14} weight="bold" />
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Floating Cart Bar */}
      <AnimatePresence>
        {cartCount > 0 && !cartOpen && (
          <motion.div
            data-testid="floating-cart-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[calc(28rem-2rem)] z-50 bg-stone-900/95 backdrop-blur-xl text-white p-4 px-6 rounded-full shadow-2xl flex justify-between items-center cursor-pointer"
            onClick={() => setCartOpen(true)}
          >
            <div className="flex items-center gap-3">
              <div className="bg-orange-600 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold">
                {cartCount}
              </div>
              <span className="text-sm font-medium">
                {cartCount} item{cartCount > 1 ? 's' : ''} &middot; {sym}{cartTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm font-semibold">
              View Order <ArrowRight size={16} weight="bold" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="bg-white rounded-t-[2rem] max-h-[85vh] overflow-y-auto p-0">
          <SheetTitle className="sr-only">Your Order</SheetTitle>
          <div className="p-6 pb-0">
            <div className="flex justify-between items-center mb-6">
              <h2
                className="text-2xl font-bold tracking-tight text-stone-900"
                style={{ fontFamily: 'DM Sans, sans-serif' }}
                data-testid="cart-title"
              >
                Your Order
              </h2>
              <button
                data-testid="close-cart-button"
                className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center"
                onClick={() => setCartOpen(false)}
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="space-y-4 mb-6">
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between items-center" data-testid={`cart-item-${item.id}`}>
                  <div className="flex-1">
                    <p className="font-semibold text-stone-900 text-sm">{item.name}</p>
                    <p className="text-stone-500 text-xs">{sym}{item.price.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-stone-100 rounded-full px-1 py-1">
                      <button
                        className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm"
                        onClick={() => updateQty(item.id, -1)}
                      >
                        <Minus size={12} weight="bold" />
                      </button>
                      <span className="text-sm font-bold min-w-[18px] text-center">{item.qty}</span>
                      <button
                        className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-sm"
                        onClick={() => updateQty(item.id, 1)}
                      >
                        <Plus size={12} weight="bold" />
                      </button>
                    </div>
                    <span className="font-bold text-stone-900 text-sm min-w-[60px] text-right">
                      {sym}{(item.qty * item.price).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Guest info */}
            <div className="space-y-3 mb-6">
              <input
                data-testid="guest-name-input"
                type="text"
                placeholder="Your name (optional)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              <input
                data-testid="guest-notes-input"
                type="text"
                placeholder="Special requests (optional)"
                value={guestNotes}
                onChange={(e) => setGuestNotes(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* Totals */}
            <div className="border-t border-stone-200 pt-4 mb-4">
              <div className="flex justify-between text-sm text-stone-500 mb-1">
                <span>Subtotal</span>
                <span>{sym}{cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-stone-900">
                <span>Total</span>
                <span data-testid="cart-total">{sym}{cartTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Place Order Button */}
          <div className="sticky bottom-0 bg-white p-6 pt-3 border-t border-stone-100">
            <motion.button
              data-testid="place-order-button"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              whileTap={{ scale: 0.98 }}
              onClick={placeOrder}
              disabled={placing || cartItems.length === 0}
            >
              {placing ? 'Sending to Kitchen...' : `Place Order \u00b7 ${sym}${cartTotal.toFixed(2)}`}
            </motion.button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
