from typing import Any, List
import csv
import io
import requests
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import func
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

    if vendor_in.opening_balance is not None and vendor_in.opening_balance < 0:
        raise HTTPException(status_code=400, detail="Opening balance must be greater than or equal to 0")
    
    vendor = Vendor(**vendor_in.dict())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)

    if vendor.opening_balance and vendor.opening_balance > 0:
        legacy_purchase = Purchase(
            vendor_id=vendor.id,
            total_amount=vendor.opening_balance,
            amount_paid=0.0,
            status=PurchaseStatus.UNPAID,
        )
        db.add(legacy_purchase)
        db.commit()
    return vendor


@router.post("/bulk-import")
async def bulk_import_vendors(
    *,
    db: Session = Depends(deps.get_db),
    file: UploadFile = File(...),
) -> Any:
    """Bulk import vendors from CSV."""
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
    errors: List[str] = []

    for row_index, row in enumerate(reader, start=2):
        try:
            name = (row.get("name") or "").strip()
            if not name:
                skipped += 1
                errors.append(f"Row {row_index}: name is required")
                continue

            opening_balance_value = row.get("opening_balance")
            opening_balance = float(opening_balance_value) if opening_balance_value not in (None, "") else 0.0
            if opening_balance < 0:
                skipped += 1
                errors.append(f"Row {row_index}: opening_balance must be >= 0")
                continue

            existing = db.query(Vendor).filter(Vendor.name == name).first()
            if existing:
                skipped += 1
                continue

            vendor = Vendor(
                name=name,
                contact_name=(row.get("contact_name") or "").strip() or None,
                email=(row.get("email") or "").strip() or None,
                phone=(row.get("phone") or "").strip() or None,
                address=(row.get("address") or "").strip() or None,
                opening_balance=opening_balance,
            )

            db.add(vendor)
            db.commit()
            db.refresh(vendor)

            if vendor.opening_balance and vendor.opening_balance > 0:
                legacy_purchase = Purchase(
                    vendor_id=vendor.id,
                    total_amount=vendor.opening_balance,
                    amount_paid=0.0,
                    status=PurchaseStatus.UNPAID,
                )
                db.add(legacy_purchase)
                db.commit()

            created += 1
        except Exception as e:
            db.rollback()
            skipped += 1
            errors.append(f"Row {row_index}: {str(e)}")

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }

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
    background_tasks: BackgroundTasks,
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

    # Calculate remaining balance
    remaining_balance = db.query(Purchase).filter(
        Purchase.vendor_id == id,
        Purchase.status.in_([PurchaseStatus.UNPAID, PurchaseStatus.PARTIAL])
    ).with_entities(func.sum(Purchase.total_amount - Purchase.amount_paid)).scalar() or 0
    
    # Send WhatsApp notification if vendor has phone
    if vendor.phone:
        background_tasks.add_task(send_vendor_payment_notification, vendor.phone, payment_in.amount, remaining_balance, vendor.name)
    
    return {
        "message": "Payment applied successfully",
        "total_payment": payment_in.amount,
        "previous_credit": credit_used,
        "applied_amount": total_available - remaining_payment,
        "new_prepaid_credit": vendor.prepaid_credit,
        "updated_purchases": updated_purchases
    }

def send_vendor_payment_notification(phone: str, amount: float, balance: float, vendor_name: str):
    """Send WhatsApp notification for vendor payment"""
    try:
        # Normalize phone if needed
        if phone.startswith('0'):
            phone = '92' + phone[1:]
        elif len(phone) == 10:
            phone = '92' + phone
            
        message = f"✅ *Payment Sent to Vendor*\n\n" \
                  f"Vendor: {vendor_name}\n" \
                  f"Amount Paid: ${amount:,.2f}\n" \
                  f"Remaining Balance: ${balance:,.2f}\n\n" \
                  f"Transaction recorded successfully."
                  
        requests.post(
            "http://127.0.0.1:8000/api/v1/whatsapp/send",
            json={
                "phone_number": phone,
                "message": message
            },
            timeout=5
        )
    except Exception as e:
        print(f"Failed to send vendor payment notification: {e}")
