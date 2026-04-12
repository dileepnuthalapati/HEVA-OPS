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
