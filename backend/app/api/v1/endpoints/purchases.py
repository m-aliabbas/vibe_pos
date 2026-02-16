from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.api import deps
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.product import Product, ProductVariation
from app.models.accounting import JournalEntry
from app.models.vendor import Vendor
from app.schemas import purchase as purchase_schema
from app.services import accounting as accounting_service

router = APIRouter()

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
        
        # Create Purchase Item
        # Default expiry 6 months if not set
        expiry = item.expiry_date or (datetime.utcnow() + timedelta(days=180))
        
        db_item = PurchaseItem(
            product_id=item.product_id,
            variation_id=item.variation_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            total_cost=item_total,
            expiry_date=expiry
        )
        db_items.append(db_item)
        
        # 3. Update Stock & Cost
        if item.variation_id:
            # Update variation stock
            variation.quantity += item.quantity
            db.add(variation)
        else:
            # Update product stock (for products without variations)
            product.quantity += item.quantity
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
    status = PurchaseStatus.UNPAID
    if purchase_in.amount_paid >= total_amount:
        status = PurchaseStatus.PAID
    elif purchase_in.amount_paid > 0:
        status = PurchaseStatus.PARTIAL

    # 4. Create Purchase Record
    purchase = Purchase(
        vendor_id=purchase_in.vendor_id,
        total_amount=total_amount,
        amount_paid=purchase_in.amount_paid,
        status=status,
        items=db_items
    )
    
    db.add(purchase)
    db.flush()
    accounting_service.post_purchase_entry(
        db=db,
        purchase=purchase,
        amount_paid=purchase_in.amount_paid,
        created_by=current_user.id,
    )
    db.commit()
    db.refresh(purchase)
    return purchase


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
            variation = db.query(ProductVariation).filter(ProductVariation.id == existing_item.variation_id).first()
            if variation:
                variation.quantity -= existing_item.quantity
                db.add(variation)
        else:
            product.quantity -= existing_item.quantity
            db.add(product)

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

        expiry = item.expiry_date or (datetime.utcnow() + timedelta(days=180))

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
            variation.quantity += item.quantity
            db.add(variation)
        else:
            product.quantity += item.quantity
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

    db.commit()
    db.refresh(purchase)
    return purchase

@router.get("/vendor/{vendor_id}", response_model=List[purchase_schema.Purchase])
def read_vendor_purchases(
    *,
    db: Session = Depends(deps.get_db),
    vendor_id: int,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    purchases = db.query(Purchase)\
        .filter(Purchase.vendor_id == vendor_id)\
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
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
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
