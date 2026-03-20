from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
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
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from io import BytesIO

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    items: List[OrderItem]
    total_amount: float
    created_by: str
    created_at: str
    synced: bool = True

class OrderCreate(BaseModel):
    items: List[OrderItem]
    total_amount: float

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
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        user = await db.users.find_one({"username": username}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
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
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(data={"sub": user["username"]})
    user_obj = User(id=user["id"], username=user["username"], role=user["role"], created_at=user["created_at"])
    return Token(access_token=access_token, token_type="bearer", user=user_obj)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

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
async def get_categories():
    categories = await db.categories.find({}, {"_id": 0}).to_list(1000)
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
async def get_products(category_id: Optional[str] = None):
    query = {"category_id": category_id} if category_id else {}
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
    order_id = f"order_{datetime.now(timezone.utc).timestamp()}"
    order_dict = {
        "id": order_id,
        "items": [item.model_dump() for item in order_data.items],
        "total_amount": order_data.total_amount,
        "created_by": current_user.username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "synced": True
    }
    await db.orders.insert_one(order_dict)
    return Order(**order_dict)

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
            "synced": True
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()