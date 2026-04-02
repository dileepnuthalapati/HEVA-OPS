/**
 * HevaPOS Universal Thermal Printer Service
 * 
 * THREE connection methods — covers ALL printer setups:
 * 
 * 1. WiFi (TCP Socket) — capacitor-tcp-socket
 *    Tablet connects DIRECTLY to printer IP:9100 over WiFi.
 *    No backend needed. Multiple devices can share one WiFi printer.
 *    Best for: restaurants sharing one printer between multiple devices.
 *
 * 2. Bluetooth Classic (SPP) — @kduma-autoid/capacitor-bluetooth-printer
 *    Direct connection to paired Bluetooth printer.
 *    One device at a time (BT limitation).
 *    Best for: single-device setups, portable POS.
 *
 * 3. Bluetooth Low Energy (BLE) — @capacitor-community/bluetooth-le
 *    Fallback for newer BLE-only printers.
 *
 * WiFi is RECOMMENDED for multi-device setups (no "printer busy" conflicts).
 */

import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import { BluetoothPrinter } from '@kduma-autoid/capacitor-bluetooth-printer';
import { TcpSocket } from 'capacitor-tcp-socket';
import { CapacitorWifi } from '@capgo/capacitor-wifi';
import { Capacitor } from '@capacitor/core';

// BLE printer UUIDs
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
    this._printing = false;
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
  // MAIN PRINT METHOD — with duplicate prevention
  // ================================================================
  async printToDevice(printer, escposBase64, apiUrl, authToken) {
    if (!printer) throw new Error('No printer configured. Go to Settings > Printers to add one.');
    if (!escposBase64) throw new Error('No print data generated.');

    if (this._printing) {
      throw new Error('Printer is busy with a previous job. Please wait.');
    }

    this._printing = true;
    try {
      const byteCount = base64ToBytes(escposBase64).length;
      console.log(`[Printer] Sending ${byteCount} bytes to "${printer.name}" (${printer.type}) at ${printer.address}`);

      if (printer.type === 'wifi') {
        return await this._printWifi(printer, escposBase64, apiUrl, authToken);
      } else if (printer.type === 'bluetooth') {
        return await this._printBluetooth(printer, escposBase64);
      } else {
        throw new Error(`Unknown printer type: ${printer.type}`);
      }
    } finally {
      this._printing = false;
    }
  }

  // ================================================================
  // WiFi: Direct TCP from tablet (no backend needed)
  // ================================================================
  async _printWifi(printer, base64Data, apiUrl, authToken) {
    const parts = printer.address.split(':');
    const ip = parts[0];
    const port = parseInt(parts[1]) || 9100;

    // Native APK: Send directly via TCP socket plugin (recommended)
    if (this.isNative) {
      return this._printWifiNative(ip, port, base64Data);
    }

    // Browser fallback: Send via backend TCP proxy
    return this._printWifiBackend(ip, port, base64Data, apiUrl, authToken);
  }

  // Direct TCP from the tablet — works even with Railway backend
  async _printWifiNative(ip, port, base64Data) {
    let clientId = null;
    try {
      console.log(`[Printer] TCP connecting to ${ip}:${port}...`);
      const result = await TcpSocket.connect({ ipAddress: ip, port: port });
      clientId = result.client;
      console.log(`[Printer] TCP connected (client ${clientId}), sending data...`);

      // Send ESC/POS as base64 — plugin decodes to raw bytes natively
      await TcpSocket.send({
        client: clientId,
        data: base64Data,
        encoding: 'base64',
      });

      console.log('[Printer] WiFi TCP print sent successfully');
      return { success: true, method: 'wifi-tcp', message: 'Printed via WiFi' };
    } catch (error) {
      const msg = error.message || String(error);
      console.error('[Printer] WiFi TCP error:', msg);

      if (msg.includes('timeout') || msg.includes('connect') || msg.includes('refused')) {
        throw new Error(
          `Cannot reach printer at ${ip}:${port}.\n\n` +
          'Check that:\n' +
          '1. The printer is powered on and connected to WiFi\n' +
          '2. Your tablet is on the same WiFi network as the printer\n' +
          '3. The printer IP address is correct (check printer\'s network settings page)'
        );
      }
      throw new Error(`WiFi print failed: ${msg}`);
    } finally {
      // Always disconnect
      if (clientId !== null) {
        try { await TcpSocket.disconnect({ client: clientId }); } catch {}
      }
    }
  }

  // Backend proxy fallback (for browser/development use)
  async _printWifiBackend(ip, port, base64Data, apiUrl, authToken) {
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

    return await response.json();
  }

  // ================================================================
  // Bluetooth: Classic SPP first, BLE fallback
  // ================================================================
  async _printBluetooth(printer, escposBase64) {
    if (!this.isNative) {
      return this._printWebBluetooth(base64ToBytes(escposBase64));
    }

    // Try Classic SPP first (most thermal printers)
    const sppResult = await this._tryClassicSPP(printer.address, escposBase64);
    if (sppResult.success) return sppResult;

    // Try BLE fallback
    console.log(`[Printer] Classic SPP: ${sppResult.error}. Trying BLE...`);
    try {
      await this._printViaBLE(printer.address, base64ToBytes(escposBase64));
      return { success: true, method: 'ble', message: `Printed via BLE to ${printer.name}` };
    } catch (bleError) {
      const isBusy = sppResult.error?.toLowerCase().includes('connect') ||
                     sppResult.error?.toLowerCase().includes('socket') ||
                     sppResult.error?.toLowerCase().includes('busy') ||
                     sppResult.error?.toLowerCase().includes('refused');

      const busyHint = isBusy
        ? '\n\nThe printer may be connected to another device. ' +
          'Bluetooth only allows ONE device at a time. ' +
          'Switch to WiFi connection to share the printer between multiple devices.'
        : '';

      throw new Error(
        `Could not print to ${printer.name}.${busyHint}\n\n` +
        'Troubleshooting:\n' +
        '1. Turn the printer off and on\n' +
        '2. Check it\'s paired in Android Bluetooth Settings\n' +
        '3. For multi-device setups, use WiFi connection instead'
      );
    }
  }

  async _tryClassicSPP(address, escposBase64) {
    try {
      const rawData = base64ToRawString(escposBase64);
      await BluetoothPrinter.connectAndPrint({ address, data: rawData });
      console.log(`[Printer] Classic SPP print sent to ${address}`);
      return { success: true, method: 'classic-spp', message: 'Printed via Bluetooth' };
    } catch (error) {
      const msg = error.message || String(error);
      console.warn(`[Printer] Classic SPP failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

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
  // WiFi Printer Discovery — auto-detect subnet from device IP
  // ================================================================

  /**
   * Get the device's local WiFi IP and extract the subnet.
   * Returns e.g., '192.168.0' from '192.168.0.105'
   */
  async getDeviceSubnet() {
    if (!this.isNative) return null;
    try {
      const result = await CapacitorWifi.getIpAddress();
      const ip = result.ipAddress;
      if (!ip) return null;
      const parts = ip.split('.');
      if (parts.length === 4) {
        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        console.log(`[Printer] Device IP: ${ip}, Subnet: ${subnet}`);
        return subnet;
      }
      return null;
    } catch (error) {
      console.warn('[Printer] Failed to get device IP:', error.message);
      return null;
    }
  }

  /**
   * Scan the local WiFi network for printers.
   * Auto-detects subnet from the tablet's IP address.
   * @param {Function} onPrinterFound - callback({ip, port, name})
   * @param {Function} onProgress - callback(message)
   */
  async scanWifiPrinters(onPrinterFound, onProgress) {
    if (!this.isNative) {
      throw new Error('WiFi scanning from browser not supported. Use the backend scanner or enter the printer IP manually.');
    }

    // Auto-detect subnet from device IP
    const subnet = await this.getDeviceSubnet();
    if (!subnet) {
      throw new Error(
        'Could not detect your WiFi network.\n' +
        'Make sure your tablet is connected to WiFi.'
      );
    }

    if (onProgress) onProgress(`Scanning ${subnet}.x for printers...`);
    const results = [];
    const ports = [9100];

    // Scan IPs 1-254 in batches
    const batchSize = 25;
    for (let batchStart = 1; batchStart <= 254; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, 254);
      if (onProgress) onProgress(`Scanning ${subnet}.${batchStart}-${batchEnd}...`);

      const batchPromises = [];
      for (let i = batchStart; i <= batchEnd; i++) {
        const ip = `${subnet}.${i}`;
        for (const port of ports) {
          batchPromises.push(
            this._probeWifiPrinter(ip, port).then(found => {
              if (found) {
                const device = { ip, port, name: `Printer at ${ip}` };
                results.push(device);
                onPrinterFound(device);
              }
            })
          );
        }
      }
      await Promise.all(batchPromises);
    }

    if (onProgress) onProgress('');
    return results;
  }

  async _probeWifiPrinter(ip, port) {
    try {
      const result = await TcpSocket.connect({ ipAddress: ip, port: port });
      await TcpSocket.disconnect({ client: result.client });
      return true;
    } catch {
      return false;
    }
  }

  // ================================================================
  // Bluetooth Discovery
  // ================================================================
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
      if (!seen.has(id) && result.device.name) {
        seen.add(id);
        onDeviceFound({ deviceId: id, name: result.device.name, rssi: result.rssi });
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
