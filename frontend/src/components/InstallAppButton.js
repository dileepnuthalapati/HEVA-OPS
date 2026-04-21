import React, { useEffect, useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';

/**
 * InstallAppButton
 * ────────────────
 * Listens for the `beforeinstallprompt` event fired by Chromium browsers
 * when a site meets PWA install criteria (HTTPS + manifest + service
 * worker + icons). Renders a button that triggers the install prompt
 * when clicked.
 *
 * On iOS Safari (which doesn't fire beforeinstallprompt) we show a hint
 * explaining the manual "Share → Add to Home Screen" flow.
 *
 * Hidden automatically when:
 *   - Running inside the native Capacitor APK
 *   - App is already installed (navigator.standalone or display-mode:standalone)
 */
export default function InstallAppButton({ variant = 'default', className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Hide if running inside native APK
    if (window.Capacitor?.isNativePlatform?.()) {
      setInstalled(true);
      return;
    }

    // Detect already-installed (standalone display-mode)
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    // iOS detection (Safari doesn't support beforeinstallprompt)
    const ua = window.navigator.userAgent || '';
    const iosDevice = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    setIsIOS(iosDevice);

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (installed) return null;

  // iOS manual hint
  if (isIOS && !deferredPrompt) {
    return (
      <div
        className={`text-[11px] text-slate-500 flex items-center gap-1.5 ${className}`}
        data-testid="install-hint-ios"
      >
        <Download className="w-3 h-3" />
        <span>To install: tap Share → "Add to Home Screen"</span>
      </div>
    );
  }

  // Chromium/Edge — only show when prompt is actually available
  if (!deferredPrompt) return null;

  const baseCls =
    variant === 'compact'
      ? 'inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition'
      : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700 shadow-sm transition';

  return (
    <button
      type="button"
      onClick={handleInstall}
      className={`${baseCls} ${className}`}
      data-testid="install-app-btn"
    >
      {variant === 'compact' ? (
        <>
          <Download className="w-3.5 h-3.5" />
          <span>Install as app</span>
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          <span>Install Heva One</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-1" />
        </>
      )}
    </button>
  );
}
