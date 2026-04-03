"""
Stripe Pay-at-Table: Checkout Sessions for QR guest orders.
"""
import os
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from database import db
from datetime import datetime, timezone

router = APIRouter()

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
stripe.api_key = STRIPE_API_KEY


class PaymentRequest(BaseModel):
    order_id: str
    success_url: str
    cancel_url: str


@router.post("/payments/create-checkout-session")
async def create_checkout_session(req: PaymentRequest):
    """Guest clicks 'Pay Bill' — create a Stripe Checkout Session."""
    order = await db.orders.find_one({"id": req.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    total = order.get("total_amount", 0)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Invalid order total")

    # Get currency from restaurant
    restaurant = await db.restaurants.find_one({"id": order.get("restaurant_id")}, {"_id": 0, "currency": 1, "name": 1})
    currency = (restaurant or {}).get("currency", "GBP").lower()

    # Build line items from order items
    line_items = []
    for item in order.get("items", []):
        line_items.append({
            "price_data": {
                "currency": currency,
                "unit_amount": int(round(item.get("unit_price", 0) * 100)),
                "product_data": {
                    "name": item.get("product_name", "Item"),
                },
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

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=line_items,
            mode="payment",
            success_url=req.success_url,
            cancel_url=req.cancel_url,
            metadata={
                "order_id": req.order_id,
                "restaurant_id": order.get("restaurant_id", ""),
                "table_id": order.get("table_id", ""),
                "order_number": str(order.get("order_number", "")),
            },
            payment_intent_data={
                "metadata": {
                    "order_id": req.order_id,
                    "restaurant_id": order.get("restaurant_id", ""),
                }
            },
        )
        return {"session_id": session.id, "url": session.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/payments/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook for checkout.session.completed."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.error.SignatureVerificationError):
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        import json
        event = json.loads(payload)

    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        order_id = session.get("metadata", {}).get("order_id")
        restaurant_id = session.get("metadata", {}).get("restaurant_id")
        table_id = session.get("metadata", {}).get("table_id")

        if order_id:
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "status": "paid",
                    "payment_method": "card",
                    "stripe_session_id": session.get("id"),
                    "paid_at": datetime.now(timezone.utc).isoformat(),
                    "payment_details": {
                        "stripe_payment_intent": session.get("payment_intent"),
                        "amount_total": session.get("amount_total", 0) / 100,
                        "currency": session.get("currency", "gbp"),
                    }
                }}
            )

            # Free up the table
            if table_id:
                await db.tables.update_one(
                    {"id": table_id},
                    {"$set": {"current_order_id": None, "status": "available"}}
                )

            # Emit WebSocket: order paid → POS sees green table
            try:
                from socket_manager import emit_order_update
                if restaurant_id:
                    await emit_order_update(restaurant_id, {
                        "order_id": order_id,
                        "event": "order_paid",
                        "table_id": table_id,
                    })
            except Exception:
                pass

    return {"status": "ok"}


@router.get("/payments/order-status/{order_id}")
async def get_order_payment_status(order_id: str):
    """Public endpoint: guest polls to check if payment was processed."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0, "status": 1, "total_amount": 1, "items": 1, "order_number": 1})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "order_id": order_id,
        "status": order.get("status"),
        "total_amount": order.get("total_amount", 0),
        "order_number": order.get("order_number"),
    }
