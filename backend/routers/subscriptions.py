from fastapi import APIRouter, Depends, HTTPException, Request
from database import db
from dependencies import get_current_user, require_platform_owner, require_admin
from models import User, SubscriptionUpdate
from services.email import send_email
from datetime import datetime, timezone, timedelta
import os
import json
import logging

router = APIRouter()
logger = logging.getLogger("subscriptions")


async def _get_stripe_config():
    """Read Stripe API key + webhook secret from platform_config DB first, env second.
    DB-stored keys (entered via Platform Settings UI) take priority."""
    doc = await db.platform_config.find_one({"type": "global"}, {"_id": 0}) or {}
    api_key = doc.get("stripe_secret_key") or os.environ.get("STRIPE_API_KEY", "")
    webhook_secret = doc.get("stripe_webhook_secret") or os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    return api_key, webhook_secret


@router.get("/subscriptions")
async def list_subscriptions(current_user: User = Depends(require_platform_owner)):
    restaurants = await db.restaurants.find({}, {"_id": 0}).to_list(1000)
    result = []
    now = datetime.now(timezone.utc)
    for r in restaurants:
        trial_ends = r.get("trial_ends_at")
        days_left = None
        if trial_ends:
            try:
                trial_dt = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
                days_left = max(0, (trial_dt - now).days)
            except Exception:
                days_left = 0
        result.append({
            "id": r.get("id"),
            "name": r.get("business_info", {}).get("name", "Unknown"),
            "owner_email": r.get("owner_email", ""),
            "subscription_status": r.get("subscription_status", "trial"),
            "subscription_plan": r.get("subscription_plan", "standard_monthly"),
            "price": r.get("price", 0),
            "currency": r.get("currency", "GBP"),
            "trial_ends_at": trial_ends,
            "trial_days_left": days_left,
            "next_billing_date": r.get("next_billing_date"),
            "created_at": r.get("created_at"),
        })
    return result


@router.put("/subscriptions/{restaurant_id}")
async def update_subscription(restaurant_id: str, data: SubscriptionUpdate, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    update = {"subscription_status": data.status}
    if data.plan:
        update["subscription_plan"] = data.plan
    if data.price is not None:
        update["price"] = data.price
    if data.status == "active":
        update["activated_at"] = datetime.now(timezone.utc).isoformat()
        update["next_billing_date"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    elif data.status == "suspended":
        update["suspended_at"] = datetime.now(timezone.utc).isoformat()
    elif data.status == "cancelled":
        update["cancelled_at"] = datetime.now(timezone.utc).isoformat()

    await db.restaurants.update_one({"id": restaurant_id}, {"$set": update})
    await db.notifications.insert_one({
        "id": f"notif_{datetime.now(timezone.utc).timestamp()}",
        "restaurant_id": restaurant_id,
        "type": "subscription_change",
        "message": f"Subscription changed to {data.status}",
        "email": restaurant.get("owner_email", ""),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_at": None,
    })
    return {"message": f"Subscription updated to {data.status}", "restaurant_id": restaurant_id}


@router.get("/subscriptions/my")
async def get_my_subscription(current_user: User = Depends(get_current_user)):
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant associated")
    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    now = datetime.now(timezone.utc)
    trial_ends = restaurant.get("trial_ends_at")
    days_left = None
    if trial_ends:
        try:
            trial_dt = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
            days_left = max(0, (trial_dt - now).days)
        except Exception:
            days_left = 0
    return {
        "subscription_status": restaurant.get("subscription_status", "trial"),
        "subscription_plan": restaurant.get("subscription_plan", "standard_monthly"),
        "price": restaurant.get("price", 0),
        "currency": restaurant.get("currency", "GBP"),
        "trial_ends_at": trial_ends,
        "trial_days_left": days_left,
        "next_billing_date": restaurant.get("next_billing_date"),
        "stripe_subscription_id": restaurant.get("stripe_subscription_id"),
        "subscription_cancel_at_period_end": restaurant.get("subscription_cancel_at_period_end", False),
        "subscription_cancels_at": restaurant.get("subscription_cancels_at"),
    }


@router.post("/subscriptions/check-trials")
async def check_trial_expirations(current_user: User = Depends(require_platform_owner)):
    now = datetime.now(timezone.utc)
    restaurants = await db.restaurants.find({"subscription_status": "trial"}, {"_id": 0}).to_list(1000)
    expired = []
    expiring_soon = []
    for r in restaurants:
        trial_ends = r.get("trial_ends_at")
        if not trial_ends:
            continue
        try:
            trial_dt = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
        except Exception:
            continue
        days_left = (trial_dt - now).days
        if days_left < 0:
            await db.restaurants.update_one({"id": r["id"]}, {"$set": {"subscription_status": "suspended", "suspended_at": now.isoformat()}})
            await db.notifications.insert_one({
                "id": f"notif_{now.timestamp()}_{r['id']}", "restaurant_id": r["id"],
                "type": "trial_expired", "message": f"Trial expired for {r.get('business_info', {}).get('name', 'Unknown')}. Suspended.",
                "email": r.get("owner_email", ""), "status": "pending", "created_at": now.isoformat(), "sent_at": None,
            })
            expired.append(r["id"])
        elif days_left <= 3:
            existing = await db.notifications.find_one({"restaurant_id": r["id"], "type": "trial_expiring_soon", "created_at": {"$gte": (now - timedelta(days=1)).isoformat()}})
            if not existing:
                await db.notifications.insert_one({
                    "id": f"notif_warn_{now.timestamp()}_{r['id']}", "restaurant_id": r["id"],
                    "type": "trial_expiring_soon", "message": f"Trial expiring in {days_left} days for {r.get('business_info', {}).get('name', 'Unknown')}",
                    "email": r.get("owner_email", ""), "status": "pending", "created_at": now.isoformat(), "sent_at": None,
                })
                expiring_soon.append(r["id"])
    return {"expired_and_suspended": expired, "expiring_soon_notified": expiring_soon, "total_trials_checked": len(restaurants)}


@router.post("/stripe/create-checkout")
async def create_stripe_checkout(current_user: User = Depends(require_admin)):
    """
    Restaurant admin starts a Stripe Checkout session to subscribe to the
    Heva ONE Standard Plan (£49.99/month). Platform owners cannot subscribe
    themselves — they manage tenants via the platform dashboard.
    """
    import stripe
    stripe.api_key, _ = await _get_stripe_config()
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured — platform owner must add Stripe keys in Platform Settings")
    if current_user.role == "platform_owner":
        raise HTTPException(status_code=400, detail="Platform owner cannot subscribe — this is the SaaS provider account.")
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant associated with user")

    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    business_name = (restaurant.get("business_info") or {}).get("name") or "Heva ONE Subscription"
    owner_email = restaurant.get("owner_email") or ""
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

    # Re-use the existing Stripe customer if we already created one
    stripe_customer_id = restaurant.get("stripe_customer_id")
    customer_kwargs = {}
    if stripe_customer_id:
        customer_kwargs["customer"] = stripe_customer_id
    elif owner_email:
        customer_kwargs["customer_email"] = owner_email

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "gbp",
                    "product_data": {"name": "Heva ONE Standard Plan", "description": f"Monthly subscription for {business_name}"},
                    "unit_amount": 4999,
                    "recurring": {"interval": "month"},
                },
                "quantity": 1,
            }],
            mode="subscription",
            metadata={
                "restaurant_id": current_user.restaurant_id,
                "business_name": business_name,
                "owner_email": owner_email,
            },
            subscription_data={
                "metadata": {
                    "restaurant_id": current_user.restaurant_id,
                    "business_name": business_name,
                }
            },
            success_url=f"{frontend_url}/dashboard?subscription=success",
            cancel_url=f"{frontend_url}/dashboard?subscription=cancelled",
            **customer_kwargs,
        )
        return {"checkout_url": session.url, "session_id": session.id}
    except Exception as e:
        logger.error(f"Stripe create-checkout failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe/cancel-subscription")
async def cancel_subscription(current_user: User = Depends(require_admin)):
    """
    Restaurant admin cancels their subscription at period end.
    Stripe will keep the subscription active until the end of the current
    billing period, then fire `customer.subscription.deleted` which the
    webhook handles to set status='cancelled'.
    """
    import stripe
    stripe.api_key, _ = await _get_stripe_config()
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant associated")

    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    sub_id = restaurant.get("stripe_subscription_id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="No active Stripe subscription found for this restaurant")

    try:
        updated = stripe.Subscription.modify(sub_id, cancel_at_period_end=True)
        period_end = datetime.fromtimestamp(updated["current_period_end"], tz=timezone.utc).isoformat() if updated.get("current_period_end") else None
        await db.restaurants.update_one(
            {"id": current_user.restaurant_id},
            {"$set": {
                "subscription_cancel_at_period_end": True,
                "subscription_cancels_at": period_end,
            }},
        )
        return {"message": "Subscription will end at the current billing period.", "cancels_at": period_end}
    except Exception as e:
        logger.error(f"Stripe cancel failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe/billing-portal")
async def stripe_billing_portal(current_user: User = Depends(require_admin)):
    """
    Open a Stripe Billing Portal session so customers can update their
    payment method, view invoices, and manage cancellation themselves.
    """
    import stripe
    stripe.api_key, _ = await _get_stripe_config()
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant associated")

    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    customer_id = restaurant.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found — please subscribe first")

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    try:
        portal = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{frontend_url}/dashboard",
        )
        return {"portal_url": portal.url}
    except Exception as e:
        logger.error(f"Stripe billing portal failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """
    Platform-billing webhook.
    Stripe events for restaurant subscriptions arrive here.
    Signature verification is MANDATORY in production — without it anyone
    can POST a fake `invoice.payment_succeeded` event and unlock their
    restaurant for free.
    """
    import stripe
    stripe.api_key, webhook_secret = await _get_stripe_config()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    # Production: signed payloads only. Dev fallback parses unsigned but logs
    # a warning so we never accidentally ship without the secret.
    try:
        if webhook_secret:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        else:
            print("[Stripe] WARNING: STRIPE_WEBHOOK_SECRET not set — accepting unsigned event (DEV ONLY)")
            event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    now_iso = datetime.now(timezone.utc).isoformat()

    if event.type == "checkout.session.completed":
        session = event.data.object
        restaurant_id = (session.get("metadata") or {}).get("restaurant_id")
        customer_id = session.get("customer")
        subscription_id = session.get("subscription")
        if restaurant_id:
            await db.restaurants.update_one(
                {"id": restaurant_id},
                {"$set": {
                    "stripe_customer_id": customer_id,
                    "stripe_subscription_id": subscription_id,
                    "subscription_status": "active",
                    "activated_at": now_iso,
                    "next_billing_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                }}
            )

    elif event.type == "invoice.payment_succeeded":
        invoice = event.data.object
        customer_id = invoice.get("customer")
        amount_paid = (invoice.get("amount_paid") or 0) / 100.0
        currency = (invoice.get("currency") or "gbp").upper()
        invoice_url = invoice.get("hosted_invoice_url") or ""
        invoice_pdf = invoice.get("invoice_pdf") or ""
        period_end_ts = invoice.get("period_end")
        next_billing_iso = (
            datetime.fromtimestamp(period_end_ts, tz=timezone.utc).isoformat()
            if period_end_ts else (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        )

        restaurant = await db.restaurants.find_one({"stripe_customer_id": customer_id})
        if restaurant:
            await db.restaurants.update_one(
                {"id": restaurant["id"]},
                {"$set": {
                    "subscription_status": "active",
                    "next_billing_date": next_billing_iso,
                    "last_payment_at": now_iso,
                }}
            )
            owner_email = restaurant.get("owner_email", "")
            business_name = (restaurant.get("business_info") or {}).get("name") or "Your business"
            if owner_email:
                try:
                    html = _payment_receipt_html(business_name, amount_paid, currency, invoice_url, invoice_pdf, next_billing_iso)
                    await send_email(owner_email, f"Heva ONE — Payment received ({currency} {amount_paid:.2f})", html)
                except Exception as e:
                    logger.warning(f"Receipt email failed for {owner_email}: {e}")
            await db.notifications.insert_one({
                "id": f"notif_pay_ok_{datetime.now(timezone.utc).timestamp()}",
                "restaurant_id": restaurant["id"],
                "type": "subscription_payment_succeeded",
                "message": f"Payment of {currency} {amount_paid:.2f} received for {business_name}",
                "email": owner_email,
                "status": "sent" if owner_email else "skipped",
                "created_at": now_iso,
                "sent_at": now_iso if owner_email else None,
            })

    elif event.type == "invoice.payment_failed":
        customer_id = event.data.object.get("customer")
        restaurant = await db.restaurants.find_one({"stripe_customer_id": customer_id})
        if restaurant:
            await db.restaurants.update_one(
                {"id": restaurant["id"]},
                {"$set": {"subscription_status": "suspended", "suspended_at": now_iso}}
            )
            await db.notifications.insert_one({
                "id": f"notif_pay_fail_{datetime.now(timezone.utc).timestamp()}",
                "restaurant_id": restaurant["id"],
                "type": "payment_failed",
                "message": f"Payment failed for {restaurant.get('business_info', {}).get('name', '')}",
                "email": restaurant.get("owner_email", ""),
                "status": "pending",
                "created_at": now_iso, "sent_at": None
            })

    elif event.type == "customer.subscription.deleted":
        # Restaurant cancelled (or Stripe terminated after multiple failures)
        customer_id = event.data.object.get("customer")
        restaurant = await db.restaurants.find_one({"stripe_customer_id": customer_id})
        if restaurant:
            await db.restaurants.update_one(
                {"id": restaurant["id"]},
                {"$set": {
                    "subscription_status": "cancelled",
                    "cancelled_at": now_iso,
                    "subscription_cancel_at_period_end": False,
                }}
            )
            owner_email = restaurant.get("owner_email", "")
            business_name = (restaurant.get("business_info") or {}).get("name") or "Your business"
            if owner_email:
                try:
                    await send_email(
                        owner_email,
                        "Heva ONE — Your subscription has ended",
                        f"<p>Hi,</p><p>Your Heva ONE subscription for <strong>{business_name}</strong> has ended. Your data is safe — you can resubscribe anytime from the dashboard.</p><p>— Heva ONE</p>",
                    )
                except Exception as e:
                    logger.warning(f"Cancellation email failed for {owner_email}: {e}")

    return {"status": "ok"}


def _payment_receipt_html(business_name: str, amount: float, currency: str, invoice_url: str, invoice_pdf: str, next_billing_iso: str) -> str:
    next_billing_pretty = ""
    try:
        next_billing_pretty = datetime.fromisoformat(next_billing_iso).strftime("%d %b %Y")
    except Exception:
        next_billing_pretty = next_billing_iso[:10]

    download_block = ""
    if invoice_url:
        download_block = f"""
        <div style="text-align:center;margin:24px 0;">
          <a href="{invoice_url}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">View Invoice</a>
        </div>"""

    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:28px 24px;text-align:center;">
        <h1 style="color:#fff;font-size:22px;margin:0;">Heva<span style="color:#818cf8;">ONE</span></h1>
        <p style="color:#94a3b8;font-size:13px;margin:6px 0 0;">Payment received</p>
      </div>
      <div style="padding:28px 24px;">
        <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 12px;">
          Thanks — your payment for <strong>{business_name}</strong> went through.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:14px;background:#f0fdf4;border-radius:10px;text-align:center;">
              <div style="font-size:26px;font-weight:700;color:#059669;">{currency} {amount:.2f}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Paid</div>
            </td>
          </tr>
        </table>
        <p style="color:#475569;font-size:14px;margin:0 0 8px;">Next billing date: <strong>{next_billing_pretty}</strong></p>
        {download_block}
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">If you have any questions, reply to this email.</p>
      </div>
      <div style="padding:14px 24px;background:#f8fafc;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">Powered by Hetu Pathways</p>
      </div>
    </div>
    """
