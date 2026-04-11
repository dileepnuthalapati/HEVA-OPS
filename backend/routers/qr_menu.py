"""
HevaPOS QR Table Ordering — Public endpoints (no auth required).

Endpoints:
  POST /qr/tables/{table_id}/generate-hash      → Admin generates QR hash (auth required)
  GET  /qr/tables/hashes                        → Admin gets all table QR hashes (auth required)
  POST /qr/tables/generate-all-hashes           → Admin generates hashes for all tables
  GET  /qr/{restaurant_id}/{table_hash}         → Menu + table info for guests (PUBLIC)
  POST /qr/{restaurant_id}/{table_hash}/order   → Place a guest order (PUBLIC)
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from database import db
from dependencies import get_current_user, require_admin, require_feature, get_restaurant_features
from models import User
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import List, Optional
from rate_limiter import limiter
import secrets

router = APIRouter(prefix="/qr", tags=["QR Menu"])


# --- Models ---

class GuestOrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_price: float
    total: float
    notes: Optional[str] = None


class GuestOrderCreate(BaseModel):
    items: List[GuestOrderItem]
    guest_name: Optional[str] = None
    guest_notes: Optional[str] = None


# --- Admin Endpoints (Auth Required) — MUST be before wildcard routes ---

@router.get("/tables/hashes")
async def get_table_hashes(current_user: User = Depends(require_feature("qr_ordering"))):
    """Admin: Get all tables with their QR hashes for the restaurant."""
    query = {}
    if current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id

    tables = await db.tables.find(query, {"_id": 0}).sort("number", 1).to_list(200)
    return [
        {
            "id": t["id"],
            "number": t["number"],
            "name": t.get("name", f"Table {t['number']}"),
            "qr_hash": t.get("qr_hash"),
            "has_qr": bool(t.get("qr_hash")),
        }
        for t in tables
    ]


@router.post("/tables/{table_id}/generate-hash")
async def generate_table_hash(table_id: str, current_user: User = Depends(require_admin)):
    """Admin: Generate or regenerate a QR hash for a table."""
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    qr_hash = secrets.token_urlsafe(6)
    await db.tables.update_one({"id": table_id}, {"$set": {"qr_hash": qr_hash}})

    return {"table_id": table_id, "qr_hash": qr_hash}


@router.post("/tables/generate-all-hashes")
async def generate_all_hashes(current_user: User = Depends(require_admin)):
    """Admin: Generate QR hashes for all tables that don't have one."""
    query = {"$or": [{"qr_hash": {"$exists": False}}, {"qr_hash": None}]}
    if current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id

    tables = await db.tables.find(query, {"_id": 0}).to_list(200)
    updated = 0
    for table in tables:
        qr_hash = secrets.token_urlsafe(6)
        await db.tables.update_one({"id": table["id"]}, {"$set": {"qr_hash": qr_hash}})
        updated += 1

    return {"message": f"Generated QR hashes for {updated} tables", "updated": updated}


# --- Public Endpoints (No Auth) — Wildcard routes MUST be last ---

@router.get("/{restaurant_id}/{table_hash}")
@limiter.limit("30/minute")
async def get_guest_menu(request: Request, restaurant_id: str, table_hash: str):
    """Public: Get restaurant menu, table info, and active tab for QR ordering."""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # Module feature check — QR ordering must be enabled
    features = restaurant.get("features", {})
    if not features.get("qr_ordering", False):
        raise HTTPException(status_code=503, detail="QR ordering is not enabled for this restaurant")

    # QR Kill Switch — admin can temporarily disable QR ordering
    if not restaurant.get("qr_ordering_enabled", True):
        raise HTTPException(status_code=503, detail="QR ordering is temporarily disabled by the restaurant")

    table = await db.tables.find_one(
        {"restaurant_id": restaurant_id, "qr_hash": table_hash},
        {"_id": 0}
    )
    if not table:
        raise HTTPException(status_code=404, detail="Invalid table link")

    # Get categories for this restaurant
    categories = await db.categories.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0}
    ).to_list(100)

    # Get in-stock products for this restaurant
    products = await db.products.find(
        {"restaurant_id": restaurant_id, "in_stock": True},
        {"_id": 0}
    ).to_list(1000)

    business_info = restaurant.get("business_info", {})
    currency = restaurant.get("currency", "GBP")

    # Find active tab for this table (open QR orders not yet paid/completed/cancelled)
    active_tab = None
    active_orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "table_id": table["id"],
            "source": "qr",
            "status": {"$in": ["pending", "preparing", "ready"]},
        },
        {"_id": 0}
    ).sort("created_at", 1).to_list(50)

    if active_orders:
        all_items = []
        total_amount = 0
        order_ids = []
        for o in active_orders:
            order_ids.append(o["id"])
            for item in o.get("items", []):
                all_items.append(item)
            total_amount += o.get("total_amount", 0) or o.get("subtotal", 0)
        active_tab = {
            "order_ids": order_ids,
            "items": all_items,
            "total_amount": round(total_amount, 2),
            "order_count": len(active_orders),
            "first_order_number": active_orders[0].get("order_number"),
            "latest_order_number": active_orders[-1].get("order_number"),
            "table_name": table.get("name", f"Table {table['number']}"),
        }

    return {
        "restaurant": {
            "id": restaurant_id,
            "name": business_info.get("name", "Restaurant"),
            "currency": currency,
            "logo_url": business_info.get("logo_url"),
            "description": business_info.get("description", ""),
        },
        "table": {
            "id": table["id"],
            "number": table["number"],
            "name": table.get("name", f"Table {table['number']}"),
        },
        "categories": categories,
        "products": products,
        "active_tab": active_tab,
    }


@router.post("/{restaurant_id}/{table_hash}/order")
@limiter.limit("10/minute")
async def place_guest_order(request: Request, restaurant_id: str, table_hash: str, order_data: GuestOrderCreate):
    """Public: Place a QR guest order (no auth required)."""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # QR Kill Switch
    if not restaurant.get("qr_ordering_enabled", True):
        raise HTTPException(status_code=503, detail="QR ordering is temporarily disabled by the restaurant")

    table = await db.tables.find_one(
        {"restaurant_id": restaurant_id, "qr_hash": table_hash},
        {"_id": 0}
    )
    if not table:
        raise HTTPException(status_code=404, detail="Invalid table link")

    if not order_data.items or len(order_data.items) == 0:
        raise HTTPException(status_code=400, detail="Order must have at least one item")

    # Calculate totals
    subtotal = sum(item.total for item in order_data.items)

    # Get next order number using atomic counter (shared with POS orders)
    from routers.orders import get_next_order_number
    order_number = await get_next_order_number(restaurant_id)

    order_id = f"qr_{datetime.now(timezone.utc).timestamp()}"
    order_dict = {
        "id": order_id,
        "order_number": order_number,
        "items": [item.model_dump() for item in order_data.items],
        "subtotal": subtotal,
        "discount_amount": 0,
        "discount_type": None,
        "discount_value": None,
        "tip_amount": 0,
        "tip_percentage": 0,
        "total_amount": subtotal,
        "payment_method": None,
        "payment_details": None,
        "status": "pending",
        "created_by": f"QR Guest{(' - ' + order_data.guest_name) if order_data.guest_name else ''}",
        "table_id": table["id"],
        "table_name": table.get("name", f"Table {table['number']}"),
        "table_number": table["number"],
        "restaurant_id": restaurant_id,
        "source": "qr",
        "guest_name": order_data.guest_name,
        "guest_notes": order_data.guest_notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "cancelled_at": None,
    }

    await db.orders.insert_one(order_dict)

    # Update table status
    await db.tables.update_one(
        {"id": table["id"]},
        {"$set": {"current_order_id": order_id, "status": "occupied"}}
    )

    # Emit WebSocket event for real-time POS notification
    try:
        from socket_manager import emit_new_qr_order
        await emit_new_qr_order(restaurant_id, {
            "order_id": order_id,
            "order_number": order_number,
            "table_number": table["number"],
            "table_name": table.get("name", f"Table {table['number']}"),
            "guest_name": order_data.guest_name,
            "items_count": len(order_data.items),
            "total": subtotal,
            "currency": restaurant.get("currency", "GBP"),
        })
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Socket emit failed: {e}")

    return {
        "order_id": order_id,
        "order_number": order_number,
        "table": table.get("name", f"Table {table['number']}"),
        "total": subtotal,
        "status": "pending",
        "message": "Order sent to kitchen!",
    }
