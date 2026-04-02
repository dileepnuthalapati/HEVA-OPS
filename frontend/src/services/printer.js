/**
 * HevaPOS Universal Thermal Printer Service
 * 
 * 1. Bluetooth Classic (SPP) — @kduma-autoid/capacitor-bluetooth-printer
 *    Most thermal receipt printers (Epson, Star, Bixolon, generic etc.)
 *    Requires printer to be PAIRED in Android Bluetooth settings first.
 *
 * 2. Bluetooth Low Energy (BLE) — @capacitor-community/bluetooth-le
 *    Fallback for BLE-only printers.
 *
 * 3. WiFi/Network — Backend TCP proxy (/api/printer/send)
 */

import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import { BluetoothPrinter } from '@kduma-autoid/capacitor-bluetooth-printer';
import { Capacitor } from '@capacitor/core';

// BLE printer UUIDs (for BLE-only printers)
const BLE_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];
const BLE_WRITE_UUIDS = [
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '00002af1-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
];

// ===== Utilities =====

function base64ToRawString(base64) {
  return atob(base64);
}

function base64ToBytes(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

// ===== Printer Service =====

class ThermalPrinterService {
  constructor() {
    this.bleDeviceId = null;
    this.bleServiceUUID = null;
    this.bleCharUUID = null;
    this.isNative = Capacitor.isNativePlatform();
    this.bleInitialized = false;
  }

  async initBLE() {
    if (this.bleInitialized) return;
    if (this.isNative) {
      try {
        await BleClient.initialize({ androidNeverForLocation: true });
        this.bleInitialized = true;
      } catch (error) {
        console.warn('[Printer] BLE init failed:', error.message);
      }
    } else {
      this.bleInitialized = true;
    }
  }

  // ================================================================
  // MAIN PRINT METHOD
  // ================================================================
  async printToDevice(printer, escposBase64, apiUrl, authToken) {
    if (!printer) throw new Error('No printer configured. Go to Settings > Printers to add one.');
    if (!escposBase64) throw new Error('No print data generated.');

    const byteCount = base64ToBytes(escposBase64).length;
    console.log(`[Printer] Sending ${byteCount} bytes to "${printer.name}" (${printer.type}) at ${printer.address}`);

    if (printer.type === 'wifi') {
      return this._printWifi(printer, escposBase64, apiUrl, authToken);
    } else if (printer.type === 'bluetooth') {
      return this._printBluetooth(printer, escposBase64);
    } else {
      throw new Error(`Unknown printer type: ${printer.type}`);
    }
  }

  // ===== WiFi: Backend TCP proxy =====
  async _printWifi(printer, base64Data, apiUrl, authToken) {
    const parts = printer.address.split(':');
    const ip = parts[0];
    const port = parseInt(parts[1]) || 9100;

    const response = await fetch(`${apiUrl}/api/printer/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ ip, port, data: base64Data }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `WiFi print failed (HTTP ${response.status})`);
    }

    console.log('[Printer] WiFi print sent');
    return await response.json();
  }

  // ===== Bluetooth: Classic SPP first, BLE fallback =====
  async _printBluetooth(printer, escposBase64) {
    if (!this.isNative) {
      return this._printWebBluetooth(base64ToBytes(escposBase64));
    }

    // Step 1: Try Bluetooth Classic (SPP) — works for most thermal printers
    const sppResult = await this._tryClassicSPP(printer.address, escposBase64);
    if (sppResult.success) {
      return sppResult;
    }

    // Step 2: Try BLE fallback (only for BLE-capable printers)
    console.log(`[Printer] Classic SPP: ${sppResult.error}. Trying BLE...`);
    try {
      await this._printViaBLE(printer.address, base64ToBytes(escposBase64));
      return { success: true, method: 'ble', message: `Printed via BLE to ${printer.name}` };
    } catch (bleError) {
      throw new Error(
        `Could not print to ${printer.name}.\n\n` +
        `Classic Bluetooth: ${sppResult.error}\n` +
        `BLE: ${bleError.message}\n\n` +
        'Tips:\n' +
        '1. Make sure the printer is paired in Android Bluetooth Settings\n' +
        '2. Turn the printer off and on, then try again\n' +
        '3. Remove and re-pair the printer in Android Settings'
      );
    }
  }

  // Classic SPP print
  async _tryClassicSPP(address, escposBase64) {
    try {
      // Convert base64 ESC/POS to raw string for the SPP plugin
      const rawData = base64ToRawString(escposBase64);

      await BluetoothPrinter.connectAndPrint({
        address: address,
        data: rawData,
      });

      console.log(`[Printer] Classic SPP print sent to ${address}`);
      return { success: true, method: 'classic-spp', message: 'Printed via Bluetooth' };
    } catch (error) {
      const msg = error.message || String(error);
      console.warn(`[Printer] Classic SPP failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // BLE print
  async _printViaBLE(deviceId, bytes) {
    await this.initBLE();

    if (this.bleDeviceId && this.bleDeviceId !== deviceId) {
      try { await BleClient.disconnect(this.bleDeviceId); } catch {}
      this.bleDeviceId = null;
    }

    if (this.bleDeviceId !== deviceId) {
      await this._connectBLE(deviceId);
    }

    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
      const dataView = numbersToDataView(Array.from(chunk));
      await BleClient.write(this.bleDeviceId, this.bleServiceUUID, this.bleCharUUID, dataView);
      if (offset + CHUNK_SIZE < bytes.length) {
        await new Promise(r => setTimeout(r, 30));
      }
    }
    console.log(`[Printer] BLE sent ${bytes.length} bytes`);
  }

  async _connectBLE(deviceId) {
    await BleClient.connect(deviceId, (id) => {
      if (this.bleDeviceId === id) {
        this.bleDeviceId = null;
        this.bleServiceUUID = null;
        this.bleCharUUID = null;
      }
    });

    const services = await BleClient.getServices(deviceId);
    let foundService = null;
    let foundChar = null;

    for (const svc of services) {
      for (const ch of svc.characteristics) {
        if (!(ch.properties?.write || ch.properties?.writeWithoutResponse)) continue;
        const isKnown = BLE_SERVICE_UUIDS.includes(svc.uuid.toLowerCase()) ||
                        BLE_WRITE_UUIDS.includes(ch.uuid.toLowerCase());
        if (isKnown) { foundService = svc.uuid; foundChar = ch.uuid; break; }
        if (!foundService) { foundService = svc.uuid; foundChar = ch.uuid; }
      }
      if (foundChar && BLE_SERVICE_UUIDS.includes(svc.uuid?.toLowerCase())) break;
    }

    if (!foundService || !foundChar) {
      await BleClient.disconnect(deviceId);
      throw new Error('No writable BLE service found.');
    }

    this.bleDeviceId = deviceId;
    this.bleServiceUUID = foundService;
    this.bleCharUUID = foundChar;
  }

  // Web Bluetooth fallback (Chrome)
  async _printWebBluetooth(bytes) {
    if (!navigator.bluetooth) {
      throw new Error('Bluetooth not available in browser. Use the HevaPOS Android app.');
    }

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICE_UUIDS,
    });
    if (!device) throw new Error('No device selected');

    const server = await device.gatt.connect();
    let characteristic = null;

    for (const svcUUID of BLE_SERVICE_UUIDS) {
      try {
        const svc = await server.getPrimaryService(svcUUID);
        for (const charUUID of BLE_WRITE_UUIDS) {
          try { characteristic = await svc.getCharacteristic(charUUID); break; } catch {}
        }
        if (characteristic) break;
      } catch {}
    }

    if (!characteristic) {
      const svcs = await server.getPrimaryServices();
      for (const svc of svcs) {
        const chars = await svc.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) {
            characteristic = ch; break;
          }
        }
        if (characteristic) break;
      }
    }

    if (!characteristic) { server.disconnect(); throw new Error('No writable characteristic.'); }

    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
      await characteristic.writeValue(chunk);
      if (offset + CHUNK_SIZE < bytes.length) await new Promise(r => setTimeout(r, 30));
    }

    server.disconnect();
    return { success: true, method: 'web-bluetooth' };
  }

  // ================================================================
  // DISCOVERY
  // ================================================================

  /**
   * Get paired Bluetooth devices from Android settings.
   * This is the PRIMARY discovery method — shows devices the user already paired.
   */
  async listPairedDevices() {
    if (!this.isNative) return [];
    try {
      const result = await BluetoothPrinter.list();
      return result.devices || [];
    } catch (error) {
      console.warn('[Printer] Paired device list failed:', error.message);
      return [];
    }
  }

  /**
   * BLE scan for nearby devices (secondary — finds BLE-only printers).
   */
  async scanBLEDevices(onDeviceFound, durationMs = 10000) {
    await this.initBLE();
    if (!this.isNative) throw new Error('BLE scanning requires the HevaPOS Android app.');

    const isEnabled = await BleClient.isEnabled();
    if (!isEnabled) {
      try { await BleClient.requestEnable(); } catch {
        throw new Error('Please enable Bluetooth.');
      }
    }

    const seen = new Set();
    await BleClient.requestLEScan({ services: [], allowDuplicates: false }, (result) => {
      const id = result.device.deviceId;
      // Only report devices that have a name (skip unknown/unnamed devices)
      if (!seen.has(id) && result.device.name) {
        seen.add(id);
        onDeviceFound({
          deviceId: id,
          name: result.device.name,
          rssi: result.rssi,
        });
      }
    });

    await new Promise(resolve => setTimeout(resolve, durationMs));
    await BleClient.stopLEScan();
  }

  // ================================================================
  // Disconnect
  // ================================================================
  async disconnect() {
    try { await BluetoothPrinter.disconnect(); } catch {}
    try { if (this.bleDeviceId) await BleClient.disconnect(this.bleDeviceId); } catch {}
    this.bleDeviceId = null;
    this.bleServiceUUID = null;
    this.bleCharUUID = null;
  }
}

const printerService = new ThermalPrinterService();
export default printerService;
export { base64ToBytes, base64ToRawString };
