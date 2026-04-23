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
    // Prefer Capacitor's official plugin-availability check. This catches the
    // case where @capacitor/push-notifications is in package.json but the
    // Android project was never `npx cap sync`'d — trying to call register()
    // in that state hard-crashes the native activity (the "APK closes when
    // I tap Enable" bug). isPluginAvailable returns false cleanly instead.
    const cap = window.Capacitor;
    if (typeof cap?.isPluginAvailable === 'function') {
      if (!cap.isPluginAvailable('PushNotifications')) {
        pushAvailable = false;
        return false;
      }
    } else if (!cap?.Plugins?.PushNotifications) {
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
    return {
      success: false,
      message: 'Push notifications are not configured in this build. Run `npx cap sync android` locally, then rebuild the APK.',
    };
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Wrap every native call in an individual try/catch so a crash in one
    // step (missing google-services.json, Firebase init failure, etc.)
    // cannot escape to the Capacitor bridge and kill the WebView. Even then,
    // Firebase-init native crashes are unrecoverable from JS on Android;
    // this is the best we can do from the JS side, and is a defence in
    // depth on top of the `isPluginAvailable` gate above.
    let permStatus;
    try {
      permStatus = await PushNotifications.checkPermissions();
    } catch (e) {
      return { success: false, message: 'Cannot read notification permission. Please try again.' };
    }

    if (permStatus?.receive === 'prompt' || permStatus?.receive === 'prompt-with-rationale') {
      try {
        permStatus = await PushNotifications.requestPermissions();
      } catch (e) {
        return { success: false, message: 'Permission request failed. Enable notifications in system settings.' };
      }
    }

    if (permStatus?.receive !== 'granted') {
      return { success: false, message: 'Notification permission denied' };
    }

    // IMPORTANT: register listeners BEFORE calling register(). On Android,
    // the FCM token can arrive synchronously after register() and a listener
    // attached afterwards will miss it — causing downstream flows to hang.
    try {
      await PushNotifications.addListener('registration', async (token) => {
        const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android';
        try {
          await api.post('/devices/register', { token: token.value, platform });
        } catch {}
      });
      await PushNotifications.addListener('registrationError', (err) => {
        console.warn('[Push] Registration error:', err);
      });
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] Received:', notification.title);
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification?.data;
        if (data?.type === 'long_shift_nudge') {
          window.location.href = '/heva-ops/clock';
        }
      });
    } catch (e) {
      console.warn('[Push] Listener registration failed:', e);
      // Don't fail the whole flow — user can still receive notifications
      // even if some listeners didn't attach; just log and keep going.
    }

    // Register with FCM/APNs. Race against a 10s timeout so we don't hang
    // the UI if the native side is stuck waiting for Firebase init.
    try {
      await Promise.race([
        PushNotifications.register(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      const msg = e?.message === 'timeout'
        ? 'Notification service did not respond. Check google-services.json and rebuild the APK.'
        : (e?.message || 'Registration failed. Firebase may not be configured in this build.');
      return { success: false, message: msg };
    }

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
