from fastapi import APIRouter, Depends, HTTPException, Request
from database import db
from dependencies import get_current_user, require_platform_owner
from models import User, SubscriptionUpdate
from datetime import datetime, timezone, timedelta
import os
import json

router = APIRouter()


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
async def create_stripe_checkout(current_user: User = Depends(require_platform_owner)):
    import stripe
    stripe.api_key = os.environ.get("STRIPE_API_KEY", "")
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price_data": {"currency": "gbp", "product_data": {"name": "Heva One Standard Plan"}, "unit_amount": 4999, "recurring": {"interval": "month"}}, "quantity": 1}],
            mode="subscription",
            success_url=os.environ.get("FRONTEND_URL", "http://localhost:3000") + "/platform/subscriptions?success=true",
            cancel_url=os.environ.get("FRONTEND_URL", "http://localhost:3000") + "/platform/subscriptions?cancelled=true",
        )
        return {"checkout_url": session.url, "session_id": session.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    import stripe
    stripe.api_key = os.environ.get("STRIPE_API_KEY", "")
    payload = await request.body()
    try:
        event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    if event.type == "invoice.payment_succeeded":
        customer_id = event.data.object.get("customer")
        restaurant = await db.restaurants.find_one({"stripe_customer_id": customer_id})
        if restaurant:
            await db.restaurants.update_one({"id": restaurant["id"]}, {"$set": {"subscription_status": "active", "next_billing_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}})
    elif event.type == "invoice.payment_failed":
        customer_id = event.data.object.get("customer")
        restaurant = await db.restaurants.find_one({"stripe_customer_id": customer_id})
        if restaurant:
            await db.restaurants.update_one({"id": restaurant["id"]}, {"$set": {"subscription_status": "suspended", "suspended_at": datetime.now(timezone.utc).isoformat()}})
            await db.notifications.insert_one({
                "id": f"notif_stripe_{datetime.now(timezone.utc).timestamp()}", "restaurant_id": restaurant["id"],
                "type": "payment_failed", "message": f"Payment failed for {restaurant.get('business_info', {}).get('name', '')}",
                "email": restaurant.get("owner_email", ""), "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(), "sent_at": None
            })

    return {"status": "ok"}
