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
    start_str = f"{report_req.start_date[:10]}T00:00:00"
    end_str = f"{report_req.end_date[:10]}T23:59:59"

    query = {"created_at": {"$gte": start_str, "$lte": end_str}}
    if current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id

    all_orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    completed_orders = [o for o in all_orders if o.get("status") == "completed"]
    cancelled_orders = [o for o in all_orders if o.get("status") == "cancelled"]

    # Get currency symbol from restaurant settings
    cs = "$"
    if current_user.restaurant_id:
        rest = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0, "currency": 1})
        currency_map = {"GBP": "£", "USD": "$", "EUR": "€", "INR": "₹"}
        cs = currency_map.get((rest or {}).get("currency", "GBP"), "$")

    total_sales = sum(o.get("total_amount", 0) or o.get("total", 0) for o in completed_orders)
    total_orders = len(all_orders)
    completed_count = len(completed_orders)
    cancelled_count = len(cancelled_orders)
    avg_order = total_sales / completed_count if completed_count > 0 else 0

    # Cash vs Card breakdown (completed orders only)
    cash_total = 0
    card_total = 0
    for o in completed_orders:
        pm = o.get("payment_method", "cash")
        amt = o.get("total_amount", 0) or o.get("total", 0)
        if pm == "card":
            card_total += amt
        elif pm == "split":
            pd = o.get("payment_details") or {}
            cash_total += pd.get("cash", 0)
            card_total += pd.get("card", 0)
        else:
            cash_total += amt

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle('ReportTitle', parent=styles['Heading1'], fontSize=24, textColor=colors.HexColor('#0f172a'), spaceAfter=20, alignment=1)
    story.append(Paragraph("Sales Report", title_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"Period: {report_req.start_date[:10]} to {report_req.end_date[:10]}", styles['Normal']))
    story.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", styles['Normal']))
    story.append(Spacer(1, 20))

    summary_data = [
        ["Metric", "Value"],
        ["Total Sales (Completed)", f"{cs}{total_sales:.2f}"],
        ["Total Orders", str(total_orders)],
        ["Completed Orders", str(completed_count)],
        ["Cancelled Orders", str(cancelled_count)],
        ["Average Order Value", f"{cs}{avg_order:.2f}"],
        ["Cash Total", f"{cs}{cash_total:.2f}"],
        ["Card Total", f"{cs}{card_total:.2f}"],
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

    if all_orders:
        story.append(Paragraph("Order Details", styles['Heading2']))
        order_data = [["Order #", "Date", "Status", "Items", "Total", "Payment"]]
        for o in sorted(all_orders, key=lambda x: x.get("created_at", ""), reverse=True)[:100]:
            status = o.get("status", "N/A").capitalize()
            order_data.append([
                str(o.get("order_number", "N/A")).zfill(3),
                o.get("created_at", "")[:10],
                status,
                str(len(o.get("items", []))),
                f"{cs}{(o.get('total_amount', 0) or o.get('total', 0)):.2f}",
                o.get("payment_method", "N/A").upper() if o.get("status") == "completed" else "-"
            ])
        order_table = ReportLabTable(order_data, colWidths=[55, 75, 70, 45, 70, 70])
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
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=sales_report_{report_req.start_date[:10]}_{report_req.end_date[:10]}.pdf"})


@router.get("/reports/stats")
async def get_report_stats(start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    start_str = f"{start_date[:10]}T00:00:00"
    end_str = f"{end_date[:10]}T23:59:59"

    query = {"created_at": {"$gte": start_str, "$lte": end_str}}
    if current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id

    all_orders = await db.orders.find(query, {"_id": 0}).to_list(10000)

    # Separate completed vs cancelled for reporting
    completed_orders = [o for o in all_orders if o.get("status") == "completed"]
    cancelled_orders = [o for o in all_orders if o.get("status") == "cancelled"]

    # Sales metrics from completed orders
    total_sales = sum(o.get("total_amount", 0) or o.get("total", 0) for o in completed_orders)
    total_orders = len(all_orders)
    completed_count = len(completed_orders)
    cancelled_count = len(cancelled_orders)
    avg_order_value = total_sales / completed_count if completed_count > 0 else 0

    cash_total = 0
    card_total = 0
    for o in completed_orders:
        pm = o.get("payment_method", "cash")
        amt = o.get("total_amount", 0) or o.get("total", 0)
        if pm == "card":
            card_total += amt
        elif pm == "split":
            pd = o.get("payment_details") or {}
            cash_total += pd.get("cash", 0)
            card_total += pd.get("card", 0)
        else:
            cash_total += amt

    product_sales = {}
    for order in completed_orders:
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
        "completed_orders": completed_count,
        "cancelled_orders": cancelled_count,
        "avg_order_value": round(avg_order_value, 2),
        "cash_total": round(cash_total, 2),
        "card_total": round(card_total, 2),
        "top_products": [{"name": name, "quantity": data["quantity"], "revenue": round(data["revenue"], 2)} for name, data in top_products]
    }


@router.get("/reports/today")
async def get_today_stats(current_user: User = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    start_str = f"{today_str}T00:00:00"
    end_str = f"{today_str}T23:59:59"

    query = {"created_at": {"$gte": start_str, "$lte": end_str}, "status": "completed"}
    if current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id

    orders = await db.orders.find(query, {"_id": 0}).to_list(1000)

    total_sales = sum(o.get("total_amount", 0) or o.get("total", 0) for o in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0

    cash_total = 0
    card_total = 0
    for o in orders:
        pm = o.get("payment_method", "cash")
        amt = o.get("total_amount", 0) or o.get("total", 0)
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

    # Hourly revenue breakdown for the mini-chart
    hourly = {}
    for o in orders:
        try:
            ts = o.get("created_at", "")
            hour = int(ts[11:13]) if len(ts) > 13 else 0
            hourly[hour] = hourly.get(hour, 0) + (o.get("total_amount", 0) or o.get("total", 0))
        except (ValueError, IndexError):
            pass
    hourly_data = [{"hour": h, "label": f"{h:02d}:00", "revenue": round(hourly.get(h, 0), 2)} for h in range(24)]

    # QR vs POS breakdown
    qr_orders = len([o for o in orders if o.get("source") == "qr"])
    pos_orders = total_orders - qr_orders

    # Open tables count
    open_tables = await db.tables.count_documents({"status": "occupied"})
    total_tables = await db.tables.count_documents({})

    return {
        "total_sales": round(total_sales, 2),
        "total_orders": total_orders,
        "avg_order_value": round(avg_order_value, 2),
        "cash_total": round(cash_total, 2),
        "card_total": round(card_total, 2),
        "top_products": [{"name": n, "quantity": d["quantity"], "revenue": round(d["revenue"], 2)} for n, d in top_products],
        "date": today_str,
        "business_day_start": f"{today_str}T00:00:00",
        "hourly_revenue": hourly_data,
        "qr_orders": qr_orders,
        "pos_orders": pos_orders,
        "open_tables": open_tables,
        "total_tables": total_tables,
    }
