from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(dependencies=[Depends(require_feature("workforce"))])


class SwapRequestCreate(BaseModel):
    shift_id: str
    target_staff_ids: Optional[List[str]] = None
    reason: Optional[str] = None


class DropShiftRequest(BaseModel):
    shift_id: str
    reason_code: str  # "emergency", "sickness", "unresolved_swap"
    note: Optional[str] = None


class ReassignRequest(BaseModel):
    target_staff_id: str


@router.get("/swap-requests/eligible/{shift_id}")
async def get_eligible_staff(shift_id: str, current_user: User = Depends(get_current_user)):
    """Get list of colleagues eligible to take a specific shift."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    shift = await db.shifts.find_one({"id": shift_id, "staff_id": staff["id"]}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found or not assigned to you")

    # All active staff in the same restaurant except the requester
    colleagues = await db.users.find(
        {
            "restaurant_id": current_user.restaurant_id,
            "id": {"$ne": staff["id"]},
            "role": {"$in": ["user", "admin"]},
        },
        {"_id": 0, "password_hash": 0, "pos_pin_hash": 0, "manager_pin_hash": 0}
    ).to_list(100)

    return [{"id": c["id"], "username": c.get("username", ""), "position": c.get("position", "")} for c in colleagues]


@router.post("/swap-requests")
async def create_swap_request(data: SwapRequestCreate, current_user: User = Depends(get_current_user)):
    """Staff A requests a swap. Sends to specific colleagues or all eligible staff."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    shift = await db.shifts.find_one({"id": data.shift_id, "staff_id": staff["id"]}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found or not assigned to you")

    # Check for existing open request
    existing = await db.swap_requests.find_one({
        "shift_id": data.shift_id,
        "status": {"$in": ["waiting_acceptance", "pending_approval"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="A swap request already exists for this shift")

    # Determine targets
    target_ids = data.target_staff_ids
    if not target_ids:
        colleagues = await db.users.find(
            {"restaurant_id": current_user.restaurant_id, "id": {"$ne": staff["id"]}, "role": {"$in": ["user", "admin"]}},
            {"_id": 0, "id": 1}
        ).to_list(100)
        target_ids = [c["id"] for c in colleagues]

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
        "shift_position": shift.get("position", ""),
        "target_staff_ids": target_ids,
        "acceptor_id": None,
        "acceptor_name": None,
        "reason": data.reason or "",
        "status": "waiting_acceptance",  # Step 1: waiting for a colleague to accept
        "created_at": now.isoformat(),
    }
    await db.swap_requests.insert_one(request_doc)

    # Create notifications for target staff
    for tid in target_ids:
        target_user = await db.users.find_one({"id": tid}, {"_id": 0, "username": 1})
        await db.notifications.insert_one({
            "id": f"notif_{now.timestamp()}_{tid}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": tid,
            "staff_name": target_user.get("username", "") if target_user else "",
            "type": "swap_request",
            "ref_id": request_doc["id"],
            "title": "Shift Swap Request",
            "message": f"{current_user.username} wants to swap their {shift.get('date')} shift ({shift.get('start_time')}-{shift.get('end_time')}). Can you cover?",
            "read": False,
            "created_at": now.isoformat(),
        })

    # Also send push notifications
    try:
        from services.push import send_push_multi
        device_docs = await db.devices.find(
            {"staff_id": {"$in": target_ids}, "is_active": True}, {"_id": 0, "token": 1}
        ).to_list(50)
        tokens = [d["token"] for d in device_docs if d.get("token")]
        if tokens:
            send_push_multi(tokens, "Shift Swap Request",
                            f"{current_user.username} needs someone to cover {shift.get('date')} {shift.get('start_time')}-{shift.get('end_time')}",
                            {"type": "swap_request", "swap_id": request_doc["id"]})
    except Exception:
        pass

    return {"message": f"Swap request sent to {len(target_ids)} colleagues", "id": request_doc["id"], "status": "waiting_acceptance"}


@router.get("/swap-requests")
async def get_swap_requests(current_user: User = Depends(get_current_user)):
    """Get swap requests relevant to the current user.
    - Staff see: their own requests + incoming requests targeted at them
    - Admin see: all pending_approval requests (ready for manager decision)"""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    staff_id = staff.get("id") if staff else None

    if current_user.role == "admin":
        # Manager sees requests awaiting their approval + waiting_acceptance for visibility
        requests = await db.swap_requests.find(
            {"restaurant_id": current_user.restaurant_id, "status": {"$in": ["pending_approval", "waiting_acceptance"]}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(200)
    else:
        # Staff sees: their own requests (any status) + incoming requests they can accept
        own = await db.swap_requests.find(
            {"restaurant_id": current_user.restaurant_id, "requester_id": staff_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)

        incoming = await db.swap_requests.find(
            {
                "restaurant_id": current_user.restaurant_id,
                "status": "waiting_acceptance",
                "target_staff_ids": staff_id,
                "requester_id": {"$ne": staff_id},
            },
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)

        # Merge and deduplicate
        seen = set()
        requests = []
        for r in own + incoming:
            if r["id"] not in seen:
                seen.add(r["id"])
                # Mark if this is an incoming request the user can accept
                r["can_accept"] = (r["status"] == "waiting_acceptance" and staff_id in (r.get("target_staff_ids") or []) and r["requester_id"] != staff_id)
                requests.append(r)

    return requests


# Step 2: Colleague accepts the swap
@router.put("/swap-requests/{request_id}/accept")
async def accept_swap(request_id: str, current_user: User = Depends(get_current_user)):
    """Colleague B accepts the swap. Moves to pending_approval for manager."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    req = await db.swap_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")
    if req["status"] != "waiting_acceptance":
        raise HTTPException(status_code=400, detail="This request is no longer available")
    if staff["id"] not in (req.get("target_staff_ids") or []):
        raise HTTPException(status_code=403, detail="You are not an eligible swap partner for this request")
    if staff["id"] == req["requester_id"]:
        raise HTTPException(status_code=400, detail="You cannot accept your own swap request")

    now = datetime.now(timezone.utc)
    await db.swap_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "pending_approval",
            "acceptor_id": staff["id"],
            "acceptor_name": current_user.username,
            "accepted_at": now.isoformat(),
        }}
    )

    # Notify the requester
    await db.notifications.insert_one({
        "id": f"notif_{now.timestamp()}_{req['requester_id']}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": req["requester_id"],
        "type": "swap_accepted",
        "ref_id": request_id,
        "title": "Swap Accepted!",
        "message": f"{current_user.username} agreed to cover your {req['shift_date']} shift. Waiting for manager approval.",
        "read": False,
        "created_at": now.isoformat(),
    })

    # Notify admins
    admins = await db.users.find(
        {"restaurant_id": current_user.restaurant_id, "role": "admin"},
        {"_id": 0, "id": 1, "username": 1}
    ).to_list(20)
    for admin in admins:
        await db.notifications.insert_one({
            "id": f"notif_{now.timestamp()}_{admin['id']}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": admin["id"],
            "type": "swap_pending_approval",
            "ref_id": request_id,
            "title": "Swap Needs Approval",
            "message": f"{req['requester_name']} ↔ {current_user.username} for {req['shift_date']} shift. Approve?",
            "read": False,
            "created_at": now.isoformat(),
        })

    return {"message": f"You accepted the swap! Waiting for manager approval.", "status": "pending_approval"}


# Colleague declines
@router.put("/swap-requests/{request_id}/decline")
async def decline_swap(request_id: str, current_user: User = Depends(get_current_user)):
    """Colleague B declines. They are removed from target list. If no targets left, request expires."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    req = await db.swap_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")
    if req["status"] != "waiting_acceptance":
        raise HTTPException(status_code=400, detail="This request is no longer available")

    # Remove this staff from target list
    remaining = [t for t in (req.get("target_staff_ids") or []) if t != staff["id"]]
    update = {"target_staff_ids": remaining}

    if not remaining:
        # No one left to accept — mark as expired
        update["status"] = "expired"
        update["expired_at"] = datetime.now(timezone.utc).isoformat()

    await db.swap_requests.update_one({"id": request_id}, {"$set": update})

    if not remaining:
        return {"message": "Declined. No other colleagues available — request expired.", "status": "expired"}
    return {"message": "Declined. Request still open for other colleagues.", "status": "waiting_acceptance"}


# Step 3: Manager approves — auto-reassign shift
@router.put("/swap-requests/{request_id}/approve")
async def approve_swap(request_id: str, current_user: User = Depends(require_admin)):
    """Manager approves a swap. Shift is automatically reassigned from A to B."""
    req = await db.swap_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")
    if req["status"] != "pending_approval":
        raise HTTPException(status_code=400, detail=f"Request must be in 'pending_approval' state (current: {req['status']})")
    if not req.get("acceptor_id"):
        raise HTTPException(status_code=400, detail="No colleague has accepted this swap yet")

    now = datetime.now(timezone.utc)

    # Auto-reassign the shift from A to B
    await db.shifts.update_one(
        {"id": req["shift_id"]},
        {"$set": {
            "staff_id": req["acceptor_id"],
            "staff_name": req["acceptor_name"],
            "swapped_from": req["requester_id"],
            "swap_approved_at": now.isoformat(),
        }}
    )

    await db.swap_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "approved",
            "resolved_by": current_user.username,
            "resolved_at": now.isoformat(),
        }}
    )

    # Notify both parties
    for sid, msg in [(req["requester_id"], f"Your swap was approved! {req['acceptor_name']} will cover your {req['shift_date']} shift."),
                     (req["acceptor_id"], f"Swap approved! You're now working {req['shift_date']} {req['shift_start']}-{req['shift_end']}.")]:
        await db.notifications.insert_one({
            "id": f"notif_{now.timestamp()}_{sid}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": sid,
            "type": "swap_approved",
            "ref_id": request_id,
            "title": "Swap Approved",
            "message": msg,
            "read": False,
            "created_at": now.isoformat(),
        })

    return {"message": f"Swap approved. Shift reassigned from {req['requester_name']} to {req['acceptor_name']}."}


# Manager rejects
@router.put("/swap-requests/{request_id}/reject")
async def reject_swap(request_id: str, current_user: User = Depends(require_admin)):
    """Manager rejects the swap."""
    req = await db.swap_requests.find_one({"id": request_id, "restaurant_id": current_user.restaurant_id})
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")
    if req["status"] not in ["pending_approval", "waiting_acceptance"]:
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")

    await db.swap_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "rejected", "resolved_by": current_user.username, "resolved_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Notify requester
    await db.notifications.insert_one({
        "id": f"notif_{datetime.now(timezone.utc).timestamp()}_{req['requester_id']}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": req["requester_id"],
        "type": "swap_rejected",
        "ref_id": request_id,
        "title": "Swap Rejected",
        "message": f"Your swap request for {req['shift_date']} was rejected by the manager.",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"message": "Swap request rejected"}


# ══════════════════════════════════════════════════════
# DROP SHIFT — Escalation Path
# ══════════════════════════════════════════════════════

VALID_DROP_REASONS = {"emergency": "Emergency (Medical/Family)", "sickness": "Sickness", "unresolved_swap": "Unresolved Swap"}


@router.post("/shifts/drop")
async def drop_shift(data: DropShiftRequest, current_user: User = Depends(get_current_user)):
    """Staff drops a shift when swap fails or emergency. Escalates to manager."""
    if data.reason_code not in VALID_DROP_REASONS:
        raise HTTPException(status_code=400, detail=f"Invalid reason. Must be one of: {', '.join(VALID_DROP_REASONS.keys())}")

    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    shift = await db.shifts.find_one({"id": data.shift_id, "staff_id": staff["id"]}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found or not assigned to you")

    # Check for existing drop request
    existing = await db.drop_requests.find_one({"shift_id": data.shift_id, "status": {"$in": ["pending", "open"]}})
    if existing:
        raise HTTPException(status_code=400, detail="A drop request already exists for this shift")

    now = datetime.now(timezone.utc)
    drop_doc = {
        "id": f"drop_{now.timestamp()}",
        "restaurant_id": current_user.restaurant_id,
        "shift_id": data.shift_id,
        "requester_id": staff["id"],
        "requester_name": current_user.username,
        "shift_date": shift.get("date"),
        "shift_start": shift.get("start_time"),
        "shift_end": shift.get("end_time"),
        "shift_position": shift.get("position", ""),
        "reason_code": data.reason_code,
        "reason_label": VALID_DROP_REASONS[data.reason_code],
        "note": data.note or "",
        "status": "pending",  # Waiting for manager decision
        "created_at": now.isoformat(),
    }
    await db.drop_requests.insert_one(drop_doc)

    # If sickness, auto-log to attendance as sick leave
    if data.reason_code == "sickness":
        await db.attendance.insert_one({
            "id": f"att_sick_{now.timestamp()}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": staff["id"],
            "staff_name": current_user.username,
            "date": shift.get("date"),
            "clock_in": None,
            "clock_out": None,
            "hours_worked": 0,
            "entry_source": "sick_leave",
            "flagged": False,
            "flag_reason": None,
            "approved": False,
            "note": f"Sick leave — shift dropped ({shift.get('start_time')}-{shift.get('end_time')})",
            "created_at": now.isoformat(),
        })

    # High-priority notification to all admins
    admins = await db.users.find(
        {"restaurant_id": current_user.restaurant_id, "role": "admin"},
        {"_id": 0, "id": 1}
    ).to_list(20)
    priority_emoji = "CRITICAL" if data.reason_code == "emergency" else "URGENT"
    for admin in admins:
        await db.notifications.insert_one({
            "id": f"notif_{now.timestamp()}_{admin['id']}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": admin["id"],
            "type": "drop_request",
            "ref_id": drop_doc["id"],
            "title": f"{priority_emoji}: Shift Drop Request",
            "message": f"{current_user.username} cannot work {shift.get('date')} {shift.get('start_time')}-{shift.get('end_time')}. Reason: {VALID_DROP_REASONS[data.reason_code]}",
            "read": False,
            "created_at": now.isoformat(),
        })

    # Push to admin devices
    try:
        from services.push import send_push_multi
        admin_ids = [a["id"] for a in admins]
        device_docs = await db.devices.find({"staff_id": {"$in": admin_ids}, "is_active": True}, {"_id": 0, "token": 1}).to_list(20)
        tokens = [d["token"] for d in device_docs if d.get("token")]
        if tokens:
            send_push_multi(tokens, f"{priority_emoji}: Shift Drop",
                            f"{current_user.username} dropped {shift.get('date')} shift. Reason: {VALID_DROP_REASONS[data.reason_code]}",
                            {"type": "drop_request", "drop_id": drop_doc["id"]})
    except Exception:
        pass

    return {"message": f"Drop request submitted. Manager has been alerted.", "id": drop_doc["id"], "status": "pending"}


@router.get("/drop-requests")
async def get_drop_requests(current_user: User = Depends(get_current_user)):
    """Get drop requests. Admin sees all pending/open, staff sees their own."""
    query = {"restaurant_id": current_user.restaurant_id}
    if current_user.role != "admin":
        staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
        query["requester_id"] = staff["id"] if staff else "none"
    else:
        query["status"] = {"$in": ["pending", "open"]}

    return await db.drop_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)


@router.put("/drop-requests/{drop_id}/approve-open")
async def approve_and_open(drop_id: str, current_user: User = Depends(require_admin)):
    """Manager approves drop → shift becomes Open in the marketplace."""
    drop = await db.drop_requests.find_one({"id": drop_id, "restaurant_id": current_user.restaurant_id})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop request not found")
    if drop["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Drop request is already {drop['status']}")

    now = datetime.now(timezone.utc)

    # Mark shift as open
    await db.shifts.update_one(
        {"id": drop["shift_id"]},
        {"$set": {
            "staff_id": None,
            "staff_name": None,
            "is_open": True,
            "open_reason": drop["reason_code"],
            "dropped_by": drop["requester_id"],
            "opened_at": now.isoformat(),
        }}
    )

    await db.drop_requests.update_one(
        {"id": drop_id},
        {"$set": {"status": "open", "resolved_by": current_user.username, "resolved_at": now.isoformat()}}
    )

    # Blast notification to ALL eligible staff
    all_staff = await db.users.find(
        {"restaurant_id": current_user.restaurant_id, "id": {"$ne": drop["requester_id"]}, "role": {"$in": ["user", "admin"]}},
        {"_id": 0, "id": 1}
    ).to_list(100)

    for s in all_staff:
        await db.notifications.insert_one({
            "id": f"notif_{now.timestamp()}_{s['id']}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": s["id"],
            "type": "open_shift",
            "ref_id": drop["shift_id"],
            "title": "Shift Up for Grabs!",
            "message": f"Open shift: {drop['shift_date']} {drop['shift_start']}-{drop['shift_end']}. First to claim gets the hours!",
            "read": False,
            "created_at": now.isoformat(),
        })

    # Push blast
    try:
        from services.push import send_push_multi
        staff_ids = [s["id"] for s in all_staff]
        device_docs = await db.devices.find({"staff_id": {"$in": staff_ids}, "is_active": True}, {"_id": 0, "token": 1}).to_list(100)
        tokens = [d["token"] for d in device_docs if d.get("token")]
        if tokens:
            send_push_multi(tokens, "Shift Up for Grabs!",
                            f"Open shift: {drop['shift_date']} {drop['shift_start']}-{drop['shift_end']}. Claim it now!",
                            {"type": "open_shift", "shift_id": drop["shift_id"]})
    except Exception:
        pass

    # Notify the requester
    await db.notifications.insert_one({
        "id": f"notif_{now.timestamp()}_{drop['requester_id']}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": drop["requester_id"],
        "type": "drop_approved",
        "ref_id": drop_id,
        "title": "Shift Drop Approved",
        "message": f"Your {drop['shift_date']} shift has been removed. The manager is finding cover.",
        "read": False,
        "created_at": now.isoformat(),
    })

    return {"message": f"Shift opened for marketplace. {len(all_staff)} staff notified."}


@router.put("/drop-requests/{drop_id}/reassign")
async def reassign_shift(drop_id: str, data: ReassignRequest, current_user: User = Depends(require_admin)):
    """Manager directly reassigns the dropped shift to a specific staff member."""
    drop = await db.drop_requests.find_one({"id": drop_id, "restaurant_id": current_user.restaurant_id})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop request not found")
    if drop["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Drop request is already {drop['status']}")

    target = await db.users.find_one({"id": data.target_staff_id, "restaurant_id": current_user.restaurant_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target staff not found")

    now = datetime.now(timezone.utc)

    await db.shifts.update_one(
        {"id": drop["shift_id"]},
        {"$set": {
            "staff_id": data.target_staff_id,
            "staff_name": target.get("username", ""),
            "reassigned_by": current_user.username,
            "reassigned_at": now.isoformat(),
        }}
    )

    await db.drop_requests.update_one(
        {"id": drop_id},
        {"$set": {"status": "reassigned", "resolved_by": current_user.username, "resolved_at": now.isoformat(), "reassigned_to": data.target_staff_id}}
    )

    # Notify both parties
    await db.notifications.insert_one({
        "id": f"notif_{now.timestamp()}_{drop['requester_id']}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": drop["requester_id"],
        "type": "drop_resolved",
        "ref_id": drop_id,
        "title": "Shift Covered",
        "message": f"Your {drop['shift_date']} shift has been reassigned to {target.get('username')}.",
        "read": False,
        "created_at": now.isoformat(),
    })
    await db.notifications.insert_one({
        "id": f"notif_{now.timestamp()}_{data.target_staff_id}",
        "restaurant_id": current_user.restaurant_id,
        "staff_id": data.target_staff_id,
        "type": "shift_reassigned",
        "ref_id": drop["shift_id"],
        "title": "Shift Assigned to You",
        "message": f"You've been assigned to cover {drop['shift_date']} {drop['shift_start']}-{drop['shift_end']}.",
        "read": False,
        "created_at": now.isoformat(),
    })

    return {"message": f"Shift reassigned to {target.get('username')}."}


# ══════════════════════════════════════════════════════
# OPEN SHIFT MARKETPLACE — Claim
# ══════════════════════════════════════════════════════

@router.get("/shifts/open")
async def get_open_shifts(current_user: User = Depends(get_current_user)):
    """Get all open shifts available to claim."""
    shifts = await db.shifts.find(
        {"restaurant_id": current_user.restaurant_id, "is_open": True},
        {"_id": 0}
    ).sort("date", 1).to_list(50)
    return shifts


@router.post("/shifts/{shift_id}/claim")
async def claim_open_shift(shift_id: str, current_user: User = Depends(get_current_user)):
    """Staff claims an open shift — first come, first served. No manager approval needed."""
    staff = await db.users.find_one({"username": current_user.username}, {"_id": 0, "id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    shift = await db.shifts.find_one({"id": shift_id, "restaurant_id": current_user.restaurant_id, "is_open": True}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found or already claimed")

    # Can't claim your own dropped shift
    if shift.get("dropped_by") == staff["id"]:
        raise HTTPException(status_code=400, detail="You cannot claim a shift you dropped")

    now = datetime.now(timezone.utc)

    # Assign to claimer
    await db.shifts.update_one(
        {"id": shift_id, "is_open": True},
        {"$set": {
            "staff_id": staff["id"],
            "staff_name": current_user.username,
            "is_open": False,
            "claimed_by": staff["id"],
            "claimed_at": now.isoformat(),
        }}
    )

    # Update any associated drop request
    await db.drop_requests.update_one(
        {"shift_id": shift_id, "status": "open"},
        {"$set": {"status": "claimed", "claimed_by": staff["id"], "claimed_at": now.isoformat()}}
    )

    # Notify admins
    admins = await db.users.find(
        {"restaurant_id": current_user.restaurant_id, "role": "admin"},
        {"_id": 0, "id": 1}
    ).to_list(20)
    for admin in admins:
        await db.notifications.insert_one({
            "id": f"notif_{now.timestamp()}_{admin['id']}",
            "restaurant_id": current_user.restaurant_id,
            "staff_id": admin["id"],
            "type": "shift_claimed",
            "ref_id": shift_id,
            "title": "Open Shift Claimed",
            "message": f"{current_user.username} claimed the {shift.get('date')} {shift.get('start_time')}-{shift.get('end_time')} shift.",
            "read": False,
            "created_at": now.isoformat(),
        })

    return {"message": f"Shift claimed! You're now working {shift.get('date')} {shift.get('start_time')}-{shift.get('end_time')}.", "shift_id": shift_id}
