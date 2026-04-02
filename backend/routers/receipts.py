from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from database import db
from dependencies import get_current_user
from models import User
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table as ReportLabTable, TableStyle, Paragraph, Spacer
from io import BytesIO
import base64

router = APIRouter()


# ===== PDF Receipt Endpoints =====

@router.post("/orders/{order_id}/print-kitchen-receipt")
async def print_kitchen_receipt(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    business_info = restaurant.get("business_info", {}) if restaurant else {}

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle('KitchenTitle', parent=styles['Heading1'], fontSize=28, textColor=colors.HexColor('#0f172a'), spaceAfter=20, alignment=1)
    story.append(Paragraph("KITCHEN ORDER", title_style))
    story.append(Spacer(1, 10))

    if business_info.get('name'):
        story.append(Paragraph(f"<b>{business_info['name']}</b>", styles['Normal']))
    if business_info.get('address_line1'):
        address_parts = [business_info['address_line1']]
        if business_info.get('city'):
            address_parts.append(business_info['city'])
        story.append(Paragraph(", ".join(address_parts), styles['Normal']))
    if business_info.get('phone'):
        story.append(Paragraph(f"Tel: {business_info['phone']}", styles['Normal']))

    story.append(Spacer(1, 15))
    story.append(Paragraph(f"Order #: {str(order['order_number']).zfill(3)}", styles['Heading2']))
    story.append(Paragraph(f"Server: {order['created_by']}", styles['Normal']))
    story.append(Paragraph(f"Time: {datetime.fromisoformat(order['created_at']).strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Spacer(1, 20))

    story.append(Paragraph("ITEMS:", styles['Heading2']))
    story.append(Spacer(1, 10))

    table_data = [["Item", "Qty"]]
    for item in order['items']:
        table_data.append([item['product_name'], str(item['quantity'])])

    table = ReportLabTable(table_data, colWidths=[300, 100])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 14),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('FONTSIZE', (0, 1), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey)
    ]))
    story.append(table)
    doc.build(story)
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=kitchen_receipt_{order['id'][:8]}.pdf"})


@router.post("/orders/{order_id}/print-customer-receipt")
async def print_customer_receipt(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] != "completed":
        raise HTTPException(status_code=400, detail="Order must be completed first")

    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    business_info = restaurant.get("business_info", {}) if restaurant else {}

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle('ReceiptTitle', parent=styles['Heading1'], fontSize=24, textColor=colors.HexColor('#0f172a'), spaceAfter=15, alignment=1)
    story.append(Paragraph("CUSTOMER RECEIPT", title_style))
    story.append(Spacer(1, 10))

    restaurant_name_style = ParagraphStyle('RestaurantName', parent=styles['Heading2'], fontSize=20, textColor=colors.HexColor('#0f172a'), spaceAfter=5, alignment=1)

    if business_info.get('name'):
        story.append(Paragraph(f"<b>{business_info['name']}</b>", restaurant_name_style))
    if business_info.get('address_line1'):
        story.append(Paragraph(business_info['address_line1'], styles['Normal']))
    if business_info.get('address_line2'):
        story.append(Paragraph(business_info['address_line2'], styles['Normal']))
    if business_info.get('city') and business_info.get('postcode'):
        story.append(Paragraph(f"{business_info['city']} {business_info['postcode']}", styles['Normal']))
    if business_info.get('phone'):
        story.append(Paragraph(f"Tel: {business_info['phone']}", styles['Normal']))
    if business_info.get('email'):
        story.append(Paragraph(f"Email: {business_info['email']}", styles['Normal']))
    if business_info.get('vat_number'):
        story.append(Paragraph(f"VAT No: {business_info['vat_number']}", styles['Normal']))

    story.append(Spacer(1, 15))
    story.append(Paragraph(f"Order #: {str(order['order_number']).zfill(3)}", styles['Normal']))
    story.append(Paragraph(f"Server: {order['created_by']}", styles['Normal']))
    story.append(Paragraph(f"Date: {datetime.fromisoformat(order['created_at']).strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Paragraph(f"Payment: {order['payment_method'].upper()}", styles['Normal']))
    story.append(Spacer(1, 20))

    table_data = [["Item", "Qty", "Price", "Total"]]
    for item in order['items']:
        table_data.append([item['product_name'], str(item['quantity']), f"${item['unit_price']:.2f}", f"${item['total']:.2f}"])

    table_data.append(["", "", "", ""])
    table_data.append(["", "", "Subtotal:", f"{order.get('subtotal', 0):.2f}"])
    if order.get('tip_amount', 0) > 0:
        table_data.append(["", "", f"Tip ({order.get('tip_percentage', 0)}%)", f"{order.get('tip_amount', 0):.2f}"])
    table_data.append(["", "", "TOTAL:", f"{order.get('total_amount', 0):.2f}"])

    table = ReportLabTable(table_data, colWidths=[200, 80, 80, 100])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('FONTSIZE', (0, 1), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -2), 1, colors.grey),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 14),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#10B981'))
    ]))
    story.append(table)
    story.append(Spacer(1, 20))

    if business_info.get('receipt_footer'):
        story.append(Paragraph(business_info['receipt_footer'], styles['Normal']))
    else:
        story.append(Paragraph("Thank you for your visit!", styles['Normal']))
    if business_info.get('website'):
        story.append(Paragraph(f"Visit us at: {business_info['website']}", styles['Normal']))

    story.append(Spacer(1, 20))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=10, textColor=colors.grey, alignment=1)
    story.append(Paragraph("Powered by HevaPOS", footer_style))
    story.append(Paragraph("www.hevapos.com", footer_style))

    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=customer_receipt_{order['id'][:8]}.pdf"})


# ===== ESC/POS Receipt Endpoints =====

@router.post("/print/kitchen/{order_id}")
async def print_kitchen_receipt_escpos(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    business_info = restaurant.get("business_info", {}) if restaurant else {}

    table_info = None
    if order.get("table_id"):
        table = await db.tables.find_one({"id": order["table_id"]}, {"_id": 0})
        if table:
            table_info = {"number": table["number"], "name": table.get("name", f"Table {table['number']}")}

    commands = generate_escpos_kitchen_receipt(order, business_info, table_info)
    return {"order_id": order_id, "order_number": order.get("order_number", "N/A"), "commands": commands, "table": table_info}


@router.post("/print/customer/{order_id}")
async def print_customer_receipt_escpos(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] != "completed":
        raise HTTPException(status_code=400, detail="Order must be completed first")

    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    business_info = restaurant.get("business_info", {}) if restaurant else {}

    table_info = None
    if order.get("table_id"):
        table = await db.tables.find_one({"id": order["table_id"]}, {"_id": 0})
        if table:
            table_info = {"number": table["number"], "name": table.get("name", f"Table {table['number']}")}

    currency = restaurant.get("currency", "GBP") if restaurant else "GBP"

    commands = generate_escpos_customer_receipt(order, business_info, table_info, currency)
    return {"order_id": order_id, "order_number": order.get("order_number", "N/A"), "commands": commands, "table": table_info}


# ===== ESC/POS Helper Functions =====

def generate_escpos_test_receipt(printer: dict) -> str:
    width = printer.get("paper_width", 80)
    char_width = 48 if width == 80 else 32
    commands = bytearray()
    commands.extend([0x1B, 0x40])
    commands.extend([0x1B, 0x61, 0x01])
    commands.extend([0x1B, 0x45, 0x01])
    commands.extend([0x1D, 0x21, 0x11])
    commands.extend(b"PRINTER TEST\n")
    commands.extend([0x1D, 0x21, 0x00])
    commands.extend([0x1B, 0x45, 0x00])
    commands.extend(f"{printer['name']}\n".encode())
    commands.extend(f"Type: {printer['type'].upper()}\n".encode())
    commands.extend(f"Address: {printer['address']}\n".encode())
    commands.extend(b"\n")
    commands.extend([0x1B, 0x61, 0x00])
    commands.extend(("-" * char_width + "\n").encode())
    commands.extend(b"1234567890" * (char_width // 10) + b"\n")
    commands.extend(b"ABCDEFGHIJ" * (char_width // 10) + b"\n")
    commands.extend(("-" * char_width + "\n").encode())
    commands.extend([0x1B, 0x61, 0x01])
    commands.extend(b"\nTest Successful!\n")
    commands.extend(f"Paper Width: {width}mm\n".encode())
    commands.extend([0x1B, 0x64, 0x05])
    commands.extend([0x1D, 0x56, 0x00])
    return base64.b64encode(commands).decode()


def generate_escpos_kitchen_receipt(order: dict, business_info: dict, table_info: dict = None) -> str:
    commands = bytearray()
    commands.extend([0x1B, 0x40])
    commands.extend([0x1B, 0x61, 0x01])
    commands.extend([0x1B, 0x45, 0x01])
    commands.extend([0x1D, 0x21, 0x11])
    commands.extend(b"** KITCHEN **\n")
    commands.extend([0x1D, 0x21, 0x00])
    if business_info.get('name'):
        commands.extend(f"{business_info['name']}\n".encode())
    commands.extend(b"\n")
    commands.extend([0x1D, 0x21, 0x11])
    commands.extend(f"Order #{str(order.get('order_number', 'N/A')).zfill(3)}\n".encode())
    commands.extend([0x1D, 0x21, 0x00])
    if table_info:
        commands.extend([0x1D, 0x21, 0x01])
        commands.extend(f"TABLE {table_info['number']}\n".encode())
        commands.extend([0x1D, 0x21, 0x00])
    commands.extend(b"\n")
    commands.extend([0x1B, 0x61, 0x00])
    commands.extend([0x1B, 0x45, 0x00])
    commands.extend(f"Server: {order.get('created_by', 'N/A')}\n".encode())
    commands.extend(f"Time: {order.get('created_at', '')[:19].replace('T', ' ')}\n".encode())
    commands.extend(b"=" * 40 + b"\n")
    commands.extend([0x1B, 0x45, 0x01])
    for item in order.get('items', []):
        qty = item.get('quantity', 1)
        name = item.get('product_name', 'Unknown')
        commands.extend([0x1D, 0x21, 0x01])
        commands.extend(f"{qty}x ".encode())
        commands.extend([0x1D, 0x21, 0x00])
        commands.extend(f"{name}\n".encode())
    commands.extend([0x1B, 0x45, 0x00])
    commands.extend(b"=" * 40 + b"\n")
    commands.extend([0x1B, 0x64, 0x05])
    commands.extend([0x1D, 0x56, 0x00])
    return base64.b64encode(commands).decode()


def generate_escpos_customer_receipt(order: dict, business_info: dict, table_info: dict = None, currency: str = "GBP") -> str:
    symbols = {'GBP': '\u00a3', 'USD': '$', 'EUR': '\u20ac', 'INR': '\u20b9'}
    sym = symbols.get(currency, currency + ' ')
    commands = bytearray()
    commands.extend([0x1B, 0x40])
    commands.extend([0x1B, 0x61, 0x01])
    commands.extend([0x1B, 0x45, 0x01])
    commands.extend([0x1D, 0x21, 0x11])
    if business_info.get('name'):
        commands.extend(f"{business_info['name']}\n".encode())
    else:
        commands.extend(b"RECEIPT\n")
    commands.extend([0x1D, 0x21, 0x00])
    commands.extend([0x1B, 0x45, 0x00])
    if business_info.get('address_line1'):
        commands.extend(f"{business_info['address_line1']}\n".encode())
    if business_info.get('city') and business_info.get('postcode'):
        commands.extend(f"{business_info['city']} {business_info['postcode']}\n".encode())
    if business_info.get('phone'):
        commands.extend(f"Tel: {business_info['phone']}\n".encode())
    if business_info.get('vat_number'):
        commands.extend(f"VAT: {business_info['vat_number']}\n".encode())
    commands.extend(b"\n")
    commands.extend([0x1B, 0x61, 0x00])
    commands.extend(f"Order #: {str(order.get('order_number', 'N/A')).zfill(3)}\n".encode())
    if table_info:
        commands.extend(f"Table: {table_info['number']}\n".encode())
    commands.extend(f"Server: {order.get('created_by', 'N/A')}\n".encode())
    commands.extend(f"Date: {order.get('created_at', '')[:19].replace('T', ' ')}\n".encode())
    commands.extend(f"Payment: {order.get('payment_method', 'N/A').upper()}\n".encode())
    commands.extend(b"-" * 40 + b"\n")
    for item in order.get('items', []):
        qty = item.get('quantity', 1)
        name = item.get('product_name', 'Unknown')[:20]
        price = item.get('unit_price', 0)
        total = item.get('total', 0)
        commands.extend(f"{qty}x {name}\n".encode())
        commands.extend(f"   {sym}{price:.2f} x {qty} = {sym}{total:.2f}\n".encode())
    commands.extend(b"-" * 40 + b"\n")
    subtotal = order.get('subtotal', 0)
    tip = order.get('tip_amount', 0)
    total = order.get('total_amount', 0)
    commands.extend(f"{'Subtotal:':>30} {sym}{subtotal:.2f}\n".encode())
    if tip > 0:
        tip_pct = order.get('tip_percentage', 0)
        commands.extend(f"{f'Tip ({tip_pct}%):':>30} {sym}{tip:.2f}\n".encode())
    commands.extend([0x1B, 0x45, 0x01])
    commands.extend([0x1D, 0x21, 0x01])
    commands.extend(f"{'TOTAL:':>20} {sym}{total:.2f}\n".encode())
    commands.extend([0x1D, 0x21, 0x00])
    commands.extend([0x1B, 0x45, 0x00])
    commands.extend(b"\n")
    commands.extend([0x1B, 0x61, 0x01])
    if business_info.get('receipt_footer'):
        commands.extend(f"{business_info['receipt_footer']}\n".encode())
    else:
        commands.extend(b"Thank you for your visit!\n")
    commands.extend(b"\nPowered by HevaPOS\n")
    commands.extend([0x1B, 0x64, 0x05])
    commands.extend([0x1D, 0x56, 0x00])
    return base64.b64encode(commands).decode()
