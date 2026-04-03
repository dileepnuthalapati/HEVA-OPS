"""
Feature guide PDF generator for HevaPOS sales pitching.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from dependencies import require_admin
from models import User
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.units import inch
from io import BytesIO

router = APIRouter()


@router.get("/docs/feature-guide")
async def generate_feature_guide(current_user: User = Depends(require_admin)):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40, leftMargin=50, rightMargin=50)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('FGTitle', parent=styles['Heading1'], fontSize=28, textColor=colors.HexColor('#0f172a'), spaceAfter=20, alignment=1)
    subtitle_style = ParagraphStyle('FGSubtitle', parent=styles['Normal'], fontSize=12, textColor=colors.HexColor('#64748b'), alignment=1, spaceAfter=30)
    h2_style = ParagraphStyle('FGH2', parent=styles['Heading2'], fontSize=16, textColor=colors.HexColor('#1e293b'), spaceBefore=18, spaceAfter=10)
    body_style = ParagraphStyle('FGBody', parent=styles['Normal'], fontSize=10, leading=14, textColor=colors.HexColor('#334155'))
    bullet_style = ParagraphStyle('FGBullet', parent=styles['Normal'], fontSize=10, leading=14, textColor=colors.HexColor('#334155'), leftIndent=20, bulletIndent=10)

    story = []

    # Cover
    story.append(Spacer(1, 80))
    story.append(Paragraph("HevaPOS", title_style))
    story.append(Paragraph("Enterprise Cloud POS for Restaurants", subtitle_style))
    story.append(Spacer(1, 20))

    cover_data = [
        ["Version", "2.0 (War-Ready Edition)"],
        ["Platform", "Cloud SaaS + Android/iOS Tablet"],
        ["Tech Stack", "FastAPI, React, MongoDB Atlas, WebSockets"],
        ["Hardware", "ESC/POS Thermal Printers (WiFi, Bluetooth, USB)"],
    ]
    cover_table = RTable(cover_data, colWidths=[150, 280])
    cover_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#334155')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(cover_table)
    story.append(PageBreak())

    # 1. Core POS
    story.append(Paragraph("1. Core POS System", h2_style))
    for line in [
        "Full-screen responsive POS optimised for tablets and touchscreens",
        "Real-time product grid with category filtering and search",
        "Cart management: add, remove, edit quantities, apply discounts",
        "Order notes and special instructions per order",
        "Split payment support: Cash, Card, or Split (cash + card)",
        "Double-click prevention: button debouncing prevents duplicate orders",
        "Offline mode: orders saved locally and synced when back online",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 2. Table Management
    story.append(Paragraph("2. Table Management", h2_style))
    for line in [
        "Visual table layout with real-time status (Available, Occupied, Reserved)",
        "Table merge/split for large groups",
        "Reservation system with time slots and customer details",
        "QR Code generator per table (downloadable PNG for printing)",
        "Auto-release tables after payment",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 3. QR Table Ordering
    story.append(Paragraph("3. QR Table Ordering (Guest Self-Service)", h2_style))
    for line in [
        "Guests scan a QR code on their table to view a premium mobile menu",
        "No app download required - works in any mobile browser",
        "Guests browse categories, add items to cart, and place orders",
        "Orders appear instantly on POS and KDS via WebSockets",
        "QR Ordering Kill Switch: admin can disable QR ordering in real-time",
        "Rate-limited to prevent abuse/pranking",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 4. Stripe Pay-at-Table
    story.append(Paragraph("4. Stripe Pay-at-Table", h2_style))
    for line in [
        "After ordering, guests can tap 'Pay Bill' to open Stripe Checkout",
        "Secure PCI-compliant card payments without staff intervention",
        "Webhook integration: order status updates to PAID automatically",
        "Real-time sync: POS and table status update instantly via WebSocket",
        "Support for multiple currencies (GBP, USD, EUR, INR)",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(PageBreak())

    # 5. Kitchen Display System
    story.append(Paragraph("5. Kitchen Display System (KDS)", h2_style))
    for line in [
        "Full-screen dark-mode display optimised for 18-24 inch monitors",
        "Color-coded ticket lifecycle: NEW (red) -> SEEN (amber) -> COOKING (yellow) -> READY (green)",
        "Live wait timer on each ticket (mm:ss format)",
        "Keyboard shortcuts: press 1-9 to bump tickets (for wireless keypads)",
        "Sound alerts for new incoming orders",
        "Recall functionality to bring back completed tickets",
        "WebSocket-powered: zero-latency updates from POS and QR orders",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 6. Void/Audit System
    story.append(Paragraph("6. Void/Audit Security System", h2_style))
    for line in [
        "Every void/cancel triggers a mandatory reason modal",
        "Quick-tap reasons: Mispunch, Customer Change, Kitchen Error, Testing, Out of Stock",
        "Optional 100-character free-text note for detail",
        "Staff users require Manager PIN authorisation to void any order",
        "Immutable audit trail: timestamps, user IDs, original amounts, reasons",
        "Audit Log viewer with filtering and search for restaurant admins",
        "Manager override tracked: audit shows exactly which manager approved",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 7. Revenue Dashboard
    story.append(Paragraph("7. Revenue Analytics Dashboard", h2_style))
    for line in [
        "Today's key metrics: Total Sales, Orders, Average Order, Table Occupancy",
        "Cash vs Card breakdown with live totals",
        "Hourly revenue chart (interactive area chart)",
        "Top selling products ranking",
        "Kitchen Efficiency widget: average preparation time",
        "QR vs POS order split tracking",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 8. Reports & PDF Export
    story.append(Paragraph("8. Reports & PDF Export", h2_style))
    for line in [
        "Date-range sales reports with complete order breakdown",
        "Real PDF download (server-generated, not browser-only)",
        "Report includes: summary, cash/card split, order-by-order detail",
        "Correct local-time date filtering (midnight to midnight)",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(PageBreak())

    # 9. Printing
    story.append(Paragraph("9. Hardware Printing", h2_style))
    for line in [
        "ESC/POS receipt generation entirely in JavaScript (works offline)",
        "CP858 character encoding for proper currency symbols on thermal printers",
        "WiFi/Network printing via TCP/IP (port 9100)",
        "Bluetooth Classic and BLE support via Capacitor plugins",
        "Customer receipt + Kitchen ticket (separate templates)",
        "Printer status indicator in POS header",
        "Receipt chunking for large orders (prevents printer buffer overflow)",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 10. Menu Management
    story.append(Paragraph("10. Menu Management", h2_style))
    for line in [
        "Consolidated screen: category sidebar + product grid",
        "Create, edit, delete categories and products in one view",
        "Per-product stock toggle (In Stock / Out of Stock)",
        "Dynamic currency display based on restaurant settings",
        "Product images support via URL",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 11. Multi-tenant & Roles
    story.append(Paragraph("11. Multi-Tenant SaaS & Role-Based Access", h2_style))
    for line in [
        "Three roles: Platform Owner, Restaurant Admin, Staff",
        "Platform Owner: manages all restaurants, global categories, billing",
        "Restaurant Admin: full control of their restaurant (menu, orders, staff, settings)",
        "Staff: POS access only, requires Manager PIN for sensitive actions",
        "Subscription management with Stripe billing integration",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 10))

    # 12. Mobile & Offline
    story.append(Paragraph("12. Mobile-First & Offline Support", h2_style))
    for line in [
        "Responsive design tested across phones, tablets, and desktop",
        "Capacitor-ready for Android APK packaging",
        "Offline order saving with IndexedDB + automatic background sync",
        "WebSocket reconnection with exponential backoff + jitter",
        "Safety polling as fallback when WebSocket is unavailable",
    ]:
        story.append(Paragraph(f"\u2022 {line}", bullet_style))

    story.append(Spacer(1, 30))
    story.append(Paragraph("Contact your HevaPOS representative for a live demo.", ParagraphStyle('Footer', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#94a3b8'), alignment=1)))

    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=HevaPOS_Feature_Guide.pdf"}
    )
