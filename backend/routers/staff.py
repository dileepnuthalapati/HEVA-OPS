from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_password_hash, verify_password, get_current_user, require_admin
from models import User, StaffCreate, StaffUpdate, PasswordReset, PasswordChange
from datetime import datetime, timezone
import secrets

router = APIRouter()


@router.get("/restaurant/staff")
async def list_restaurant_staff(current_user: User = Depends(require_admin)):
    users = await db.users.find({"restaurant_id": current_user.restaurant_id}, {"_id": 0, "password": 0, "password_hash": 0, "pos_pin_hash": 0, "manager_pin_hash": 0}).to_list(100)
    # Add has_pin flag for UI
    for u in users:
        user_doc = await db.users.find_one({"id": u["id"]}, {"_id": 0, "pos_pin_hash": 1})
        u["has_pos_pin"] = bool(user_doc and user_doc.get("pos_pin_hash"))
    return users


@router.post("/restaurant/staff")
async def create_restaurant_staff(staff: StaffCreate, current_user: User = Depends(require_admin)):
    # Validate: no spaces in username
    if " " in staff.username:
        raise HTTPException(status_code=400, detail="Username cannot contain spaces")
    existing = await db.users.find_one({"username": staff.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    # Check email uniqueness
    if staff.email:
        existing_email = await db.users.find_one({"email": staff.email})
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already in use")

    # Generate onboarding token
    onboarding_token = secrets.token_urlsafe(32)

    user_doc = {
        "id": f"user_{datetime.now(timezone.utc).timestamp()}",
        "username": staff.username,
        "email": staff.email,
        "password_hash": get_password_hash(staff.password),
        "role": staff.role if staff.role in ["user", "admin"] else "user",
        "restaurant_id": current_user.restaurant_id,
        "capabilities": staff.capabilities or [],
        "position": staff.position or "",
        "pay_type": staff.pay_type or "hourly",
        "hourly_rate": staff.hourly_rate or 0,
        "monthly_salary": staff.monthly_salary or 0,
        "phone": staff.phone or "",
        "employment_type": staff.employment_type or "full_time",
        "joining_date": staff.joining_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "tax_id": staff.tax_id or "",
        "onboarding_token": onboarding_token,
        "onboarding_completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.username,
    }
    if staff.pos_pin and len(staff.pos_pin) == 4 and staff.pos_pin.isdigit():
        user_doc["pos_pin_hash"] = get_password_hash(staff.pos_pin)
    await db.users.insert_one(user_doc)

    # Send welcome email with onboarding link
    email_status = None
    if staff.email:
        try:
            from services.email import send_email, staff_welcome_html
            restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
            biz_name = restaurant.get("business_info", {}).get("name", restaurant.get("name", "")) if restaurant else ""
            import os
            base_url = os.environ.get("FRONTEND_URL") or os.environ.get("REACT_APP_BACKEND_URL", "")
            onboarding_url = f"{base_url}/onboarding/{onboarding_token}"
            html = staff_welcome_html(staff.username, biz_name, staff.position or "", onboarding_url)
            email_result = await send_email(staff.email, f"Welcome to {biz_name} — Set up your account", html)
            email_status = email_result.get("status", "unknown")
            if email_status == "failed":
                email_status = f"failed: {email_result.get('error', 'unknown error')}"
        except Exception as e:
            import logging
            logging.getLogger("staff").warning(f"Welcome email failed for {staff.email}: {e}")
            email_status = f"failed: {str(e)}"

    return {
        "message": f"Staff '{staff.username}' created",
        "id": user_doc["id"],
        "onboarding_token": onboarding_token,
        "email_status": email_status,
    }


# --- Public onboarding endpoints (no auth required) ---

@router.get("/onboarding/{token}")
async def get_onboarding_info(token: str):
    """Public: staff opens this link to see their setup page."""
    user = await db.users.find_one(
        {"onboarding_token": token},
        {"_id": 0, "password_hash": 0, "pos_pin_hash": 0, "manager_pin_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="Invalid or expired onboarding link")
    if user.get("onboarding_completed"):
        raise HTTPException(status_code=400, detail="Account already set up")

    # Get business name
    restaurant = await db.restaurants.find_one({"id": user.get("restaurant_id")}, {"_id": 0})
    biz_name = restaurant.get("business_info", {}).get("name", restaurant.get("name", "")) if restaurant else ""

    return {
        "username": user.get("username"),
        "email": user.get("email"),
        "business_name": biz_name,
        "position": user.get("position", ""),
        "capabilities": user.get("capabilities", []),
    }


from pydantic import BaseModel as PydanticBaseModel
from typing import Optional as Opt


class OnboardingComplete(PydanticBaseModel):
    password: str
    pos_pin: Opt[str] = None


@router.post("/onboarding/{token}/complete")
async def complete_onboarding(token: str, data: OnboardingComplete):
    """Public: staff sets their own password and PIN."""
    user = await db.users.find_one({"onboarding_token": token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Invalid or expired onboarding link")
    if user.get("onboarding_completed"):
        raise HTTPException(status_code=400, detail="Account already set up")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    update = {
        "password_hash": get_password_hash(data.password),
        "onboarding_completed": True,
        "onboarding_token": None,  # Invalidate the token
    }
    if data.pos_pin and len(data.pos_pin) == 4 and data.pos_pin.isdigit():
        update["pos_pin_hash"] = get_password_hash(data.pos_pin)

    await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"message": "Account setup complete! You can now log in.", "username": user.get("username")}


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
    if staff.email is not None:
        # Check email uniqueness
        existing_email = await db.users.find_one({"email": staff.email, "id": {"$ne": user_id}})
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already in use")
        update["email"] = staff.email
    if staff.password:
        update["password_hash"] = get_password_hash(staff.password)
    if staff.capabilities is not None:
        update["capabilities"] = staff.capabilities
    if staff.position is not None:
        update["position"] = staff.position
    if staff.pay_type is not None:
        update["pay_type"] = staff.pay_type
    if staff.hourly_rate is not None:
        update["hourly_rate"] = staff.hourly_rate
    if staff.monthly_salary is not None:
        update["monthly_salary"] = staff.monthly_salary
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

    # Cascade: close any open attendance records for this user
    now = datetime.now(timezone.utc)
    open_records = await db.attendance.find(
        {"staff_id": user_id, "restaurant_id": current_user.restaurant_id, "clock_out": None}
    ).to_list(100)
    if open_records:
        await db.attendance.update_many(
            {"staff_id": user_id, "restaurant_id": current_user.restaurant_id, "clock_out": None},
            {"$set": {
                "clock_out": now.isoformat(),
                "hours_worked": 0,
                "is_operational": False,
                "flagged": True,
                "flag_reason": "user_deleted",
                "deleted_at": now.isoformat(),
            }}
        )

    await db.users.delete_one({"id": user_id})
    return {"message": f"Staff '{user.get('username')}' deleted", "closed_shifts": len(open_records)}
