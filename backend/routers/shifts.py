from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(dependencies=[Depends(require_feature("workforce"))])


class ShiftCreate(BaseModel):
    staff_id: str
    staff_name: Optional[str] = None
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    position: Optional[str] = None
    note: Optional[str] = None


class ShiftUpdate(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    position: Optional[str] = None
    note: Optional[str] = None


@router.get("/shifts")
async def get_shifts(start_date: str, end_date: str, current_user: User = Depends(get_current_user)):
    """Get shifts for date range. Managers see all, staff see only their own."""
    query = {
        "restaurant_id": current_user.restaurant_id,
        "date": {"$gte": start_date, "$lte": end_date},
    }
    if current_user.role == "user":
        staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
        if staff:
            query["staff_id"] = staff["id"]
    shifts = await db.shifts.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return shifts


@router.post("/shifts")
async def create_shift(shift: ShiftCreate, current_user: User = Depends(require_admin)):
    """Create a new shift assignment."""
    staff = await db.users.find_one({"id": shift.staff_id, "restaurant_id": current_user.restaurant_id}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    shift_doc = {
        "id": f"shift_{datetime.now(timezone.utc).timestamp()}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": shift.staff_id,
        "staff_name": staff.get("username", shift.staff_name or ""),
        "date": shift.date,
        "start_time": shift.start_time,
        "end_time": shift.end_time,
        "position": shift.position or staff.get("position", ""),
        "note": shift.note or "",
        "published": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.username,
    }
    await db.shifts.insert_one(shift_doc)
    shift_doc.pop("_id", None)
    return shift_doc


@router.put("/shifts/{shift_id}")
async def update_shift(shift_id: str, data: ShiftUpdate, current_user: User = Depends(require_admin)):
    shift = await db.shifts.find_one({"id": shift_id, "restaurant_id": current_user.restaurant_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    update = {}
    if data.start_time is not None:
        update["start_time"] = data.start_time
    if data.end_time is not None:
        update["end_time"] = data.end_time
    if data.position is not None:
        update["position"] = data.position
    if data.note is not None:
        update["note"] = data.note
    if update:
        await db.shifts.update_one({"id": shift_id}, {"$set": update})
    return {"message": "Shift updated"}


@router.delete("/shifts/clear-week-off")
async def clear_week_off(staff_id: str, week_start_date: str, current_user: User = Depends(require_admin)):
    """Undo a 'week off' marking for a staff. Removes the bulk-week-off leave record."""
    try:
        start_dt = datetime.strptime(week_start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid week_start_date format. Use YYYY-MM-DD.")
    end_str = (start_dt + timedelta(days=6)).strftime("%Y-%m-%d")

    result = await db.leave_requests.delete_many({
        "restaurant_id": current_user.restaurant_id,
        "staff_id": staff_id,
        "bulk_week_off": True,
        "start_date": week_start_date,
        "end_date": end_str,
    })
    return {"message": f"Cleared week off ({result.deleted_count} leave record(s) removed)"}


@router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, current_user: User = Depends(require_admin)):
    shift = await db.shifts.find_one({"id": shift_id, "restaurant_id": current_user.restaurant_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    await db.shifts.delete_one({"id": shift_id})
    return {"message": "Shift deleted"}


@router.post("/shifts/copy-week")
async def copy_week(source_start: str, target_start: str, current_user: User = Depends(require_admin)):
    """Copy all shifts from one week to another."""
    source_end = (datetime.strptime(source_start, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
    source_shifts = await db.shifts.find({
        "restaurant_id": current_user.restaurant_id,
        "date": {"$gte": source_start, "$lte": source_end},
    }, {"_id": 0}).to_list(500)

    if not source_shifts:
        raise HTTPException(status_code=404, detail="No shifts found in source week")

    source_date = datetime.strptime(source_start, "%Y-%m-%d")
    target_date = datetime.strptime(target_start, "%Y-%m-%d")
    target_end = (target_date + timedelta(days=6)).strftime("%Y-%m-%d")
    day_offset = (target_date - source_date).days

    # Clear existing shifts in target week to prevent duplicates
    await db.shifts.delete_many({
        "restaurant_id": current_user.restaurant_id,
        "date": {"$gte": target_start, "$lte": target_end},
    })

    created = 0

    for s in source_shifts:
        old_date = datetime.strptime(s["date"], "%Y-%m-%d")
        new_date = (old_date + timedelta(days=day_offset)).strftime("%Y-%m-%d")
        new_shift = {
            "id": f"shift_{datetime.now(timezone.utc).timestamp()}_{created}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": s["staff_id"],
            "staff_name": s.get("staff_name", ""),
            "date": new_date,
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "position": s.get("position", ""),
            "note": "",
            "published": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.username,
        }
        await db.shifts.insert_one(new_shift)
        created += 1

    return {"message": f"Copied {created} shifts to week of {target_start}"}


@router.post("/shifts/publish")
async def publish_shifts(start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    """Publish shifts for a week — makes them visible to staff."""
    result = await db.shifts.update_many(
        {"restaurant_id": current_user.restaurant_id, "date": {"$gte": start_date, "$lte": end_date}},
        {"$set": {"published": True}},
    )
    return {"message": f"Published {result.modified_count} shifts"}


class MarkWeekOffRequest(BaseModel):
    staff_id: str
    week_start_date: str  # YYYY-MM-DD (inclusive start of 7-day span)
    reason: Optional[str] = "personal"  # vacation | sick | personal | public_holiday
    note: Optional[str] = None


@router.post("/shifts/mark-week-off")
async def mark_week_off(data: MarkWeekOffRequest, current_user: User = Depends(require_admin)):
    """Manager marks a staff as off for the entire week.
    - Deletes any existing shifts for that staff in the given week.
    - Creates an auto-approved leave entry so the scheduler shows a hard block.
    """
    staff = await db.users.find_one(
        {"id": data.staff_id, "restaurant_id": current_user.restaurant_id},
        {"_id": 0, "id": 1, "username": 1}
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    try:
        start_dt = datetime.strptime(data.week_start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid week_start_date format. Use YYYY-MM-DD.")
    end_dt = start_dt + timedelta(days=6)
    start_str = start_dt.strftime("%Y-%m-%d")
    end_str = end_dt.strftime("%Y-%m-%d")

    # Remove any existing shifts for this staff in the week
    shift_result = await db.shifts.delete_many({
        "restaurant_id": current_user.restaurant_id,
        "staff_id": data.staff_id,
        "date": {"$gte": start_str, "$lte": end_str},
    })

    # Remove any conflicting existing leave for this staff overlapping this week
    await db.leave_requests.delete_many({
        "restaurant_id": current_user.restaurant_id,
        "staff_id": data.staff_id,
        "status": {"$in": ["pending", "approved"]},
        "start_date": {"$lte": end_str},
        "end_date": {"$gte": start_str},
    })

    now = datetime.now(timezone.utc)
    leave_doc = {
        "id": f"leave_{now.timestamp()}_{data.staff_id}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": data.staff_id,
        "staff_name": staff.get("username", ""),
        "start_date": start_str,
        "end_date": end_str,
        "days": 7,
        "leave_type": data.reason or "personal",
        "note": data.note or f"Week off marked by {current_user.username}",
        "status": "approved",
        "bulk_week_off": True,
        "approved_by": current_user.username,
        "approved_at": now.isoformat(),
        "created_at": now.isoformat(),
    }
    await db.leave_requests.insert_one(leave_doc)

    # Notify the staff
    await db.notifications.insert_one({
        "id": f"notif_{now.timestamp()}_{data.staff_id}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": data.staff_id,
        "type": "week_off_assigned",
        "ref_id": leave_doc["id"],
        "title": "Week Off",
        "message": f"You have been marked off for the week of {start_str} to {end_str}.",
        "read": False,
        "created_at": now.isoformat(),
    })

    return {
        "message": f"{staff['username']} marked off for {start_str} → {end_str}. Removed {shift_result.deleted_count} shift(s).",
        "shifts_removed": shift_result.deleted_count,
        "leave_id": leave_doc["id"],
    }
