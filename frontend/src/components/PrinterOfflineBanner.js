import React, { useEffect, useState } from 'react';
import { AlertTriangle, X, Printer } from 'lucide-react';
import { subscribePrinterStatus, dismissPrinterAlert } from '../services/posPrintService';

/**
 * Persistent banner shown on every POS-area page when a print job fails
 * or the printer goes offline. Stays visible until the user dismisses it
 * (X) or the next print succeeds (auto-clears).
 */
export default function PrinterOfflineBanner() {
  const [status, setStatus] = useState({ online: true, lastError: null, queuedJobs: 0, dismissedUntil: 0 });

  useEffect(() => {
    const unsub = subscribePrinterStatus(setStatus);
    return unsub;
  }, []);

  const isHidden = status.online || (status.dismissedUntil && Date.now() < status.dismissedUntil);
  if (isHidden) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[60] max-w-md w-[calc(100%-2rem)] shadow-2xl"
      data-testid="printer-offline-banner"
      role="alert"
    >
      <div className="flex items-start gap-3 bg-red-600 text-white rounded-xl p-4 ring-2 ring-red-700">
        <div className="bg-red-700 rounded-lg p-2 shrink-0">
          <Printer className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p className="text-sm font-semibold">Printer offline</p>
          </div>
          <p className="text-xs text-red-100 leading-relaxed break-words">
            {status.lastError || 'Could not reach the printer.'}
            {status.queuedJobs > 0 && (
              <> {status.queuedJobs} job{status.queuedJobs === 1 ? '' : 's'} waiting in queue.</>
            )}
          </p>
          <p className="text-[11px] text-red-200 mt-1">
            Check the printer is powered on and connected to the same Wi-Fi.
          </p>
        </div>
        <button
          onClick={dismissPrinterAlert}
          className="text-red-100 hover:text-white shrink-0 p-1 rounded-md hover:bg-red-700"
          data-testid="dismiss-printer-banner"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
