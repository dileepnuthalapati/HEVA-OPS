from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
from database import db
from models import User
import jwt
import os

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_doc = await db.users.find_one({"username": username}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        return User(
            id=user_doc.get("id", ""),
            username=user_doc["username"],
            role=user_doc.get("role", "user"),
            restaurant_id=user_doc.get("restaurant_id"),
            created_at=user_doc.get("created_at"),
            capabilities=user_doc.get("capabilities", []) or []
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def decode_token(token: str):
    """Decode a JWT token and return the User object, or None if invalid."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            return None
        user_doc = await db.users.find_one({"username": username}, {"_id": 0})
        if not user_doc:
            return None
        return User(
            id=user_doc.get("id", ""),
            username=user_doc["username"],
            role=user_doc.get("role", "user"),
            restaurant_id=user_doc.get("restaurant_id"),
            created_at=user_doc.get("created_at"),
            capabilities=user_doc.get("capabilities", []) or []
        )
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None



async def get_current_restaurant(current_user: User = Depends(get_current_user)):
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="No restaurant associated with user")
    return await db.restaurants.find_one({"id": current_user.restaurant_id}, {"_id": 0})


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "platform_owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_rota_manager(current_user: User = Depends(get_current_user)):
    """Admin + any staff with the `workforce.manage_rota` capability.

    Used by rota/attendance/timesheet endpoints so a `manage_rota` persona
    can prepare schedules and check attendance without being a full admin.
    """
    if current_user.role in ["admin", "platform_owner"]:
        return current_user
    if "workforce.manage_rota" in (current_user.capabilities or []):
        return current_user
    raise HTTPException(status_code=403, detail="Requires workforce.manage_rota capability or admin role")


def require_platform_owner(current_user: User = Depends(get_current_user)):
    if current_user.role != "platform_owner":
        raise HTTPException(status_code=403, detail="Platform owner access required")
    return current_user


# ─── Module Feature Guards ──────────────────────────────────────

DEFAULT_FEATURES = {"pos": True, "kds": False, "qr_ordering": False, "workforce": False}

# Dependency tree: module -> list of modules where at least one must be enabled
MODULE_DEPENDENCIES = {
    "kds": ["pos", "qr_ordering"],
}


async def get_restaurant_features(restaurant_id: str) -> dict:
    """Fetch features for a restaurant, returning defaults if not set."""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "features": 1})
    if not restaurant or not restaurant.get("features"):
        return DEFAULT_FEATURES.copy()
    merged = DEFAULT_FEATURES.copy()
    merged.update(restaurant["features"])
    return merged


def has_feature(features: dict, feature_name: str) -> bool:
    """Check if a feature is enabled in a features dict."""
    return features.get(feature_name, False)


def require_feature(feature_name: str):
    """FastAPI dependency factory: returns 403 if the module is not enabled for the user's restaurant."""
    async def _check(current_user: User = Depends(get_current_user)):
        if current_user.role == "platform_owner":
            return current_user
        if not current_user.restaurant_id:
            raise HTTPException(status_code=400, detail="No restaurant associated")
        features = await get_restaurant_features(current_user.restaurant_id)
        if not features.get(feature_name, False):
            raise HTTPException(status_code=403, detail=f"Module '{feature_name}' is not enabled for this restaurant")
        return current_user
    return _check


def require_any_feature(*feature_names):
    """FastAPI dependency factory: passes if ANY of the listed features is enabled."""
    async def _check(current_user: User = Depends(get_current_user)):
        if current_user.role == "platform_owner":
            return current_user
        if not current_user.restaurant_id:
            raise HTTPException(status_code=400, detail="No restaurant associated")
        features = await get_restaurant_features(current_user.restaurant_id)
        if not any(features.get(f, False) for f in feature_names):
            names = " or ".join(feature_names)
            raise HTTPException(status_code=403, detail=f"Requires at least one of: {names}")
        return current_user
    return _check


def validate_feature_dependencies(features: dict) -> str | None:
    """Validate module dependency tree. Returns error message or None."""
    for module, deps in MODULE_DEPENDENCIES.items():
        if features.get(module, False):
            if not any(features.get(d, False) for d in deps):
                dep_names = " or ".join(deps)
                return f"'{module}' requires at least one of: {dep_names}"
    return None
