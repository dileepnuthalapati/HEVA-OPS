from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user
from models import User
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class DeviceRegisterRequest(BaseModel):
    token: str
    platform: Optional[str] = None  # "ios" | "android" | "web"


@router.post("/devices/register")
async def register_device(data: DeviceRegisterRequest, current_user: User = Depends(get_current_user)):
    """Register or update a device FCM token for the current user."""
    if not data.token:
        raise HTTPException(status_code=400, detail="Token is required")

    staff = await db.users.find_one(
        {"username": current_user.username, "restaurant_id": current_user.restaurant_id},
        {"_id": 0, "id": 1}
    )
    staff_id = staff.get("id") if staff else current_user.username

    # Upsert: update if token exists, create if new
    existing = await db.devices.find_one({"token": data.token})
    if existing:
        await db.devices.update_one(
            {"token": data.token},
            {"$set": {
                "staff_id": staff_id,
                "username": current_user.username,
                "restaurant_id": current_user.restaurant_id,
                "platform": data.platform,
                "is_active": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
    else:
        await db.devices.insert_one({
            "token": data.token,
            "staff_id": staff_id,
            "username": current_user.username,
            "restaurant_id": current_user.restaurant_id,
            "platform": data.platform,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    return {"message": "Device registered", "token": data.token[:20] + "..."}


@router.delete("/devices/unregister")
async def unregister_device(data: DeviceRegisterRequest, current_user: User = Depends(get_current_user)):
    """Unregister a device (e.g., on logout)."""
    await db.devices.update_one(
        {"token": data.token},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Device unregistered"}
