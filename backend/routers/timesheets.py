from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

router = APIRouter(dependencies=[Depends(require_feature("workforce"))])


@router.get("/timesheets/summary")
async def get_timesheet_summary(start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    """Get timesheet summary: scheduled vs actual hours per staff."""
    rest_id = current_user.restaurant_id

    # Get all staff
    staff_list = await db.users.find(
        {"restaurant_id": rest_id},
        {"_id": 0, "id": 1, "username": 1, "position": 1, "hourly_rate": 1, "role": 1}
    ).to_list(100)

    result = []
    for s in staff_list:
        sid = s["id"]

        # Scheduled hours from shifts
        shifts = await db.shifts.find(
            {"restaurant_id": rest_id, "staff_id": sid, "date": {"$gte": start_date, "$lte": end_date}},
            {"_id": 0, "start_time": 1, "end_time": 1}
        ).to_list(500)
        scheduled_mins = 0
        for sh in shifts:
            try:
                st = datetime.strptime(sh["start_time"], "%H:%M")
                et = datetime.strptime(sh["end_time"], "%H:%M")
                diff = (et - st).total_seconds() / 60
                if diff < 0:
                    diff += 1440  # overnight shift
                scheduled_mins += diff
            except (ValueError, KeyError):
                pass

        # Actual hours from attendance
        attendance = await db.attendance.find(
            {"restaurant_id": rest_id, "staff_id": sid, "date": {"$gte": start_date, "$lte": end_date}},
            {"_id": 0, "hours_worked": 1, "flagged": 1, "approved": 1}
        ).to_list(500)
        actual_hours = sum(a.get("hours_worked", 0) or 0 for a in attendance)
        has_flagged = any(a.get("flagged") for a in attendance)
        all_approved = all(a.get("approved") for a in attendance) if attendance else False

        # Check if timesheet is locked
        lock = await db.timesheet_locks.find_one(
            {"restaurant_id": rest_id, "staff_id": sid, "start_date": start_date, "end_date": end_date},
            {"_id": 0}
        )

        scheduled_hours = round(scheduled_mins / 60, 2)
        variance = round(actual_hours - scheduled_hours, 2)
        rate = s.get("hourly_rate", 0) or 0

        result.append({
            "staff_id": sid,
            "staff_name": s.get("username", ""),
            "position": s.get("position", ""),
            "hourly_rate": rate,
            "scheduled_hours": scheduled_hours,
            "actual_hours": round(actual_hours, 2),
            "variance": variance,
            "has_flagged": has_flagged,
            "approved": bool(lock and lock.get("approved")),
            "locked": bool(lock and lock.get("locked")),
            "gross_pay": round(actual_hours * rate, 2),
        })

    return result


@router.put("/timesheets/approve")
async def approve_timesheet(staff_id: str, start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    """Approve and lock a staff member's timesheet for the period."""
    rest_id = current_user.restaurant_id

    # Mark all attendance records as approved
    await db.attendance.update_many(
        {"restaurant_id": rest_id, "staff_id": staff_id, "date": {"$gte": start_date, "$lte": end_date}},
        {"$set": {"approved": True}}
    )

    # Create/update lock record
    lock_id = f"lock_{rest_id}_{staff_id}_{start_date}"
    await db.timesheet_locks.update_one(
        {"id": lock_id},
        {"$set": {
            "id": lock_id,
            "restaurant_id": rest_id,
            "staff_id": staff_id,
            "start_date": start_date,
            "end_date": end_date,
            "approved": True,
            "locked": True,
            "approved_by": current_user.username,
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Timesheet approved and locked"}


@router.put("/timesheets/unlock")
async def unlock_timesheet(staff_id: str, start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    """Owner unlocks a timesheet for correction."""
    rest_id = current_user.restaurant_id
    lock_id = f"lock_{rest_id}_{staff_id}_{start_date}"
    result = await db.timesheet_locks.update_one(
        {"id": lock_id},
        {"$set": {"locked": False, "unlocked_by": current_user.username, "unlocked_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No locked timesheet found")
    return {"message": "Timesheet unlocked for correction"}


@router.put("/timesheets/edit-hours")
async def edit_hours(record_id: str, hours_worked: float, current_user: User = Depends(require_admin)):
    """Manager manually edits hours for an attendance record."""
    record = await db.attendance.find_one({"id": record_id, "restaurant_id": current_user.restaurant_id})
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    # Check if locked
    lock = await db.timesheet_locks.find_one({
        "restaurant_id": current_user.restaurant_id,
        "staff_id": record["staff_id"],
        "locked": True,
    })
    if lock:
        raise HTTPException(status_code=400, detail="Timesheet is locked. Unlock it first.")

    await db.attendance.update_one(
        {"id": record_id},
        {"$set": {"hours_worked": hours_worked, "manually_edited": True, "edited_by": current_user.username}}
    )
    return {"message": "Hours updated"}



@router.put("/timesheets/reject")
async def reject_timesheet(staff_id: str, start_date: str, end_date: str, reason: str = "", current_user: User = Depends(require_admin)):
    """Manager rejects a timesheet — sends it back to employee for correction."""
    rest_id = current_user.restaurant_id

    # Mark records as rejected
    await db.attendance.update_many(
        {"restaurant_id": rest_id, "staff_id": staff_id, "date": {"$gte": start_date, "$lte": end_date}},
        {"$set": {"approved": False, "rejected": True, "reject_reason": reason, "rejected_by": current_user.username, "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Remove lock if exists
    lock_id = f"lock_{rest_id}_{staff_id}_{start_date}"
    await db.timesheet_locks.delete_one({"id": lock_id})

    return {"message": "Timesheet rejected. Employee can now update their records."}
