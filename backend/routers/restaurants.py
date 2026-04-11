from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_platform_owner, DEFAULT_FEATURES, validate_feature_dependencies
from models import User, Restaurant, RestaurantCreate, RestaurantUpdate
from typing import List
from datetime import datetime, timezone, timedelta

router = APIRouter()


@router.post("/restaurants", response_model=Restaurant)
async def create_restaurant(restaurant_data: RestaurantCreate, current_user: User = Depends(require_platform_owner)):
    restaurant_id = f"rest_{datetime.now(timezone.utc).timestamp()}"
    trial_ends = datetime.now(timezone.utc) + timedelta(days=14)

    restaurant_dict = {
        "id": restaurant_id,
        "owner_email": restaurant_data.owner_email,
        "subscription_status": "trial",
        "subscription_plan": restaurant_data.subscription_plan,
        "price": restaurant_data.price,
        "currency": restaurant_data.currency,
        "business_info": restaurant_data.business_info or {},
        "features": restaurant_data.features or DEFAULT_FEATURES.copy(),
        "users": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "trial_ends_at": trial_ends.isoformat()
    }
    # Validate feature dependencies
    dep_error = validate_feature_dependencies(restaurant_dict["features"])
    if dep_error:
        raise HTTPException(status_code=400, detail=dep_error)

    await db.restaurants.insert_one(restaurant_dict)

    # Auto-seed default categories for the new restaurant
    import secrets
    platform_cats = await db.platform_categories.find({}, {"_id": 0}).to_list(100)
    if platform_cats:
        for pc in platform_cats:
            cat_id = f"cat_{secrets.token_hex(6)}"
            await db.categories.insert_one({
                "id": cat_id,
                "name": pc.get("name", ""),
                "description": pc.get("description", ""),
                "restaurant_id": restaurant_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    else:
        defaults = [
            {"name": "Starters", "description": "Appetizers and starters"},
            {"name": "Mains", "description": "Main courses"},
            {"name": "Drinks", "description": "Beverages"},
            {"name": "Desserts", "description": "Sweet treats"},
        ]
        for item in defaults:
            cat_id = f"cat_{secrets.token_hex(6)}"
            await db.categories.insert_one({
                "id": cat_id,
                "name": item["name"],
                "description": item["description"],
                "restaurant_id": restaurant_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    return Restaurant(**restaurant_dict)


@router.put("/restaurants/{restaurant_id}")
async def update_restaurant(restaurant_id: str, restaurant_data: RestaurantCreate, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    update_dict = {
        "owner_email": restaurant_data.owner_email,
        "subscription_plan": restaurant_data.subscription_plan,
        "price": restaurant_data.price,
        "currency": restaurant_data.currency,
        "business_info": restaurant_data.business_info or restaurant.get("business_info", {}),
    }
    if restaurant_data.features is not None:
        dep_error = validate_feature_dependencies(restaurant_data.features)
        if dep_error:
            raise HTTPException(status_code=400, detail=dep_error)
        update_dict["features"] = restaurant_data.features

    await db.restaurants.update_one({"id": restaurant_id}, {"$set": update_dict})
    updated = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    return Restaurant(**updated)


@router.delete("/restaurants/{restaurant_id}")
async def delete_restaurant(restaurant_id: str, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    await db.users.delete_many({"restaurant_id": restaurant_id})
    await db.restaurants.delete_one({"id": restaurant_id})
    return {"message": "Restaurant and all associated users deleted"}


@router.get("/restaurants/my", response_model=Restaurant)
async def get_my_restaurant(current_user: User = Depends(get_current_user)):
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant associated with user")
    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return Restaurant(**restaurant)


@router.put("/restaurants/my/settings")
async def update_restaurant_settings(settings: RestaurantUpdate, current_user: User = Depends(get_current_user)):
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant associated with user")

    update_dict = {}
    if settings.business_info is not None:
        restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
        existing_info = restaurant.get("business_info", {}) if restaurant else {}
        existing_info.update(settings.business_info)
        update_dict["business_info"] = existing_info
    if settings.currency is not None:
        update_dict["currency"] = settings.currency
    if settings.owner_email is not None:
        update_dict["owner_email"] = settings.owner_email
    if settings.qr_ordering_enabled is not None:
        update_dict["qr_ordering_enabled"] = settings.qr_ordering_enabled

    if update_dict:
        await db.restaurants.update_one({"id": current_user.restaurant_id}, {"$set": update_dict})

    updated = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    return Restaurant(**updated)


@router.put("/restaurants/{restaurant_id}/features")
async def update_restaurant_features(restaurant_id: str, features: dict, current_user: User = Depends(require_platform_owner)):
    """Platform Owner toggles modules for a restaurant."""
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    dep_error = validate_feature_dependencies(features)
    if dep_error:
        raise HTTPException(status_code=400, detail=dep_error)
    await db.restaurants.update_one({"id": restaurant_id}, {"$set": {"features": features}})
    return {"message": "Features updated", "features": features}



@router.get("/restaurants")
async def list_restaurants(current_user: User = Depends(require_platform_owner)):
    restaurants = await db.restaurants.find({}, {"_id": 0}).to_list(1000)
    return [Restaurant(**r) for r in restaurants]
