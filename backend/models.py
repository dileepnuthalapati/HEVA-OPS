from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    role: str
    restaurant_id: Optional[str] = None
    created_at: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"


class UserLogin(BaseModel):
    username: str
    password: str
    device_id: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    restaurant_id: Optional[str] = None


class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    restaurant_id: Optional[str] = None
    created_at: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None


class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    price: float
    in_stock: bool = True
    image_url: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[str] = None


class ProductCreate(BaseModel):
    name: str
    category_id: Optional[str] = None
    price: float
    in_stock: bool = True
    description: Optional[str] = None


class OrderItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product_id: str = ""
    product_name: str = ""
    quantity: int = 1
    unit_price: float = 0.0
    total: float = 0.0
    notes: Optional[str] = None
    discount_amount: Optional[float] = 0.0
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    printed_to_kitchen: Optional[bool] = False


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int = 0
    restaurant_id: Optional[str] = None
    items: List[OrderItem] = []
    subtotal: float = 0.0
    discount_amount: Optional[float] = 0.0
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    tip_amount: Optional[float] = 0.0
    tip_percentage: Optional[float] = 0.0
    total_amount: float = 0.0
    payment_method: Optional[str] = None
    payment_details: Optional[dict] = None
    status: str = "pending"
    created_by: str = ""
    cancel_reason: Optional[str] = None
    table_id: Optional[str] = None
    table_name: Optional[str] = None
    order_type: Optional[str] = "dine_in"
    source: Optional[str] = "pos"
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    cancelled_at: Optional[str] = None


class OrderCreate(BaseModel):
    items: List[OrderItem]
    subtotal: float
    discount_amount: Optional[float] = 0.0
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    tip_amount: Optional[float] = 0.0
    tip_percentage: Optional[float] = 0.0
    total_amount: float
    table_id: Optional[str] = None
    order_type: Optional[str] = "dine_in"


class OrderComplete(BaseModel):
    payment_method: str
    tip_amount: Optional[float] = 0.0
    tip_percentage: Optional[float] = 0.0
    total_amount: Optional[float] = None
    payment_details: Optional[dict] = None


class CancelOrderRequest(BaseModel):
    cancel_reason: str = ""
    void_category: Optional[str] = None
    void_note: Optional[str] = None
    manager_pin: Optional[str] = None
    manager_username: Optional[str] = None


class CashDrawer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    date: str
    opening_balance: float
    expected_cash: float = 0.0
    actual_cash: float = 0.0
    difference: float = 0.0
    notes: Optional[str] = None
    opened_by: str = ""
    closed_by: Optional[str] = None
    opened_at: Optional[str] = None
    closed_at: Optional[str] = None
    status: str = "open"


class CashDrawerOpen(BaseModel):
    opening_balance: float


class CashDrawerClose(BaseModel):
    actual_cash: float
    notes: Optional[str] = None


class RestaurantFeatures(BaseModel):
    pos: bool = True
    kds: bool = False
    qr_ordering: bool = False
    workforce: bool = False


class ModulePricing(BaseModel):
    """Global default pricing for modules. Platform Owner configures once."""
    pos: float = 19.99
    kds: float = 9.99
    qr_ordering: float = 14.99
    workforce: float = 24.99
    currency: str = "GBP"


class Restaurant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    owner_email: Optional[str] = None
    subscription_status: str = "trial"
    subscription_plan: Optional[str] = "standard_monthly"
    price: Optional[float] = 0
    currency: str = "GBP"
    business_info: Optional[dict] = {}
    features: Optional[dict] = None
    users: Optional[List[str]] = []
    created_at: Optional[str] = None
    trial_ends_at: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    qr_ordering_enabled: Optional[bool] = True


class RestaurantCreate(BaseModel):
    owner_email: str
    subscription_plan: str = "standard_monthly"
    price: float = 19.99
    currency: str = "GBP"
    business_info: Optional[dict] = {}
    features: Optional[dict] = None


class RestaurantUpdate(BaseModel):
    business_info: Optional[dict] = None
    currency: Optional[str] = None
    owner_email: Optional[str] = None
    qr_ordering_enabled: Optional[bool] = None
    features: Optional[dict] = None


class SyncData(BaseModel):
    orders: Optional[List[dict]] = []


class ReportRequest(BaseModel):
    start_date: str
    end_date: str
    report_type: str = "sales"


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PlatformAdminCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: str = "platform_owner"


class Printer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    type: str = "wifi"
    address: str = ""
    restaurant_id: Optional[str] = None
    is_default: bool = False
    paper_width: int = 80
    created_at: Optional[str] = None


class PrinterCreate(BaseModel):
    name: str
    type: str = "wifi"
    address: str = ""
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
    data: str


class ScanRequest(BaseModel):
    subnet: str = "192.168.1"
    ports: List[int] = [9100, 515, 631]
    custom_port: Optional[int] = None
    timeout_ms: int = 800


class Table(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    number: int
    name: Optional[str] = None
    capacity: int = 4
    status: str = "available"
    restaurant_id: Optional[str] = None
    current_order_id: Optional[str] = None
    merged_with: Optional[List[str]] = None
    qr_hash: Optional[str] = None
    created_at: Optional[str] = None


class TableCreate(BaseModel):
    number: int
    name: Optional[str] = None
    capacity: int = 4


class TableUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[str] = None


class TableMerge(BaseModel):
    table_ids: List[str]

class TableSplitBill(BaseModel):
    order_id: str
    splits: List[dict]


class Reservation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    guest_name: Optional[str] = "Unknown"
    guest_phone: Optional[str] = None
    guest_email: Optional[str] = None
    party_size: Optional[int] = 1
    date: Optional[str] = None
    time: Optional[str] = None
    duration_minutes: int = 90
    table_id: Optional[str] = None
    status: str = "confirmed"
    notes: Optional[str] = None
    restaurant_id: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[str] = None


class ReservationCreate(BaseModel):
    guest_name: str
    guest_phone: Optional[str] = None
    guest_email: Optional[str] = None
    party_size: int
    date: str
    time: str
    duration_minutes: int = 90
    table_id: Optional[str] = None
    notes: Optional[str] = None


class ReservationUpdate(BaseModel):
    guest_name: Optional[str] = None
    guest_phone: Optional[str] = None
    guest_email: Optional[str] = None
    party_size: Optional[int] = None
    date: Optional[str] = None
    time: Optional[str] = None
    duration_minutes: Optional[int] = None
    table_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class RestaurantUserCreate(BaseModel):
    username: str
    password: str
    role: str = "admin"
    email: Optional[str] = None
    capabilities: Optional[List[str]] = None


class StaffCreate(BaseModel):
    username: str
    password: str
    email: str
    role: str = "user"
    capabilities: Optional[List[str]] = []
    pos_pin: Optional[str] = None
    position: Optional[str] = None
    pay_type: Optional[str] = "hourly"  # hourly or monthly
    hourly_rate: Optional[float] = None
    monthly_salary: Optional[float] = None
    phone: Optional[str] = None
    employment_type: Optional[str] = None  # full_time, part_time, casual
    joining_date: Optional[str] = None
    tax_id: Optional[str] = None


class StaffUpdate(BaseModel):
    username: str
    email: Optional[str] = None
    password: Optional[str] = None
    role: str = "user"
    capabilities: Optional[List[str]] = None
    pos_pin: Optional[str] = None
    position: Optional[str] = None
    pay_type: Optional[str] = None
    hourly_rate: Optional[float] = None
    monthly_salary: Optional[float] = None
    phone: Optional[str] = None
    employment_type: Optional[str] = None
    joining_date: Optional[str] = None
    tax_id: Optional[str] = None


class PasswordReset(BaseModel):
    new_password: str


class SubscriptionUpdate(BaseModel):
    status: str
    plan: Optional[str] = None
    price: Optional[float] = None


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str
