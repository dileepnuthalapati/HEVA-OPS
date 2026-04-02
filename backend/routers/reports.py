from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from database import db
from dependencies import get_current_user, require_admin
from models import User, ReportRequest
from datetime import datetime, timezone, timedelta
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table as ReportLabTable, TableStyle, Paragraph, Spacer
from io import BytesIO

router = APIRouter()


@router.post("/reports/generate")
async def generate_report(report_req: ReportRequest, current_user: User = Depends(require_admin)):
    start_dt = datetime.fromisoformat(report_req.start_date.replace('Z', '+00:00') if 'Z' in report_req.start_date else report_req.start_date)
    end_dt = datetime.fromisoformat(report_req.end_date.replace('Z', '+00:00') if 'Z' in report_req.end_date else report_req.end_date)
    end_dt_inclusive = end_dt + timedelta(days=1)

    orders = await db.orders.find(
        {"created_at": {"$gte": start_dt.isoformat(), "$lt": end_dt_inclusive.isoformat()}, "status": "completed"},
        {"_id": 0}
    ).to_list(10000)

    total_sales = sum(o.get("total_amount", 0) for o in orders)
    total_orders = len(orders)
    avg_order = total_sales / total_orders if total_orders > 0 else 0

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle('ReportTitle', parent=styles['Heading1'], fontSize=24, textColor=colors.HexColor('#0f172a'), spaceAfter=20, alignment=1)
    story.append(Paragraph(f"Sales Report", title_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"Period: {start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')}", styles['Normal']))
    story.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", styles['Normal']))
    story.append(Spacer(1, 20))

    summary_data = [
        ["Metric", "Value"],
        ["Total Sales", f"${total_sales:.2f}"],
        ["Total Orders", str(total_orders)],
        ["Average Order Value", f"${avg_order:.2f}"],
    ]
    summary_table = ReportLabTable(summary_data, colWidths=[200, 200])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey)
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))

    if orders:
        story.append(Paragraph("Order Details", styles['Heading2']))
        order_data = [["Order #", "Date", "Items", "Total", "Payment"]]
        for o in orders[:50]:
            order_data.append([
                str(o.get("order_number", "N/A")).zfill(3),
                o.get("created_at", "")[:10],
                str(len(o.get("items", []))),
                f"${o.get('total_amount', 0):.2f}",
                o.get("payment_method", "N/A").upper()
            ])
        order_table = ReportLabTable(order_data, colWidths=[60, 80, 60, 80, 80])
        order_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
        ]))
        story.append(order_table)

    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=sales_report_{start_dt.strftime('%Y%m%d')}_{end_dt.strftime('%Y%m%d')}.pdf"})


@router.get("/reports/stats")
async def get_report_stats(start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00') if 'Z' in start_date else start_date)
    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00') if 'Z' in end_date else end_date)
    end_dt_str = (end_dt + timedelta(days=1)).isoformat()
    start_dt_str = start_dt.isoformat()

    orders = await db.orders.find(
        {"created_at": {"$gte": start_dt_str, "$lt": end_dt_str}, "status": "completed"},
        {"_id": 0}
    ).to_list(10000)

    total_sales = sum(order.get("total_amount", 0) for order in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0

    cash_total = 0
    card_total = 0
    for o in orders:
        pm = o.get("payment_method", "cash")
        amt = o.get("total_amount", 0)
        if pm == "card":
            card_total += amt
        elif pm == "split":
            pd = o.get("payment_details") or {}
            cash_total += pd.get("cash", 0)
            card_total += pd.get("card", 0)
        else:
            cash_total += amt

    product_sales = {}
    for order in orders:
        for item in order.get("items", []):
            if item.get("product_name") and item["product_name"] not in product_sales:
                product_sales[item["product_name"]] = {"quantity": 0, "revenue": 0}
            if item.get("product_name"):
                product_sales[item["product_name"]]["quantity"] += item.get("quantity", 0)
                product_sales[item["product_name"]]["revenue"] += item.get("total", 0)

    top_products = sorted(product_sales.items(), key=lambda x: x[1]["revenue"], reverse=True)[:5]

    return {
        "total_sales": round(total_sales, 2),
        "total_orders": total_orders,
        "avg_order_value": round(avg_order_value, 2),
        "cash_total": round(cash_total, 2),
        "card_total": round(card_total, 2),
        "top_products": [{"name": name, "quantity": data["quantity"], "revenue": round(data["revenue"], 2)} for name, data in top_products]
    }


@router.get("/reports/today")
async def get_today_stats(current_user: User = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    if now.hour < 2:
        biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    else:
        biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)
    biz_end = biz_start + timedelta(days=1)

    orders = await db.orders.find(
        {"created_at": {"$gte": biz_start.isoformat(), "$lt": biz_end.isoformat()}, "status": "completed"},
        {"_id": 0}
    ).to_list(1000)

    total_sales = sum(o.get("total_amount", 0) for o in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0

    cash_total = 0
    card_total = 0
    for o in orders:
        pm = o.get("payment_method", "cash")
        amt = o.get("total_amount", 0)
        if pm == "card":
            card_total += amt
        elif pm == "split":
            pd = o.get("payment_details") or {}
            cash_total += pd.get("cash", 0)
            card_total += pd.get("card", 0)
        else:
            cash_total += amt

    product_sales = {}
    for order in orders:
        for item in order.get("items", []):
            name = item.get("product_name", "Unknown")
            if name not in product_sales:
                product_sales[name] = {"quantity": 0, "revenue": 0}
            product_sales[name]["quantity"] += item.get("quantity", 0)
            product_sales[name]["revenue"] += item.get("total", 0)

    top_products = sorted(product_sales.items(), key=lambda x: x[1]["quantity"], reverse=True)[:5]

    return {
        "total_sales": round(total_sales, 2),
        "total_orders": total_orders,
        "avg_order_value": round(avg_order_value, 2),
        "cash_total": round(cash_total, 2),
        "card_total": round(card_total, 2),
        "top_products": [{"name": n, "quantity": d["quantity"], "revenue": round(d["revenue"], 2)} for n, d in top_products],
        "date": biz_start.date().isoformat(),
        "business_day_start": biz_start.isoformat(),
    }
