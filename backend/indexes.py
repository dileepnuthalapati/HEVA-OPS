"""
HevaPOS Database Index Management

Creates and ensures MongoDB indexes for optimal query performance.
Called once on application startup.
"""
from database import db
import logging

logger = logging.getLogger(__name__)


async def ensure_indexes():
    """Create all required MongoDB indexes for HevaPOS."""
    try:
        # --- Orders (most queried collection) ---
        await db.orders.create_index("id", unique=True)
        await db.orders.create_index("order_number")
        await db.orders.create_index("status")
        await db.orders.create_index("created_at")
        await db.orders.create_index("restaurant_id")
        await db.orders.create_index([("status", 1), ("created_at", -1)])
        await db.orders.create_index([("restaurant_id", 1), ("status", 1), ("created_at", -1)])
        await db.orders.create_index([("restaurant_id", 1), ("created_at", -1)])

        # --- Users ---
        await db.users.create_index("id", unique=True)
        await db.users.create_index("username", unique=True)
        await db.users.create_index("restaurant_id")

        # --- Tables ---
        await db.tables.create_index("id", unique=True)
        await db.tables.create_index("restaurant_id")
        await db.tables.create_index("qr_hash")
        await db.tables.create_index([("restaurant_id", 1), ("qr_hash", 1)])

        # --- Products ---
        await db.products.create_index("id", unique=True)
        await db.products.create_index("restaurant_id")
        await db.products.create_index("category_id")
        await db.products.create_index([("restaurant_id", 1), ("in_stock", 1)])

        # --- Categories ---
        await db.categories.create_index("id", unique=True)
        await db.categories.create_index("restaurant_id")

        # --- Restaurants ---
        await db.restaurants.create_index("id", unique=True)

        # --- Printers ---
        await db.printers.create_index("id", unique=True)
        await db.printers.create_index("restaurant_id")

        # --- Reservations ---
        await db.reservations.create_index("id", unique=True)
        await db.reservations.create_index([("restaurant_id", 1), ("reservation_time", 1)])

        # --- Audit Logs ---
        await db.audit_logs.create_index("id", unique=True)
        await db.audit_logs.create_index("action")
        await db.audit_logs.create_index("performed_by")
        await db.audit_logs.create_index("created_at")
        await db.audit_logs.create_index("order_id")
        await db.audit_logs.create_index([("restaurant_id", 1), ("created_at", -1)])
        await db.audit_logs.create_index([("restaurant_id", 1), ("action", 1), ("created_at", -1)])

        logger.info("[DB] All indexes created/verified successfully")
    except Exception as e:
        logger.error(f"[DB] Index creation failed: {e}")
