from typing import Any, List, Optional
import csv
import io
import requests
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime

from app.api import deps
from app.models.user import User
from app.models.customer import Customer, CustomerNote, CustomerPayment
from app.models.sale import Sale
from app.schemas import customer as customer_schema

router = APIRouter()


def generate_customer_id(db: Session) -> str:
    """Generate a unique human-readable customer ID (e.g., CUST001)"""
    # Find the highest numeric suffix
    last_customer = db.query(Customer).filter(
        Customer.customer_id.like("CUST%")
    ).order_by(Customer.id.desc()).first()
    
    if last_customer and last_customer.customer_id:
        try:
            last_num = int(last_customer.customer_id.replace("CUST", ""))
            new_num = last_num + 1
        except ValueError:
            new_num = 1
    else:
        new_num = 1
    
    return f"CUST{new_num:04d}"


@router.get("/", response_model=List[customer_schema.CustomerListResponse])
def read_customers(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by phone, customer_id, or name"),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get all customers with optional search"""
    query = db.query(Customer)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Customer.phone.ilike(search_term),
                Customer.customer_id.ilike(search_term),
                Customer.name.ilike(search_term),
            )
        )
    
    customers = query.order_by(Customer.created_at.desc()).offset(skip).limit(limit).all()
    return customers


@router.get("/search", response_model=Optional[customer_schema.CustomerSimple])
def search_customer(
    db: Session = Depends(deps.get_db),
    phone: Optional[str] = Query(None, description="Search by phone number"),
    customer_id: Optional[str] = Query(None, description="Search by customer_id"),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Search for a customer by phone or customer_id - used in cart/checkout"""
    if not phone and not customer_id:
        raise HTTPException(
            status_code=400,
            detail="Please provide either phone or customer_id to search"
        )
    
    query = db.query(Customer)
    
    if phone:
        # Clean phone number (remove spaces, dashes)
        clean_phone = phone.strip().replace(" ", "").replace("-", "")
        customer = query.filter(Customer.phone == clean_phone).first()
        if customer:
            return customer
    
    if customer_id:
        customer = query.filter(Customer.customer_id == customer_id.strip().upper()).first()
        if customer:
            return customer
    
    return None


@router.post("/", response_model=customer_schema.CustomerResponse)
def create_customer(
    *,
    db: Session = Depends(deps.get_db),
    customer_in: customer_schema.CustomerCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Create a new customer. At least phone or customer_id must be provided."""
    
    # Validate - at least one of phone or customer_id must be provided
    if not customer_in.phone and not customer_in.customer_id:
        raise HTTPException(
            status_code=400,
            detail="At least phone or customer_id must be provided"
        )

    if customer_in.opening_balance is not None and customer_in.opening_balance < 0:
        raise HTTPException(
            status_code=400,
            detail="Opening balance must be greater than or equal to 0"
        )

    if customer_in.opening_balance is not None and customer_in.opening_balance < 0:
        raise HTTPException(
            status_code=400,
            detail="Opening balance must be greater than or equal to 0"
        )
    
    # Check for duplicate phone
    if customer_in.phone:
        clean_phone = customer_in.phone.strip().replace(" ", "").replace("-", "")
        existing = db.query(Customer).filter(Customer.phone == clean_phone).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A customer with this phone number already exists"
            )
    
    # Check for duplicate customer_id
    if customer_in.customer_id:
        existing = db.query(Customer).filter(
            Customer.customer_id == customer_in.customer_id.strip().upper()
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A customer with this customer_id already exists"
            )
    
    # Generate customer_id if not provided
    final_customer_id = customer_in.customer_id.strip().upper() if customer_in.customer_id else generate_customer_id(db)
    
    customer = Customer(
        customer_id=final_customer_id,
        phone=customer_in.phone.strip().replace(" ", "").replace("-", "") if customer_in.phone else None,
        email=customer_in.email,
        name=customer_in.name,
        address=customer_in.address,
        current_mileage=customer_in.current_mileage,
        oil_change_interval=customer_in.oil_change_interval,
        next_oil_change_mileage=customer_in.next_oil_change_mileage,
        opening_balance=customer_in.opening_balance or 0.0,
        outstanding_balance=customer_in.opening_balance or 0.0,
        member_since=datetime.utcnow(),
    )
    
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.post("/bulk-import")
async def bulk_import_customers(
    *,
    db: Session = Depends(deps.get_db),
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Bulk import customers from CSV."""
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
            phone_raw = (row.get("phone") or "").strip()
            customer_id_raw = (row.get("customer_id") or "").strip().upper()
            email = (row.get("email") or "").strip() or None
            name = (row.get("name") or "").strip() or None
            address = (row.get("address") or "").strip() or None

            if not phone_raw and not customer_id_raw:
                skipped += 1
                errors.append(f"Row {row_index}: phone or customer_id is required")
                continue

            opening_balance_value = row.get("opening_balance")
            opening_balance = float(opening_balance_value) if opening_balance_value not in (None, "") else 0.0
            if opening_balance < 0:
                skipped += 1
                errors.append(f"Row {row_index}: opening_balance must be >= 0")
                continue

            clean_phone = phone_raw.replace(" ", "").replace("-", "") if phone_raw else None

            if clean_phone:
                existing = db.query(Customer).filter(Customer.phone == clean_phone).first()
                if existing:
                    skipped += 1
                    continue

            if customer_id_raw:
                existing = db.query(Customer).filter(Customer.customer_id == customer_id_raw).first()
                if existing:
                    skipped += 1
                    continue

            final_customer_id = customer_id_raw if customer_id_raw else generate_customer_id(db)

            customer = Customer(
                customer_id=final_customer_id,
                phone=clean_phone,
                email=email,
                name=name,
                address=address,
                opening_balance=opening_balance,
                outstanding_balance=opening_balance,
                member_since=datetime.utcnow(),
            )

            db.add(customer)
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


@router.post("/find-or-create", response_model=customer_schema.CustomerSimple)
def find_or_create_customer(
    *,
    db: Session = Depends(deps.get_db),
    customer_in: customer_schema.CustomerCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Find existing customer or create new one - used during checkout"""
    
    # Validate - at least one of phone or customer_id must be provided
    if not customer_in.phone and not customer_in.customer_id:
        raise HTTPException(
            status_code=400,
            detail="At least phone or customer_id must be provided"
        )
    
    # Try to find by phone first
    if customer_in.phone:
        clean_phone = customer_in.phone.strip().replace(" ", "").replace("-", "")
        existing = db.query(Customer).filter(Customer.phone == clean_phone).first()
        if existing:
            return existing
    
    # Try to find by customer_id
    if customer_in.customer_id:
        existing = db.query(Customer).filter(
            Customer.customer_id == customer_in.customer_id.strip().upper()
        ).first()
        if existing:
            return existing
    
    # Create new customer
    final_customer_id = customer_in.customer_id.strip().upper() if customer_in.customer_id else generate_customer_id(db)
    
    customer = Customer(
        customer_id=final_customer_id,
        phone=customer_in.phone.strip().replace(" ", "").replace("-", "") if customer_in.phone else None,
        email=customer_in.email,
        name=customer_in.name,
        address=customer_in.address,
        current_mileage=customer_in.current_mileage,
        oil_change_interval=customer_in.oil_change_interval,
        next_oil_change_mileage=customer_in.next_oil_change_mileage,
        opening_balance=customer_in.opening_balance or 0.0,
        outstanding_balance=customer_in.opening_balance or 0.0,
        member_since=datetime.utcnow(),
    )
    
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{id}", response_model=customer_schema.CustomerResponse)
def read_customer(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get customer by ID with all details, notes, and payments"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.put("/{id}", response_model=customer_schema.CustomerResponse)
def update_customer(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    customer_in: customer_schema.CustomerUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Update customer information"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Check for duplicate phone if changing
    if customer_in.phone and customer_in.phone != customer.phone:
        clean_phone = customer_in.phone.strip().replace(" ", "").replace("-", "")
        existing = db.query(Customer).filter(
            Customer.phone == clean_phone,
            Customer.id != id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A customer with this phone number already exists"
            )
        customer.phone = clean_phone
    
    # Check for duplicate customer_id if changing
    if customer_in.customer_id and customer_in.customer_id != customer.customer_id:
        existing = db.query(Customer).filter(
            Customer.customer_id == customer_in.customer_id.strip().upper(),
            Customer.id != id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A customer with this customer_id already exists"
            )
        customer.customer_id = customer_in.customer_id.strip().upper()
    
    # Update other fields
    if customer_in.email is not None:
        customer.email = customer_in.email
    if customer_in.name is not None:
        customer.name = customer_in.name
    if customer_in.address is not None:
        customer.address = customer_in.address
    if customer_in.current_mileage is not None:
        customer.current_mileage = customer_in.current_mileage
    if customer_in.oil_change_interval is not None:
        customer.oil_change_interval = customer_in.oil_change_interval
    if customer_in.next_oil_change_mileage is not None:
        customer.next_oil_change_mileage = customer_in.next_oil_change_mileage
    
    customer.updated_at = datetime.utcnow()
    
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{id}")
def delete_customer(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_active_admin),
) -> Any:
    """Delete customer (Admin only)"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Check if customer has sales linked
    sales_count = db.query(Sale).filter(Sale.customer_ref_id == id).count()
    if sales_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete customer with {sales_count} linked sales. Consider archiving instead."
        )
    
    db.delete(customer)
    db.commit()
    return {"message": "Customer deleted successfully"}


# ============ CUSTOMER NOTES ============

@router.get("/{id}/notes", response_model=List[customer_schema.CustomerNote])
def get_customer_notes(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get all notes for a customer"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    notes = db.query(CustomerNote).filter(
        CustomerNote.customer_id == id
    ).order_by(CustomerNote.created_at.desc()).all()
    return notes


@router.post("/{id}/notes", response_model=customer_schema.CustomerNote)
def add_customer_note(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    note_in: customer_schema.CustomerNoteCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Add a note to customer"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    note = CustomerNote(
        customer_id=id,
        note_type=note_in.note_type,
        note_text=note_in.note_text,
    )
    
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{id}/notes/{note_id}")
def delete_customer_note(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    note_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Delete a customer note"""
    note = db.query(CustomerNote).filter(
        CustomerNote.id == note_id,
        CustomerNote.customer_id == id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    db.delete(note)
    db.commit()
    return {"message": "Note deleted successfully"}


# ============ CUSTOMER PAYMENTS ============

@router.get("/{id}/payments", response_model=List[customer_schema.CustomerPayment])
def get_customer_payments(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get all payment records for a customer"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    payments = db.query(CustomerPayment).filter(
        CustomerPayment.customer_id == id
    ).order_by(CustomerPayment.created_at.desc()).all()
    return payments


@router.post("/{id}/record-payment", response_model=customer_schema.CustomerPayment)
def record_customer_payment(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    payment_in: customer_schema.CustomerPaymentCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Record a payment against customer's outstanding balance (udhar)"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    if payment_in.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    # Record the payment
    payment = CustomerPayment(
        customer_id=id,
        amount=payment_in.amount,
        payment_method=payment_in.payment_method,
        reference_note=payment_in.reference_note,
    )
    
    # Update outstanding balance
    customer.outstanding_balance = max(0, customer.outstanding_balance - payment_in.amount)
    
    # --- RECONCILIATION LOGIC ---
    # Find unpaid sales and distribute payment
    remaining_payment = payment_in.amount
    
    # Get unpaid/partial sales ordered by date (oldest first)
    unpaid_sales = db.query(Sale).filter(
        Sale.customer_ref_id == id,
        Sale.amount_due > 0
    ).order_by(Sale.created_at.asc()).all()
    
    for sale in unpaid_sales:
        if remaining_payment <= 0:
            break
            
        due = sale.amount_due
        pay_amount = min(remaining_payment, due)
        
        sale.amount_paid += pay_amount
        sale.amount_due -= pay_amount
        remaining_payment -= pay_amount
        
        # If fully paid, we could potentially update a status flag if you had one,
        # currently logic depends on amount_due which is sufficient.
    
    customer.updated_at = datetime.utcnow()
    
    db.add(payment)
    db.add(customer)
    db.commit()
    db.refresh(payment)
    
    # Send WhatsApp notification
    if customer.phone:
        background_tasks.add_task(send_payment_notification, customer.phone, payment.amount, customer.outstanding_balance, payment.id)

    return payment

def send_payment_notification(phone: str, amount: float, balance: float, payment_id: int):
    """Send WhatsApp notification for payment"""
    try:
        # Normalize phone if needed (reusing logic from sales)
        if phone.startswith('0'):
            phone = '92' + phone[1:]
        elif len(phone) == 10:
            phone = '92' + phone
            
        message = f"✅ *Payment Received*\n\n" \
                  f"Amount: ${amount:,.2f}\n" \
                  f"Remaining Balance: ${balance:,.2f}\n" \
                  f"Payment ID: #{payment_id}\n\n" \
                  f"Thank you for your business!"
                  
        requests.post(
            "http://127.0.0.1:8000/api/v1/whatsapp/send",
            json={
                "phone_number": phone,
                "message": message
            },
            timeout=5
        )
    except Exception as e:
        print(f"Failed to send payment notification: {e}")


# ============ CUSTOMER PURCHASE HISTORY ============

@router.get("/{id}/purchases")
def get_customer_purchases(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get purchase history for a customer"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    sales = db.query(Sale).filter(
        Sale.customer_ref_id == id
    ).order_by(Sale.created_at.desc()).offset(skip).limit(limit).all()
    
    # Format response
    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "total_count": customer.total_purchases,
        "purchases": [
            {
                "id": sale.id,
                "total": sale.total,
                "amount_paid": sale.amount_paid,
                "amount_due": sale.amount_due,
                "payment_method": sale.payment_method,
                "created_at": sale.created_at,
                "items_count": len(sale.items),
            }
            for sale in sales
        ]
    }


# ============ CUSTOMER FINANCIAL SUMMARY ============

@router.get("/{id}/financial-summary")
def get_customer_financial_summary(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get financial summary for a customer"""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Get all payments
    total_payments = db.query(CustomerPayment).filter(
        CustomerPayment.customer_id == id
    ).count()
    
    total_payment_amount = sum(
        p.amount for p in db.query(CustomerPayment).filter(
            CustomerPayment.customer_id == id
        ).all()
    )
    
    # Calculate average purchase value
    avg_purchase = customer.total_spent / customer.total_purchases if customer.total_purchases > 0 else 0
    
    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "total_purchases": customer.total_purchases,
        "total_spent": customer.total_spent,
        "outstanding_balance": customer.outstanding_balance,
        "average_purchase_value": round(avg_purchase, 2),
        "total_payments_made": total_payments,
        "total_payment_amount": total_payment_amount,
        "member_since": customer.member_since,
    }
