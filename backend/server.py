from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
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
fastapi_app = FastAPI(title="Heva One API")
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
from routers import shifts, attendance, timesheets, payroll, swap_requests
from routers import devices
from routers import leave

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
# Workforce module routers (guarded by require_feature("workforce"))
api_router.include_router(shifts.router)
api_router.include_router(attendance.router)
api_router.include_router(timesheets.router)
api_router.include_router(payroll.router)
api_router.include_router(swap_requests.router)
api_router.include_router(devices.router)
api_router.include_router(leave.router)

# Include the main api_router in the app
fastapi_app.include_router(api_router)

# Serve standalone QR menu page for customers scanning QR codes
# This works on Railway without needing React/Node.js
@fastapi_app.get("/menu/{restaurant_id}/{table_hash}")
async def serve_qr_menu_page(restaurant_id: str, table_hash: str):
    template_path = ROOT_DIR / "templates" / "qr_menu.html"
    return FileResponse(str(template_path), media_type="text/html")

# Serve standalone KDS page for smart kitchen monitors
@fastapi_app.get("/kds-monitor/{restaurant_id}")
async def serve_kds_monitor_page(restaurant_id: str):
    template_path = ROOT_DIR / "templates" / "kds_monitor.html"
    return FileResponse(str(template_path), media_type="text/html")

# CORS middleware
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────
# Serve the React SPA from /frontend/build (production only).
# On Railway, railway.toml builds the React app and leaves the output at
# /app/frontend/build. In local dev (where /app/frontend/build does not
# exist) this block is silently skipped — Vite dev server handles the
# frontend on port 3000 as before.
# ──────────────────────────────────────────────────────────────────────
_FRONTEND_BUILD_DIR = ROOT_DIR.parent / "frontend" / "build"
if _FRONTEND_BUILD_DIR.exists() and (_FRONTEND_BUILD_DIR / "index.html").exists():
    # Mount /static so React's hashed JS/CSS asset URLs resolve
    _static_dir = _FRONTEND_BUILD_DIR / "static"
    if _static_dir.exists():
        fastapi_app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

    # Serve root and any client-side route that isn't /api, /menu, /kds-monitor,
    # /socket.io, /static — everything else falls back to index.html so
    # React Router handles the path.
    @fastapi_app.get("/")
    async def serve_root():
        return FileResponse(str(_FRONTEND_BUILD_DIR / "index.html"), media_type="text/html")

    @fastapi_app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Never intercept API / socket / template routes — those are already
        # registered above and would have matched first. This catch-all only
        # fires for paths that didn't hit any earlier route.
        if full_path.startswith(("api/", "socket.io/", "menu/", "kds-monitor/", "static/")):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        # Serve static root-level assets (favicon, manifest, robots, etc.)
        candidate = _FRONTEND_BUILD_DIR / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))

        # Everything else → SPA index (React Router takes over)
        return FileResponse(str(_FRONTEND_BUILD_DIR / "index.html"), media_type="text/html")
    logger_sf = logging.getLogger("static")
    logger_sf.info(f"Serving React SPA from {_FRONTEND_BUILD_DIR}")
# ──────────────────────────────────────────────────────────────────────

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
    # Initialize object storage for photo audit
    try:
        from services.storage import init_storage
        init_storage()
    except Exception as e:
        import logging
        logging.getLogger("startup").warning(f"Object storage init: {e}")
    # Start background task for long shift notifications
    import asyncio
    asyncio.create_task(_long_shift_checker())


async def _long_shift_checker():
    """Background task: every 30 minutes, check for staff clocked in >10h and create nudge notifications."""
    import asyncio
    from datetime import datetime, timezone, timedelta
    while True:
        await asyncio.sleep(1800)  # 30 minutes
        try:
            now = datetime.now(timezone.utc)
            threshold = now - timedelta(hours=10)
            # Find all restaurants with open long shifts
            long_shifts = await db.attendance.find(
                {"clock_out": None, "clock_in": {"$lte": threshold.isoformat()}},
                {"_id": 0}
            ).to_list(500)
            for record in long_shifts:
                staff_id = record["staff_id"]
                record_id = record["id"]
                existing = await db.notifications.find_one(
                    {"staff_id": staff_id, "ref_id": record_id, "type": "long_shift_nudge"}
                )
                if existing:
                    continue
                clock_in = datetime.fromisoformat(record["clock_in"])
                elapsed = round((now - clock_in).total_seconds() / 3600, 1)
                restaurant = await db.restaurants.find_one({"id": record["restaurant_id"]}, {"_id": 0})
                biz_name = restaurant.get("business_info", {}).get("name", "") if restaurant else ""
                notification = {
                    "id": f"notif_{now.timestamp()}_{staff_id}",
                    "restaurant_id": record["restaurant_id"],
                    "staff_id": staff_id,
                    "staff_name": record.get("staff_name", ""),
                    "type": "long_shift_nudge",
                    "ref_id": record_id,
                    "title": "Still on shift?",
                    "message": f"You've been clocked in for {elapsed}h at {biz_name}. Don't forget to clock out!",
                    "read": False,
                    "created_at": now.isoformat(),
                }
                await db.notifications.insert_one(notification)
                # Send push notification if device tokens are available
                try:
                    from services.push import send_push_multi
                    device_docs = await db.devices.find(
                        {"staff_id": staff_id, "is_active": True}, {"_id": 0, "token": 1}
                    ).to_list(10)
                    tokens = [d["token"] for d in device_docs if d.get("token")]
                    if tokens:
                        send_push_multi(tokens, "Still on shift?", notification["message"],
                                        {"type": "long_shift_nudge", "record_id": record_id})
                except Exception as push_err:
                    print(f"[Long shift checker] Push error: {push_err}")
        except Exception as e:
            print(f"[Long shift checker] Error: {e}")


@fastapi_app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
