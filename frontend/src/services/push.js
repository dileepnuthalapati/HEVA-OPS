/**
 * Push Notification Service — Heva ONE
 * 
 * Strategy: Push is initialized ONCE via a user-facing prompt banner.
 * The banner appears in both staff (HevaOps) and admin (Dashboard) views.
 * 
 * Native (Capacitor): Uses @capacitor/push-notifications for FCM/APNs
 * Web browser: Silently skips — uses in-app notification polling instead
 */
import api from './api';

let pushInitialized = false;
let pushAvailable = null; // null=unchecked, true/false after check

/**
 * Check if native push is available (Capacitor + plugin installed)
 */
export async function isPushAvailable() {
  if (pushAvailable !== null) return pushAvailable;
  try {
    if (!window.Capacitor?.isNativePlatform()) {
      pushAvailable = false;
      return false;
    }
    // Check if the plugin is actually registered
    const plugins = window.Capacitor?.Plugins;
    if (!plugins?.PushNotifications) {
      pushAvailable = false;
      return false;
    }
    pushAvailable = true;
    return true;
  } catch {
    pushAvailable = false;
    return false;
  }
}

/**
 * Initialize push notifications.
 * Call this from the notification prompt banner when user opts in.
 * Returns { success: boolean, message: string }
 */
export async function initPushNotifications() {
  if (pushInitialized) return { success: true, message: 'Already enabled' };

  const available = await isPushAvailable();
  if (!available) {
    pushInitialized = true;
    return { success: false, message: 'Push notifications are not available on this device' };
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Check current permission
    let permStatus = await PushNotifications.checkPermissions();

    // Request if needed
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      return { success: false, message: 'Notification permission denied' };
    }

    // Register with platform push service (FCM/APNs)
    await PushNotifications.register();

    // Listen for token
    await PushNotifications.addListener('registration', async (token) => {
      const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android';
      try {
        await api.post('/devices/register', { token: token.value, platform });
      } catch {}
    });

    await PushNotifications.addListener('registrationError', () => {});

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Received:', notification.title);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data;
      if (data?.type === 'long_shift_nudge') {
        window.location.href = '/heva-ops/clock';
      }
    });

    pushInitialized = true;
    localStorage.setItem('heva_push_enabled', 'true');
    return { success: true, message: 'Notifications enabled!' };
  } catch (err) {
    console.warn('[Push] Setup failed:', err?.message || err);
    return { success: false, message: `Setup failed: ${err?.message || 'Unknown error'}. Please check your Firebase configuration.` };
  }
}

/**
 * Check if push was previously enabled
 */
export function wasPushEnabled() {
  return localStorage.getItem('heva_push_enabled') === 'true';
}

/**
 * Teardown on logout
 */
export async function teardownPushNotifications() {
  pushInitialized = false;
  try {
    if (window.Capacitor?.isNativePlatform() && window.Capacitor?.Plugins?.PushNotifications) {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllListeners();
    }
  } catch {}
}
