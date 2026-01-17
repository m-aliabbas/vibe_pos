from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.vendor import Vendor
from app.models.purchase import Purchase, PurchaseStatus
from app.schemas import vendor as vendor_schema

router = APIRouter()

@router.get("/", response_model=List[vendor_schema.Vendor])
def read_vendors(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    return db.query(Vendor).offset(skip).limit(limit).all()

@router.post("/", response_model=vendor_schema.Vendor)
def create_vendor(
    *,
    db: Session = Depends(deps.get_db),
    vendor_in: vendor_schema.VendorCreate,
) -> Any:
    vendor = db.query(Vendor).filter(Vendor.name == vendor_in.name).first()
    if vendor:
        raise HTTPException(status_code=400, detail="Vendor already exists")
    
    vendor = Vendor(**vendor_in.dict())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor

@router.put("/{id}", response_model=vendor_schema.Vendor)
def update_vendor(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    vendor_in: vendor_schema.VendorUpdate,
) -> Any:
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    for field, value in vendor_in.dict(exclude_unset=True).items():
        setattr(vendor, field, value)
    
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor

@router.post("/{id}/payment")
def make_vendor_payment(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    payment_in: vendor_schema.VendorPayment,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """Make a lump sum payment to vendor, automatically distributed across unpaid purchases."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    if payment_in.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    # Start with new payment + any existing prepaid credit
    total_available = payment_in.amount + (vendor.prepaid_credit or 0)
    credit_used = vendor.prepaid_credit or 0
    
    # Get all purchases with outstanding balance, ordered by creation date (oldest first)
    purchases = db.query(Purchase)\
        .filter(Purchase.vendor_id == id)\
        .filter(Purchase.status.in_([PurchaseStatus.UNPAID, PurchaseStatus.PARTIAL]))\
        .order_by(Purchase.created_at.asc())\
        .all()
    
    remaining_payment = total_available
    updated_purchases = []
    
    # If no outstanding purchases, store entire amount as credit
    if not purchases:
        vendor.prepaid_credit = total_available
        db.add(vendor)
        db.commit()
        return {
            "message": "No outstanding purchases. Amount stored as prepaid credit.",
            "total_payment": payment_in.amount,
            "previous_credit": credit_used,
            "applied_amount": 0,
            "new_prepaid_credit": vendor.prepaid_credit,
            "updated_purchases": []
        }
    
    # Distribute payment across purchases (FIFO - First In First Out)
    for purchase in purchases:
        if remaining_payment <= 0:
            break
        
        balance = purchase.total_amount - purchase.amount_paid
        
        if balance <= 0:
            continue
        
        # Apply payment to this purchase
        payment_to_apply = min(remaining_payment, balance)
        purchase.amount_paid += payment_to_apply
        remaining_payment -= payment_to_apply
        
        # Update status
        if purchase.amount_paid >= purchase.total_amount:
            purchase.status = PurchaseStatus.PAID
        elif purchase.amount_paid > 0:
            purchase.status = PurchaseStatus.PARTIAL
        
        db.add(purchase)
        updated_purchases.append({
            "purchase_id": purchase.id,
            "payment_applied": payment_to_apply,
            "new_balance": purchase.total_amount - purchase.amount_paid
        })
    
    # Store any remaining amount as prepaid credit
    vendor.prepaid_credit = remaining_payment
    db.add(vendor)
    db.commit()
    
    return {
        "message": "Payment applied successfully",
        "total_payment": payment_in.amount,
        "previous_credit": credit_used,
        "applied_amount": total_available - remaining_payment,
        "new_prepaid_credit": vendor.prepaid_credit,
        "updated_purchases": updated_purchases
    }
