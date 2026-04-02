/**
 * HevaPOS Thermal Printer Service
 * 
 * Handles actual print execution for both WiFi and Bluetooth printers.
 * - WiFi: Sends ESC/POS data via backend TCP proxy (/api/printer/send)
 * - Bluetooth: Uses @capacitor-community/bluetooth-le for native BLE transmission
 * - Web: Falls back to Web Bluetooth API for Chrome browser
 */

import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Common ESC/POS printer service UUIDs
const PRINTER_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

const PRINTER_WRITE_UUIDS = [
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '00002af1-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
];

// ===== Utility Functions =====

function base64ToBytes(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ===== Printer Service =====

class ThermalPrinterService {
  constructor() {
    this.connectedDeviceId = null;
    this.serviceUUID = null;
    this.characteristicUUID = null;
    this.isNative = Capacitor.isNativePlatform();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    if (this.isNative) {
      try {
        await BleClient.initialize({ androidNeverForLocation: true });
        this.initialized = true;
        console.log('[Printer] BLE native client initialized');
      } catch (error) {
        console.error('[Printer] BLE init failed:', error);
        throw new Error('Bluetooth initialization failed. Enable Bluetooth in settings.');
      }
    } else {
      this.initialized = true;
      console.log('[Printer] Web mode initialized');
    }
  }

  // ================================================================
  // MAIN PRINT METHOD — call this from POS Screen, Test Print, etc.
  // ================================================================
  /**
   * @param {Object} printer - { type: 'wifi'|'bluetooth', address: '...', name: '...' }
   * @param {string} escposBase64 - Base64-encoded ESC/POS commands
   * @param {string} apiUrl - Backend API URL (process.env.REACT_APP_BACKEND_URL)
   * @param {string} authToken - JWT auth token
   */
  async printToDevice(printer, escposBase64, apiUrl, authToken) {
    if (!printer) throw new Error('No printer configured. Add a printer in Settings > Printers.');
    if (!escposBase64) throw new Error('No print data generated.');

    console.log(`[Printer] Sending to "${printer.name}" (${printer.type}) at ${printer.address}`);

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

    console.log(`[Printer] WiFi sending to ${ip}:${port} (${base64ToBytes(base64Data).length} bytes)`);

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

    const result = await response.json();
    console.log('[Printer] WiFi print success');
    return result;
  }

  // ===== Bluetooth: Connect via BLE and send =====
  async _printBluetooth(printer, escposBase64) {
    const bytes = base64ToBytes(escposBase64);
    await this.initialize();

    if (!this.isNative) {
      return this._printWebBluetooth(bytes);
    }

    // Native Capacitor: connect by MAC address if needed, then send
    const deviceId = printer.address;

    // If already connected to a different device, disconnect first
    if (this.connectedDeviceId && this.connectedDeviceId !== deviceId) {
      try { await BleClient.disconnect(this.connectedDeviceId); } catch {}
      this.connectedDeviceId = null;
      this.serviceUUID = null;
      this.characteristicUUID = null;
    }

    // Connect if not already connected to this device
    if (this.connectedDeviceId !== deviceId) {
      await this._connectNativeBLE(deviceId);
    }

    await this._sendNativeBLE(bytes);
    return { success: true, message: `Printed via Bluetooth to ${printer.name}` };
  }

  async _connectNativeBLE(deviceId) {
    console.log(`[Printer] Connecting BLE to ${deviceId}...`);
    try {
      await BleClient.connect(deviceId, (disconnectedId) => {
        console.log('[Printer] BLE device disconnected:', disconnectedId);
        if (this.connectedDeviceId === disconnectedId) {
          this.connectedDeviceId = null;
          this.serviceUUID = null;
          this.characteristicUUID = null;
        }
      });

      // Discover services and find writable characteristic
      const services = await BleClient.getServices(deviceId);
      let foundService = null;
      let foundCharacteristic = null;

      for (const service of services) {
        for (const characteristic of service.characteristics) {
          const canWrite = characteristic.properties?.write || characteristic.properties?.writeWithoutResponse;
          if (!canWrite) continue;

          // Prefer known printer UUIDs
          const isKnownService = PRINTER_SERVICE_UUIDS.includes(service.uuid.toLowerCase());
          const isKnownChar = PRINTER_WRITE_UUIDS.includes(characteristic.uuid.toLowerCase());

          if (isKnownService || isKnownChar) {
            foundService = service.uuid;
            foundCharacteristic = characteristic.uuid;
            break;
          }
          // Fallback: first writable characteristic
          if (!foundService) {
            foundService = service.uuid;
            foundCharacteristic = characteristic.uuid;
          }
        }
        if (foundCharacteristic && PRINTER_SERVICE_UUIDS.includes(service.uuid?.toLowerCase())) break;
      }

      if (!foundService || !foundCharacteristic) {
        await BleClient.disconnect(deviceId);
        throw new Error(
          'Connected but no writable print service found. ' +
          'This printer may use Bluetooth Classic (SPP) instead of BLE. ' +
          'Try connecting it via WiFi/Network instead, or check if your printer model supports BLE.'
        );
      }

      this.connectedDeviceId = deviceId;
      this.serviceUUID = foundService;
      this.characteristicUUID = foundCharacteristic;
      console.log(`[Printer] BLE connected: service=${foundService}, char=${foundCharacteristic}`);
    } catch (error) {
      if (error.message?.includes('no writable') || error.message?.includes('Bluetooth Classic')) {
        throw error;
      }
      throw new Error(
        `Cannot connect to Bluetooth printer (${deviceId}): ${error.message}. ` +
        'Make sure the printer is powered on, in range, and Bluetooth is enabled.'
      );
    }
  }

  async _sendNativeBLE(bytes) {
    if (!this.connectedDeviceId || !this.serviceUUID || !this.characteristicUUID) {
      throw new Error('Bluetooth printer not connected. Try reconnecting.');
    }

    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
      const dataView = numbersToDataView(Array.from(chunk));

      await BleClient.write(
        this.connectedDeviceId,
        this.serviceUUID,
        this.characteristicUUID,
        dataView
      );

      if (offset + CHUNK_SIZE < bytes.length) {
        await new Promise(r => setTimeout(r, 30));
      }
    }
    console.log(`[Printer] BLE sent ${bytes.length} bytes`);
  }

  // ===== Web Bluetooth Fallback (Chrome desktop testing) =====
  async _printWebBluetooth(bytes) {
    if (!navigator.bluetooth) {
      throw new Error('Bluetooth not available in this browser. Use the HevaPOS Android app for Bluetooth printing.');
    }

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICE_UUIDS,
    });

    if (!device) throw new Error('No device selected');
    const server = await device.gatt.connect();
    let characteristic = null;

    // Try known printer service/characteristic UUIDs first
    for (const serviceUUID of PRINTER_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(serviceUUID);
        for (const charUUID of PRINTER_WRITE_UUIDS) {
          try {
            characteristic = await service.getCharacteristic(charUUID);
            break;
          } catch {}
        }
        if (characteristic) break;
      } catch {}
    }

    // Fallback: any writable characteristic
    if (!characteristic) {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            characteristic = char;
            break;
          }
        }
        if (characteristic) break;
      }
    }

    if (!characteristic) {
      server.disconnect();
      throw new Error('Connected but no writable characteristic found.');
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
    console.log(`[Printer] Web Bluetooth sent ${bytes.length} bytes`);
    return { success: true, message: 'Printed via Web Bluetooth' };
  }

  // ================================================================
  // BLE Discovery (for PrinterSettings scan)
  // ================================================================
  async discoverBLEPrinters(onDeviceFound, durationMs = 10000) {
    await this.initialize();

    if (!this.isNative) {
      throw new Error('Bluetooth scanning requires the HevaPOS Android app.');
    }

    const isEnabled = await BleClient.isEnabled();
    if (!isEnabled) {
      try { await BleClient.requestEnable(); } catch {
        throw new Error('Please enable Bluetooth to scan for printers.');
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

    console.log(`[Printer] BLE scan started for ${durationMs}ms`);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await BleClient.stopLEScan();
    console.log(`[Printer] BLE scan complete, found ${seen.size} devices`);
  }

  // ================================================================
  // Disconnect
  // ================================================================
  async disconnect() {
    try {
      if (this.isNative && this.connectedDeviceId) {
        await BleClient.disconnect(this.connectedDeviceId);
      }
    } catch (error) {
      console.warn('[Printer] Disconnect error:', error);
    }
    this.connectedDeviceId = null;
    this.serviceUUID = null;
    this.characteristicUUID = null;
    console.log('[Printer] Disconnected');
  }
}

const printerService = new ThermalPrinterService();
export default printerService;
export { base64ToBytes, bytesToBase64 };
