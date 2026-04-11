from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

router = APIRouter(dependencies=[Depends(require_feature("workforce"))])


class SwapRequestCreate(BaseModel):
    shift_id: str
    reason: Optional[str] = None


@router.post("/swap-requests")
async def create_swap_request(data: SwapRequestCreate, current_user: User = Depends(get_current_user)):
    """Staff requests a shift swap."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    shift = await db.shifts.find_one({"id": data.shift_id, "staff_id": staff["id"]}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found or not assigned to you")

    # Check for existing pending request
    existing = await db.swap_requests.find_one({"shift_id": data.shift_id, "status": "pending"})
    if existing:
        raise HTTPException(status_code=400, detail="A swap request already exists for this shift")

    now = datetime.now(timezone.utc)
    request_doc = {
        "id": f"swap_{now.timestamp()}",
        "restaurant_id": current_user.restaurant_id,
        "shift_id": data.shift_id,
        "requester_id": staff["id"],
        "requester_name": current_user.username,
        "shift_date": shift.get("date"),
        "shift_start": shift.get("start_time"),
        "shift_end": shift.get("end_time"),
        "reason": data.reason or "",
        "status": "pending",
        "created_at": now.isoformat(),
    }
    await db.swap_requests.insert_one(request_doc)
    request_doc.pop("_id", None)
    return request_doc


@router.get("/swap-requests")
async def get_swap_requests(current_user: User = Depends(get_current_user)):
    """Get swap requests. Managers see all pending, staff see their own."""
    query = {"restaurant_id": current_user.restaurant_id}
    if current_user.role == "user":
        staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
        if staff:
            query["requester_id"] = staff["id"]
    else:
        query["status"] = "pending"

    requests = await db.swap_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return requests


@router.put("/swap-requests/{request_id}/approve")
async def approve_swap(request_id: str, current_user: User = Depends(require_admin)):
    """Manager approves a swap request — removes the shift from requester."""
    req = await db.swap_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")

    # Unassign the shift (manager will reassign manually or delete)
    await db.shifts.update_one(
        {"id": req["shift_id"]},
        {"$set": {"staff_id": None, "staff_name": "OPEN - Needs Cover", "swap_approved": True}}
    )
    await db.swap_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "approved", "resolved_by": current_user.username, "resolved_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Swap approved. Shift is now open for reassignment."}


@router.put("/swap-requests/{request_id}/reject")
async def reject_swap(request_id: str, current_user: User = Depends(require_admin)):
    """Manager rejects a swap request."""
    req = await db.swap_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")
    await db.swap_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "rejected", "resolved_by": current_user.username, "resolved_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Swap request rejected"}
