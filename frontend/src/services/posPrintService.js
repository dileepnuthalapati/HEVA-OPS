/**
 * POS Print Service
 * ─────────────────
 * Runtime printing helpers used during the checkout lifecycle.
 * Centralises the "what to print, when, to which printer" logic that used
 * to live inline in POSScreen.js.
 *
 * This is NOT printer configuration — that lives in /pages/PrinterSettings.js.
 * This is NOT ESC/POS formatting — that lives in /services/receiptGenerator.js.
 *
 * Responsibilities:
 *   • Resolve the default printer for the active restaurant
 *   • Probe reachability (native TCP or backend fallback)
 *   • Serialise concurrent print jobs (prevents double-prints)
 *   • Build kitchen / customer / delta receipt commands and dispatch them
 */

import { printerAPI, getAuthToken } from './api';
import printerService from './printer';
import {
  generateKitchenReceipt,
  generateCustomerReceipt,
  generateDeltaKitchenReceipt,
} from './receiptGenerator';

// ────────────────────────────────────────────────────────────────────
// Simple in-flight lock — prevents duplicate sends within 10s safety window
// ────────────────────────────────────────────────────────────────────
let _inFlight = false;
let _safetyTimer = null;
const _clearLock = () => {
  _inFlight = false;
  if (_safetyTimer) clearTimeout(_safetyTimer);
  _safetyTimer = null;
};

/**
 * Check the default printer's reachability.
 * Returns { status: 'online' | 'offline' | 'none' | 'unknown', name, paperWidth }
 */
export async function checkDefaultPrinterStatus() {
  try {
    const printer = await printerAPI.getDefault();
    if (!printer) return { status: 'none', name: null, paperWidth: 80 };

    const name = printer.name;
    const paperWidth = printer.paper_width || 80;

    if (printer.type !== 'wifi') {
      // Bluetooth / USB — can't reliably ping, treat as configured
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

    // Browser fallback — backend probe (works in preview, not production behind NAT)
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

/**
 * Low-level: send raw ESC/POS commands to the default printer.
 * Handles concurrency lock and safety timeout.
 *
 * Returns { ok: boolean, skipped?: boolean, error?: string }.
 * Does NOT surface toasts — callers decide how to communicate failures.
 */
export async function sendToDefaultPrinter(escposCommands, label = 'receipt') {
  if (_inFlight) {
    return { ok: false, skipped: true, error: 'print_in_progress' };
  }
  _inFlight = true;
  _safetyTimer = setTimeout(_clearLock, 10000);

  try {
    const printer = await printerAPI.getDefault();
    if (!printer) {
      return { ok: false, skipped: true, error: 'no_default_printer' };
    }
    const apiUrl = process.env.REACT_APP_BACKEND_URL;
    const token = getAuthToken();
    await printerService.printToDevice(printer, escposCommands, apiUrl, token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'print_failed' };
  } finally {
    _clearLock();
  }
}

/**
 * Build table info block for receipt generators.
 */
function buildTableInfo(order, tables) {
  if (!order?.table_id) return null;
  const table = tables.find(t => t.id === order.table_id);
  if (!table) return null;
  return { number: table.number, name: table.name || `Table ${table.number}` };
}

// ────────────────────────────────────────────────────────────────────
// High-level print actions
// ────────────────────────────────────────────────────────────────────

/**
 * Print a full kitchen ticket for a fresh order (runs in background).
 * Settings gate: print_kitchen_slip.
 */
export async function printKitchenTicket({ order, tables, businessInfo, paperWidth, settings, label = 'kitchen-auto' }) {
  if (!settings?.print_kitchen_slip) return { ok: false, skipped: true };
  const tableInfo = buildTableInfo(order, tables || []);
  const commands = generateKitchenReceipt(order, businessInfo || {}, tableInfo, paperWidth || 80);
  return sendToDefaultPrinter(commands, label);
}

/**
 * Print only the NEW items (delta) on an edited order.
 * Settings gate: print_kitchen_slip.
 */
export async function printKitchenDelta({ order, cartItems, tables, businessInfo, paperWidth, settings }) {
  if (!settings?.print_kitchen_slip) return { ok: false, skipped: true };
  const tableInfo = buildTableInfo(order, tables || []);
  const deltaOrder = { ...order, items: cartItems };
  const commands = generateDeltaKitchenReceipt(deltaOrder, businessInfo || {}, tableInfo, paperWidth || 80);
  if (!commands) return { ok: false, skipped: true, error: 'no_delta_items' };
  return sendToDefaultPrinter(commands, 'kitchen-delta');
}

/**
 * Print a customer receipt after payment.
 * Settings gate: print_customer_receipt.
 */
export async function printCustomerReceipt({ order, tables, businessInfo, currency, paperWidth, settings }) {
  if (!settings?.print_customer_receipt) return { ok: false, skipped: true };
  const tableInfo = buildTableInfo(order, tables || []);
  const commands = generateCustomerReceipt(order, businessInfo || {}, tableInfo, currency || 'GBP', paperWidth || 80);
  return sendToDefaultPrinter(commands, 'customer-auto');
}

/**
 * Re-print the kitchen ticket of an existing order (manual action from Orders list).
 * Always prints regardless of settings flag (explicit user action).
 */
export async function reprintKitchenTicket({ order, tables, businessInfo, paperWidth }) {
  const tableInfo = buildTableInfo(order, tables || []);
  const commands = generateKitchenReceipt(order, businessInfo || {}, tableInfo, paperWidth || 80);
  return sendToDefaultPrinter(commands, 'kitchen-manual');
}

export default {
  checkDefaultPrinterStatus,
  sendToDefaultPrinter,
  printKitchenTicket,
  printKitchenDelta,
  printCustomerReceipt,
  reprintKitchenTicket,
};
