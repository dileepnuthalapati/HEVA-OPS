from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Header
from fastapi.responses import Response
from database import db
from dependencies import verify_password, get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional
import math
import logging
import base64
from io import BytesIO

logger = logging.getLogger("attendance")

router = APIRouter()


class ClockRequest(BaseModel):
    pin: str
    restaurant_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    entry_source: Optional[str] = "mobile_app"


class ClockMeRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    biometric_verified: Optional[bool] = False


class ResolveGhostRequest(BaseModel):
    record_id: str
    claimed_clock_out: str  # ISO datetime string the staff claims they finished


class ApproveAdjustmentRequest(BaseModel):
    approved_clock_out: Optional[str] = None  # Manager can override the time
    approved_hours: Optional[float] = None


# ── Constants ──

DEFAULT_GEOFENCE_RADIUS = 50  # Default 50m — configurable per restaurant
MAX_SHIFT_HOURS = 14  # Smart buffer: auto-flag after 14 hours


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two GPS coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def _check_geofence(entry_source, biz_info, latitude, longitude):
    """Raises HTTPException if geofence violated. Skips for pos_terminal."""
    if entry_source == "pos_terminal":
        return
    biz_lat = biz_info.get("latitude")
    biz_lng = biz_info.get("longitude")
    if biz_lat is None or biz_lng is None:
        return
    if latitude is None or longitude is None:
        raise HTTPException(status_code=400, detail="Location required for clock in/out. Please enable GPS.")
    radius = biz_info.get("geofence_radius", DEFAULT_GEOFENCE_RADIUS)
    distance = haversine_distance(biz_lat, biz_lng, latitude, longitude)
    if distance > radius:
        raise HTTPException(status_code=403, detail=f"You are {int(distance)}m away. Clock in/out is only allowed within {radius}m.")


def _detect_ghost_shift(open_record):
    """Returns ghost shift info if the open record has exceeded MAX_SHIFT_HOURS. None otherwise."""
    if not open_record:
        return None
    clock_in = datetime.fromisoformat(open_record["clock_in"])
    now = datetime.now(timezone.utc)
    elapsed_hours = (now - clock_in).total_seconds() / 3600
    if elapsed_hours > MAX_SHIFT_HOURS:
        return {
            "record_id": open_record["id"],
            "clock_in": open_record["clock_in"],
            "date": open_record.get("date"),
            "staff_name": open_record.get("staff_name", ""),
            "elapsed_hours": round(elapsed_hours, 1),
        }
    return None


# ── PIN-based clock (Terminal/Kiosk mode) ──

@router.post("/attendance/clock")
async def clock_in_out(data: ClockRequest):
    """Staff clocks in or out using their PIN. Auto-detects current state."""
    if not data.pin or len(data.pin) != 4 or not data.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")

    restaurant = await db.restaurants.find_one({"id": data.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    features = restaurant.get("features")
    if features is not None and not features.get("workforce", False):
        raise HTTPException(status_code=403, detail="Workforce module not enabled for this restaurant")

    _check_geofence(data.entry_source, restaurant.get("business_info", {}), data.latitude, data.longitude)

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

    open_record = await db.attendance.find_one(
        {"staff_id": staff_id, "restaurant_id": data.restaurant_id, "clock_out": None, "is_operational": {"$ne": False}},
        {"_id": 0}
    )

    # Ghost shift detection — 14-hour smart buffer
    ghost = _detect_ghost_shift(open_record)
    if ghost:
        # On terminal, we can't show a correction UI, so auto-flag it
        auto_close_time = (datetime.fromisoformat(open_record["clock_in"]) + timedelta(hours=MAX_SHIFT_HOURS)).isoformat()
        await db.attendance.update_one(
            {"id": open_record["id"]},
            {"$set": {
                "clock_out": auto_close_time,
                "hours_worked": MAX_SHIFT_HOURS,
                "auto_close_time": auto_close_time,
                "flagged": True,
                "flag_reason": "ghost_shift_auto_closed",
                "needs_staff_correction": True,
            }}
        )
        open_record = None

    if open_record:
        # Normal Clock OUT
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
            "record_id": open_record["id"],
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
            "date": now.strftime("%Y-%m-%d"),
            "clock_in": now.isoformat(),
            "clock_out": None,
            "hours_worked": None,
            "flagged": False,
            "flag_reason": None,
            "approved": False,
            "entry_source": data.entry_source,
            "clock_in_lat": data.latitude,
            "clock_in_lng": data.longitude,
            "record_type": "shift",
            "is_operational": True,
            "created_at": now.isoformat(),
        }
        await db.attendance.insert_one(record)
        return {
            "action": "clock_in",
            "staff_name": matched_user.get("username"),
            "staff_id": staff_id,
            "record_id": record["id"],
            "clock_in": now.isoformat(),
            "entry_source": data.entry_source,
            "message": "Clocked in. Have a great shift!",
        }


# ── JWT-based clock (Personal device mode) ──

@router.post("/attendance/clock-me")
async def clock_me(data: ClockMeRequest, current_user: User = Depends(require_feature("workforce"))):
    """Authenticated clock in/out — no PIN needed (personal device only).
    If a ghost shift is detected (>14h open), returns ghost_shift_pending instead of clocking in."""
    staff = await db.users.find_one(
        {"username": current_user.username, "restaurant_id": current_user.restaurant_id},
        {"_id": 0}
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff record not found")

    staff_id = staff.get("id")
    latitude = data.latitude
    longitude = data.longitude

    # Geofence
    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if restaurant:
        _check_geofence("mobile_app", restaurant.get("business_info", {}), latitude, longitude)

    # Biometric check
    security = restaurant.get("security_settings", {}) if restaurant else {}
    if security.get("biometric_required") and not data.biometric_verified:
        raise HTTPException(status_code=403, detail="Biometric verification required for clock-in/out. Please use FaceID or fingerprint.")

    now = datetime.now(timezone.utc)

    open_record = await db.attendance.find_one(
        {"staff_id": staff_id, "restaurant_id": current_user.restaurant_id, "clock_out": None, "is_operational": {"$ne": False}},
        {"_id": 0}
    )

    # Ghost shift detection — BLOCKER: staff must resolve before new clock-in
    ghost = _detect_ghost_shift(open_record)
    if ghost:
        return {
            "action": "ghost_shift_pending",
            "ghost_shift": ghost,
            "message": "You have an unresolved shift. Please provide your finish time before clocking in.",
        }

    if open_record:
        # Normal Clock OUT
        hours_worked = (now - datetime.fromisoformat(open_record["clock_in"])).total_seconds() / 3600
        await db.attendance.update_one(
            {"id": open_record["id"]},
            {"$set": {
                "clock_out": now.isoformat(),
                "hours_worked": round(hours_worked, 2),
                "clock_out_lat": latitude,
                "clock_out_lng": longitude,
            }}
        )
        return {
            "action": "clock_out",
            "staff_name": staff.get("username"),
            "staff_id": staff_id,
            "clock_out": now.isoformat(),
            "hours_worked": round(hours_worked, 2),
            "entry_source": "mobile_app",
            "message": f"Clocked out. Worked {hours_worked:.1f} hours today.",
        }
    else:
        # Clock IN
        record = {
            "id": f"att_{now.timestamp()}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": staff_id,
            "staff_name": staff.get("username", ""),
            "date": now.strftime("%Y-%m-%d"),
            "clock_in": now.isoformat(),
            "clock_out": None,
            "hours_worked": None,
            "flagged": False,
            "flag_reason": None,
            "approved": False,
            "entry_source": "mobile_app",
            "clock_in_lat": latitude,
            "clock_in_lng": longitude,
            "biometric_verified": data.biometric_verified or False,
            "record_type": "shift",
            "is_operational": True,
            "created_at": now.isoformat(),
        }
        await db.attendance.insert_one(record)
        return {
            "action": "clock_in",
            "staff_name": staff.get("username"),
            "staff_id": staff_id,
            "clock_in": now.isoformat(),
            "entry_source": "mobile_app",
            "message": "Clocked in. Have a great shift!",
        }


# ── Staff Self-Correction: Resolve Ghost Shift ──

@router.post("/attendance/resolve-ghost")
async def resolve_ghost_shift(data: ResolveGhostRequest, current_user: User = Depends(require_feature("workforce"))):
    """Staff provides their claimed finish time for a ghost shift. Blocks new clock-in until resolved."""
    staff = await db.users.find_one(
        {"username": current_user.username, "restaurant_id": current_user.restaurant_id},
        {"_id": 0, "id": 1}
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff record not found")

    record = await db.attendance.find_one(
        {"id": data.record_id, "staff_id": staff["id"], "restaurant_id": current_user.restaurant_id},
        {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    # Parse claimed time
    try:
        claimed_out = datetime.fromisoformat(data.claimed_clock_out)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format. Use ISO format.")

    clock_in = datetime.fromisoformat(record["clock_in"])

    # Sanity checks
    if claimed_out <= clock_in:
        raise HTTPException(status_code=400, detail="Finish time must be after clock-in time.")
    claimed_hours = (claimed_out - clock_in).total_seconds() / 3600
    if claimed_hours > MAX_SHIFT_HOURS:
        raise HTTPException(status_code=400, detail=f"Claimed shift exceeds {MAX_SHIFT_HOURS} hours. Please check the time.")

    # Auto-close time = 14h after start (for audit trail)
    auto_close_time = (clock_in + timedelta(hours=MAX_SHIFT_HOURS)).isoformat()

    await db.attendance.update_one(
        {"id": data.record_id},
        {"$set": {
            "clock_out": data.claimed_clock_out,
            "hours_worked": round(claimed_hours, 2),
            "auto_close_time": auto_close_time,
            "staff_claimed_time": data.claimed_clock_out,
            "manager_approved_time": None,
            "flagged": True,
            "flag_reason": "manual_staff_correction",
            "needs_staff_correction": False,
            "pending_manager_approval": True,
            "corrected_by": current_user.username,
            "corrected_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {
        "message": f"Shift resolved. You claimed {claimed_hours:.1f} hours. Pending manager approval.",
        "hours_claimed": round(claimed_hours, 2),
    }


# ── My Status (enhanced with ghost shift detection) ──

@router.get("/attendance/my-status")
async def get_my_clock_status(current_user: User = Depends(require_feature("workforce"))):
    """Get current user's clock-in status, including ghost shift detection."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        return {"clocked_in": False}

    open_record = await db.attendance.find_one(
        {"staff_id": staff["id"], "restaurant_id": current_user.restaurant_id, "clock_out": None, "is_operational": {"$ne": False}},
        {"_id": 0}
    )
    if not open_record:
        return {"clocked_in": False}

    # Check if it's a ghost shift
    ghost = _detect_ghost_shift(open_record)
    if ghost:
        return {
            "clocked_in": False,
            "ghost_shift_pending": True,
            "ghost_shift": ghost,
        }

    return {"clocked_in": True, "clock_in": open_record["clock_in"], "staff_name": open_record.get("staff_name")}


# ── Manager: Pending Adjustments ──

@router.get("/attendance/pending-adjustments")
async def get_pending_adjustments(current_user: User = Depends(require_admin)):
    """Manager sees all staff-corrected shifts awaiting approval."""
    records = await db.attendance.find(
        {
            "restaurant_id": current_user.restaurant_id,
            "pending_manager_approval": True,
        },
        {"_id": 0}
    ).sort("corrected_at", -1).to_list(100)
    return records


@router.put("/attendance/{record_id}/approve-adjustment")
async def approve_adjustment(record_id: str, data: ApproveAdjustmentRequest, current_user: User = Depends(require_admin)):
    """Manager approves or edits a staff's claimed clock-out time."""
    record = await db.attendance.find_one(
        {"id": record_id, "restaurant_id": current_user.restaurant_id},
        {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    # Determine final approved time
    if data.approved_clock_out:
        try:
            approved_out = datetime.fromisoformat(data.approved_clock_out)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format.")
        clock_in = datetime.fromisoformat(record["clock_in"])
        approved_hours = round((approved_out - clock_in).total_seconds() / 3600, 2)
        final_clock_out = data.approved_clock_out
    elif data.approved_hours is not None:
        clock_in = datetime.fromisoformat(record["clock_in"])
        approved_out = clock_in + timedelta(hours=data.approved_hours)
        approved_hours = data.approved_hours
        final_clock_out = approved_out.isoformat()
    else:
        # Manager approves the staff's claimed time as-is
        final_clock_out = record.get("staff_claimed_time") or record.get("clock_out")
        clock_in = datetime.fromisoformat(record["clock_in"])
        approved_hours = round((datetime.fromisoformat(final_clock_out) - clock_in).total_seconds() / 3600, 2)

    await db.attendance.update_one(
        {"id": record_id},
        {"$set": {
            "clock_out": final_clock_out,
            "hours_worked": approved_hours,
            "manager_approved_time": final_clock_out,
            "flagged": False,
            "flag_reason": None,
            "pending_manager_approval": False,
            "approved": True,
            "approved_by": current_user.username,
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {
        "message": f"Shift approved: {approved_hours:.1f} hours.",
        "hours_approved": approved_hours,
    }


# ── Standard Endpoints ──

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
        {"restaurant_id": current_user.restaurant_id, "clock_out": None, "is_operational": {"$ne": False}},
        {"_id": 0}
    ).to_list(100)
    return records


@router.get("/attendance/my-summary")
async def get_my_hours_summary(week_offset: int = 0, current_user: User = Depends(require_feature("workforce"))):
    """Get current user's hours and pay summary. Supports week navigation via week_offset."""
    staff = await db.users.find_one(
        {"username": current_user.username, "restaurant_id": current_user.restaurant_id},
        {"_id": 0, "password_hash": 0, "pos_pin_hash": 0, "manager_pin_hash": 0}
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff record not found")

    staff_id = staff.get("id")
    now = datetime.now(timezone.utc)

    # Get restaurant week start day
    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0, "business_info.week_start_day": 1})
    week_start_day = restaurant.get("business_info", {}).get("week_start_day", 1) if restaurant else 1  # default Monday

    # Calculate week range using restaurant's week_start_day + offset
    current_day = now.weekday()  # 0=Mon
    diff = (current_day - week_start_day + 7) % 7
    week_start_date = now - timedelta(days=diff) + timedelta(weeks=week_offset)
    week_end_date = week_start_date + timedelta(days=6)
    week_start = week_start_date.strftime("%Y-%m-%d")
    week_end = week_end_date.strftime("%Y-%m-%d")

    week_records = await db.attendance.find(
        {"staff_id": staff_id, "restaurant_id": current_user.restaurant_id, "date": {"$gte": week_start, "$lte": week_end}, "clock_out": {"$ne": None}},
        {"_id": 0}
    ).to_list(100)
    week_hours = sum(r.get("hours_worked", 0) or 0 for r in week_records)

    # This month
    month_start = now.strftime("%Y-%m-01")
    month_records = await db.attendance.find(
        {"staff_id": staff_id, "restaurant_id": current_user.restaurant_id, "date": {"$gte": month_start}, "clock_out": {"$ne": None}},
        {"_id": 0}
    ).to_list(500)
    month_hours = sum(r.get("hours_worked", 0) or 0 for r in month_records)

    # Recent records (last 14 days)
    two_weeks_ago = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    recent = await db.attendance.find(
        {"staff_id": staff_id, "restaurant_id": current_user.restaurant_id, "date": {"$gte": two_weeks_ago}},
        {"_id": 0}
    ).sort("date", -1).to_list(100)

    # Weekly breakdown: each day's hours + status
    weekly_breakdown = []
    for i in range(7):
        d = (week_start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        day_records = [r for r in week_records if r.get("date") == d]
        day_hours = sum(r.get("hours_worked", 0) or 0 for r in day_records)
        rejected = any(r.get("rejected") for r in day_records)
        approved = all(r.get("approved") for r in day_records) if day_records else False
        weekly_breakdown.append({
            "date": d,
            "day_name": datetime.strptime(d, "%Y-%m-%d").strftime("%a"),
            "hours": round(day_hours, 1),
            "sessions": len(day_records),
            "approved": approved,
            "rejected": rejected,
            "reject_reason": next((r.get("reject_reason") for r in day_records if r.get("rejected")), None),
            "record_ids": [r["id"] for r in day_records],
        })

    # Check if the whole week is rejected
    week_rejected = any(d["rejected"] for d in weekly_breakdown)
    week_approved = all(d["approved"] for d in weekly_breakdown if d["sessions"] > 0)

    # Pay calculation
    pay_type = staff.get("pay_type", "hourly")
    hourly_rate = staff.get("hourly_rate", 0) or 0
    monthly_salary = staff.get("monthly_salary", 0) or 0

    if pay_type == "monthly":
        week_pay = monthly_salary / 4.33
        month_pay = monthly_salary
    else:
        week_pay = week_hours * hourly_rate
        month_pay = month_hours * hourly_rate

    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0, "currency": 1})
    currency = restaurant.get("currency", "GBP") if restaurant else "GBP"

    return {
        "staff_name": staff.get("username", ""),
        "position": staff.get("position", ""),
        "pay_type": pay_type,
        "hourly_rate": hourly_rate,
        "monthly_salary": monthly_salary,
        "currency": currency,
        "week_start": week_start,
        "week_end": week_end,
        "week_offset": week_offset,
        "week_hours": round(week_hours, 1),
        "month_hours": round(month_hours, 1),
        "week_pay": round(week_pay, 2),
        "month_pay": round(month_pay, 2),
        "week_sessions": len(week_records),
        "month_sessions": len(month_records),
        "week_approved": week_approved,
        "week_rejected": week_rejected,
        "weekly_breakdown": weekly_breakdown,
        "recent_records": recent,
    }


class EmployeeCorrectionRequest(BaseModel):
    record_id: str
    claimed_hours: float
    notes: Optional[str] = None


@router.put("/attendance/my-correction")
async def employee_correction(data: EmployeeCorrectionRequest, current_user: User = Depends(require_feature("workforce"))):
    """Employee corrects their hours after manager rejection."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    record = await db.attendance.find_one(
        {"id": data.record_id, "staff_id": staff["id"]},
        {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.get("approved"):
        raise HTTPException(status_code=400, detail="Record already approved — cannot edit")
    if not record.get("rejected"):
        raise HTTPException(status_code=400, detail="Record was not rejected — no correction needed")

    # Calculate new clock_out based on claimed hours
    clock_in = datetime.fromisoformat(record["clock_in"])
    new_clock_out = clock_in + timedelta(hours=data.claimed_hours)

    await db.attendance.update_one(
        {"id": data.record_id},
        {"$set": {
            "clock_out": new_clock_out.isoformat(),
            "hours_worked": round(data.claimed_hours, 2),
            "rejected": False,
            "employee_corrected": True,
            "correction_notes": data.notes,
            "corrected_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {"message": f"Hours updated to {data.claimed_hours:.1f}h. Awaiting manager approval."}


@router.get("/attendance/dashboard-stats")
async def workforce_dashboard_stats(current_user: User = Depends(require_feature("workforce"))):
    """Dashboard summary: today's shifts, clocked-in staff, total hours, pending adjustments."""
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    shifts_today = await db.shifts.find(
        {"restaurant_id": current_user.restaurant_id, "date": today_str},
        {"_id": 0}
    ).to_list(200)

    clocked_in_raw = await db.attendance.find(
        {"restaurant_id": current_user.restaurant_id, "clock_out": None, "is_operational": {"$ne": False}},
        {"_id": 0}
    ).to_list(100)

    # Filter out records for deleted users
    clocked_in = []
    for record in clocked_in_raw:
        user_exists = await db.users.find_one({"id": record.get("staff_id")}, {"_id": 0, "id": 1})
        if user_exists:
            clocked_in.append(record)

    # Unavailable count (sick leave, dropped shifts today)
    unavailable = await db.attendance.count_documents(
        {"restaurant_id": current_user.restaurant_id, "date": today_str, "is_operational": False}
    )

    completed_today = await db.attendance.find(
        {"restaurant_id": current_user.restaurant_id, "date": today_str, "clock_out": {"$ne": None}},
        {"_id": 0}
    ).to_list(200)
    total_hours = sum(r.get("hours_worked", 0) or 0 for r in completed_today)

    staff_count = await db.users.count_documents(
        {"restaurant_id": current_user.restaurant_id, "role": {"$in": ["user", "admin"]}}
    )

    # Pending adjustments count for managers
    pending_count = 0
    if current_user.role == "admin":
        pending_count = await db.attendance.count_documents(
            {"restaurant_id": current_user.restaurant_id, "pending_manager_approval": True}
        )

    return {
        "scheduled_shifts": len(shifts_today),
        "clocked_in_count": len(clocked_in),
        "clocked_in_staff": [{"name": r.get("staff_name", ""), "since": r.get("clock_in")} for r in clocked_in],
        "unavailable_count": unavailable,
        "completed_sessions": len(completed_today),
        "total_hours_today": round(total_hours, 1),
        "total_staff": staff_count,
        "pending_adjustments_count": pending_count,
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
        {"$set": {
            "hours_worked": hours_worked,
            "flagged": False,
            "flag_reason": None,
            "pending_manager_approval": False,
            "approved": True,
            "resolved_by": current_user.username,
        }}
    )
    return {"message": "Flagged record resolved"}


@router.put("/attendance/{record_id}/reject-adjustment")
async def reject_adjustment(record_id: str, current_user: User = Depends(require_admin)):
    """Manager rejects a staff's claimed clock-out time. Record re-opens for staff to re-submit."""
    record = await db.attendance.find_one({"id": record_id, "restaurant_id": current_user.restaurant_id})
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    now = datetime.now(timezone.utc)
    await db.attendance.update_one(
        {"id": record_id},
        {"$set": {
            "clock_out": None,
            "hours_worked": None,
            "staff_claimed_time": None,
            "pending_manager_approval": False,
            "flagged": True,
            "flag_reason": "manager_rejected",
            "needs_staff_correction": True,
            "rejected_by": current_user.username,
            "rejected_at": now.isoformat(),
        }}
    )
    # Notify staff
    staff_id = record.get("staff_id")
    if staff_id:
        await db.notifications.insert_one({
            "id": f"notif_{now.timestamp()}_{staff_id}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": staff_id,
            "type": "adjustment_rejected",
            "ref_id": record_id,
            "title": "Hours Rejected",
            "message": f"Your claimed hours for {record.get('date')} were rejected. Please re-submit your finish time.",
            "read": False,
            "created_at": now.isoformat(),
        })
    return {"message": "Adjustment rejected. Staff will be asked to re-submit."}


# ── Admin: Force-close stale shifts ──

@router.post("/attendance/force-close-stale")
async def force_close_stale_shifts(current_user: User = Depends(require_admin)):
    """Admin force-closes any open attendance records for deleted or non-existent users."""
    now = datetime.now(timezone.utc)
    open_records = await db.attendance.find(
        {"restaurant_id": current_user.restaurant_id, "clock_out": None},
        {"_id": 0}
    ).to_list(500)

    closed = 0
    for record in open_records:
        staff_id = record.get("staff_id")
        user = await db.users.find_one({"id": staff_id}, {"_id": 0, "id": 1})
        if not user:
            await db.attendance.update_one(
                {"id": record["id"]},
                {"$set": {
                    "clock_out": now.isoformat(),
                    "hours_worked": 0,
                    "is_operational": False,
                    "flagged": True,
                    "flag_reason": "orphan_record_cleaned",
                }}
            )
            closed += 1
    return {"message": f"Force-closed {closed} stale shift(s) from deleted users", "closed": closed}



# ── Photo Audit: Upload & Serve ──

class PhotoUploadRequest(BaseModel):
    record_id: str
    photo_base64: str  # Base64-encoded JPEG


@router.post("/attendance/photo")
async def upload_attendance_photo(data: PhotoUploadRequest):
    """Upload a clock-in/out photo proof. Called async after PIN clock event."""
    record = await db.attendance.find_one({"id": data.record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    try:
        # Decode base64 photo
        photo_bytes = base64.b64decode(data.photo_base64)
        if len(photo_bytes) > 500_000:  # 500KB max
            raise HTTPException(status_code=400, detail="Photo too large (max 500KB)")

        from services.storage import upload_photo
        storage_path = upload_photo(photo_bytes, record["staff_id"], "clock")

        # Update attendance record with photo path
        await db.attendance.update_one(
            {"id": data.record_id},
            {"$set": {"photo_proof_path": storage_path, "photo_uploaded_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "Photo uploaded", "path": storage_path}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Photo upload failed for {data.record_id}: {e}")
        raise HTTPException(status_code=500, detail="Photo upload failed")


@router.get("/attendance/photo/{path:path}")
async def serve_attendance_photo(path: str, auth: str = Query(None), authorization: str = Header(None)):
    """Serve a clock-in/out photo. Supports query param auth for <img> tags."""
    # Basic auth check - either header or query param
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from services.storage import get_object
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        logger.error(f"Photo serve failed for {path}: {e}")
        raise HTTPException(status_code=404, detail="Photo not found")


# ── Photo Retention Cleanup ──

@router.delete("/attendance/photos/cleanup")
async def cleanup_old_photos(days: int = 90, current_user: User = Depends(require_admin)):
    """Soft-delete attendance photos older than specified days."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = await db.attendance.update_many(
        {
            "restaurant_id": current_user.restaurant_id,
            "photo_proof_path": {"$exists": True, "$ne": None},
            "photo_uploaded_at": {"$lt": cutoff},
        },
        {"$set": {"photo_proof_path": None, "photo_cleaned_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": f"Cleaned {result.modified_count} photo references older than {days} days"}
