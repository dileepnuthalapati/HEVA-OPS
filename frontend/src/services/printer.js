// Thermal Printer Service with Bluetooth Discovery & WiFi Support
class ThermalPrinterService {
  constructor() {
    // Serial/USB connection
    this.port = null;
    this.writer = null;
    
    // Bluetooth connection
    this.bluetoothDevice = null;
    this.bluetoothCharacteristic = null;
    
    // WiFi connection
    this.wifiSocket = null;
    this.wifiIp = null;
    this.wifiPort = 9100; // Standard raw printing port
    
    this.encoder = new TextEncoder();
    this.connectionType = null; // 'serial', 'bluetooth', or 'wifi'
    this.deviceName = null;
  }

  // ESC/POS Commands
  ESC = '\x1B';
  GS = '\x1D';
  
  INIT = this.ESC + '@';
  BOLD_ON = this.ESC + 'E' + '\x01';
  BOLD_OFF = this.ESC + 'E' + '\x00';
  ALIGN_LEFT = this.ESC + 'a' + '\x00';
  ALIGN_CENTER = this.ESC + 'a' + '\x01';
  ALIGN_RIGHT = this.ESC + 'a' + '\x02';
  FONT_NORMAL = this.GS + '!' + '\x00';
  FONT_DOUBLE = this.GS + '!' + '\x11';
  FONT_LARGE = this.GS + '!' + '\x22';
  LINE_FEED = '\n';
  CUT_PAPER = this.GS + 'V' + '\x00';

  // Check support
  isSerialSupported() {
    return 'serial' in navigator;
  }

  isBluetoothSupported() {
    return 'bluetooth' in navigator;
  }

  isSupported() {
    return this.isSerialSupported() || this.isBluetoothSupported() || true; // WiFi always supported
  }

  isConnected() {
    return this.connectionType !== null;
  }

  getConnectionType() {
    return this.connectionType;
  }

  getDeviceName() {
    return this.deviceName;
  }

  // ===== BLUETOOTH CONNECTION =====
  async discoverBluetoothPrinter() {
    if (!this.isBluetoothSupported()) {
      throw new Error('Bluetooth not supported. Use Chrome on Android/Windows.');
    }

    try {
      this.bluetoothDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        ]
      });

      const server = await this.bluetoothDevice.gatt.connect();
      const services = await server.getPrimaryServices();

      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.bluetoothCharacteristic = char;
              this.connectionType = 'bluetooth';
              this.deviceName = this.bluetoothDevice.name || 'Bluetooth Printer';
              await this.write(this.INIT);
              return { name: this.deviceName, type: 'bluetooth' };
            }
          }
        } catch (e) {
          console.log('Service error:', e);
        }
      }
      throw new Error('No writable characteristic found');
    } catch (error) {
      this.bluetoothDevice = null;
      this.bluetoothCharacteristic = null;
      throw error;
    }
  }

  // ===== WIFI CONNECTION =====
  async connectWifi(ipAddress, port = 9100) {
    // Validate IP
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
      throw new Error('Invalid IP address format');
    }

    this.wifiIp = ipAddress;
    this.wifiPort = port;
    this.connectionType = 'wifi';
    this.deviceName = `WiFi Printer (${ipAddress})`;

    // For web, we'll use a backend proxy for raw socket printing
    // Test connection by sending init command
    try {
      await this.sendToWifiPrinter(this.INIT);
      return { name: this.deviceName, type: 'wifi', ip: ipAddress, port: port };
    } catch (error) {
      this.connectionType = null;
      this.deviceName = null;
      this.wifiIp = null;
      throw error;
    }
  }

  async sendToWifiPrinter(data) {
    if (!this.wifiIp) {
      throw new Error('WiFi printer not configured');
    }

    // Use backend API to send to network printer
    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/printer/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        ip: this.wifiIp,
        port: this.wifiPort,
        data: btoa(data) // Base64 encode the data
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to send to printer');
    }

    return true;
  }

  // ===== USB/SERIAL CONNECTION =====
  async connectSerial() {
    if (!this.isSerialSupported()) {
      throw new Error('USB/Serial not supported in this browser');
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
      this.writer = this.port.writable.getWriter();
      this.connectionType = 'serial';
      this.deviceName = 'USB Printer';
      await this.write(this.INIT);
      return { name: this.deviceName, type: 'serial' };
    } catch (error) {
      throw error;
    }
  }

  // ===== DISCONNECT =====
  async disconnect() {
    if (this.connectionType === 'serial') {
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } else if (this.connectionType === 'bluetooth') {
      if (this.bluetoothDevice?.gatt?.connected) {
        this.bluetoothDevice.gatt.disconnect();
      }
      this.bluetoothDevice = null;
      this.bluetoothCharacteristic = null;
    } else if (this.connectionType === 'wifi') {
      this.wifiIp = null;
    }
    this.connectionType = null;
    this.deviceName = null;
  }

  // ===== WRITE DATA =====
  async write(data) {
    const encoded = this.encoder.encode(data);
    
    if (this.connectionType === 'serial' && this.writer) {
      await this.writer.write(encoded);
    } else if (this.connectionType === 'bluetooth' && this.bluetoothCharacteristic) {
      const chunkSize = 20;
      for (let i = 0; i < encoded.length; i += chunkSize) {
        const chunk = encoded.slice(i, i + chunkSize);
        if (this.bluetoothCharacteristic.properties.writeWithoutResponse) {
          await this.bluetoothCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.bluetoothCharacteristic.writeValue(chunk);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } else if (this.connectionType === 'wifi') {
      await this.sendToWifiPrinter(data);
    } else {
      throw new Error('Printer not connected');
    }
  }

  async printText(text) {
    await this.write(text + this.LINE_FEED);
  }

  async printSeparator(char = '-', length = 32) {
    await this.write(char.repeat(length) + this.LINE_FEED);
  }

  // ===== PRINT RECEIPTS =====
  async printKitchenReceipt(order, currencySymbol = '£') {
    try {
      await this.write(this.INIT);
      await this.write(this.ALIGN_CENTER + this.FONT_LARGE + this.BOLD_ON);
      await this.printText('KITCHEN ORDER');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      await this.printSeparator('=');
      
      await this.write(this.ALIGN_LEFT + this.BOLD_ON);
      await this.printText(`Order #${String(order.order_number).padStart(3, '0')}`);
      await this.write(this.BOLD_OFF);
      await this.printText(`Server: ${order.created_by}`);
      await this.printText(`Time: ${new Date(order.created_at).toLocaleTimeString()}`);
      
      if (order.table_number) {
        await this.write(this.FONT_DOUBLE + this.BOLD_ON);
        await this.printText(`TABLE: ${order.table_number}`);
        await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      }
      
      await this.printSeparator();
      await this.write(this.BOLD_ON);
      await this.printText('ITEMS:');
      await this.write(this.BOLD_OFF);
      await this.printSeparator();
      
      for (const item of order.items) {
        await this.write(this.FONT_DOUBLE);
        await this.printText(`${item.quantity}x ${item.product_name}`);
        await this.write(this.FONT_NORMAL);
      }
      
      if (order.notes) {
        await this.printSeparator();
        await this.write(this.BOLD_ON);
        await this.printText('NOTES:');
        await this.write(this.BOLD_OFF);
        await this.printText(order.notes);
      }
      
      await this.printSeparator('=');
      await this.write(this.LINE_FEED + this.LINE_FEED);
      await this.write(this.CUT_PAPER);
      return true;
    } catch (error) {
      console.error('Kitchen receipt failed:', error);
      throw error;
    }
  }

  async printCustomerReceipt(order, currencySymbol = '£') {
    try {
      await this.write(this.INIT);
      await this.write(this.ALIGN_CENTER + this.FONT_LARGE + this.BOLD_ON);
      await this.printText('RECEIPT');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      await this.printSeparator('=');
      
      await this.write(this.FONT_DOUBLE + this.BOLD_ON);
      await this.printText(order.restaurant_name || 'Restaurant');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      
      await this.write(this.ALIGN_LEFT);
      await this.printText(`Order #${String(order.order_number).padStart(3, '0')}`);
      await this.printText(`Date: ${new Date(order.created_at).toLocaleString()}`);
      await this.printText(`Payment: ${order.payment_method?.toUpperCase() || 'N/A'}`);
      await this.printSeparator();
      
      for (const item of order.items) {
        const name = item.product_name.substring(0, 16).padEnd(16);
        const qty = `${item.quantity}`.padEnd(4);
        const total = `${currencySymbol}${item.total.toFixed(2)}`.padStart(8);
        await this.printText(name + qty + total);
      }
      
      await this.printSeparator();
      await this.write(this.FONT_DOUBLE + this.BOLD_ON);
      await this.printText('TOTAL: '.padEnd(12) + `${currencySymbol}${order.total_amount.toFixed(2)}`.padStart(8));
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      
      await this.printSeparator('=');
      await this.write(this.ALIGN_CENTER);
      await this.printText('Thank you!');
      await this.write(this.LINE_FEED + this.LINE_FEED);
      await this.write(this.CUT_PAPER);
      return true;
    } catch (error) {
      console.error('Customer receipt failed:', error);
      throw error;
    }
  }

  async testPrint() {
    try {
      await this.write(this.INIT);
      await this.write(this.ALIGN_CENTER + this.FONT_LARGE + this.BOLD_ON);
      await this.printText('PRINTER TEST');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      await this.printSeparator('=');
      await this.printText('Connection: ' + (this.connectionType || 'None').toUpperCase());
      await this.printText('Device: ' + (this.deviceName || 'Unknown'));
      await this.printText('');
      await this.printText('If you see this,');
      await this.printText('printer is working!');
      await this.printText('');
      await this.printText(new Date().toLocaleString());
      await this.printSeparator('=');
      await this.write(this.LINE_FEED + this.LINE_FEED);
      await this.write(this.CUT_PAPER);
      return true;
    } catch (error) {
      console.error('Test print failed:', error);
      throw error;
    }
  }
}

export default new ThermalPrinterService();
