from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user
from models import User, Order, OrderCreate, OrderComplete, CancelOrderRequest, SyncData
from typing import List
from datetime import datetime, timezone, timedelta

router = APIRouter()


@router.post("/orders", response_model=Order)
async def create_order(order_data: OrderCreate, current_user: User = Depends(get_current_user)):
    last_order = await db.orders.find_one(sort=[("order_number", -1)])
    if last_order:
        last_num = last_order.get("order_number", 0)
        order_number = (int(last_num) + 1) if last_num else 1
    else:
        order_number = 1

    order_id = f"order_{datetime.now(timezone.utc).timestamp()}"
    order_dict = {
        "id": order_id,
        "order_number": order_number,
        "items": [item.model_dump() for item in order_data.items],
        "subtotal": order_data.subtotal,
        "discount_amount": order_data.discount_amount or 0,
        "discount_type": order_data.discount_type,
        "discount_value": order_data.discount_value,
        "tip_amount": order_data.tip_amount or 0,
        "tip_percentage": order_data.tip_percentage or 0,
        "total_amount": order_data.total_amount,
        "payment_method": None,
        "payment_details": None,
        "status": "pending",
        "created_by": current_user.username,
        "table_id": order_data.table_id,
        "restaurant_id": current_user.restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "cancelled_at": None,
    }

    if order_data.table_id:
        await db.tables.update_one(
            {"id": order_data.table_id},
            {"$set": {"current_order_id": order_id, "status": "occupied"}}
        )

    await db.orders.insert_one(order_dict)

    # Audit: order created
    try:
        from routers.audit import log_audit
        await log_audit(
            action="order_created",
            performed_by=current_user.username,
            restaurant_id=current_user.restaurant_id,
            order_id=order_id,
            order_number=order_number,
            details={"total": order_data.total_amount, "items_count": len(order_data.items), "table_id": order_data.table_id},
        )
    except Exception:
        pass

    # Emit WebSocket event so KDS picks up the new order instantly
    try:
        from socket_manager import emit_order_update
        if current_user.restaurant_id:
            await emit_order_update(current_user.restaurant_id, {
                "order_id": order_id,
                "order_number": order_number,
                "event": "new_pos_order",
                "kds_status": "new",
            })
    except Exception:
        pass

    return Order(**order_dict)


@router.put("/orders/{order_id}", response_model=Order)
async def update_order(order_id: str, order_data: OrderCreate, current_user: User = Depends(get_current_user)):
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    if existing["status"] != "pending":
        raise HTTPException(status_code=400, detail="Can only edit pending orders")

    # Capture what changed for audit
    old_items = existing.get("items", [])
    new_items = [item.model_dump() for item in order_data.items]
    old_total = existing.get("total_amount", 0)

    update_dict = {
        "items": new_items,
        "subtotal": order_data.subtotal,
        "discount_amount": order_data.discount_amount or 0,
        "discount_type": order_data.discount_type,
        "discount_value": order_data.discount_value,
        "tip_amount": order_data.tip_amount or 0,
        "tip_percentage": order_data.tip_percentage or 0,
        "total_amount": order_data.total_amount,
        "table_id": order_data.table_id,
    }
    await db.orders.update_one({"id": order_id}, {"$set": update_dict})

    # Audit: order edited
    try:
        from routers.audit import log_audit
        removed_items = [i.get("product_name", "?") for i in old_items if i not in new_items]
        await log_audit(
            action="order_edited",
            performed_by=current_user.username,
            restaurant_id=current_user.restaurant_id,
            order_id=order_id,
            order_number=existing.get("order_number"),
            details={
                "old_total": old_total,
                "new_total": order_data.total_amount,
                "old_items_count": len(old_items),
                "new_items_count": len(new_items),
                "removed_items": removed_items[:10],
            },
        )
    except Exception:
        pass

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return Order(**updated)


@router.put("/orders/{order_id}/complete", response_model=Order)
async def complete_order(order_id: str, complete_data: OrderComplete, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail="Order is not pending")

    final_total = complete_data.total_amount or order["total_amount"]
    if complete_data.tip_amount:
        final_total = order.get("subtotal", order["total_amount"]) + complete_data.tip_amount

    update_dict = {
        "payment_method": complete_data.payment_method,
        "tip_amount": complete_data.tip_amount or 0,
        "tip_percentage": complete_data.tip_percentage or 0,
        "total_amount": final_total,
        "payment_details": complete_data.payment_details,
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat()
    }

    await db.orders.update_one({"id": order_id}, {"$set": update_dict})

    if order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {"current_order_id": None, "status": "available"}}
        )

    # Audit: order completed
    try:
        from routers.audit import log_audit
        await log_audit(
            action="order_completed",
            performed_by=current_user.username,
            restaurant_id=current_user.restaurant_id or order.get("restaurant_id"),
            order_id=order_id,
            order_number=order.get("order_number"),
            details={
                "payment_method": complete_data.payment_method,
                "total": final_total,
                "tip": complete_data.tip_amount or 0,
            },
        )
    except Exception:
        pass

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return Order(**updated)


@router.put("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, cancel_data: CancelOrderRequest, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail="Can only cancel pending orders")

    reason = cancel_data.cancel_reason or "Cancelled by staff"
    await db.orders.update_one({"id": order_id}, {"$set": {
        "status": "cancelled",
        "cancel_reason": reason,
        "cancelled_at": datetime.now(timezone.utc).isoformat()
    }})

    if order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {"current_order_id": None, "status": "available"}}
        )

    # Audit: order cancelled — CRITICAL security event
    try:
        from routers.audit import log_audit
        await log_audit(
            action="order_cancelled",
            performed_by=current_user.username,
            restaurant_id=current_user.restaurant_id or order.get("restaurant_id"),
            order_id=order_id,
            order_number=order.get("order_number"),
            details={
                "reason": reason,
                "original_total": order.get("total_amount", 0),
                "items_count": len(order.get("items", [])),
                "items": [{"name": i.get("product_name"), "qty": i.get("quantity"), "total": i.get("total")} for i in order.get("items", [])[:10]],
            },
        )
    except Exception:
        pass

    return {"message": "Order cancelled", "cancel_reason": reason}


@router.get("/orders/pending", response_model=List[Order])
async def get_pending_orders(current_user: User = Depends(get_current_user)):
    orders = await db.orders.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [Order(**o) for o in orders]


@router.get("/orders", response_model=List[Order])
async def get_orders(current_user: User = Depends(get_current_user), from_date: str = None, to_date: str = None, today_only: bool = False):
    query = {}

    if today_only:
        now = datetime.now(timezone.utc)
        if now.hour < 2:
            biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
        else:
            biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)
        biz_end = biz_start + timedelta(days=1)
        query["created_at"] = {"$gte": biz_start.isoformat(), "$lt": biz_end.isoformat()}
    elif from_date and to_date:
        query["created_at"] = {"$gte": from_date, "$lte": to_date}

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return [Order(**o) for o in orders]


@router.post("/sync")
async def sync_offline_data(sync_data: SyncData, current_user: User = Depends(get_current_user)):
    synced = 0
    errors = []
    for order_data in sync_data.orders:
        try:
            existing = await db.orders.find_one({"id": order_data.get("id")})
            if existing:
                continue
            order_data["created_by"] = current_user.username
            await db.orders.insert_one(order_data)
            synced += 1
        except Exception as e:
            errors.append(str(e))

    # Audit: offline sync
    if synced > 0:
        try:
            from routers.audit import log_audit
            await log_audit(
                action="offline_sync",
                performed_by=current_user.username,
                restaurant_id=current_user.restaurant_id,
                details={"synced": synced, "errors": len(errors), "total": len(sync_data.orders)},
            )
        except Exception:
            pass

    return {"synced": synced, "errors": errors, "total": len(sync_data.orders)}
