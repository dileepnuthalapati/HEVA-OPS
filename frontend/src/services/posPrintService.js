/**
 * POS Print Service
 * ─────────────────
 * Runtime printing for the checkout lifecycle.
 *
 * Architecture:
 *   1. Print jobs enter a queue, persisted to localStorage so they survive
 *      page reloads / app restarts.
 *   2. A single worker drains the queue. Each job is retried up to MAX_ATTEMPTS
 *      times with exponential backoff: 2s, 5s, 15s, 30s, 60s.
 *   3. When a job fails its final attempt, an "offline" banner is shown to the
 *      user. The banner stays until manually dismissed OR the next print
 *      succeeds.
 *   4. Document type (kitchen / receipt / void / report) determines which
 *      printer(s) the job is dispatched to. Multiple printers per type
 *      supported via the per-printer `routes` array.
 *
 * Public surface (unchanged for callers):
 *   • checkDefaultPrinterStatus()
 *   • printKitchenTicket / printKitchenDelta / printCustomerReceipt   ← auto path
 *   • reprintKitchenTicket / manualPrintCustomerReceipt               ← manual path
 *   • subscribePrinterStatus(cb)         ← banner subscribes to status updates
 *   • dismissPrinterAlert()              ← banner X button calls this
 */

import { printerAPI, getAuthToken } from './api';
import printerService from './printer';
import api from './api';
import {
  generateKitchenReceipt,
  generateCustomerReceipt,
  generateDeltaKitchenReceipt,
} from './receiptGenerator';

// ────────────────────────────────────────────────────────────────────
// Tunables
// ────────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];
const QUEUE_STORAGE_KEY = 'heva_print_queue_v1';
const SAFETY_TIMEOUT_MS = 15000;  // hard cap on a single send

// ────────────────────────────────────────────────────────────────────
// Status pub/sub — banner subscribes here
// Shape: { online: bool, lastError: string | null, queuedJobs: number }
// ────────────────────────────────────────────────────────────────────
const _statusSubs = new Set();
let _status = { online: true, lastError: null, queuedJobs: 0, dismissedUntil: 0 };

function _notifyStatus() {
  for (const cb of _statusSubs) {
    try { cb(_status); } catch (e) { console.warn('[Print] status sub failed:', e); }
  }
}

export function subscribePrinterStatus(cb) {
  _statusSubs.add(cb);
  // fire immediately so the banner can render the current state
  try { cb(_status); } catch {}
  return () => _statusSubs.delete(cb);
}

export function dismissPrinterAlert() {
  // Hide the banner for 5 minutes so the user can keep working without it
  // popping back instantly on the next failure. Reset on first success.
  _status = { ..._status, dismissedUntil: Date.now() + 5 * 60 * 1000 };
  _notifyStatus();
}

function _markOnline() {
  if (!_status.online || _status.lastError) {
    _status = { ..._status, online: true, lastError: null, dismissedUntil: 0 };
    _notifyStatus();
  }
}

function _markOffline(err) {
  _status = { ..._status, online: false, lastError: err };
  _notifyStatus();
}

// ────────────────────────────────────────────────────────────────────
// Queue persistence
// ────────────────────────────────────────────────────────────────────
function _loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function _saveQueue(q) {
  try { localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(q)); } catch {}
  _status = { ..._status, queuedJobs: q.length };
  _notifyStatus();
}

// ────────────────────────────────────────────────────────────────────
// Reachability check (used by the status indicator)
// ────────────────────────────────────────────────────────────────────
export async function checkDefaultPrinterStatus() {
  try {
    const printer = await printerAPI.getDefault();
    if (!printer) return { status: 'none', name: null, paperWidth: 80 };

    const name = printer.name;
    const paperWidth = printer.paper_width || 80;

    if (printer.type !== 'wifi') {
      return { status: 'online', name, paperWidth };
    }

    const [ip, portStr] = (printer.address || '').split(':');
    const port = parseInt(portStr, 10) || 9100;
    const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

    if (isNative) {
      try {
        const reachable = await printerService.checkPrinterReachable(ip, port);
        return { status: reachable ? 'online' : 'offline', name, paperWidth };
      } catch {
        return { status: 'offline', name, paperWidth };
      }
    }

    try {
      const apiUrl = process.env.REACT_APP_BACKEND_URL;
      const token = getAuthToken();
      const res = await fetch(`${apiUrl}/api/printer/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ip, port }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return { status: data.reachable ? 'online' : 'offline', name, paperWidth };
    } catch {
      return { status: 'unknown', name, paperWidth };
    }
  } catch {
    return { status: 'unknown', name: null, paperWidth: 80 };
  }
}

// ────────────────────────────────────────────────────────────────────
// Low-level send (one attempt, no retry, no queue)
// ────────────────────────────────────────────────────────────────────
async function _sendOnce(printer, escposCommands) {
  if (!printer) throw new Error('No printer configured');
  if (!escposCommands) throw new Error('No print data');
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const token = getAuthToken();
  const sendPromise = printerService.printToDevice(printer, escposCommands, apiUrl, token);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Printer send timed out')), SAFETY_TIMEOUT_MS)
  );
  return Promise.race([sendPromise, timeoutPromise]);
}

// ────────────────────────────────────────────────────────────────────
// Resolve target printers for a document type
// ────────────────────────────────────────────────────────────────────
async function _resolveTargets(route) {
  try {
    const res = await api.get(`/printers/by-route/${route}`);
    const list = res.data || [];
    if (list.length > 0) return list;
  } catch {}
  // Final fallback — the legacy default printer
  const def = await printerAPI.getDefault().catch(() => null);
  return def ? [def] : [];
}

// ────────────────────────────────────────────────────────────────────
// Queue worker
// ────────────────────────────────────────────────────────────────────
let _workerRunning = false;

async function _runWorker() {
  if (_workerRunning) return;
  _workerRunning = true;
  try {
    let queue = _loadQueue();
    while (queue.length > 0) {
      const job = queue[0];
      const printers = await _resolveTargets(job.route);
      if (printers.length === 0) {
        // No printer configured at all — drop the job, surface offline
        _markOffline('No printer configured for ' + job.route);
        queue.shift(); _saveQueue(queue);
        continue;
      }

      let allOk = true;
      let lastError = null;
      for (const p of printers) {
        try {
          await _sendOnce(p, job.commands);
        } catch (e) {
          allOk = false;
          lastError = e?.message || String(e);
          break;
        }
      }

      if (allOk) {
        _markOnline();
        queue.shift(); _saveQueue(queue);
        continue;
      }

      // Failed this attempt
      job.attempts = (job.attempts || 0) + 1;
      job.lastError = lastError;
      if (job.attempts >= MAX_ATTEMPTS) {
        _markOffline(`${job.label || job.route} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
        queue.shift(); _saveQueue(queue);
        continue;
      }

      const wait = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)];
      console.warn(`[Print] Attempt ${job.attempts}/${MAX_ATTEMPTS} failed for ${job.label}: ${lastError}. Retrying in ${wait/1000}s`);
      _markOffline(`Retrying ${job.label}… attempt ${job.attempts}/${MAX_ATTEMPTS}`);
      _saveQueue(queue);
      await new Promise(r => setTimeout(r, wait));
      queue = _loadQueue();  // re-read in case other tabs queued more jobs
    }
  } finally {
    _workerRunning = false;
  }
}

function _enqueue(job) {
  const queue = _loadQueue();
  queue.push({ ...job, attempts: 0, queuedAt: Date.now() });
  _saveQueue(queue);
  _runWorker();
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
function buildTableInfo(order, tables) {
  if (!order?.table_id) return null;
  const table = (tables || []).find(t => t.id === order.table_id);
  if (!table) return null;
  return { number: table.number, name: table.name || `Table ${table.number}` };
}

// ────────────────────────────────────────────────────────────────────
// Public API — these mirror the old surface so callers don't change
// All operations enqueue and return immediately; failures show up via the
// banner subscription, NOT as a thrown error.
// ────────────────────────────────────────────────────────────────────

/** Send raw commands to the default printer (used by ad-hoc callers).
 * Kept synchronous-style (awaits the first attempt) for backward compatibility.
 * Returns { ok, error?, skipped? } so existing toast logic keeps working.
 */
export async function sendToDefaultPrinter(escposCommands, label = 'receipt') {
  try {
    const printer = await printerAPI.getDefault();
    if (!printer) return { ok: false, skipped: true, error: 'no_default_printer' };
    await _sendOnce(printer, escposCommands);
    _markOnline();
    return { ok: true };
  } catch (err) {
    const msg = err?.message || String(err);
    // Enqueue for retry in the background — banner will surface progress
    _enqueue({ route: 'receipt', commands: escposCommands, label });
    _markOffline(msg);
    return { ok: false, error: msg };
  }
}

/** Auto-print kitchen ticket (gated by print_kitchen_slip setting). */
export async function printKitchenTicket({ order, tables, businessInfo, paperWidth, settings, label = 'kitchen-auto' }) {
  if (!settings?.print_kitchen_slip) return { ok: false, skipped: true };
  const tableInfo = buildTableInfo(order, tables);
  const commands = generateKitchenReceipt(order, businessInfo || {}, tableInfo, paperWidth || 80);
  _enqueue({ route: 'kitchen', commands, label });
  return { ok: true, queued: true };
}

/** Delta print — only NEW items on an edited order. Gated. */
export async function printKitchenDelta({ order, cartItems, tables, businessInfo, paperWidth, settings }) {
  if (!settings?.print_kitchen_slip) return { ok: false, skipped: true };
  const tableInfo = buildTableInfo(order, tables);
  const deltaOrder = { ...order, items: cartItems };
  const commands = generateDeltaKitchenReceipt(deltaOrder, businessInfo || {}, tableInfo, paperWidth || 80);
  if (!commands) return { ok: false, skipped: true, error: 'no_delta_items' };
  _enqueue({ route: 'kitchen', commands, label: 'kitchen-delta' });
  return { ok: true, queued: true };
}

/** Auto-print customer receipt after payment. Gated. */
export async function printCustomerReceipt({ order, tables, businessInfo, currency, paperWidth, settings }) {
  if (!settings?.print_customer_receipt) return { ok: false, skipped: true };
  const tableInfo = buildTableInfo(order, tables);
  const commands = generateCustomerReceipt(order, businessInfo || {}, tableInfo, currency || 'GBP', paperWidth || 80);
  _enqueue({ route: 'receipt', commands, label: 'customer-auto' });
  return { ok: true, queued: true };
}

/** Manual kitchen reprint (button on Orders list). Bypasses the gate. */
export async function reprintKitchenTicket({ order, tables, businessInfo, paperWidth }) {
  const tableInfo = buildTableInfo(order, tables);
  const commands = generateKitchenReceipt(order, businessInfo || {}, tableInfo, paperWidth || 80);
  // For manual actions we attempt once synchronously so the UI can show
  // the immediate result; the queue handles retries if it fails.
  const printers = await _resolveTargets('kitchen');
  if (printers.length === 0) {
    _enqueue({ route: 'kitchen', commands, label: 'kitchen-manual' });
    return { ok: false, queued: true, error: 'no_printer_configured' };
  }
  try {
    for (const p of printers) await _sendOnce(p, commands);
    _markOnline();
    return { ok: true };
  } catch (err) {
    _enqueue({ route: 'kitchen', commands, label: 'kitchen-manual-retry' });
    _markOffline(err?.message || String(err));
    return { ok: false, error: err?.message || 'print_failed', queued: true };
  }
}

/** Manual customer receipt print (button on Orders list + POS). Bypasses gate. */
export async function manualPrintCustomerReceipt({ order, tables, businessInfo, currency, paperWidth }) {
  const tableInfo = buildTableInfo(order, tables);
  const commands = generateCustomerReceipt(order, businessInfo || {}, tableInfo, currency || 'GBP', paperWidth || 80);
  const printers = await _resolveTargets('receipt');
  if (printers.length === 0) {
    _enqueue({ route: 'receipt', commands, label: 'customer-manual' });
    return { ok: false, queued: true, error: 'no_printer_configured' };
  }
  try {
    for (const p of printers) await _sendOnce(p, commands);
    _markOnline();
    return { ok: true };
  } catch (err) {
    _enqueue({ route: 'receipt', commands, label: 'customer-manual-retry' });
    _markOffline(err?.message || String(err));
    return { ok: false, error: err?.message || 'print_failed', queued: true };
  }
}

// Kick the worker on load in case there are leftover jobs from a previous session.
if (typeof window !== 'undefined') {
  setTimeout(() => { _runWorker(); }, 1500);
}

export default {
  checkDefaultPrinterStatus,
  sendToDefaultPrinter,
  printKitchenTicket,
  printKitchenDelta,
  printCustomerReceipt,
  reprintKitchenTicket,
  manualPrintCustomerReceipt,
  subscribePrinterStatus,
  dismissPrinterAlert,
};
