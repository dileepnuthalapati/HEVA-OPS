from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import FastAPI, APIRouter
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
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from io import BytesIO
from typing import List
import uuid
from datetime import datetime, timezone


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
    restaurant_id: Optional[str] = None

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
    restaurant_id: Optional[str] = None
    created_at: str

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    restaurant_id: Optional[str] = None

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category_id: str
    category_name: str
    price: float
    image_url: Optional[str] = None
    in_stock: bool = True
    restaurant_id: Optional[str] = None
    created_at: str

class ProductCreate(BaseModel):
    name: str
    category_id: str
    price: float
    image_url: Optional[str] = None
    in_stock: bool = True
    restaurant_id: Optional[str] = None

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_price: float
    total: float

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int
    items: List[OrderItem]
    subtotal: float
    tip_amount: float = 0.0
    tip_percentage: int = 0
    total_amount: float
    created_by: str
    created_at: str
    synced: bool = True
    status: str = "pending"
    payment_method: Optional[str] = None
    split_count: int = 1
    completed_at: Optional[str] = None
    restaurant_id: Optional[str] = None

class OrderCreate(BaseModel):
    items: List[OrderItem]
    total_amount: float

class OrderComplete(BaseModel):
    payment_method: str
    tip_percentage: int = 0
    tip_amount: float = 0.0
    split_count: int = 1

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
    restaurant_id: Optional[str] = None

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
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            # Fallback to username for compatibility with older tokens
            user = await db.users.find_one({"username": user_id}, {"_id": 0})

        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_restaurant(current_user: User = Depends(get_current_user)):
    """Get the restaurant associated with the current user"""
    if current_user.restaurant_id:
        restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    else:
        # Legacy/Fallback
        restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})

    if not restaurant:
        if current_user.role == "platform_owner":
            return None # Platform owner might not have a restaurant
        raise HTTPException(status_code=404, detail="Restaurant not found for user")
    return Restaurant(**restaurant)

def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "platform_owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def require_platform_owner(current_user: User = Depends(get_current_user)):
    if current_user.role != "platform_owner":
        raise HTTPException(status_code=403, detail="Platform Owner access required")
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
        "restaurant_id": user_data.restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_dict)
    return User(**user_dict)

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"username": credentials.username})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(data={"sub": user["id"], "role": user["role"]})
    user_obj = User(**user)
    return Token(access_token=access_token, token_type="bearer", user=user_obj)

# TEMPORARY: Test login bypass for preview testing
@api_router.post("/auth/test-login", response_model=Token)
async def test_login(credentials: UserLogin):
    """Bypass password check for testing - REMOVE IN PRODUCTION"""
    user = await db.users.find_one({"username": credentials.username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    access_token = create_access_token(data={"sub": user["id"], "role": user["role"]})
    user_data = User(**user)
    
    return Token(access_token=access_token, token_type="bearer", user=user_data)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@api_router.post("/restaurants", response_model=Restaurant)
async def create_restaurant(restaurant_data: RestaurantCreate, current_user: User = Depends(require_admin)):
    """Admin creates a new restaurant/tenant with custom pricing"""
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
        "users": [current_user.username],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "trial_ends_at": trial_ends.isoformat(),
        "next_billing_date": trial_ends.isoformat()
    }
    
    await db.restaurants.insert_one(restaurant_dict)
    return Restaurant(**restaurant_dict)

@api_router.get("/restaurants/my", response_model=Restaurant)
async def get_my_restaurant(current_user: User = Depends(get_current_user)):
    """Get current user's restaurant"""
    if current_user.restaurant_id:
        restaurant = await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})
    else:
        restaurant = await db.restaurants.find_one({"users": current_user.username}, {"_id": 0})

    if not restaurant:
        raise HTTPException(status_code=404, detail="No restaurant found for this user")
    return Restaurant(**restaurant)

@api_router.put("/restaurants/my/settings")
async def update_restaurant_settings(settings: RestaurantUpdate, current_user: User = Depends(get_current_user)):
    """Update restaurant business information"""
    restaurant_data = await get_my_restaurant(current_user)
    
    # Update only provided fields
    update_data = {k: v for k, v in settings.model_dump().items() if v is not None}
    
    if update_data:
        await db.restaurants.update_one(
            {"id": restaurant_data.id},
            {"$set": {f"business_info.{k}": v for k, v in update_data.items()}}
        )
    
    updated = await db.restaurants.find_one({"id": restaurant_data.id}, {"_id": 0})
    return {"message": "Settings updated successfully", "business_info": updated["business_info"]}

@api_router.get("/restaurants")
async def list_restaurants(current_user: User = Depends(require_admin)):
    """Admin: List all restaurants"""
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
        "restaurant_id": category_data.restaurant_id or current_user.restaurant_id,
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
        "restaurant_id": product_data.restaurant_id or current_user.restaurant_id,
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
        order_number = last_order["order_number"] + 1
    else:
        order_number = 1
    
    order_id = f"order_{datetime.now(timezone.utc).timestamp()}"
    order_dict = {
        "id": order_id,
        "order_number": order_number,
        "items": [item.model_dump() for item in order_data.items],
        "subtotal": order_data.total_amount,
        "tip_amount": 0.0,
        "tip_percentage": 0,
        "total_amount": order_data.total_amount,
        "created_by": current_user.username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "synced": True,
        "status": "pending",
        "payment_method": None,
        "split_count": 1,
        "completed_at": None,
        "restaurant_id": current_user.restaurant_id
    }
    await db.orders.insert_one(order_dict)
    return Order(**order_dict)

@api_router.put("/orders/{order_id}/complete", response_model=Order)
async def complete_order(order_id: str, complete_data: OrderComplete, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order["status"] == "completed":
        raise HTTPException(status_code=400, detail="Order already completed")
    
    # Calculate new total with tip
    subtotal = order["subtotal"]
    tip_amount = complete_data.tip_amount
    new_total = subtotal + tip_amount
    
    result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "completed",
            "payment_method": complete_data.payment_method,
            "tip_amount": tip_amount,
            "tip_percentage": complete_data.tip_percentage,
            "total_amount": new_total,
            "split_count": complete_data.split_count,
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return Order(**updated)

@api_router.get("/orders/pending", response_model=List[Order])
async def get_pending_orders(current_user: User = Depends(get_current_user)):
    query = {"status": "pending"}
    if current_user.role != "platform_owner":
        if current_user.role == "admin":
             query["restaurant_id"] = current_user.restaurant_id
        else:
             query["created_by"] = current_user.username

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Order(**order) for order in orders]

@api_router.get("/orders", response_model=List[Order])
async def get_orders(current_user: User = Depends(get_current_user)):
    query = {}
    if current_user.role != "platform_owner":
        if current_user.role == "admin":
            query["restaurant_id"] = current_user.restaurant_id
        else:
            query["created_by"] = current_user.username

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
            "completed_at": None,
            "restaurant_id": current_user.restaurant_id
        }
        await db.orders.insert_one(order_dict)
        synced_count += 1
    return {"message": f"Synced {synced_count} orders"}

@api_router.post("/reports/generate")
async def generate_report(report_req: ReportRequest, current_user: User = Depends(require_admin)):
    start_dt = datetime.fromisoformat(report_req.start_date)
    end_dt = datetime.fromisoformat(report_req.end_date)
    
    query = {"created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}}
    if current_user.role != "platform_owner":
        query["restaurant_id"] = current_user.restaurant_id

    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
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
        
        table = Table(table_data, colWidths=[200, 100, 100])
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
    restaurant = await db.restaurants.find_one({"id": order.get("restaurant_id")}, {"_id": 0})
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
    
    table = Table(table_data, colWidths=[300, 100])
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
    restaurant = await db.restaurants.find_one({"id": order.get("restaurant_id")}, {"_id": 0})
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
    
    table = Table(table_data, colWidths=[200, 80, 80, 100])
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
    query = {"date": today, "status": "open"}
    if current_user.role != "platform_owner":
        query["restaurant_id"] = current_user.restaurant_id

    existing = await db.cash_drawers.find_one(query, {"_id": 0})
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
        "status": "open",
        "restaurant_id": current_user.restaurant_id
    }
    await db.cash_drawers.insert_one(drawer_dict)
    return CashDrawer(**drawer_dict)

@api_router.get("/cash-drawer/current", response_model=CashDrawer)
async def get_current_cash_drawer(current_user: User = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    query = {"date": today, "status": "open"}
    if current_user.role != "platform_owner":
        query["restaurant_id"] = current_user.restaurant_id

    drawer = await db.cash_drawers.find_one(query, {"_id": 0})
    if not drawer:
        raise HTTPException(status_code=404, detail="No open cash drawer for today")
    
    # Calculate expected cash from cash orders
    order_query = {
            "status": "completed",
            "payment_method": "cash",
            "created_at": {"$gte": drawer["opened_at"]}
    }
    if current_user.role != "platform_owner":
        order_query["restaurant_id"] = current_user.restaurant_id

    cash_orders = await db.orders.find(order_query, {"_id": 0}).to_list(10000)
    
    total_cash_sales = sum(order["total_amount"] for order in cash_orders)
    drawer["expected_cash"] = drawer["opening_balance"] + total_cash_sales
    
    return CashDrawer(**drawer)

@api_router.put("/cash-drawer/close", response_model=CashDrawer)
async def close_cash_drawer(close_data: CashDrawerClose, current_user: User = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    query = {"date": today, "status": "open"}
    if current_user.role != "platform_owner":
        query["restaurant_id"] = current_user.restaurant_id

    drawer = await db.cash_drawers.find_one(query, {"_id": 0})
    if not drawer:
        raise HTTPException(status_code=404, detail="No open cash drawer to close")
    
    # Calculate expected cash
    order_query = {
            "status": "completed",
            "payment_method": "cash",
            "created_at": {"$gte": drawer["opened_at"]}
    }
    if current_user.role != "platform_owner":
        order_query["restaurant_id"] = current_user.restaurant_id

    cash_orders = await db.orders.find(order_query, {"_id": 0}).to_list(10000)
    
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
    query = {}
    if current_user.role != "platform_owner":
        query["restaurant_id"] = current_user.restaurant_id

    drawers = await db.cash_drawers.find(query, {"_id": 0}).sort("date", -1).limit(30).to_list(100)
    return drawers

@api_router.get("/reports/stats")
async def get_report_stats(start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    start_dt = datetime.fromisoformat(start_date)
    end_dt = datetime.fromisoformat(end_date)
    
    query = {"created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}}
    if current_user.role != "platform_owner":
        query["restaurant_id"] = current_user.restaurant_id

    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
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

# ===== ONE-TIME SEED ENDPOINT =====
@api_router.post("/seed-database")
async def seed_database_endpoint(secret: str = None):
    """One-time database seeding endpoint."""
    if secret != "hevapos2026":
        raise HTTPException(status_code=403, detail="Invalid secret")
    
    # Clear existing data to ensure clean seed
    await db.users.delete_many({})
    await db.restaurants.delete_many({})
    await db.categories.delete_many({})
    await db.products.delete_many({})
    await db.orders.delete_many({})
    await db.cash_drawers.delete_many({})
    
    from datetime import timedelta
    
    # Platform Owner
    await db.users.insert_one({"id": "platform_owner_1", "username": "platform_owner", "password": pwd_context.hash("admin123"), "role": "platform_owner", "restaurant_id": None, "created_at": datetime.now(timezone.utc).isoformat()})
    
    # Restaurant
    trial_ends = datetime.now(timezone.utc) + timedelta(days=14)
    await db.restaurants.insert_one({"id": "rest_demo_1", "owner_email": "demo@hevapos.com", "subscription_status": "trial", "price": 19.99, "currency": "GBP", "business_info": {"name": "Pizza Palace", "city": "London"}, "users": ["restaurant_admin", "user"], "created_at": datetime.now(timezone.utc).isoformat(), "trial_ends_at": trial_ends.isoformat()})
    
    # Admin & Staff
    await db.users.insert_one({"id": "restaurant_admin_1", "username": "restaurant_admin", "password": pwd_context.hash("admin123"), "role": "admin", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()})
    await db.users.insert_one({"id": "restaurant_user_1", "username": "user", "password": pwd_context.hash("user123"), "role": "user", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()})
    
    # Categories
    await db.categories.insert_many([
        {"id": "cat_1", "name": "Pizzas", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_2", "name": "Drinks", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_3", "name": "Sides", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "cat_4", "name": "Desserts", "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
    ])
    
    # Products
    await db.products.insert_many([
        {"id": "prod_1", "name": "Margherita", "category_id": "cat_1", "category_name": "Pizzas", "price": 9.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_2", "name": "Pepperoni", "category_id": "cat_1", "category_name": "Pizzas", "price": 11.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_3", "name": "Hawaiian", "category_id": "cat_1", "category_name": "Pizzas", "price": 12.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_5", "name": "Coca-Cola", "category_id": "cat_2", "category_name": "Drinks", "price": 2.50, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_6", "name": "Sprite", "category_id": "cat_2", "category_name": "Drinks", "price": 2.50, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_8", "name": "Garlic Bread", "category_id": "cat_3", "category_name": "Sides", "price": 4.99, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_10", "name": "Chocolate Brownie", "category_id": "cat_4", "category_name": "Desserts", "price": 4.50, "in_stock": True, "restaurant_id": "rest_demo_1", "created_at": datetime.now(timezone.utc).isoformat()},
    ])
    
    return {"message": "Database seeded!", "seeded": True, "credentials": {"platform_owner": "admin123", "restaurant_admin": "admin123", "staff_user": "user123"}}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
