"""
Stripe Connect: Hybrid Commission Model
- QR Orders: 0.3% platform fee via application_fee_amount
- POS Orders: 0% fee (restaurant keeps everything)
- Direct Charges: restaurant pays Stripe processing fee
- Refund: platform fee retained by default (Stripe standard behaviour)
"""
import os
import json
import math
import stripe
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from database import db
from dependencies import get_current_user, require_admin, require_platform_owner
from models import User
from datetime import datetime, timezone

router = APIRouter()

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
stripe.api_key = STRIPE_API_KEY

QR_PLATFORM_FEE_PERCENT = 0.003   # 0.3% on QR orders
POS_PLATFORM_FEE_PERCENT = 0.0    # 0% on POS orders


# ─── Models ───────────────────────────────────────────────────────────────────

class OnboardRequest(BaseModel):
    return_url: str
    refresh_url: str

class PaymentRequest(BaseModel):
    order_id: str
    origin_url: str

class RefundRequest(BaseModel):
    order_id: str
    reason: Optional[str] = "requested_by_customer"


# ─── Connect: Onboarding ─────────────────────────────────────────────────────

@router.post("/payments/connect/onboard")
async def create_connect_account(req: OnboardRequest, current_user: User = Depends(require_admin)):
    """Restaurant Admin clicks 'Connect with Stripe' — creates Standard account + onboarding link."""
    if not STRIPE_API_KEY or STRIPE_API_KEY == "sk_test_emergent":
        raise HTTPException(status_code=400, detail="Online payments are not yet available. The platform's Stripe integration is still being set up.")

    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    existing_account_id = restaurant.get("stripe_account_id")

    try:
        if not existing_account_id:
            account = stripe.Account.create(
                type="standard",
                metadata={
                    "restaurant_id": current_user.restaurant_id,
                    "restaurant_name": restaurant.get("name", ""),
                },
            )
            existing_account_id = account.id

            await db.restaurants.update_one(
                {"id": current_user.restaurant_id},
                {"$set": {
                    "stripe_account_id": existing_account_id,
                    "stripe_connect_status": "pending",
                    "stripe_connect_initiated_at": datetime.now(timezone.utc).isoformat(),
                }}
            )

        account_link = stripe.AccountLink.create(
            account=existing_account_id,
            refresh_url=req.refresh_url,
            return_url=req.return_url,
            type="account_onboarding",
        )

        return {"url": account_link.url, "account_id": existing_account_id}

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/payments/connect/status")
async def get_connect_status(current_user: User = Depends(require_admin)):
    """Check if restaurant's Stripe account is fully onboarded."""
    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    account_id = restaurant.get("stripe_account_id")
    if not account_id:
        return {"connected": False, "status": "not_started", "charges_enabled": False}

    try:
        account = stripe.Account.retrieve(account_id)
        charges_enabled = account.get("charges_enabled", False)
        payouts_enabled = account.get("payouts_enabled", False)
        details_submitted = account.get("details_submitted", False)

        status = "active" if charges_enabled and payouts_enabled else ("pending" if details_submitted else "incomplete")

        await db.restaurants.update_one(
            {"id": current_user.restaurant_id},
            {"$set": {
                "stripe_connect_status": status,
                "stripe_charges_enabled": charges_enabled,
                "stripe_payouts_enabled": payouts_enabled,
            }}
        )

        return {
            "connected": charges_enabled,
            "status": status,
            "charges_enabled": charges_enabled,
            "payouts_enabled": payouts_enabled,
            "account_id": account_id[:12] + "...",
        }

    except stripe.error.StripeError:
        return {"connected": False, "status": "error", "charges_enabled": False}


@router.get("/payments/connect/status/{restaurant_id}")
async def get_connect_status_public(restaurant_id: str):
    """Public: check if restaurant accepts online payments (for guest menu)."""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "stripe_account_id": 1, "stripe_charges_enabled": 1}
    )
    if not restaurant:
        return {"pay_enabled": False}
    return {"pay_enabled": bool(restaurant.get("stripe_charges_enabled", False))}


# ─── Pay-at-Table: Checkout Session (Hybrid Fee) ─────────────────────────────

@router.post("/payments/create-checkout-session")
async def create_checkout_session(req: PaymentRequest):
    """
    Guest clicks 'Pay Bill'.
    - QR orders: 0.3% application_fee_amount (rounded UP to nearest penny)
    - POS orders: 0% fee
    Uses Direct Charges: restaurant pays Stripe processing, platform takes commission.
    """
    order = await db.orders.find_one({"id": req.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    total = order.get("total_amount", 0)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Invalid order total")

    # Determine order source
    order_source = order.get("source", "pos")  # QR orders have source="qr"

    # Get restaurant + Stripe account
    restaurant = await db.restaurants.find_one({"id": order.get("restaurant_id")}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    stripe_account_id = restaurant.get("stripe_account_id")
    charges_enabled = restaurant.get("stripe_charges_enabled", False)

    if not stripe_account_id or not charges_enabled:
        raise HTTPException(status_code=400, detail="Restaurant has not connected Stripe payments")

    currency = (restaurant.get("currency") or "GBP").lower()

    # Build line items from order
    line_items = []
    for item in order.get("items", []):
        line_items.append({
            "price_data": {
                "currency": currency,
                "unit_amount": int(round(item.get("unit_price", 0) * 100)),
                "product_data": {"name": item.get("product_name", "Item")},
            },
            "quantity": item.get("quantity", 1),
        })

    if not line_items:
        line_items = [{
            "price_data": {
                "currency": currency,
                "unit_amount": int(round(total * 100)),
                "product_data": {"name": "Order Total"},
            },
            "quantity": 1,
        }]

    # ── Hybrid Fee Logic ──
    # QR: 0.3% rounded UP to nearest penny (minimum 1 unit)
    # POS: 0%
    if order_source == "qr":
        fee_percent = QR_PLATFORM_FEE_PERCENT
        fee_amount = max(1, math.ceil(total * 100 * fee_percent))  # ceil = round UP
    else:
        fee_percent = POS_PLATFORM_FEE_PERCENT
        fee_amount = 0

    # Build URLs from origin
    origin = req.origin_url.rstrip("/")
    success_url = f"{origin}/payment-success?session_id={{CHECKOUT_SESSION_ID}}&order_id={req.order_id}"
    cancel_url = f"{origin}/menu/{order.get('restaurant_id')}/{order.get('table_id', '')}"

    # Build payment_intent_data with conditional fee
    payment_intent_data = {
        "transfer_data": {
            "destination": stripe_account_id,
        },
        "metadata": {
            "order_id": req.order_id,
            "order_source": order_source,
            "restaurant_id": order.get("restaurant_id", ""),
        },
    }
    if fee_amount > 0:
        payment_intent_data["application_fee_amount"] = fee_amount

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=line_items,
            mode="payment",
            success_url=success_url,
            cancel_url=cancel_url,
            payment_intent_data=payment_intent_data,
            metadata={
                "order_id": req.order_id,
                "restaurant_id": order.get("restaurant_id", ""),
                "table_id": order.get("table_id", ""),
                "order_number": str(order.get("order_number", "")),
                "order_source": order_source,
                "platform_fee_pence": str(fee_amount),
            },
        )

        # Record payment transaction (BEFORE redirect)
        await db.payment_transactions.insert_one({
            "session_id": session.id,
            "order_id": req.order_id,
            "restaurant_id": order.get("restaurant_id", ""),
            "stripe_account_id": stripe_account_id,
            "amount": float(total),
            "currency": currency,
            "order_source": order_source,
            "platform_fee": fee_amount / 100.0,
            "fee_percent": fee_percent * 100,
            "payment_status": "initiated",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        return {"url": session.url, "session_id": session.id}

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Checkout Status Polling ──────────────────────────────────────────────────

@router.get("/payments/checkout-status/{session_id}")
async def get_checkout_status(session_id: str):
    """Frontend polls after Stripe redirect to verify payment."""
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        order_id = session.metadata.get("order_id")

        if session.payment_status == "paid" and order_id:
            # Idempotent: only process once
            existing = await db.payment_transactions.find_one(
                {"session_id": session_id}, {"_id": 0}
            )
            if existing and existing.get("payment_status") != "paid":
                await _process_successful_payment(session, order_id)

        return {
            "status": session.status,
            "payment_status": session.payment_status,
            "order_id": order_id,
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Webhook ──────────────────────────────────────────────────────────────────

@router.post("/payments/webhook")
async def stripe_webhook(request: Request):
    """Handle checkout.session.completed and charge.refunded events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.error.SignatureVerificationError):
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        event = json.loads(payload)

    event_type = event.get("type", "")

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        order_id = session.get("metadata", {}).get("order_id")
        if order_id and session.get("payment_status") == "paid":
            await _process_successful_payment(session, order_id)

    elif event_type == "charge.refunded":
        charge = event["data"]["object"]
        pi = charge.get("payment_intent")
        if pi:
            # Mark transaction as refunded
            await db.payment_transactions.update_one(
                {"payment_intent": pi},
                {"$set": {
                    "payment_status": "refunded",
                    "refunded_at": datetime.now(timezone.utc).isoformat(),
                    "refund_amount": charge.get("amount_refunded", 0) / 100.0,
                    # NOTE: Stripe retains the application_fee by default on refund.
                    # The platform keeps its 0.3% unless explicitly refunded via
                    # stripe.ApplicationFee.create_refund(). This is the standard
                    # business model — the service was rendered (order was processed).
                    "platform_fee_retained": True,
                }}
            )

    return {"status": "ok"}


async def _process_successful_payment(session, order_id: str):
    """Mark order as paid, free table, emit WebSocket, update transaction."""
    metadata = session.get("metadata", {})
    restaurant_id = metadata.get("restaurant_id", "")
    table_id = metadata.get("table_id", "")
    order_source = metadata.get("order_source", "pos")
    platform_fee_pence = metadata.get("platform_fee_pence", "0")

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "paid",
            "payment_method": "card",
            "stripe_session_id": session.get("id"),
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "payment_details": {
                "stripe_payment_intent": session.get("payment_intent"),
                "amount_total": (session.get("amount_total") or 0) / 100,
                "currency": session.get("currency", "gbp"),
                "platform_fee": int(platform_fee_pence) / 100.0,
                "order_source": order_source,
            }
        }}
    )

    # Update transaction record (idempotent via session_id)
    await db.payment_transactions.update_one(
        {"session_id": session.get("id")},
        {"$set": {
            "payment_status": "paid",
            "payment_intent": session.get("payment_intent"),
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=False,
    )

    # Free up the table
    if table_id:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"current_order_id": None, "status": "available"}}
        )

    # Emit WebSocket: table turns green on POS
    try:
        from socket_manager import emit_order_update
        if restaurant_id:
            await emit_order_update(restaurant_id, {
                "order_id": order_id,
                "event": "order_paid",
                "table_id": table_id,
                "order_source": order_source,
            })
    except Exception:
        pass


# ─── Refund ───────────────────────────────────────────────────────────────────

@router.post("/payments/refund")
async def refund_payment(req: RefundRequest, current_user: User = Depends(require_admin)):
    """
    Admin refunds a paid order.
    - Refunds the customer charge on the connected account.
    - Platform fee (0.3%) is RETAINED by default (Stripe standard).
    - To also refund the platform fee, set reverse_transfer=True in Stripe.
    """
    order = await db.orders.find_one({"id": req.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") != "paid":
        raise HTTPException(status_code=400, detail="Order is not in paid status")

    payment_intent = (order.get("payment_details") or {}).get("stripe_payment_intent")
    if not payment_intent:
        raise HTTPException(status_code=400, detail="No Stripe payment found for this order")

    try:
        refund = stripe.Refund.create(
            payment_intent=payment_intent,
            reason=req.reason or "requested_by_customer",
            # NOTE: We do NOT set refund_application_fee=True
            # This means the platform KEEPS the 0.3% commission even on refunds.
            # This is the standard SaaS model: the service (order processing) was rendered.
        )

        await db.orders.update_one(
            {"id": req.order_id},
            {"$set": {
                "status": "refunded",
                "refund_id": refund.id,
                "refunded_at": datetime.now(timezone.utc).isoformat(),
                "refund_reason": req.reason,
            }}
        )

        # Audit log
        try:
            from routers.audit import log_audit
            await log_audit(
                action="order_refunded",
                performed_by=current_user.username,
                restaurant_id=current_user.restaurant_id or order.get("restaurant_id"),
                order_id=req.order_id,
                order_number=order.get("order_number"),
                details={
                    "reason": req.reason,
                    "original_total": order.get("total_amount", 0),
                    "refund_id": refund.id,
                    "platform_fee_retained": True,
                },
            )
        except Exception:
            pass

        return {"message": "Refund processed", "refund_id": refund.id}

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Platform Owner: Commission Dashboard ────────────────────────────────────

@router.get("/payments/platform/stats")
async def get_platform_stats(current_user: User = Depends(require_platform_owner)):
    """
    Super-admin view:
    - Total volume processed (all restaurants)
    - Platform earnings (0.3% from QR only)
    - Active/Pending merchants
    - Per-restaurant breakdown
    """
    paid_txns = await db.payment_transactions.find(
        {"payment_status": "paid"}, {"_id": 0}
    ).to_list(50000)

    total_volume = sum(t.get("amount", 0) for t in paid_txns)
    total_platform_fees = sum(t.get("platform_fee", 0) for t in paid_txns)
    total_transactions = len(paid_txns)

    # QR vs POS breakdown
    qr_txns = [t for t in paid_txns if t.get("order_source") == "qr"]
    pos_txns = [t for t in paid_txns if t.get("order_source") != "qr"]
    qr_volume = sum(t.get("amount", 0) for t in qr_txns)
    pos_volume = sum(t.get("amount", 0) for t in pos_txns)
    qr_fees = sum(t.get("platform_fee", 0) for t in qr_txns)

    # Active merchants
    all_restaurants = await db.restaurants.find(
        {}, {"_id": 0, "id": 1, "name": 1, "stripe_account_id": 1,
             "stripe_connect_status": 1, "stripe_charges_enabled": 1}
    ).to_list(1000)

    merchants = []
    for r in all_restaurants:
        if r.get("stripe_account_id"):
            r_txns = [t for t in paid_txns if t.get("restaurant_id") == r["id"]]
            r_qr = [t for t in r_txns if t.get("order_source") == "qr"]
            merchants.append({
                "restaurant_id": r["id"],
                "name": r.get("name", "Unknown"),
                "status": r.get("stripe_connect_status", "unknown"),
                "charges_enabled": r.get("stripe_charges_enabled", False),
                "total_volume": round(sum(t.get("amount", 0) for t in r_txns), 2),
                "qr_volume": round(sum(t.get("amount", 0) for t in r_qr), 2),
                "platform_fees": round(sum(t.get("platform_fee", 0) for t in r_qr), 2),
                "transactions": len(r_txns),
            })

    connected = sum(1 for m in merchants if m["charges_enabled"])
    pending = sum(1 for m in merchants if not m["charges_enabled"])

    return {
        "total_volume": round(total_volume, 2),
        "qr_volume": round(qr_volume, 2),
        "pos_volume": round(pos_volume, 2),
        "total_platform_fees": round(total_platform_fees, 2),
        "qr_fees": round(qr_fees, 2),
        "total_transactions": total_transactions,
        "qr_transactions": len(qr_txns),
        "pos_transactions": len(pos_txns),
        "connected_merchants": connected,
        "pending_merchants": pending,
        "merchants": merchants,
        "qr_fee_percent": QR_PLATFORM_FEE_PERCENT * 100,
        "pos_fee_percent": POS_PLATFORM_FEE_PERCENT * 100,
    }


@router.get("/payments/order-status/{order_id}")
async def get_order_payment_status(order_id: str):
    """Public: guest checks if payment was processed."""
    order = await db.orders.find_one(
        {"id": order_id},
        {"_id": 0, "status": 1, "total_amount": 1, "order_number": 1}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "order_id": order_id,
        "status": order.get("status"),
        "total_amount": order.get("total_amount", 0),
        "order_number": order.get("order_number"),
    }
