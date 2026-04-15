/**
 * Push Notification Service
 * Works in Capacitor (native) and gracefully degrades in web browsers.
 * Registers device token with the backend on login.
 * 
 * IMPORTANT: All push operations are heavily wrapped to prevent app crashes.
 * Native push failures (missing google-services.json, etc.) must NEVER crash the app.
 */
import api from './api';

let pushInitialized = false;

/**
 * Initialize push notifications.
 * Call this after the user logs in successfully.
 * Uses a delay to ensure the login flow completes before any native push calls.
 */
export async function initPushNotifications() {
  if (pushInitialized) return;

  try {
    const isCapacitor = window.Capacitor?.isNativePlatform?.();
    if (!isCapacitor) {
      console.log('[Push] Running in browser. Using in-app notifications only.');
      pushInitialized = true;
      return;
    }

    // Delay push init to prevent crashes from blocking the login flow.
    // Even if push registration crashes the native layer, the user
    // will have already seen the dashboard.
    setTimeout(() => {
      initCapacitorPush().catch(err => {
        console.warn('[Push] Init failed (non-fatal):', err?.message || err);
      });
    }, 3000);

    pushInitialized = true;
  } catch (err) {
    console.warn('[Push] Init failed:', err);
    pushInitialized = true; // Don't retry endlessly
  }
}

async function initCapacitorPush() {
  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  } catch (importErr) {
    console.warn('[Push] Plugin not available:', importErr?.message);
    return;
  }

  // Step 1: Check permission
  let permStatus;
  try {
    permStatus = await PushNotifications.checkPermissions();
  } catch (e) {
    console.warn('[Push] checkPermissions failed:', e?.message);
    return;
  }

  // Step 2: Request permission if needed
  if (permStatus.receive === 'prompt') {
    try {
      permStatus = await PushNotifications.requestPermissions();
    } catch (e) {
      console.warn('[Push] requestPermissions failed:', e?.message);
      return;
    }
  }

  if (permStatus.receive !== 'granted') {
    console.log('[Push] Permission not granted');
    return;
  }

  // Step 3: Register — this is the call most likely to crash natively
  // if Firebase isn't configured. We wrap it but native crashes bypass JS.
  try {
    await PushNotifications.register();
  } catch (e) {
    console.warn('[Push] register() failed:', e?.message);
    return;
  }

  // Step 4: Add listeners (safe — these just register JS callbacks)
  try {
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] Token received');
      const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android';
      try {
        await api.post('/devices/register', { token: token.value, platform });
      } catch (err) {
        console.warn('[Push] Backend token save failed:', err?.message);
      }
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Push] Registration error:', err?.error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Foreground:', notification.title);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data;
      if (data?.type === 'long_shift_nudge') {
        window.location.href = '/heva-ops/clock';
      }
    });
  } catch (e) {
    console.warn('[Push] Listener setup failed:', e?.message);
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
