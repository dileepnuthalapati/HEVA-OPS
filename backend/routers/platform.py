from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_password_hash, require_platform_owner
from models import User, PlatformAdminCreate, RestaurantUserCreate
from datetime import datetime, timezone

router = APIRouter()


@router.get("/platform/admins")
async def get_platform_admins(current_user: User = Depends(require_platform_owner)):
    admins = await db.users.find(
        {"role": "platform_owner"},
        {"_id": 0, "password": 0, "password_hash": 0}
    ).to_list(100)
    return admins


@router.post("/platform/admins")
async def create_platform_admin(admin_data: PlatformAdminCreate, current_user: User = Depends(require_platform_owner)):
    existing = await db.users.find_one({"username": admin_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    admin_id = f"admin_{datetime.now(timezone.utc).timestamp()}"
    admin_doc = {
        "id": admin_id,
        "username": admin_data.username,
        "password": get_password_hash(admin_data.password),
        "password_hash": get_password_hash(admin_data.password),
        "role": "platform_owner",
        "restaurant_id": None,
        "email": admin_data.email,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.username,
    }
    await db.users.insert_one(admin_doc)
    return {
        "message": f"Platform admin '{admin_data.username}' created",
        "id": admin_id,
        "username": admin_data.username,
        "role": "platform_owner"
    }


@router.delete("/platform/admins/{admin_id}")
async def delete_platform_admin(admin_id: str, current_user: User = Depends(require_platform_owner)):
    admin = await db.users.find_one({"id": admin_id, "role": "platform_owner"})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    if admin.get("username") == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    admin_count = await db.users.count_documents({"role": "platform_owner"})
    if admin_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last platform owner")

    await db.users.delete_one({"id": admin_id})
    return {"message": f"Admin '{admin.get('username')}' deleted"}


@router.post("/restaurants/{restaurant_id}/users", response_model=User)
async def create_restaurant_user(restaurant_id: str, user_data: RestaurantUserCreate, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user_id = f"user_{datetime.now(timezone.utc).timestamp()}"
    user_doc = {
        "id": user_id,
        "username": user_data.username,
        "password": get_password_hash(user_data.password),
        "password_hash": get_password_hash(user_data.password),
        "role": user_data.role if user_data.role in ["admin", "user"] else "admin",
        "restaurant_id": restaurant_id,
        "email": user_data.email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)

    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$addToSet": {"users": user_data.username}}
    )

    return User(**user_doc)


@router.get("/restaurants/{restaurant_id}/users")
async def get_restaurant_users(restaurant_id: str, current_user: User = Depends(require_platform_owner)):
    users = await db.users.find({"restaurant_id": restaurant_id}, {"_id": 0, "password": 0, "password_hash": 0}).to_list(100)
    return users


@router.delete("/restaurants/{restaurant_id}/users/{user_id}")
async def delete_restaurant_user(restaurant_id: str, user_id: str, current_user: User = Depends(require_platform_owner)):
    user = await db.users.find_one({"id": user_id, "restaurant_id": restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found in this restaurant")

    await db.users.delete_one({"id": user_id})
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$pull": {"users": user.get("username")}}
    )
    return {"message": f"User '{user.get('username')}' removed from restaurant"}
