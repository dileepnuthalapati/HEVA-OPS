from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
import json
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import socket
import base64
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
import jwt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table as ReportLabTable, TableStyle, Paragraph, Spacer
from io import BytesIO
import uuid


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    role: str
    restaurant_id: Optional[str] = None
    created_at: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    created_at: str

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category_id: str
    category_name: str
    price: float
    image_url: Optional[str] = None
    in_stock: bool = True
    created_at: str

class ProductCreate(BaseModel):
    name: str
    category_id: str
    price: float
    image_url: Optional[str] = None
    in_stock: bool = True

class OrderItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product_id: str
    product_name: str = ""
    quantity: int = 1
    unit_price: float = 0.0
    total: float = 0.0
    notes: Optional[str] = None
    is_custom: Optional[bool] = False

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int = 0
    items: List[OrderItem] = []
    subtotal: float = 0.0
    discount_type: Optional[str] = None
    discount_value: float = 0.0
    discount_amount: float = 0.0
    discount_reason: Optional[str] = None
    tip_amount: float = 0.0
    tip_percentage: int = 0
    total_amount: float = 0.0
    created_by: str = "unknown"
    created_at: str = ""
    synced: bool = True
    status: str = "pending"
    payment_method: Optional[str] = None
    payment_details: Optional[dict] = None
    split_count: int = 1
    completed_at: Optional[str] = None
    table_id: Optional[str] = None
    order_notes: Optional[str] = None

class OrderCreate(BaseModel):
    items: List[OrderItem]
    total_amount: float
    table_id: Optional[str] = None
    order_notes: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: float = 0.0
    discount_reason: Optional[str] = None

class OrderComplete(BaseModel):
    payment_method: str  # "cash", "card", or "split"
    tip_percentage: int = 0
    tip_amount: float = 0.0
    split_count: int = 1
    payment_details: Optional[dict] = None  # For split payments: {"cash": 10.00, "card": 15.00}

class CashDrawer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    date: str
    opening_balance: float
    expected_cash: float
    actual_cash: float
    difference: float
    notes: Optional[str] = None
    opened_by: str
    closed_by: Optional[str] = None
    opened_at: str
    closed_at: Optional[str] = None
    status: str = "open"

class CashDrawerOpen(BaseModel):
    opening_balance: float

class CashDrawerClose(BaseModel):
    actual_cash: float
    notes: Optional[str] = None

class Restaurant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    owner_email: str
    subscription_status: str = "trial"
    subscription_plan: str = "standard_monthly"
    price: float = 19.99
    currency: str = "GBP"
    business_info: dict
    created_at: str
    trial_ends_at: Optional[str] = None
    next_billing_date: Optional[str] = None

class RestaurantCreate(BaseModel):
    name: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    postcode: str
    phone: str
    email: str
    website: Optional[str] = None
    vat_number: Optional[str] = None
    receipt_footer: Optional[str] = None
    subscription_price: float
    currency: str = "GBP"

class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    vat_number: Optional[str] = None
    receipt_footer: Optional[str] = None

class SyncData(BaseModel):
    orders: List[OrderCreate]

class ReportRequest(BaseModel):
    start_date: str
    end_date: str

# ===== PASSWORD & ADMIN MODELS =====
class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class PlatformAdminCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

# ===== PRINTER MODELS =====
class Printer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    type: str  # "bluetooth" or "wifi"
    address: str  # Bluetooth MAC address or IP:port
    restaurant_id: str
    is_default: bool = False
    paper_width: int = 80  # 58mm or 80mm
    created_at: str

class PrinterCreate(BaseModel):
    name: str
    type: str  # "bluetooth" or "wifi"
    address: str
    is_default: bool = False
    paper_width: int = 80

class PrinterUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    address: Optional[str] = None
    is_default: Optional[bool] = None
    paper_width: Optional[int] = None

class PrinterSendData(BaseModel):
    ip: str
    port: int = 9100
    data: str  # Base64 encoded data

# ===== TABLE MODELS =====
class Table(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    number: int
    name: str
    capacity: int
    status: str = "available"  # available, occupied, reserved
    restaurant_id: str
    current_order_id: Optional[str] = None
    merged_with: Optional[List[str]] = None  # List of table IDs merged with this one
    created_at: str

class TableCreate(BaseModel):
    number: int
    name: Optional[str] = None
    capacity: int = 4

class TableUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[str] = None

class TableMerge(BaseModel):
    table_ids: List[str]  # Tables to merge

class TableSplitBill(BaseModel):
    order_id: str
    splits: List[dict]  # Each split has items and payment info

# ===== RESERVATION MODELS =====
class Reservation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    table_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    party_size: int
    reservation_time: str
    duration_minutes: int = 120
    status: str = "confirmed"  # confirmed, seated, completed, cancelled, no_show
    notes: Optional[str] = None
    restaurant_id: str
    created_at: str

class ReservationCreate(BaseModel):
    table_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    party_size: int
    reservation_time: str
    duration_minutes: int = 120
    notes: Optional[str] = None

class ReservationUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    party_size: Optional[int] = None
    reservation_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None

# ===== RESTAURANT USER MODELS =====
class RestaurantUserCreate(BaseModel):
    username: str
    password: str
    role: str = "admin"  # admin or user
    restaurant_id: str

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        user = await db.users.find_one({"username": username}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        # Ensure restaurant_id is present (may be None for platform_owner)
        if "restaurant_id" not in user:
            user["restaurant_id"] = None
        return User(**user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_restaurant(current_user: User = Depends(get_current_user)):
    """Get the restaurant associated with the current user"""
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found for user")
    return Restaurant(**restaurant)

def require_admin(current_user: User = Depends(get_current_user)):
    """Require admin or platform_owner role"""
    if current_user.role not in ["admin", "platform_owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def require_platform_owner(current_user: User = Depends(get_current_user)):
    """Require platform_owner role only"""
    if current_user.role != "platform_owner":
        raise HTTPException(status_code=403, detail="Platform owner access required")
    return current_user

@api_router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user_id = f"user_{datetime.now(timezone.utc).timestamp()}"
    hashed_password = get_password_hash(user_data.password)
    user_dict = {
        "id": user_id,
        "username": user_data.username,
        "password": hashed_password,
        "role": user_data.role,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_dict)
    return User(id=user_id, username=user_data.username, role=user_data.role, created_at=user_dict["created_at"])

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"username": credentials.username})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Verify password (handle both field names for backward compat)
    stored_hash = user.get("password_hash") or user.get("password")
    if not stored_hash or not verify_password(credentials.password, stored_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(data={"sub": user["username"]})
    # Ensure restaurant_id is included
    restaurant_id = user.get("restaurant_id", None)
    user_obj = User(
        id=user["id"], 
        username=user["username"], 
        role=user["role"], 
        restaurant_id=restaurant_id,
        created_at=user["created_at"]
    )
    return Token(access_token=access_token, token_type="bearer", user=user_obj)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# ===== PASSWORD & PLATFORM ADMIN MANAGEMENT =====

@api_router.post("/auth/change-password")
async def change_password(password_data: PasswordChange, current_user: User = Depends(get_current_user)):
    """Change current user's password"""
    user = await db.users.find_one({"username": current_user.username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    stored_hash = user.get("password_hash") or user.get("password")
    if not stored_hash or not verify_password(password_data.current_password, stored_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    new_hashed = get_password_hash(password_data.new_password)
    await db.users.update_one(
        {"username": current_user.username},
        {"$set": {"password_hash": new_hashed, "password": new_hashed}}
    )
    
    return {"message": "Password changed successfully"}

@api_router.get("/platform/admins")
async def get_platform_admins(current_user: User = Depends(require_platform_owner)):
    """Get all platform administrators"""
    admins = await db.users.find(
        {"role": "platform_owner"},
        {"_id": 0, "password": 0}
    ).to_list(100)
    return admins

@api_router.post("/platform/admins")
async def create_platform_admin(admin_data: PlatformAdminCreate, current_user: User = Depends(require_platform_owner)):
    """Create a new platform administrator"""
    # Check username is unique
    existing = await db.users.find_one({"username": admin_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user_id = f"admin_{datetime.now(timezone.utc).timestamp()}"
    hashed_password = get_password_hash(admin_data.password)
    user_dict = {
        "id": user_id,
        "username": admin_data.username,
        "password": hashed_password,
        "role": "platform_owner",
        "email": admin_data.email,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_dict)
    
    return {
        "id": user_id,
        "username": admin_data.username,
        "role": "platform_owner",
        "email": admin_data.email,
        "created_at": user_dict["created_at"]
    }

@api_router.delete("/platform/admins/{admin_id}")
async def delete_platform_admin(admin_id: str, current_user: User = Depends(require_platform_owner)):
    """Delete a platform administrator (cannot delete yourself)"""
    # Find admin to delete
    admin = await db.users.find_one({"id": admin_id, "role": "platform_owner"})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Cannot delete yourself
    if admin["username"] == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    await db.users.delete_one({"id": admin_id})
    return {"message": "Admin deleted successfully"}

# ===== RESTAURANT USER MANAGEMENT =====

@api_router.post("/restaurants/{restaurant_id}/users", response_model=User)
async def create_restaurant_user(restaurant_id: str, user_data: RestaurantUserCreate, current_user: User = Depends(require_platform_owner)):
    """Platform Owner creates a user for a specific restaurant"""
    # Verify restaurant exists
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Check username is unique
    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Validate role
    if user_data.role not in ["admin", "user"]:
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    
    user_id = f"user_{datetime.now(timezone.utc).timestamp()}"
    hashed_password = get_password_hash(user_data.password)
    user_dict = {
        "id": user_id,
        "username": user_data.username,
        "password": hashed_password,
        "role": user_data.role,
        "restaurant_id": restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_dict)
    
    # Add user to restaurant's users list
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$push": {"users": user_data.username}}
    )
    
    return User(id=user_id, username=user_data.username, role=user_data.role, restaurant_id=restaurant_id, created_at=user_dict["created_at"])

@api_router.get("/restaurants/{restaurant_id}/users")
async def get_restaurant_users(restaurant_id: str, current_user: User = Depends(require_platform_owner)):
    """Get all users for a specific restaurant"""
    users = await db.users.find({"restaurant_id": restaurant_id}, {"_id": 0, "password": 0}).to_list(100)
    return users

@api_router.delete("/restaurants/{restaurant_id}/users/{user_id}")
async def delete_restaurant_user(restaurant_id: str, user_id: str, current_user: User = Depends(require_platform_owner)):
    """Delete a user from a restaurant"""
    user = await db.users.find_one({"id": user_id, "restaurant_id": restaurant_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.delete_one({"id": user_id})
    
    # Remove from restaurant's users list
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$pull": {"users": user["username"]}}
    )
    
    return {"message": "User deleted"}

@api_router.post("/restaurants", response_model=Restaurant)
async def create_restaurant(restaurant_data: RestaurantCreate, current_user: User = Depends(require_platform_owner)):
    """Platform Owner creates a new restaurant/tenant with custom pricing"""
    restaurant_id = f"rest_{datetime.now(timezone.utc).timestamp()}"
    
    # Calculate trial end date (14 days from now)
    trial_ends = datetime.now(timezone.utc) + timedelta(days=14)
    
    restaurant_dict = {
        "id": restaurant_id,
        "owner_email": restaurant_data.email,
        "subscription_status": "trial",
        "subscription_plan": "standard_monthly",
        "price": restaurant_data.subscription_price,
        "currency": restaurant_data.currency,
        "business_info": {k: v for k, v in restaurant_data.model_dump().items() 
                         if k not in ['subscription_price', 'currency']},
        "users": [],  # Will be populated when users are added
        "created_at": datetime.now(timezone.utc).isoformat(),
        "trial_ends_at": trial_ends.isoformat(),
        "next_billing_date": trial_ends.isoformat()
    }
    
    await db.restaurants.insert_one(restaurant_dict)
    return Restaurant(**restaurant_dict)

@api_router.put("/restaurants/{restaurant_id}")
async def update_restaurant(restaurant_id: str, restaurant_data: RestaurantCreate, current_user: User = Depends(require_platform_owner)):
    """Platform Owner updates a restaurant's details"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Update business info and pricing
    update_data = {
        "owner_email": restaurant_data.email,
        "price": restaurant_data.subscription_price,
        "currency": restaurant_data.currency,
        "business_info": {k: v for k, v in restaurant_data.model_dump().items() 
                         if k not in ['subscription_price', 'currency']}
    }
    
    await db.restaurants.update_one({"id": restaurant_id}, {"$set": update_data})
    
    updated = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    return Restaurant(**updated)

@api_router.delete("/restaurants/{restaurant_id}")
async def delete_restaurant(restaurant_id: str, current_user: User = Depends(require_platform_owner)):
    """Platform Owner deletes a restaurant and all its data"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Delete all related data
    await db.users.delete_many({"restaurant_id": restaurant_id})
    await db.orders.delete_many({"restaurant_id": restaurant_id})
    await db.tables.delete_many({"restaurant_id": restaurant_id})
    await db.printers.delete_many({"restaurant_id": restaurant_id})
    await db.restaurants.delete_one({"id": restaurant_id})
    
    return {"message": "Restaurant and all related data deleted"}

@api_router.get("/restaurants/my", response_model=Restaurant)
async def get_my_restaurant(current_user: User = Depends(get_current_user)):
    """Get current user's restaurant"""
    # First try to find by users array
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    
    # If not found and user has restaurant_id, find by id
    if not restaurant and current_user.restaurant_id:
        restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="No restaurant found for this user")
    return Restaurant(**restaurant)

@api_router.put("/restaurants/my/settings")
async def update_restaurant_settings(settings: RestaurantUpdate, current_user: User = Depends(get_current_user)):
    """Update restaurant business information"""
    # First try to find by users array
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    
    # If not found and user has restaurant_id, find by id
    if not restaurant and current_user.restaurant_id:
        restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="No restaurant found")
    
    # Update only provided fields
    update_data = {k: v for k, v in settings.model_dump().items() if v is not None}
    
    if update_data:
        await db.restaurants.update_one(
            {"id": restaurant["id"]},
            {"$set": {f"business_info.{k}": v for k, v in update_data.items()}}
        )
    
    updated = await db.restaurants.find_one({"id": restaurant["id"]}, {"_id": 0})
    return {"message": "Settings updated successfully", "business_info": updated["business_info"]}

@api_router.get("/restaurants")
async def list_restaurants(current_user: User = Depends(require_platform_owner)):
    """Platform Owner: List all restaurants"""
    restaurants = await db.restaurants.find({}, {"_id": 0}).to_list(1000)
    return restaurants


@api_router.post("/categories", response_model=Category)
async def create_category(category_data: CategoryCreate, current_user: User = Depends(require_admin)):
    category_id = f"cat_{datetime.now(timezone.utc).timestamp()}"
    category_dict = {
        "id": category_id,
        "name": category_data.name,
        "description": category_data.description,
        "image_url": category_data.image_url,
        "restaurant_id": current_user.restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(category_dict)
    return Category(**category_dict)

@api_router.get("/categories", response_model=List[Category])
async def get_categories(current_user: User = Depends(get_current_user)):
    # Filter by restaurant_id for restaurant admins/users
    query = {}
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["$or"] = [
            {"restaurant_id": current_user.restaurant_id},
            {"restaurant_id": None},  # Include global categories
            {"restaurant_id": {"$exists": False}}  # Include old categories without restaurant_id
        ]
    
    categories = await db.categories.find(query, {"_id": 0}).to_list(1000)
    return [Category(**cat) for cat in categories]

@api_router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, category_data: CategoryCreate, current_user: User = Depends(require_admin)):
    result = await db.categories.update_one(
        {"id": category_id},
        {"$set": {**category_data.model_dump(), "restaurant_id": current_user.restaurant_id}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return Category(**updated)

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: User = Depends(require_admin)):
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.products.delete_many({"category_id": category_id})
    return {"message": "Category deleted"}

@api_router.post("/products", response_model=Product)
async def create_product(product_data: ProductCreate, current_user: User = Depends(require_admin)):
    category = await db.categories.find_one({"id": product_data.category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    product_id = f"prod_{datetime.now(timezone.utc).timestamp()}"
    product_dict = {
        "id": product_id,
        "name": product_data.name,
        "category_id": product_data.category_id,
        "category_name": category["name"],
        "price": product_data.price,
        "image_url": product_data.image_url,
        "in_stock": product_data.in_stock,
        "restaurant_id": current_user.restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product_dict)
    return Product(**product_dict)

@api_router.get("/products", response_model=List[Product])
async def get_products(
    category_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Build query with restaurant filtering
    query = {}
    
    # Filter by restaurant_id (only for restaurant admins/users)
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["$or"] = [
            {"restaurant_id": current_user.restaurant_id},
            {"restaurant_id": None},  # Include global products
            {"restaurant_id": {"$exists": False}}  # Include old products without restaurant_id
        ]
    
    # Additional category filter
    if category_id:
        query["category_id"] = category_id
    
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    return [Product(**prod) for prod in products]

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product_data: ProductCreate, current_user: User = Depends(require_admin)):
    category = await db.categories.find_one({"id": product_data.category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_dict = product_data.model_dump()
    update_dict["category_name"] = category["name"]
    update_dict["restaurant_id"] = current_user.restaurant_id
    
    result = await db.products.update_one(
        {"id": product_id},
        {"$set": update_dict}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    return Product(**updated)

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: User = Depends(require_admin)):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

@api_router.post("/orders", response_model=Order)
async def create_order(order_data: OrderCreate, current_user: User = Depends(get_current_user)):
    # Get today's date for order number sequencing
    today = datetime.now(timezone.utc).date().isoformat()
    
    # Get the last order number for today
    last_order = await db.orders.find_one(
        {"created_at": {"$gte": f"{today}T00:00:00"}},
        {"_id": 0, "order_number": 1},
        sort=[("order_number", -1)]
    )
    
    # Generate sequential order number
    if last_order and "order_number" in last_order:
        # Handle both string and int order_number from database
        last_num = last_order["order_number"]
        if isinstance(last_num, str):
            last_num = int(last_num) if last_num.isdigit() else 0
        order_number = last_num + 1
    else:
        order_number = 1
    
    # Calculate discount
    subtotal = order_data.total_amount
    discount_amount = 0.0
    if order_data.discount_type and order_data.discount_value > 0:
        if order_data.discount_type == "percentage":
            discount_amount = subtotal * (order_data.discount_value / 100)
        elif order_data.discount_type == "fixed":
            discount_amount = min(order_data.discount_value, subtotal)  # Can't discount more than total
    
    total_after_discount = subtotal - discount_amount
    
    order_id = f"order_{datetime.now(timezone.utc).timestamp()}"
    order_dict = {
        "id": order_id,
        "order_number": order_number,
        "items": [item.model_dump() for item in order_data.items],
        "subtotal": subtotal,
        "discount_type": order_data.discount_type,
        "discount_value": order_data.discount_value,
        "discount_amount": round(discount_amount, 2),
        "discount_reason": order_data.discount_reason,
        "tip_amount": 0.0,
        "tip_percentage": 0,
        "total_amount": round(total_after_discount, 2),
        "created_by": current_user.username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "synced": True,
        "status": "pending",
        "payment_method": None,
        "payment_details": None,
        "split_count": 1,
        "completed_at": None,
        "table_id": order_data.table_id,
        "order_notes": order_data.order_notes
    }
    await db.orders.insert_one(order_dict)
    
    # If table_id is provided, update table status
    if order_data.table_id:
        await db.tables.update_one(
            {"id": order_data.table_id},
            {"$set": {"status": "occupied", "current_order_id": order_id}}
        )
    
    return Order(**order_dict)

@api_router.put("/orders/{order_id}", response_model=Order)
async def update_order(order_id: str, order_data: OrderCreate, current_user: User = Depends(get_current_user)):
    """Update a pending order (add/remove items, update notes, etc.)"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order["status"] == "completed":
        raise HTTPException(status_code=400, detail="Cannot edit a completed order")
    
    # Calculate subtotal and discount
    subtotal = sum(item.total for item in order_data.items)
    discount_amount = 0
    if order_data.discount_type and order_data.discount_value:
        if order_data.discount_type == "percentage":
            discount_amount = subtotal * (order_data.discount_value / 100)
        else:  # fixed
            discount_amount = min(order_data.discount_value, subtotal)
    
    total_after_discount = subtotal - discount_amount
    
    # Update order
    update_dict = {
        "items": [item.model_dump() for item in order_data.items],
        "subtotal": round(subtotal, 2),
        "total_amount": round(total_after_discount, 2),
        "order_notes": order_data.order_notes,
        "discount_type": order_data.discount_type,
        "discount_value": order_data.discount_value,
        "discount_reason": order_data.discount_reason,
        "discount_amount": round(discount_amount, 2),
        "table_id": order_data.table_id,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_dict})
    
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return Order(**updated)

@api_router.put("/orders/{order_id}/complete", response_model=Order)
async def complete_order(order_id: str, complete_data: OrderComplete, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order["status"] == "completed":
        raise HTTPException(status_code=400, detail="Order already completed")
    
    # Calculate new total with tip (after discount already applied)
    subtotal = order.get("subtotal", 0)
    discount_amount = order.get("discount_amount", 0)
    total_after_discount = subtotal - discount_amount
    tip_amount = complete_data.tip_amount
    new_total = total_after_discount + tip_amount
    
    # Validate split payment if payment_method is "split"
    if complete_data.payment_method == "split":
        if not complete_data.payment_details:
            raise HTTPException(status_code=400, detail="Payment details required for split payment")
        cash_amount = complete_data.payment_details.get("cash", 0)
        card_amount = complete_data.payment_details.get("card", 0)
        total_paid = cash_amount + card_amount
        # Allow small rounding differences
        if abs(total_paid - new_total) > 0.02:
            raise HTTPException(status_code=400, detail=f"Split amounts ({total_paid:.2f}) don't match total ({new_total:.2f})")
    
    result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "completed",
            "payment_method": complete_data.payment_method,
            "payment_details": complete_data.payment_details,
            "tip_amount": tip_amount,
            "tip_percentage": complete_data.tip_percentage,
            "total_amount": round(new_total, 2),
            "split_count": complete_data.split_count,
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return Order(**updated)

class CancelOrderRequest(BaseModel):
    reason: str

@api_router.put("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, cancel_data: CancelOrderRequest, current_user: User = Depends(get_current_user)):
    """Cancel a pending order with mandatory reason"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] == "completed":
        raise HTTPException(status_code=400, detail="Cannot cancel a completed order")
    if order["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="Order already cancelled")
    if order.get("table_id"):
        await db.tables.update_one({"id": order["table_id"]}, {"$set": {"status": "available", "current_order_id": None}})
    await db.orders.update_one({"id": order_id}, {"$set": {
        "status": "cancelled", "cancel_reason": cancel_data.reason,
        "cancelled_at": datetime.now(timezone.utc).isoformat(), "cancelled_by": current_user.username
    }})
    return {"message": "Order cancelled", "order_id": order_id}

@api_router.get("/orders/pending", response_model=List[Order])
async def get_pending_orders(current_user: User = Depends(get_current_user)):
    query = {"status": "pending"}
    if current_user.role != "admin":
        query["created_by"] = current_user.username
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Order(**order) for order in orders]

@api_router.get("/orders", response_model=List[Order])
async def get_orders(current_user: User = Depends(get_current_user), from_date: str = None, to_date: str = None, today_only: bool = False):
    query = {} if current_user.role == "admin" else {"created_by": current_user.username}
    
    if today_only:
        now = datetime.now(timezone.utc)
        if now.hour < 2:
            biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
        else:
            biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)
        biz_end = biz_start + timedelta(days=1)
        query["created_at"] = {"$gte": biz_start.isoformat(), "$lt": biz_end.isoformat()}
    elif from_date and to_date:
        end_dt = datetime.fromisoformat(to_date) + timedelta(days=1)
        query["created_at"] = {"$gte": from_date + "T00:00:00", "$lt": end_dt.isoformat()}
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Order(**order) for order in orders]

@api_router.post("/sync")
async def sync_offline_data(sync_data: SyncData, current_user: User = Depends(get_current_user)):
    synced_count = 0
    for order_data in sync_data.orders:
        order_id = f"order_{datetime.now(timezone.utc).timestamp()}_{synced_count}"
        order_dict = {
            "id": order_id,
            "items": [item.model_dump() for item in order_data.items],
            "total_amount": order_data.total_amount,
            "created_by": current_user.username,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "synced": True,
            "status": "pending",
            "payment_method": None,
            "completed_at": None
        }
        await db.orders.insert_one(order_dict)
        synced_count += 1
    return {"message": f"Synced {synced_count} orders"}

@api_router.post("/reports/generate")
async def generate_report(report_req: ReportRequest, current_user: User = Depends(require_admin)):
    start_dt = datetime.fromisoformat(report_req.start_date)
    end_dt = datetime.fromisoformat(report_req.end_date)
    
    orders = await db.orders.find(
        {"created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}},
        {"_id": 0}
    ).to_list(10000)
    
    total_sales = sum(order.get("total_amount", 0) for order in orders)
    total_orders = len(orders)
    
    product_sales = {}
    for order in orders:
        for item in order.get("items", []):
            pname = item.get("product_name", "Unknown")
            if pname not in product_sales:
                product_sales[pname] = {"quantity": 0, "revenue": 0}
            product_sales[pname]["quantity"] += item.get("quantity", 0)
            product_sales[pname]["revenue"] += item.get("total", 0)
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=30,
        alignment=1
    )
    
    story.append(Paragraph("Sales Report", title_style))
    story.append(Paragraph(f"Period: {report_req.start_date} to {report_req.end_date}", styles['Normal']))
    story.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Spacer(1, 20))
    
    story.append(Paragraph(f"<b>Total Sales:</b> ${total_sales:.2f}", styles['Normal']))
    story.append(Paragraph(f"<b>Total Orders:</b> {total_orders}", styles['Normal']))
    story.append(Spacer(1, 20))
    
    if product_sales:
        story.append(Paragraph("Product Sales Breakdown", styles['Heading2']))
        table_data = [["Product", "Quantity Sold", "Revenue"]]
        for product, data in product_sales.items():
            table_data.append([product, str(data["quantity"]), f"${data['revenue']:.2f}"])
        
        table = ReportLabTable(table_data, colWidths=[200, 100, 100])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey)
        ]))
        story.append(table)
    
    doc.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=sales_report_{datetime.now().strftime('%Y%m%d')}.pdf"}
    )

@api_router.post("/orders/{order_id}/print-kitchen-receipt")
async def print_kitchen_receipt(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get restaurant info
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    business_info = restaurant.get("business_info", {}) if restaurant else {}
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle(
        'KitchenTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=20,
        alignment=1
    )
    
    story.append(Paragraph("KITCHEN ORDER", title_style))
    story.append(Spacer(1, 10))
    
    # Add restaurant info
    if business_info.get('name'):
        story.append(Paragraph(f"<b>{business_info['name']}</b>", styles['Normal']))
    if business_info.get('address_line1'):
        address_parts = [business_info['address_line1']]
        if business_info.get('city'):
            address_parts.append(business_info['city'])
        story.append(Paragraph(", ".join(address_parts), styles['Normal']))
    if business_info.get('phone'):
        story.append(Paragraph(f"Tel: {business_info['phone']}", styles['Normal']))
    
    story.append(Spacer(1, 15))
    story.append(Paragraph(f"Order #: {str(order['order_number']).zfill(3)}", styles['Heading2']))
    story.append(Paragraph(f"Server: {order['created_by']}", styles['Normal']))
    story.append(Paragraph(f"Time: {datetime.fromisoformat(order['created_at']).strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Spacer(1, 20))
    
    story.append(Paragraph("ITEMS:", styles['Heading2']))
    story.append(Spacer(1, 10))
    
    table_data = [["Item", "Qty"]]
    for item in order['items']:
        table_data.append([item['product_name'], str(item['quantity'])])
    
    table = ReportLabTable(table_data, colWidths=[300, 100])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 14),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('FONTSIZE', (0, 1), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey)
    ]))
    story.append(table)
    
    doc.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=kitchen_receipt_{order['id'][:8]}.pdf"}
    )

@api_router.post("/orders/{order_id}/print-customer-receipt")
async def print_customer_receipt(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order["status"] != "completed":
        raise HTTPException(status_code=400, detail="Order must be completed first")
    
    # Get restaurant info
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    business_info = restaurant.get("business_info", {}) if restaurant else {}
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []
    
    # Customer Receipt Title (without HevaPOS branding)
    title_style = ParagraphStyle(
        'ReceiptTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=15,
        alignment=1
    )
    
    story.append(Paragraph("CUSTOMER RECEIPT", title_style))
    story.append(Spacer(1, 10))
    
    # Restaurant business info (prominently at top)
    restaurant_name_style = ParagraphStyle(
        'RestaurantName',
        parent=styles['Heading2'],
        fontSize=20,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=5,
        alignment=1
    )
    
    if business_info.get('name'):
        story.append(Paragraph(f"<b>{business_info['name']}</b>", restaurant_name_style))
    if business_info.get('address_line1'):
        story.append(Paragraph(business_info['address_line1'], styles['Normal']))
    if business_info.get('address_line2'):
        story.append(Paragraph(business_info['address_line2'], styles['Normal']))
    if business_info.get('city') and business_info.get('postcode'):
        story.append(Paragraph(f"{business_info['city']} {business_info['postcode']}", styles['Normal']))
    if business_info.get('phone'):
        story.append(Paragraph(f"Tel: {business_info['phone']}", styles['Normal']))
    if business_info.get('email'):
        story.append(Paragraph(f"Email: {business_info['email']}", styles['Normal']))
    if business_info.get('vat_number'):
        story.append(Paragraph(f"VAT No: {business_info['vat_number']}", styles['Normal']))
    
    story.append(Spacer(1, 15))
    story.append(Paragraph(f"Order #: {str(order['order_number']).zfill(3)}", styles['Normal']))
    story.append(Paragraph(f"Server: {order['created_by']}", styles['Normal']))
    story.append(Paragraph(f"Date: {datetime.fromisoformat(order['created_at']).strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Paragraph(f"Payment: {order['payment_method'].upper()}", styles['Normal']))
    story.append(Spacer(1, 20))
    
    table_data = [["Item", "Qty", "Price", "Total"]]
    for item in order['items']:
        table_data.append([
            item['product_name'],
            str(item['quantity']),
            f"${item['unit_price']:.2f}",
            f"${item['total']:.2f}"
        ])
    
    table_data.append(["", "", "", ""])
    table_data.append(["", "", "Subtotal:", f"{order.get('subtotal', 0):.2f}"])
    
    if order.get('tip_amount', 0) > 0:
        tip_label = f"Tip ({order.get('tip_percentage', 0)}%)"
        table_data.append(["", "", tip_label, f"{order.get('tip_amount', 0):.2f}"])
    
    table_data.append(["", "", "TOTAL:", f"{order.get('total_amount', 0):.2f}"])
    
    table = ReportLabTable(table_data, colWidths=[200, 80, 80, 100])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('FONTSIZE', (0, 1), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -2), 1, colors.grey),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 14),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#10B981'))
    ]))
    story.append(table)
    story.append(Spacer(1, 20))
    
    # Custom footer message if provided
    if business_info.get('receipt_footer'):
        story.append(Paragraph(business_info['receipt_footer'], styles['Normal']))
    else:
        story.append(Paragraph("Thank you for your visit!", styles['Normal']))
    
    # Website if provided
    if business_info.get('website'):
        story.append(Paragraph(f"Visit us at: {business_info['website']}", styles['Normal']))
    
    story.append(Spacer(1, 20))
    
    # Powered by HevaPOS footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.grey,
        alignment=1
    )
    story.append(Paragraph("Powered by HevaPOS", footer_style))
    story.append(Paragraph("www.hevapos.com", footer_style))
    
    doc.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=customer_receipt_{order['id'][:8]}.pdf"}
    )

@api_router.post("/cash-drawer/open", response_model=CashDrawer)
async def open_cash_drawer(drawer_data: CashDrawerOpen, current_user: User = Depends(require_admin)):
    # Check if there's already an open drawer for today
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.cash_drawers.find_one({"date": today, "status": "open"}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Cash drawer already open for today")
    
    drawer_id = f"drawer_{datetime.now(timezone.utc).timestamp()}"
    drawer_dict = {
        "id": drawer_id,
        "date": today,
        "opening_balance": drawer_data.opening_balance,
        "expected_cash": drawer_data.opening_balance,
        "actual_cash": 0.0,
        "difference": 0.0,
        "notes": None,
        "opened_by": current_user.username,
        "closed_by": None,
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "closed_at": None,
        "status": "open"
    }
    await db.cash_drawers.insert_one(drawer_dict)
    return CashDrawer(**drawer_dict)

@api_router.get("/cash-drawer/current", response_model=CashDrawer)
async def get_current_cash_drawer(current_user: User = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    drawer = await db.cash_drawers.find_one({"date": today, "status": "open"}, {"_id": 0})
    if not drawer:
        raise HTTPException(status_code=404, detail="No open cash drawer for today")
    
    # Calculate expected cash from cash orders
    cash_orders = await db.orders.find(
        {
            "status": "completed",
            "payment_method": "cash",
            "created_at": {"$gte": drawer["opened_at"]}
        },
        {"_id": 0}
    ).to_list(10000)
    
    total_cash_sales = sum(order.get("total_amount", 0) for order in cash_orders)
    drawer["expected_cash"] = drawer["opening_balance"] + total_cash_sales
    
    return CashDrawer(**drawer)

@api_router.put("/cash-drawer/close", response_model=CashDrawer)
async def close_cash_drawer(close_data: CashDrawerClose, current_user: User = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    drawer = await db.cash_drawers.find_one({"date": today, "status": "open"}, {"_id": 0})
    if not drawer:
        raise HTTPException(status_code=404, detail="No open cash drawer to close")
    
    # Calculate expected cash
    cash_orders = await db.orders.find(
        {
            "status": "completed",
            "payment_method": "cash",
            "created_at": {"$gte": drawer["opened_at"]}
        },
        {"_id": 0}
    ).to_list(10000)
    
    total_cash_sales = sum(order.get("total_amount", 0) for order in cash_orders)
    expected_cash = drawer["opening_balance"] + total_cash_sales
    difference = close_data.actual_cash - expected_cash
    
    result = await db.cash_drawers.update_one(
        {"id": drawer["id"]},
        {"$set": {
            "actual_cash": close_data.actual_cash,
            "expected_cash": expected_cash,
            "difference": difference,
            "notes": close_data.notes,
            "closed_by": current_user.username,
            "closed_at": datetime.now(timezone.utc).isoformat(),
            "status": "closed"
        }}
    )
    
    updated = await db.cash_drawers.find_one({"id": drawer["id"]}, {"_id": 0})
    return CashDrawer(**updated)

@api_router.get("/cash-drawer/history")
async def get_cash_drawer_history(current_user: User = Depends(require_admin)):
    drawers = await db.cash_drawers.find({}, {"_id": 0}).sort("date", -1).limit(30).to_list(100)
    return drawers

@api_router.get("/reports/stats")
async def get_report_stats(start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    # Parse dates and make end_date inclusive of the whole day
    start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00') if 'Z' in start_date else start_date)
    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00') if 'Z' in end_date else end_date)
    
    # Make end date inclusive (end of day)
    end_dt_str = (end_dt + timedelta(days=1)).isoformat()
    start_dt_str = start_dt.isoformat()
    
    orders = await db.orders.find(
        {
            "created_at": {"$gte": start_dt_str, "$lt": end_dt_str},
            "status": "completed"  # Only count completed orders
        },
        {"_id": 0}
    ).to_list(10000)
    
    total_sales = sum(order.get("total_amount", 0) for order in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0
    
    cash_total = 0
    card_total = 0
    for o in orders:
        pm = o.get("payment_method", "cash")
        amt = o.get("total_amount", 0)
        if pm == "card":
            card_total += amt
        elif pm == "split":
            pd = o.get("payment_details") or {}
            cash_total += pd.get("cash", 0)
            card_total += pd.get("card", 0)
        else:
            cash_total += amt
    
    product_sales = {}
    for order in orders:
        for item in order.get("items", []):
            if item.get("product_name") and item["product_name"] not in product_sales:
                product_sales[item["product_name"]] = {"quantity": 0, "revenue": 0}
            if item.get("product_name"):
                product_sales[item["product_name"]]["quantity"] += item.get("quantity", 0)
                product_sales[item["product_name"]]["revenue"] += item.get("total", 0)
    
    top_products = sorted(product_sales.items(), key=lambda x: x[1]["revenue"], reverse=True)[:5]
    
    return {
        "total_sales": round(total_sales, 2),
        "total_orders": total_orders,
        "avg_order_value": round(avg_order_value, 2),
        "cash_total": round(cash_total, 2),
        "card_total": round(card_total, 2),
        "top_products": [{"name": name, "quantity": data["quantity"], "revenue": round(data["revenue"], 2)} for name, data in top_products]
    }

@api_router.get("/reports/today")
async def get_today_stats(current_user: User = Depends(require_admin)):
    """Get today's sales stats using business day (resets at 2AM)"""
    now = datetime.now(timezone.utc)
    # Business day starts at 2AM today (or 2AM yesterday if before 2AM now)
    if now.hour < 2:
        biz_start = (now - timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    else:
        biz_start = now.replace(hour=2, minute=0, second=0, microsecond=0)
    biz_end = biz_start + timedelta(days=1)
    
    orders = await db.orders.find(
        {"created_at": {"$gte": biz_start.isoformat(), "$lt": biz_end.isoformat()}, "status": "completed"},
        {"_id": 0}
    ).to_list(1000)
    
    total_sales = sum(o.get("total_amount", 0) for o in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0
    
    # Cash vs Card breakdown
    cash_total = 0
    card_total = 0
    for o in orders:
        pm = o.get("payment_method", "cash")
        amt = o.get("total_amount", 0)
        if pm == "card":
            card_total += amt
        elif pm == "split":
            pd = o.get("payment_details") or {}
            cash_total += pd.get("cash", 0)
            card_total += pd.get("card", 0)
        else:
            cash_total += amt
    
    product_sales = {}
    for order in orders:
        for item in order.get("items", []):
            name = item.get("product_name", "Unknown")
            if name not in product_sales:
                product_sales[name] = {"quantity": 0, "revenue": 0}
            product_sales[name]["quantity"] += item.get("quantity", 0)
            product_sales[name]["revenue"] += item.get("total", 0)
    
    top_products = sorted(product_sales.items(), key=lambda x: x[1]["quantity"], reverse=True)[:5]
    
    return {
        "total_sales": round(total_sales, 2),
        "total_orders": total_orders,
        "avg_order_value": round(avg_order_value, 2),
        "cash_total": round(cash_total, 2),
        "card_total": round(card_total, 2),
        "top_products": [{"name": n, "quantity": d["quantity"], "revenue": round(d["revenue"], 2)} for n, d in top_products],
        "date": biz_start.date().isoformat(),
        "business_day_start": biz_start.isoformat(),
    }

# ===== PRINTER API ENDPOINTS =====

@api_router.get("/printers", response_model=List[Printer])
async def get_printers(current_user: User = Depends(require_admin)):
    """Get all printers for the restaurant"""
    query = {}
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id
    printers = await db.printers.find(query, {"_id": 0}).to_list(100)
    return [Printer(**p) for p in printers]

@api_router.post("/printers", response_model=Printer)
async def create_printer(printer_data: PrinterCreate, current_user: User = Depends(require_admin)):
    """Add a new printer"""
    if not current_user.restaurant_id and current_user.role != 'platform_owner':
        raise HTTPException(status_code=400, detail="No restaurant associated with user")
    
    restaurant_id = current_user.restaurant_id or "platform"
    printer_id = f"printer_{datetime.now(timezone.utc).timestamp()}"
    
    # If this is set as default, unset other defaults
    if printer_data.is_default:
        await db.printers.update_many(
            {"restaurant_id": restaurant_id},
            {"$set": {"is_default": False}}
        )
    
    printer_dict = {
        "id": printer_id,
        "name": printer_data.name,
        "type": printer_data.type,
        "address": printer_data.address,
        "restaurant_id": restaurant_id,
        "is_default": printer_data.is_default,
        "paper_width": printer_data.paper_width,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.printers.insert_one(printer_dict)
    return Printer(**printer_dict)

@api_router.put("/printers/{printer_id}", response_model=Printer)
async def update_printer(printer_id: str, printer_data: PrinterUpdate, current_user: User = Depends(require_admin)):
    """Update a printer"""
    update_dict = {k: v for k, v in printer_data.model_dump().items() if v is not None}
    
    if printer_data.is_default:
        restaurant_id = current_user.restaurant_id or "platform"
        await db.printers.update_many(
            {"restaurant_id": restaurant_id, "id": {"$ne": printer_id}},
            {"$set": {"is_default": False}}
        )
    
    if update_dict:
        await db.printers.update_one({"id": printer_id}, {"$set": update_dict})
    
    updated = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Printer not found")
    return Printer(**updated)

@api_router.delete("/printers/{printer_id}")
async def delete_printer(printer_id: str, current_user: User = Depends(require_admin)):
    """Delete a printer"""
    result = await db.printers.delete_one({"id": printer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Printer not found")
    return {"message": "Printer deleted"}

@api_router.post("/printers/{printer_id}/test")
async def test_printer(printer_id: str, current_user: User = Depends(require_admin)):
    """Test printer connection and print a test receipt"""
    printer = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    
    # Generate ESC/POS test receipt commands
    test_commands = generate_escpos_test_receipt(printer)
    
    return {
        "message": "Test receipt generated",
        "printer": printer["name"],
        "type": printer["type"],
        "address": printer["address"],
        "commands": test_commands,  # Base64 encoded ESC/POS commands
        "instructions": "Send these commands to the printer via Bluetooth or TCP socket"
    }

@api_router.post("/printer/send")
async def send_to_wifi_printer(data: PrinterSendData, current_user: User = Depends(get_current_user)):
    """Send raw data to a WiFi/network printer"""
    try:
        # Decode base64 data
        raw_data = base64.b64decode(data.data)
        
        # Create socket and connect to printer
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)  # 5 second timeout
        
        try:
            sock.connect((data.ip, data.port))
            sock.sendall(raw_data)
            sock.close()
            return {"success": True, "message": f"Data sent to {data.ip}:{data.port}"}
        except socket.timeout:
            raise HTTPException(status_code=408, detail=f"Connection timeout to {data.ip}:{data.port}")
        except ConnectionRefusedError:
            raise HTTPException(status_code=503, detail=f"Connection refused by {data.ip}:{data.port}. Check if printer is on and IP is correct.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Socket error: {str(e)}")
        finally:
            sock.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to send to printer: {str(e)}")

@api_router.post("/print/kitchen/{order_id}")
async def print_kitchen_receipt_escpos(order_id: str, printer_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Generate ESC/POS commands for kitchen receipt"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get restaurant info
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    business_info = restaurant.get("business_info", {}) if restaurant else {}
    
    # Get table info if assigned
    table_info = None
    if order.get("table_id"):
        table = await db.tables.find_one({"id": order["table_id"]}, {"_id": 0})
        if table:
            table_info = {"number": table["number"], "name": table.get("name", f"Table {table['number']}")}
    
    # Generate ESC/POS commands
    commands = generate_escpos_kitchen_receipt(order, business_info, table_info)
    
    return {
        "order_id": order_id,
        "order_number": order.get("order_number", "N/A"),
        "commands": commands,
        "table": table_info
    }

@api_router.post("/print/customer/{order_id}")
async def print_customer_receipt_escpos(order_id: str, printer_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Generate ESC/POS commands for customer receipt"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order["status"] != "completed":
        raise HTTPException(status_code=400, detail="Order must be completed first")
    
    # Get restaurant info
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    business_info = restaurant.get("business_info", {}) if restaurant else {}
    
    # Get table info if assigned
    table_info = None
    if order.get("table_id"):
        table = await db.tables.find_one({"id": order["table_id"]}, {"_id": 0})
        if table:
            table_info = {"number": table["number"], "name": table.get("name", f"Table {table['number']}")}
    
    # Generate ESC/POS commands
    commands = generate_escpos_customer_receipt(order, business_info, table_info)
    
    return {
        "order_id": order_id,
        "order_number": order.get("order_number", "N/A"),
        "commands": commands,
        "table": table_info
    }

# ESC/POS Helper Functions

def generate_escpos_test_receipt(printer: dict) -> str:
    """Generate ESC/POS commands for a test receipt"""
    width = printer.get("paper_width", 80)
    char_width = 48 if width == 80 else 32
    
    commands = bytearray()
    
    # Initialize printer
    commands.extend([0x1B, 0x40])  # ESC @
    
    # Center align
    commands.extend([0x1B, 0x61, 0x01])  # ESC a 1
    
    # Bold on
    commands.extend([0x1B, 0x45, 0x01])  # ESC E 1
    
    # Double height/width
    commands.extend([0x1D, 0x21, 0x11])  # GS ! 17
    
    commands.extend(b"PRINTER TEST\n")
    
    # Normal size
    commands.extend([0x1D, 0x21, 0x00])  # GS ! 0
    
    # Bold off
    commands.extend([0x1B, 0x45, 0x00])  # ESC E 0
    
    commands.extend(f"{printer['name']}\n".encode())
    commands.extend(f"Type: {printer['type'].upper()}\n".encode())
    commands.extend(f"Address: {printer['address']}\n".encode())
    commands.extend(b"\n")
    
    # Left align
    commands.extend([0x1B, 0x61, 0x00])  # ESC a 0
    
    commands.extend(("-" * char_width + "\n").encode())
    commands.extend(b"1234567890" * (char_width // 10) + b"\n")
    commands.extend(b"ABCDEFGHIJ" * (char_width // 10) + b"\n")
    commands.extend(("-" * char_width + "\n").encode())
    
    # Center align
    commands.extend([0x1B, 0x61, 0x01])
    commands.extend(b"\nTest Successful!\n")
    commands.extend(f"Paper Width: {width}mm\n".encode())
    
    # Feed and cut
    commands.extend([0x1B, 0x64, 0x05])  # ESC d 5 - feed 5 lines
    commands.extend([0x1D, 0x56, 0x00])  # GS V 0 - full cut
    
    return base64.b64encode(commands).decode()

def generate_escpos_kitchen_receipt(order: dict, business_info: dict, table_info: dict = None) -> str:
    """Generate ESC/POS commands for kitchen receipt"""
    commands = bytearray()
    
    # Initialize printer
    commands.extend([0x1B, 0x40])  # ESC @
    
    # Center align
    commands.extend([0x1B, 0x61, 0x01])
    
    # Bold + Double size
    commands.extend([0x1B, 0x45, 0x01])
    commands.extend([0x1D, 0x21, 0x11])
    
    commands.extend(b"** KITCHEN **\n")
    
    # Normal size
    commands.extend([0x1D, 0x21, 0x00])
    
    if business_info.get('name'):
        commands.extend(f"{business_info['name']}\n".encode())
    
    commands.extend(b"\n")
    
    # Double size for order number
    commands.extend([0x1D, 0x21, 0x11])
    commands.extend(f"Order #{str(order.get('order_number', 'N/A')).zfill(3)}\n".encode())
    
    # Normal size
    commands.extend([0x1D, 0x21, 0x00])
    
    if table_info:
        commands.extend([0x1D, 0x21, 0x01])  # Double width
        commands.extend(f"TABLE {table_info['number']}\n".encode())
        commands.extend([0x1D, 0x21, 0x00])
    
    commands.extend(b"\n")
    
    # Left align for items
    commands.extend([0x1B, 0x61, 0x00])
    
    # Bold off
    commands.extend([0x1B, 0x45, 0x00])
    
    commands.extend(f"Server: {order.get('created_by', 'N/A')}\n".encode())
    commands.extend(f"Time: {order.get('created_at', '')[:19].replace('T', ' ')}\n".encode())
    commands.extend(b"=" * 40 + b"\n")
    
    # Bold on for items
    commands.extend([0x1B, 0x45, 0x01])
    
    for item in order.get('items', []):
        qty = item.get('quantity', 1)
        name = item.get('product_name', 'Unknown')
        # Double size for quantity
        commands.extend([0x1D, 0x21, 0x01])
        commands.extend(f"{qty}x ".encode())
        commands.extend([0x1D, 0x21, 0x00])
        commands.extend(f"{name}\n".encode())
    
    commands.extend([0x1B, 0x45, 0x00])
    commands.extend(b"=" * 40 + b"\n")
    
    # Feed and cut
    commands.extend([0x1B, 0x64, 0x05])
    commands.extend([0x1D, 0x56, 0x00])
    
    return base64.b64encode(commands).decode()

def generate_escpos_customer_receipt(order: dict, business_info: dict, table_info: dict = None) -> str:
    """Generate ESC/POS commands for customer receipt"""
    commands = bytearray()
    
    # Initialize printer
    commands.extend([0x1B, 0x40])
    
    # Center align
    commands.extend([0x1B, 0x61, 0x01])
    
    # Bold + Double size for header
    commands.extend([0x1B, 0x45, 0x01])
    commands.extend([0x1D, 0x21, 0x11])
    
    if business_info.get('name'):
        commands.extend(f"{business_info['name']}\n".encode())
    else:
        commands.extend(b"RECEIPT\n")
    
    # Normal size
    commands.extend([0x1D, 0x21, 0x00])
    commands.extend([0x1B, 0x45, 0x00])
    
    if business_info.get('address_line1'):
        commands.extend(f"{business_info['address_line1']}\n".encode())
    if business_info.get('city') and business_info.get('postcode'):
        commands.extend(f"{business_info['city']} {business_info['postcode']}\n".encode())
    if business_info.get('phone'):
        commands.extend(f"Tel: {business_info['phone']}\n".encode())
    if business_info.get('vat_number'):
        commands.extend(f"VAT: {business_info['vat_number']}\n".encode())
    
    commands.extend(b"\n")
    
    # Left align
    commands.extend([0x1B, 0x61, 0x00])
    
    commands.extend(f"Order #: {str(order.get('order_number', 'N/A')).zfill(3)}\n".encode())
    if table_info:
        commands.extend(f"Table: {table_info['number']}\n".encode())
    commands.extend(f"Server: {order.get('created_by', 'N/A')}\n".encode())
    commands.extend(f"Date: {order.get('created_at', '')[:19].replace('T', ' ')}\n".encode())
    commands.extend(f"Payment: {order.get('payment_method', 'N/A').upper()}\n".encode())
    
    commands.extend(b"-" * 40 + b"\n")
    
    # Items
    for item in order.get('items', []):
        qty = item.get('quantity', 1)
        name = item.get('product_name', 'Unknown')[:20]
        price = item.get('unit_price', 0)
        total = item.get('total', 0)
        commands.extend(f"{qty}x {name}\n".encode())
        commands.extend(f"   ${price:.2f} x {qty} = ${total:.2f}\n".encode())
    
    commands.extend(b"-" * 40 + b"\n")
    
    # Totals - right align
    subtotal = order.get('subtotal', 0)
    tip = order.get('tip_amount', 0)
    total = order.get('total_amount', 0)
    
    commands.extend(f"{'Subtotal:':>30} ${subtotal:.2f}\n".encode())
    if tip > 0:
        tip_pct = order.get('tip_percentage', 0)
        commands.extend(f"{f'Tip ({tip_pct}%):':>30} ${tip:.2f}\n".encode())
    
    # Bold for total
    commands.extend([0x1B, 0x45, 0x01])
    commands.extend([0x1D, 0x21, 0x01])  # Double width
    commands.extend(f"{'TOTAL:':>20} ${total:.2f}\n".encode())
    commands.extend([0x1D, 0x21, 0x00])
    commands.extend([0x1B, 0x45, 0x00])
    
    commands.extend(b"\n")
    
    # Center align for footer
    commands.extend([0x1B, 0x61, 0x01])
    
    if business_info.get('receipt_footer'):
        commands.extend(f"{business_info['receipt_footer']}\n".encode())
    else:
        commands.extend(b"Thank you for your visit!\n")
    
    commands.extend(b"\nPowered by HevaPOS\n")
    
    # Feed and cut
    commands.extend([0x1B, 0x64, 0x05])
    commands.extend([0x1D, 0x56, 0x00])
    
    return base64.b64encode(commands).decode()

# ===== TABLE API ENDPOINTS =====

@api_router.get("/tables", response_model=List[Table])
async def get_tables(current_user: User = Depends(get_current_user)):
    """Get all tables for the restaurant"""
    query = {}
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["$or"] = [
            {"restaurant_id": current_user.restaurant_id},
            {"restaurant_id": None},
            {"restaurant_id": {"$exists": False}}
        ]
    tables = await db.tables.find(query, {"_id": 0}).sort("number", 1).to_list(200)
    return [Table(**t) for t in tables]

@api_router.post("/tables", response_model=Table)
async def create_table(table_data: TableCreate, current_user: User = Depends(require_admin)):
    """Create a new table"""
    if not current_user.restaurant_id and current_user.role != 'platform_owner':
        raise HTTPException(status_code=400, detail="No restaurant associated with user")
    
    restaurant_id = current_user.restaurant_id or "platform"
    
    # Check if table number already exists
    existing = await db.tables.find_one({
        "restaurant_id": restaurant_id,
        "number": table_data.number
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Table {table_data.number} already exists")
    
    table_id = f"table_{datetime.now(timezone.utc).timestamp()}"
    table_dict = {
        "id": table_id,
        "number": table_data.number,
        "name": table_data.name or f"Table {table_data.number}",
        "capacity": table_data.capacity,
        "status": "available",
        "restaurant_id": restaurant_id,
        "current_order_id": None,
        "merged_with": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tables.insert_one(table_dict)
    return Table(**table_dict)

@api_router.put("/tables/{table_id}", response_model=Table)
async def update_table(table_id: str, table_data: TableUpdate, current_user: User = Depends(require_admin)):
    """Update a table"""
    update_dict = {k: v for k, v in table_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.tables.update_one({"id": table_id}, {"$set": update_dict})
    
    updated = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Table not found")
    return Table(**updated)

@api_router.delete("/tables/{table_id}")
async def delete_table(table_id: str, current_user: User = Depends(require_admin)):
    """Delete a table"""
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    if table.get("status") == "occupied":
        raise HTTPException(status_code=400, detail="Cannot delete occupied table")
    
    await db.tables.delete_one({"id": table_id})
    return {"message": "Table deleted"}

@api_router.post("/tables/{table_id}/assign-order")
async def assign_order_to_table(table_id: str, order_id: str, current_user: User = Depends(get_current_user)):
    """Assign an order to a table"""
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update table
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {"current_order_id": order_id, "status": "occupied"}}
    )
    
    # Update order with table_id
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"table_id": table_id}}
    )
    
    return {"message": f"Order assigned to table {table['number']}"}

@api_router.post("/tables/{table_id}/clear")
async def clear_table(table_id: str, current_user: User = Depends(get_current_user)):
    """Clear a table after order is complete"""
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {"current_order_id": None, "status": "available", "merged_with": None}}
    )
    
    return {"message": f"Table {table['number']} cleared"}

@api_router.post("/tables/merge")
async def merge_tables(merge_data: TableMerge, current_user: User = Depends(require_admin)):
    """Merge multiple tables together"""
    if len(merge_data.table_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 tables to merge")
    
    tables = await db.tables.find({"id": {"$in": merge_data.table_ids}}, {"_id": 0}).to_list(100)
    if len(tables) != len(merge_data.table_ids):
        raise HTTPException(status_code=404, detail="One or more tables not found")
    
    # Use the first table as the primary
    primary_table = tables[0]
    other_table_ids = merge_data.table_ids[1:]
    
    # Update primary table
    await db.tables.update_one(
        {"id": primary_table["id"]},
        {"$set": {
            "merged_with": other_table_ids,
            "status": "occupied",
            "capacity": sum(t["capacity"] for t in tables)
        }}
    )
    
    # Mark other tables as merged
    await db.tables.update_many(
        {"id": {"$in": other_table_ids}},
        {"$set": {"status": "merged", "merged_with": [primary_table["id"]]}}
    )
    
    return {
        "message": f"Tables merged into Table {primary_table['number']}",
        "primary_table_id": primary_table["id"],
        "merged_table_ids": other_table_ids
    }

@api_router.post("/tables/{table_id}/unmerge")
async def unmerge_tables(table_id: str, current_user: User = Depends(require_admin)):
    """Unmerge previously merged tables"""
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    if not table.get("merged_with"):
        raise HTTPException(status_code=400, detail="Table is not merged")
    
    merged_ids = table["merged_with"]
    
    # Get original capacity
    original_table = await db.tables.find_one({"id": table_id, "merged_with": {"$exists": False}}, {"_id": 0})
    original_capacity = original_table["capacity"] if original_table else 4
    
    # Reset primary table
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {"merged_with": None, "status": "available", "capacity": original_capacity}}
    )
    
    # Reset other tables
    await db.tables.update_many(
        {"id": {"$in": merged_ids}},
        {"$set": {"merged_with": None, "status": "available"}}
    )
    
    return {"message": "Tables unmerged successfully"}

@api_router.post("/tables/{table_id}/split-bill")
async def split_table_bill(table_id: str, split_data: TableSplitBill, current_user: User = Depends(get_current_user)):
    """Split the bill for a table"""
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    order = await db.orders.find_one({"id": split_data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Create split orders from the original
    split_orders = []
    for i, split in enumerate(split_data.splits):
        split_id = f"{split_data.order_id}_split_{i+1}"
        split_order = {
            "id": split_id,
            "original_order_id": split_data.order_id,
            "table_id": table_id,
            "items": split.get("items", []),
            "total_amount": sum(item.get("total", 0) for item in split.get("items", [])),
            "split_number": i + 1,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.split_orders.insert_one(split_order)
        split_orders.append(split_order)
    
    return {
        "message": f"Bill split into {len(split_data.splits)} parts",
        "split_orders": split_orders
    }

# ===== RESERVATION API ENDPOINTS =====

@api_router.get("/reservations", response_model=List[Reservation])
async def get_reservations(
    date: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(require_admin)
):
    """Get reservations for the restaurant"""
    query = {}
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id
    
    if date:
        query["reservation_time"] = {"$regex": f"^{date}"}
    if status:
        query["status"] = status
    
    reservations = await db.reservations.find(query, {"_id": 0}).sort("reservation_time", 1).to_list(500)
    return [Reservation(**r) for r in reservations]

@api_router.post("/reservations", response_model=Reservation)
async def create_reservation(res_data: ReservationCreate, current_user: User = Depends(require_admin)):
    """Create a new reservation"""
    if not current_user.restaurant_id and current_user.role != 'platform_owner':
        raise HTTPException(status_code=400, detail="No restaurant associated with user")
    
    restaurant_id = current_user.restaurant_id or "platform"
    
    # Check table exists
    table = await db.tables.find_one({"id": res_data.table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    # Check for conflicting reservations
    res_time = datetime.fromisoformat(res_data.reservation_time)
    # Make timezone-aware if naive
    if res_time.tzinfo is None:
        res_time = res_time.replace(tzinfo=timezone.utc)
    res_end = res_time + timedelta(minutes=res_data.duration_minutes)
    
    conflicts = await db.reservations.find({
        "table_id": res_data.table_id,
        "status": {"$in": ["confirmed", "seated"]},
        "reservation_time": {"$lt": res_end.isoformat()},
    }).to_list(100)
    
    for conflict in conflicts:
        conflict_time = datetime.fromisoformat(conflict["reservation_time"])
        # Make timezone-aware if naive
        if conflict_time.tzinfo is None:
            conflict_time = conflict_time.replace(tzinfo=timezone.utc)
        conflict_end = conflict_time + timedelta(minutes=conflict.get("duration_minutes", 120))
        if conflict_time < res_end and conflict_end > res_time:
            raise HTTPException(
                status_code=400, 
                detail=f"Table already reserved from {conflict_time.strftime('%H:%M')} to {conflict_end.strftime('%H:%M')}"
            )
    
    res_id = f"res_{datetime.now(timezone.utc).timestamp()}"
    res_dict = {
        "id": res_id,
        "table_id": res_data.table_id,
        "customer_name": res_data.customer_name,
        "customer_phone": res_data.customer_phone,
        "party_size": res_data.party_size,
        "reservation_time": res_data.reservation_time,
        "duration_minutes": res_data.duration_minutes,
        "status": "confirmed",
        "notes": res_data.notes,
        "restaurant_id": restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.reservations.insert_one(res_dict)
    
    # Update table status if reservation is for now
    if res_time <= datetime.now(timezone.utc) <= res_end:
        await db.tables.update_one(
            {"id": res_data.table_id},
            {"$set": {"status": "reserved"}}
        )
    
    return Reservation(**res_dict)

@api_router.put("/reservations/{res_id}", response_model=Reservation)
async def update_reservation(res_id: str, res_data: ReservationUpdate, current_user: User = Depends(require_admin)):
    """Update a reservation"""
    update_dict = {k: v for k, v in res_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.reservations.update_one({"id": res_id}, {"$set": update_dict})
    
    updated = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    # Update table status based on reservation status
    if res_data.status:
        table_status = "available"
        if res_data.status == "confirmed":
            res_time = datetime.fromisoformat(updated["reservation_time"])
            res_end = res_time + timedelta(minutes=updated.get("duration_minutes", 120))
            if res_time <= datetime.now(timezone.utc) <= res_end:
                table_status = "reserved"
        elif res_data.status == "seated":
            table_status = "occupied"
        
        await db.tables.update_one(
            {"id": updated["table_id"]},
            {"$set": {"status": table_status}}
        )
    
    return Reservation(**updated)

@api_router.delete("/reservations/{res_id}")
async def cancel_reservation(res_id: str, current_user: User = Depends(require_admin)):
    """Cancel a reservation"""
    reservation = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    await db.reservations.update_one(
        {"id": res_id},
        {"$set": {"status": "cancelled"}}
    )
    
    # Free up the table
    await db.tables.update_one(
        {"id": reservation["table_id"]},
        {"$set": {"status": "available"}}
    )
    
    return {"message": "Reservation cancelled"}

@api_router.post("/reservations/{res_id}/seat")
async def seat_reservation(res_id: str, current_user: User = Depends(get_current_user)):
    """Mark reservation as seated"""
    reservation = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    await db.reservations.update_one(
        {"id": res_id},
        {"$set": {"status": "seated"}}
    )
    
    await db.tables.update_one(
        {"id": reservation["table_id"]},
        {"$set": {"status": "occupied"}}
    )
    
    return {"message": f"Party of {reservation['party_size']} seated at table"}

@api_router.post("/reservations/{res_id}/complete")
async def complete_reservation(res_id: str, current_user: User = Depends(get_current_user)):
    """Mark reservation as completed"""
    reservation = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    await db.reservations.update_one(
        {"id": res_id},
        {"$set": {"status": "completed"}}
    )
    
    await db.tables.update_one(
        {"id": reservation["table_id"]},
        {"$set": {"status": "available"}}
    )
    
    return {"message": "Reservation completed"}

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
# api_router already defined at line 35 - commenting this duplicate!
# api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# ===== SUBSCRIPTION MANAGEMENT =====
class SubscriptionUpdate(BaseModel):
    status: str
    plan: Optional[str] = None
    price: Optional[float] = None

@api_router.get("/subscriptions")
async def list_subscriptions(current_user: User = Depends(require_platform_owner)):
    restaurants = await db.restaurants.find({}, {"_id": 0}).to_list(1000)
    result = []
    now = datetime.now(timezone.utc)
    for r in restaurants:
        trial_ends = r.get("trial_ends_at")
        days_left = None
        if trial_ends:
            try:
                trial_dt = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
                days_left = max(0, (trial_dt - now).days)
            except Exception:
                days_left = 0
        result.append({
            "id": r.get("id"),
            "name": r.get("business_info", {}).get("name", "Unknown"),
            "owner_email": r.get("owner_email", ""),
            "subscription_status": r.get("subscription_status", "trial"),
            "subscription_plan": r.get("subscription_plan", "standard_monthly"),
            "price": r.get("price", 0),
            "currency": r.get("currency", "GBP"),
            "trial_ends_at": trial_ends,
            "trial_days_left": days_left,
            "next_billing_date": r.get("next_billing_date"),
            "created_at": r.get("created_at"),
        })
    return result

@api_router.put("/subscriptions/{restaurant_id}")
async def update_subscription(restaurant_id: str, data: SubscriptionUpdate, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    update = {"subscription_status": data.status}
    if data.plan:
        update["subscription_plan"] = data.plan
    if data.price is not None:
        update["price"] = data.price
    if data.status == "active":
        update["activated_at"] = datetime.now(timezone.utc).isoformat()
        update["next_billing_date"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    elif data.status == "suspended":
        update["suspended_at"] = datetime.now(timezone.utc).isoformat()
    elif data.status == "cancelled":
        update["cancelled_at"] = datetime.now(timezone.utc).isoformat()
    await db.restaurants.update_one({"id": restaurant_id}, {"$set": update})
    await db.notifications.insert_one({
        "id": f"notif_{datetime.now(timezone.utc).timestamp()}",
        "restaurant_id": restaurant_id,
        "type": "subscription_change",
        "message": f"Subscription changed to {data.status}",
        "email": restaurant.get("owner_email", ""),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_at": None,
    })
    return {"message": f"Subscription updated to {data.status}", "restaurant_id": restaurant_id}

@api_router.get("/subscriptions/my")
async def get_my_subscription(current_user: User = Depends(get_current_user)):
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant associated")
    restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    now = datetime.now(timezone.utc)
    trial_ends = restaurant.get("trial_ends_at")
    days_left = None
    if trial_ends:
        try:
            trial_dt = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
            days_left = max(0, (trial_dt - now).days)
        except Exception:
            days_left = 0
    return {
        "subscription_status": restaurant.get("subscription_status", "trial"),
        "subscription_plan": restaurant.get("subscription_plan", "standard_monthly"),
        "price": restaurant.get("price", 0),
        "currency": restaurant.get("currency", "GBP"),
        "trial_ends_at": trial_ends,
        "trial_days_left": days_left,
        "next_billing_date": restaurant.get("next_billing_date"),
    }

@api_router.post("/subscriptions/check-trials")
async def check_trial_expirations(current_user: User = Depends(require_platform_owner)):
    now = datetime.now(timezone.utc)
    restaurants = await db.restaurants.find({"subscription_status": "trial"}, {"_id": 0}).to_list(1000)
    expired = []
    expiring_soon = []
    for r in restaurants:
        trial_ends = r.get("trial_ends_at")
        if not trial_ends:
            continue
        try:
            trial_dt = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
        except Exception:
            continue
        days_left = (trial_dt - now).days
        if days_left < 0:
            await db.restaurants.update_one({"id": r["id"]}, {"$set": {"subscription_status": "suspended", "suspended_at": now.isoformat()}})
            await db.notifications.insert_one({
                "id": f"notif_{now.timestamp()}_{r['id']}", "restaurant_id": r["id"],
                "type": "trial_expired", "message": f"Trial expired for {r.get('business_info', {}).get('name', 'Unknown')}. Suspended.",
                "email": r.get("owner_email", ""), "status": "pending", "created_at": now.isoformat(), "sent_at": None,
            })
            expired.append(r["id"])
        elif days_left <= 3:
            existing = await db.notifications.find_one({"restaurant_id": r["id"], "type": "trial_expiring_soon", "created_at": {"$gte": (now - timedelta(days=1)).isoformat()}})
            if not existing:
                await db.notifications.insert_one({
                    "id": f"notif_warn_{now.timestamp()}_{r['id']}", "restaurant_id": r["id"],
                    "type": "trial_expiring_soon", "message": f"Trial expiring in {days_left} days for {r.get('business_info', {}).get('name', 'Unknown')}",
                    "email": r.get("owner_email", ""), "status": "pending", "created_at": now.isoformat(), "sent_at": None,
                })
                expiring_soon.append(r["id"])
    return {"expired_and_suspended": expired, "expiring_soon_notified": expiring_soon, "total_trials_checked": len(restaurants)}

# ===== NOTIFICATIONS =====
@api_router.get("/notifications")
async def get_notifications(current_user: User = Depends(require_platform_owner)):
    notifications = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifications

@api_router.put("/notifications/{notification_id}/mark-sent")
async def mark_notification_sent(notification_id: str, current_user: User = Depends(require_platform_owner)):
    await db.notifications.update_one({"id": notification_id}, {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Notification marked as sent"}

@api_router.get("/notifications/my")
async def get_my_notifications(current_user: User = Depends(get_current_user)):
    if not current_user.restaurant_id:
        return []
    notifications = await db.notifications.find({"restaurant_id": current_user.restaurant_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return notifications


# ===== USER MANAGEMENT (Restaurant Admin) =====
class StaffCreate(BaseModel):
    username: str
    password: str
    role: str = "user"

class StaffUpdate(BaseModel):
    username: str
    password: Optional[str] = None
    role: str = "user"

class PasswordReset(BaseModel):
    new_password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@api_router.get("/restaurant/staff")
async def list_restaurant_staff(current_user: User = Depends(require_admin)):
    """Restaurant Admin: list staff in their restaurant"""
    users = await db.users.find({"restaurant_id": current_user.restaurant_id}, {"_id": 0, "password": 0, "password_hash": 0}).to_list(100)
    return users

@api_router.post("/restaurant/staff")
async def create_restaurant_staff(staff: StaffCreate, current_user: User = Depends(require_admin)):
    """Restaurant Admin: create staff user"""
    existing = await db.users.find_one({"username": staff.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    user_doc = {
        "id": f"user_{datetime.now(timezone.utc).timestamp()}",
        "username": staff.username,
        "password_hash": get_password_hash(staff.password),
        "role": staff.role if staff.role in ["user", "admin"] else "user",
        "restaurant_id": current_user.restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.username,
    }
    await db.users.insert_one(user_doc)
    return {"message": f"Staff '{staff.username}' created", "id": user_doc["id"]}

@api_router.put("/restaurant/staff/{user_id}/reset-password")
async def reset_staff_password(user_id: str, data: PasswordReset, current_user: User = Depends(require_admin)):
    """Restaurant Admin: reset a staff member's password"""
    user = await db.users.find_one({"id": user_id, "restaurant_id": current_user.restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": get_password_hash(data.new_password)}})
    return {"message": f"Password reset for {user.get('username', user_id)}"}

@api_router.put("/restaurant/staff/{user_id}")
async def update_staff(user_id: str, staff: StaffUpdate, current_user: User = Depends(require_admin)):
    """Restaurant Admin: edit staff profile"""
    user = await db.users.find_one({"id": user_id, "restaurant_id": current_user.restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    update = {"username": staff.username, "role": staff.role}
    if staff.password:
        update["password_hash"] = get_password_hash(staff.password)
    await db.users.update_one({"id": user_id}, {"$set": update})
    return {"message": f"Staff '{staff.username}' updated"}

@api_router.put("/auth/change-password")
async def change_own_password(data: PasswordChange, current_user: User = Depends(get_current_user)):
    """Any user: change own password"""
    user = await db.users.find_one({"username": current_user.username})
    stored_hash = user.get("password_hash") or user.get("password") if user else None
    if not user or not stored_hash or not verify_password(data.current_password, stored_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_hashed = get_password_hash(data.new_password)
    await db.users.update_one({"username": current_user.username}, {"$set": {"password_hash": new_hashed, "password": new_hashed}})
    return {"message": "Password changed successfully"}

@api_router.delete("/restaurant/staff/{user_id}")
async def delete_staff(user_id: str, current_user: User = Depends(require_admin)):
    """Restaurant Admin: delete a staff member"""
    user = await db.users.find_one({"id": user_id, "restaurant_id": current_user.restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="Staff not found")
    if user.get("username") == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"id": user_id})
    return {"message": f"Staff '{user.get('username')}' deleted"}

# ===== STRIPE SUBSCRIPTION =====
@api_router.post("/stripe/create-checkout")
async def create_stripe_checkout(current_user: User = Depends(require_platform_owner)):
    """Create a Stripe Checkout session for subscription"""
    import stripe
    stripe.api_key = os.environ.get("STRIPE_API_KEY", "")
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price_data": {"currency": "gbp", "product_data": {"name": "HevaPOS Standard Plan"}, "unit_amount": 4999, "recurring": {"interval": "month"}}, "quantity": 1}],
            mode="subscription",
            success_url=os.environ.get("FRONTEND_URL", "http://localhost:3000") + "/platform/subscriptions?success=true",
            cancel_url=os.environ.get("FRONTEND_URL", "http://localhost:3000") + "/platform/subscriptions?cancelled=true",
        )
        return {"checkout_url": session.url, "session_id": session.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    import stripe
    stripe.api_key = os.environ.get("STRIPE_API_KEY", "")
    payload = await request.body()
    try:
        event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")
    
    if event.type == "invoice.payment_succeeded":
        # Activate subscription
        customer_id = event.data.object.get("customer")
        restaurant = await db.restaurants.find_one({"stripe_customer_id": customer_id})
        if restaurant:
            await db.restaurants.update_one({"id": restaurant["id"]}, {"$set": {"subscription_status": "active", "next_billing_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}})
    elif event.type == "invoice.payment_failed":
        # Suspend subscription
        customer_id = event.data.object.get("customer")
        restaurant = await db.restaurants.find_one({"stripe_customer_id": customer_id})
        if restaurant:
            await db.restaurants.update_one({"id": restaurant["id"]}, {"$set": {"subscription_status": "suspended", "suspended_at": datetime.now(timezone.utc).isoformat()}})
            await db.notifications.insert_one({"id": f"notif_stripe_{datetime.now(timezone.utc).timestamp()}", "restaurant_id": restaurant["id"], "type": "payment_failed", "message": f"Payment failed for {restaurant.get('business_info', {}).get('name', '')}", "email": restaurant.get("owner_email", ""), "status": "pending", "created_at": datetime.now(timezone.utc).isoformat(), "sent_at": None})
    
    return {"status": "ok"}




# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ===== ONE-TIME SEED ENDPOINT =====
@api_router.post("/seed-database")
async def seed_database_endpoint(secret: str = None):
    """
    One-time database seeding endpoint.
    Call with ?secret=hevapos2026 to seed the database.
    Only works if no users exist (prevents accidental reseeding).
    """
    # Simple secret to prevent accidental calls
    if secret != "hevapos2026":
        raise HTTPException(status_code=403, detail="Invalid secret. Use ?secret=hevapos2026")
    
    # Check if already seeded
    existing_users = await db.users.count_documents({})
    if existing_users > 0:
        return {"message": f"Database already seeded with {existing_users} users. Skipping.", "seeded": False}
    
    from datetime import timedelta
    
    # Create Platform Owner
    platform_owner = {
        "id": "platform_owner_1",
        "username": "platform_owner",
        "password": pwd_context.hash("admin123"),
        "role": "platform_owner",
        "restaurant_id": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(platform_owner)
    
    # Create Demo Restaurant
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
    
    # Create Restaurant Admin
    restaurant_admin = {
        "id": "restaurant_admin_1",
        "username": "restaurant_admin",
        "password": pwd_context.hash("admin123"),
        "role": "admin",
        "restaurant_id": "rest_demo_1",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(restaurant_admin)
    
    # Create Staff User
    staff_user = {
        "id": "restaurant_user_1",
        "username": "user",
        "password": pwd_context.hash("user123"),
        "role": "user",
        "restaurant_id": "rest_demo_1",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(staff_user)
    
    # Create Categories
    categories = [
        {"id": "cat_1", "name": "Pizzas", "description": "Delicious pizzas", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_2", "name": "Drinks", "description": "Beverages", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_3", "name": "Sides", "description": "Sides and starters", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_4", "name": "Desserts", "description": "Sweet treats", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.categories.insert_many(categories)
    
    # Create Products
    products = [
        {"id": "prod_1", "name": "Margherita", "category_id": "cat_1", "category_name": "Pizzas", "price": 9.99, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_2", "name": "Pepperoni", "category_id": "cat_1", "category_name": "Pizzas", "price": 11.99, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_3", "name": "Hawaiian", "category_id": "cat_1", "category_name": "Pizzas", "price": 12.99, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_4", "name": "Veggie Supreme", "category_id": "cat_1", "category_name": "Pizzas", "price": 13.99, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_5", "name": "Coca-Cola", "category_id": "cat_2", "category_name": "Drinks", "price": 2.50, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_6", "name": "Sprite", "category_id": "cat_2", "category_name": "Drinks", "price": 2.50, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_7", "name": "Water", "category_id": "cat_2", "category_name": "Drinks", "price": 1.50, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_8", "name": "Garlic Bread", "category_id": "cat_3", "category_name": "Sides", "price": 4.99, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_9", "name": "Chicken Wings", "category_id": "cat_3", "category_name": "Sides", "price": 6.99, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_10", "name": "Chocolate Brownie", "category_id": "cat_4", "category_name": "Desserts", "price": 4.50, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_11", "name": "Ice Cream", "category_id": "cat_4", "category_name": "Desserts", "price": 3.50, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()},
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
        "data_created": {
            "users": 3,
            "restaurants": 1,
            "categories": 4,
            "products": 11
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
