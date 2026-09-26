from typing import Any, List, Optional
import csv
import io
import json
import random
import re
import string
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.api import deps
from app.models.product import Product, ProductVariation
from app.models.sale import SaleItem
from app.models.purchase import PurchaseItem
from app.models.stock_adjustment import ProductStockAdjustment
from app.core import security
from app.schemas import product as product_schema
from app.applications.retail.inventory import InventoryService

router = APIRouter()

def serialize_json_fields(data: dict):
    """Convert list fields to JSON strings for database storage"""
    if 'selling_units' in data and isinstance(data['selling_units'], list):
        data['selling_units'] = json.dumps(data['selling_units'])
    if 'variation_attributes' in data and isinstance(data['variation_attributes'], list):
        data['variation_attributes'] = json.dumps(data['variation_attributes'])
    return data


def _sku_prefix_from_name(product_name: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", product_name or "")
    source_word = random.choice(words) if words else "PRD"
    prefix = source_word.upper()[:3]
    if len(prefix) < 3:
        prefix = (prefix + "PRD")[:3]
    return prefix


def generate_unique_product_sku(db: Session, product_name: str) -> str:
    prefix = _sku_prefix_from_name(product_name)

    for _ in range(200):
        candidate = f"{prefix}{random.randint(1000, 9999)}"
        exists = db.query(Product.id).filter(Product.sku == candidate).first()
        if not exists:
            return candidate


def ensure_product_has_sku(db: Session, product: Product) -> bool:
    if product.sku and str(product.sku).strip():
        return False
    product.sku = generate_unique_product_sku(db, product.name)
    db.add(product)
    return True


def generate_unique_variation_barcode(db: Session, base_barcode: str) -> str:
    base = (base_barcode or "VAR").strip()
    for _ in range(300):
        candidate = f"{base}{random.randint(10, 99)}"
        exists = db.query(ProductVariation.id).filter(ProductVariation.barcode == candidate).first()
        if not exists:
            return candidate
    raise HTTPException(
        status_code=400,
        detail="Unable to auto-generate unique variation barcode. Please set barcode manually.",
    )

    while True:
        candidate = f"{prefix}{''.join(random.choices(string.ascii_uppercase + string.digits, k=6))}"
        exists = db.query(Product.id).filter(Product.sku == candidate).first()
        if not exists:
            return candidate


@router.get("/", response_model=List[product_schema.Product])
def read_products(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    category: Optional[str] = None,
) -> Any:
    query = db.query(Product)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    if category and category != "All":
        query = query.filter(Product.category == category)

    products = query.offset(skip).limit(limit).all()
    changed = False
    for product in products:
        changed = ensure_product_has_sku(db, product) or changed
    if changed:
        db.commit()

    return products

@router.get("/count")
def count_products(
    db: Session = Depends(deps.get_db),
    search: Optional[str] = None,
    category: Optional[str] = None,
) -> Any:
    query = db.query(Product)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    if category and category != "All":
        query = query.filter(Product.category == category)

    return {"total": query.count()}

@router.get("/barcode/{barcode}")
def get_product_by_barcode(
    *,
    db: Session = Depends(deps.get_db),
    barcode: str,
) -> Any:
    """
    Search for a product or variation by barcode.
    Returns product info and variation if barcode matches a variation.
    """
    barcode = barcode.strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="Barcode cannot be empty")
    
    # First, check if it's a product SKU (exact match)
    product = db.query(Product).filter(Product.sku == barcode).first()
    if product:
        return {
            "product": product,
            "variation": None,
            "match_type": "product_sku"
        }
    
    # Second, check if it's a variation barcode
    variation = db.query(ProductVariation).filter(ProductVariation.barcode == barcode).first()
    if variation:
        product = db.query(Product).filter(Product.id == variation.product_id).first()
        return {
            "product": product,
            "variation": variation,
            "match_type": "variation_barcode"
        }
    
    # Not found
    raise HTTPException(status_code=404, detail="No product or variation found with this barcode")

@router.get("/export-csv")
def export_products_csv(
    db: Session = Depends(deps.get_db),
) -> Any:
    """Export all products as CSV."""
    products = db.query(Product).order_by(Product.id.asc()).all()

    output = io.StringIO()
    fieldnames = [
        "name",
        "sku",
        "category",
        "description",
        "selling_price",
        "cost_price",
        "quantity",
        "base_unit",
        "has_variations",
        "allow_decimal_qty",
        "variation_attributes",
        "selling_units_json",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for product in products:
        writer.writerow(
            {
                "name": product.name or "",
                "sku": product.sku or "",
                "category": product.category or "",
                "description": product.description or "",
                "selling_price": float(product.selling_price or 0),
                "cost_price": float(product.cost_price or 0),
                "quantity": float(product.quantity or 0),
                "base_unit": product.base_unit or "piece",
                "has_variations": bool(product.has_variations),
                "allow_decimal_qty": bool(getattr(product, "allow_decimal_qty", False)),
                "variation_attributes": json.dumps(product.variation_attributes or []),
                "selling_units_json": json.dumps(product.selling_units or []),
            }
        )

    output.seek(0)
    return StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=products.csv"},
    )

@router.post("/", response_model=product_schema.Product)
def create_product(
    *,
    db: Session = Depends(deps.get_db),
    product_in: product_schema.ProductCreate,
) -> Any:
    sku = product_in.sku.strip() if isinstance(product_in.sku, str) else product_in.sku

    if sku:
        product = db.query(Product).filter(Product.sku == sku).first()
        if product:
            raise HTTPException(status_code=400, detail="Product with this SKU already exists")
    else:
        sku = generate_unique_product_sku(db, product_in.name)
    
    # Convert list fields to JSON strings
    product_data = serialize_json_fields(product_in.dict())
    product_data["sku"] = sku
    product = Product(**product_data)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@router.get("/{id}", response_model=product_schema.Product)
def get_product(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if ensure_product_has_sku(db, product):
        db.commit()
        db.refresh(product)

    return product

@router.put("/{id}", response_model=product_schema.Product)
def update_product(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    product_in: product_schema.ProductUpdate,
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    incoming = product_in.dict(exclude_unset=True)

    if "sku" in incoming:
        sku_value = incoming.get("sku")
        sku = sku_value.strip() if isinstance(sku_value, str) else sku_value
        incoming["sku"] = sku or None
        if sku:
            existing = db.query(Product).filter(Product.sku == sku, Product.id != id).first()
            if existing:
                raise HTTPException(status_code=400, detail="Product with this SKU already exists")

    if incoming.get("has_variations") is False:
        existing_variation = db.query(ProductVariation.id).filter(ProductVariation.product_id == id).first()
        if existing_variation:
            raise HTTPException(
                status_code=400,
                detail="Cannot disable variations while variation records exist. Remove variations first.",
            )
    
    # Convert list fields to JSON strings
    update_data = serialize_json_fields(incoming)
    for field, value in update_data.items():
        setattr(product, field, value)
        
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.post("/{id}/adjust-stock", response_model=product_schema.Product)
def adjust_product_stock(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    stock_in: product_schema.ProductStockAdjust,
    current_user = Depends(deps.get_current_active_admin),
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not product.allow_decimal_qty and not float(stock_in.quantity_delta).is_integer():
        raise HTTPException(
            status_code=400,
            detail="This product only allows whole-number quantities",
        )

    quantity_before, quantity_after = InventoryService(db).adjust_product(
        product,
        float(stock_in.quantity_delta),
    )

    log_entry = ProductStockAdjustment(
        product_id=product.id,
        adjusted_by_user_id=current_user.id,
        quantity_before=quantity_before,
        quantity_delta=float(stock_in.quantity_delta),
        quantity_after=quantity_after,
        reason=stock_in.reason.strip(),
    )

    db.add(product)
    db.add(log_entry)
    db.commit()
    db.refresh(product)
    return product


@router.get("/{id}/stock-adjustments", response_model=List[product_schema.ProductStockAdjustmentLog])
def read_product_stock_adjustments(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    limit: int = Query(50, ge=1, le=500),
    current_user = Depends(deps.get_current_active_admin),
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    logs = (
        db.query(ProductStockAdjustment)
        .filter(ProductStockAdjustment.product_id == id)
        .order_by(ProductStockAdjustment.id.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": log.id,
            "product_id": log.product_id,
            "quantity_before": log.quantity_before,
            "quantity_delta": log.quantity_delta,
            "quantity_after": log.quantity_after,
            "reason": log.reason,
            "adjusted_by_user_id": log.adjusted_by_user_id,
            "adjusted_by_username": log.adjusted_by_user.username if log.adjusted_by_user else None,
            "created_at": log.created_at,
        }
        for log in logs
    ]

@router.delete("/{id}")
def delete_product(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    delete_in: product_schema.ProductDeleteConfirm,
    current_user = Depends(deps.get_current_active_admin),
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not security.verify_password(delete_in.admin_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid admin password")

    used_in_sales = db.query(SaleItem.id).filter(SaleItem.product_id == id).first()
    used_in_purchases = db.query(PurchaseItem.id).filter(PurchaseItem.product_id == id).first()

    if (used_in_sales or used_in_purchases) and not delete_in.force_delete_used:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete product because it is used in sales/purchases. Provide admin override to force delete.",
        )

    try:
        db.delete(product)
        db.commit()
        return {"message": "Product deleted successfully"}
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Cannot delete product due to linked records in database.",
        )


@router.post("/bulk-import")
async def bulk_import_products(
    *,
    db: Session = Depends(deps.get_db),
    file: UploadFile = File(...),
) -> Any:
    """Bulk import products from CSV."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to read CSV file")

    reader = csv.DictReader(io.StringIO(text))
    created = 0
    skipped = 0
    reassigned_sku = 0
    errors: List[str] = []

    for row_index, row in enumerate(reader, start=2):
        try:
            name = (row.get("name") or "").strip()
            if not name:
                skipped += 1
                errors.append(f"Row {row_index}: name is required")
                continue

            sku = (row.get("sku") or "").strip() or None
            if sku:
                existing = db.query(Product).filter(Product.sku == sku).first()
                if existing:
                    sku = generate_unique_product_sku(db, name)
                    reassigned_sku += 1
            else:
                sku = generate_unique_product_sku(db, name)

            category = (row.get("category") or "").strip() or "Uncategorized"
            description = (row.get("description") or "").strip() or None
            base_unit = (row.get("base_unit") or "").strip() or "piece"

            selling_price_value = row.get("selling_price")
            selling_price = float(selling_price_value) if selling_price_value not in (None, "") else 0.0

            cost_price_value = row.get("cost_price")
            cost_price = float(cost_price_value) if cost_price_value not in (None, "") else 0.0

            quantity_value = row.get("quantity")
            quantity = float(quantity_value) if quantity_value not in (None, "") else 0.0

            has_variations_raw = (row.get("has_variations") or "").strip().lower()
            has_variations = has_variations_raw in ("true", "1", "yes", "y")
            allow_decimal_qty_raw = (row.get("allow_decimal_qty") or "").strip().lower()
            allow_decimal_qty = allow_decimal_qty_raw in ("true", "1", "yes", "y")

            variation_attributes_raw = row.get("variation_attributes")
            variation_attributes = json.loads(variation_attributes_raw) if variation_attributes_raw else []

            selling_units_raw = row.get("selling_units_json") or row.get("selling_units")
            selling_units = json.loads(selling_units_raw) if selling_units_raw else []

            product_data = serialize_json_fields({
                "name": name,
                "sku": sku,
                "category": category,
                "description": description,
                "selling_price": selling_price,
                "cost_price": cost_price,
                "quantity": quantity,
                "base_unit": base_unit,
                "has_variations": has_variations,
                "allow_decimal_qty": allow_decimal_qty,
                "variation_attributes": variation_attributes,
                "selling_units": selling_units,
            })

            product = Product(**product_data)
            db.add(product)
            db.commit()
            created += 1
        except Exception as e:
            db.rollback()
            skipped += 1
            errors.append(f"Row {row_index}: {str(e)}")

    return {
        "created": created,
        "skipped": skipped,
        "reassigned_sku": reassigned_sku,
        "errors": errors,
    }


# ========== Product Variation Endpoints ==========

@router.get("/{product_id}/variations", response_model=List[product_schema.ProductVariation])
def get_product_variations(
    *,
    db: Session = Depends(deps.get_db),
    product_id: int,
) -> Any:
    """Get all variations for a product"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    variations = db.query(ProductVariation).filter(ProductVariation.product_id == product_id).all()
    return variations

@router.post("/{product_id}/variations", response_model=product_schema.ProductVariation)
def create_product_variation(
    *,
    db: Session = Depends(deps.get_db),
    product_id: int,
    variation_in: product_schema.ProductVariationCreate,
) -> Any:
    """Create a new variation for a product"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if not product.has_variations:
        raise HTTPException(status_code=400, detail="Product does not support variations")

    variation_data = variation_in.dict()
    sku_value = variation_data.get("sku")
    barcode_value = variation_data.get("barcode")

    if isinstance(sku_value, str):
        sku_value = sku_value.strip() or None
    if isinstance(barcode_value, str):
        barcode_value = barcode_value.strip() or None

    if ensure_product_has_sku(db, product):
        db.flush()

    if not barcode_value:
        barcode_value = generate_unique_variation_barcode(db, product.sku or "VAR")

    variation_data["sku"] = sku_value
    variation_data["barcode"] = barcode_value
    
    # Check if SKU already exists
    if sku_value:
        existing = db.query(ProductVariation).filter(ProductVariation.sku == sku_value).first()
        if existing:
            raise HTTPException(status_code=400, detail="Variation with this SKU already exists")
    
    # Check if barcode already exists
    if barcode_value:
        existing = db.query(ProductVariation).filter(ProductVariation.barcode == barcode_value).first()
        if existing:
            raise HTTPException(status_code=400, detail="Variation with this barcode already exists")
    
    # Check if variation with same attributes already exists
    existing_variations = db.query(ProductVariation).filter(ProductVariation.product_id == product_id).all()
    for existing in existing_variations:
        if existing.attributes == variation_in.attributes:
            raise HTTPException(status_code=400, detail="Variation with these attributes already exists")
    
    # Convert dict fields to JSON strings if needed
    if isinstance(variation_data.get('attributes'), dict):
        variation_data['attributes'] = json.dumps(variation_data['attributes'])
    
    variation = ProductVariation(
        product_id=product_id,
        **variation_data
    )
    db.add(variation)
    db.commit()
    db.refresh(variation)
    return variation

@router.put("/variations/{variation_id}", response_model=product_schema.ProductVariation)
def update_product_variation(
    *,
    db: Session = Depends(deps.get_db),
    variation_id: int,
    variation_in: product_schema.ProductVariationUpdate,
) -> Any:
    """Update a product variation"""
    variation = db.query(ProductVariation).filter(ProductVariation.id == variation_id).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")

    update_data = variation_in.dict(exclude_unset=True)

    if "sku" in update_data and isinstance(update_data["sku"], str):
        update_data["sku"] = update_data["sku"].strip() or None
    if "barcode" in update_data and isinstance(update_data["barcode"], str):
        update_data["barcode"] = update_data["barcode"].strip() or None

    product = db.query(Product).filter(Product.id == variation.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found for variation")

    if ensure_product_has_sku(db, product):
        db.flush()

    if ("barcode" in update_data and not update_data.get("barcode")) or ("barcode" not in update_data and not variation.barcode):
        update_data["barcode"] = generate_unique_variation_barcode(db, product.sku or "VAR")

    new_sku = update_data.get("sku", variation.sku)
    new_barcode = update_data.get("barcode", variation.barcode)
    
    # Check if updated SKU already exists
    if new_sku and new_sku != variation.sku:
        existing = db.query(ProductVariation).filter(
            ProductVariation.sku == new_sku,
            ProductVariation.id != variation_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Variation with this SKU already exists")
    
    # Check if updated barcode already exists
    if new_barcode and new_barcode != variation.barcode:
        existing = db.query(ProductVariation).filter(
            ProductVariation.barcode == new_barcode,
            ProductVariation.id != variation_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Variation with this barcode already exists")
    
    for field, value in update_data.items():
        # Convert dict to JSON string if it's attributes
        if field == 'attributes' and isinstance(value, dict):
            value = json.dumps(value)
        setattr(variation, field, value)
    
    db.add(variation)
    db.commit()
    db.refresh(variation)
    return variation

@router.delete("/variations/{variation_id}")
def delete_product_variation(
    *,
    db: Session = Depends(deps.get_db),
    variation_id: int,
    current_user = Depends(deps.get_current_active_admin),
) -> Any:
    """Delete a product variation"""
    variation = db.query(ProductVariation).filter(ProductVariation.id == variation_id).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")
    
    db.delete(variation)
    db.commit()
    return {"message": "Variation deleted successfully"}
