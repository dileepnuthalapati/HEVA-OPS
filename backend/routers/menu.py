from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin, require_any_feature
from models import User, Category, CategoryCreate, Product, ProductCreate
from typing import List
from datetime import datetime, timezone

router = APIRouter(dependencies=[Depends(require_any_feature("pos", "qr_ordering"))])


@router.post("/categories", response_model=Category)
async def create_category(category_data: CategoryCreate, current_user: User = Depends(require_admin)):
    cat_id = f"cat_{datetime.now(timezone.utc).timestamp()}"
    cat_dict = {
        "id": cat_id,
        "name": category_data.name,
        "description": category_data.description,
        "restaurant_id": current_user.restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(cat_dict)
    return Category(**cat_dict)


@router.get("/categories", response_model=List[Category])
async def get_categories(current_user: User = Depends(get_current_user)):
    query = {}
    if current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id
    categories = await db.categories.find(query, {"_id": 0}).to_list(100)
    return [Category(**c) for c in categories]


@router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, category_data: CategoryCreate, current_user: User = Depends(require_admin)):
    await db.categories.update_one(
        {"id": category_id},
        {"$set": {"name": category_data.name, "description": category_data.description}}
    )
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Category not found")
    return Category(**updated)


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: User = Depends(require_admin)):
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}


@router.post("/products", response_model=Product)
async def create_product(product_data: ProductCreate, current_user: User = Depends(require_admin)):
    prod_id = f"prod_{datetime.now(timezone.utc).timestamp()}"
    category_name = ""
    if product_data.category_id:
        category = await db.categories.find_one({"id": product_data.category_id}, {"_id": 0})
        category_name = category.get("name", "") if category else ""

    prod_dict = {
        "id": prod_id,
        "name": product_data.name,
        "category_id": product_data.category_id,
        "category_name": category_name,
        "price": product_data.price,
        "in_stock": product_data.in_stock,
        "description": product_data.description,
        "restaurant_id": current_user.restaurant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(prod_dict)
    return Product(**prod_dict)


@router.get("/products", response_model=List[Product])
async def get_products(
    category_id: str = None,
    in_stock: bool = None,
    current_user: User = Depends(get_current_user)
):
    query = {}
    if current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id
    if category_id:
        query["category_id"] = category_id
    if in_stock is not None:
        query["in_stock"] = in_stock

    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    return [Product(**p) for p in products]


@router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product_data: ProductCreate, current_user: User = Depends(require_admin)):
    category_name = ""
    if product_data.category_id:
        category = await db.categories.find_one({"id": product_data.category_id}, {"_id": 0})
        category_name = category.get("name", "") if category else ""

    update_dict = {
        "name": product_data.name,
        "category_id": product_data.category_id,
        "category_name": category_name,
        "price": product_data.price,
        "in_stock": product_data.in_stock,
        "description": product_data.description,
    }
    await db.products.update_one({"id": product_id}, {"$set": update_dict})
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**updated)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: User = Depends(require_admin)):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}
