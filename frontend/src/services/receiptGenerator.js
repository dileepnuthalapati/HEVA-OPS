/**
 * Heva One Frontend ESC/POS Receipt Generator
 * 
 * Generates ESC/POS thermal printer commands entirely on the frontend.
 * This makes the tablet the "brain" — receipts print even when offline.
 * 
 * Ported from: /backend/routers/receipts.py (generate_escpos_kitchen_receipt, generate_escpos_customer_receipt)
 */

// ESC/POS command constants
const ESC = 0x1B;
const GS = 0x1D;

const CMD = {
  INIT: [ESC, 0x40],
  CODEPAGE_858: [ESC, 0x74, 19],  // PC858 (£, €, common EU chars)
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_HW: [GS, 0x21, 0x11],   // Double height + double width
  DOUBLE_W: [GS, 0x21, 0x01],    // Double width only
  NORMAL: [GS, 0x21, 0x00],      // Normal size
  FEED_5: [ESC, 0x64, 0x05],     // Feed 5 lines
  CUT: [GS, 0x56, 0x00],         // Full cut
};

// Currency symbols
const CURRENCY_SYMBOLS = {
  GBP: '\u00a3',
  USD: '$',
  EUR: '\u20ac',
  INR: '\u20b9',
};

function getCurrencySymbol(currency) {
  return CURRENCY_SYMBOLS[currency] || currency + ' ';
}

/**
 * Convert a string to CP858-compatible bytes for thermal printers.
 * CP858 is single-byte encoding that supports £, €, and common chars.
 * UTF-8 multi-byte sequences cause garbled/zigzag characters on most printers.
 */
function textToBytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      // Map Unicode to CP858 byte values
      const CP858_MAP = {
        0x00A3: 0x9C, // £
        0x20AC: 0xD5, // € (CP858)
        0x00E9: 0x82, // é
        0x00E8: 0x8A, // è
        0x00F1: 0xA4, // ñ
        0x00FC: 0x81, // ü
        0x00E4: 0x84, // ä
        0x00F6: 0x94, // ö
        0x00DF: 0xE1, // ß
        0x00C9: 0x90, // É
        0x00E0: 0x85, // à
        0x00E2: 0x83, // â
        0x00A9: 0xA8, // ©
        0x00AE: 0xA9, // ®
        0x00B0: 0xF8, // °
        0x00B7: 0xFA, // ·
        0x2022: 0x07, // • (bell char as bullet)
        0x20B9: 0x3F, // ₹ (no CP858 equiv, use ?)
      };
      bytes.push(CP858_MAP[code] || 0x3F); // ? for unmapped chars
    }
  }
  return bytes;
}

/**
 * Build a byte array from mixed command arrays and text strings
 */
function buildCommands(...parts) {
  const bytes = [];
  for (const part of parts) {
    if (Array.isArray(part)) {
      bytes.push(...part);
    } else if (typeof part === 'string') {
      bytes.push(...textToBytes(part));
    }
  }
  return bytes;
}

/**
 * Convert byte array to base64 string (for sending to printer)
 */
function bytesToBase64(bytes) {
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/**
 * Generate ESC/POS Kitchen Receipt
 * 
 * @param {Object} order - The order object
 * @param {Object} businessInfo - Restaurant business info
 * @param {Object|null} tableInfo - Table info {number, name}
 * @returns {string} Base64-encoded ESC/POS commands
 */
export function generateKitchenReceipt(order, businessInfo = {}, tableInfo = null) {
  const bytes = buildCommands(
    CMD.INIT,
    CMD.CODEPAGE_858,
    // Header: centered, bold, double size
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    CMD.DOUBLE_HW,
    '** KITCHEN **\n',
    CMD.NORMAL,
    // Restaurant name
    businessInfo.name ? `${businessInfo.name}\n` : '',
    '\n',
    // Order number: big
    CMD.DOUBLE_HW,
    `Order #${String(order.order_number || 'N/A').padStart(3, '0')}\n`,
    CMD.NORMAL,
    // Table info
    ...(tableInfo ? [
      CMD.DOUBLE_W,
      `TABLE ${tableInfo.number}\n`,
      CMD.NORMAL,
    ] : []),
    '\n',
    // Left-align details
    CMD.ALIGN_LEFT,
    CMD.BOLD_OFF,
    `Server: ${order.created_by || 'N/A'}\n`,
    `Time: ${(order.created_at || '').substring(0, 19).replace('T', ' ')}\n`,
    '========================================\n',
    // Items: bold
    CMD.BOLD_ON,
  );

  // Add each item
  const itemBytes = [];
  for (const item of (order.items || [])) {
    const qty = item.quantity || 1;
    const name = item.product_name || 'Unknown';
    itemBytes.push(...buildCommands(
      CMD.DOUBLE_W,
      `${qty}x `,
      CMD.NORMAL,
      `${name}\n`,
    ));
    // Add item notes if present
    if (item.notes) {
      itemBytes.push(...buildCommands(`  >> ${item.notes}\n`));
    }
  }

  // Footer
  const footerBytes = buildCommands(
    CMD.BOLD_OFF,
    '========================================\n',
    // QR source indicator
    ...(order.source === 'qr' ? [
      CMD.ALIGN_CENTER,
      CMD.BOLD_ON,
      CMD.DOUBLE_HW,
      '*** QR ORDER ***\n',
      CMD.NORMAL,
      CMD.BOLD_OFF,
    ] : []),
    // Guest notes
    ...(order.guest_notes ? [
      CMD.ALIGN_LEFT,
      `Note: ${order.guest_notes}\n`,
    ] : []),
    CMD.FEED_5,
    CMD.CUT,
  );

  return bytesToBase64([...bytes, ...itemBytes, ...footerBytes]);
}

/**
 * Generate ESC/POS Customer Receipt
 * 
 * @param {Object} order - The completed order object
 * @param {Object} businessInfo - Restaurant business info
 * @param {Object|null} tableInfo - Table info {number, name}
 * @param {string} currency - Currency code (GBP, USD, EUR, INR)
 * @returns {string} Base64-encoded ESC/POS commands
 */
export function generateCustomerReceipt(order, businessInfo = {}, tableInfo = null, currency = 'GBP') {
  const sym = getCurrencySymbol(currency);

  const headerBytes = buildCommands(
    CMD.INIT,
    CMD.CODEPAGE_858,
    // Restaurant name: centered, bold, big
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    CMD.DOUBLE_HW,
    businessInfo.name ? `${businessInfo.name}\n` : 'RECEIPT\n',
    CMD.NORMAL,
    CMD.BOLD_OFF,
    // Address
    ...(businessInfo.address_line1 ? [`${businessInfo.address_line1}\n`] : []),
    ...((businessInfo.city && businessInfo.postcode) ? [`${businessInfo.city} ${businessInfo.postcode}\n`] : []),
    ...(businessInfo.phone ? [textToBytes(`Tel: ${businessInfo.phone}\n`)] : []),
    ...(businessInfo.vat_number ? [textToBytes(`VAT: ${businessInfo.vat_number}\n`)] : []),
    '\n',
    // Order details: left-aligned
    CMD.ALIGN_LEFT,
    `Order #: ${String(order.order_number || 'N/A').padStart(3, '0')}\n`,
    ...(tableInfo ? [`Table: ${tableInfo.number}\n`] : []),
    `Server: ${order.created_by || 'N/A'}\n`,
    `Date: ${(order.created_at || '').substring(0, 19).replace('T', ' ')}\n`,
    `Payment: ${(order.payment_method || 'N/A').toUpperCase()}\n`,
    '----------------------------------------\n',
  );

  // Items
  const itemBytes = [];
  for (const item of (order.items || [])) {
    const qty = item.quantity || 1;
    const name = (item.product_name || 'Unknown').substring(0, 20);
    const price = item.unit_price || 0;
    const total = item.total || 0;
    itemBytes.push(...textToBytes(`${qty}x ${name}\n`));
    itemBytes.push(...textToBytes(`   ${sym}${price.toFixed(2)} x ${qty} = ${sym}${total.toFixed(2)}\n`));
  }

  // Totals
  const subtotal = order.subtotal || 0;
  const tip = order.tip_amount || 0;
  const total = order.total_amount || 0;

  const totalBytes = buildCommands(
    '----------------------------------------\n',
    `${'Subtotal:'.padStart(30)} ${sym}${subtotal.toFixed(2)}\n`,
    ...(tip > 0 ? [
      `${`Tip (${order.tip_percentage || 0}%):`.padStart(30)} ${sym}${tip.toFixed(2)}\n`,
    ] : []),
    CMD.BOLD_ON,
    CMD.DOUBLE_W,
    `${'TOTAL:'.padStart(20)} ${sym}${total.toFixed(2)}\n`,
    CMD.NORMAL,
    CMD.BOLD_OFF,
    '\n',
    // Footer
    CMD.ALIGN_CENTER,
    businessInfo.receipt_footer ? `${businessInfo.receipt_footer}\n` : 'Thank you for your visit!\n',
    '\nPowered by Heva One\n',
    CMD.FEED_5,
    CMD.CUT,
  );

  return bytesToBase64([...headerBytes, ...itemBytes, ...totalBytes]);
}

/**
 * Generate ESC/POS Test Receipt
 * 
 * @param {Object} printer - Printer config {name, type, address, paper_width}
 * @returns {string} Base64-encoded ESC/POS commands
 */
export function generateTestReceipt(printer) {
  const charWidth = (printer.paper_width || 80) === 80 ? 48 : 32;
  const line = '-'.repeat(charWidth);
  const testChars = '1234567890'.repeat(Math.floor(charWidth / 10));
  const testAlpha = 'ABCDEFGHIJ'.repeat(Math.floor(charWidth / 10));

  const bytes = buildCommands(
    CMD.INIT,
    CMD.CODEPAGE_858,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    CMD.DOUBLE_HW,
    'PRINTER TEST\n',
    CMD.NORMAL,
    CMD.BOLD_OFF,
    `${printer.name}\n`,
    `Type: ${(printer.type || '').toUpperCase()}\n`,
    `Address: ${printer.address}\n`,
    '\n',
    CMD.ALIGN_LEFT,
    `${line}\n`,
    `${testChars}\n`,
    `${testAlpha}\n`,
    `${line}\n`,
    CMD.ALIGN_CENTER,
    '\nTest Successful!\n',
    `Paper Width: ${printer.paper_width || 80}mm\n`,
    CMD.FEED_5,
    CMD.CUT,
  );

  return bytesToBase64(bytes);
}
