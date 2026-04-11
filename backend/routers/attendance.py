from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import verify_password, get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class ClockRequest(BaseModel):
    pin: str
    restaurant_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    entry_source: Optional[str] = "mobile_app"  # "mobile_app" or "pos_terminal"


import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two GPS coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


GEOFENCE_RADIUS_METERS = 10


@router.post("/attendance/clock")
async def clock_in_out(data: ClockRequest):
    """Staff clocks in or out using their PIN. Auto-detects current state."""
    if not data.pin or len(data.pin) != 4 or not data.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")

    # Check workforce feature and get restaurant data
    restaurant = await db.restaurants.find_one({"id": data.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    features = restaurant.get("features")
    if features is not None and not features.get("workforce", False):
        raise HTTPException(status_code=403, detail="Workforce module not enabled for this restaurant")

    # Geofence enforcement: skip for pos_terminal, enforce for mobile_app
    biz = restaurant.get("business_info", {})
    biz_lat = biz.get("latitude")
    biz_lng = biz.get("longitude")
    if data.entry_source != "pos_terminal" and biz_lat is not None and biz_lng is not None:
        if data.latitude is None or data.longitude is None:
            raise HTTPException(status_code=400, detail="Location required for clock in/out. Please enable GPS.")
        distance = haversine_distance(biz_lat, biz_lng, data.latitude, data.longitude)
        if distance > GEOFENCE_RADIUS_METERS:
            raise HTTPException(status_code=403, detail=f"You are {int(distance)}m away. Clock in/out is only allowed within {GEOFENCE_RADIUS_METERS}m.")

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
                "clock_out_lat": data.latitude,
                "clock_out_lng": data.longitude,
            }}
        )
        return {
            "action": "clock_out",
            "staff_name": matched_user.get("username"),
            "staff_id": staff_id,
            "clock_out": now.isoformat(),
            "hours_worked": round(hours_worked, 2),
            "entry_source": data.entry_source,
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
            "entry_source": data.entry_source,
            "clock_in_lat": data.latitude,
            "clock_in_lng": data.longitude,
            "created_at": now.isoformat(),
        }
        await db.attendance.insert_one(record)
        return {
            "action": "clock_in",
            "staff_name": matched_user.get("username"),
            "staff_id": staff_id,
            "clock_in": now.isoformat(),
            "entry_source": data.entry_source,
            "message": "Clocked in. Have a great shift!",
        }


@router.get("/attendance")
async def get_attendance(start_date: str, end_date: str, current_user: User = Depends(require_feature("workforce"))):
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
async def get_my_clock_status(current_user: User = Depends(require_feature("workforce"))):
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


@router.get("/attendance/dashboard-stats")
async def workforce_dashboard_stats(current_user: User = Depends(require_feature("workforce"))):
    """Dashboard summary: today's shifts, clocked-in staff, total hours."""
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    # Today's scheduled shifts
    shifts_today = await db.shifts.find(
        {"restaurant_id": current_user.restaurant_id, "date": today_str},
        {"_id": 0}
    ).to_list(200)

    # Currently clocked in
    clocked_in = await db.attendance.find(
        {"restaurant_id": current_user.restaurant_id, "clock_out": None},
        {"_id": 0}
    ).to_list(100)

    # Today's completed attendance (hours worked)
    completed_today = await db.attendance.find(
        {"restaurant_id": current_user.restaurant_id, "date": today_str, "clock_out": {"$ne": None}},
        {"_id": 0}
    ).to_list(200)
    total_hours = sum(r.get("hours_worked", 0) or 0 for r in completed_today)

    # Staff count
    staff_count = await db.users.count_documents(
        {"restaurant_id": current_user.restaurant_id, "role": {"$in": ["user", "admin"]}}
    )

    return {
        "scheduled_shifts": len(shifts_today),
        "clocked_in_count": len(clocked_in),
        "clocked_in_staff": [{"name": r.get("staff_name", ""), "since": r.get("clock_in")} for r in clocked_in],
        "completed_sessions": len(completed_today),
        "total_hours_today": round(total_hours, 1),
        "total_staff": staff_count,
        "shifts": [{"staff_name": s.get("staff_name", ""), "start_time": s.get("start_time"), "end_time": s.get("end_time"), "position": s.get("position", "")} for s in shifts_today],
    }


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
