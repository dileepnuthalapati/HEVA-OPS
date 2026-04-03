from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin
from models import User, Table, TableCreate, TableUpdate, TableMerge, TableSplitBill
from typing import List
from datetime import datetime, timezone
import secrets

router = APIRouter()


@router.get("/tables", response_model=List[Table])
async def get_tables(current_user: User = Depends(get_current_user)):
    query = {}
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["$or"] = [
            {"restaurant_id": current_user.restaurant_id},
            {"restaurant_id": None},
            {"restaurant_id": {"$exists": False}}
        ]
    tables = await db.tables.find(query, {"_id": 0}).sort("number", 1).to_list(200)
    return [Table(**t) for t in tables]


@router.post("/tables", response_model=Table)
async def create_table(table_data: TableCreate, current_user: User = Depends(require_admin)):
    if not current_user.restaurant_id and current_user.role != 'platform_owner':
        raise HTTPException(status_code=400, detail="No restaurant associated with user")

    restaurant_id = current_user.restaurant_id or "platform"
    existing = await db.tables.find_one({"restaurant_id": restaurant_id, "number": table_data.number})
    if existing:
        raise HTTPException(status_code=400, detail=f"Table {table_data.number} already exists")

    table_id = f"table_{datetime.now(timezone.utc).timestamp()}"
    table_dict = {
        "id": table_id,
        "number": table_data.number,
        "name": table_data.name or f"Table {table_data.number}",
        "capacity": table_data.capacity,
        "status": "available",
        "restaurant_id": restaurant_id,
        "current_order_id": None,
        "merged_with": None,
        "qr_hash": secrets.token_urlsafe(6),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tables.insert_one(table_dict)
    return Table(**table_dict)


@router.put("/tables/{table_id}", response_model=Table)
async def update_table(table_id: str, table_data: TableUpdate, current_user: User = Depends(require_admin)):
    update_dict = {k: v for k, v in table_data.model_dump().items() if v is not None}
    if update_dict:
        await db.tables.update_one({"id": table_id}, {"$set": update_dict})
    updated = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Table not found")
    return Table(**updated)


@router.delete("/tables/{table_id}")
async def delete_table(table_id: str, current_user: User = Depends(require_admin)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.get("status") == "occupied":
        raise HTTPException(status_code=400, detail="Cannot delete occupied table")
    await db.tables.delete_one({"id": table_id})
    return {"message": "Table deleted"}


@router.post("/tables/{table_id}/assign-order")
async def assign_order_to_table(table_id: str, order_id: str, current_user: User = Depends(get_current_user)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await db.tables.update_one({"id": table_id}, {"$set": {"current_order_id": order_id, "status": "occupied"}})
    await db.orders.update_one({"id": order_id}, {"$set": {"table_id": table_id}})
    return {"message": f"Order assigned to table {table['number']}"}


@router.post("/tables/{table_id}/clear")
async def clear_table(table_id: str, current_user: User = Depends(get_current_user)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    await db.tables.update_one({"id": table_id}, {"$set": {"current_order_id": None, "status": "available", "merged_with": None}})
    return {"message": f"Table {table['number']} cleared"}


@router.post("/tables/merge")
async def merge_tables(merge_data: TableMerge, current_user: User = Depends(require_admin)):
    if len(merge_data.table_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 tables to merge")

    tables = await db.tables.find({"id": {"$in": merge_data.table_ids}}, {"_id": 0}).to_list(100)
    if len(tables) != len(merge_data.table_ids):
        raise HTTPException(status_code=404, detail="One or more tables not found")

    primary_table = tables[0]
    other_table_ids = merge_data.table_ids[1:]

    await db.tables.update_one(
        {"id": primary_table["id"]},
        {"$set": {"merged_with": other_table_ids, "status": "occupied", "capacity": sum(t["capacity"] for t in tables)}}
    )
    await db.tables.update_many(
        {"id": {"$in": other_table_ids}},
        {"$set": {"status": "merged", "merged_with": [primary_table["id"]]}}
    )
    return {"message": f"Tables merged into Table {primary_table['number']}", "primary_table_id": primary_table["id"], "merged_table_ids": other_table_ids}


@router.post("/tables/{table_id}/unmerge")
async def unmerge_tables(table_id: str, current_user: User = Depends(require_admin)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if not table.get("merged_with"):
        raise HTTPException(status_code=400, detail="Table is not merged")

    merged_ids = table["merged_with"]
    original_table = await db.tables.find_one({"id": table_id, "merged_with": {"$exists": False}}, {"_id": 0})
    original_capacity = original_table["capacity"] if original_table else 4

    await db.tables.update_one({"id": table_id}, {"$set": {"merged_with": None, "status": "available", "capacity": original_capacity}})
    await db.tables.update_many({"id": {"$in": merged_ids}}, {"$set": {"merged_with": None, "status": "available"}})
    return {"message": "Tables unmerged successfully"}


@router.post("/tables/{table_id}/split-bill")
async def split_table_bill(table_id: str, split_data: TableSplitBill, current_user: User = Depends(get_current_user)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    order = await db.orders.find_one({"id": split_data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    split_orders = []
    for i, split in enumerate(split_data.splits):
        split_id = f"{split_data.order_id}_split_{i+1}"
        split_order = {
            "id": split_id,
            "original_order_id": split_data.order_id,
            "table_id": table_id,
            "items": split.get("items", []),
            "total_amount": sum(item.get("total", 0) for item in split.get("items", [])),
            "split_number": i + 1,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.split_orders.insert_one(split_order)
        split_orders.append(split_order)

    return {"message": f"Bill split into {len(split_data.splits)} parts", "split_orders": split_orders}
