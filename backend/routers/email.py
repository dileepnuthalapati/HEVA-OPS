from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin
from models import User
from services.email import send_email, daily_summary_html, trial_reminder_html
from datetime import datetime, timezone, timedelta
import logging

router = APIRouter()
logger = logging.getLogger("email_router")

CURRENCY_SYMBOLS = {"GBP": "£", "USD": "$", "EUR": "€", "INR": "₹"}


async def _build_daily_summary(restaurant_id: str):
    """Aggregate yesterday's data for a business."""
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y-%m-%d")

    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return None, None, None

    biz_info = restaurant.get("business_info", {})
    biz_name = biz_info.get("name", restaurant.get("name", "Business"))
    currency = restaurant.get("currency", "GBP")
    sym = CURRENCY_SYMBOLS.get(currency, currency + " ")

    # Get admin email
    admin = await db.users.find_one(
        {"restaurant_id": restaurant_id, "role": "admin", "email": {"$exists": True, "$ne": ""}},
        {"_id": 0}
    )
    email_to = admin.get("email") if admin else None
    if not email_to:
        return None, None, None

    # Aggregate orders from yesterday
    orders = await db.orders.find(
        {"restaurant_id": restaurant_id, "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).to_list(5000)

    # Filter to yesterday's orders
    day_orders = []
    for o in orders:
        created = o.get("created_at", "")
        if isinstance(created, str) and created.startswith(yesterday_str):
            day_orders.append(o)

    total_revenue = sum(o.get("total_amount", 0) or 0 for o in day_orders)
    total_orders = len(day_orders)
    cash_amount = sum(o.get("total_amount", 0) or 0 for o in day_orders if o.get("payment_method") == "cash")
    card_amount = sum(o.get("total_amount", 0) or 0 for o in day_orders if o.get("payment_method") in ("card", "stripe"))

    # Top products
    product_map = {}
    for o in day_orders:
        for item in o.get("items", []):
            name = item.get("name", "Unknown")
            qty = item.get("quantity", 1)
            price = item.get("price", 0) * qty
            if name not in product_map:
                product_map[name] = {"name": name, "quantity": 0, "revenue": 0}
            product_map[name]["quantity"] += qty
            product_map[name]["revenue"] += price
    top_products = sorted(product_map.values(), key=lambda x: x["revenue"], reverse=True)[:5]

    # Staff performance
    staff_map = {}
    for o in day_orders:
        staff = o.get("created_by", o.get("staff_name", "Unknown"))
        if staff not in staff_map:
            staff_map[staff] = {"name": staff, "orders": 0, "revenue": 0}
        staff_map[staff]["orders"] += 1
        staff_map[staff]["revenue"] += o.get("total_amount", 0) or 0
    staff_stats = sorted(staff_map.values(), key=lambda x: x["revenue"], reverse=True)[:5]

    data = {
        "total_revenue": total_revenue,
        "total_orders": total_orders,
        "cash_amount": cash_amount,
        "card_amount": card_amount,
        "top_products": top_products,
        "staff_stats": staff_stats,
    }

    html = daily_summary_html(biz_name, yesterday_str, data, sym)
    return email_to, f"Daily Summary — {biz_name} ({yesterday_str})", html


@router.post("/email/daily-summary/send")
async def trigger_daily_summary(current_user: User = Depends(require_admin)):
    """Manually trigger daily summary email for the current business."""
    email_to, subject, html = await _build_daily_summary(current_user.restaurant_id)
    if not email_to:
        raise HTTPException(status_code=400, detail="No admin email found or no business data")
    result = await send_email(email_to, subject, html)
    return {"message": f"Daily summary sent to {email_to}", "result": result}


@router.post("/email/daily-summary/send-all")
async def send_all_daily_summaries(current_user: User = Depends(get_current_user)):
    """Send daily summaries to ALL businesses (platform owner or cron job)."""
    if current_user.role != "platform_owner":
        raise HTTPException(status_code=403, detail="Platform owner only")

    restaurants = await db.restaurants.find({}, {"_id": 0, "id": 1}).to_list(500)
    results = []
    for r in restaurants:
        rid = r.get("id")
        if not rid:
            continue
        email_to, subject, html = await _build_daily_summary(rid)
        if email_to:
            result = await send_email(email_to, subject, html)
            results.append({"restaurant_id": rid, "email": email_to, "result": result})
    return {"sent": len(results), "details": results}


@router.post("/email/trial-reminders/send")
async def send_trial_reminders(current_user: User = Depends(get_current_user)):
    """Check all businesses for trial expiry and send reminders (7d, 3d, 1d)."""
    if current_user.role != "platform_owner":
        raise HTTPException(status_code=403, detail="Platform owner only")

    now = datetime.now(timezone.utc)
    today = now.date()

    restaurants = await db.restaurants.find(
        {"trial_end_date": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(500)

    results = []
    for r in restaurants:
        trial_end = r.get("trial_end_date")
        if not trial_end:
            continue
        if isinstance(trial_end, str):
            try:
                trial_end = datetime.fromisoformat(trial_end).date()
            except ValueError:
                continue

        days_left = (trial_end - today).days
        if days_left not in (7, 3, 1, 0):
            continue

        # Get admin email
        admin = await db.users.find_one(
            {"restaurant_id": r["id"], "role": "admin", "email": {"$exists": True, "$ne": ""}},
            {"_id": 0}
        )
        if not admin or not admin.get("email"):
            continue

        biz_name = r.get("business_info", {}).get("name", r.get("name", "Business"))
        html = trial_reminder_html(biz_name, days_left)
        subject = f"{'URGENT: ' if days_left <= 1 else ''}Your Heva One trial {'expires today' if days_left <= 0 else f'expires in {days_left} days'}"

        result = await send_email(admin["email"], subject, html)
        results.append({"restaurant_id": r["id"], "days_left": days_left, "email": admin["email"], "result": result})

    return {"reminders_sent": len(results), "details": results}


@router.post("/email/test")
async def send_test_email(current_user: User = Depends(require_admin)):
    """Send a quick test email to the current admin."""
    admin = await db.users.find_one({"username": current_user.username}, {"_id": 0})
    email = admin.get("email") if admin else None
    if not email:
        raise HTTPException(status_code=400, detail="No email on your account. Update your email in Settings first.")

    html = """
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;text-align:center;">
      <h1 style="color:#1e293b;">Heva One</h1>
      <p style="color:#059669;font-size:18px;font-weight:600;">Email is working!</p>
      <p style="color:#64748b;">This is a test email from your Heva One system.</p>
    </div>"""
    result = await send_email(email, "Heva One — Test Email", html)
    return {"message": f"Test email sent to {email}", "result": result}
