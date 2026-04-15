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

    // Request permission - wrapped in try/catch to prevent app crash
    let permStatus;
    try {
      permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
    } catch (permErr) {
      console.warn('[Push] Permission check failed (non-fatal):', permErr.message);
      return; // Don't crash — just skip push setup
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[Push] Permission denied');
      return;
    }

    // Register with native push service - also wrapped
    try {
      await PushNotifications.register();
    } catch (regErr) {
      console.warn('[Push] Registration failed (non-fatal):', regErr.message);
      return;
    }

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
