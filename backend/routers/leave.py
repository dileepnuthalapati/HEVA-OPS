from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(dependencies=[Depends(require_feature("workforce"))])

LEAVE_TYPES = ["vacation", "sick", "personal", "public_holiday"]
LEAVE_STATUSES = ["pending", "approved", "declined"]


class LeaveRequestCreate(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    leave_type: str
    note: Optional[str] = None


class AvailabilityRule(BaseModel):
    day_of_week: int  # 0=Sun, 1=Mon ... 6=Sat
    unavailable_from: Optional[str] = None  # HH:MM or null = all day
    unavailable_to: Optional[str] = None
    reason: Optional[str] = None


class AvailabilityUpdate(BaseModel):
    rules: List[AvailabilityRule]


# ── Staff: Request Time Off ──

@router.post("/leave-requests")
async def create_leave_request(data: LeaveRequestCreate, current_user: User = Depends(get_current_user)):
    """Staff submits a time off request."""
    if data.leave_type not in LEAVE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid leave type. Must be: {', '.join(LEAVE_TYPES)}")
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Check for overlapping requests
    existing = await db.leave_requests.find_one({
        "staff_id": staff["id"],
        "restaurant_id": current_user.restaurant_id,
        "status": {"$in": ["pending", "approved"]},
        "$or": [
            {"start_date": {"$lte": data.end_date}, "end_date": {"$gte": data.start_date}},
        ]
    })
    if existing:
        raise HTTPException(status_code=400, detail="You already have a leave request overlapping these dates")

    # Count days
    from datetime import timedelta
    start = datetime.strptime(data.start_date, "%Y-%m-%d")
    end = datetime.strptime(data.end_date, "%Y-%m-%d")
    days = (end - start).days + 1

    now = datetime.now(timezone.utc)
    leave_doc = {
        "id": f"leave_{now.timestamp()}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": staff["id"],
        "staff_name": current_user.username,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "days": days,
        "leave_type": data.leave_type,
        "note": data.note or "",
        "status": "pending",
        "created_at": now.isoformat(),
    }
    await db.leave_requests.insert_one(leave_doc)

    # Notify admins
    admins = await db.users.find(
        {"restaurant_id": current_user.restaurant_id, "role": "admin"},
        {"_id": 0, "id": 1}
    ).to_list(20)
    for admin in admins:
        await db.notifications.insert_one({
            "id": f"notif_{now.timestamp()}_{admin['id']}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": admin["id"],
            "type": "leave_request",
            "ref_id": leave_doc["id"],
            "title": "Time Off Request",
            "message": f"{current_user.username} requests {data.leave_type} leave: {data.start_date} to {data.end_date} ({days} day{'s' if days > 1 else ''}).",
            "read": False,
            "created_at": now.isoformat(),
        })

    return {"message": f"Leave request submitted ({days} days). Pending manager approval.", "id": leave_doc["id"]}


@router.get("/leave-requests")
async def get_leave_requests(current_user: User = Depends(get_current_user)):
    """Staff see their own, admin sees all."""
    query = {"restaurant_id": current_user.restaurant_id}
    if current_user.role != "admin":
        staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
        query["staff_id"] = staff["id"] if staff else "none"

    return await db.leave_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.get("/leave-requests/pending")
async def get_pending_leave_requests(current_user: User = Depends(require_admin)):
    """Manager gets all pending leave requests."""
    return await db.leave_requests.find(
        {"restaurant_id": current_user.restaurant_id, "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)


@router.put("/leave-requests/{request_id}/approve")
async def approve_leave(request_id: str, current_user: User = Depends(require_admin)):
    """Manager approves leave request. Creates Hard Block on scheduler."""
    req = await db.leave_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")

    now = datetime.now(timezone.utc)
    await db.leave_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "approved", "approved_by": current_user.username, "approved_at": now.isoformat()}}
    )

    # Notify staff
    await db.notifications.insert_one({
        "id": f"notif_{now.timestamp()}_{req['staff_id']}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": req["staff_id"],
        "type": "leave_approved",
        "ref_id": request_id,
        "title": "Leave Approved",
        "message": f"Your {req['leave_type']} leave from {req['start_date']} to {req['end_date']} has been approved.",
        "read": False,
        "created_at": now.isoformat(),
    })

    return {"message": "Leave approved"}


@router.put("/leave-requests/{request_id}/decline")
async def decline_leave(request_id: str, current_user: User = Depends(require_admin)):
    """Manager declines leave request."""
    req = await db.leave_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")

    now = datetime.now(timezone.utc)
    await db.leave_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "declined", "declined_by": current_user.username, "declined_at": now.isoformat()}}
    )

    await db.notifications.insert_one({
        "id": f"notif_{now.timestamp()}_{req['staff_id']}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": req["staff_id"],
        "type": "leave_declined",
        "ref_id": request_id,
        "title": "Leave Declined",
        "message": f"Your {req['leave_type']} leave from {req['start_date']} to {req['end_date']} was declined.",
        "read": False,
        "created_at": now.isoformat(),
    })

    return {"message": "Leave declined"}


@router.delete("/leave-requests/{request_id}")
async def cancel_leave(request_id: str, current_user: User = Depends(get_current_user)):
    """Staff cancels their own pending request."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    req = await db.leave_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if req["staff_id"] != staff["id"] and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your request")
    if req["status"] not in ["pending"]:
        raise HTTPException(status_code=400, detail="Can only cancel pending requests")

    await db.leave_requests.delete_one({"id": request_id})
    return {"message": "Leave request cancelled"}


# ── Recurring Availability ──

@router.get("/availability/my")
async def get_my_availability(current_user: User = Depends(get_current_user)):
    """Get current user's recurring availability rules."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        return {"rules": []}
    doc = await db.availability.find_one(
        {"staff_id": staff["id"], "restaurant_id": current_user.restaurant_id},
        {"_id": 0}
    )
    return {"rules": doc.get("rules", []) if doc else []}


@router.put("/availability/my")
async def update_my_availability(data: AvailabilityUpdate, current_user: User = Depends(get_current_user)):
    """Staff sets their recurring unavailability."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    rules = [r.dict() for r in data.rules]
    now = datetime.now(timezone.utc)

    await db.availability.update_one(
        {"staff_id": staff["id"], "restaurant_id": current_user.restaurant_id},
        {"$set": {"rules": rules, "updated_at": now.isoformat()}, "$setOnInsert": {"staff_id": staff["id"], "restaurant_id": current_user.restaurant_id, "created_at": now.isoformat()}},
        upsert=True,
    )
    return {"message": f"Availability updated ({len(rules)} rules)"}


# ── Scheduler Overlay: Leave + Availability for a week ──

@router.get("/scheduler/blocks")
async def get_scheduler_blocks(start_date: str, end_date: str, current_user: User = Depends(get_current_user)):
    """Returns leave blocks and availability blocks for the scheduler grid overlay.
    Used by the Shift Scheduler to grey out / warn on cells."""

    # Approved leave in this range
    leaves = await db.leave_requests.find(
        {
            "restaurant_id": current_user.restaurant_id,
            "status": "approved",
            "$or": [
                {"start_date": {"$lte": end_date}, "end_date": {"$gte": start_date}},
            ]
        },
        {"_id": 0}
    ).to_list(500)

    # Pending leave in this range
    pending_leaves = await db.leave_requests.find(
        {
            "restaurant_id": current_user.restaurant_id,
            "status": "pending",
            "$or": [
                {"start_date": {"$lte": end_date}, "end_date": {"$gte": start_date}},
            ]
        },
        {"_id": 0}
    ).to_list(500)

    # Recurring availability for all staff
    all_availability = await db.availability.find(
        {"restaurant_id": current_user.restaurant_id},
        {"_id": 0}
    ).to_list(200)

    # Build block map: { staff_id: { date: { type, leave_type } } }
    from datetime import timedelta
    blocks = {}

    for leave in leaves:
        sid = leave["staff_id"]
        if sid not in blocks:
            blocks[sid] = {}
        d = datetime.strptime(leave["start_date"], "%Y-%m-%d")
        end = datetime.strptime(leave["end_date"], "%Y-%m-%d")
        while d <= end:
            ds = d.strftime("%Y-%m-%d")
            if start_date <= ds <= end_date:
                blocks[sid][ds] = {"block_type": "hard", "reason": leave["leave_type"], "leave_id": leave["id"]}
            d += timedelta(days=1)

    for leave in pending_leaves:
        sid = leave["staff_id"]
        if sid not in blocks:
            blocks[sid] = {}
        d = datetime.strptime(leave["start_date"], "%Y-%m-%d")
        end = datetime.strptime(leave["end_date"], "%Y-%m-%d")
        while d <= end:
            ds = d.strftime("%Y-%m-%d")
            if start_date <= ds <= end_date:
                if ds not in blocks[sid]:
                    blocks[sid][ds] = {"block_type": "pending_leave", "reason": leave["leave_type"], "leave_id": leave["id"]}
            d += timedelta(days=1)

    # Expand recurring availability into dates
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    for avail in all_availability:
        sid = avail["staff_id"]
        if sid not in blocks:
            blocks[sid] = {}
        for rule in avail.get("rules", []):
            dow = rule["day_of_week"]
            d = start_dt
            while d <= end_dt:
                if d.weekday() == (dow - 1) % 7 if dow > 0 else 6:  # Convert to Python weekday
                    ds = d.strftime("%Y-%m-%d")
                    if ds not in blocks.get(sid, {}):
                        blocks[sid][ds] = {
                            "block_type": "soft",
                            "reason": rule.get("reason", "Unavailable"),
                            "from": rule.get("unavailable_from"),
                            "to": rule.get("unavailable_to"),
                        }
                d += timedelta(days=1)

    return blocks
