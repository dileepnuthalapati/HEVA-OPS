from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_platform_owner, require_feature
from models import User
from datetime import datetime, timezone, timedelta

router = APIRouter()

LONG_SHIFT_THRESHOLD_HOURS = 10


@router.get("/notifications")
async def get_notifications(current_user: User = Depends(require_platform_owner)):
    notifications = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifications


@router.put("/notifications/{notification_id}/mark-sent")
async def mark_notification_sent(notification_id: str, current_user: User = Depends(require_platform_owner)):
    await db.notifications.update_one({"id": notification_id}, {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Notification marked as sent"}


@router.get("/notifications/my")
async def get_my_notifications(current_user: User = Depends(get_current_user)):
    """Get current user's notifications. Staff see their personal nudges. Admin see restaurant-level."""
    if not current_user.restaurant_id:
        return []

    staff = await db.users.find_one(
        {"username": current_user.username, "restaurant_id": current_user.restaurant_id},
        {"_id": 0, "id": 1}
    )
    staff_id = staff.get("id") if staff else None

    # Staff see their own unread notifications
    query = {
        "restaurant_id": current_user.restaurant_id,
        "read": {"$ne": True},
    }
    if current_user.role != "admin" and staff_id:
        query["staff_id"] = staff_id

    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(20)
    return notifications


@router.put("/notifications/{notification_id}/dismiss")
async def dismiss_notification(notification_id: str, current_user: User = Depends(get_current_user)):
    """Mark a notification as read/dismissed."""
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification dismissed"}


@router.post("/notifications/check-long-shifts")
async def check_long_shifts(current_user: User = Depends(get_current_user)):
    """Check for staff clocked in >10 hours and create nudge notifications.
    Called periodically from the app or a cron job."""
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant context")

    now = datetime.now(timezone.utc)
    threshold = now - timedelta(hours=LONG_SHIFT_THRESHOLD_HOURS)

    # Find open attendance records older than threshold
    long_shifts = await db.attendance.find(
        {
            "restaurant_id": current_user.restaurant_id,
            "clock_out": None,
            "clock_in": {"$lte": threshold.isoformat()},
        },
        {"_id": 0}
    ).to_list(100)

    created = 0
    for record in long_shifts:
        staff_id = record["staff_id"]
        record_id = record["id"]

        # Don't duplicate: check if nudge already exists for this shift
        existing = await db.notifications.find_one(
            {"staff_id": staff_id, "ref_id": record_id, "type": "long_shift_nudge"},
            {"_id": 0}
        )
        if existing:
            continue

        clock_in = datetime.fromisoformat(record["clock_in"])
        elapsed = round((now - clock_in).total_seconds() / 3600, 1)

        restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
        biz_name = restaurant.get("business_info", {}).get("name", "") if restaurant else ""

        notification = {
            "id": f"notif_{now.timestamp()}_{staff_id}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": staff_id,
            "staff_name": record.get("staff_name", ""),
            "type": "long_shift_nudge",
            "ref_id": record_id,
            "title": "Still on shift?",
            "message": f"You've been clocked in for {elapsed}h at {biz_name}. Don't forget to clock out!",
            "read": False,
            "created_at": now.isoformat(),
        }
        await db.notifications.insert_one(notification)
        created += 1

        # Also send native push if device tokens exist
        try:
            from services.push import send_push_multi
            device_docs = await db.devices.find(
                {"staff_id": staff_id, "is_active": True}, {"_id": 0, "token": 1}
            ).to_list(10)
            tokens = [d["token"] for d in device_docs if d.get("token")]
            if tokens:
                send_push_multi(tokens, notification["title"], notification["message"],
                                {"type": "long_shift_nudge", "record_id": record_id})
        except Exception:
            pass

    return {"message": f"Checked {len(long_shifts)} long shifts, created {created} new notifications."}
