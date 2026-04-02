from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin
from models import User, Reservation, ReservationCreate, ReservationUpdate
from typing import List
from datetime import datetime, timezone

router = APIRouter()


@router.get("/reservations", response_model=List[Reservation])
async def get_reservations(
    date: str = None,
    status: str = None,
    current_user: User = Depends(get_current_user)
):
    query = {}
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["$or"] = [
            {"restaurant_id": current_user.restaurant_id},
            {"restaurant_id": None},
            {"restaurant_id": {"$exists": False}}
        ]
    if date:
        query["date"] = date
    if status:
        query["status"] = status
    reservations = await db.reservations.find(query, {"_id": 0}).sort("date", 1).to_list(200)
    return [Reservation(**r) for r in reservations]


@router.post("/reservations", response_model=Reservation)
async def create_reservation(res_data: ReservationCreate, current_user: User = Depends(require_admin)):
    if not current_user.restaurant_id and current_user.role != 'platform_owner':
        raise HTTPException(status_code=400, detail="No restaurant associated with user")

    restaurant_id = current_user.restaurant_id or "platform"
    res_id = f"res_{datetime.now(timezone.utc).timestamp()}"

    if res_data.table_id:
        table = await db.tables.find_one({"id": res_data.table_id}, {"_id": 0})
        if not table:
            raise HTTPException(status_code=404, detail="Table not found")
        existing_res = await db.reservations.find_one({
            "table_id": res_data.table_id,
            "date": res_data.date,
            "status": {"$in": ["confirmed", "seated"]},
            "time": res_data.time
        })
        if existing_res:
            raise HTTPException(status_code=400, detail=f"Table already reserved at {res_data.time}")

    res_dict = {
        "id": res_id,
        "guest_name": res_data.guest_name,
        "guest_phone": res_data.guest_phone,
        "guest_email": res_data.guest_email,
        "party_size": res_data.party_size,
        "date": res_data.date,
        "time": res_data.time,
        "duration_minutes": res_data.duration_minutes,
        "table_id": res_data.table_id,
        "status": "confirmed",
        "notes": res_data.notes,
        "restaurant_id": restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.username
    }
    await db.reservations.insert_one(res_dict)
    return Reservation(**res_dict)


@router.put("/reservations/{res_id}", response_model=Reservation)
async def update_reservation(res_id: str, res_data: ReservationUpdate, current_user: User = Depends(require_admin)):
    existing = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found")

    update_dict = {k: v for k, v in res_data.model_dump().items() if v is not None}

    if res_data.table_id and res_data.table_id != existing.get("table_id"):
        table = await db.tables.find_one({"id": res_data.table_id}, {"_id": 0})
        if not table:
            raise HTTPException(status_code=404, detail="Table not found")

    if update_dict:
        await db.reservations.update_one({"id": res_id}, {"$set": update_dict})

    updated = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    return Reservation(**updated)


@router.delete("/reservations/{res_id}")
async def cancel_reservation(res_id: str, current_user: User = Depends(require_admin)):
    existing = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found")

    await db.reservations.update_one(
        {"id": res_id},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}}
    )

    if existing.get("table_id"):
        await db.tables.update_one(
            {"id": existing["table_id"]},
            {"$set": {"status": "available"}}
        )
    return {"message": "Reservation cancelled"}


@router.post("/reservations/{res_id}/seat")
async def seat_reservation(res_id: str, current_user: User = Depends(get_current_user)):
    existing = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found")

    await db.reservations.update_one(
        {"id": res_id},
        {"$set": {"status": "seated", "seated_at": datetime.now(timezone.utc).isoformat()}}
    )

    if existing.get("table_id"):
        await db.tables.update_one(
            {"id": existing["table_id"]},
            {"$set": {"status": "occupied"}}
        )
    return {"message": "Guests seated"}


@router.post("/reservations/{res_id}/complete")
async def complete_reservation(res_id: str, current_user: User = Depends(get_current_user)):
    existing = await db.reservations.find_one({"id": res_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found")

    await db.reservations.update_one(
        {"id": res_id},
        {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}}
    )

    if existing.get("table_id"):
        await db.tables.update_one(
            {"id": existing["table_id"]},
            {"$set": {"status": "available", "current_order_id": None}}
        )
    return {"message": "Reservation completed"}
