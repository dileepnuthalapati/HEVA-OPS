from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import verify_password, get_password_hash, create_access_token, get_current_user
from models import User, UserCreate, UserLogin, Token, PasswordChange

router = APIRouter()


@router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate):
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
async def login(credentials: UserLogin):
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
