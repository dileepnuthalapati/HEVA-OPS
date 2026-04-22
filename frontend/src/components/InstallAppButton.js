import React, { useEffect, useState } from 'react';
import { Download, X, Share, Plus, CheckCircle2, Chrome, MoreVertical } from 'lucide-react';

/**
 * InstallAppButton — PWA install entry-point.
 *
 * Strategy: ALWAYS show the button unless we know for certain the app
 * is already installed (or we're inside Capacitor). Clicking it always
 * does something useful:
 *   • Chromium with deferredPrompt ready → native install prompt
 *   • Chromium without deferredPrompt yet → modal with "⋮ menu → Install app" steps
 *   • Safari on iOS → modal with "Share → Add to Home Screen" steps
 *   • Safari on macOS → modal with "File → Add to Dock…" steps
 *   • Other browsers (Firefox etc.) → modal explaining they can bookmark / pin
 */

function detectBrowser() {
  if (typeof window === 'undefined') return {};
  const ua = window.navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android|crios|fxios|edgios|opr\/|edg\/).)*safari/i.test(ua);
  const isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
  const isChromium = /Chrome|Edg|OPR/.test(ua) && !isIOS;
  return { isIOS, isSafari, isMac, isChromium };
}

export default function InstallAppButton({ variant = 'default', className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { isIOS, isSafari, isMac, isChromium } = detectBrowser();

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

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null);
    } else {
      setShowHelp(true);
    }
  };

  const baseCls =
    variant === 'compact'
      ? 'inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition cursor-pointer'
      : variant === 'sidebar'
      ? 'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[11px] font-medium text-indigo-300 hover:text-indigo-200 hover:bg-slate-700/40 transition cursor-pointer'
      : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700 shadow-sm transition';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${baseCls} ${className}`}
        data-testid="install-app-btn"
      >
        <Download className={variant === 'sidebar' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>{variant === 'sidebar' ? 'Install app' : 'Install as app'}</span>
        {variant === 'default' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-1" />}
      </button>

      {showHelp && (
        <div
          className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowHelp(false)}
          data-testid="install-help-modal"
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-3 right-3 p-1 rounded-md text-slate-400 hover:text-slate-600"
              data-testid="install-help-close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center mb-4">
              <div className="inline-flex w-14 h-14 rounded-xl bg-indigo-100 items-center justify-center mb-3">
                <Download className="w-7 h-7 text-indigo-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Install Heva ONE</h2>
              <p className="text-xs text-slate-500 mt-1">
                {isIOS
                  ? 'Add Heva ONE to your home screen'
                  : isMac && isSafari
                  ? 'Add Heva ONE to your Dock'
                  : 'Install Heva ONE on this device'}
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
            ) : isMac && isSafari ? (
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
            ) : isChromium ? (
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
                  <div className="text-sm text-slate-700 flex items-center gap-1 flex-wrap">
                    Click the <MoreVertical className="w-4 h-4 inline text-indigo-600" /> <strong>menu</strong> at the top-right of the browser
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
                  <div className="text-sm text-slate-700">Choose <strong>"Install Heva ONE…"</strong> (or Cast → Install)</div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
                  <div className="text-sm text-slate-700">Click <strong>Install</strong> — Heva ONE opens as its own window with its own icon</div>
                </li>
                <li className="text-[11px] text-slate-400 mt-2">
                  Don't see the install option? Use Heva ONE for 30 seconds — Chrome unlocks "Install" after some engagement.
                </li>
              </ol>
            ) : (
              <div className="text-sm text-slate-700 space-y-2">
                <p>Your browser doesn't support one-click install. You can:</p>
                <ul className="list-disc ml-5 space-y-1 text-xs">
                  <li>Bookmark this page (Ctrl/Cmd + D)</li>
                  <li>Pin to taskbar / add to home screen via browser menu</li>
                  <li>Open this site in Chrome or Edge for a native install button</li>
                </ul>
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Chrome className="w-3 h-3" />
                Tip: Chrome / Edge offer the smoothest install experience.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
