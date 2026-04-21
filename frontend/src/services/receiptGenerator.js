/**
 * Heva ONE Frontend ESC/POS Receipt Generator
 * 
 * Generates ESC/POS thermal printer commands entirely on the frontend.
 * This makes the tablet the "brain" — receipts print even when offline.
 * 
 * Supports: Kitchen Receipt, Customer Receipt, Delta (new items only) Kitchen Receipt
 */

// ESC/POS command constants
const ESC = 0x1B;
const GS = 0x1D;

const CMD = {
  INIT: [ESC, 0x40],
  CODEPAGE_858: [ESC, 0x74, 19],  // PC858 (£, €, common EU chars)
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_HW: [GS, 0x21, 0x11],   // Double height + double width
  DOUBLE_W: [GS, 0x21, 0x01],    // Double width only
  NORMAL: [GS, 0x21, 0x00],      // Normal size
  FEED_5: [ESC, 0x64, 0x05],     // Feed 5 lines
  CUT: [GS, 0x56, 0x00],         // Full cut
  LINE_SPACING: [ESC, 0x33, 30], // Set line spacing to 30 dots (~1.2x)
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

// Order type display labels
const ORDER_TYPE_LABELS = {
  'dine_in': 'DINE IN',
  'takeaway': 'TAKEAWAY',
  'eat_in': 'EAT IN',
};

/**
 * Convert a string to CP858-compatible bytes for thermal printers.
 */
function textToBytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      const CP858_MAP = {
        0x00A3: 0x9C, // £
        0x20AC: 0xD5, // € (CP858)
        0x00E9: 0x82, 0x00E8: 0x8A, 0x00F1: 0xA4, 0x00FC: 0x81,
        0x00E4: 0x84, 0x00F6: 0x94, 0x00DF: 0xE1, 0x00C9: 0x90,
        0x00E0: 0x85, 0x00E2: 0x83, 0x00A9: 0xA8, 0x00AE: 0xA9,
        0x00B0: 0xF8, 0x00B7: 0xFA, 0x2022: 0x07, 0x20B9: 0x3F,
      };
      bytes.push(CP858_MAP[code] || 0x3F);
    }
  }
  return bytes;
}

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

function bytesToBase64(bytes) {
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/**
 * Format a line with left-aligned text and right-aligned price.
 * Uses fixed character width (32 chars for 58mm, 42 for 80mm).
 */
function formatLine(left, right, charWidth = 32) {
  const maxLeft = charWidth - right.length - 1;
  const trimmedLeft = left.length > maxLeft ? left.substring(0, maxLeft) : left;
  const padding = charWidth - trimmedLeft.length - right.length;
  return trimmedLeft + ' '.repeat(Math.max(1, padding)) + right;
}

/**
 * Get order type header for receipts.
 */
function getOrderTypeHeader(order, tableInfo) {
  if (tableInfo) {
    return `TABLE ${tableInfo.number}`;
  }
  const type = order.order_type || (order.table_id ? 'dine_in' : 'takeaway');
  return ORDER_TYPE_LABELS[type] || 'TAKEAWAY';
}

/**
 * Get character width based on paper size.
 * 58mm ≈ 32 chars, 80mm ≈ 42 chars
 */
function getCharWidth(paperWidth) {
  if (paperWidth === 58) return 32;
  return 42; // 80mm default
}

/**
 * Generate ESC/POS Kitchen Receipt (full order)
 */
export function generateKitchenReceipt(order, businessInfo = {}, tableInfo = null, paperWidth = 80) {
  const orderTypeLabel = getOrderTypeHeader(order, tableInfo);

  const bytes = buildCommands(
    CMD.INIT,
    CMD.CODEPAGE_858,
    CMD.LINE_SPACING,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    CMD.DOUBLE_HW,
    '** KITCHEN **\n',
    CMD.NORMAL,
    businessInfo.name ? `${businessInfo.name}\n` : '',
    '\n',
    // Order number + type: big and bold
    CMD.DOUBLE_HW,
    `#${String(order.order_number || 'N/A').padStart(3, '0')}\n`,
    `${orderTypeLabel}\n`,
    CMD.NORMAL,
    '\n',
    CMD.ALIGN_LEFT,
    CMD.BOLD_OFF,
    `Server: ${order.created_by || 'N/A'}\n`,
    `Time: ${(order.created_at || '').substring(11, 16)}\n`,
    '================================\n',
  );

  const itemBytes = [];
  for (const item of (order.items || [])) {
    const qty = item.quantity || 1;
    const name = item.product_name || 'Unknown';
    // Items: BOLD + DOUBLE WIDTH for kitchen readability
    itemBytes.push(...buildCommands(
      CMD.BOLD_ON,
      CMD.DOUBLE_W,
      `${qty}x ${name}\n`,
      CMD.NORMAL,
    ));
    if (item.notes) {
      itemBytes.push(...buildCommands(CMD.BOLD_OFF, `   >> ${item.notes}\n`));
    }
  }

  const footerBytes = buildCommands(
    CMD.BOLD_OFF,
    '================================\n',
    ...(order.source === 'qr' ? [
      CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HW,
      '*** QR ORDER ***\n', CMD.NORMAL, CMD.BOLD_OFF,
    ] : []),
    ...(order.guest_notes ? [CMD.ALIGN_LEFT, `Note: ${order.guest_notes}\n`] : []),
    CMD.FEED_5,
    CMD.CUT,
  );

  return bytesToBase64([...bytes, ...itemBytes, ...footerBytes]);
}

/**
 * Generate Delta Kitchen Receipt (NEW items only — for order updates)
 * Only prints items where printed_to_kitchen !== true
 */
export function generateDeltaKitchenReceipt(order, businessInfo = {}, tableInfo = null, paperWidth = 80) {
  const newItems = (order.items || []).filter(item => !item.printed_to_kitchen);
  if (newItems.length === 0) return null;

  const orderTypeLabel = getOrderTypeHeader(order, tableInfo);

  const bytes = buildCommands(
    CMD.INIT,
    CMD.CODEPAGE_858,
    CMD.LINE_SPACING,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    CMD.DOUBLE_HW,
    '** NEW ITEMS **\n',
    CMD.NORMAL,
    businessInfo.name ? `${businessInfo.name}\n` : '',
    '\n',
    CMD.DOUBLE_HW,
    `#${String(order.order_number || 'N/A').padStart(3, '0')}\n`,
    `${orderTypeLabel}\n`,
    CMD.NORMAL,
    '\n',
    CMD.ALIGN_LEFT,
    CMD.BOLD_OFF,
    `Server: ${order.created_by || 'N/A'}\n`,
    `Time: ${(order.created_at || '').substring(11, 16)}\n`,
    '================================\n',
  );

  const itemBytes = [];
  for (const item of newItems) {
    const qty = item.quantity || 1;
    const name = item.product_name || 'Unknown';
    itemBytes.push(...buildCommands(
      CMD.BOLD_ON,
      CMD.DOUBLE_W,
      `${qty}x ${name}\n`,
      CMD.NORMAL,
    ));
    if (item.notes) {
      itemBytes.push(...buildCommands(CMD.BOLD_OFF, `   >> ${item.notes}\n`));
    }
  }

  const footerBytes = buildCommands(
    CMD.BOLD_OFF,
    '================================\n',
    CMD.ALIGN_CENTER,
    `(${newItems.length} new item${newItems.length > 1 ? 's' : ''} added)\n`,
    CMD.FEED_5,
    CMD.CUT,
  );

  return bytesToBase64([...bytes, ...itemBytes, ...footerBytes]);
}

/**
 * Generate ESC/POS Customer Receipt — with fixed layout for thermal printers
 * Uses monospaced formatting to prevent text overlap.
 */
export function generateCustomerReceipt(order, businessInfo = {}, tableInfo = null, currency = 'GBP', paperWidth = 80) {
  const sym = getCurrencySymbol(currency);
  const CHAR_WIDTH = getCharWidth(paperWidth);
  const line = '-'.repeat(CHAR_WIDTH);
  const orderTypeLabel = getOrderTypeHeader(order, tableInfo);

  const headerBytes = buildCommands(
    CMD.INIT,
    CMD.CODEPAGE_858,
    CMD.LINE_SPACING,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    CMD.DOUBLE_HW,
    businessInfo.name ? `${businessInfo.name}\n` : 'RECEIPT\n',
    CMD.NORMAL,
    CMD.BOLD_OFF,
    ...(businessInfo.address_line1 ? [`${businessInfo.address_line1}\n`] : []),
    ...((businessInfo.city && businessInfo.postcode) ? [`${businessInfo.city} ${businessInfo.postcode}\n`] : []),
    ...(businessInfo.phone ? [`Tel: ${businessInfo.phone}\n`] : []),
    ...(businessInfo.vat_number ? [`VAT: ${businessInfo.vat_number}\n`] : []),
    '\n',
    // Order type: bold, double width
    CMD.BOLD_ON,
    CMD.DOUBLE_W,
    `${orderTypeLabel}\n`,
    CMD.NORMAL,
    CMD.BOLD_OFF,
    '\n',
    CMD.ALIGN_LEFT,
    `Order: #${String(order.order_number || 'N/A').padStart(3, '0')}\n`,
    ...(tableInfo ? [`Table: ${tableInfo.number}\n`] : []),
    `Server: ${order.created_by || 'N/A'}\n`,
    `Date: ${(order.created_at || '').substring(0, 16).replace('T', ' ')}\n`,
    `Payment: ${(order.payment_method || 'N/A').toUpperCase()}\n`,
    `${line}\n`,
  );

  // Items — using fixed-width formatting to prevent overlap
  const itemBytes = [];
  for (const item of (order.items || [])) {
    const qty = item.quantity || 1;
    const name = (item.product_name || 'Unknown');
    const total = item.total || 0;
    const priceStr = `${sym}${total.toFixed(2)}`;
    // Line: "2x Burger         £12.00"
    const itemLine = formatLine(`${qty}x ${name}`, priceStr, CHAR_WIDTH);
    itemBytes.push(...textToBytes(`${itemLine}\n`));
  }

  // Totals — right-aligned with clear formatting
  const subtotal = order.subtotal || 0;
  const discount = order.discount_amount || 0;
  const tip = order.tip_amount || 0;
  const total = order.total_amount || 0;

  const totalBytes = buildCommands(
    `${line}\n`,
    formatLine('Subtotal', `${sym}${subtotal.toFixed(2)}`, CHAR_WIDTH) + '\n',
    ...(discount > 0 ? [formatLine('Discount', `-${sym}${discount.toFixed(2)}`, CHAR_WIDTH) + '\n'] : []),
    ...(tip > 0 ? [formatLine(`Tip (${order.tip_percentage || 0}%)`, `${sym}${tip.toFixed(2)}`, CHAR_WIDTH) + '\n'] : []),
    `${line}\n`,
    CMD.BOLD_ON,
    CMD.DOUBLE_W,
  );

  // Total line — centered, big, bold
  const totalLine = formatLine('TOTAL', `${sym}${total.toFixed(2)}`, Math.floor(CHAR_WIDTH / 2));
  const totalLineBytes = buildCommands(
    `${totalLine}\n`,
    CMD.NORMAL,
    CMD.BOLD_OFF,
    '\n',
    CMD.ALIGN_CENTER,
    businessInfo.receipt_footer ? `${businessInfo.receipt_footer}\n` : 'Thank you for your visit!\n',
    '\nPowered by Heva ONE\n',
    CMD.FEED_5,
    CMD.CUT,
  );

  return bytesToBase64([...headerBytes, ...itemBytes, ...totalBytes, ...totalLineBytes]);
}

/**
 * Generate ESC/POS Test Receipt
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
    // Test price alignment
    formatLine('Test Item Name', '\u00a312.50', charWidth) + '\n',
    formatLine('Long Product Name Here', '\u00a3999.99', charWidth) + '\n',
    `${line}\n`,
    CMD.ALIGN_CENTER,
    '\nTest Successful!\n',
    `Paper Width: ${printer.paper_width || 80}mm\n`,
    CMD.FEED_5,
    CMD.CUT,
  );

  return bytesToBase64(bytes);
}
