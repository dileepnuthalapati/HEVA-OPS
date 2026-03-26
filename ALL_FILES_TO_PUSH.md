# HevaPOS - Complete Code to Push to GitHub

This file contains all the code that needs to be pushed to your GitHub repository.
Replace the corresponding files in your GitHub repo with this code.

---


## FILE: server.py
```javascript
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
    product_id: str
    product_name: str
    quantity: int
    unit_price: float
    total: float
    notes: Optional[str] = None  # Item-level notes for kitchen

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int
    items: List[OrderItem]
    subtotal: float
    discount_type: Optional[str] = None  # "percentage" or "fixed"
    discount_value: float = 0.0  # Percentage (e.g., 10) or fixed amount (e.g., 5.00)
    discount_amount: float = 0.0  # Calculated discount
    discount_reason: Optional[str] = None  # Reason for discount
    tip_amount: float = 0.0
    tip_percentage: int = 0
    total_amount: float
    created_by: str
    created_at: str
    synced: bool = True
    status: str = "pending"
    payment_method: Optional[str] = None  # "cash", "card", or "split"
    payment_details: Optional[dict] = None  # For split: {"cash": 10.00, "card": 15.00}
    split_count: int = 1
    completed_at: Optional[str] = None
    table_id: Optional[str] = None
    order_notes: Optional[str] = None  # General order notes

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
    
    # Verify password
    if not verify_password(credentials.password, user["password"]):
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

@api_router.get("/restaurants/my", response_model=Restaurant)
async def get_my_restaurant(current_user: User = Depends(get_current_user)):
    """Get current user's restaurant"""
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="No restaurant found for this user")
    return Restaurant(**restaurant)

@api_router.put("/restaurants/my/settings")
async def update_restaurant_settings(settings: RestaurantUpdate, current_user: User = Depends(get_current_user)):
    """Update restaurant business information"""
    restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})
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
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(category_dict)
    return Category(**category_dict)

@api_router.get("/categories", response_model=List[Category])
async def get_categories(current_user: User = Depends(get_current_user)):
    # Filter by restaurant_id for restaurant admins/users
    query = {}
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id
    
    categories = await db.categories.find(query, {"_id": 0}).to_list(1000)
    return [Category(**cat) for cat in categories]

@api_router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, category_data: CategoryCreate, current_user: User = Depends(require_admin)):
    result = await db.categories.update_one(
        {"id": category_id},
        {"$set": category_data.model_dump()}
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
        query["restaurant_id"] = current_user.restaurant_id
    
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

@api_router.get("/orders/pending", response_model=List[Order])
async def get_pending_orders(current_user: User = Depends(get_current_user)):
    query = {"status": "pending"}
    if current_user.role != "admin":
        query["created_by"] = current_user.username
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Order(**order) for order in orders]

@api_router.get("/orders", response_model=List[Order])
async def get_orders(current_user: User = Depends(get_current_user)):
    query = {} if current_user.role == "admin" else {"created_by": current_user.username}
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
    
    total_sales = sum(order["total_amount"] for order in orders)
    total_orders = len(orders)
    
    product_sales = {}
    for order in orders:
        for item in order["items"]:
            if item["product_name"] not in product_sales:
                product_sales[item["product_name"]] = {"quantity": 0, "revenue": 0}
            product_sales[item["product_name"]]["quantity"] += item["quantity"]
            product_sales[item["product_name"]]["revenue"] += item["total"]
    
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
    table_data.append(["", "", "Subtotal:", f"${order['subtotal']:.2f}"])
    
    if order.get('tip_amount', 0) > 0:
        tip_label = f"Tip ({order.get('tip_percentage', 0)}%)"
        table_data.append(["", "", tip_label, f"${order['tip_amount']:.2f}"])
    
    table_data.append(["", "", "TOTAL:", f"${order['total_amount']:.2f}"])
    
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
    
    total_cash_sales = sum(order["total_amount"] for order in cash_orders)
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
    
    total_cash_sales = sum(order["total_amount"] for order in cash_orders)
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
    start_dt = datetime.fromisoformat(start_date)
    end_dt = datetime.fromisoformat(end_date)
    
    orders = await db.orders.find(
        {"created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}},
        {"_id": 0}
    ).to_list(10000)
    
    total_sales = sum(order["total_amount"] for order in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0
    
    product_sales = {}
    for order in orders:
        for item in order["items"]:
            if item["product_name"] not in product_sales:
                product_sales[item["product_name"]] = {"quantity": 0, "revenue": 0}
            product_sales[item["product_name"]]["quantity"] += item["quantity"]
            product_sales[item["product_name"]]["revenue"] += item["total"]
    
    top_products = sorted(product_sales.items(), key=lambda x: x[1]["revenue"], reverse=True)[:5]
    
    return {
        "total_sales": round(total_sales, 2),
        "total_orders": total_orders,
        "avg_order_value": round(avg_order_value, 2),
        "top_products": [{"name": name, "quantity": data["quantity"], "revenue": round(data["revenue"], 2)} for name, data in top_products]
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
import base64

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
        query["restaurant_id"] = current_user.restaurant_id
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

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
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
```

---

## FILE: App.js
```javascript
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import axios from "axios";

// Context & Components
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import OfflineIndicator from './components/OfflineIndicator';

// Pages - Platform Owner
import PlatformDashboard from './pages/PlatformDashboard';
import PlatformCategories from './pages/PlatformCategories';
import PlatformReports from './pages/PlatformReports';
import PlatformSettings from './pages/PlatformSettings';
import RestaurantManagement from './pages/RestaurantManagement';

// Pages - Restaurant Admin
import AdminDashboard from './pages/AdminDashboard';
import ProductManagement from './pages/ProductManagement';
import CategoryManagement from './pages/CategoryManagement';
import OrderHistory from './pages/OrderHistory';
import Reports from './pages/Reports';
import CashDrawer from './pages/CashDrawer';
import RestaurantSettings from './pages/RestaurantSettings';
import TableManagement from './pages/TableManagement';
import PrinterSettings from './pages/PrinterSettings';

// Pages - All Users
import Login from './pages/Login';
import POSScreen from './pages/POSScreen';

// Styles
import './App.css';
import './index.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// --- Components ---

const ProtectedRoute = ({ children, adminOnly = false, platformOwnerOnly = false, restaurantAdminOnly = false }) => {
  const { user, loading, isPlatformOwner, isRestaurantAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-medium">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Platform owner only routes
  if (platformOwnerOnly && !isPlatformOwner) {
    return <Navigate to={isRestaurantAdmin ? "/dashboard" : "/pos"} replace />;
  }

  // Restaurant admin only routes (not platform owner)
  if (restaurantAdminOnly && !isRestaurantAdmin) {
    if (isPlatformOwner) {
      return <Navigate to="/platform/dashboard" replace />;
    }
    return <Navigate to="/pos" replace />;
  }

  // Admin routes (platform owner OR restaurant admin)
  if (adminOnly && user.role === 'user') {
    return <Navigate to="/pos" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { user, isPlatformOwner, isRestaurantAdmin } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          user ? (
            isPlatformOwner ? (
              <Navigate to="/platform/dashboard" replace />
            ) : isRestaurantAdmin ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/pos" replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      
      {/* Platform Owner Only */}
      <Route path="/platform/dashboard" element={<ProtectedRoute platformOwnerOnly><PlatformDashboard /></ProtectedRoute>} />
      <Route path="/restaurants" element={<ProtectedRoute platformOwnerOnly><RestaurantManagement /></ProtectedRoute>} />
      <Route path="/platform/categories" element={<ProtectedRoute platformOwnerOnly><PlatformCategories /></ProtectedRoute>} />
      <Route path="/platform/reports" element={<ProtectedRoute platformOwnerOnly><PlatformReports /></ProtectedRoute>} />
      <Route path="/platform/settings" element={<ProtectedRoute platformOwnerOnly><PlatformSettings /></ProtectedRoute>} />
      
      {/* Restaurant Admin Only (not platform owner) */}
      <Route path="/dashboard" element={<ProtectedRoute restaurantAdminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/tables" element={<ProtectedRoute restaurantAdminOnly><TableManagement /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute restaurantAdminOnly><CategoryManagement /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute restaurantAdminOnly><ProductManagement /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute restaurantAdminOnly><Reports /></ProtectedRoute>} />
      <Route path="/cash-drawer" element={<ProtectedRoute restaurantAdminOnly><CashDrawer /></ProtectedRoute>} />
      <Route path="/printers" element={<ProtectedRoute restaurantAdminOnly><PrinterSettings /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute restaurantAdminOnly><RestaurantSettings /></ProtectedRoute>} />
      
      {/* POS Staff & Restaurant Admin */}
      <Route path="/pos" element={<ProtectedRoute><POSScreen /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
    </Routes>
  );
};

// --- Main App ---

function App() {
  return (
    <AuthProvider>
      <OfflineProvider>
        <BrowserRouter>
          <div className="App">
            <OfflineIndicator />
            <AppRoutes />
            <Toaster position="top-center" richColors />
          </div>
        </BrowserRouter>
      </OfflineProvider>
    </AuthProvider>
  );
}

export default App;
```

---

## FILE: App.css
```javascript
.App {
  min-height: 100vh;
  background-color: #ffffff;
}

.pos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .pos-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
}

@media (min-width: 1024px) {
  .pos-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}

.product-card {
  position: relative;
  overflow: hidden;
  border-radius: 0.75rem;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05), 0 12px 24px rgba(0, 0, 0, 0.05);
  transition: all 150ms ease;
  cursor: pointer;
  user-select: none;
}

.product-card:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1), 0 16px 32px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.product-card:active {
  transform: scale(0.95);
}

.product-card img {
  width: 100%;
  height: 120px;
  object-fit: cover;
}

.btn-primary {
  height: 3rem;
  border-radius: 0.5rem;
  font-weight: 700;
  transition: all 150ms ease;
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn-primary:hover {
  background-color: hsl(var(--primary) / 0.9);
}

.btn-primary:active {
  transform: scale(0.95);
}

.btn-success {
  height: 3rem;
  border-radius: 0.5rem;
  font-weight: 700;
  transition: all 150ms ease;
  background-color: rgb(16, 185, 129);
  color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn-success:hover {
  background-color: rgb(5, 150, 105);
}

.btn-success:active {
  transform: scale(0.95);
}

.metric-card {
  padding: 1.5rem;
  border-radius: 0.75rem;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card) / 0.5);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.sidebar {
  width: 240px;
  min-height: 100vh;
  background: hsl(var(--card));
  border-right: 1px solid hsl(var(--border));
  padding: 1.5rem;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  transition: all 150ms ease;
  cursor: pointer;
  text-decoration: none;
  color: hsl(var(--foreground));
}

.sidebar-link:hover {
  background: hsl(var(--accent) / 0.1);
}

.sidebar-link.active {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

.offline-indicator {
  position: fixed;
  top: 1rem;
  right: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  z-index: 50;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.cart-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid hsl(var(--border));
}

.price {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 1.125rem;
}
.App-logo {
    height: 40vmin;
    pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
    .App-logo {
        animation: App-logo-spin infinite 20s linear;
    }
}

.App-header {
    background-color: #0f0f10;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: calc(10px + 2vmin);
    color: white;
}

.App-link {
    color: #61dafb;
}

@keyframes App-logo-spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}
```

---

## FILE: Sidebar.js
```javascript
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { 
  LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, 
  Wallet, Settings, Users, Printer, Store, BarChart3, Globe, Building2
} from 'lucide-react';

// Platform Owner Menu - manages all restaurants
const platformOwnerMenu = [
  { path: '/platform/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/restaurants', icon: Building2, label: 'Restaurants' },
  { path: '/platform/categories', icon: Globe, label: 'Global Categories' },
  { path: '/platform/reports', icon: BarChart3, label: 'Platform Reports' },
  { path: '/platform/settings', icon: Settings, label: 'Platform Settings' },
];

// Restaurant Admin Menu - manages their restaurant
const restaurantAdminMenu = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/tables', icon: Users, label: 'Tables' },
  { path: '/categories', icon: FolderTree, label: 'Categories' },
  { path: '/products', icon: Package, label: 'Products' },
  { path: '/pos', icon: ShoppingCart, label: 'POS' },
  { path: '/orders', icon: FileText, label: 'Orders' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  { path: '/printers', icon: Printer, label: 'Printers' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

// POS Staff Menu - limited to POS operations
const posStaffMenu = [
  { path: '/pos', icon: ShoppingCart, label: 'POS' },
  { path: '/orders', icon: FileText, label: 'Orders' },
];

const Sidebar = ({ title = 'HevaPOS', subtitle = '' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isPlatformOwner, isRestaurantAdmin } = useAuth();

  // Select menu based on user role
  let menuItems = posStaffMenu;
  let defaultSubtitle = 'POS Terminal';
  
  if (isPlatformOwner) {
    menuItems = platformOwnerMenu;
    defaultSubtitle = 'Platform Management';
  } else if (isRestaurantAdmin) {
    menuItems = restaurantAdminMenu;
    defaultSubtitle = 'Restaurant Admin';
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle || defaultSubtitle}</p>
        {user && (
          <p className="text-xs text-muted-foreground mt-2 opacity-70">
            Logged in as: {user.username}
          </p>
        )}
      </div>
      
      <nav className="space-y-2 flex-1">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            data-testid={`sidebar-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      
      <div className="mt-auto pt-8">
        <Button
          variant="outline"
          data-testid="logout-button"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
```

---

## FILE: context/AuthContext.js
```javascript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

// DEMO MODE: Auto-login bypass for testing
const DEMO_MODE = false; // Disabled - using real auth now
const DEMO_PLATFORM_OWNER = {
  id: 'platform_owner_1',
  username: 'admin',
  role: 'platform_owner', // New role!
  restaurant_id: null, // Platform owner has no specific restaurant
  created_at: new Date().toISOString()
};

const DEMO_RESTAURANT_ADMIN = {
  id: 'restaurant_admin_1',
  username: 'restaurant_admin',
  role: 'admin',
  restaurant_id: 'rest_demo_1', // Pizza Palace
  created_at: new Date().toISOString()
};

const DEMO_RESTAURANT_USER = {
  id: 'restaurant_user_1',
  username: 'user',
  role: 'user',
  restaurant_id: 'rest_demo_1', // Pizza Palace
  created_at: new Date().toISOString()
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // DEMO MODE: Auto-login based on URL param or default
    if (DEMO_MODE) {
      const urlParams = new URLSearchParams(window.location.search);
      const role = urlParams.get('role');
      
      let demoUser;
      if (role === 'restaurant_admin') {
        demoUser = DEMO_RESTAURANT_ADMIN;
      } else if (role === 'user') {
        demoUser = DEMO_RESTAURANT_USER;
      } else {
        demoUser = DEMO_PLATFORM_OWNER; // Default: platform owner
      }
      
      console.log(`🎭 DEMO MODE: Auto-logged in as ${demoUser.role}`);
      setUser(demoUser);
      localStorage.setItem('demo_user', JSON.stringify(demoUser));
      setLoading(false);
      return;
    }
    
    // Normal auth check
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    // DEMO MODE: Return different users based on username
    if (DEMO_MODE) {
      let demoUser;
      if (username === 'restaurant_admin' || username === 'rest_admin') {
        demoUser = DEMO_RESTAURANT_ADMIN;
      } else if (username === 'user' || username === 'staff') {
        demoUser = DEMO_RESTAURANT_USER;
      } else {
        demoUser = DEMO_PLATFORM_OWNER;
      }
      setUser(demoUser);
      return { user: demoUser };
    }
    
    // Normal login
    const response = await authAPI.login(username, password);
    setUser(response.user);
    localStorage.setItem('user', JSON.stringify(response.user));
    return response;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('demo_user');
  };

  // Role check helpers
  const isPlatformOwner = user?.role === 'platform_owner';
  const isRestaurantAdmin = user?.role === 'admin';
  const isRestaurantUser = user?.role === 'user';
  const canAccessRestaurants = isPlatformOwner; // Only platform owner

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      loading, 
      isPlatformOwner,
      isRestaurantAdmin,
      isRestaurantUser,
      canAccessRestaurants,
      isAdmin: isPlatformOwner || isRestaurantAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

---

## FILE: services/api.js
```javascript
import axios from 'axios';
import { saveToIndexedDB, getAllFromIndexedDB, getUnsyncedOrders } from './db';

// API configuration
const API_URL = process.env.REACT_APP_BACKEND_URL || 'https://your-backend-url.com';
const API = `${API_URL}/api`;

console.log('Connecting to API at:', API);

let authToken = localStorage.getItem('auth_token');

const api = axios.create({
  baseURL: API,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

export const setAuthToken = (token) => {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
};

export const getAuthToken = () => authToken;

export const authAPI = {
  register: async (username, password, role) => {
    const response = await api.post('/auth/register', { username, password, role });
    return response.data;
  },
  login: async (username, password) => {
    // Use the proper login endpoint
    const response = await api.post('/auth/login', { username, password });
    if (response.data.access_token) {
      setAuthToken(response.data.access_token);
    }
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export const categoryAPI = {
  getAll: async () => {
    try {
      const response = await api.get('/categories');
      await saveToIndexedDB('categories', response.data);
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        return await getAllFromIndexedDB('categories');
      }
      throw error;
    }
  },
  create: async (data) => {
    const response = await api.post('/categories', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/categories/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/categories/${id}`);
    return response.data;
  },
};

export const productAPI = {
  getAll: async (categoryId = null) => {
    try {
      const url = categoryId ? `/products?category_id=${categoryId}` : '/products';
      const response = await api.get(url);
      await saveToIndexedDB('products', response.data);
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        const allProducts = await getAllFromIndexedDB('products');
        return categoryId ? allProducts.filter(p => p.category_id === categoryId) : allProducts;
      }
      throw error;
    }
  },
  create: async (data) => {
    const response = await api.post('/products', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/products/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/products/${id}`);
    return response.data;
  },
};

export const orderAPI = {
  getAll: async () => {
    try {
      const response = await api.get('/orders');
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        return await getAllFromIndexedDB('orders');
      }
      throw error;
    }
  },
  getPending: async () => {
    try {
      const response = await api.get('/orders/pending');
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        const allOrders = await getAllFromIndexedDB('orders');
        return allOrders.filter(o => o.status === 'pending');
      }
      throw error;
    }
  },
  create: async (data) => {
    try {
      const response = await api.post('/orders', data);
      await saveToIndexedDB('orders', { ...response.data, synced: true });
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        const offlineOrder = {
          id: `offline_${Date.now()}`,
          ...data,
          created_at: new Date().toISOString(),
          synced: false,
          status: 'pending',
          payment_method: null,
          completed_at: null
        };
        await saveToIndexedDB('orders', offlineOrder);
        return offlineOrder;
      }
      throw error;
    }
  },
  complete: async (orderId, paymentMethod, tipPercentage = 0, tipAmount = 0, splitCount = 1, paymentDetails = null) => {
    const response = await api.put(`/orders/${orderId}/complete`, { 
      payment_method: paymentMethod,
      tip_percentage: tipPercentage,
      tip_amount: tipAmount,
      split_count: splitCount,
      payment_details: paymentDetails
    });
    await saveToIndexedDB('orders', response.data);
    return response.data;
  },
  printKitchenReceipt: async (orderId) => {
    const response = await api.post(`/orders/${orderId}/print-kitchen-receipt`, {}, { responseType: 'blob' });
    return response.data;
  },
  printCustomerReceipt: async (orderId) => {
    const response = await api.post(`/orders/${orderId}/print-customer-receipt`, {}, { responseType: 'blob' });
    return response.data;
  },
  sync: async () => {
    const unsyncedOrders = await getUnsyncedOrders();
    if (unsyncedOrders.length === 0) return { message: 'No orders to sync' };
    
    const ordersToSync = unsyncedOrders.map(order => ({
      items: order.items,
      total_amount: order.total_amount,
    }));
    
    const response = await api.post('/sync', { orders: ordersToSync });
    
    for (const order of unsyncedOrders) {
      await saveToIndexedDB('orders', { ...order, synced: true });
    }
    
    return response.data;
  },
};

export const reportAPI = {
  getStats: async (startDate, endDate) => {
    const response = await api.get(`/reports/stats?start_date=${startDate}&end_date=${endDate}`);
    return response.data;
  },
  generatePDF: async (startDate, endDate) => {
    const response = await api.post('/reports/generate', 
      { start_date: startDate, end_date: endDate },
      { responseType: 'blob' }
    );
    return response.data;
  },
};

export const cashDrawerAPI = {
  open: async (openingBalance) => {
    const response = await api.post('/cash-drawer/open', { opening_balance: openingBalance });
    return response.data;
  },
  getCurrent: async () => {
    const response = await api.get('/cash-drawer/current');
    return response.data;
  },
  close: async (actualCash, notes = '') => {
    const response = await api.put('/cash-drawer/close', { actual_cash: actualCash, notes });
    return response.data;
  },
  getHistory: async () => {
    const response = await api.get('/cash-drawer/history');
    return response.data;
  },
};

export const restaurantAPI = {
  getMy: async () => {
    const response = await api.get('/restaurants/my');
    return response.data;
  },
  updateSettings: async (settings) => {
    const response = await api.put('/restaurants/my/settings', settings);
    return response.data;
  },
  getAll: async () => {
    const response = await api.get('/restaurants');
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/restaurants', data);
    return response.data;
  },
  // Restaurant User Management
  getUsers: async (restaurantId) => {
    const response = await api.get(`/restaurants/${restaurantId}/users`);
    return response.data;
  },
  createUser: async (restaurantId, userData) => {
    const response = await api.post(`/restaurants/${restaurantId}/users`, userData);
    return response.data;
  },
  deleteUser: async (restaurantId, userId) => {
    const response = await api.delete(`/restaurants/${restaurantId}/users/${userId}`);
    return response.data;
  },
};

// Tables API
export const tableAPI = {
  getAll: async () => {
    const response = await api.get('/tables');
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/tables', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/tables/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/tables/${id}`);
    return response.data;
  },
  assignOrder: async (tableId, orderId) => {
    const response = await api.post(`/tables/${tableId}/assign-order?order_id=${orderId}`);
    return response.data;
  },
  clear: async (tableId) => {
    const response = await api.post(`/tables/${tableId}/clear`);
    return response.data;
  },
  merge: async (tableIds) => {
    const response = await api.post('/tables/merge', { table_ids: tableIds });
    return response.data;
  },
  unmerge: async (tableId) => {
    const response = await api.post(`/tables/${tableId}/unmerge`);
    return response.data;
  },
  splitBill: async (tableId, orderId, splits) => {
    const response = await api.post(`/tables/${tableId}/split-bill`, { order_id: orderId, splits });
    return response.data;
  },
};

// Reservations API
export const reservationAPI = {
  getAll: async (date = null, status = null) => {
    let url = '/reservations';
    const params = [];
    if (date) params.push(`date=${date}`);
    if (status) params.push(`status=${status}`);
    if (params.length > 0) url += '?' + params.join('&');
    const response = await api.get(url);
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/reservations', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/reservations/${id}`, data);
    return response.data;
  },
  cancel: async (id) => {
    const response = await api.delete(`/reservations/${id}`);
    return response.data;
  },
  seat: async (id) => {
    const response = await api.post(`/reservations/${id}/seat`);
    return response.data;
  },
  complete: async (id) => {
    const response = await api.post(`/reservations/${id}/complete`);
    return response.data;
  },
};

// Printers API
export const printerAPI = {
  getAll: async () => {
    const response = await api.get('/printers');
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/printers', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/printers/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/printers/${id}`);
    return response.data;
  },
  test: async (id) => {
    const response = await api.post(`/printers/${id}/test`);
    return response.data;
  },
  printKitchenReceipt: async (orderId) => {
    const response = await api.post(`/print/kitchen/${orderId}`);
    return response.data;
  },
  printCustomerReceipt: async (orderId) => {
    const response = await api.post(`/print/customer/${orderId}`);
    return response.data;
  },
};

export default api;
```

---

## FILE: services/printer.js
```javascript
// Thermal Printer Service using Web Serial API
class ThermalPrinterService {
  constructor() {
    this.port = null;
    this.writer = null;
    this.encoder = new TextEncoder();
  }

  // ESC/POS Commands
  ESC = '\x1B';
  GS = '\x1D';
  
  // Initialize printer
  INIT = this.ESC + '@';
  
  // Text formatting
  BOLD_ON = this.ESC + 'E' + '\x01';
  BOLD_OFF = this.ESC + 'E' + '\x00';
  
  // Alignment
  ALIGN_LEFT = this.ESC + 'a' + '\x00';
  ALIGN_CENTER = this.ESC + 'a' + '\x01';
  ALIGN_RIGHT = this.ESC + 'a' + '\x02';
  
  // Font size
  FONT_NORMAL = this.GS + '!' + '\x00';
  FONT_DOUBLE = this.GS + '!' + '\x11';
  FONT_LARGE = this.GS + '!' + '\x22';
  
  // Line feed and cut
  LINE_FEED = '\n';
  CUT_PAPER = this.GS + 'V' + '\x00';

  // Check if Web Serial API is supported
  isSupported() {
    return 'serial' in navigator;
  }

  // Check if printer is connected
  isConnected() {
    return this.port !== null && this.writer !== null;
  }

  // Connect to printer
  async connect() {
    if (!this.isSupported()) {
      throw new Error('Web Serial API is not supported in this browser');
    }

    try {
      // Request a port
      this.port = await navigator.serial.requestPort();
      
      // Open the port
      await this.port.open({ 
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      this.writer = this.port.writable.getWriter();
      
      // Initialize printer
      await this.write(this.INIT);
      
      return true;
    } catch (error) {
      console.error('Failed to connect to printer:', error);
      throw error;
    }
  }

  // Disconnect from printer
  async disconnect() {
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
    
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
  }

  // Write data to printer
  async write(data) {
    if (!this.writer) {
      throw new Error('Printer not connected');
    }
    
    const encoded = this.encoder.encode(data);
    await this.writer.write(encoded);
  }

  // Print text
  async printText(text) {
    await this.write(text + this.LINE_FEED);
  }

  // Print line separator
  async printSeparator(char = '-', length = 32) {
    await this.write(char.repeat(length) + this.LINE_FEED);
  }

  // Print kitchen receipt
  async printKitchenReceipt(order) {
    try {
      // Initialize
      await this.write(this.INIT);
      
      // Header
      await this.write(this.ALIGN_CENTER + this.FONT_LARGE + this.BOLD_ON);
      await this.printText('KITCHEN ORDER');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      await this.printSeparator('=');
      
      // Order info
      await this.write(this.ALIGN_LEFT);
      await this.write(this.BOLD_ON);
      await this.printText(`Order #${String(order.order_number).padStart(3, '0')}`);
      await this.write(this.BOLD_OFF);
      await this.printText(`Server: ${order.created_by}`);
      await this.printText(`Time: ${new Date(order.created_at).toLocaleTimeString()}`);
      await this.printSeparator();
      
      // Items
      await this.write(this.BOLD_ON);
      await this.printText('ITEMS:');
      await this.write(this.BOLD_OFF);
      await this.printSeparator();
      
      for (const item of order.items) {
        await this.write(this.FONT_DOUBLE);
        await this.printText(`${item.quantity}x ${item.product_name}`);
        await this.write(this.FONT_NORMAL);
      }
      
      await this.printSeparator('=');
      
      // Footer
      await this.write(this.LINE_FEED + this.LINE_FEED);
      
      // Cut paper
      await this.write(this.CUT_PAPER);
      
      return true;
    } catch (error) {
      console.error('Failed to print kitchen receipt:', error);
      throw error;
    }
  }

  // Print customer receipt
  async printCustomerReceipt(order) {
    try {
      // Initialize
      await this.write(this.INIT);
      
      // Receipt Title
      await this.write(this.ALIGN_CENTER + this.FONT_LARGE + this.BOLD_ON);
      await this.printText('CUSTOMER RECEIPT');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      await this.printSeparator('=');
      
      // Restaurant Name (prominently)
      await this.write(this.FONT_DOUBLE + this.BOLD_ON);
      await this.printText(order.restaurant_name || 'Restaurant');
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      
      // Order info
      await this.write(this.ALIGN_LEFT);
      await this.printText(`Order #${String(order.order_number).padStart(3, '0')}`);
      await this.printText(`Server: ${order.created_by}`);
      await this.printText(`Date: ${new Date(order.created_at).toLocaleString()}`);
      await this.printText(`Payment: ${order.payment_method.toUpperCase()}`);
      await this.printSeparator();
      
      // Items header
      await this.write(this.BOLD_ON);
      const header = 'Item'.padEnd(16) + 'Qty'.padEnd(4) + 'Total'.padStart(8);
      await this.printText(header);
      await this.write(this.BOLD_OFF);
      await this.printSeparator();
      
      // Items
      for (const item of order.items) {
        const itemName = item.product_name.length > 16 
          ? item.product_name.slice(0, 13) + '...' 
          : item.product_name.padEnd(16);
        const qty = `${item.quantity}`.padEnd(4);
        const total = `$${item.total.toFixed(2)}`.padStart(8);
        await this.printText(itemName + qty + total);
      }
      
      await this.printSeparator();
      
      // Subtotal
      await this.printText('Subtotal:'.padEnd(24) + `$${order.subtotal?.toFixed(2) || order.total_amount.toFixed(2)}`.padStart(8));
      
      // Tip
      if (order.tip_amount > 0) {
        await this.printText(`Tip (${order.tip_percentage}%):`.padEnd(24) + `$${order.tip_amount.toFixed(2)}`.padStart(8));
      }
      
      // Total
      await this.printSeparator();
      await this.write(this.FONT_DOUBLE + this.BOLD_ON);
      await this.printText('TOTAL:'.padEnd(12) + `$${order.total_amount.toFixed(2)}`.padStart(8));
      await this.write(this.BOLD_OFF + this.FONT_NORMAL);
      
      await this.printSeparator('=');
      
      // Footer
      await this.write(this.ALIGN_CENTER);
      await this.printText('Thank you for your visit!');
      await this.write(this.LINE_FEED + this.LINE_FEED);
      
      // Cut paper
      await this.write(this.CUT_PAPER);
      
      return true;
    } catch (error) {
      console.error('Failed to print customer receipt:', error);
      throw error;
    }
  }
}

export default new ThermalPrinterService();
```

---

## FILE: pages/AdminDashboard.js
```javascript
import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { reportAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { TrendingUp, DollarSign, ShoppingBag, Package } from 'lucide-react';
import { toast } from 'sonner';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const data = await reportAPI.getStats(weekAgo, today);
      setStats(data);
    } catch (error) {
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your restaurant performance</p>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card className="metric-card" data-testid="metric-total-sales">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Total Sales
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-8 h-8 text-emerald-500" />
                      <div className="text-3xl font-bold font-mono">
                        ${stats?.total_sales?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-total-orders">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Total Orders
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-8 h-8 text-blue-500" />
                      <div className="text-3xl font-bold font-mono">{stats?.total_orders || 0}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-avg-order">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Avg Order Value
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-8 h-8 text-amber-500" />
                      <div className="text-3xl font-bold font-mono">
                        ${stats?.avg_order_value?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="metric-top-products">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Top Products
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Package className="w-8 h-8 text-purple-500" />
                      <div className="text-3xl font-bold font-mono">
                        {stats?.top_products?.length || 0}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {stats?.top_products && stats.top_products.length > 0 && (
                <Card data-testid="top-products-card">
                  <CardHeader>
                    <CardTitle className="text-2xl font-semibold">Top Selling Products</CardTitle>
                    <CardDescription>Best performers in the last 7 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {stats.top_products.map((product, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 rounded-lg border bg-card"
                          data-testid={`top-product-${index}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary">
                              #{index + 1}
                            </div>
                            <div>
                              <div className="font-semibold text-lg">{product.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {product.quantity} units sold
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold font-mono text-emerald-600">
                              ${product.revenue.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">Revenue</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;```

---

## FILE: pages/CashDrawer.js
```javascript
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cashDrawerAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Wallet, Store, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/restaurants', icon: Store, label: 'Restaurants' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Panel</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const CashDrawer = () => {
  const location = useLocation();
  const [currentDrawer, setCurrentDrawer] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [drawerHistory] = await Promise.all([
        cashDrawerAPI.getHistory(),
      ]);
      setHistory(drawerHistory);
      
      // Try to get current drawer
      try {
        const current = await cashDrawerAPI.getCurrent();
        setCurrentDrawer(current);
      } catch (error) {
        // No open drawer today
        setCurrentDrawer(null);
      }
    } catch (error) {
      toast.error('Failed to load cash drawer data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrawer = async () => {
    if (!openingBalance || parseFloat(openingBalance) < 0) {
      toast.error('Please enter a valid opening balance');
      return;
    }

    try {
      await cashDrawerAPI.open(parseFloat(openingBalance));
      toast.success('Cash drawer opened successfully');
      setShowOpenDialog(false);
      setOpeningBalance('');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to open cash drawer');
    }
  };

  const handleCloseDrawer = async () => {
    if (!actualCash || parseFloat(actualCash) < 0) {
      toast.error('Please enter a valid cash amount');
      return;
    }

    try {
      await cashDrawerAPI.close(parseFloat(actualCash), notes);
      toast.success('Cash drawer closed successfully');
      setShowCloseDialog(false);
      setActualCash('');
      setNotes('');
      loadData();
    } catch (error) {
      toast.error('Failed to close cash drawer');
    }
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar active={location.pathname} />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Cash Drawer</h1>
              <p className="text-muted-foreground">Daily cash reconciliation and management</p>
            </div>
            {!currentDrawer && (
              <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
                <DialogTrigger asChild>
                  <Button data-testid="open-drawer-button">
                    <Wallet className="w-4 h-4 mr-2" />
                    Open Cash Drawer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Open Cash Drawer</DialogTitle>
                    <DialogDescription>Enter the starting cash amount for today</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="opening-balance">Opening Balance ($)</Label>
                      <Input
                        id="opening-balance"
                        data-testid="opening-balance-input"
                        type="number"
                        step="0.01"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                        placeholder="0.00"
                        className="h-12 text-lg font-mono"
                      />
                    </div>
                    <Button
                      onClick={handleOpenDrawer}
                      data-testid="confirm-open-button"
                      className="w-full h-12"
                    >
                      Open Drawer
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Current Drawer Status */}
          {currentDrawer ? (
            <div className="mb-8">
              <Card data-testid="current-drawer-card">
                <CardHeader>
                  <CardTitle className="text-2xl font-semibold">Today's Cash Drawer</CardTitle>
                  <CardDescription>
                    Opened at {new Date(currentDrawer.opened_at).toLocaleTimeString()} by {currentDrawer.opened_by}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-2">Opening Balance</div>
                      <div className="text-2xl font-bold font-mono">
                        ${currentDrawer.opening_balance.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-2">Cash Sales Today</div>
                      <div className="text-2xl font-bold font-mono text-emerald-600">
                        +${(currentDrawer.expected_cash - currentDrawer.opening_balance).toFixed(2)}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-2">Expected Cash</div>
                      <div className="text-2xl font-bold font-mono text-blue-600">
                        ${currentDrawer.expected_cash.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  
                  <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-12" data-testid="close-drawer-button">
                        Close Cash Drawer
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Close Cash Drawer</DialogTitle>
                        <DialogDescription>
                          Count the actual cash in the drawer and enter the amount
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="p-4 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm mb-2">
                            <span>Expected Cash:</span>
                            <span className="font-mono font-bold">
                              ${currentDrawer.expected_cash.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        
                        <div>
                          <Label htmlFor="actual-cash">Actual Cash ($)</Label>
                          <Input
                            id="actual-cash"
                            data-testid="actual-cash-input"
                            type="number"
                            step="0.01"
                            value={actualCash}
                            onChange={(e) => setActualCash(e.target.value)}
                            placeholder="0.00"
                            className="h-12 text-lg font-mono"
                          />
                        </div>
                        
                        {actualCash && (
                          <div className="p-4 bg-muted rounded-lg">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">Difference:</span>
                              <span
                                className={`font-mono font-bold text-lg ${
                                  parseFloat(actualCash) - currentDrawer.expected_cash >= 0
                                    ? 'text-emerald-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {parseFloat(actualCash) - currentDrawer.expected_cash >= 0 ? '+' : ''}
                                ${(parseFloat(actualCash) - currentDrawer.expected_cash).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        <div>
                          <Label htmlFor="notes">Notes (optional)</Label>
                          <Textarea
                            id="notes"
                            data-testid="close-notes-input"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any discrepancies or notes..."
                            rows={3}
                          />
                        </div>
                        
                        <Button
                          onClick={handleCloseDrawer}
                          data-testid="confirm-close-button"
                          className="w-full h-12"
                        >
                          Close Drawer
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="mb-8">
              <CardContent className="py-12 text-center text-muted-foreground">
                No cash drawer opened for today. Click "Open Cash Drawer" to start.
              </CardContent>
            </Card>
          )}

          {/* History */}
          <div>
            <h2 className="text-2xl font-bold mb-4">Cash Drawer History</h2>
            {history.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No cash drawer history yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {history.map((drawer) => (
                  <Card key={drawer.id} data-testid={`drawer-history-${drawer.id}`}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-lg font-bold">{drawer.date}</div>
                          <div className="text-sm text-muted-foreground">
                            {drawer.status === 'open' ? (
                              <span className="text-emerald-600">Currently Open</span>
                            ) : (
                              <span>
                                Closed at {new Date(drawer.closed_at).toLocaleTimeString()} by{' '}
                                {drawer.closed_by}
                              </span>
                            )}
                          </div>
                        </div>
                        {drawer.status === 'closed' && (
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              {drawer.difference >= 0 ? (
                                <TrendingUp className="w-5 h-5 text-emerald-600" />
                              ) : (
                                <TrendingDown className="w-5 h-5 text-red-600" />
                              )}
                              <span
                                className={`text-xl font-bold font-mono ${
                                  drawer.difference >= 0 ? 'text-emerald-600' : 'text-red-600'
                                }`}
                              >
                                {drawer.difference >= 0 ? '+' : ''}${drawer.difference.toFixed(2)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">Difference</div>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Opening</div>
                          <div className="font-mono font-semibold">
                            ${drawer.opening_balance.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Expected</div>
                          <div className="font-mono font-semibold">
                            ${drawer.expected_cash.toFixed(2)}
                          </div>
                        </div>
                        {drawer.status === 'closed' && (
                          <div>
                            <div className="text-muted-foreground">Actual</div>
                            <div className="font-mono font-semibold">
                              ${drawer.actual_cash.toFixed(2)}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {drawer.notes && (
                        <div className="mt-4 p-3 bg-muted rounded text-sm">
                          <div className="font-semibold mb-1">Notes:</div>
                          <div>{drawer.notes}</div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashDrawer;
```

---

## FILE: pages/CategoryManagement.js
```javascript
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { categoryAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Wallet, Store, Plus, Edit, Trash2 } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/restaurants', icon: Store, label: 'Restaurants' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Panel</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const CategoryManagement = () => {
  const location = useLocation();
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image_url: '',
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await categoryAPI.getAll();
      setCategories(data);
    } catch (error) {
      toast.error('Failed to load categories');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await categoryAPI.update(editingCategory.id, formData);
        toast.success('Category updated successfully');
      } else {
        await categoryAPI.create(formData);
        toast.success('Category created successfully');
      }

      setOpen(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '', image_url: '' });
      loadCategories();
    } catch (error) {
      toast.error('Failed to save category');
    }
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      image_url: category.image_url || '',
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure? This will also delete all products in this category.')) return;

    try {
      await categoryAPI.delete(id);
      toast.success('Category deleted successfully');
      loadCategories();
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Categories</h1>
              <p className="text-muted-foreground">Organize your products into categories</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="add-category-button"
                  onClick={() => {
                    setEditingCategory(null);
                    setFormData({ name: '', description: '', image_url: '' });
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</DialogTitle>
                  <DialogDescription>
                    {editingCategory ? 'Update category details' : 'Create a new category for your products'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Category Name</Label>
                    <Input
                      id="name"
                      data-testid="category-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      data-testid="category-description-input"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="image_url">Image URL (optional)</Label>
                    <Input
                      id="image_url"
                      data-testid="category-image-input"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" data-testid="category-submit-button" className="flex-1">
                      {editingCategory ? 'Update' : 'Create'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setOpen(false);
                        setEditingCategory(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {categories.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No categories yet. Click "Add Category" to create your first category.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category) => (
                <Card key={category.id} data-testid={`category-item-${category.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-bold text-lg">{category.name}</div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`edit-category-${category.id}`}
                          onClick={() => handleEdit(category)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`delete-category-${category.id}`}
                          onClick={() => handleDelete(category.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {category.image_url && (
                        <img
                          src={category.image_url}
                          alt={category.name}
                          className="w-full h-40 object-cover rounded-lg"
                        />
                      )}
                      {category.description && (
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryManagement;```

---

## FILE: pages/Login.js
```javascript
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await login(username, password);
      toast.success(`Welcome back, ${response.user.username}!`);
      
      // Route based on role
      if (response.user.role === 'platform_owner') {
        navigate('/platform/dashboard');
      } else if (response.user.role === 'admin') {
        navigate('/dashboard');
      } else {
        navigate('/pos');
      }
    } catch (error) {
      toast.error('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg" data-testid="login-card">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
            <LogIn className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-4xl font-bold tracking-tight">HevaPOS</CardTitle>
          <CardDescription className="text-base">Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold">
                Username
              </Label>
              <Input
                id="username"
                data-testid="username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">
                Password
              </Label>
              <Input
                id="password"
                data-testid="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="h-12"
              />
            </div>
            <Button
              type="submit"
              data-testid="login-submit-button"
              className="w-full h-12 text-base font-bold"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Demo Accounts:</p>
            <p className="mt-2 font-mono text-xs">
              Platform Owner: platform_owner / admin123
              <br />
              Restaurant Admin: restaurant_admin / admin123
              <br />
              Staff: user / user123
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;```

---

## FILE: pages/OrderHistory.js
```javascript
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { orderAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Calendar } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout, isAdmin } = useAuth();

  const adminMenuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
  ];

  const userMenuItems = [
    { path: '/pos', icon: ShoppingCart, label: 'POS' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
  ];

  const menuItems = isAdmin ? adminMenuItems : userMenuItems;

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">{isAdmin ? 'Admin Panel' : 'User Panel'}</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const OrderHistory = () => {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await orderAPI.getAll();
      setOrders(data);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Order History</h1>
            <p className="text-muted-foreground">View all completed orders</p>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading orders...</div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No orders yet. Complete your first order to see it here.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} data-testid={`order-item-${order.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-bold">Order #{String(order.order_number).padStart(3, '0')}</div>
                          {order.status === 'pending' && (
                            <div className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                              Pending Payment
                            </div>
                          )}
                          {order.status === 'completed' && (
                            <div className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                              Completed - {order.payment_method?.toUpperCase()}
                            </div>
                          )}
                          {!order.synced && (
                            <div className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                              Offline
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground font-normal flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {formatDate(order.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono text-emerald-600">
                          ${order.total_amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">by {order.created_by}</div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {order.items.map((item, index) => (
                        <div
                          key={index}
                          data-testid={`order-item-product-${index}`}
                          className="flex justify-between items-center p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-sm text-muted-foreground">
                              ${item.unit_price.toFixed(2)} × {item.quantity}
                            </div>
                          </div>
                          <div className="font-bold font-mono">${item.total.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderHistory;```

---

## FILE: pages/POSScreen.js
```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { categoryAPI, productAPI, orderAPI, tableAPI, printerAPI } from '../services/api';
import printerService from '../services/printer';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Minus, Trash2, LogOut, Receipt, X, Printer, DollarSign, CreditCard, Users, Percent, Tag, MessageSquare, Banknote } from 'lucide-react';

const POSScreen = () => {
  const { user, logout } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedOrderToComplete, setSelectedOrderToComplete] = useState(null);
  const [tipPercentage, setTipPercentage] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [splitCount, setSplitCount] = useState(1);
  const [printerConnected, setPrinterConnected] = useState(false);
  
  // New states for discounts, notes, and split payment
  const [orderNotes, setOrderNotes] = useState('');
  const [discountType, setDiscountType] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  
  // Split payment mode (cash/card amounts)
  const [splitPaymentMode, setSplitPaymentMode] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');

  useEffect(() => {
    loadData();
    loadPendingOrders();
    loadTables();
    checkPrinterSupport();
  }, []);

  const checkPrinterSupport = () => {
    setPrinterConnected(printerService.isSupported());
  };

  const connectPrinter = async () => {
    try {
      await printerService.connect();
      setPrinterConnected(true);
      toast.success('Printer connected successfully');
    } catch (error) {
      toast.error('Failed to connect printer');
    }
  };

  useEffect(() => {
    if (selectedCategory) {
      loadProducts(selectedCategory);
    } else {
      loadProducts();
    }
  }, [selectedCategory]);

  const loadData = async () => {
    try {
      const [cats, prods] = await Promise.all([
        categoryAPI.getAll(),
        productAPI.getAll(),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async (categoryId = null) => {
    try {
      const prods = await productAPI.getAll(categoryId);
      setProducts(prods);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const loadPendingOrders = async () => {
    try {
      const orders = await orderAPI.getPending();
      setPendingOrders(orders);
    } catch (error) {
      console.error('Failed to load pending orders:', error);
    }
  };

  const loadTables = async () => {
    try {
      const tablesData = await tableAPI.getAll();
      setTables(tablesData);
    } catch (error) {
      console.error('Failed to load tables:', error);
    }
  };

  const addToCart = (product) => {
    const existing = cart.find((item) => item.product_id === product.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unit_price }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price: product.price,
          total: product.price,
        },
      ]);
    }
    toast.success(`Added ${product.name} to cart`);
  };

  const updateQuantity = (productId, delta) => {
    setCart(
      cart
        .map((item) => {
          if (item.product_id === productId) {
            const newQuantity = item.quantity + delta;
            if (newQuantity <= 0) return null;
            return {
              ...item,
              quantity: newQuantity,
              total: newQuantity * item.unit_price,
            };
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.product_id !== productId));
    toast.info('Item removed from cart');
  };

  const clearCart = () => {
    setCart([]);
    setOrderNotes('');
    setDiscountType('');
    setDiscountValue('');
    setDiscountReason('');
    toast.info('Cart cleared');
  };

  // Calculate discount amount
  const calculateDiscount = () => {
    if (!discountType || !discountValue) return 0;
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    if (discountType === 'percentage') {
      return subtotal * (parseFloat(discountValue) / 100);
    } else if (discountType === 'fixed') {
      return Math.min(parseFloat(discountValue), subtotal);
    }
    return 0;
  };

  // Calculate cart total after discount
  const calculateCartTotal = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const discount = calculateDiscount();
    return subtotal - discount;
  };

  const placeOrder = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);

    try {
      const order = await orderAPI.create({
        items: cart,
        total_amount: subtotal,
        table_id: selectedTable || null,
        order_notes: orderNotes || null,
        discount_type: discountType || null,
        discount_value: discountValue ? parseFloat(discountValue) : 0,
        discount_reason: discountReason || null,
      });
      
      // Print kitchen receipt via ESC/POS API
      try {
        const printResult = await printerAPI.printKitchenReceipt(order.id);
        console.log('Kitchen receipt ESC/POS commands generated:', printResult);
        
        // If we have a connected thermal printer, send the commands
        if (printerConnected && printerService.isConnected()) {
          await printerService.printRaw(printResult.commands);
          toast.success(`Order #${order.order_number} placed! Kitchen receipt printed.`);
        } else {
          // Fallback to PDF download
          const kitchenReceipt = await orderAPI.printKitchenReceipt(order.id);
          downloadPDF(kitchenReceipt, `kitchen_${String(order.order_number).padStart(3, '0')}.pdf`);
          toast.success(`Order #${order.order_number} placed! Kitchen receipt downloaded.`);
        }
      } catch (printError) {
        console.error('Print failed, falling back to PDF:', printError);
        try {
          const kitchenReceipt = await orderAPI.printKitchenReceipt(order.id);
          downloadPDF(kitchenReceipt, `kitchen_${String(order.order_number).padStart(3, '0')}.pdf`);
          toast.success(`Order #${order.order_number} placed! Kitchen receipt downloaded.`);
        } catch (pdfError) {
          toast.success(`Order #${order.order_number} placed!`);
        }
      }
      
      // Update table status if assigned
      if (selectedTable) {
        await tableAPI.assignOrder(selectedTable, order.id);
        loadTables();
      }
      
      // Clear cart and all related states
      setCart([]);
      setSelectedTable(null);
      setOrderNotes('');
      setDiscountType('');
      setDiscountValue('');
      setDiscountReason('');
      setShowDiscountPanel(false);
      setShowNotesPanel(false);
      loadPendingOrders();
    } catch (error) {
      toast.error('Failed to place order');
    }
  };

  const downloadPDF = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const openCompleteDialog = (order) => {
    setSelectedOrderToComplete(order);
    setTipPercentage(0);
    setCustomTip('');
    setSplitCount(1);
    setSplitPaymentMode(false);
    setCashAmount('');
    setCardAmount('');
    setShowPaymentDialog(true);
  };

  const calculateTipAmount = () => {
    if (!selectedOrderToComplete) return 0;
    
    if (customTip) {
      return parseFloat(customTip) || 0;
    }
    
    if (tipPercentage > 0) {
      const baseAmount = (selectedOrderToComplete.subtotal || 0) - (selectedOrderToComplete.discount_amount || 0);
      return (baseAmount * tipPercentage) / 100;
    }
    
    return 0;
  };

  const calculateGrandTotal = () => {
    if (!selectedOrderToComplete) return 0;
    const baseAmount = (selectedOrderToComplete.subtotal || 0) - (selectedOrderToComplete.discount_amount || 0);
    return baseAmount + calculateTipAmount();
  };

  const calculatePerPersonAmount = () => {
    return calculateGrandTotal() / splitCount;
  };

  // Auto-calculate remaining amount for split payment
  const calculateRemainingAmount = () => {
    const total = calculateGrandTotal();
    const cash = parseFloat(cashAmount) || 0;
    const card = parseFloat(cardAmount) || 0;
    return total - cash - card;
  };

  const completeOrder = async (paymentMethod) => {
    if (!selectedOrderToComplete) return;

    const tipAmount = calculateTipAmount();
    const grandTotal = calculateGrandTotal();
    
    // Handle split payment validation
    let paymentDetails = null;
    if (splitPaymentMode) {
      const cash = parseFloat(cashAmount) || 0;
      const card = parseFloat(cardAmount) || 0;
      const totalPaid = cash + card;
      
      if (Math.abs(totalPaid - grandTotal) > 0.02) {
        toast.error(`Payment total ($${totalPaid.toFixed(2)}) doesn't match order total ($${grandTotal.toFixed(2)})`);
        return;
      }
      
      paymentMethod = 'split';
      paymentDetails = { cash, card };
    }

    try {
      const completedOrder = await orderAPI.complete(
        selectedOrderToComplete.id, 
        paymentMethod,
        tipPercentage,
        tipAmount,
        splitCount,
        paymentDetails
      );
      
      // Print customer receipt via ESC/POS API
      try {
        const printResult = await printerAPI.printCustomerReceipt(selectedOrderToComplete.id);
        console.log('Customer receipt ESC/POS commands generated:', printResult);
        
        // If we have a connected thermal printer, send the commands
        if (printerConnected && printerService.isConnected()) {
          await printerService.printRaw(printResult.commands);
          toast.success(`Payment complete! Customer receipt printed.`);
        } else {
          // Fallback to PDF download
          const customerReceipt = await orderAPI.printCustomerReceipt(selectedOrderToComplete.id);
          downloadPDF(customerReceipt, `receipt_${String(selectedOrderToComplete.order_number).padStart(3, '0')}.pdf`);
          toast.success(`Payment complete! Customer receipt downloaded.`);
        }
      } catch (printError) {
        console.error('Print failed, falling back to PDF:', printError);
        try {
          const customerReceipt = await orderAPI.printCustomerReceipt(selectedOrderToComplete.id);
          downloadPDF(customerReceipt, `receipt_${String(selectedOrderToComplete.order_number).padStart(3, '0')}.pdf`);
          toast.success(`Payment complete! Customer receipt downloaded.`);
        } catch (pdfError) {
          toast.success(`Order completed with ${paymentMethod}!`);
        }
      }
      
      // Clear the table if this order had a table assigned
      if (selectedOrderToComplete.table_id) {
        try {
          await tableAPI.clear(selectedOrderToComplete.table_id);
          console.log('Table cleared after payment');
          loadTables();
        } catch (clearError) {
          console.error('Failed to clear table:', clearError);
        }
      }
      
      setShowPaymentDialog(false);
      setSelectedOrderToComplete(null);
      setTipPercentage(0);
      setCustomTip('');
      setSplitCount(1);
      loadPendingOrders();
    } catch (error) {
      toast.error('Failed to complete order');
    }
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-medium">Loading POS...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Main Product Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-card border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
            <p className="text-sm text-muted-foreground">Welcome, {user?.username}</p>
          </div>
          <div className="flex gap-3">
            {printerService.isSupported() && !printerConnected && (
              <Button
                variant="outline"
                data-testid="connect-printer-button"
                onClick={connectPrinter}
              >
                <Printer className="w-4 h-4 mr-2" />
                Connect Printer
              </Button>
            )}
            <Button
              variant="outline"
              data-testid="pending-orders-button"
              onClick={() => setShowPendingOrders(!showPendingOrders)}
            >
              <Receipt className="w-4 h-4 mr-2" />
              Pending Orders ({pendingOrders.length})
            </Button>
            <Button variant="outline" data-testid="pos-logout-button" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Categories */}
        <div className="px-6 py-4 border-b">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              data-testid="category-all-button"
              onClick={() => setSelectedCategory(null)}
              className="h-10 px-6 whitespace-nowrap"
            >
              All Products
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                data-testid={`category-button-${category.id}`}
                onClick={() => setSelectedCategory(category.id)}
                className="h-10 px-6 whitespace-nowrap"
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Products Grid or Pending Orders */}
        <ScrollArea className="flex-1 p-6">
          {showPendingOrders ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-4">Pending Orders</h2>
              {pendingOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No pending orders</div>
              ) : (
                pendingOrders.map((order) => {
                  const orderTable = order.table_id ? tables.find(t => t.id === order.table_id) : null;
                  return (
                  <Card key={order.id} data-testid={`pending-order-${order.id}`}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-lg font-bold flex items-center gap-2">
                            Order #{String(order.order_number).padStart(3, '0')}
                            {orderTable && (
                              <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                Table {orderTable.number}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(order.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold font-mono text-emerald-600">
                            ${order.total_amount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 mb-4">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>
                              {item.product_name} x {item.quantity}
                            </span>
                            <span className="font-mono">${item.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        className="w-full btn-success"
                        data-testid={`complete-order-${order.id}`}
                        onClick={() => openCompleteDialog(order)}
                      >
                        <DollarSign className="w-4 h-4 mr-2" />
                        Complete Payment
                      </Button>
                    </CardContent>
                  </Card>
                )})
              )}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No products available</div>
          ) : (
            <div className="pos-grid">
              {products.map((product) => (
                <Card
                  key={product.id}
                  data-testid={`product-card-${product.id}`}
                  className="product-card"
                  onClick={() => addToCart(product)}
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-32 object-cover" />
                  ) : (
                    <div className="w-full h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      <span className="text-4xl">🍽️</span>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="font-semibold text-sm mb-1 line-clamp-1">{product.name}</div>
                    <div className="text-xs text-muted-foreground mb-2">{product.category_name}</div>
                    <div className="price text-emerald-600">${product.price.toFixed(2)}</div>
                    {!product.in_stock && <div className="text-xs text-red-500 mt-1">Out of stock</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Cart Sidebar */}
      <div className="w-96 bg-card border-l flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6" />
              <h2 className="text-xl font-bold">Current Order</h2>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" data-testid="clear-cart-button" onClick={clearCart}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Table Selection */}
        <div className="px-6 py-3 border-b bg-slate-50">
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">Assign to Table</Label>
          <Select value={selectedTable || "no-table"} onValueChange={(v) => setSelectedTable(v === "no-table" ? null : v)}>
            <SelectTrigger data-testid="table-selector" className="w-full">
              <SelectValue placeholder="Select table (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no-table">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  No Table (Takeaway)
                </div>
              </SelectItem>
              {tables.filter(t => t.status === 'available' || t.status === 'occupied').map((table) => (
                <SelectItem key={table.id} value={table.id}>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Table {table.number}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      table.status === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {table.status === 'available' ? 'Free' : 'Occupied'}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1 p-6">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <Card key={item.product_id} data-testid={`cart-item-${item.product_id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="font-semibold">{item.product_name}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          ${item.unit_price.toFixed(2)} each
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`remove-item-${item.product_id}`}
                        onClick={() => removeFromCart(item.product_id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`decrease-qty-${item.product_id}`}
                          onClick={() => updateQuantity(item.product_id, -1)}
                          className="h-8 w-8 p-0"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="font-mono font-bold w-8 text-center">{item.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`increase-qty-${item.product_id}`}
                          onClick={() => updateQuantity(item.product_id, 1)}
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="font-bold font-mono text-lg">${item.total.toFixed(2)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t space-y-4">
          {/* Discount and Notes Buttons */}
          <div className="flex gap-2">
            <Button
              variant={showDiscountPanel ? "secondary" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => { setShowDiscountPanel(!showDiscountPanel); setShowNotesPanel(false); }}
              data-testid="toggle-discount-btn"
            >
              <Percent className="w-4 h-4 mr-1" />
              Discount
              {discountValue && <span className="ml-1 text-emerald-600">✓</span>}
            </Button>
            <Button
              variant={showNotesPanel ? "secondary" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => { setShowNotesPanel(!showNotesPanel); setShowDiscountPanel(false); }}
              data-testid="toggle-notes-btn"
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              Notes
              {orderNotes && <span className="ml-1 text-emerald-600">✓</span>}
            </Button>
          </div>

          {/* Discount Panel */}
          {showDiscountPanel && (
            <div className="p-3 bg-slate-50 rounded-lg space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={discountType === 'percentage' ? 'default' : 'outline'}
                  onClick={() => setDiscountType('percentage')}
                  className="flex-1"
                >
                  <Percent className="w-3 h-3 mr-1" />
                  Percentage
                </Button>
                <Button
                  size="sm"
                  variant={discountType === 'fixed' ? 'default' : 'outline'}
                  onClick={() => setDiscountType('fixed')}
                  className="flex-1"
                >
                  <Tag className="w-3 h-3 mr-1" />
                  Fixed
                </Button>
              </div>
              {discountType && (
                <>
                  <div>
                    <Input
                      type="number"
                      placeholder={discountType === 'percentage' ? 'Enter %' : 'Enter $'}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      data-testid="discount-value-input"
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Reason (optional)"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      data-testid="discount-reason-input"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setDiscountType(''); setDiscountValue(''); setDiscountReason(''); }} className="flex-1">
                      Clear
                    </Button>
                    <Button size="sm" onClick={() => setShowDiscountPanel(false)} className="flex-1">
                      Apply
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Notes Panel */}
          {showNotesPanel && (
            <div className="p-3 bg-slate-50 rounded-lg space-y-3">
              <Textarea
                placeholder="Order notes for kitchen (allergies, special requests...)"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                rows={3}
                data-testid="order-notes-input"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOrderNotes('')} className="flex-1">
                  Clear
                </Button>
                <Button size="sm" onClick={() => setShowNotesPanel(false)} className="flex-1">
                  Done
                </Button>
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items</span>
              <span className="font-medium">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">${cart.reduce((sum, item) => sum + item.total, 0).toFixed(2)}</span>
            </div>
            {calculateDiscount() > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount ({discountType === 'percentage' ? `${discountValue}%` : `$${discountValue}`})</span>
                <span className="font-mono">-${calculateDiscount().toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-xl font-bold">
              <span>Total</span>
              <span className="font-mono text-2xl">${calculateCartTotal().toFixed(2)}</span>
            </div>
          </div>
          <Button
            className="w-full h-14 text-lg bg-amber-500 hover:bg-amber-600 text-white"
            data-testid="place-order-button"
            onClick={placeOrder}
            disabled={cart.length === 0}
          >
            <Printer className="w-5 h-5 mr-2" />
            Place Order (Send to Kitchen)
          </Button>
        </div>
      </div>

      {/* Payment Method Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Complete Payment
              {selectedOrderToComplete?.table_id && (
                <span className="text-sm font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  Table {tables.find(t => t.id === selectedOrderToComplete.table_id)?.number || '?'}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Order #{String(selectedOrderToComplete?.order_number || '').padStart(3, '0')}
              {selectedOrderToComplete?.items?.length > 0 && (
                <span className="ml-2">• {selectedOrderToComplete.items.length} items</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Order Summary */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between text-sm mb-2">
                <span>Subtotal:</span>
                <span className="font-mono">${selectedOrderToComplete?.subtotal?.toFixed(2)}</span>
              </div>
              
              {/* Tip Section */}
              <Separator className="my-3" />
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Add Tip</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 15, 20].map((percent) => (
                    <Button
                      key={percent}
                      size="sm"
                      variant={tipPercentage === percent ? 'default' : 'outline'}
                      onClick={() => {
                        setTipPercentage(percent);
                        setCustomTip('');
                      }}
                      data-testid={`tip-${percent}-button`}
                    >
                      {percent}%
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={customTip ? 'default' : 'outline'}
                    onClick={() => setTipPercentage(0)}
                    data-testid="tip-custom-button"
                  >
                    Custom
                  </Button>
                </div>
                
                {(tipPercentage === 0 || customTip) && (
                  <div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Enter custom tip amount"
                      value={customTip}
                      onChange={(e) => {
                        setCustomTip(e.target.value);
                        setTipPercentage(0);
                      }}
                      data-testid="custom-tip-input"
                      className="h-10"
                    />
                  </div>
                )}
                
                {(tipPercentage > 0 || customTip) && (
                  <div className="flex justify-between text-sm">
                    <span>Tip Amount:</span>
                    <span className="font-mono text-emerald-600">
                      +${calculateTipAmount().toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Split Payment Section */}
              <Separator className="my-3" />
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Split Payment
                </Label>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSplitCount(Math.max(1, splitCount - 1))}
                    data-testid="split-decrease"
                    className="h-8 w-8 p-0"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="font-mono font-bold w-12 text-center">{splitCount}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSplitCount(splitCount + 1)}
                    data-testid="split-increase"
                    className="h-8 w-8 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {splitCount > 1 ? `(${splitCount} people)` : 'people'}
                  </span>
                </div>
                
                {splitCount > 1 && (
                  <div className="flex justify-between text-sm">
                    <span>Per Person:</span>
                    <span className="font-mono text-blue-600">
                      ${calculatePerPersonAmount().toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              
              <Separator className="my-3" />
              <div className="flex justify-between font-bold text-lg">
                <span>Grand Total:</span>
                <span className="font-mono text-emerald-600">
                  ${calculateGrandTotal().toFixed(2)}
                </span>
              </div>
              
              {/* Table info if assigned */}
              {selectedOrderToComplete?.table_id && (
                <div className="mt-2 p-2 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Table will be cleared after payment
                </div>
              )}
            </div>
            
            {/* Split Payment Method Toggle */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={splitPaymentMode ? "default" : "outline"}
                  onClick={() => setSplitPaymentMode(!splitPaymentMode)}
                  data-testid="toggle-split-payment-mode"
                  className="w-full"
                >
                  <Banknote className="w-4 h-4 mr-2" />
                  {splitPaymentMode ? "Split Payment Mode ON" : "Pay with Multiple Methods"}
                </Button>
              </div>
              
              {/* Split Payment Method Inputs */}
              {splitPaymentMode && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                  <div className="text-sm font-medium text-amber-800">Enter amounts for each payment method:</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> Cash
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                        data-testid="split-cash-input"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <CreditCard className="w-3 h-3" /> Card
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={cardAmount}
                        onChange={(e) => setCardAmount(e.target.value)}
                        data-testid="split-card-input"
                        className="h-10"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span>Total Entered:</span>
                    <span className={`font-mono font-bold ${Math.abs((parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) - calculateGrandTotal()) <= 0.02 ? 'text-emerald-600' : 'text-red-600'}`}>
                      ${((parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0)).toFixed(2)}
                    </span>
                  </div>
                  {calculateRemainingAmount() > 0.02 && (
                    <div className="text-xs text-amber-700">
                      Remaining: ${calculateRemainingAmount().toFixed(2)}
                    </div>
                  )}
                  <Button
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
                    data-testid="complete-split-payment"
                    onClick={() => completeOrder('split')}
                    disabled={Math.abs((parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) - calculateGrandTotal()) > 0.02}
                  >
                    Complete Split Payment
                  </Button>
                </div>
              )}
            </div>
            
            {/* Single Payment Method Buttons */}
            {!splitPaymentMode && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  className="h-20 flex flex-col gap-2"
                  data-testid="payment-cash-button"
                  onClick={() => completeOrder('cash')}
                >
                  <DollarSign className="w-8 h-8" />
                  <span className="text-base font-bold">Cash</span>
                  {splitCount > 1 && (
                    <span className="text-xs opacity-75">${calculatePerPersonAmount().toFixed(2)} each</span>
                  )}
                </Button>
                <Button
                  className="h-20 flex flex-col gap-2"
                  variant="secondary"
                  data-testid="payment-card-button"
                  onClick={() => completeOrder('card')}
                >
                  <CreditCard className="w-8 h-8" />
                  <span className="text-base font-bold">Card</span>
                  {splitCount > 1 && (
                    <span className="text-xs opacity-75">${calculatePerPersonAmount().toFixed(2)} each</span>
                  )}
                </Button>
              </div>
            )}
            
            {/* Split Bill Summary */}
            {splitCount > 1 && (
              <div className="mt-3 p-3 bg-slate-100 rounded-lg">
                <div className="text-sm font-semibold mb-2">Split Summary</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Array.from({ length: splitCount }, (_, i) => (
                    <div key={i} className="flex justify-between p-2 bg-white rounded border">
                      <span>Person {i + 1}</span>
                      <span className="font-mono font-medium">${calculatePerPersonAmount().toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSScreen;
```

---

## FILE: pages/PlatformCategories.js
```javascript
import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Globe, FolderTree } from 'lucide-react';

// This uses the same backend /api/categories but for global platform categories
// Platform owner manages default categories that can be assigned to restaurants

const PlatformCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  // Default global categories for restaurants
  const defaultCategories = [
    { id: 'global_1', name: 'Appetizers', description: 'Starters and small plates', isDefault: true },
    { id: 'global_2', name: 'Main Course', description: 'Main dishes and entrees', isDefault: true },
    { id: 'global_3', name: 'Desserts', description: 'Sweet treats and desserts', isDefault: true },
    { id: 'global_4', name: 'Beverages', description: 'Drinks and refreshments', isDefault: true },
    { id: 'global_5', name: 'Sides', description: 'Side dishes and accompaniments', isDefault: true },
    { id: 'global_6', name: 'Specials', description: 'Daily specials and promotions', isDefault: true },
  ];

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      // For now, use default categories. Later, fetch from API
      setCategories(defaultCategories);
    } catch (error) {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        // Update category
        setCategories(categories.map(c => 
          c.id === editingCategory.id 
            ? { ...c, ...formData }
            : c
        ));
        toast.success('Category updated!');
      } else {
        // Create new category
        const newCategory = {
          id: `global_${Date.now()}`,
          ...formData,
          isDefault: false
        };
        setCategories([...categories, newCategory]);
        toast.success('Category created!');
      }
      setShowAddCategory(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '' });
    } catch (error) {
      toast.error('Failed to save category');
    }
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({ name: category.name, description: category.description || '' });
    setShowAddCategory(true);
  };

  const handleDelete = (categoryId) => {
    if (!window.confirm('Remove this global category?')) return;
    setCategories(categories.filter(c => c.id !== categoryId));
    toast.success('Category removed');
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading categories...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Global Categories</h1>
              <p className="text-muted-foreground">
                Default categories available for all restaurants during onboarding
              </p>
            </div>
            <Dialog open={showAddCategory} onOpenChange={(open) => {
              setShowAddCategory(open);
              if (!open) {
                setEditingCategory(null);
                setFormData({ name: '', description: '' });
              }
            }}>
              <DialogTrigger asChild>
                <Button data-testid="add-global-category-button">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Global Category'}</DialogTitle>
                  <DialogDescription>
                    This category will be available for all restaurants
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="name">Category Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Appetizers"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of the category"
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="flex-1">
                      {editingCategory ? 'Update' : 'Create'} Category
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowAddCategory(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Info Card */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-800">
                    <strong>Global categories</strong> are default templates available when onboarding new restaurants. 
                    Restaurant admins can customize their own categories based on these templates.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Categories Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <Card key={category.id} data-testid={`category-${category.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FolderTree className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{category.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {category.description || 'No description'}
                        </p>
                      </div>
                    </div>
                    {category.isDefault && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4 justify-end">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(category)}>
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    {!category.isDefault && (
                      <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleDelete(category.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformCategories;
```

---

## FILE: pages/PlatformDashboard.js
```javascript
import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Building2, TrendingUp, DollarSign, Users, AlertTriangle, CheckCircle } from 'lucide-react';

const PlatformDashboard = () => {
  const [stats, setStats] = useState({
    totalRestaurants: 0,
    activeRestaurants: 0,
    trialRestaurants: 0,
    totalRevenue: 0,
    thisMonthRevenue: 0,
    lastMonthRevenue: 0
  });
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await restaurantAPI.getAll();
      setRestaurants(data);
      
      // Calculate stats
      const active = data.filter(r => r.subscription_status === 'active').length;
      const trial = data.filter(r => r.subscription_status === 'trial').length;
      const totalRevenue = data.reduce((sum, r) => {
        if (r.subscription_status === 'active') {
          return sum + (r.price || 0);
        }
        return sum;
      }, 0);
      
      setStats({
        totalRestaurants: data.length,
        activeRestaurants: active,
        trialRestaurants: trial,
        totalRevenue: totalRevenue,
        thisMonthRevenue: totalRevenue,
        lastMonthRevenue: totalRevenue * 0.9 // Placeholder
      });
    } catch (error) {
      toast.error('Failed to load platform data');
    } finally {
      setLoading(false);
    }
  };

  const revenueGrowth = stats.lastMonthRevenue > 0 
    ? ((stats.thisMonthRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue * 100).toFixed(1)
    : 0;

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading platform data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Platform Dashboard</h1>
            <p className="text-muted-foreground">Overview of all restaurants and platform metrics</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Restaurants</CardTitle>
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalRestaurants}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Registered on platform
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">{stats.activeRestaurants}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Paying customers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Trial Users</CardTitle>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{stats.trialRestaurants}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  14-day trial period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <DollarSign className="h-5 w-5 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${stats.thisMonthRevenue.toFixed(2)}</div>
                <p className={`text-xs mt-1 ${Number(revenueGrowth) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {Number(revenueGrowth) >= 0 ? '+' : ''}{revenueGrowth}% from last month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Restaurants */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Restaurants</CardTitle>
              <CardDescription>Latest restaurants added to the platform</CardDescription>
            </CardHeader>
            <CardContent>
              {restaurants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No restaurants yet. Go to Restaurants to add one.
                </div>
              ) : (
                <div className="space-y-4">
                  {restaurants.slice(0, 5).map((restaurant) => (
                    <div key={restaurant.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold">{restaurant.business_info?.name || 'Unnamed'}</div>
                          <div className="text-sm text-muted-foreground">
                            {restaurant.business_info?.city || 'No location'} • {restaurant.owner_email}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          restaurant.subscription_status === 'active' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {restaurant.subscription_status?.toUpperCase() || 'TRIAL'}
                        </div>
                        <div className="text-sm font-medium mt-1">
                          ${restaurant.price || 0}/mo
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PlatformDashboard;
```

---

## FILE: pages/PlatformReports.js
```javascript
import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { BarChart3, Download, Building2, TrendingUp, DollarSign, Calendar } from 'lucide-react';

const PlatformReports = () => {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('this_month');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    avgRevenuePerRestaurant: 0,
    trialConversionRate: 0,
    churnRate: 0,
    newSignups: 0
  });

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  const loadData = async () => {
    try {
      const data = await restaurantAPI.getAll();
      setRestaurants(data);
      
      // Calculate platform stats
      const active = data.filter(r => r.subscription_status === 'active');
      const trials = data.filter(r => r.subscription_status === 'trial');
      const totalRevenue = active.reduce((sum, r) => sum + (r.price || 0), 0);
      
      setStats({
        totalRevenue: totalRevenue,
        avgRevenuePerRestaurant: active.length > 0 ? totalRevenue / active.length : 0,
        trialConversionRate: data.length > 0 ? (active.length / data.length * 100) : 0,
        churnRate: 2.5, // Placeholder
        newSignups: trials.length
      });
    } catch (error) {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = () => {
    toast.success('Report export started - feature coming soon!');
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading reports...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Platform Reports</h1>
              <p className="text-muted-foreground">Analytics and insights across all restaurants</p>
            </div>
            <div className="flex items-center gap-4">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="this_quarter">This Quarter</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleExportReport}>
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Total MRR
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</div>
                <p className="text-xs text-emerald-600">Monthly recurring revenue</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Avg Revenue/Restaurant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${stats.avgRevenuePerRestaurant.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Per active customer</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Trial Conversion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.trialConversionRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">Trial to paid</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  New Signups
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.newSignups}</div>
                <p className="text-xs text-muted-foreground">Active trials</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Churn Rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.churnRate}%</div>
                <p className="text-xs text-amber-600">Monthly churn</p>
              </CardContent>
            </Card>
          </div>

          {/* Restaurant Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Restaurant Performance</CardTitle>
              <CardDescription>Revenue breakdown by restaurant</CardDescription>
            </CardHeader>
            <CardContent>
              {restaurants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No restaurants to display
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Restaurant</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Plan</th>
                        <th className="text-right py-3 px-4 font-medium">Monthly Fee</th>
                        <th className="text-left py-3 px-4 font-medium">Since</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restaurants.map((restaurant) => (
                        <tr key={restaurant.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium">{restaurant.business_info?.name || 'Unnamed'}</div>
                              <div className="text-sm text-muted-foreground">{restaurant.owner_email}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              restaurant.subscription_status === 'active' 
                                ? 'bg-emerald-100 text-emerald-700'
                                : restaurant.subscription_status === 'trial'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {restaurant.subscription_status?.toUpperCase() || 'TRIAL'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            {restaurant.subscription_plan || 'Standard'}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            ${restaurant.price || 0}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {new Date(restaurant.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PlatformReports;
```

---

## FILE: pages/PlatformSettings.js
```javascript
import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { Settings, Bell, Shield, CreditCard, Mail, Globe } from 'lucide-react';

const PlatformSettings = () => {
  const [settings, setSettings] = useState({
    platformName: 'HevaPOS',
    supportEmail: 'support@hevapos.com',
    defaultTrialDays: 14,
    defaultPlanPrice: 19.99,
    defaultCurrency: 'GBP',
    enableEmailNotifications: true,
    enableTrialReminders: true,
    enableAutoSuspend: false,
    stripeEnabled: false,
    stripePublicKey: '',
    stripeSecretKey: ''
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Save to backend
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Platform settings saved!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Platform Settings</h1>
            <p className="text-muted-foreground">Configure global platform settings and preferences</p>
          </div>

          {/* General Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                General Settings
              </CardTitle>
              <CardDescription>Basic platform configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="platformName">Platform Name</Label>
                  <Input
                    id="platformName"
                    value={settings.platformName}
                    onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={settings.supportEmail}
                    onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Subscription Defaults
              </CardTitle>
              <CardDescription>Default settings for new restaurant subscriptions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="trialDays">Trial Period (Days)</Label>
                  <Input
                    id="trialDays"
                    type="number"
                    min="0"
                    value={settings.defaultTrialDays}
                    onChange={(e) => setSettings({ ...settings, defaultTrialDays: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="defaultPrice">Default Price</Label>
                  <Input
                    id="defaultPrice"
                    type="number"
                    step="0.01"
                    value={settings.defaultPlanPrice}
                    onChange={(e) => setSettings({ ...settings, defaultPlanPrice: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Default Currency</Label>
                  <Input
                    id="currency"
                    value={settings.defaultCurrency}
                    onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notifications
              </CardTitle>
              <CardDescription>Configure email and notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send email notifications for important events</p>
                </div>
                <Switch
                  checked={settings.enableEmailNotifications}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableEmailNotifications: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trial Expiry Reminders</Label>
                  <p className="text-sm text-muted-foreground">Send reminders before trial period ends</p>
                </div>
                <Switch
                  checked={settings.enableTrialReminders}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableTrialReminders: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-Suspend Inactive</Label>
                  <p className="text-sm text-muted-foreground">Automatically suspend accounts after trial expires</p>
                </div>
                <Switch
                  checked={settings.enableAutoSuspend}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableAutoSuspend: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Payment Integration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Payment Integration
              </CardTitle>
              <CardDescription>Configure payment gateway for subscriptions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label>Enable Stripe</Label>
                  <p className="text-sm text-muted-foreground">Accept payments via Stripe</p>
                </div>
                <Switch
                  checked={settings.stripeEnabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, stripeEnabled: checked })}
                />
              </div>
              {settings.stripeEnabled && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label htmlFor="stripePublic">Stripe Publishable Key</Label>
                    <Input
                      id="stripePublic"
                      value={settings.stripePublicKey}
                      onChange={(e) => setSettings({ ...settings, stripePublicKey: e.target.value })}
                      placeholder="pk_live_..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="stripeSecret">Stripe Secret Key</Label>
                    <Input
                      id="stripeSecret"
                      type="password"
                      value={settings.stripeSecretKey}
                      onChange={(e) => setSettings({ ...settings, stripeSecretKey: e.target.value })}
                      placeholder="sk_live_..."
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Mail className="w-3 h-3 inline mr-1" />
                    Get your API keys from the <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-primary underline">Stripe Dashboard</a>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformSettings;
```

---

## FILE: pages/PrinterSettings.js
```javascript
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { printerAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { 
  LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, 
  Wallet, Settings, Plus, Printer, Wifi, Bluetooth, Trash2, TestTube,
  Check, Star, Edit
} from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout, canAccessRestaurants } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/tables', icon: Package, label: 'Tables' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/pos', icon: ShoppingCart, label: 'POS' },
    { path: '/orders', icon: FileText, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
    { path: '/printers', icon: Printer, label: 'Printers' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Printer Settings</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const PrinterSettings = () => {
  const location = useLocation();
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState(null);
  const [testResult, setTestResult] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'wifi',
    address: '',
    is_default: false,
    paper_width: 80
  });

  useEffect(() => {
    loadPrinters();
  }, []);

  const loadPrinters = async () => {
    try {
      const data = await printerAPI.getAll();
      setPrinters(data);
    } catch (error) {
      toast.error('Failed to load printers');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'wifi',
      address: '',
      is_default: false,
      paper_width: 80
    });
    setEditingPrinter(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPrinter) {
        await printerAPI.update(editingPrinter.id, formData);
        toast.success('Printer updated!');
      } else {
        await printerAPI.create(formData);
        toast.success('Printer added!');
      }
      setShowAddPrinter(false);
      resetForm();
      loadPrinters();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save printer');
    }
  };

  const handleDelete = async (printerId) => {
    if (!window.confirm('Are you sure you want to delete this printer?')) return;
    try {
      await printerAPI.delete(printerId);
      toast.success('Printer deleted');
      loadPrinters();
    } catch (error) {
      toast.error('Failed to delete printer');
    }
  };

  const handleTest = async (printer) => {
    try {
      toast.loading('Testing printer...');
      const result = await printerAPI.test(printer.id);
      setTestResult(result);
      toast.dismiss();
      toast.success('Test receipt generated! Check the result below.');
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to test printer');
    }
  };

  const handleEdit = (printer) => {
    setFormData({
      name: printer.name,
      type: printer.type,
      address: printer.address,
      is_default: printer.is_default,
      paper_width: printer.paper_width
    });
    setEditingPrinter(printer);
    setShowAddPrinter(true);
  };

  const handleSetDefault = async (printer) => {
    try {
      await printerAPI.update(printer.id, { is_default: true });
      toast.success(`${printer.name} is now the default printer`);
      loadPrinters();
    } catch (error) {
      toast.error('Failed to set default printer');
    }
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Printer Settings</h1>
              <p className="text-muted-foreground">Configure ESC/POS thermal printers for receipts</p>
            </div>
            <Dialog open={showAddPrinter} onOpenChange={(open) => { setShowAddPrinter(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button data-testid="add-printer-button">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Printer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingPrinter ? 'Edit Printer' : 'Add New Printer'}</DialogTitle>
                  <DialogDescription>
                    Configure a thermal receipt printer (ESC/POS compatible)
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="name">Printer Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g., Kitchen Printer"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Connection Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) => setFormData({...formData, type: v, address: ''})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wifi">
                          <div className="flex items-center gap-2">
                            <Wifi className="w-4 h-4" />
                            WiFi / Network
                          </div>
                        </SelectItem>
                        <SelectItem value="bluetooth">
                          <div className="flex items-center gap-2">
                            <Bluetooth className="w-4 h-4" />
                            Bluetooth
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="address">
                      {formData.type === 'wifi' ? 'IP Address:Port *' : 'Bluetooth MAC Address *'}
                    </Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      placeholder={formData.type === 'wifi' ? '192.168.1.100:9100' : '00:11:22:33:44:55'}
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.type === 'wifi' 
                        ? 'Usually port 9100 for ESC/POS printers'
                        : 'Find this in your printer\'s Bluetooth settings'}
                    </p>
                  </div>

                  <div>
                    <Label>Paper Width</Label>
                    <Select
                      value={formData.paper_width.toString()}
                      onValueChange={(v) => setFormData({...formData, paper_width: parseInt(v)})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="80">80mm (Standard)</SelectItem>
                        <SelectItem value="58">58mm (Compact)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_default">Set as default printer</Label>
                    <Switch
                      id="is_default"
                      checked={formData.is_default}
                      onCheckedChange={(v) => setFormData({...formData, is_default: v})}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="flex-1">
                      {editingPrinter ? 'Update Printer' : 'Add Printer'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setShowAddPrinter(false); resetForm(); }}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Printers List */}
          {printers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Printer className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">No printers configured</h3>
                <p className="text-muted-foreground mb-4">
                  Add a thermal receipt printer to start printing kitchen and customer receipts.
                </p>
                <Button onClick={() => setShowAddPrinter(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Printer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {printers.map((printer) => (
                <Card key={printer.id} data-testid={`printer-${printer.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                          printer.type === 'wifi' ? 'bg-blue-100' : 'bg-purple-100'
                        }`}>
                          {printer.type === 'wifi' 
                            ? <Wifi className="w-7 h-7 text-blue-600" />
                            : <Bluetooth className="w-7 h-7 text-purple-600" />
                          }
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold">{printer.name}</h3>
                            {printer.is_default && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                                <Star className="w-3 h-3" />
                                Default
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            <span className="font-mono">{printer.address}</span>
                            <span className="mx-2">•</span>
                            <span>{printer.paper_width}mm paper</span>
                            <span className="mx-2">•</span>
                            <span className="capitalize">{printer.type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!printer.is_default && (
                          <Button size="sm" variant="outline" onClick={() => handleSetDefault(printer)}>
                            <Star className="w-4 h-4 mr-1" />
                            Set Default
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleTest(printer)}>
                          <TestTube className="w-4 h-4 mr-1" />
                          Test
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(printer)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleDelete(printer.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Test Result */}
          {testResult && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-500" />
                  Test Receipt Generated
                </CardTitle>
                <CardDescription>
                  Send these ESC/POS commands to your printer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                  <p className="text-sm mb-2"><strong>Printer:</strong> {testResult.printer}</p>
                  <p className="text-sm mb-2"><strong>Type:</strong> {testResult.type}</p>
                  <p className="text-sm mb-2"><strong>Address:</strong> {testResult.address}</p>
                  <div className="mt-4">
                    <p className="text-sm font-semibold mb-2">ESC/POS Commands (Base64):</p>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded font-mono text-xs break-all max-h-40 overflow-auto">
                      {testResult.commands}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    {testResult.instructions}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    navigator.clipboard.writeText(testResult.commands);
                    toast.success('Copied to clipboard!');
                  }}
                >
                  Copy Commands
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Help Section */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Printing Guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-1">WiFi Printers</h4>
                <p className="text-sm text-muted-foreground">
                  Connect your printer to the same network as your POS device. Use the printer's IP address 
                  and port (usually 9100). Example: 192.168.1.100:9100
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Bluetooth Printers</h4>
                <p className="text-sm text-muted-foreground">
                  Pair your Bluetooth printer with your device first. Enter the Bluetooth MAC address 
                  from your printer's settings. Example: 00:11:22:33:44:55
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Supported Printers</h4>
                <p className="text-sm text-muted-foreground">
                  HevaPOS supports ESC/POS compatible thermal printers including Epson TM series, 
                  Star TSP series, and most generic 58mm/80mm thermal printers.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PrinterSettings;
```

---

## FILE: pages/ProductManagement.js
```javascript
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { categoryAPI, productAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Wallet, Store, Plus, Edit, Trash2 } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/restaurants', icon: Store, label: 'Restaurants' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Panel</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const ProductManagement = () => {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    price: '',
    image_url: '',
    in_stock: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [prods, cats] = await Promise.all([productAPI.getAll(), categoryAPI.getAll()]);
      setProducts(prods);
      setCategories(cats);
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        price: parseFloat(formData.price),
      };

      if (editingProduct) {
        await productAPI.update(editingProduct.id, data);
        toast.success('Product updated successfully');
      } else {
        await productAPI.create(data);
        toast.success('Product created successfully');
      }

      setOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', category_id: '', price: '', image_url: '', in_stock: true });
      loadData();
    } catch (error) {
      toast.error('Failed to save product');
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category_id: product.category_id,
      price: product.price.toString(),
      image_url: product.image_url || '',
      in_stock: product.in_stock,
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;

    try {
      await productAPI.delete(id);
      toast.success('Product deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Products</h1>
              <p className="text-muted-foreground">Manage your restaurant menu items</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="add-product-button"
                  onClick={() => {
                    setEditingProduct(null);
                    setFormData({ name: '', category_id: '', price: '', image_url: '', in_stock: true });
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                  <DialogDescription>
                    {editingProduct ? 'Update product details' : 'Create a new product for your menu'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Product Name</Label>
                    <Input
                      id="name"
                      data-testid="product-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                      required
                    >
                      <SelectTrigger data-testid="product-category-select">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="price">Price ($)</Label>
                    <Input
                      id="price"
                      data-testid="product-price-input"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="image_url">Image URL (optional)</Label>
                    <Input
                      id="image_url"
                      data-testid="product-image-input"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="in_stock"
                      data-testid="product-stock-checkbox"
                      checked={formData.in_stock}
                      onChange={(e) => setFormData({ ...formData, in_stock: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="in_stock" className="cursor-pointer">
                      In Stock
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" data-testid="product-submit-button" className="flex-1">
                      {editingProduct ? 'Update' : 'Create'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setOpen(false);
                        setEditingProduct(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {products.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No products yet. Click "Add Product" to create your first menu item.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <Card key={product.id} data-testid={`product-item-${product.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-bold text-lg">{product.name}</div>
                        <div className="text-sm text-muted-foreground font-normal">
                          {product.category_name}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`edit-product-${product.id}`}
                          onClick={() => handleEdit(product)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`delete-product-${product.id}`}
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-40 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold font-mono text-emerald-600">
                          ${product.price.toFixed(2)}
                        </div>
                        <div
                          className={`text-sm px-3 py-1 rounded-full ${
                            product.in_stock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {product.in_stock ? 'In Stock' : 'Out of Stock'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductManagement;```

---

## FILE: pages/Reports.js
```javascript
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Wallet, Store, Download, Calendar, TrendingUp } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/restaurants', icon: Store, label: 'Restaurants' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Panel</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const Reports = () => {
  const location = useLocation();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loadStats = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    setLoading(true);
    try {
      const data = await reportAPI.getStats(
        new Date(startDate).toISOString(),
        new Date(endDate).toISOString()
      );
      setStats(data);
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    setDownloading(true);
    try {
      const blob = await reportAPI.generatePDF(
        new Date(startDate).toISOString(),
        new Date(endDate).toISOString()
      );
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_report_${startDate}_to_${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('PDF downloaded successfully');
    } catch (error) {
      toast.error('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Sales Reports</h1>
            <p className="text-muted-foreground">Generate detailed sales reports for any date range</p>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold">Report Configuration</CardTitle>
              <CardDescription>Select date range to generate your sales report</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    data-testid="report-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-12"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    data-testid="report-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-12"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Quick Ranges</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    data-testid="quick-range-today"
                    onClick={() => setQuickRange(0)}
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="quick-range-week"
                    onClick={() => setQuickRange(7)}
                  >
                    Last 7 Days
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="quick-range-month"
                    onClick={() => setQuickRange(30)}
                  >
                    Last 30 Days
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="quick-range-quarter"
                    onClick={() => setQuickRange(90)}
                  >
                    Last 90 Days
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1 h-12"
                  data-testid="generate-report-button"
                  onClick={loadStats}
                  disabled={loading || !startDate || !endDate}
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  {loading ? 'Generating...' : 'Generate Report'}
                </Button>
                <Button
                  className="flex-1 h-12"
                  variant="secondary"
                  data-testid="download-pdf-button"
                  onClick={downloadPDF}
                  disabled={downloading || !startDate || !endDate}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {downloading ? 'Downloading...' : 'Download PDF'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {stats && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Card className="metric-card" data-testid="report-total-sales">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Total Sales
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono text-emerald-600">
                      ${stats.total_sales.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="report-total-orders">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Total Orders
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono">{stats.total_orders}</div>
                  </CardContent>
                </Card>

                <Card className="metric-card" data-testid="report-avg-order">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-sm font-medium uppercase tracking-wider">
                      Avg Order Value
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono text-blue-600">
                      ${stats.avg_order_value.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {stats.top_products && stats.top_products.length > 0 && (
                <Card data-testid="report-top-products">
                  <CardHeader>
                    <CardTitle className="text-2xl font-semibold">Top Selling Products</CardTitle>
                    <CardDescription>
                      From {startDate} to {endDate}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.top_products.map((product, index) => (
                        <div
                          key={index}
                          data-testid={`report-product-${index}`}
                          className="flex items-center justify-between p-4 rounded-lg border bg-card"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary">
                              #{index + 1}
                            </div>
                            <div>
                              <div className="font-semibold text-lg">{product.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {product.quantity} units sold
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold font-mono text-emerald-600">
                              ${product.revenue.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">Revenue</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
```

---

## FILE: pages/RestaurantManagement.js
```javascript
import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Store, Building2, Mail, Phone, MapPin, DollarSign, User, Users, Trash2, Key } from 'lucide-react';

const CURRENCY_OPTIONS = [
  { value: 'GBP', label: '£ GBP - British Pound', symbol: '£' },
  { value: 'USD', label: '$ USD - US Dollar', symbol: '$' },
  { value: 'EUR', label: '€ EUR - Euro', symbol: '€' },
  { value: 'INR', label: '₹ INR - Indian Rupee', symbol: '₹' },
  { value: 'AUD', label: '$ AUD - Australian Dollar', symbol: '$' },
  { value: 'CAD', label: '$ CAD - Canadian Dollar', symbol: '$' },
];

const RestaurantManagement = () => {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [restaurantUsers, setRestaurantUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    postcode: '',
    phone: '',
    email: '',
    website: '',
    vat_number: '',
    receipt_footer: '',
    subscription_price: '',
    currency: 'GBP',
    // Admin user for the restaurant
    admin_username: '',
    admin_password: '',
  });
  const [newUserData, setNewUserData] = useState({
    username: '',
    password: '',
    role: 'user'
  });

  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    try {
      const data = await restaurantAPI.getAll();
      setRestaurants(data);
    } catch (error) {
      toast.error('Failed to load restaurants');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Create restaurant first
      const restaurant = await restaurantAPI.create({
        name: formData.name,
        address_line1: formData.address_line1,
        address_line2: formData.address_line2,
        city: formData.city,
        postcode: formData.postcode,
        phone: formData.phone,
        email: formData.email,
        website: formData.website,
        vat_number: formData.vat_number,
        receipt_footer: formData.receipt_footer,
        subscription_price: parseFloat(formData.subscription_price),
        currency: formData.currency,
      });
      
      // Create admin user for the restaurant if provided
      if (formData.admin_username && formData.admin_password) {
        try {
          await restaurantAPI.createUser(restaurant.id, {
            username: formData.admin_username,
            password: formData.admin_password,
            role: 'admin',
            restaurant_id: restaurant.id
          });
          toast.success(`Restaurant and admin user "${formData.admin_username}" created!`);
        } catch (userError) {
          toast.warning(`Restaurant created, but user creation failed: ${userError.response?.data?.detail || 'Unknown error'}`);
        }
      } else {
        toast.success('Restaurant added successfully!');
      }
      
      setShowAddDialog(false);
      resetForm();
      loadRestaurants();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add restaurant');
    } finally {
      setSaving(false);
    }
  };

  const openUserManagement = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    try {
      const users = await restaurantAPI.getUsers(restaurant.id);
      setRestaurantUsers(users);
    } catch (error) {
      setRestaurantUsers([]);
    }
    setShowUserDialog(true);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!selectedRestaurant) return;
    
    try {
      await restaurantAPI.createUser(selectedRestaurant.id, {
        ...newUserData,
        restaurant_id: selectedRestaurant.id
      });
      toast.success(`User "${newUserData.username}" created!`);
      setNewUserData({ username: '', password: '', role: 'user' });
      // Refresh users
      const users = await restaurantAPI.getUsers(selectedRestaurant.id);
      setRestaurantUsers(users);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Delete user "${username}"?`)) return;
    
    try {
      await restaurantAPI.deleteUser(selectedRestaurant.id, userId);
      toast.success('User deleted');
      const users = await restaurantAPI.getUsers(selectedRestaurant.id);
      setRestaurantUsers(users);
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address_line1: '',
      address_line2: '',
      city: '',
      postcode: '',
      phone: '',
      email: '',
      website: '',
      vat_number: '',
      receipt_footer: '',
      subscription_price: '',
      currency: 'GBP',
      admin_username: '',
      admin_password: '',
    });
  };

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const getCurrencySymbol = (currency) => {
    return CURRENCY_OPTIONS.find(c => c.value === currency)?.symbol || currency;
  };

  const getTotalRevenue = () => {
    const activeRestaurants = restaurants.filter(r => r.subscription_status === 'active');
    return activeRestaurants.reduce((sum, r) => sum + r.price, 0);
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Restaurant Management</h1>
              <p className="text-muted-foreground">Manage all your HevaPOS customers</p>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button data-testid="add-restaurant-button" onClick={resetForm}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Restaurant
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Restaurant</DialogTitle>
                  <DialogDescription>
                    Create a new restaurant account with custom pricing
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="name">Restaurant Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <Label htmlFor="email">Owner Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone *</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="address1">Address *</Label>
                      <Input
                        id="address1"
                        value={formData.address_line1}
                        onChange={(e) => handleChange('address_line1', e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => handleChange('city', e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="postcode">Postcode *</Label>
                      <Input
                        id="postcode"
                        value={formData.postcode}
                        onChange={(e) => handleChange('postcode', e.target.value)}
                        required
                      />
                    </div>

                    <div className="col-span-2 border-t pt-4 mt-2">
                      <h3 className="font-semibold mb-3">Subscription Pricing</h3>
                    </div>

                    <div>
                      <Label htmlFor="currency">Currency *</Label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => handleChange('currency', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((curr) => (
                            <SelectItem key={curr.value} value={curr.value}>
                              {curr.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="price">Monthly Price *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {getCurrencySymbol(formData.currency)}
                        </span>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={formData.subscription_price}
                          onChange={(e) => handleChange('subscription_price', e.target.value)}
                          className="pl-8"
                          placeholder="19.99"
                          required
                        />
                      </div>
                    </div>

                    <div className="col-span-2 border-t pt-4 mt-2">
                      <h3 className="font-semibold mb-1 flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        Admin User (Optional)
                      </h3>
                      <p className="text-xs text-muted-foreground mb-3">Create an admin account for this restaurant</p>
                    </div>

                    <div>
                      <Label htmlFor="admin_username">Admin Username</Label>
                      <Input
                        id="admin_username"
                        value={formData.admin_username}
                        onChange={(e) => handleChange('admin_username', e.target.value)}
                        placeholder="e.g., admin_pizzapalace"
                      />
                    </div>

                    <div>
                      <Label htmlFor="admin_password">Admin Password</Label>
                      <Input
                        id="admin_password"
                        type="password"
                        value={formData.admin_password}
                        onChange={(e) => handleChange('admin_password', e.target.value)}
                        placeholder="Min 6 characters"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button type="submit" disabled={saving} className="flex-1">
                      {saving ? 'Adding...' : 'Add Restaurant'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* User Management Dialog */}
          <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Manage Users - {selectedRestaurant?.business_info?.name}
                </DialogTitle>
                <DialogDescription>
                  Create and manage users for this restaurant
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                {/* Add New User Form */}
                <form onSubmit={handleAddUser} className="space-y-3 p-4 bg-slate-50 rounded-lg">
                  <h4 className="font-medium text-sm">Add New User</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Username</Label>
                      <Input
                        value={newUserData.username}
                        onChange={(e) => setNewUserData({...newUserData, username: e.target.value})}
                        placeholder="username"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Password</Label>
                      <Input
                        type="password"
                        value={newUserData.password}
                        onChange={(e) => setNewUserData({...newUserData, password: e.target.value})}
                        placeholder="password"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Select value={newUserData.role} onValueChange={(v) => setNewUserData({...newUserData, role: v})}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="submit" size="sm" className="flex-1">
                      <Plus className="w-3 h-3 mr-1" />
                      Add User
                    </Button>
                  </div>
                </form>

                {/* Existing Users */}
                <div>
                  <h4 className="font-medium text-sm mb-2">Existing Users ({restaurantUsers.length})</h4>
                  {restaurantUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users yet</p>
                  ) : (
                    <div className="space-y-2">
                      {restaurantUsers.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{user.username}</div>
                              <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDeleteUser(user.id, user.username)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription className="text-sm font-medium">Total Restaurants</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{restaurants.length}</div>
              </CardContent>
            </Card>

            <Card className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription className="text-sm font-medium">Active</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">
                  {restaurants.filter(r => r.subscription_status === 'active').length}
                </div>
              </CardContent>
            </Card>

            <Card className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription className="text-sm font-medium">On Trial</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">
                  {restaurants.filter(r => r.subscription_status === 'trial').length}
                </div>
              </CardContent>
            </Card>

            <Card className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription className="text-sm font-medium">Monthly Revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  £{getTotalRevenue().toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Restaurants List */}
          {restaurants.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No restaurants yet. Click "Add Restaurant" to add your first customer.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {restaurants.map((restaurant) => (
                <Card key={restaurant.id} data-testid={`restaurant-${restaurant.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold">{restaurant.business_info?.name || 'Unnamed'}</h3>
                          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            restaurant.subscription_status === 'active' 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : restaurant.subscription_status === 'trial'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {restaurant.subscription_status.toUpperCase()}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {restaurant.business_info?.address_line1 && (
                            <div>{restaurant.business_info.address_line1}, {restaurant.business_info.city}</div>
                          )}
                          {restaurant.business_info?.phone && (
                            <div>Tel: {restaurant.business_info.phone}</div>
                          )}
                          {restaurant.business_info?.email && (
                            <div>Email: {restaurant.business_info.email}</div>
                          )}
                          <div className="text-xs pt-1">
                            Created: {new Date(restaurant.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono text-emerald-600">
                          {getCurrencySymbol(restaurant.currency)}{restaurant.price.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground mb-3">per month</div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => openUserManagement(restaurant)}
                        >
                          <Users className="w-4 h-4 mr-1" />
                          Manage Users
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RestaurantManagement;
```

---

## FILE: pages/RestaurantSettings.js
```javascript
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Wallet, Settings, Save } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout, isAdmin } = useAuth();

  const adminItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
    { path: '/settings', icon: Settings, label: 'Restaurant Settings' },
  ];

  const userItems = [
    { path: '/pos', icon: ShoppingCart, label: 'POS' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  const menuItems = isAdmin ? adminItems : userItems;

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">{isAdmin ? 'Admin Panel' : 'User Panel'}</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const RestaurantSettings = () => {
  const location = useLocation();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    postcode: '',
    phone: '',
    email: '',
    website: '',
    vat_number: '',
    receipt_footer: '',
  });

  useEffect(() => {
    loadRestaurant();
  }, []);

  const loadRestaurant = async () => {
    try {
      const data = await restaurantAPI.getMy();
      setRestaurant(data);
      if (data.business_info) {
        setFormData(data.business_info);
      }
    } catch (error) {
      toast.error('Failed to load restaurant settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await restaurantAPI.updateSettings(formData);
      toast.success('Settings saved successfully!');
      loadRestaurant();
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar active={location.pathname} />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Restaurant Settings</h1>
            <p className="text-muted-foreground">
              Customize your business information that appears on receipts
            </p>
          </div>

          {restaurant && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="font-semibold text-blue-900">Subscription Status</div>
                <div className={`px-3 py-1 rounded-full text-sm ${
                  restaurant.subscription_status === 'active' 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {restaurant.subscription_status === 'trial' ? 'Free Trial' : restaurant.subscription_status.toUpperCase()}
                </div>
              </div>
              <div className="text-sm text-blue-700">
                Plan: £{restaurant.price}/month - All features included
              </div>
            </div>
          )}

          <Card data-testid="restaurant-settings-form">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold">Business Information</CardTitle>
              <CardDescription>
                This information will appear on all customer receipts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Restaurant Name */}
                <div>
                  <Label htmlFor="name" className="text-sm font-semibold">
                    Restaurant Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    data-testid="restaurant-name-input"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="Mario's Pizza Restaurant"
                    required
                    className="h-12"
                  />
                </div>

                {/* Address */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="address_line1" className="text-sm font-semibold">
                      Address Line 1 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="address_line1"
                      data-testid="address-line1-input"
                      value={formData.address_line1}
                      onChange={(e) => handleChange('address_line1', e.target.value)}
                      placeholder="123 High Street"
                      required
                      className="h-12"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="address_line2" className="text-sm font-semibold">
                      Address Line 2 <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="address_line2"
                      data-testid="address-line2-input"
                      value={formData.address_line2}
                      onChange={(e) => handleChange('address_line2', e.target.value)}
                      placeholder="Suite 100"
                      className="h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="city" className="text-sm font-semibold">
                      City <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="city"
                      data-testid="city-input"
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      placeholder="London"
                      required
                      className="h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="postcode" className="text-sm font-semibold">
                      Postcode <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="postcode"
                      data-testid="postcode-input"
                      value={formData.postcode}
                      onChange={(e) => handleChange('postcode', e.target.value)}
                      placeholder="SW1A 1AA"
                      required
                      className="h-12"
                    />
                  </div>
                </div>

                {/* Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone" className="text-sm font-semibold">
                      Phone Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="phone"
                      data-testid="phone-input"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="020 1234 5678"
                      required
                      className="h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-sm font-semibold">
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      data-testid="email-input"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="info@restaurant.co.uk"
                      required
                      className="h-12"
                    />
                  </div>
                </div>

                {/* Optional Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="website" className="text-sm font-semibold">
                      Website <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="website"
                      data-testid="website-input"
                      value={formData.website}
                      onChange={(e) => handleChange('website', e.target.value)}
                      placeholder="www.restaurant.co.uk"
                      className="h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="vat_number" className="text-sm font-semibold">
                      VAT/Tax Number <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="vat_number"
                      data-testid="vat-number-input"
                      value={formData.vat_number}
                      onChange={(e) => handleChange('vat_number', e.target.value)}
                      placeholder="GB123456789"
                      className="h-12"
                    />
                  </div>
                </div>

                {/* Receipt Footer */}
                <div>
                  <Label htmlFor="receipt_footer" className="text-sm font-semibold">
                    Receipt Footer Message <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Textarea
                    id="receipt_footer"
                    data-testid="receipt-footer-input"
                    value={formData.receipt_footer}
                    onChange={(e) => handleChange('receipt_footer', e.target.value)}
                    placeholder="Thank you for visiting! Come again soon!"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    This message will appear at the bottom of customer receipts
                  </p>
                </div>

                {/* Save Button */}
                <div className="pt-4">
                  <Button
                    type="submit"
                    data-testid="save-settings-button"
                    disabled={saving}
                    className="w-full md:w-auto h-12 px-8"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Preview Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Receipt Preview</CardTitle>
              <CardDescription>
                This is how your information will appear on customer receipts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-6 bg-white border-2 border-dashed rounded-lg font-mono text-sm">
                <div className="text-center mb-4">
                  <div className="text-lg font-bold">HevaPOS</div>
                  <div className="text-xs text-muted-foreground">CUSTOMER RECEIPT</div>
                </div>
                <div className="border-t border-b border-dashed py-3 my-3">
                  {formData.name && <div className="font-bold">{formData.name}</div>}
                  {formData.address_line1 && <div>{formData.address_line1}</div>}
                  {formData.address_line2 && <div>{formData.address_line2}</div>}
                  {formData.city && formData.postcode && (
                    <div>{formData.city} {formData.postcode}</div>
                  )}
                  {formData.phone && <div>Tel: {formData.phone}</div>}
                  {formData.email && <div>Email: {formData.email}</div>}
                  {formData.vat_number && <div>VAT No: {formData.vat_number}</div>}
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  ... order details ...
                </div>
                <div className="border-t border-dashed pt-3 mt-3">
                  {formData.receipt_footer && (
                    <div className="text-center mb-2">{formData.receipt_footer}</div>
                  )}
                  {formData.website && (
                    <div className="text-center text-xs">Visit us at: {formData.website}</div>
                  )}
                  <div className="text-center text-xs text-muted-foreground mt-3">
                    Powered by HevaPOS<br/>www.hevapos.com
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RestaurantSettings;
```

---

## FILE: pages/TableManagement.js
```javascript
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { tableAPI, reservationAPI, orderAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Plus, Users, Clock, Merge, Split, Trash2, 
  CalendarClock, Phone, User, CheckCircle, XCircle
} from 'lucide-react';

const TableManagement = () => {
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddTable, setShowAddTable] = useState(false);
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedTables, setSelectedTables] = useState([]);
  const [mergeMode, setMergeMode] = useState(false);
  
  const [newTable, setNewTable] = useState({ number: '', capacity: 4 });
  const [newReservation, setNewReservation] = useState({
    table_id: '',
    customer_name: '',
    customer_phone: '',
    party_size: 2,
    reservation_time: '',
    duration_minutes: 120,
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tablesData, reservationsData, ordersData] = await Promise.all([
        tableAPI.getAll(),
        reservationAPI.getAll(),
        orderAPI.getPending()
      ]);
      setTables(tablesData);
      setReservations(reservationsData);
      setPendingOrders(ordersData);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTable = async (e) => {
    e.preventDefault();
    try {
      await tableAPI.create({
        number: parseInt(newTable.number),
        capacity: parseInt(newTable.capacity)
      });
      toast.success('Table created!');
      setShowAddTable(false);
      setNewTable({ number: '', capacity: 4 });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create table');
    }
  };

  const handleDeleteTable = async (tableId) => {
    if (!window.confirm('Are you sure you want to delete this table?')) return;
    try {
      await tableAPI.delete(tableId);
      toast.success('Table deleted');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete table');
    }
  };

  const handleClearTable = async (tableId) => {
    try {
      await tableAPI.clear(tableId);
      toast.success('Table cleared');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to clear table');
    }
  };

  const handleMergeTables = async () => {
    if (selectedTables.length < 2) {
      toast.error('Select at least 2 tables to merge');
      return;
    }
    try {
      await tableAPI.merge(selectedTables);
      toast.success('Tables merged!');
      setSelectedTables([]);
      setMergeMode(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to merge tables');
    }
  };

  const handleUnmergeTables = async (tableId) => {
    try {
      await tableAPI.unmerge(tableId);
      toast.success('Tables unmerged');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to unmerge tables');
    }
  };

  const handleCreateReservation = async (e) => {
    e.preventDefault();
    try {
      await reservationAPI.create(newReservation);
      toast.success('Reservation created!');
      setShowAddReservation(false);
      setNewReservation({
        table_id: '',
        customer_name: '',
        customer_phone: '',
        party_size: 2,
        reservation_time: '',
        duration_minutes: 120,
        notes: ''
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create reservation');
    }
  };

  const handleSeatReservation = async (resId) => {
    try {
      await reservationAPI.seat(resId);
      toast.success('Party seated!');
      loadData();
    } catch (error) {
      toast.error('Failed to seat reservation');
    }
  };

  const handleCancelReservation = async (resId) => {
    try {
      await reservationAPI.cancel(resId);
      toast.success('Reservation cancelled');
      loadData();
    } catch (error) {
      toast.error('Failed to cancel reservation');
    }
  };

  const toggleTableSelection = (tableId) => {
    if (selectedTables.includes(tableId)) {
      setSelectedTables(selectedTables.filter(id => id !== tableId));
    } else {
      setSelectedTables([...selectedTables, tableId]);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
      case 'occupied': return 'bg-red-100 text-red-700 border-red-300';
      case 'reserved': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'merged': return 'bg-blue-100 text-blue-700 border-blue-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const todayReservations = reservations.filter(r => {
    const today = new Date().toISOString().split('T')[0];
    return r.reservation_time.startsWith(today) && ['confirmed', 'seated'].includes(r.status);
  });

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Table Management</h1>
              <p className="text-muted-foreground">Manage tables, reservations, and seating</p>
            </div>
            <div className="flex gap-2">
              {mergeMode ? (
                <>
                  <Button variant="outline" onClick={() => { setMergeMode(false); setSelectedTables([]); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleMergeTables} disabled={selectedTables.length < 2}>
                    <Merge className="w-4 h-4 mr-2" />
                    Merge ({selectedTables.length})
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setMergeMode(true)}>
                    <Merge className="w-4 h-4 mr-2" />
                    Merge Tables
                  </Button>
                  <Dialog open={showAddReservation} onOpenChange={setShowAddReservation}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <CalendarClock className="w-4 h-4 mr-2" />
                        New Reservation
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>New Reservation</DialogTitle>
                        <DialogDescription>Book a table for a customer</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateReservation} className="space-y-4 mt-4">
                        <div>
                          <Label>Table</Label>
                          <Select
                            value={newReservation.table_id}
                            onValueChange={(v) => setNewReservation({...newReservation, table_id: v})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select table" />
                            </SelectTrigger>
                            <SelectContent>
                              {tables.filter(t => t.status === 'available').map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  Table {t.number} (Seats {t.capacity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Customer Name *</Label>
                            <Input
                              value={newReservation.customer_name}
                              onChange={(e) => setNewReservation({...newReservation, customer_name: e.target.value})}
                              required
                            />
                          </div>
                          <div>
                            <Label>Phone</Label>
                            <Input
                              value={newReservation.customer_phone}
                              onChange={(e) => setNewReservation({...newReservation, customer_phone: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Party Size</Label>
                            <Input
                              type="number"
                              min="1"
                              value={newReservation.party_size}
                              onChange={(e) => setNewReservation({...newReservation, party_size: parseInt(e.target.value)})}
                            />
                          </div>
                          <div>
                            <Label>Duration (minutes)</Label>
                            <Input
                              type="number"
                              min="30"
                              step="30"
                              value={newReservation.duration_minutes}
                              onChange={(e) => setNewReservation({...newReservation, duration_minutes: parseInt(e.target.value)})}
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Date & Time *</Label>
                          <Input
                            type="datetime-local"
                            value={newReservation.reservation_time}
                            onChange={(e) => setNewReservation({...newReservation, reservation_time: e.target.value + ':00'})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Input
                            value={newReservation.notes}
                            onChange={(e) => setNewReservation({...newReservation, notes: e.target.value})}
                            placeholder="Birthday, allergies, etc."
                          />
                        </div>
                        <Button type="submit" className="w-full">Create Reservation</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={showAddTable} onOpenChange={setShowAddTable}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-table-button">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Table
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Table</DialogTitle>
                        <DialogDescription>Create a new table for your restaurant</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateTable} className="space-y-4 mt-4">
                        <div>
                          <Label htmlFor="tableNumber">Table Number *</Label>
                          <Input
                            id="tableNumber"
                            type="number"
                            min="1"
                            value={newTable.number}
                            onChange={(e) => setNewTable({...newTable, number: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="capacity">Seating Capacity</Label>
                          <Input
                            id="capacity"
                            type="number"
                            min="1"
                            value={newTable.capacity}
                            onChange={(e) => setNewTable({...newTable, capacity: e.target.value})}
                          />
                        </div>
                        <Button type="submit" className="w-full">Create Table</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Tables</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{tables.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Available</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">
                  {tables.filter(t => t.status === 'available').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Occupied</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  {tables.filter(t => t.status === 'occupied').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Today's Reservations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{todayReservations.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Tables Grid */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Tables</h2>
            {tables.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No tables yet. Click "Add Table" to create your first table.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {tables.map((table) => (
                  <Card 
                    key={table.id}
                    data-testid={`table-${table.number}`}
                    className={`cursor-pointer transition-all ${
                      mergeMode && selectedTables.includes(table.id) 
                        ? 'ring-2 ring-primary' 
                        : ''
                    } ${mergeMode ? 'hover:ring-2 hover:ring-primary/50' : ''}`}
                    onClick={() => mergeMode && table.status !== 'merged' ? toggleTableSelection(table.id) : null}
                  >
                    <CardContent className="p-4 text-center">
                      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-2 border-2 ${getStatusColor(table.status)}`}>
                        <span className="text-2xl font-bold">{table.number}</span>
                      </div>
                      <div className="text-sm font-medium">{table.name}</div>
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
                        <Users className="w-3 h-3" />
                        <span>{table.capacity}</span>
                      </div>
                      <div className={`mt-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(table.status)}`}>
                        {table.status.toUpperCase()}
                      </div>
                      
                      {!mergeMode && (
                        <div className="mt-3 flex gap-1 justify-center">
                          {table.status === 'occupied' && (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleClearTable(table.id); }}>
                              <CheckCircle className="w-3 h-3" />
                            </Button>
                          )}
                          {table.merged_with && table.merged_with.length > 0 && (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleUnmergeTables(table.id); }}>
                              <Split className="w-3 h-3" />
                            </Button>
                          )}
                          {table.status === 'available' && (
                            <Button size="sm" variant="outline" className="text-red-500" onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.id); }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Today's Reservations */}
          <div>
            <h2 className="text-2xl font-semibold mb-4">Today's Reservations</h2>
            {todayReservations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No reservations for today
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {todayReservations.map((res) => {
                  const table = tables.find(t => t.id === res.table_id);
                  const resTime = new Date(res.reservation_time);
                  return (
                    <Card key={res.id} data-testid={`reservation-${res.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <Clock className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <div className="font-semibold text-lg flex items-center gap-2">
                                <User className="w-4 h-4" />
                                {res.customer_name}
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  res.status === 'seated' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {res.status.toUpperCase()}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-4">
                                <span>Table {table?.number || 'N/A'}</span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {res.party_size} guests
                                </span>
                                {res.customer_phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {res.customer_phone}
                                  </span>
                                )}
                              </div>
                              {res.notes && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Note: {res.notes}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold font-mono">
                              {resTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {res.duration_minutes} min
                            </div>
                            <div className="mt-2 flex gap-1 justify-end">
                              {res.status === 'confirmed' && (
                                <Button size="sm" onClick={() => handleSeatReservation(res.id)}>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Seat
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleCancelReservation(res.id)}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableManagement;
```

---
