from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin, require_feature
from models import User
from datetime import datetime, timezone

router = APIRouter(dependencies=[Depends(require_feature("workforce"))])


@router.get("/payroll/report")
async def get_payroll_report(start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    """Get payroll report: approved hours × hourly rate per staff."""
    rest_id = current_user.restaurant_id

    staff_list = await db.users.find(
        {"restaurant_id": rest_id},
        {"_id": 0, "id": 1, "username": 1, "position": 1, "hourly_rate": 1}
    ).to_list(100)

    total_cost = 0
    staff_payroll = []

    for s in staff_list:
        sid = s["id"]
        rate = s.get("hourly_rate", 0) or 0

        # Get approved attendance records
        records = await db.attendance.find(
            {"restaurant_id": rest_id, "staff_id": sid, "date": {"$gte": start_date, "$lte": end_date}},
            {"_id": 0, "hours_worked": 1, "approved": 1, "date": 1}
        ).to_list(500)

        total_hours = sum(r.get("hours_worked", 0) or 0 for r in records)
        approved_hours = sum(r.get("hours_worked", 0) or 0 for r in records if r.get("approved"))
        gross_pay = round(approved_hours * rate, 2)
        total_cost += gross_pay

        if total_hours > 0 or rate > 0:
            staff_payroll.append({
                "staff_id": sid,
                "staff_name": s.get("username", ""),
                "position": s.get("position", ""),
                "hourly_rate": rate,
                "total_hours": round(total_hours, 2),
                "approved_hours": round(approved_hours, 2),
                "gross_pay": gross_pay,
            })

    return {
        "period": {"start_date": start_date, "end_date": end_date},
        "staff": staff_payroll,
        "total_labour_cost": round(total_cost, 2),
    }


@router.get("/analytics/efficiency")
async def get_efficiency_ratio(start_date: str, end_date: str, current_user: User = Depends(require_admin)):
    """Calculate Revenue ÷ Labour Cost efficiency ratio."""
    rest_id = current_user.restaurant_id

    # Get total revenue from POS orders
    orders = await db.orders.find(
        {
            "restaurant_id": rest_id,
            "status": "completed",
            "created_at": {"$gte": f"{start_date}T00:00:00", "$lte": f"{end_date}T23:59:59"},
        },
        {"_id": 0, "total_amount": 1, "total": 1}
    ).to_list(10000)
    total_revenue = sum(o.get("total_amount", 0) or o.get("total", 0) for o in orders)

    # Get total labour cost
    staff_list = await db.users.find(
        {"restaurant_id": rest_id},
        {"_id": 0, "id": 1, "hourly_rate": 1}
    ).to_list(100)

    total_labour = 0
    for s in staff_list:
        rate = s.get("hourly_rate", 0) or 0
        records = await db.attendance.find(
            {"restaurant_id": rest_id, "staff_id": s["id"], "date": {"$gte": start_date, "$lte": end_date}, "approved": True},
            {"_id": 0, "hours_worked": 1}
        ).to_list(500)
        hours = sum(r.get("hours_worked", 0) or 0 for r in records)
        total_labour += hours * rate

    ratio = round(total_revenue / total_labour, 2) if total_labour > 0 else 0

    return {
        "period": {"start_date": start_date, "end_date": end_date},
        "total_revenue": round(total_revenue, 2),
        "total_labour_cost": round(total_labour, 2),
        "efficiency_ratio": ratio,
        "interpretation": "Good (>4)" if ratio >= 4 else "Average (2-4)" if ratio >= 2 else "Low (<2)" if total_labour > 0 else "No labour data",
    }
