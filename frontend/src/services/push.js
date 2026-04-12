/**
 * Push Notification Service
 * Works in Capacitor (native) and gracefully degrades in web browsers.
 * Registers device token with the backend on login.
 */
import api from './api';

let pushInitialized = false;

/**
 * Initialize push notifications.
 * Call this after the user logs in successfully.
 */
export async function initPushNotifications() {
  if (pushInitialized) return;

  try {
    // Check if running in Capacitor (native)
    const isCapacitor = window.Capacitor?.isNativePlatform?.();

    if (isCapacitor) {
      await initCapacitorPush();
    } else {
      // Web browser — no native push, in-app notifications handle this
      console.log('[Push] Running in browser. Using in-app notifications only.');
    }
    pushInitialized = true;
  } catch (err) {
    console.warn('[Push] Init failed:', err);
  }
}

async function initCapacitorPush() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') {
      console.warn('[Push] Permission denied');
      return;
    }

    // Register with native push service
    await PushNotifications.register();

    // Listen for token
    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] Token:', token.value?.substring(0, 20) + '...');
      const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android';
      try {
        await api.post('/devices/register', { token: token.value, platform });
      } catch (err) {
        console.warn('[Push] Token registration failed:', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] Registration error:', err);
    });

    // Foreground notification
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Received:', notification.title);
      // The in-app notification bell will pick this up from the API
    });

    // Notification tap (app opened from notification)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data;
      if (data?.type === 'long_shift_nudge') {
        window.location.href = '/heva-ops/clock';
      }
    });

  } catch (err) {
    console.warn('[Push] Capacitor push not available:', err.message);
  }
}

/**
 * Unregister push on logout.
 */
export async function teardownPushNotifications() {
  pushInitialized = false;
  try {
    const isCapacitor = window.Capacitor?.isNativePlatform?.();
    if (isCapacitor) {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllListeners();
    }
  } catch {}
}
