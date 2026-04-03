"""
HevaPOS WebSocket Manager — Socket.IO for real-time order updates.

Events:
  - join_restaurant: Client joins a restaurant room to receive events
  - new_qr_order: Server emits when a guest places a QR order
  - order_update: Server emits when any order status changes
"""
import socketio
import logging

logger = logging.getLogger(__name__)

# Create Socket.IO server (ASGI mode for FastAPI)
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False,
)


@sio.event
async def connect(sid, environ):
    logger.info(f"[Socket.IO] Client connected: {sid}")


@sio.event
async def disconnect(sid):
    logger.info(f"[Socket.IO] Client disconnected: {sid}")


@sio.event
async def join_restaurant(sid, data):
    """Client joins a restaurant room to receive order updates."""
    restaurant_id = data.get('restaurant_id') if isinstance(data, dict) else data
    if restaurant_id:
        sio.enter_room(sid, f"restaurant_{restaurant_id}")
        logger.info(f"[Socket.IO] {sid} joined room restaurant_{restaurant_id}")
        await sio.emit('joined', {'room': restaurant_id}, to=sid)


async def emit_new_qr_order(restaurant_id: str, order_data: dict):
    """Emit new QR order event to all POS devices in the restaurant."""
    room = f"restaurant_{restaurant_id}"
    logger.info(f"[Socket.IO] Emitting new_qr_order to {room}")
    await sio.emit('new_qr_order', order_data, room=room)


async def emit_order_update(restaurant_id: str, order_data: dict):
    """Emit order status update to all devices in the restaurant."""
    room = f"restaurant_{restaurant_id}"
    await sio.emit('order_update', order_data, room=room)
