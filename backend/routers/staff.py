from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_password_hash, verify_password, get_current_user, require_admin
from models import User, StaffCreate, StaffUpdate, PasswordReset, PasswordChange
from datetime import datetime, timezone

router = APIRouter()


@router.get("/restaurant/staff")
async def list_restaurant_staff(current_user: User = Depends(require_admin)):
    users = await db.users.find({"restaurant_id": current_user.restaurant_id}, {"_id": 0, "password": 0, "password_hash": 0, "pos_pin_hash": 0}).to_list(100)
    # Add has_pin flag for UI
    for u in users:
        user_doc = await db.users.find_one({"id": u["id"]}, {"_id": 0, "pos_pin_hash": 1})
        u["has_pos_pin"] = bool(user_doc and user_doc.get("pos_pin_hash"))
    return users


@router.post("/restaurant/staff")
async def create_restaurant_staff(staff: StaffCreate, current_user: User = Depends(require_admin)):
    existing = await db.users.find_one({"username": staff.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    user_doc = {
        "id": f"user_{datetime.now(timezone.utc).timestamp()}",
        "username": staff.username,
        "password_hash": get_password_hash(staff.password),
        "role": staff.role if staff.role in ["user", "admin"] else "user",
        "restaurant_id": current_user.restaurant_id,
        "position": staff.position or "",
        "hourly_rate": staff.hourly_rate or 0,
        "phone": staff.phone or "",
        "employment_type": staff.employment_type or "full_time",
        "joining_date": staff.joining_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "tax_id": staff.tax_id or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.username,
    }
    if staff.pos_pin and len(staff.pos_pin) == 4 and staff.pos_pin.isdigit():
        user_doc["pos_pin_hash"] = get_password_hash(staff.pos_pin)
    await db.users.insert_one(user_doc)
    return {"message": f"Staff '{staff.username}' created", "id": user_doc["id"]}


@router.put("/restaurant/staff/{user_id}/reset-password")
async def reset_staff_password(user_id: str, data: PasswordReset, current_user: User = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id, "restaurant_id": current_user.restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": get_password_hash(data.new_password)}})
    return {"message": f"Password reset for {user.get('username', user_id)}"}


@router.put("/restaurant/staff/{user_id}")
async def update_staff(user_id: str, staff: StaffUpdate, current_user: User = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id, "restaurant_id": current_user.restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    update = {"username": staff.username, "role": staff.role}
    if staff.password:
        update["password_hash"] = get_password_hash(staff.password)
    if staff.position is not None:
        update["position"] = staff.position
    if staff.hourly_rate is not None:
        update["hourly_rate"] = staff.hourly_rate
    if staff.phone is not None:
        update["phone"] = staff.phone
    if staff.employment_type is not None:
        update["employment_type"] = staff.employment_type
    if staff.joining_date is not None:
        update["joining_date"] = staff.joining_date
    if staff.tax_id is not None:
        update["tax_id"] = staff.tax_id
    await db.users.update_one({"id": user_id}, {"$set": update})
    return {"message": f"Staff '{staff.username}' updated"}


@router.delete("/restaurant/staff/{user_id}")
async def delete_staff(user_id: str, current_user: User = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id, "restaurant_id": current_user.restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="Staff not found")
    if user.get("username") == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"id": user_id})
    return {"message": f"Staff '{user.get('username')}' deleted"}
