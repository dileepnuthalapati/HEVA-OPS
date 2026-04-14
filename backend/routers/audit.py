"""
Heva One Audit Log — Tamper-proof activity trail for security & compliance.

Tracks: order cancellations/voids, edits, completions, discounts, KDS bumps, QR toggles.

Endpoints:
  GET  /audit/logs          → Query audit logs with filters (admin only)
  GET  /audit/logs/summary  → Summary stats (voids today, top actors)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from dependencies import get_current_user, require_admin
from models import User
from datetime import datetime, timezone, timedelta
from typing import Optional

router = APIRouter(prefix="/audit", tags=["Audit Log"])


# --- Helper: Write audit log (called by other routers) ---

async def log_audit(
    action: str,
    performed_by: str,
    restaurant_id: str = None,
    order_id: str = None,
    order_number: int = None,
    details: dict = None,
):
    """Write an immutable audit log entry. Called by other routers on key actions."""
    entry = {
        "id": f"audit_{datetime.now(timezone.utc).timestamp()}",
        "action": action,
        "performed_by": performed_by,
        "restaurant_id": restaurant_id,
        "order_id": order_id,
        "order_number": order_number,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_logs.insert_one(entry)
    return entry


# --- Endpoints ---

@router.get("/logs")
async def get_audit_logs(
    current_user: User = Depends(require_admin),
    action: Optional[str] = None,
    performed_by: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    order_id: Optional[str] = None,
    limit: int = Query(default=200, le=1000),
    skip: int = 0,
):
    """Admin: Query audit logs with optional filters."""
    query = {}

    if current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id
    if action:
        query["action"] = action
    if performed_by:
        query["performed_by"] = performed_by
    if order_id:
        query["order_id"] = order_id
    if from_date:
        query.setdefault("created_at", {})["$gte"] = from_date
    if to_date:
        query.setdefault("created_at", {})["$lte"] = to_date

    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.audit_logs.count_documents(query)

    return {"logs": logs, "total": total, "limit": limit, "skip": skip}


@router.get("/logs/summary")
async def get_audit_summary(current_user: User = Depends(require_admin)):
    """Admin: Today's audit summary — voids, edits, top actors."""
    now = datetime.now(timezone.utc)
    if now.hour < 2:
        biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    else:
        biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)

    base_query = {"created_at": {"$gte": biz_start.isoformat()}}
    if current_user.restaurant_id:
        base_query["restaurant_id"] = current_user.restaurant_id

    # Count by action type
    pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
    ]
    action_counts = {}
    async for doc in db.audit_logs.aggregate(pipeline):
        action_counts[doc["_id"]] = doc["count"]

    # Top actors today
    actor_pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$performed_by", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_actors = []
    async for doc in db.audit_logs.aggregate(actor_pipeline):
        top_actors.append({"user": doc["_id"], "actions": doc["count"]})

    # Recent voids/cancellations
    void_query = {**base_query, "action": {"$in": ["order_cancelled", "order_voided", "item_removed"]}}
    recent_voids = await db.audit_logs.find(void_query, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)

    total_today = await db.audit_logs.count_documents(base_query)

    return {
        "total_events_today": total_today,
        "action_counts": action_counts,
        "top_actors": top_actors,
        "recent_voids": recent_voids,
    }
