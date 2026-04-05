from fastapi import APIRouter, HTTPException
from database import db
from dependencies import get_password_hash
from models import StatusCheck, StatusCheckCreate
from typing import List
from datetime import datetime, timezone, timedelta

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Hello World"}


@router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


@router.post("/seed-database")
async def seed_database_endpoint(secret: str = None):
    if secret != "hevapos2026":
        raise HTTPException(status_code=403, detail="Invalid secret. Use ?secret=hevapos2026")

    existing_users = await db.users.count_documents({})
    if existing_users > 0:
        return {"message": f"Database already seeded with {existing_users} users. Skipping.", "seeded": False}

    platform_owner = {
        "id": "platform_owner_1",
        "username": "platform_owner",
        "password": get_password_hash("admin123"),
        "role": "platform_owner",
        "restaurant_id": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(platform_owner)

    trial_ends = datetime.now(timezone.utc) + timedelta(days=14)
    demo_restaurant = {
        "id": "rest_demo_1",
        "owner_email": "demo@hevapos.com",
        "subscription_status": "trial",
        "subscription_plan": "standard_monthly",
        "price": 19.99,
        "currency": "GBP",
        "business_info": {
            "name": "Pizza Palace",
            "address_line1": "123 High Street",
            "city": "London",
            "postcode": "SW1A 1AA",
            "phone": "+44 20 1234 5678",
            "email": "info@pizzapalace.com"
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "trial_ends_at": trial_ends.isoformat()
    }
    await db.restaurants.insert_one(demo_restaurant)

    restaurant_admin = {
        "id": "restaurant_admin_1",
        "username": "restaurant_admin",
        "password": get_password_hash("admin123"),
        "role": "admin",
        "restaurant_id": "rest_demo_1",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(restaurant_admin)

    staff_user = {
        "id": "restaurant_user_1",
        "username": "user",
        "password": get_password_hash("user123"),
        "role": "user",
        "restaurant_id": "rest_demo_1",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(staff_user)

    categories = [
        {"id": "cat_1", "name": "Pizzas", "description": "Delicious pizzas", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_2", "name": "Drinks", "description": "Beverages", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_3", "name": "Sides", "description": "Sides and starters", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_4", "name": "Desserts", "description": "Sweet treats", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.categories.insert_many(categories)

    products = [
        {"id": "prod_1", "name": "Margherita", "category_id": "cat_1", "category_name": "Pizzas", "price": 9.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_2", "name": "Pepperoni", "category_id": "cat_1", "category_name": "Pizzas", "price": 11.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_3", "name": "Hawaiian", "category_id": "cat_1", "category_name": "Pizzas", "price": 12.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_4", "name": "Veggie Supreme", "category_id": "cat_1", "category_name": "Pizzas", "price": 13.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_5", "name": "Coca-Cola", "category_id": "cat_2", "category_name": "Drinks", "price": 2.50, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_6", "name": "Sprite", "category_id": "cat_2", "category_name": "Drinks", "price": 2.50, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_7", "name": "Water", "category_id": "cat_2", "category_name": "Drinks", "price": 1.50, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_8", "name": "Garlic Bread", "category_id": "cat_3", "category_name": "Sides", "price": 4.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_9", "name": "Chicken Wings", "category_id": "cat_3", "category_name": "Sides", "price": 6.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_10", "name": "Chocolate Brownie", "category_id": "cat_4", "category_name": "Desserts", "price": 4.50, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_11", "name": "Ice Cream", "category_id": "cat_4", "category_name": "Desserts", "price": 3.50, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.products.insert_many(products)

    return {
        "message": "Database seeded successfully!",
        "seeded": True,
        "credentials": {
            "platform_owner": {"username": "platform_owner", "password": "admin123"},
            "restaurant_admin": {"username": "restaurant_admin", "password": "admin123"},
            "staff": {"username": "user", "password": "user123"}
        },
        "data_created": {"users": 3, "restaurants": 1, "categories": 4, "products": 11}
    }


@router.post("/migrate-fix")
async def migrate_fix_endpoint(secret: str = None):
    """Safe migration: fixes missing restaurant_id on categories/products without deleting anything."""
    if secret != "hevapos2026":
        raise HTTPException(status_code=403, detail="Invalid secret")

    results = {"categories_fixed": 0, "products_fixed": 0, "restaurants_checked": []}

    # Get all restaurants
    restaurants = await db.restaurants.find({}, {"_id": 0, "id": 1, "business_info": 1}).to_list(1000)

    for rest in restaurants:
        rid = rest["id"]
        rname = rest.get("business_info", {}).get("name", rid)
        results["restaurants_checked"].append(rname)

        # Fix categories missing restaurant_id
        cat_result = await db.categories.update_many(
            {"$or": [{"restaurant_id": None}, {"restaurant_id": {"$exists": False}}]},
            {"$set": {"restaurant_id": rid}}
        )
        results["categories_fixed"] += cat_result.modified_count

        # Fix products missing restaurant_id
        prod_result = await db.products.update_many(
            {"$or": [{"restaurant_id": None}, {"restaurant_id": {"$exists": False}}]},
            {"$set": {"restaurant_id": rid}}
        )
        results["products_fixed"] += prod_result.modified_count

    # If there are categories with no restaurant and no restaurants exist, report them
    orphan_cats = await db.categories.count_documents(
        {"$or": [{"restaurant_id": None}, {"restaurant_id": {"$exists": False}}]}
    )
    orphan_prods = await db.products.count_documents(
        {"$or": [{"restaurant_id": None}, {"restaurant_id": {"$exists": False}}]}
    )
    results["remaining_orphan_categories"] = orphan_cats
    results["remaining_orphan_products"] = orphan_prods

    return {
        "message": "Migration complete. No data was deleted.",
        "results": results
    }
