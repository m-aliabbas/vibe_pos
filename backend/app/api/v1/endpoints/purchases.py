from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timedelta
from app.core.timezone import now_pkt
from app.api import deps
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.product import Product, ProductVariation
from app.models.accounting import JournalEntry
from app.models.vendor import Vendor
from app.models.stock_batch import StockBatch, BatchStatus
from app.schemas import purchase as purchase_schema
from app.services import accounting as accounting_service
from app.platform.pos.inventory import InventoryService


def _generate_batch_number(db: Session, product_id: int) -> str:
    from app.core.timezone import now_pkt
    from sqlalchemy import func
    today = now_pkt().strftime("%Y%m%d")
    count = db.query(func.count(StockBatch.id)).filter(
        StockBatch.product_id == product_id
    ).scalar() or 0
    return f"BATCH-{today}-P{product_id}-{count + 1:03d}"

router = APIRouter()


def _inventory(db: Session) -> InventoryService:
    return InventoryService(db)

@router.post("/", response_model=purchase_schema.Purchase)
def create_purchase(
    *,
    db: Session = Depends(deps.get_db),
    purchase_in: purchase_schema.PurchaseCreate,
    current_user = Depends(deps.get_current_user), # Use generic user dep, check details?
) -> Any:
    # 1. Validate Vendor
    vendor = db.query(Vendor).filter(Vendor.id == purchase_in.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    # 2. Calculate Totals & Status
    total_amount = 0.0
    db_items = []
    price_changed_items = []

    for item in purchase_in.items:
        # Validate Product
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

        # Validate Variation if specified
        if item.variation_id:
            if not product.has_variations:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product {product.name} does not support variations"
                )

            variation = db.query(ProductVariation).filter(
                ProductVariation.id == item.variation_id,
                ProductVariation.product_id == item.product_id
            ).first()

            if not variation:
                raise HTTPException(
                    status_code=404,
                    detail=f"Variation {item.variation_id} not found for product {product.name}"
                )

        item_total = item.quantity * item.unit_cost
        total_amount += item_total

        # Default expiry 6 months if not set
        expiry = item.expiry_date or (now_pkt() + timedelta(days=180))

        db_item = PurchaseItem(
            product_id=item.product_id,
            variation_id=item.variation_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            total_cost=item_total,
            expiry_date=expiry
        )
        db_items.append(db_item)

        # Detect cost price change for non-variation products
        old_cost = product.cost_price or 0.0
        if not item.variation_id and abs(item.unit_cost - old_cost) > 0.001:
            suggested_selling = round(item.unit_cost * (product.selling_price / old_cost), 2) if old_cost > 0 else product.selling_price
            price_changed_items.append({
                "product_id": product.id,
                "product_name": product.name,
                "old_cost": old_cost,
                "new_cost": item.unit_cost,
                "current_selling_price": product.selling_price,
                "suggested_selling_price": suggested_selling,
            })

        # 3. Update Stock & Cost
        if item.variation_id:
            _inventory(db).receive(product, item.quantity, variation_id=item.variation_id)
        else:
            _inventory(db).receive(product, item.quantity)
            product.cost_price = item.unit_cost
            if item.update_selling_price and item.selling_price is not None:
                if item.selling_price < 0:
                    raise HTTPException(
                        status_code=400,
                        detail="Selling price must be greater than or equal to 0",
                    )
                product.selling_price = item.selling_price
            db.add(product)

    # Determine Status
    cash_paid = max(0.0, float(purchase_in.amount_paid or 0.0))
    prepaid_available = max(0.0, float(vendor.prepaid_credit or 0.0))
    amount_remaining = max(0.0, total_amount - cash_paid)
    prepaid_used = min(prepaid_available, amount_remaining)
    remaining_after_prepaid = max(0.0, total_amount - prepaid_used)
    cash_applied = min(cash_paid, remaining_after_prepaid)
    cash_overpaid = max(0.0, cash_paid - cash_applied)
    total_paid = min(total_amount, cash_applied + prepaid_used)

    status = PurchaseStatus.UNPAID
    if total_paid >= total_amount:
        status = PurchaseStatus.PAID
    elif total_paid > 0:
        status = PurchaseStatus.PARTIAL

    # 4. Create Purchase Record
    purchase = Purchase(
        vendor_id=purchase_in.vendor_id,
        total_amount=total_amount,
        amount_paid=total_paid,
        status=status,
        items=db_items
    )

    if prepaid_used > 0:
        vendor.prepaid_credit = prepaid_available - prepaid_used + cash_overpaid
        db.add(vendor)
    elif cash_overpaid > 0:
        vendor.prepaid_credit = prepaid_available + cash_overpaid
        db.add(vendor)
    
    db.add(purchase)
    db.flush()
    try:
        accounting_service.post_purchase_entry(
            db=db,
            purchase=purchase,
            amount_paid=cash_paid,
            prepaid_used=prepaid_used,
            created_by=current_user.id,
        )
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create purchase: {error}") from error

    # Create a StockBatch for each purchase item
    for db_item in purchase.items:
        product = db.query(Product).filter(Product.id == db_item.product_id).first()
        if product is None or not _inventory(db).policy.tracks_inventory(product):
            continue
        batch_num = _generate_batch_number(db, db_item.product_id)
        selling_price = product.selling_price if product else 0.0
        batch = StockBatch(
            product_id=db_item.product_id,
            variation_id=db_item.variation_id,
            purchase_item_id=db_item.id,
            batch_number=batch_num,
            quantity_received=db_item.quantity,
            quantity_remaining=db_item.quantity,
            unit_cost=db_item.unit_cost,
            selling_price=selling_price,
            purchase_date=purchase.created_at,
            expiry_date=db_item.expiry_date,
            status=BatchStatus.ACTIVE,
        )
        db.add(batch)
        db.flush()
        db_item.batch_id = batch.id
        db.add(db_item)

    try:
        db.commit()
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create purchase: {error}") from error
    db.refresh(purchase)

    result = purchase_schema.Purchase.model_validate(purchase)
    result.price_changed_items = price_changed_items
    return result


@router.put("/{purchase_id}", response_model=purchase_schema.Purchase)
def update_purchase(
    *,
    db: Session = Depends(deps.get_db),
    purchase_id: int,
    purchase_in: purchase_schema.PurchaseUpdate,
    current_user = Depends(deps.get_current_user),
) -> Any:
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    vendor = db.query(Vendor).filter(Vendor.id == purchase_in.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Reverse previous stock impact
    existing_items = list(purchase.items)
    for existing_item in existing_items:
        product = db.query(Product).filter(Product.id == existing_item.product_id).first()
        if not product:
            continue

        if existing_item.variation_id:
            _inventory(db).adjust_variation(product, existing_item.variation_id, -existing_item.quantity)
        else:
            _inventory(db).adjust_product(product, -existing_item.quantity)

    # Retire old batches linked to this purchase's items
    for existing_item in existing_items:
        if existing_item.batch_id:
            old_batch = db.query(StockBatch).filter(StockBatch.id == existing_item.batch_id).first()
            if old_batch and old_batch.status == BatchStatus.ACTIVE:
                if old_batch.quantity_remaining == old_batch.quantity_received:
                    db.delete(old_batch)
                else:
                    old_batch.status = BatchStatus.MERGED
                    old_batch.notes = "Purchase updated — batch replaced"
                    db.add(old_batch)

    for existing_item in existing_items:
        db.delete(existing_item)

    # Rebuild purchase items and stock impact
    total_amount = 0.0
    db_items = []

    for item in purchase_in.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

        if item.variation_id:
            if not product.has_variations:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product {product.name} does not support variations"
                )

            variation = db.query(ProductVariation).filter(
                ProductVariation.id == item.variation_id,
                ProductVariation.product_id == item.product_id
            ).first()

            if not variation:
                raise HTTPException(
                    status_code=404,
                    detail=f"Variation {item.variation_id} not found for product {product.name}"
                )

        item_total = item.quantity * item.unit_cost
        total_amount += item_total

        expiry = item.expiry_date or (now_pkt() + timedelta(days=180))

        db_item = PurchaseItem(
            product_id=item.product_id,
            variation_id=item.variation_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            total_cost=item_total,
            expiry_date=expiry
        )
        db_items.append(db_item)

        if item.variation_id:
            _inventory(db).receive(product, item.quantity, variation_id=item.variation_id)
        else:
            _inventory(db).receive(product, item.quantity)
            product.cost_price = item.unit_cost
            if item.update_selling_price and item.selling_price is not None:
                if item.selling_price < 0:
                    raise HTTPException(
                        status_code=400,
                        detail="Selling price must be greater than or equal to 0",
                    )
                product.selling_price = item.selling_price
            db.add(product)

    status = PurchaseStatus.UNPAID
    if purchase_in.amount_paid >= total_amount:
        status = PurchaseStatus.PAID
    elif purchase_in.amount_paid > 0:
        status = PurchaseStatus.PARTIAL

    purchase.vendor_id = purchase_in.vendor_id
    purchase.total_amount = total_amount
    purchase.amount_paid = purchase_in.amount_paid
    purchase.status = status
    purchase.items = db_items
    db.add(purchase)

    # Replace old accounting entries for this purchase with fresh ones
    old_entries = db.query(JournalEntry).filter(
        JournalEntry.source_id == purchase.id,
        JournalEntry.source_type.in_(["purchase", "purchase_payment"]),
    ).all()
    for entry in old_entries:
        db.delete(entry)

    accounting_service.post_purchase_entry(
        db=db,
        purchase=purchase,
        amount_paid=purchase_in.amount_paid,
        created_by=current_user.id,
    )

    db.flush()
    # Create new batches for updated purchase items
    for db_item in purchase.items:
        product = db.query(Product).filter(Product.id == db_item.product_id).first()
        if product is None or not _inventory(db).policy.tracks_inventory(product):
            continue
        batch_num = _generate_batch_number(db, db_item.product_id)
        selling_price = product.selling_price if product else 0.0
        batch = StockBatch(
            product_id=db_item.product_id,
            variation_id=db_item.variation_id,
            purchase_item_id=db_item.id,
            batch_number=batch_num,
            quantity_received=db_item.quantity,
            quantity_remaining=db_item.quantity,
            unit_cost=db_item.unit_cost,
            selling_price=selling_price,
            purchase_date=purchase.created_at,
            expiry_date=db_item.expiry_date,
            status=BatchStatus.ACTIVE,
        )
        db.add(batch)
        db.flush()
        db_item.batch_id = batch.id
        db.add(db_item)

    db.commit()
    db.refresh(purchase)

    result = purchase_schema.Purchase.model_validate(purchase)
    result.price_changed_items = []
    return result

@router.get("/vendor/{vendor_id}", response_model=List[purchase_schema.Purchase])
def read_vendor_purchases(
    *,
    db: Session = Depends(deps.get_db),
    vendor_id: int,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    purchases = db.query(Purchase)\
        .options(joinedload(Purchase.items).joinedload(PurchaseItem.product))\
        .filter(Purchase.vendor_id == vendor_id)\
        .filter(Purchase.items.any())\
        .order_by(Purchase.created_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    return purchases

@router.get("/{purchase_id}", response_model=purchase_schema.Purchase)
def read_purchase(
    *,
    db: Session = Depends(deps.get_db),
    purchase_id: int,
) -> Any:
    purchase = db.query(Purchase).options(
        joinedload(Purchase.items).joinedload(PurchaseItem.product)
    ).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase

@router.put("/{purchase_id}/payment", response_model=purchase_schema.Purchase)
def update_purchase_payment(
    *,
    db: Session = Depends(deps.get_db),
    purchase_id: int,
    payment_in: purchase_schema.PurchasePaymentUpdate,
    current_user = Depends(deps.get_current_user),
) -> Any:
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    # Update amount paid
    previous_paid = purchase.amount_paid or 0.0
    purchase.amount_paid = payment_in.amount_paid
    
    # Update status based on payment
    if purchase.amount_paid >= purchase.total_amount:
        purchase.status = PurchaseStatus.PAID
    elif purchase.amount_paid > 0:
        purchase.status = PurchaseStatus.PARTIAL
    else:
        purchase.status = PurchaseStatus.UNPAID
    
    db.add(purchase)
    delta_paid = purchase.amount_paid - previous_paid
    accounting_service.post_purchase_payment_delta(
        db=db,
        purchase=purchase,
        delta_amount=delta_paid,
        created_by=current_user.id,
    )
    db.commit()
    db.refresh(purchase)
    return purchase
