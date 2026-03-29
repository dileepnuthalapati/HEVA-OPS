// Thermal Printer Service with Bluetooth Discovery
class ThermalPrinterService {
  constructor() {
    this.port = null;
    this.writer = null;
    this.bluetoothDevice = null;
    this.bluetoothCharacteristic = null;
    this.encoder = new TextEncoder();
    this.connectionType = null; // 'serial' or 'bluetooth'
  }

  // ESC/POS Commands
  ESC = '\x1B';
  GS = '\x1D';
  
  // Initialize printer
  INIT = this.ESC + '@';
  
  // Text formatting
  BOLD_ON = this.ESC + 'E' + '\x01';
  BOLD_OFF = this.ESC + 'E' + '\x00';
  
  // Alignment
  ALIGN_LEFT = this.ESC + 'a' + '\x00';
  ALIGN_CENTER = this.ESC + 'a' + '\x01';
  ALIGN_RIGHT = this.ESC + 'a' + '\x02';
  
  // Font size
  FONT_NORMAL = this.GS + '!' + '\x00';
  FONT_DOUBLE = this.GS + '!' + '\x11';
  FONT_LARGE = this.GS + '!' + '\x22';
  
  // Line feed and cut
  LINE_FEED = '\n';
  CUT_PAPER = this.GS + 'V' + '\x00';

  // Check if Web Serial API is supported
  isSerialSupported() {
    return 'serial' in navigator;
  }

  // Check if Web Bluetooth API is supported
  isBluetoothSupported() {
    return 'bluetooth' in navigator;
  }

  // Check if any connection method is supported
  isSupported() {
    return this.isSerialSupported() || this.isBluetoothSupported();
  }

  // Check if printer is connected
  isConnected() {
    if (this.connectionType === 'serial') {
      return this.port !== null && this.writer !== null;
    } else if (this.connectionType === 'bluetooth') {
      return this.bluetoothDevice !== null && this.bluetoothCharacteristic !== null;
    }
    return false;
  }

  // Get connection type
  getConnectionType() {
    return this.connectionType;
  }

  // Get connected device name
  getDeviceName() {
    if (this.connectionType === 'bluetooth' && this.bluetoothDevice) {
      return this.bluetoothDevice.name || 'Bluetooth Printer';
    }
    if (this.connectionType === 'serial' && this.port) {
      return 'USB/Serial Printer';
    }
    return null;
  }

  // Discover and connect to Bluetooth printer
  async discoverBluetoothPrinter() {
    if (!this.isBluetoothSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome on Android/Windows.');
    }

    try {
      // Request Bluetooth device - filter for common printer services
      // Most thermal printers use Serial Port Profile (SPP) which maps to these UUIDs
      this.bluetoothDevice = await navigator.bluetooth.requestDevice({
        // Accept all devices to maximize compatibility
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Common printer service
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // SPP-like service
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Another common printer UUID
        ]
      });

      console.log('Bluetooth device selected:', this.bluetoothDevice.name);

      // Connect to the device
      const server = await this.bluetoothDevice.gatt.connect();
      console.log('Connected to GATT server');

      // Get primary services
      const services = await server.getPrimaryServices();
      console.log('Available services:', services.map(s => s.uuid));

      // Find a writable characteristic
      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const characteristic of characteristics) {
            if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
              this.bluetoothCharacteristic = characteristic;
              this.connectionType = 'bluetooth';
              console.log('Found writable characteristic:', characteristic.uuid);
              
              // Initialize printer
              await this.write(this.INIT);
              
              return {
                name: this.bluetoothDevice.name,
                id: this.bluetoothDevice.id,
                type: 'bluetooth'
              };
            }
          }
        } catch (e) {
          console.log('Service error:', e);
        }
      }

      throw new Error('No writable characteristic found. Printer may not be compatible.');
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      this.bluetoothDevice = null;
      this.bluetoothCharacteristic = null;
      throw error;
    }
  }

  // Connect to USB/Serial printer
  async connectSerial() {
    if (!this.isSerialSupported()) {
      throw new Error('Web Serial API is not supported in this browser');
    }

    try {
      this.port = await navigator.serial.requestPort();
      
      await this.port.open({ 
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      this.writer = this.port.writable.getWriter();
      this.connectionType = 'serial';
      
      // Initialize printer
      await this.write(this.INIT);
      
      return {
        name: 'USB/Serial Printer',
        type: 'serial'
      };
    } catch (error) {
      console.error('Serial connection failed:', error);
      throw error;
    }
  }

  // Connect method - tries Bluetooth first, then Serial
  async connect(preferBluetooth = true) {
    if (preferBluetooth && this.isBluetoothSupported()) {
      return await this.discoverBluetoothPrinter();
    } else if (this.isSerialSupported()) {
      return await this.connectSerial();
    } else {
      throw new Error('No supported connection method available');
    }
  }

  // Disconnect from printer
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
      if (this.bluetoothDevice && this.bluetoothDevice.gatt.connected) {
        this.bluetoothDevice.gatt.disconnect();
      }
      this.bluetoothDevice = null;
      this.bluetoothCharacteristic = null;
    }
    this.connectionType = null;
  }

  // Write data to printer
  async write(data) {
    const encoded = this.encoder.encode(data);
    
    if (this.connectionType === 'serial' && this.writer) {
      await this.writer.write(encoded);
    } else if (this.connectionType === 'bluetooth' && this.bluetoothCharacteristic) {
      // Bluetooth has a max packet size, so we chunk the data
      const chunkSize = 20; // BLE MTU is typically 20-23 bytes
      for (let i = 0; i < encoded.length; i += chunkSize) {
        const chunk = encoded.slice(i, i + chunkSize);
        if (this.bluetoothCharacteristic.properties.writeWithoutResponse) {
          await this.bluetoothCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.bluetoothCharacteristic.writeValue(chunk);
        }
        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } else {
      throw new Error('Printer not connected');
    }
  }

  // Print text
  async printText(text) {
    await this.write(text + this.LINE_FEED);
  }

  // Print line separator
  async printSeparator(char = '-', length = 32) {
    await this.write(char.repeat(length) + this.LINE_FEED);
  }

  // Print kitchen receipt
  async printKitchenReceipt(order, currencySymbol = '£') {
    try {
      // Initialize
      await this.write(this.INIT);
      
      // Header
      await this.write(this.ALIGN_CENTER + this.FONT_LARGE + this.BOLD_ON);
      await this.printText('KITCHEN ORDER');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      await this.printSeparator('=');
      
      // Order info
      await this.write(this.ALIGN_LEFT);
      await this.write(this.BOLD_ON);
      await this.printText(`Order #${String(order.order_number).padStart(3, '0')}`);
      await this.write(this.BOLD_OFF);
      await this.printText(`Server: ${order.created_by}`);
      await this.printText(`Time: ${new Date(order.created_at).toLocaleTimeString()}`);
      
      // Table info
      if (order.table_number) {
        await this.write(this.FONT_DOUBLE + this.BOLD_ON);
        await this.printText(`TABLE: ${order.table_number}`);
        await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      }
      
      await this.printSeparator();
      
      // Items
      await this.write(this.BOLD_ON);
      await this.printText('ITEMS:');
      await this.write(this.BOLD_OFF);
      await this.printSeparator();
      
      for (const item of order.items) {
        await this.write(this.FONT_DOUBLE);
        await this.printText(`${item.quantity}x ${item.product_name}`);
        await this.write(this.FONT_NORMAL);
      }
      
      // Notes
      if (order.notes) {
        await this.printSeparator();
        await this.write(this.BOLD_ON);
        await this.printText('NOTES:');
        await this.write(this.BOLD_OFF);
        await this.printText(order.notes);
      }
      
      await this.printSeparator('=');
      
      // Footer
      await this.write(this.LINE_FEED + this.LINE_FEED);
      
      // Cut paper
      await this.write(this.CUT_PAPER);
      
      return true;
    } catch (error) {
      console.error('Failed to print kitchen receipt:', error);
      throw error;
    }
  }

  // Print customer receipt
  async printCustomerReceipt(order, currencySymbol = '£') {
    try {
      // Initialize
      await this.write(this.INIT);
      
      // Receipt Title
      await this.write(this.ALIGN_CENTER + this.FONT_LARGE + this.BOLD_ON);
      await this.printText('CUSTOMER RECEIPT');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      await this.printSeparator('=');
      
      // Restaurant Name (prominently)
      await this.write(this.FONT_DOUBLE + this.BOLD_ON);
      await this.printText(order.restaurant_name || 'Restaurant');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      
      // Order info
      await this.write(this.ALIGN_LEFT);
      await this.printText(`Order #${String(order.order_number).padStart(3, '0')}`);
      await this.printText(`Server: ${order.created_by}`);
      await this.printText(`Date: ${new Date(order.created_at).toLocaleString()}`);
      await this.printText(`Payment: ${order.payment_method?.toUpperCase() || 'N/A'}`);
      await this.printSeparator();
      
      // Items header
      await this.write(this.BOLD_ON);
      const header = 'Item'.padEnd(16) + 'Qty'.padEnd(4) + 'Total'.padStart(8);
      await this.printText(header);
      await this.write(this.BOLD_OFF);
      await this.printSeparator();
      
      // Items
      for (const item of order.items) {
        const itemName = item.product_name.length > 16 
          ? item.product_name.slice(0, 13) + '...' 
          : item.product_name.padEnd(16);
        const qty = `${item.quantity}`.padEnd(4);
        const total = `${currencySymbol}${item.total.toFixed(2)}`.padStart(8);
        await this.printText(itemName + qty + total);
      }
      
      await this.printSeparator();
      
      // Subtotal
      await this.printText('Subtotal:'.padEnd(24) + `${currencySymbol}${order.subtotal?.toFixed(2) || order.total_amount.toFixed(2)}`.padStart(8));
      
      // Discount
      if (order.discount_amount > 0) {
        await this.printText('Discount:'.padEnd(24) + `-${currencySymbol}${order.discount_amount.toFixed(2)}`.padStart(8));
      }
      
      // Tip
      if (order.tip_amount > 0) {
        await this.printText(`Tip (${order.tip_percentage}%):`.padEnd(24) + `${currencySymbol}${order.tip_amount.toFixed(2)}`.padStart(8));
      }
      
      // Total
      await this.printSeparator();
      await this.write(this.FONT_DOUBLE + this.BOLD_ON);
      await this.printText('TOTAL:'.padEnd(12) + `${currencySymbol}${order.total_amount.toFixed(2)}`.padStart(8));
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      
      await this.printSeparator('=');
      
      // Footer
      await this.write(this.ALIGN_CENTER);
      await this.printText('Thank you for your visit!');
      await this.write(this.LINE_FEED + this.LINE_FEED);
      
      // Cut paper
      await this.write(this.CUT_PAPER);
      
      return true;
    } catch (error) {
      console.error('Failed to print customer receipt:', error);
      throw error;
    }
  }

  // Test print
  async testPrint() {
    try {
      await this.write(this.INIT);
      await this.write(this.ALIGN_CENTER + this.FONT_LARGE + this.BOLD_ON);
      await this.printText('PRINTER TEST');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      await this.printSeparator('=');
      await this.printText('');
      await this.printText('If you can read this,');
      await this.printText('the printer is working!');
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
