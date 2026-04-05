"""
HevaPOS Kitchen Display System (KDS) — Digital ticket management for kitchen staff.

KDS Status Flow:
  new → acknowledged → preparing → ready
  (Independent of payment status: pending → completed)

Endpoints:
  GET  /kds/orders                        → Active kitchen orders
  PUT  /kds/orders/{order_id}/acknowledge → Kitchen acknowledges order
  PUT  /kds/orders/{order_id}/preparing   → Kitchen starts preparation
  PUT  /kds/orders/{order_id}/ready       → Order ready for pickup
  PUT  /kds/orders/{order_id}/recall      → Recall a "ready" order back to preparing
  GET  /kds/stats                         → Avg prep time and queue depth
"""
from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user
from models import User
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/kds", tags=["Kitchen Display"])


@router.get("/orders")
async def get_kds_orders(current_user: User = Depends(get_current_user)):
    """Get all active orders for the kitchen display (pending status, any kds_status except served)."""
    now = datetime.now(timezone.utc)
    # Business day: 2AM to 2AM
    if now.hour < 2:
        biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    else:
        biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)

    orders = await db.orders.find(
        {
            "status": "pending",
            "created_at": {"$gte": biz_start.isoformat()},
        },
        {"_id": 0}
    ).sort("created_at", 1).to_list(200)

    # Enrich with table info
    table_ids = [o["table_id"] for o in orders if o.get("table_id")]
    tables = {}
    if table_ids:
        table_docs = await db.tables.find({"id": {"$in": table_ids}}, {"_id": 0}).to_list(100)
        tables = {t["id"]: t for t in table_docs}

    result = []
    for o in orders:
        table = tables.get(o.get("table_id"))
        kds_status = o.get("kds_status", "new")
        result.append({
            "id": o["id"],
            "order_number": o.get("order_number"),
            "items": o.get("items", []),
            "table_number": table["number"] if table else None,
            "table_name": table.get("name", f"Table {table['number']}") if table else None,
            "source": o.get("source", "pos"),
            "guest_name": o.get("guest_name"),
            "guest_notes": o.get("guest_notes"),
            "created_by": o.get("created_by", ""),
            "created_at": o.get("created_at"),
            "kds_status": kds_status,
            "acknowledged_at": o.get("acknowledged_at"),
            "prep_started_at": o.get("prep_started_at"),
            "ready_at": o.get("ready_at"),
        })

    return result


async def _update_kds_status(order_id: str, new_status: str, time_field: str, username: str = None, restaurant_id_ctx: str = None):
    """Helper: Update KDS status and emit WebSocket event."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail="Order is no longer active")

    update = {
        "kds_status": new_status,
        time_field: datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.update_one({"id": order_id}, {"$set": update})

    # Emit WebSocket event
    try:
        from socket_manager import emit_order_update
        restaurant_id = order.get("restaurant_id")
        if restaurant_id:
            await emit_order_update(restaurant_id, {
                "order_id": order_id,
                "order_number": order.get("order_number"),
                "kds_status": new_status,
                "event": f"kds_{new_status}",
            })
    except Exception:
        pass

    # Audit log
    try:
        from routers.audit import log_audit
        await log_audit(
            action=f"kds_{new_status}",
            performed_by=username or "kitchen",
            restaurant_id=restaurant_id_ctx or order.get("restaurant_id"),
            order_id=order_id,
            order_number=order.get("order_number"),
            details={"new_status": new_status},
        )
    except Exception:
        pass

    return {"order_id": order_id, "kds_status": new_status}


@router.put("/orders/{order_id}/acknowledge")
async def acknowledge_order(order_id: str, current_user: User = Depends(get_current_user)):
    """Kitchen acknowledges they've seen the order."""
    return await _update_kds_status(order_id, "acknowledged", "acknowledged_at", current_user.username, current_user.restaurant_id)


@router.put("/orders/{order_id}/preparing")
async def start_preparing(order_id: str, current_user: User = Depends(get_current_user)):
    """Kitchen starts preparing the order."""
    return await _update_kds_status(order_id, "preparing", "prep_started_at", current_user.username, current_user.restaurant_id)


@router.put("/orders/{order_id}/ready")
async def mark_ready(order_id: str, current_user: User = Depends(get_current_user)):
    """Order is ready for pickup."""
    return await _update_kds_status(order_id, "ready", "ready_at", current_user.username, current_user.restaurant_id)


@router.put("/orders/{order_id}/recall")
async def recall_order(order_id: str, current_user: User = Depends(get_current_user)):
    """Recall a ready order back to preparing."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.update_one({"id": order_id}, {
        "$set": {"kds_status": "preparing", "ready_at": None}
    })
    return {"order_id": order_id, "kds_status": "preparing"}


@router.get("/stats")
async def get_kds_stats(current_user: User = Depends(get_current_user)):
    """Get KDS performance stats (avg prep time, queue depth)."""
    now = datetime.now(timezone.utc)
    if now.hour < 2:
        biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    else:
        biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)

    # Active orders count by kds_status
    pipeline = [
        {"$match": {"status": "pending", "created_at": {"$gte": biz_start.isoformat()}}},
        {"$group": {"_id": {"$ifNull": ["$kds_status", "new"]}, "count": {"$sum": 1}}}
    ]
    status_counts = {}
    async for doc in db.orders.aggregate(pipeline):
        status_counts[doc["_id"]] = doc["count"]

    # Avg prep time (orders that have both acknowledged_at and ready_at today)
    ready_orders = await db.orders.find(
        {
            "ready_at": {"$exists": True, "$ne": None},
            "acknowledged_at": {"$exists": True, "$ne": None},
            "created_at": {"$gte": biz_start.isoformat()},
        },
        {"_id": 0, "acknowledged_at": 1, "ready_at": 1}
    ).to_list(500)

    avg_prep_seconds = 0
    if ready_orders:
        total_secs = 0
        count = 0
        for o in ready_orders:
            try:
                ack = datetime.fromisoformat(o["acknowledged_at"])
                rdy = datetime.fromisoformat(o["ready_at"])
                total_secs += (rdy - ack).total_seconds()
                count += 1
            except (ValueError, TypeError):
                pass
        if count > 0:
            avg_prep_seconds = total_secs / count

    total_active = sum(status_counts.values())

    return {
        "queue_depth": total_active,
        "status_counts": status_counts,
        "avg_prep_time_seconds": round(avg_prep_seconds),
        "avg_prep_time_display": f"{int(avg_prep_seconds // 60)}:{int(avg_prep_seconds % 60):02d}" if avg_prep_seconds > 0 else "--:--",
    }


# ── Public KDS Monitor Endpoints (no auth, token-based) ────────────────

import secrets

@router.post("/generate-token")
async def generate_kds_token(current_user: User = Depends(get_current_user)):
    """Generate a unique KDS monitor token for this restaurant."""
    if not current_user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")

    token = secrets.token_urlsafe(24)
    await db.restaurants.update_one(
        {"id": current_user.restaurant_id},
        {"$set": {"kds_token": token}}
    )
    return {"kds_token": token, "restaurant_id": current_user.restaurant_id}


@router.post("/verify-pin")
async def verify_kds_pin(restaurant_id: str, pin: str):
    """Verify the manager PIN to unlock the KDS monitor."""
    rest = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "kds_token": 1})
    if not rest or not rest.get("kds_token"):
        raise HTTPException(status_code=404, detail="KDS not configured. Open KDS from the app first and tap the monitor icon to generate the URL.")

    # Verify PIN against any user with manager_pin_hash in this restaurant
    from dependencies import verify_password
    users = await db.users.find(
        {"restaurant_id": restaurant_id, "manager_pin_hash": {"$exists": True, "$ne": None}},
        {"_id": 0, "username": 1, "manager_pin_hash": 1, "password_hash": 1}
    ).to_list(50)

    for user in users:
        pin_hash = user.get("manager_pin_hash")
        if pin_hash and verify_password(pin, pin_hash):
            return {"kds_token": rest["kds_token"], "verified": True}
        # Also try password as PIN fallback
        pw_hash = user.get("password_hash")
        if pw_hash and verify_password(pin, pw_hash):
            return {"kds_token": rest["kds_token"], "verified": True}

    raise HTTPException(status_code=401, detail="Invalid PIN")

    return {"kds_token": rest["kds_token"], "verified": True}


@router.get("/public/orders/{restaurant_id}/{kds_token}")
async def get_public_kds_orders(restaurant_id: str, kds_token: str):
    """Public KDS endpoint — token-authenticated, no user login needed."""
    rest = await db.restaurants.find_one(
        {"id": restaurant_id, "kds_token": kds_token},
        {"_id": 0, "id": 1, "business_info": 1}
    )
    if not rest:
        raise HTTPException(status_code=403, detail="Invalid KDS token")

    now = datetime.now(timezone.utc)
    if now.hour < 2:
        biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    else:
        biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)

    orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": "pending",
            "created_at": {"$gte": biz_start.isoformat()},
        },
        {"_id": 0}
    ).sort("created_at", 1).to_list(200)

    for o in orders:
        if "kds_status" not in o:
            o["kds_status"] = "new"

    return {"orders": orders, "restaurant_name": rest.get("business_info", {}).get("name", "")}


@router.put("/public/orders/{restaurant_id}/{kds_token}/{order_id}/{action}")
async def public_kds_bump(restaurant_id: str, kds_token: str, order_id: str, action: str):
    """Public KDS bump — token-authenticated."""
    rest = await db.restaurants.find_one(
        {"id": restaurant_id, "kds_token": kds_token},
        {"_id": 0, "id": 1}
    )
    if not rest:
        raise HTTPException(status_code=403, detail="Invalid KDS token")

    action_map = {
        "acknowledge": ("acknowledged", "acknowledged_at"),
        "preparing": ("preparing", "preparing_at"),
        "ready": ("ready", "ready_at"),
        "recall": ("preparing", "recalled_at"),
    }
    if action not in action_map:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    new_status, time_field = action_map[action]
    await _update_kds_status(order_id, new_status, time_field, username="kds_monitor", restaurant_id_ctx=restaurant_id)
    return {"ok": True, "new_status": new_status}


@router.get("/public/stats/{restaurant_id}/{kds_token}")
async def get_public_kds_stats(restaurant_id: str, kds_token: str):
    """Public KDS stats — token-authenticated."""
    rest = await db.restaurants.find_one(
        {"id": restaurant_id, "kds_token": kds_token},
        {"_id": 0, "id": 1}
    )
    if not rest:
        raise HTTPException(status_code=403, detail="Invalid KDS token")

    now = datetime.now(timezone.utc)
    if now.hour < 2:
        biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    else:
        biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"restaurant_id": restaurant_id, "status": "pending", "created_at": {"$gte": biz_start.isoformat()}}},
        {"$group": {"_id": {"$ifNull": ["$kds_status", "new"]}, "count": {"$sum": 1}}}
    ]
    status_counts = {}
    async for doc in db.orders.aggregate(pipeline):
        status_counts[doc["_id"]] = doc["count"]

    ready_orders = await db.orders.find(
        {"restaurant_id": restaurant_id, "ready_at": {"$exists": True, "$ne": None}, "acknowledged_at": {"$exists": True, "$ne": None}, "created_at": {"$gte": biz_start.isoformat()}},
        {"_id": 0, "acknowledged_at": 1, "ready_at": 1}
    ).to_list(500)

    avg_prep_seconds = 0
    if ready_orders:
        total_secs = 0
        count = 0
        for o in ready_orders:
            try:
                ack = datetime.fromisoformat(o["acknowledged_at"])
                rdy = datetime.fromisoformat(o["ready_at"])
                total_secs += (rdy - ack).total_seconds()
                count += 1
            except (ValueError, TypeError):
                pass
        if count > 0:
            avg_prep_seconds = total_secs / count

    return {
        "queue_depth": sum(status_counts.values()),
        "status_counts": status_counts,
        "avg_prep_time_display": f"{int(avg_prep_seconds // 60)}:{int(avg_prep_seconds % 60):02d}" if avg_prep_seconds > 0 else "--:--",
    }
