#!/usr/bin/env python3
"""
Seed database with Platform Owner and test users for HevaPOS
Run this script to set up initial users and a demo restaurant.
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pathlib import Path

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

async def seed_database():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'hevapos')
    
    print(f"Connecting to MongoDB...")
    print(f"Database: {db_name}")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Test connection
    try:
        await client.admin.command('ping')
        print("✅ Successfully connected to MongoDB Atlas!")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return
    
    # ===== CLEAR EXISTING DATA (Optional - for clean reset) =====
    print("\n📦 Clearing existing data...")
    await db.users.delete_many({})
    await db.restaurants.delete_many({})
    await db.categories.delete_many({})
    await db.products.delete_many({})
    
    # ===== CREATE PLATFORM OWNER =====
    print("\n👑 Creating Platform Owner...")
    platform_owner = {
        "id": "platform_owner_1",
        "username": "platform_owner",
        "password": get_password_hash("admin123"),
        "role": "platform_owner",
        "restaurant_id": None,  # Platform owner is not tied to any restaurant
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(platform_owner)
    print(f"   ✅ Platform Owner: platform_owner / admin123")
    
    # ===== CREATE DEMO RESTAURANT =====
    print("\n🏪 Creating Demo Restaurant...")
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
            "address_line2": "",
            "city": "London",
            "postcode": "SW1A 1AA",
            "phone": "+44 20 1234 5678",
            "email": "info@pizzapalace.com",
            "website": "www.pizzapalace.com",
            "vat_number": "GB123456789",
            "receipt_footer": "Thank you for dining with us!"
        },
        "users": ["restaurant_admin", "user"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "trial_ends_at": trial_ends.isoformat(),
        "next_billing_date": trial_ends.isoformat()
    }
    await db.restaurants.insert_one(demo_restaurant)
    print(f"   ✅ Restaurant: Pizza Palace (ID: rest_demo_1)")
    
    # ===== CREATE RESTAURANT ADMIN =====
    print("\n👔 Creating Restaurant Admin...")
    restaurant_admin = {
        "id": "restaurant_admin_1",
        "username": "restaurant_admin",
        "password": get_password_hash("admin123"),
        "role": "admin",
        "restaurant_id": "rest_demo_1",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(restaurant_admin)
    print(f"   ✅ Restaurant Admin: restaurant_admin / admin123")
    
    # ===== CREATE RESTAURANT USER (STAFF) =====
    print("\n👤 Creating Restaurant User...")
    restaurant_user = {
        "id": "restaurant_user_1",
        "username": "user",
        "password": get_password_hash("user123"),
        "role": "user",
        "restaurant_id": "rest_demo_1",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(restaurant_user)
    print(f"   ✅ Restaurant User: user / user123")
    
    # ===== CREATE DEMO CATEGORIES =====
    print("\n📁 Creating Demo Categories...")
    categories = [
        {"id": "cat_1", "name": "Pizzas", "description": "Delicious hand-tossed pizzas", "image_url": None, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_2", "name": "Drinks", "description": "Refreshing beverages", "image_url": None, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_3", "name": "Sides", "description": "Tasty sides and starters", "image_url": None, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_4", "name": "Desserts", "description": "Sweet treats", "image_url": None, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.categories.insert_many(categories)
    print(f"   ✅ Created {len(categories)} categories")
    
    # ===== CREATE DEMO PRODUCTS =====
    print("\n🍕 Creating Demo Products...")
    products = [
        # Pizzas
        {"id": "prod_1", "name": "Margherita", "category_id": "cat_1", "category_name": "Pizzas", "price": 9.99, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_2", "name": "Pepperoni", "category_id": "cat_1", "category_name": "Pizzas", "price": 11.99, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_3", "name": "Hawaiian", "category_id": "cat_1", "category_name": "Pizzas", "price": 12.99, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_4", "name": "Veggie Supreme", "category_id": "cat_1", "category_name": "Pizzas", "price": 13.99, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        # Drinks
        {"id": "prod_5", "name": "Coca-Cola", "category_id": "cat_2", "category_name": "Drinks", "price": 2.50, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_6", "name": "Sprite", "category_id": "cat_2", "category_name": "Drinks", "price": 2.50, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_7", "name": "Water", "category_id": "cat_2", "category_name": "Drinks", "price": 1.50, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        # Sides
        {"id": "prod_8", "name": "Garlic Bread", "category_id": "cat_3", "category_name": "Sides", "price": 4.99, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_9", "name": "Chicken Wings", "category_id": "cat_3", "category_name": "Sides", "price": 6.99, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        # Desserts
        {"id": "prod_10", "name": "Chocolate Brownie", "category_id": "cat_4", "category_name": "Desserts", "price": 4.50, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_11", "name": "Ice Cream", "category_id": "cat_4", "category_name": "Desserts", "price": 3.50, "image_url": None, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.products.insert_many(products)
    print(f"   ✅ Created {len(products)} products")
    
    # ===== SUMMARY =====
    print("\n" + "="*50)
    print("🎉 DATABASE SEEDING COMPLETE!")
    print("="*50)
    print("\n📋 TEST CREDENTIALS:")
    print("   ┌─────────────────────────────────────────────┐")
    print("   │ PLATFORM OWNER (manages all restaurants)    │")
    print("   │   Username: platform_owner                  │")
    print("   │   Password: admin123                        │")
    print("   ├─────────────────────────────────────────────┤")
    print("   │ RESTAURANT ADMIN (manages Pizza Palace)     │")
    print("   │   Username: restaurant_admin                │")
    print("   │   Password: admin123                        │")
    print("   ├─────────────────────────────────────────────┤")
    print("   │ RESTAURANT USER (staff at Pizza Palace)     │")
    print("   │   Username: user                            │")
    print("   │   Password: user123                         │")
    print("   └─────────────────────────────────────────────┘")
    
    # Close connection
    client.close()
    print("\n✅ Database connection closed.")

if __name__ == "__main__":
    asyncio.run(seed_database())
