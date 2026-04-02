from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_platform_owner
from models import User
from pydantic import BaseModel
from datetime import datetime, timezone
import os
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


class EmailRequest(BaseModel):
    recipient_email: str
    subject: str
    html_content: str


async def send_email_async(to: str, subject: str, html: str) -> dict:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured - email not sent")
        return {"status": "skipped", "message": "Email service not configured. Add RESEND_API_KEY to your environment variables."}

    import resend
    resend.api_key = RESEND_API_KEY

    params = {
        "from": SENDER_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html
    }
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "success", "email_id": email.get("id")}
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


def _base_email_template(title: str, body_html: str, footer: str = "Powered by HevaPOS") -> str:
    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
        <div style="background:#0f172a;color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:22px;letter-spacing:0.5px;">HevaPOS</h1>
            <p style="margin:6px 0 0;opacity:0.7;font-size:13px;">{title}</p>
        </div>
        <div style="padding:24px;line-height:1.6;">{body_html}</div>
        <div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#94a3b8;">
            <p style="margin:0;">{footer}</p>
        </div>
    </div>"""


@router.get("/email/status")
async def email_status(current_user: User = Depends(require_platform_owner)):
    configured = bool(RESEND_API_KEY)
    return {
        "configured": configured,
        "sender_email": SENDER_EMAIL if configured else None,
        "message": "Email service is active" if configured else "RESEND_API_KEY not configured. Sign up at resend.com (free) and add your API key."
    }


@router.post("/email/send")
async def send_custom_email(request: EmailRequest, current_user: User = Depends(require_platform_owner)):
    result = await send_email_async(request.recipient_email, request.subject, request.html_content)
    return {"message": f"Email sent to {request.recipient_email}", **result}


@router.post("/email/welcome/{restaurant_id}")
async def send_welcome_email(restaurant_id: str, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    email_to = restaurant.get("owner_email", "")
    if not email_to:
        raise HTTPException(status_code=400, detail="Restaurant has no email address")

    biz_name = restaurant.get("business_info", {}).get("name", "Your Restaurant")
    trial_days = 14

    body = f"""
        <h2 style="color:#0f172a;margin-top:0;">Welcome to HevaPOS!</h2>
        <p>Hi there,</p>
        <p>Great news — <strong>{biz_name}</strong> has been successfully onboarded on HevaPOS!</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="margin:0 0 8px;font-weight:600;color:#166534;">Your account is ready</p>
            <p style="margin:0;font-size:14px;color:#15803d;">You have a <strong>{trial_days}-day free trial</strong> to explore all features — POS, orders, reports, receipts, table management, and more.</p>
        </div>
        <p><strong>What's included:</strong></p>
        <ul style="color:#475569;padding-left:20px;">
            <li>Full POS system with order management</li>
            <li>Receipt printing (WiFi & Bluetooth)</li>
            <li>Staff management & role-based access</li>
            <li>Reports & analytics</li>
            <li>Table management & reservations</li>
        </ul>
        <p>If you need any help getting started, just reply to this email.</p>
        <p style="margin-top:24px;">Cheers,<br/><strong>The HevaPOS Team</strong></p>
    """

    result = await send_email_async(email_to, f"Welcome to HevaPOS — {biz_name} is ready!", _base_email_template("Welcome Aboard", body))

    await db.notifications.insert_one({
        "id": f"notif_welcome_{datetime.now(timezone.utc).timestamp()}",
        "restaurant_id": restaurant_id,
        "type": "welcome_email",
        "message": f"Welcome email sent to {email_to} for {biz_name}",
        "email": email_to,
        "status": "sent" if result.get("status") == "success" else "skipped",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_at": datetime.now(timezone.utc).isoformat() if result.get("status") == "success" else None,
    })

    return {"message": f"Welcome email sent to {email_to}", **result}


@router.post("/email/payment-reminder/{restaurant_id}")
async def send_payment_reminder(restaurant_id: str, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    email_to = restaurant.get("owner_email", "")
    if not email_to:
        raise HTTPException(status_code=400, detail="Restaurant has no email address")

    biz_name = restaurant.get("business_info", {}).get("name", "Your Restaurant")
    currency = restaurant.get("currency", "GBP")
    price = restaurant.get("price", 0)
    status = restaurant.get("subscription_status", "trial")

    body = f"""
        <h2 style="color:#0f172a;margin-top:0;">Payment Reminder</h2>
        <p>Hi,</p>
        <p>This is a friendly reminder regarding the subscription for <strong>{biz_name}</strong>.</p>
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="margin:0 0 8px;font-weight:600;color:#92400e;">Subscription Status: {status.upper()}</p>
            <p style="margin:0;font-size:14px;color:#78350f;">Plan: <strong>{currency} {price:.2f}/month</strong></p>
        </div>
        {"<p style='color:#dc2626;font-weight:600;'>Your account has been suspended due to non-payment. Please make a payment to restore access.</p>" if status == "suspended" else ""}
        <p>To continue using HevaPOS without interruption, please ensure your payment is up to date.</p>
        <p>If you have any questions about billing, simply reply to this email.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>The HevaPOS Team</strong></p>
    """

    result = await send_email_async(email_to, f"Payment Reminder — {biz_name}", _base_email_template("Payment Reminder", body))

    await db.notifications.insert_one({
        "id": f"notif_payment_{datetime.now(timezone.utc).timestamp()}",
        "restaurant_id": restaurant_id,
        "type": "payment_reminder",
        "message": f"Payment reminder sent to {email_to} for {biz_name}",
        "email": email_to,
        "status": "sent" if result.get("status") == "success" else "skipped",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_at": datetime.now(timezone.utc).isoformat() if result.get("status") == "success" else None,
    })

    return {"message": f"Payment reminder sent to {email_to}", **result}


@router.post("/email/trial-reminder/{restaurant_id}")
async def send_trial_reminder(restaurant_id: str, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    email_to = restaurant.get("owner_email", "")
    if not email_to:
        raise HTTPException(status_code=400, detail="Restaurant has no email address")

    biz_name = restaurant.get("business_info", {}).get("name", "Your Restaurant")
    trial_ends = restaurant.get("trial_ends_at", "")
    days_left = 0
    if trial_ends:
        try:
            from datetime import datetime as dt
            trial_dt = dt.fromisoformat(trial_ends.replace("Z", "+00:00"))
            days_left = max(0, (trial_dt - datetime.now(timezone.utc)).days)
        except Exception:
            days_left = 0

    urgency_color = "#dc2626" if days_left <= 1 else "#ea580c" if days_left <= 3 else "#2563eb"

    body = f"""
        <h2 style="color:#0f172a;margin-top:0;">Trial Expiry Reminder</h2>
        <p>Hi,</p>
        <p>Your free trial for <strong>{biz_name}</strong> is coming to an end.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
            <p style="margin:0;font-size:32px;font-weight:bold;color:{urgency_color};">{days_left} day{"s" if days_left != 1 else ""}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#71717a;">remaining in your trial</p>
        </div>
        <p>To keep using HevaPOS and avoid any disruption to your business, please subscribe before your trial ends.</p>
        <p><strong>What happens when the trial ends?</strong></p>
        <ul style="color:#475569;padding-left:20px;">
            <li>POS access will be paused</li>
            <li>Your data remains safe — nothing is deleted</li>
            <li>Simply subscribe to resume instantly</li>
        </ul>
        <p>Need help or have questions? Reply to this email anytime.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>The HevaPOS Team</strong></p>
    """

    result = await send_email_async(email_to, f"Trial ending soon — {biz_name} ({days_left} days left)", _base_email_template("Trial Reminder", body))

    await db.notifications.insert_one({
        "id": f"notif_trial_{datetime.now(timezone.utc).timestamp()}",
        "restaurant_id": restaurant_id,
        "type": "trial_reminder",
        "message": f"Trial reminder sent to {email_to} — {days_left} days left for {biz_name}",
        "email": email_to,
        "status": "sent" if result.get("status") == "success" else "skipped",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_at": datetime.now(timezone.utc).isoformat() if result.get("status") == "success" else None,
    })

    return {"message": f"Trial reminder sent to {email_to}", **result}


@router.post("/email/notification/{notification_id}")
async def send_notification_email(notification_id: str, current_user: User = Depends(require_platform_owner)):
    notification = await db.notifications.find_one({"id": notification_id}, {"_id": 0})
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    email_to = notification.get("email", "")
    if not email_to:
        raise HTTPException(status_code=400, detail="No email address on this notification")

    body = f"""
        <h2 style="color:#0f172a;margin-top:0;">Notification</h2>
        <p style="font-size:16px;margin:16px 0;">{notification.get('message', '')}</p>
        <p style="color:#94a3b8;font-size:13px;">Type: {notification.get('type', 'general')}</p>
        <p style="color:#94a3b8;font-size:13px;">Date: {notification.get('created_at', '')[:19].replace('T', ' ')}</p>
    """

    result = await send_email_async(email_to, f"HevaPOS: {notification.get('type', 'Notification')}", _base_email_template("Notification", body))

    await db.notifications.update_one({"id": notification_id}, {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": f"Notification email sent to {email_to}", **result}
