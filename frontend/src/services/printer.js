/**
 * HevaPOS Thermal Printer Service
 * 
 * Uses @capacitor-community/bluetooth-le for native Android/iOS (APK)
 * Falls back to Web Bluetooth API for Chrome browser testing
 * Supports WiFi/Network printers via WebSocket or raw TCP
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

class ThermalPrinterService {
  constructor() {
    this.device = null;
    this.connectedDeviceId = null;
    this.serviceUUID = null;
    this.characteristicUUID = null;
    this.connectionType = null; // 'ble-native', 'ble-web', 'wifi'
    this.isNative = Capacitor.isNativePlatform();
    this.initialized = false;
  }

  // ===== Initialization =====

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
      console.log('[Printer] Web mode - will use Web Bluetooth API');
    }
  }

  isSupported() {
    if (this.isNative) return true;
    return !!navigator.bluetooth;
  }

  isConnected() {
    return !!this.connectedDeviceId || !!this.device;
  }

  // ===== Bluetooth Discovery & Connection =====

  async discoverBluetoothPrinter() {
    await this.initialize();

    if (this.isNative) {
      return this._discoverNative();
    } else {
      return this._discoverWebBluetooth();
    }
  }

  async _discoverNative() {
    // Ensure Bluetooth is enabled
    const isEnabled = await BleClient.isEnabled();
    if (!isEnabled) {
      try {
        await BleClient.requestEnable();
      } catch {
        throw new Error('Please enable Bluetooth to connect to a printer.');
      }
    }

    // Scan for devices
    const devices = [];
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        await BleClient.stopLEScan();
        if (devices.length === 0) {
          reject(new Error('No Bluetooth printers found. Make sure your printer is on and in range.'));
        }
      }, 15000);

      BleClient.requestLEScan(
        { services: [], allowDuplicates: false },
        (result) => {
          const name = result.device.name || '';
          // Filter for likely printers
          if (name && (name.toLowerCase().includes('print') || 
              name.toLowerCase().includes('pos') || 
              name.toLowerCase().includes('esc') ||
              name.toLowerCase().includes('thermal') ||
              name.startsWith('BT-') || 
              name.startsWith('RP') ||
              name.startsWith('MTP') ||
              name.startsWith('SP') ||
              devices.length === 0)) { // Accept first named device
            
            const exists = devices.find(d => d.deviceId === result.device.deviceId);
            if (!exists) {
              devices.push({
                deviceId: result.device.deviceId,
                name: result.device.name || 'Unknown Printer',
              });
            }
          }
        }
      ).then(() => {
        console.log('[Printer] Native BLE scan started');
      }).catch((err) => {
        clearTimeout(timeout);
        reject(new Error('Bluetooth scan failed: ' + err.message));
      });

      // After finding first device, try to connect
      const checkInterval = setInterval(async () => {
        if (devices.length > 0) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          await BleClient.stopLEScan();
          
          const device = devices[0];
          try {
            await this._connectNative(device.deviceId);
            resolve({ name: device.name, deviceId: device.deviceId });
          } catch (err) {
            reject(err);
          }
        }
      }, 1000);
    });
  }

  async _connectNative(deviceId) {
    try {
      await BleClient.connect(deviceId, (disconnectedId) => {
        console.log('[Printer] Device disconnected:', disconnectedId);
        this.connectedDeviceId = null;
        this.serviceUUID = null;
        this.characteristicUUID = null;
        this.connectionType = null;
      });

      // Discover writable characteristic
      const services = await BleClient.getServices(deviceId);
      let foundService = null;
      let foundCharacteristic = null;

      for (const service of services) {
        for (const characteristic of service.characteristics) {
          if (characteristic.properties?.write || characteristic.properties?.writeWithoutResponse) {
            // Prefer known printer UUIDs
            if (PRINTER_SERVICE_UUIDS.includes(service.uuid.toLowerCase()) ||
                PRINTER_WRITE_UUIDS.includes(characteristic.uuid.toLowerCase())) {
              foundService = service.uuid;
              foundCharacteristic = characteristic.uuid;
              break;
            }
            // Fallback to first writable characteristic
            if (!foundService) {
              foundService = service.uuid;
              foundCharacteristic = characteristic.uuid;
            }
          }
        }
        if (PRINTER_SERVICE_UUIDS.includes(service.uuid?.toLowerCase())) break;
      }

      if (!foundService || !foundCharacteristic) {
        await BleClient.disconnect(deviceId);
        throw new Error('Connected but no writable printer service found.');
      }

      this.connectedDeviceId = deviceId;
      this.serviceUUID = foundService;
      this.characteristicUUID = foundCharacteristic;
      this.connectionType = 'ble-native';
      console.log(`[Printer] Connected native BLE: service=${foundService}, char=${foundCharacteristic}`);
    } catch (error) {
      throw new Error('Failed to connect to printer: ' + error.message);
    }
  }

  async _discoverWebBluetooth() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth not supported. Use Chrome on desktop or the Android app.');
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICE_UUIDS,
      });

      if (!device) throw new Error('No device selected');

      const server = await device.gatt.connect();
      
      // Try known service UUIDs
      for (const serviceUUID of PRINTER_SERVICE_UUIDS) {
        try {
          const service = await server.getPrimaryService(serviceUUID);
          for (const charUUID of PRINTER_WRITE_UUIDS) {
            try {
              const characteristic = await service.getCharacteristic(charUUID);
              this.device = { gattServer: server, characteristic, name: device.name };
              this.connectionType = 'ble-web';
              console.log('[Printer] Web Bluetooth connected');
              return { name: device.name || 'Bluetooth Printer' };
            } catch {}
          }
        } catch {}
      }

      // Fallback: try to find any writable characteristic
      const services = await server.getPrimaryServices();
      for (const service of services) {
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.device = { gattServer: server, characteristic: char, name: device.name };
            this.connectionType = 'ble-web';
            return { name: device.name || 'Bluetooth Printer' };
          }
        }
      }

      throw new Error('Connected but no writable characteristic found.');
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw new Error('No printer selected. Please try again.');
      }
      throw error;
    }
  }

  // ===== WiFi Printer =====

  async connectWifi(ip, port = 9100) {
    // WiFi printers are connected via the backend API (ESC/POS commands sent to IP)
    this.device = { type: 'wifi', ip, port, name: `WiFi Printer (${ip})` };
    this.connectionType = 'wifi';
    console.log(`[Printer] WiFi printer registered: ${ip}:${port}`);
    return { name: `WiFi Printer (${ip}:${port})` };
  }

  // ===== Print Operations =====

  async printRaw(data) {
    if (!this.isConnected()) {
      throw new Error('No printer connected');
    }

    let bytes;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (Array.isArray(data)) {
      bytes = new Uint8Array(data);
    } else {
      bytes = data;
    }

    if (this.connectionType === 'ble-native') {
      await this._sendNativeBLE(bytes);
    } else if (this.connectionType === 'ble-web') {
      await this._sendWebBluetooth(bytes);
    } else if (this.connectionType === 'wifi') {
      console.log(`[Printer] WiFi print: ${bytes.length} bytes (handled via backend API)`);
    }
  }

  async _sendNativeBLE(bytes) {
    const CHUNK_SIZE = 100; // BLE MTU safe chunk
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
      const dataView = numbersToDataView(Array.from(chunk));
      
      await BleClient.write(
        this.connectedDeviceId,
        this.serviceUUID,
        this.characteristicUUID,
        dataView
      );
      
      // Small delay between chunks
      if (offset + CHUNK_SIZE < bytes.length) {
        await new Promise(r => setTimeout(r, 30));
      }
    }
    console.log(`[Printer] Sent ${bytes.length} bytes via native BLE`);
  }

  async _sendWebBluetooth(bytes) {
    const characteristic = this.device?.characteristic;
    if (!characteristic) throw new Error('No characteristic available');

    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
      await characteristic.writeValue(chunk);
      if (offset + CHUNK_SIZE < bytes.length) {
        await new Promise(r => setTimeout(r, 30));
      }
    }
    console.log(`[Printer] Sent ${bytes.length} bytes via Web Bluetooth`);
  }

  // ===== Test Print =====

  async testPrint() {
    const cmds = [
      0x1b, 0x40,                    // Initialize
      0x1b, 0x61, 0x01,              // Center align
      0x1b, 0x45, 0x08,              // Bold on
      ...new TextEncoder().encode('HevaPOS'),
      0x0a,                           // Line feed
      0x1b, 0x45, 0x00,              // Bold off
      ...new TextEncoder().encode('Printer Test OK'),
      0x0a, 0x0a,
      ...new TextEncoder().encode(new Date().toLocaleString()),
      0x0a,
      ...new TextEncoder().encode('--------------------------------'),
      0x0a,
      0x1b, 0x64, 0x03,              // Feed 3 lines
      0x1d, 0x56, 0x00,              // Cut paper
    ];
    await this.printRaw(new Uint8Array(cmds));
  }

  // ===== Disconnect =====

  async disconnect() {
    try {
      if (this.connectionType === 'ble-native' && this.connectedDeviceId) {
        await BleClient.disconnect(this.connectedDeviceId);
      } else if (this.connectionType === 'ble-web' && this.device?.gattServer) {
        this.device.gattServer.disconnect();
      }
    } catch (error) {
      console.warn('[Printer] Disconnect error:', error);
    }
    this.device = null;
    this.connectedDeviceId = null;
    this.serviceUUID = null;
    this.characteristicUUID = null;
    this.connectionType = null;
    console.log('[Printer] Disconnected');
  }
}

export default new ThermalPrinterService();
