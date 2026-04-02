from fastapi import APIRouter, Depends
from database import db
from dependencies import get_current_user, require_platform_owner
from models import User
from datetime import datetime, timezone

router = APIRouter()


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
    if not current_user.restaurant_id:
        return []
    notifications = await db.notifications.find({"restaurant_id": current_user.restaurant_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return notifications
