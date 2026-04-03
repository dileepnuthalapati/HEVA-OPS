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


async def _update_kds_status(order_id: str, new_status: str, time_field: str):
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

    return {"order_id": order_id, "kds_status": new_status}


@router.put("/orders/{order_id}/acknowledge")
async def acknowledge_order(order_id: str, current_user: User = Depends(get_current_user)):
    """Kitchen acknowledges they've seen the order."""
    return await _update_kds_status(order_id, "acknowledged", "acknowledged_at")


@router.put("/orders/{order_id}/preparing")
async def start_preparing(order_id: str, current_user: User = Depends(get_current_user)):
    """Kitchen starts preparing the order."""
    return await _update_kds_status(order_id, "preparing", "prep_started_at")


@router.put("/orders/{order_id}/ready")
async def mark_ready(order_id: str, current_user: User = Depends(get_current_user)):
    """Order is ready for pickup."""
    return await _update_kds_status(order_id, "ready", "ready_at")


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
