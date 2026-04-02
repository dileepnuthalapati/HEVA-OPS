from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_platform_owner
from models import User
from pydantic import BaseModel, EmailStr
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


class OrderReceiptEmail(BaseModel):
    order_id: str
    recipient_email: str


async def send_email_async(to: str, subject: str, html: str) -> dict:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured - email not sent")
        return {"status": "skipped", "message": "Email service not configured. Set RESEND_API_KEY in .env"}

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


@router.post("/email/send")
async def send_email(request: EmailRequest, current_user: User = Depends(require_platform_owner)):
    result = await send_email_async(request.recipient_email, request.subject, request.html_content)
    return {"message": f"Email sent to {request.recipient_email}", **result}


@router.post("/email/order-receipt")
async def send_order_receipt_email(data: OrderReceiptEmail, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0}) if current_user.restaurant_id else None
    business_info = restaurant.get("business_info", {}) if restaurant else {}
    currency = restaurant.get("currency", "GBP") if restaurant else "GBP"
    biz_name = business_info.get("name", "HevaPOS Restaurant")

    items_html = ""
    for item in order.get("items", []):
        items_html += f"""<tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">{item['product_name']}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">{item['quantity']}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">{currency} {item['total']:.2f}</td>
        </tr>"""

    html = f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
        <div style="background:#0f172a;color:white;padding:20px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">{biz_name}</h1>
            <p style="margin:5px 0 0;opacity:0.8;">Order Receipt</p>
        </div>
        <div style="padding:20px;">
            <p><strong>Order #:</strong> {str(order.get('order_number', 'N/A')).zfill(3)}</p>
            <p><strong>Date:</strong> {order.get('created_at', '')[:19].replace('T', ' ')}</p>
            <p><strong>Payment:</strong> {order.get('payment_method', 'N/A').upper()}</p>
            <table style="width:100%;border-collapse:collapse;margin:15px 0;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="padding:10px;text-align:left;">Item</th>
                        <th style="padding:10px;text-align:center;">Qty</th>
                        <th style="padding:10px;text-align:right;">Total</th>
                    </tr>
                </thead>
                <tbody>{items_html}</tbody>
            </table>
            <div style="text-align:right;margin-top:15px;">
                <p style="margin:5px 0;">Subtotal: {currency} {order.get('subtotal', 0):.2f}</p>
                {"<p style='margin:5px 0;'>Tip: " + currency + " " + f"{order.get('tip_amount', 0):.2f}</p>" if order.get('tip_amount', 0) > 0 else ""}
                <p style="margin:5px 0;font-size:20px;font-weight:bold;color:#10B981;">Total: {currency} {order.get('total_amount', 0):.2f}</p>
            </div>
        </div>
        <div style="background:#f8fafc;padding:15px;text-align:center;font-size:12px;color:#64748b;">
            <p>Thank you for your visit!</p>
            <p>Powered by HevaPOS</p>
        </div>
    </div>
    """

    result = await send_email_async(data.recipient_email, f"Receipt - Order #{str(order.get('order_number', '')).zfill(3)} from {biz_name}", html)
    return {"message": f"Receipt emailed to {data.recipient_email}", **result}


@router.post("/email/notification/{notification_id}")
async def send_notification_email(notification_id: str, current_user: User = Depends(require_platform_owner)):
    notification = await db.notifications.find_one({"id": notification_id}, {"_id": 0})
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    email_to = notification.get("email", "")
    if not email_to:
        raise HTTPException(status_code=400, detail="No email address on this notification")

    html = f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:#0f172a;color:white;padding:20px;text-align:center;">
            <h1 style="margin:0;">HevaPOS Notification</h1>
        </div>
        <div style="padding:20px;">
            <p style="font-size:16px;">{notification.get('message', '')}</p>
            <p style="color:#64748b;font-size:13px;">Type: {notification.get('type', 'general')}</p>
            <p style="color:#64748b;font-size:13px;">Date: {notification.get('created_at', '')[:19].replace('T', ' ')}</p>
        </div>
        <div style="background:#f8fafc;padding:15px;text-align:center;font-size:12px;color:#64748b;">
            <p>Powered by HevaPOS</p>
        </div>
    </div>
    """

    result = await send_email_async(email_to, f"HevaPOS: {notification.get('type', 'Notification')}", html)

    await db.notifications.update_one({"id": notification_id}, {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": f"Notification email sent to {email_to}", **result}
