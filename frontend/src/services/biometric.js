/**
 * Biometric authentication utility for Heva One.
 * Uses @aparajita/capacitor-biometric-auth on native Capacitor devices.
 * Gracefully falls back to true (allowed) on web browsers.
 */

// Check if biometric auth is available on this device
export async function isBiometricAvailable() {
  try {
    if (window.Capacitor?.isNativePlatform()) {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      const result = await BiometricAuth.checkBiometry();
      return result.isAvailable;
    }
    return false;
  } catch {
    return false;
  }
}

// Prompt biometric authentication
// Returns true if verified, false if failed/cancelled
export async function requestBiometric(reason = 'Verify your identity to clock in') {
  try {
    if (window.Capacitor?.isNativePlatform()) {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      const check = await BiometricAuth.checkBiometry();
      if (!check.isAvailable) {
        // Device doesn't support biometrics — allow through
        return true;
      }
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: 'Cancel',
        allowDeviceCredential: true,
      });
      return true;
    }
    // Web: skip biometric (not supported)
    return true;
  } catch (err) {
    console.warn('Biometric auth failed:', err.message || err);
    return false;
  }
}
