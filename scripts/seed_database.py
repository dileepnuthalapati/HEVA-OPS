import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from passlib.context import CryptContext
from pymongo import MongoClient
from dotenv import load_dotenv

# Add backend to path
backend_path = Path(__file__).parent.parent / 'backend'
sys.path.insert(0, str(backend_path))

# Load environment
load_dotenv(backend_path / '.env')

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

client = MongoClient(mongo_url)
db = client[db_name]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_database():
    print("Seeding database...")
    
    # Clear existing data
    db.users.delete_many({})
    db.categories.delete_many({})
    db.products.delete_many({})
    db.orders.delete_many({})
    
    # Create users
    users = [
        {
            "id": "user_admin",
            "username": "admin",
            "password": pwd_context.hash("admin123"),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "user_cashier",
            "username": "user",
            "password": pwd_context.hash("user123"),
            "role": "user",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    db.users.insert_many(users)
    print("✓ Created 2 users (admin/admin123, user/user123)")
    
    # Create categories
    categories = [
        {
            "id": "cat_1",
            "name": "Burgers",
            "description": "Delicious burgers and sandwiches",
            "image_url": "https://images.unsplash.com/photo-1662452883375-9226ea22c765?w=400",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "cat_2",
            "name": "Beverages",
            "description": "Refreshing drinks and beverages",
            "image_url": "https://images.pexels.com/photos/7594166/pexels-photo-7594166.jpeg?w=400",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "cat_3",
            "name": "Desserts",
            "description": "Sweet treats and desserts",
            "image_url": "https://images.unsplash.com/photo-1767335911122-e996a8c3f06c?w=400",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "cat_4",
            "name": "Pizza",
            "description": "Fresh made pizzas",
            "image_url": "https://images.unsplash.com/photo-1751200884901-c1c6f43ae1d6?w=400",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    db.categories.insert_many(categories)
    print("✓ Created 4 categories")
    
    # Create products
    products = [
        {
            "id": "prod_1",
            "name": "Classic Burger",
            "category_id": "cat_1",
            "category_name": "Burgers",
            "price": 8.99,
            "image_url": "https://images.unsplash.com/photo-1662452883375-9226ea22c765?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_2",
            "name": "Cheese Burger",
            "category_id": "cat_1",
            "category_name": "Burgers",
            "price": 10.99,
            "image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_3",
            "name": "Bacon Burger",
            "category_id": "cat_1",
            "category_name": "Burgers",
            "price": 12.99,
            "image_url": "https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_4",
            "name": "Cola",
            "category_id": "cat_2",
            "category_name": "Beverages",
            "price": 2.99,
            "image_url": "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_5",
            "name": "Lemonade",
            "category_id": "cat_2",
            "category_name": "Beverages",
            "price": 3.49,
            "image_url": "https://images.unsplash.com/photo-1523677011781-c91d1bbe1cab?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_6",
            "name": "Iced Tea",
            "category_id": "cat_2",
            "category_name": "Beverages",
            "price": 2.49,
            "image_url": "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_7",
            "name": "Chocolate Cake",
            "category_id": "cat_3",
            "category_name": "Desserts",
            "price": 5.99,
            "image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_8",
            "name": "Ice Cream",
            "category_id": "cat_3",
            "category_name": "Desserts",
            "price": 4.49,
            "image_url": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_9",
            "name": "Margherita Pizza",
            "category_id": "cat_4",
            "category_name": "Pizza",
            "price": 11.99,
            "image_url": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "prod_10",
            "name": "Pepperoni Pizza",
            "category_id": "cat_4",
            "category_name": "Pizza",
            "price": 13.99,
            "image_url": "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=300",
            "in_stock": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    db.products.insert_many(products)
    print("✓ Created 10 products")
    
    print("\n✅ Database seeded successfully!")
    print("\nDemo Accounts:")
    print("  Admin: admin / admin123")
    print("  User:  user / user123")
    
if __name__ == "__main__":
    seed_database()
