// Thermal Printer Service using Web Serial API
class ThermalPrinterService {
  constructor() {
    this.port = null;
    this.writer = null;
    this.encoder = new TextEncoder();
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
  isSupported() {
    return 'serial' in navigator;
  }

  // Check if printer is connected
  isConnected() {
    return this.port !== null && this.writer !== null;
  }

  // Connect to printer
  async connect() {
    if (!this.isSupported()) {
      throw new Error('Web Serial API is not supported in this browser');
    }

    try {
      // Request a port
      this.port = await navigator.serial.requestPort();
      
      // Open the port
      await this.port.open({ 
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      this.writer = this.port.writable.getWriter();
      
      // Initialize printer
      await this.write(this.INIT);
      
      return true;
    } catch (error) {
      console.error('Failed to connect to printer:', error);
      throw error;
    }
  }

  // Disconnect from printer
  async disconnect() {
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
    
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
  }

  // Write data to printer
  async write(data) {
    if (!this.writer) {
      throw new Error('Printer not connected');
    }
    
    const encoded = this.encoder.encode(data);
    await this.writer.write(encoded);
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
  async printKitchenReceipt(order) {
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
  async printCustomerReceipt(order) {
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
      await this.printText(`Payment: ${order.payment_method.toUpperCase()}`);
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
        const total = `$${item.total.toFixed(2)}`.padStart(8);
        await this.printText(itemName + qty + total);
      }
      
      await this.printSeparator();
      
      // Subtotal
      await this.printText('Subtotal:'.padEnd(24) + `$${order.subtotal?.toFixed(2) || order.total_amount.toFixed(2)}`.padStart(8));
      
      // Tip
      if (order.tip_amount > 0) {
        await this.printText(`Tip (${order.tip_percentage}%):`.padEnd(24) + `$${order.tip_amount.toFixed(2)}`.padStart(8));
      }
      
      // Total
      await this.printSeparator();
      await this.write(this.FONT_DOUBLE + this.BOLD_ON);
      await this.printText('TOTAL:'.padEnd(12) + `$${order.total_amount.toFixed(2)}`.padStart(8));
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
}

export default new ThermalPrinterService();
