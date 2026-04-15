/**
 * Biometric authentication utility for Heva One.
 * Uses Capacitor BiometricAuth plugin on native devices.
 * Gracefully falls back to true (allowed) on web browsers.
 */

// Check if biometric auth is available on this device
export async function isBiometricAvailable() {
  try {
    // Check for Capacitor native environment
    if (window.Capacitor?.isNativePlatform()) {
      const { BiometricAuth } = await import('@capacitor-community/biometric-auth');
      const result = await BiometricAuth.isAvailable();
      return result.isAvailable;
    }
    // Web fallback: not available
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
      const { BiometricAuth } = await import('@capacitor-community/biometric-auth');
      const available = await BiometricAuth.isAvailable();
      if (!available.isAvailable) {
        // Device doesn't support biometrics — allow through
        return true;
      }
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: 'Cancel',
        allowDeviceCredential: true, // Allow PIN/pattern as fallback
      });
      return true; // Auth succeeded
    }
    // Web: skip biometric (not supported)
    return true;
  } catch (err) {
    // User cancelled or auth failed
    console.warn('Biometric auth failed:', err.message || err);
    return false;
  }
}
