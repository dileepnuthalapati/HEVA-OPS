import React, { useEffect, useState } from 'react';
import { Download, X, Share, Plus, CheckCircle2, Chrome } from 'lucide-react';

/**
 * InstallAppButton — PWA install entry-point.
 *
 * Three rendering modes:
 *   1. Chromium (Chrome / Edge / Brave / Samsung Internet)
 *      → listens for beforeinstallprompt and renders a working button
 *   2. Safari on iOS
 *      → renders a help button that opens a modal with "Share → Add to
 *        Home Screen" step-by-step instructions
 *   3. Safari on macOS 17+
 *      → renders a help button with "File → Add to Dock" instructions
 *
 * Automatically hides when:
 *   • Running inside Capacitor APK (already a native app)
 *   • Already installed (display-mode: standalone)
 */

function detectBrowser() {
  if (typeof window === 'undefined') return {};
  const ua = window.navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  const isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
  return { isIOS, isSafari, isMac };
}

export default function InstallAppButton({ variant = 'default', className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showSafariHelp, setShowSafariHelp] = useState(false);
  const { isIOS, isSafari, isMac } = detectBrowser();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.Capacitor?.isNativePlatform?.()) {
      setInstalled(true);
      return;
    }
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
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

  if (installed) return null;

  const handleChromiumInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  // Decide which button style to render
  const showNativePrompt = !!deferredPrompt;
  const showSafariBtn = !showNativePrompt && (isIOS || (isSafari && isMac));

  if (!showNativePrompt && !showSafariBtn) {
    // Chrome/Edge before prompt has fired — or unsupported browser. Stay quiet.
    return null;
  }

  const baseCls =
    variant === 'compact'
      ? 'inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition cursor-pointer'
      : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700 shadow-sm transition';

  return (
    <>
      <button
        type="button"
        onClick={showNativePrompt ? handleChromiumInstall : () => setShowSafariHelp(true)}
        className={`${baseCls} ${className}`}
        data-testid="install-app-btn"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install as app</span>
        {variant !== 'compact' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-1" />}
      </button>

      {showSafariHelp && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowSafariHelp(false)}
          data-testid="safari-install-modal"
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSafariHelp(false)}
              className="absolute top-3 right-3 p-1 rounded-md text-slate-400 hover:text-slate-600"
              data-testid="safari-install-close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center mb-4">
              <div className="inline-flex w-14 h-14 rounded-xl bg-indigo-100 items-center justify-center mb-3">
                <Download className="w-7 h-7 text-indigo-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Install Heva ONE</h2>
              <p className="text-xs text-slate-500 mt-1">
                {isIOS ? 'Add Heva ONE to your home screen' : 'Add Heva ONE to your Dock'}
              </p>
            </div>

            {isIOS ? (
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
                  <div className="text-sm text-slate-700 flex items-center gap-1 flex-wrap">
                    Tap the <Share className="w-4 h-4 inline text-indigo-600" /> <strong>Share</strong> button at the bottom of Safari
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
                  <div className="text-sm text-slate-700 flex items-center gap-1 flex-wrap">
                    Scroll and tap <Plus className="w-4 h-4 inline text-indigo-600" /> <strong>"Add to Home Screen"</strong>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
                  <div className="text-sm text-slate-700">Tap <strong>"Add"</strong> — Heva ONE will appear on your home screen</div>
                </li>
              </ol>
            ) : (
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
                  <div className="text-sm text-slate-700">Click <strong>File</strong> in the Safari menu bar</div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
                  <div className="text-sm text-slate-700">Select <strong>"Add to Dock…"</strong></div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
                  <div className="text-sm text-slate-700">Click <strong>Add</strong> — Heva ONE will open as a dedicated app</div>
                </li>
              </ol>
            )}

            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Chrome className="w-3 h-3" />
                Tip: for a faster install, open this site in Chrome or Edge.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
