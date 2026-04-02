/**
 * HevaPOS Universal Thermal Printer Service
 * 
 * Supports ALL connection types for maximum compatibility:
 * 
 * 1. Bluetooth Classic (SPP) — @kduma-autoid/capacitor-bluetooth-printer
 *    Most thermal receipt printers (Epson, Star, Bixolon, generic Chinese etc.)
 *    Uses Serial Port Profile (UUID 00001101) — the standard for thermal printers.
 *    Requires printer to be PAIRED with the device first via Android Bluetooth settings.
 *
 * 2. Bluetooth Low Energy (BLE) — @capacitor-community/bluetooth-le
 *    Fallback for newer printers that only support BLE.
 *    Does NOT require prior pairing.
 *
 * 3. WiFi/Network — Backend TCP proxy (/api/printer/send)
 *    Sends ESC/POS data via TCP to IP:Port.
 *    Requires backend to have network access to the printer.
 *
 * Print strategy for Bluetooth:
 *   → Try Classic SPP first (most common for thermal printers)
 *   → Fall back to BLE if SPP fails or is unavailable
 */

import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Known BLE printer service/characteristic UUIDs
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

// ===== Dynamic imports for Capacitor plugins =====

let _BluetoothPrinter = null;
async function getBluetoothClassicPlugin() {
  if (_BluetoothPrinter) return _BluetoothPrinter;
  try {
    const mod = await import('@kduma-autoid/capacitor-bluetooth-printer');
    _BluetoothPrinter = mod.BluetoothPrinter;
    return _BluetoothPrinter;
  } catch (err) {
    console.warn('[Printer] Bluetooth Classic plugin not available:', err.message);
    return null;
  }
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
  // MAIN PRINT METHOD — Use this everywhere
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

  // ===== WiFi: Send via backend TCP proxy =====
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

  // ===== Bluetooth: Try Classic SPP first, then BLE =====
  async _printBluetooth(printer, escposBase64) {
    if (!this.isNative) {
      // Browser fallback: Web Bluetooth (BLE only)
      return this._printWebBluetooth(base64ToBytes(escposBase64));
    }

    // Native APK: Try Classic SPP first (works with most thermal printers)
    const sppResult = await this._tryClassicSPP(printer.address, escposBase64);
    if (sppResult.success) {
      return sppResult;
    }

    // Fallback: Try BLE
    console.log(`[Printer] Classic SPP failed (${sppResult.error}), trying BLE...`);
    try {
      await this._printViaBLE(printer.address, base64ToBytes(escposBase64));
      return { success: true, method: 'ble', message: `Printed via BLE to ${printer.name}` };
    } catch (bleError) {
      // Both failed — give a clear error message
      throw new Error(
        `Could not print to ${printer.name}.\n\n` +
        `Bluetooth Classic: ${sppResult.error}\n` +
        `Bluetooth LE: ${bleError.message}\n\n` +
        'Make sure the printer is powered on, paired in Android Bluetooth settings, and in range.'
      );
    }
  }

  // Classic SPP print attempt
  async _tryClassicSPP(address, escposBase64) {
    try {
      const BluetoothPrinter = await getBluetoothClassicPlugin();
      if (!BluetoothPrinter) {
        return { success: false, error: 'Classic BT plugin not available' };
      }

      // Convert base64 to raw string (each char = one byte)
      const rawData = base64ToRawString(escposBase64);

      await BluetoothPrinter.connectAndPrint({
        address: address,
        data: rawData,
      });

      console.log(`[Printer] Classic SPP print sent to ${address}`);
      return { success: true, method: 'classic-spp', message: 'Printed via Bluetooth Classic' };
    } catch (error) {
      console.warn(`[Printer] Classic SPP failed for ${address}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // BLE print attempt
  async _printViaBLE(deviceId, bytes) {
    await this.initBLE();

    // Connect if needed
    if (this.bleDeviceId !== deviceId) {
      if (this.bleDeviceId) {
        try { await BleClient.disconnect(this.bleDeviceId); } catch {}
        this.bleDeviceId = null;
      }
      await this._connectBLE(deviceId);
    }

    // Send data in chunks
    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
      const dataView = numbersToDataView(Array.from(chunk));
      await BleClient.write(this.bleDeviceId, this.bleServiceUUID, this.bleCharUUID, dataView);
      if (offset + CHUNK_SIZE < bytes.length) {
        await new Promise(r => setTimeout(r, 30));
      }
    }
    console.log(`[Printer] BLE sent ${bytes.length} bytes to ${deviceId}`);
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
        if (isKnown) {
          foundService = svc.uuid;
          foundChar = ch.uuid;
          break;
        }
        if (!foundService) {
          foundService = svc.uuid;
          foundChar = ch.uuid;
        }
      }
      if (foundChar && BLE_SERVICE_UUIDS.includes(svc.uuid?.toLowerCase())) break;
    }

    if (!foundService || !foundChar) {
      await BleClient.disconnect(deviceId);
      throw new Error('No writable BLE service found on this device.');
    }

    this.bleDeviceId = deviceId;
    this.bleServiceUUID = foundService;
    this.bleCharUUID = foundChar;
  }

  // Web Bluetooth fallback (Chrome desktop testing)
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
            characteristic = ch;
            break;
          }
        }
        if (characteristic) break;
      }
    }

    if (!characteristic) {
      server.disconnect();
      throw new Error('No writable characteristic found on this Bluetooth device.');
    }

    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
      await characteristic.writeValue(chunk);
      if (offset + CHUNK_SIZE < bytes.length) {
        await new Promise(r => setTimeout(r, 30));
      }
    }

    server.disconnect();
    return { success: true, method: 'web-bluetooth' };
  }

  // ================================================================
  // DISCOVERY — List available printers
  // ================================================================

  /**
   * List paired Bluetooth Classic devices (SPP).
   * These are devices already paired in Android Bluetooth settings.
   * Returns: [{ name, address, type }]
   */
  async listPairedDevices() {
    if (!this.isNative) return [];
    try {
      const BluetoothPrinter = await getBluetoothClassicPlugin();
      if (!BluetoothPrinter) return [];
      const result = await BluetoothPrinter.list();
      return result.devices || [];
    } catch (error) {
      console.warn('[Printer] Failed to list paired devices:', error.message);
      return [];
    }
  }

  /**
   * Scan for nearby BLE devices.
   * @param {Function} onDeviceFound - callback({deviceId, name, rssi})
   * @param {number} durationMs - scan duration
   */
  async scanBLEDevices(onDeviceFound, durationMs = 10000) {
    await this.initBLE();
    if (!this.isNative) {
      throw new Error('BLE scanning requires the HevaPOS Android app.');
    }

    const isEnabled = await BleClient.isEnabled();
    if (!isEnabled) {
      try { await BleClient.requestEnable(); } catch {
        throw new Error('Please enable Bluetooth.');
      }
    }

    const seen = new Set();
    await BleClient.requestLEScan({ services: [], allowDuplicates: false }, (result) => {
      const id = result.device.deviceId;
      if (!seen.has(id) && (result.device.name || id)) {
        seen.add(id);
        onDeviceFound({
          deviceId: id,
          name: result.device.name || 'Unknown Device',
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
    // Disconnect Classic SPP
    try {
      const BluetoothPrinter = await getBluetoothClassicPlugin();
      if (BluetoothPrinter) await BluetoothPrinter.disconnect();
    } catch {}

    // Disconnect BLE
    try {
      if (this.bleDeviceId) await BleClient.disconnect(this.bleDeviceId);
    } catch {}

    this.bleDeviceId = null;
    this.bleServiceUUID = null;
    this.bleCharUUID = null;
  }
}

const printerService = new ThermalPrinterService();
export default printerService;
export { base64ToBytes, base64ToRawString };
