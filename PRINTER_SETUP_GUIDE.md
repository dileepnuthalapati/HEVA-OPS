# HevaPOS - Printer Connection Guide

## How to Connect Printers to HevaPOS

HevaPOS supports multiple printer connection methods depending on your hardware setup.

---

## 🔌 Connection Options

### 1. USB Thermal Printers (Currently Implemented) ✅

**What you need:**
- USB thermal printer (ESC/POS compatible)
- Chrome or Edge browser (version 89+)
- Windows, macOS, or Linux computer

**How to connect:**
1. Plug the USB thermal printer into your computer
2. Open HevaPOS in Chrome/Edge browser
3. Click the "Connect Printer" button on POS screen
4. Select your printer from the popup dialog
5. Grant permission when prompted
6. Printer is now connected!

**Supported printers:**
- Epson TM series (TM-T20, TM-T88)
- Star Micronics TSP series
- Bixolon SRP series
- Most ESC/POS compatible thermal printers

**Limitations:**
- ✅ Works perfectly for kitchen and customer receipts
- ❌ Only one printer at a time
- ❌ Printer must be USB-connected to the computer running the browser

---

### 2. Bluetooth Printers (Needs Implementation) 🔵

**What you need:**
- Bluetooth-enabled thermal printer (BLE support)
- Chrome or Edge browser (version 89+)
- Device with Bluetooth (laptop, tablet, phone)

**Current Status:** Not yet implemented (can be added)

**How it would work:**
1. Turn on Bluetooth printer
2. Click "Connect Bluetooth Printer" in HevaPOS
3. Select printer from Bluetooth device list
4. Pair and connect

**Would support:**
- Star Micronics SM-S series
- Epson TM-P20 / TM-P80
- Zebra ZQ series
- Any Bluetooth ESC/POS printer

**Would you like me to implement Bluetooth printer support?**

---

### 3. WiFi/Network Printers (Needs Backend Service) 📡

**What you need:**
- Network-connected thermal printer (Ethernet or WiFi)
- Printer and computer on the same network
- Backend printing service (needs to be set up)

**Current Status:** Not implemented (requires server-side printing)

**Two approaches:**

#### Option A: Backend Print Server
```
Browser → Backend Server → Network Printer
```
- Backend server handles all printing
- Printers configured on server side
- Works from any device/browser
- Best for multiple terminals

#### Option B: Local Print Service
```
Browser → Local Print Service → Network Printer
```
- Small app runs on each terminal
- Receives print jobs from browser
- Sends to network printer
- Simpler setup for single location

**Would you like me to implement network printer support?**

---

## 🎯 Recommended Setup for Restaurants

### Small Restaurant (1-2 terminals)
**Best: USB Thermal Printers**
- Cheapest option ($100-200)
- Most reliable
- Easy to set up
- Use Chrome/Edge on each terminal

### Medium Restaurant (3-5 terminals)
**Best: WiFi Network Printers**
- One printer per station (kitchen, bar, etc.)
- All connected via restaurant WiFi
- Requires backend print service
- More flexible

### Large Restaurant (6+ terminals)
**Best: Centralized Print Server**
- Multiple network printers
- Backend handles all printing
- Works from tablets, phones, computers
- Professional setup

---

## 📝 Printer Recommendations

### Budget Option ($100-150)
- **Epson TM-T20II** (USB)
- Reliable, fast printing
- ESC/POS compatible
- USB connection

### Mid-Range ($200-300)
- **Star Micronics TSP143IIIU** (USB)
- **Epson TM-T88V** (USB/Ethernet)
- Faster, more durable
- Kitchen-grade

### Professional ($300-500)
- **Star Micronics TSP654II** (Ethernet/WiFi)
- **Epson TM-T88VI** (Ethernet/WiFi/Bluetooth)
- Network-ready
- Multiple connection options
- Best for busy restaurants

---

## 🔧 Current Implementation Details

### USB Printing (Web Serial API)
```javascript
// Automatic fallback system:
if (printerConnected) {
  // Try thermal printer first
  await printerService.printKitchenReceipt(order);
} else {
  // Fallback to PDF download
  downloadPDF(kitchenReceipt, 'kitchen.pdf');
}
```

### What Prints:
**Kitchen Receipt:**
- Order number (e.g., #001, #002)
- Items and quantities
- Server name
- Order time

**Customer Receipt:**
- Order number
- Itemized bill
- Subtotal
- Tip amount and percentage
- Grand total
- Payment method
- "Thank you" message

---

## 🚀 Next Steps

**Want to implement additional printer support?**

1. **Bluetooth Printers**: I can add Web Bluetooth API support
2. **Network Printers**: I can add backend printing service
3. **Multiple Printers**: Route different receipts to different printers (kitchen vs customer)

Let me know which connection method you need, and I'll implement it!

---

## 💡 Tips for Best Results

1. **Use Chrome or Edge** - Best Web Serial API support
2. **One printer per station** - Kitchen gets orders, front gets customer receipts
3. **Test first** - Always test with sample orders
4. **Keep drivers updated** - Update printer firmware/drivers
5. **Paper quality** - Use quality thermal paper for best prints

---

## ❓ Common Questions

**Q: Can I use a regular office printer?**
A: Not with the current Web Serial API implementation. Regular printers need different drivers.

**Q: Do I need special paper?**
A: Yes, thermal printers use thermal paper (no ink required).

**Q: Can I print from a tablet or iPad?**
A: USB printing only works on desktop browsers. For tablets, we'd need Bluetooth or network printing.

**Q: Can I have one printer for kitchen and another for customer receipts?**
A: Not with current implementation, but I can add multi-printer support!

---

**Need help setting up? Let me know your specific printer model and setup!**
