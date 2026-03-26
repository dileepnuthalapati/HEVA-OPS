import axios from 'axios';
import { saveToIndexedDB, getAllFromIndexedDB, getUnsyncedOrders } from './db';

// Updated to Railway production URL
const API_URL = process.env.REACT_APP_BACKEND_URL || 'https://heva-ops-production.up.railway.app';

// Production configuration: No test login bypass
export const USE_TEST_LOGIN = false;
const API = `${API_URL}/api`;

console.log('Connecting to API at:', API);

let authToken = localStorage.getItem('auth_token');

const api = axios.create({
  baseURL: API,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

export const setAuthToken = (token) => {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
};

export const getAuthToken = () => authToken;

export const authAPI = {
  register: async (username, password, role) => {
    const response = await api.post('/auth/register', { username, password, role });
    return response.data;
  },
  login: async (username, password) => {
    // Using secure login endpoint
    const response = await api.post('/auth/login', { username, password });
    if (response.data.access_token) {
      setAuthToken(response.data.access_token);
    }
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export const categoryAPI = {
  getAll: async () => {
    try {
      const response = await api.get('/categories');
      await saveToIndexedDB('categories', response.data);
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        return await getAllFromIndexedDB('categories');
      }
      throw error;
    }
  },
  create: async (data) => {
    const response = await api.post('/categories', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/categories/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/categories/${id}`);
    return response.data;
  },
};

export const productAPI = {
  getAll: async (categoryId = null) => {
    try {
      const url = categoryId ? `/products?category_id=${categoryId}` : '/products';
      const response = await api.get(url);
      await saveToIndexedDB('products', response.data);
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        const allProducts = await getAllFromIndexedDB('products');
        return categoryId ? allProducts.filter(p => p.category_id === categoryId) : allProducts;
      }
      throw error;
    }
  },
  create: async (data) => {
    const response = await api.post('/products', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/products/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/products/${id}`);
    return response.data;
  },
};

export const orderAPI = {
  getAll: async () => {
    try {
      const response = await api.get('/orders');
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        return await getAllFromIndexedDB('orders');
      }
      throw error;
    }
  },
  getPending: async () => {
    try {
      const response = await api.get('/orders/pending');
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        const allOrders = await getAllFromIndexedDB('orders');
        return allOrders.filter(o => o.status === 'pending');
      }
      throw error;
    }
  },
  create: async (data) => {
    try {
      const response = await api.post('/orders', data);
      await saveToIndexedDB('orders', { ...response.data, synced: true });
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        const offlineOrder = {
          id: `offline_${Date.now()}`,
          ...data,
          created_at: new Date().toISOString(),
          synced: false,
          status: 'pending',
          payment_method: null,
          completed_at: null
        };
        await saveToIndexedDB('orders', offlineOrder);
        return offlineOrder;
      }
      throw error;
    }
  },
  complete: async (orderId, paymentMethod, tipPercentage = 0, tipAmount = 0, splitCount = 1, paymentDetails = null) => {
    const response = await api.put(`/orders/${orderId}/complete`, { 
      payment_method: paymentMethod,
      tip_percentage: tipPercentage,
      tip_amount: tipAmount,
      split_count: splitCount,
      payment_details: paymentDetails
    });
    await saveToIndexedDB('orders', response.data);
    return response.data;
  },
  update: async (orderId, data) => {
    const response = await api.put(`/orders/${orderId}`, data);
    await saveToIndexedDB('orders', response.data);
    return response.data;
  },
  printKitchenReceipt: async (orderId) => {
    const response = await api.post(`/orders/${orderId}/print-kitchen-receipt`, {}, { responseType: 'blob' });
    return response.data;
  },
  printCustomerReceipt: async (orderId) => {
    const response = await api.post(`/orders/${orderId}/print-customer-receipt`, {}, { responseType: 'blob' });
    return response.data;
  },
  sync: async () => {
    const unsyncedOrders = await getUnsyncedOrders();
    if (unsyncedOrders.length === 0) return { message: 'No orders to sync' };
    
    const ordersToSync = unsyncedOrders.map(order => ({
      items: order.items,
      total_amount: order.total_amount,
    }));
    
    const response = await api.post('/sync', { orders: ordersToSync });
    
    for (const order of unsyncedOrders) {
      await saveToIndexedDB('orders', { ...order, synced: true });
    }
    
    return response.data;
  },
};

export const reportAPI = {
  getStats: async (startDate, endDate) => {
    const response = await api.get(`/reports/stats?start_date=${startDate}&end_date=${endDate}`);
    return response.data;
  },
  generatePDF: async (startDate, endDate) => {
    const response = await api.post('/reports/generate', 
      { start_date: startDate, end_date: endDate },
      { responseType: 'blob' }
    );
    return response.data;
  },
};

export const cashDrawerAPI = {
  open: async (openingBalance) => {
    const response = await api.post('/cash-drawer/open', { opening_balance: openingBalance });
    return response.data;
  },
  getCurrent: async () => {
    const response = await api.get('/cash-drawer/current');
    return response.data;
  },
  close: async (actualCash, notes = '') => {
    const response = await api.put('/cash-drawer/close', { actual_cash: actualCash, notes });
    return response.data;
  },
  getHistory: async () => {
    const response = await api.get('/cash-drawer/history');
    return response.data;
  },
};

export const restaurantAPI = {
  getMy: async () => {
    const response = await api.get('/restaurants/my');
    return response.data;
  },
  updateSettings: async (settings) => {
    const response = await api.put('/restaurants/my/settings', settings);
    return response.data;
  },
  getAll: async () => {
    const response = await api.get('/restaurants');
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/restaurants', data);
    return response.data;
  },
  update: async (restaurantId, data) => {
    const response = await api.put(`/restaurants/${restaurantId}`, data);
    return response.data;
  },
  delete: async (restaurantId) => {
    const response = await api.delete(`/restaurants/${restaurantId}`);
    return response.data;
  },
  // Restaurant User Management
  getUsers: async (restaurantId) => {
    const response = await api.get(`/restaurants/${restaurantId}/users`);
    return response.data;
  },
  createUser: async (restaurantId, userData) => {
    const response = await api.post(`/restaurants/${restaurantId}/users`, userData);
    return response.data;
  },
  deleteUser: async (restaurantId, userId) => {
    const response = await api.delete(`/restaurants/${restaurantId}/users/${userId}`);
    return response.data;
  },
};

// Tables API
export const tableAPI = {
  getAll: async () => {
    const response = await api.get('/tables');
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/tables', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/tables/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/tables/${id}`);
    return response.data;
  },
  assignOrder: async (tableId, orderId) => {
    const response = await api.post(`/tables/${tableId}/assign-order?order_id=${orderId}`);
    return response.data;
  },
  clear: async (tableId) => {
    const response = await api.post(`/tables/${tableId}/clear`);
    return response.data;
  },
  merge: async (tableIds) => {
    const response = await api.post('/tables/merge', { table_ids: tableIds });
    return response.data;
  },
  unmerge: async (tableId) => {
    const response = await api.post(`/tables/${tableId}/unmerge`);
    return response.data;
  },
  splitBill: async (tableId, orderId, splits) => {
    const response = await api.post(`/tables/${tableId}/split-bill`, { order_id: orderId, splits });
    return response.data;
  },
};

// Reservations API
export const reservationAPI = {
  getAll: async (date = null, status = null) => {
    let url = '/reservations';
    const params = [];
    if (date) params.push(`date=${date}`);
    if (status) params.push(`status=${status}`);
    if (params.length > 0) url += '?' + params.join('&');
    const response = await api.get(url);
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/reservations', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/reservations/${id}`, data);
    return response.data;
  },
  cancel: async (id) => {
    const response = await api.delete(`/reservations/${id}`);
    return response.data;
  },
  seat: async (id) => {
    const response = await api.post(`/reservations/${id}/seat`);
    return response.data;
  },
  complete: async (id) => {
    const response = await api.post(`/reservations/${id}/complete`);
    return response.data;
  },
};

// Printers API
export const printerAPI = {
  getAll: async () => {
    const response = await api.get('/printers');
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/printers', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/printers/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/printers/${id}`);
    return response.data;
  },
  test: async (id) => {
    const response = await api.post(`/printers/${id}/test`);
    return response.data;
  },
  printKitchenReceipt: async (orderId) => {
    const response = await api.post(`/print/kitchen/${orderId}`);
    return response.data;
  },
  printCustomerReceipt: async (orderId) => {
    const response = await api.post(`/print/customer/${orderId}`);
    return response.data;
  },
};

export default api;
