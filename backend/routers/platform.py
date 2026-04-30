from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_password_hash, require_platform_owner
from models import User, PlatformAdminCreate, RestaurantUserCreate
from datetime import datetime, timezone

router = APIRouter()


@router.get("/platform/admins")
async def get_platform_admins(current_user: User = Depends(require_platform_owner)):
    admins = await db.users.find(
        {"role": "platform_owner"},
        {"_id": 0, "password": 0, "password_hash": 0}
    ).to_list(100)
    return admins


@router.post("/platform/admins")
async def create_platform_admin(admin_data: PlatformAdminCreate, current_user: User = Depends(require_platform_owner)):
    existing = await db.users.find_one({"username": admin_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    admin_id = f"admin_{datetime.now(timezone.utc).timestamp()}"
    admin_doc = {
        "id": admin_id,
        "username": admin_data.username,
        "password": get_password_hash(admin_data.password),
        "password_hash": get_password_hash(admin_data.password),
        "role": "platform_owner",
        "restaurant_id": None,
        "email": admin_data.email,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.username,
    }
    await db.users.insert_one(admin_doc)
    return {
        "message": f"Platform admin '{admin_data.username}' created",
        "id": admin_id,
        "username": admin_data.username,
        "role": "platform_owner"
    }


@router.delete("/platform/admins/{admin_id}")
async def delete_platform_admin(admin_id: str, current_user: User = Depends(require_platform_owner)):
    admin = await db.users.find_one({"id": admin_id, "role": "platform_owner"})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    if admin.get("username") == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    admin_count = await db.users.count_documents({"role": "platform_owner"})
    if admin_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last platform owner")

    await db.users.delete_one({"id": admin_id})
    return {"message": f"Admin '{admin.get('username')}' deleted"}


@router.post("/restaurants/{restaurant_id}/users", response_model=User)
async def create_restaurant_user(restaurant_id: str, user_data: RestaurantUserCreate, current_user: User = Depends(require_platform_owner)):
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user_id = f"user_{datetime.now(timezone.utc).timestamp()}"
    user_doc = {
        "id": user_id,
        "username": user_data.username,
        "password": get_password_hash(user_data.password),
        "password_hash": get_password_hash(user_data.password),
        "role": user_data.role if user_data.role in ["admin", "user"] else "admin",
        "restaurant_id": restaurant_id,
        "email": user_data.email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)

    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$addToSet": {"users": user_data.username}}
    )

    return User(**user_doc)


@router.get("/restaurants/{restaurant_id}/users")
async def get_restaurant_users(restaurant_id: str, current_user: User = Depends(require_platform_owner)):
    users = await db.users.find({"restaurant_id": restaurant_id}, {"_id": 0, "password": 0, "password_hash": 0}).to_list(100)
    return users


@router.delete("/restaurants/{restaurant_id}/users/{user_id}")
async def delete_restaurant_user(restaurant_id: str, user_id: str, current_user: User = Depends(require_platform_owner)):
    user = await db.users.find_one({"id": user_id, "restaurant_id": restaurant_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found in this restaurant")

    await db.users.delete_one({"id": user_id})
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$pull": {"users": user.get("username")}}
    )
    return {"message": f"User '{user.get('username')}' removed from restaurant"}


# ─── Platform Settings (Stripe keys, trial days, etc) ──────────────────────

DEFAULT_PLATFORM_SETTINGS = {
    "platform_name": "Heva ONE",
    "support_email": "support@hevaone.com",
    "default_trial_days": 14,
    "default_plan_price": 19.99,
    "default_currency": "GBP",
    "enable_email_notifications": True,
    "enable_trial_reminders": True,
    "enable_auto_suspend": False,
    "stripe_enabled": False,
    "stripe_publishable_key": "",
    "stripe_secret_key": "",
    "stripe_webhook_secret": "",
}

# Fields that are sensitive and should never be returned to the client in full
_SENSITIVE_FIELDS = {"stripe_secret_key", "stripe_webhook_secret"}


def _mask_secret(value: str) -> str:
    """Return a masked version of a secret (e.g. 'sk_live_•••••••1234') for display only."""
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:7]}{'•' * 6}{value[-4:]}"


def _public_view(doc: dict) -> dict:
    """Strip sensitive fields, replace with masked / boolean indicators."""
    out = {k: v for k, v in doc.items() if k not in _SENSITIVE_FIELDS and k != "type" and k != "_id"}
    out["stripe_secret_key_set"] = bool(doc.get("stripe_secret_key"))
    out["stripe_secret_key_masked"] = _mask_secret(doc.get("stripe_secret_key", ""))
    out["stripe_webhook_secret_set"] = bool(doc.get("stripe_webhook_secret"))
    out["stripe_webhook_secret_masked"] = _mask_secret(doc.get("stripe_webhook_secret", ""))
    return out


async def get_platform_settings_doc() -> dict:
    """Shared helper — reads the single platform-settings document from DB.
    Returns defaults merged with saved values (sensitive fields included — do NOT return to client)."""
    doc = await db.platform_config.find_one({"type": "global"}, {"_id": 0}) or {}
    merged = DEFAULT_PLATFORM_SETTINGS.copy()
    merged.update({k: v for k, v in doc.items() if k != "type"})
    return merged


@router.get("/platform/settings")
async def get_platform_settings(current_user: User = Depends(require_platform_owner)):
    doc = await get_platform_settings_doc()
    return _public_view(doc)


@router.put("/platform/settings")
async def update_platform_settings(payload: dict, current_user: User = Depends(require_platform_owner)):
    """Save platform settings. Empty strings for secrets are ignored so the admin
    can save other fields without re-entering keys. Pass `clear_secret: true` to wipe."""
    existing = await db.platform_config.find_one({"type": "global"}, {"_id": 0}) or {}
    update = {}
    allowed = set(DEFAULT_PLATFORM_SETTINGS.keys())

    for key, value in payload.items():
        if key not in allowed:
            continue
        if key in _SENSITIVE_FIELDS:
            # Don't overwrite stored secret with an empty string (frontend hides it)
            if value in (None, ""):
                continue
        update[key] = value

    if payload.get("clear_stripe_secret"):
        update["stripe_secret_key"] = ""
    if payload.get("clear_stripe_webhook_secret"):
        update["stripe_webhook_secret"] = ""

    update["type"] = "global"
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = current_user.username

    await db.platform_config.update_one(
        {"type": "global"},
        {"$set": update},
        upsert=True,
    )
    merged = {**DEFAULT_PLATFORM_SETTINGS, **existing, **update}
    return {"message": "Platform settings saved", "settings": _public_view(merged)}


# ─── Module Pricing ──────────────────────────────────────

DEFAULT_MODULE_PRICES = {
    "pos": 19.99,
    "kds": 9.99,
    "qr_ordering": 14.99,
    "workforce": 24.99,
    "currency": "GBP",
}


@router.get("/platform/module-pricing")
async def get_module_pricing(current_user: User = Depends(require_platform_owner)):
    """Get global module pricing."""
    pricing = await db.module_pricing.find_one({"type": "global"}, {"_id": 0})
    if not pricing:
        return DEFAULT_MODULE_PRICES
    return {k: v for k, v in pricing.items() if k != "type"}


@router.put("/platform/module-pricing")
async def update_module_pricing(pricing: dict, current_user: User = Depends(require_platform_owner)):
    """Update global module pricing."""
    pricing["type"] = "global"
    await db.module_pricing.update_one(
        {"type": "global"},
        {"$set": pricing},
        upsert=True,
    )
    return {"message": "Module pricing updated", "pricing": {k: v for k, v in pricing.items() if k != "type"}}
