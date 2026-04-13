/**
 * Heva One Socket.IO Client — Real-time order updates.
 * 
 * Connects to the backend Socket.IO server for:
 * - new_qr_order: Guest placed an order via QR menu
 * - order_update: Any order status change
 * 
 * Includes a 2-minute safety poll fallback.
 */
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

let socket = null;
let safetyPollInterval = null;

/**
 * Connect to the Socket.IO server and join a restaurant room.
 * @param {string} restaurantId - The restaurant to listen for events
 * @param {Object} callbacks - Event handlers { onNewQROrder, onOrderUpdate, onConnect, onDisconnect }
 */
export function connectSocket(restaurantId, callbacks = {}) {
  if (socket?.connected) {
    socket.disconnect();
  }

  socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket.IO] Connected:', socket.id);
    // Join the restaurant room
    socket.emit('join_restaurant', { restaurant_id: restaurantId });
    callbacks.onConnect?.();
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.IO] Disconnected:', reason);
    callbacks.onDisconnect?.(reason);
  });

  socket.on('new_qr_order', (data) => {
    console.log('[Socket.IO] New QR order:', data);
    callbacks.onNewQROrder?.(data);
  });

  socket.on('order_update', (data) => {
    console.log('[Socket.IO] Order update:', data);
    callbacks.onOrderUpdate?.(data);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket.IO] Connection error:', err.message);
  });

  return socket;
}

/**
 * Start the 2-minute safety poll fallback.
 * Calls the provided function every 2 minutes to catch missed socket events.
 * @param {Function} pollFn - Async function to call for polling
 */
export function startSafetyPoll(pollFn) {
  stopSafetyPoll();
  safetyPollInterval = setInterval(() => {
    pollFn();
  }, 2 * 60 * 1000); // Every 2 minutes
}

/**
 * Stop the safety poll.
 */
export function stopSafetyPoll() {
  if (safetyPollInterval) {
    clearInterval(safetyPollInterval);
    safetyPollInterval = null;
  }
}

/**
 * Disconnect socket and stop safety poll.
 */
export function disconnectSocket() {
  stopSafetyPoll();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Check if the socket is currently connected.
 */
export function isConnected() {
  return socket?.connected || false;
}
