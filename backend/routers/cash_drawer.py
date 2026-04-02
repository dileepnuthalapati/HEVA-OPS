from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import require_admin
from models import User, CashDrawer, CashDrawerOpen, CashDrawerClose
from datetime import datetime, timezone

router = APIRouter()


@router.post("/cash-drawer/open", response_model=CashDrawer)
async def open_cash_drawer(drawer_data: CashDrawerOpen, current_user: User = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.cash_drawers.find_one({"date": today, "status": "open"}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Cash drawer already open for today")

    drawer_id = f"drawer_{datetime.now(timezone.utc).timestamp()}"
    drawer_dict = {
        "id": drawer_id,
        "date": today,
        "opening_balance": drawer_data.opening_balance,
        "expected_cash": drawer_data.opening_balance,
        "actual_cash": 0.0,
        "difference": 0.0,
        "notes": None,
        "opened_by": current_user.username,
        "closed_by": None,
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "closed_at": None,
        "status": "open"
    }
    await db.cash_drawers.insert_one(drawer_dict)
    return CashDrawer(**drawer_dict)


@router.get("/cash-drawer/current", response_model=CashDrawer)
async def get_current_cash_drawer(current_user: User = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    drawer = await db.cash_drawers.find_one({"date": today, "status": "open"}, {"_id": 0})
    if not drawer:
        raise HTTPException(status_code=404, detail="No open cash drawer for today")

    cash_orders = await db.orders.find(
        {"status": "completed", "payment_method": "cash", "created_at": {"$gte": drawer["opened_at"]}},
        {"_id": 0}
    ).to_list(10000)

    total_cash_sales = sum(order.get("total_amount", 0) for order in cash_orders)
    drawer["expected_cash"] = drawer["opening_balance"] + total_cash_sales
    return CashDrawer(**drawer)


@router.put("/cash-drawer/close", response_model=CashDrawer)
async def close_cash_drawer(close_data: CashDrawerClose, current_user: User = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    drawer = await db.cash_drawers.find_one({"date": today, "status": "open"}, {"_id": 0})
    if not drawer:
        raise HTTPException(status_code=404, detail="No open cash drawer to close")

    cash_orders = await db.orders.find(
        {"status": "completed", "payment_method": "cash", "created_at": {"$gte": drawer["opened_at"]}},
        {"_id": 0}
    ).to_list(10000)

    total_cash_sales = sum(order.get("total_amount", 0) for order in cash_orders)
    expected_cash = drawer["opening_balance"] + total_cash_sales
    difference = close_data.actual_cash - expected_cash

    await db.cash_drawers.update_one(
        {"id": drawer["id"]},
        {"$set": {
            "actual_cash": close_data.actual_cash,
            "expected_cash": expected_cash,
            "difference": difference,
            "notes": close_data.notes,
            "closed_by": current_user.username,
            "closed_at": datetime.now(timezone.utc).isoformat(),
            "status": "closed"
        }}
    )

    updated = await db.cash_drawers.find_one({"id": drawer["id"]}, {"_id": 0})
    return CashDrawer(**updated)


@router.get("/cash-drawer/history")
async def get_cash_drawer_history(current_user: User = Depends(require_admin)):
    drawers = await db.cash_drawers.find({}, {"_id": 0}).sort("date", -1).limit(30).to_list(100)
    return drawers
