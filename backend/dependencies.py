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
            created_at=user_doc.get("created_at")
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
            created_at=user_doc.get("created_at")
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


def require_platform_owner(current_user: User = Depends(get_current_user)):
    if current_user.role != "platform_owner":
        raise HTTPException(status_code=403, detail="Platform owner access required")
    return current_user
