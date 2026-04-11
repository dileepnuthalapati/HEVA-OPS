from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import verify_password, get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional

router = APIRouter(dependencies=[Depends(require_feature("workforce"))])


class ClockRequest(BaseModel):
    pin: str
    restaurant_id: str


@router.post("/attendance/clock")
async def clock_in_out(data: ClockRequest):
    """Staff clocks in or out using their PIN. Auto-detects current state."""
    if not data.pin or len(data.pin) != 4 or not data.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be 4 digits")

    users = await db.users.find(
        {"restaurant_id": data.restaurant_id, "pos_pin_hash": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(100)

    matched_user = None
    for u in users:
        if verify_password(data.pin, u["pos_pin_hash"]):
            matched_user = u
            break

    if not matched_user:
        raise HTTPException(status_code=401, detail="Invalid PIN")

    staff_id = matched_user["id"]
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    # Check for open attendance record (clocked in but not out)
    open_record = await db.attendance.find_one(
        {"staff_id": staff_id, "restaurant_id": data.restaurant_id, "clock_out": None},
        {"_id": 0}
    )

    # Ghost shift detection: open record from before today
    if open_record and open_record.get("date") != today_str:
        await db.attendance.update_one(
            {"id": open_record["id"]},
            {"$set": {
                "clock_out": open_record["clock_in"][:10] + "T23:59:59+00:00",
                "flagged": True,
                "flag_reason": "Auto-closed: forgot to clock out",
            }}
        )
        open_record = None

    if open_record:
        # Clock OUT
        hours_worked = (now - datetime.fromisoformat(open_record["clock_in"])).total_seconds() / 3600
        await db.attendance.update_one(
            {"id": open_record["id"]},
            {"$set": {
                "clock_out": now.isoformat(),
                "hours_worked": round(hours_worked, 2),
            }}
        )
        return {
            "action": "clock_out",
            "staff_name": matched_user.get("username"),
            "staff_id": staff_id,
            "clock_out": now.isoformat(),
            "hours_worked": round(hours_worked, 2),
            "message": f"Clocked out. Worked {hours_worked:.1f} hours today.",
        }
    else:
        # Clock IN
        record = {
            "id": f"att_{now.timestamp()}",
            "restaurant_id": data.restaurant_id,
            "staff_id": staff_id,
            "staff_name": matched_user.get("username", ""),
            "date": today_str,
            "clock_in": now.isoformat(),
            "clock_out": None,
            "hours_worked": None,
            "flagged": False,
            "flag_reason": None,
            "approved": False,
            "created_at": now.isoformat(),
        }
        await db.attendance.insert_one(record)
        return {
            "action": "clock_in",
            "staff_name": matched_user.get("username"),
            "staff_id": staff_id,
            "clock_in": now.isoformat(),
            "message": "Clocked in. Have a great shift!",
        }


@router.get("/attendance")
async def get_attendance(start_date: str, end_date: str, current_user: User = Depends(get_current_user)):
    """Get attendance records. Managers see all, staff see only their own."""
    query = {
        "restaurant_id": current_user.restaurant_id,
        "date": {"$gte": start_date, "$lte": end_date},
    }
    if current_user.role == "user":
        staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
        if staff:
            query["staff_id"] = staff["id"]
    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return records


@router.get("/attendance/live")
async def get_live_attendance(current_user: User = Depends(require_admin)):
    """Get who is currently clocked in (admin only)."""
    records = await db.attendance.find(
        {"restaurant_id": current_user.restaurant_id, "clock_out": None},
        {"_id": 0}
    ).to_list(100)
    return records


@router.get("/attendance/my-status")
async def get_my_clock_status(current_user: User = Depends(get_current_user)):
    """Get current user's clock-in status."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        return {"clocked_in": False}
    record = await db.attendance.find_one(
        {"staff_id": staff["id"], "restaurant_id": current_user.restaurant_id, "clock_out": None},
        {"_id": 0}
    )
    if record:
        return {"clocked_in": True, "clock_in": record["clock_in"], "staff_name": record.get("staff_name")}
    return {"clocked_in": False}


@router.put("/attendance/{record_id}/flag-resolve")
async def resolve_flagged(record_id: str, hours_worked: float, current_user: User = Depends(require_admin)):
    """Manager resolves a flagged attendance record by setting correct hours."""
    record = await db.attendance.find_one({"id": record_id, "restaurant_id": current_user.restaurant_id})
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.attendance.update_one(
        {"id": record_id},
        {"$set": {"hours_worked": hours_worked, "flagged": False, "flag_reason": None, "resolved_by": current_user.username}}
    )
    return {"message": "Flagged record resolved"}
