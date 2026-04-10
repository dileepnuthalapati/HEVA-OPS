from fastapi import APIRouter, Depends, HTTPException, Request
from database import db
from dependencies import verify_password, get_password_hash, create_access_token, get_current_user, require_admin
from models import User, UserCreate, UserLogin, Token, PasswordChange
from rate_limiter import limiter
from pydantic import BaseModel as PydanticBaseModel
from typing import Optional

router = APIRouter()


@router.post("/auth/register", response_model=User)
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserCreate):
    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    from datetime import datetime, timezone
    user_id = f"user_{datetime.now(timezone.utc).timestamp()}"
    user_dict = {
        "id": user_id,
        "username": user_data.username,
        "password": get_password_hash(user_data.password),
        "role": user_data.role,
        "restaurant_id": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_dict)
    return User(**user_dict)


@router.post("/auth/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin):
    user = await db.users.find_one({"username": credentials.username})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    stored_password = user.get("password_hash") or user.get("password")
    if not stored_password or not verify_password(credentials.password, stored_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user["username"], "role": user.get("role", "user")})
    return Token(
        access_token=token,
        role=user.get("role", "user"),
        username=user["username"],
        restaurant_id=user.get("restaurant_id")
    )


@router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/auth/change-password")
async def change_password(password_data: PasswordChange, current_user: User = Depends(get_current_user)):
    user = await db.users.find_one({"username": current_user.username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stored_password = user.get("password_hash") or user.get("password")
    if not stored_password or not verify_password(password_data.current_password, stored_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = get_password_hash(password_data.new_password)
    await db.users.update_one(
        {"username": current_user.username},
        {"$set": {"password_hash": new_hash, "password": new_hash}}
    )
    return {"message": "Password changed successfully"}


@router.put("/auth/change-password")
async def change_own_password(data: PasswordChange, current_user: User = Depends(get_current_user)):
    user = await db.users.find_one({"username": current_user.username})
    stored_hash = user.get("password_hash") or user.get("password") if user else None
    if not user or not stored_hash or not verify_password(data.current_password, stored_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_hashed = get_password_hash(data.new_password)
    await db.users.update_one({"username": current_user.username}, {"$set": {"password_hash": new_hashed, "password": new_hashed}})
    return {"message": "Password changed successfully"}


class ManagerPinUpdate(PydanticBaseModel):
    current_password: str
    manager_pin: str


@router.post("/auth/set-manager-pin")
async def set_manager_pin(data: ManagerPinUpdate, current_user: User = Depends(get_current_user)):
    """Admin sets a dedicated Manager PIN for staff void authorization."""
    if current_user.role not in ["admin", "platform_owner"]:
        raise HTTPException(status_code=403, detail="Only admins can set the manager PIN")

    user = await db.users.find_one({"username": current_user.username})
    stored_hash = user.get("password_hash") or user.get("password") if user else None
    if not user or not stored_hash or not verify_password(data.current_password, stored_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    pin_hash = get_password_hash(data.manager_pin)
    await db.users.update_one(
        {"username": current_user.username},
        {"$set": {"manager_pin_hash": pin_hash}}
    )
    return {"message": "Manager PIN updated successfully"}


@router.get("/auth/has-manager-pin")
async def has_manager_pin(current_user: User = Depends(get_current_user)):
    """Check if the admin has set a dedicated manager PIN."""
    if current_user.role not in ["admin", "platform_owner"]:
        return {"has_pin": False}
    user = await db.users.find_one({"username": current_user.username}, {"_id": 0, "manager_pin_hash": 1})
    return {"has_pin": bool(user and user.get("manager_pin_hash"))}


# ─── Quick POS PIN Login ───────────────────────────────────────
class PinLoginRequest(PydanticBaseModel):
    pin: str
    restaurant_id: str


class SetPinRequest(PydanticBaseModel):
    user_id: str
    pin: str


@router.post("/auth/pin-login", response_model=Token)
@limiter.limit("20/minute")
async def pin_login(request: Request, data: PinLoginRequest):
    """Staff logs in with 4-digit PIN. Searches all staff in the restaurant."""
    if not data.pin or len(data.pin) != 4 or not data.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")

    # Find all users in this restaurant that have a POS PIN set
    users = await db.users.find(
        {"restaurant_id": data.restaurant_id, "pos_pin_hash": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(100)

    for user in users:
        if verify_password(data.pin, user["pos_pin_hash"]):
            token = create_access_token({"sub": user["username"], "role": user.get("role", "user")})
            return Token(
                access_token=token,
                role=user.get("role", "user"),
                username=user["username"],
                restaurant_id=user.get("restaurant_id")
            )

    raise HTTPException(status_code=401, detail="Invalid PIN")


@router.post("/auth/set-pos-pin")
async def set_pos_pin(data: SetPinRequest, current_user: User = Depends(require_admin)):
    """Admin sets a 4-digit POS PIN for a staff member."""
    if not data.pin or len(data.pin) != 4 or not data.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")

    user = await db.users.find_one({"id": data.user_id, "restaurant_id": current_user.restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # Check no other user in this restaurant has the same PIN
    existing_users = await db.users.find(
        {"restaurant_id": current_user.restaurant_id, "pos_pin_hash": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(100)
    for eu in existing_users:
        if eu["id"] != data.user_id and verify_password(data.pin, eu["pos_pin_hash"]):
            raise HTTPException(status_code=400, detail="This PIN is already assigned to another staff member")

    pin_hash = get_password_hash(data.pin)
    await db.users.update_one({"id": data.user_id}, {"$set": {"pos_pin_hash": pin_hash}})
    return {"message": f"POS PIN set for {user.get('username')}"}


@router.delete("/auth/remove-pos-pin/{user_id}")
async def remove_pos_pin(user_id: str, current_user: User = Depends(require_admin)):
    """Admin removes POS PIN from a staff member."""
    user = await db.users.find_one({"id": user_id, "restaurant_id": current_user.restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    await db.users.update_one({"id": user_id}, {"$unset": {"pos_pin_hash": ""}})
    return {"message": f"POS PIN removed for {user.get('username')}"}


@router.get("/auth/restaurant-has-pins/{restaurant_id}")
async def restaurant_has_pins(restaurant_id: str):
    """Public endpoint: Check if a restaurant has any PIN-enabled staff (for login UI toggle)."""
    count = await db.users.count_documents(
        {"restaurant_id": restaurant_id, "pos_pin_hash": {"$exists": True, "$ne": None}}
    )
    return {"has_pins": count > 0, "pin_count": count}
