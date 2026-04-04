from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pathlib import Path
import socketio
import sentry_sdk
import os
import logging

# Load env before anything else
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Sentry error monitoring (optional — set SENTRY_DSN in .env to enable)
sentry_dsn = os.environ.get('SENTRY_DSN')
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
        environment=os.environ.get('ENVIRONMENT', 'production'),
    )

# Import database to ensure connection is established
from database import client

# Import Socket.IO server
from socket_manager import sio

# Rate limiter
from rate_limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Create FastAPI app
fastapi_app = FastAPI(title="HevaPOS API")
fastapi_app.state.limiter = limiter
fastapi_app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Create the main API router with /api prefix
api_router = APIRouter(prefix="/api")

# Import all sub-routers
from routers import auth, platform, restaurants, menu, orders, reports, receipts
from routers import cash_drawer, printers, tables, reservations
from routers import subscriptions, notifications, staff, health, email
from routers import qr_menu, kds, audit, payments
from routers import docs as feature_docs

# Include all routers into the api_router
api_router.include_router(auth.router)
api_router.include_router(platform.router)
api_router.include_router(restaurants.router)
api_router.include_router(menu.router)
api_router.include_router(orders.router)
api_router.include_router(reports.router)
api_router.include_router(receipts.router)
api_router.include_router(cash_drawer.router)
api_router.include_router(printers.router)
api_router.include_router(tables.router)
api_router.include_router(reservations.router)
api_router.include_router(subscriptions.router)
api_router.include_router(notifications.router)
api_router.include_router(staff.router)
api_router.include_router(health.router)
api_router.include_router(email.router)
api_router.include_router(qr_menu.router)
api_router.include_router(kds.router)
api_router.include_router(audit.router)
api_router.include_router(payments.router)
api_router.include_router(feature_docs.router)

# Include the main api_router in the app
fastapi_app.include_router(api_router)

# CORS middleware
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wrap FastAPI with Socket.IO ASGI app
# This handles both HTTP (FastAPI) and WebSocket (Socket.IO) traffic
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@fastapi_app.on_event("startup")
async def startup_event():
    from indexes import ensure_indexes
    await ensure_indexes()


@fastapi_app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
