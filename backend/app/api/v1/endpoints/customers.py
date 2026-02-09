from typing import Any, List, Optional
import csv
import io
import requests
import asyncio
import re
from fastapi.responses import StreamingResponse
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime

from app.api import deps
from app.models.user import User
from app.models.customer import Customer, CustomerNote, CustomerPayment
from app.models.sale import Sale
from app.models.pos_return import PosReturn
from app.schemas import customer as customer_schema
from app.services import accounting as accounting_service

router = APIRouter()


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("92") and len(digits) > 10:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) > 10:
        digits = digits[1:]
    if len(digits) > 10:
        digits = digits[-10:]
    return digits


def normalize_email(email: Optional[str]) -> Optional[str]:
    if email is None:
        return None
    normalized = email.strip()
    return normalized or None


def build_phone_variants(phone: str) -> List[str]:
    base = normalize_phone(phone)
    if not base:
        return []
    return [
        base,
        f"0{base}",
        f"92{base}",
        f"+92{base}",
    ]


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
        phone_variants = build_phone_variants(search)
        phone_filters = [Customer.phone.ilike(f"%{variant}%") for variant in phone_variants]
        query = query.filter(
            or_(
                Customer.phone.ilike(search_term),
                *phone_filters,
                Customer.customer_id.ilike(search_term),
                Customer.name.ilike(search_term),
            )
        )
    
    customers = query.order_by(Customer.created_at.desc()).offset(skip).limit(limit).all()
    return customers


@router.get("/count")
def count_customers(
    db: Session = Depends(deps.get_db),
    search: Optional[str] = Query(None, description="Search by phone, customer_id, or name"),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    query = db.query(Customer)

    if search:
        search_term = f"%{search}%"
        phone_variants = build_phone_variants(search)
        phone_filters = [Customer.phone.ilike(f"%{variant}%") for variant in phone_variants]
        query = query.filter(
            or_(
                Customer.phone.ilike(search_term),
                *phone_filters,
                Customer.customer_id.ilike(search_term),
                Customer.name.ilike(search_term),
            )
        )

    return {"total": query.count()}


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
        phone_variants = build_phone_variants(phone)
        for variant in phone_variants:
            customer = query.filter(Customer.phone == variant).first()
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
        clean_phone = normalize_phone(customer_in.phone)
        existing = db.query(Customer).filter(Customer.phone == clean_phone).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A customer with this phone number already exists"
            )

    normalized_email = normalize_email(customer_in.email)
    if normalized_email:
        existing = db.query(Customer).filter(Customer.email == normalized_email).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A customer with this email already exists"
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
        phone=normalize_phone(customer_in.phone) if customer_in.phone else None,
        email=normalized_email,
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
            email = normalize_email(row.get("email"))
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

            clean_phone = normalize_phone(phone_raw) if phone_raw else None

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

            if email:
                existing = db.query(Customer).filter(Customer.email == email).first()
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
        clean_phone = normalize_phone(customer_in.phone)
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
    
    normalized_email = normalize_email(customer_in.email)
    if normalized_email:
        existing = db.query(Customer).filter(Customer.email == normalized_email).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A customer with this email already exists"
            )

    customer = Customer(
        customer_id=final_customer_id,
        phone=normalize_phone(customer_in.phone) if customer_in.phone else None,
        email=normalized_email,
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
        clean_phone = normalize_phone(customer_in.phone)
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
        normalized_email = normalize_email(customer_in.email)
        if normalized_email and normalized_email != customer.email:
            existing = db.query(Customer).filter(
                Customer.email == normalized_email,
                Customer.id != id,
            ).first()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail="A customer with this email already exists",
                )
        customer.email = normalized_email
    if customer_in.name is not None:
        customer.name = customer_in.name
    if customer_in.address is not None:
        customer.address = customer_in.address
    if customer_in.opening_balance is not None:
        if customer_in.opening_balance < 0:
            raise HTTPException(
                status_code=400,
                detail="Opening balance must be greater than or equal to 0",
            )
        previous_opening = customer.opening_balance or 0.0
        new_opening = float(customer_in.opening_balance)
        delta = new_opening - previous_opening
        customer.opening_balance = new_opening
        customer.outstanding_balance = max(0.0, (customer.outstanding_balance or 0.0) + delta)
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
    accounting_service.post_customer_payment(
        db=db,
        customer_id=id,
        amount=payment_in.amount,
        payment_method=payment_in.payment_method,
        created_by=current_user.id,
    )
    db.commit()
    db.refresh(payment)
    
    # Send WhatsApp notification
    if customer.phone:
        background_tasks.add_task(
            asyncio.run,
            send_payment_notification_async(
                customer.phone,
                payment.amount,
                customer.outstanding_balance,
                payment.id,
            ),
        )

    return payment


@router.post("/{id}/add-advance")
def add_customer_advance(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    advance_in: dict,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Record amount paid on behalf of customer (advance payment / buy on behalf)
    This increases the customer's outstanding balance
    """
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    amount = advance_in.get('amount', 0)
    description = advance_in.get('description', '')
    payment_method = advance_in.get('payment_method', 'cash')
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    if not description:
        raise HTTPException(status_code=400, detail="Description is required")
    
    # Increase customer's outstanding balance
    customer.outstanding_balance += amount
    customer.updated_at = datetime.utcnow()
    
    # Create a note to track this advance
    note = CustomerNote(
        customer_id=id,
        note_type="advance_payment",
        note_text=f"Paid ${amount:.2f} on behalf via {payment_method}: {description}"
    )
    
    db.add(note)
    db.add(customer)
    accounting_service.post_customer_advance(
        db=db,
        customer_id=id,
        amount=amount,
        payment_method=payment_method,
        created_by=current_user.id,
    )
    db.commit()
    db.refresh(customer)
    db.refresh(note)
    
    return {
        "success": True,
        "customer_id": id,
        "amount": amount,
        "new_balance": customer.outstanding_balance,
        "description": description,
        "note_id": note.id
    }


@router.post("/{id}/send-reminder")
def send_customer_due_reminder(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Send WhatsApp reminder for customer's due amount."""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if not customer.phone:
        raise HTTPException(status_code=400, detail="Customer phone is missing")

    if (customer.outstanding_balance or 0) <= 0:
        raise HTTPException(status_code=400, detail="Customer has no due amount")

    background_tasks.add_task(
        asyncio.run,
        send_due_reminder_notification_async(
            customer.phone,
            customer.name or "Customer",
            customer.outstanding_balance,
            id,
        ),
    )

    return {"success": True, "message": "Reminder sent"}


@router.post("/send-reminders")
def send_all_due_reminders(
    *,
    db: Session = Depends(deps.get_db),
    background_tasks: BackgroundTasks,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Send reminders to all customers with due balance and phone."""
    due_customers = db.query(Customer).filter(
        Customer.outstanding_balance > 0,
        Customer.phone.isnot(None)
    ).all()

    if not due_customers:
        return {"success": True, "sent": 0, "skipped": 0}

    payload = [
        {
            "phone": customer.phone,
            "name": customer.name or "Customer",
            "balance": customer.outstanding_balance,
            "id": customer.id,
        }
        for customer in due_customers
        if customer.phone
    ]

    background_tasks.add_task(
        asyncio.run,
        send_due_reminders_batch_async(payload),
    )

    return {"success": True, "sent": len(payload), "skipped": 0}


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
                  f"Thank you.!"\
                  f"vibeexe.com"
                  
        requests.post(
            "http://127.0.0.1:8000/api/v1/whatsapp/send",
            json={
                "phone_number": phone,
                "message": message
            },
            timeout=2
        )
    except Exception as e:
        print(f"Failed to send payment notification: {e}")


async def send_payment_notification_async(phone: str, amount: float, balance: float, payment_id: int):
    await asyncio.to_thread(send_payment_notification, phone, amount, balance, payment_id)


def send_due_reminder_notification(phone: str, name: str, balance: float, customer_id: int):
    """Send WhatsApp reminder for due amount"""
    try:
        # Normalize phone if needed (reusing logic from sales)
        if phone.startswith('0'):
            phone = '92' + phone[1:]
        elif len(phone) == 10:
            phone = '92' + phone

        message = (
            f"🔔 *Payment Reminder*\n\n"
            f"Malik D Store.\n"
            f"Customer: {name}\n"
            f"Due Amount: ${balance:,.2f}\n\n"
            f"Please clear your outstanding balance at your earliest convenience.\n"
            f"Customer ID: #{customer_id}"
            f"Malik D Store.\n"
        )

        requests.post(
            "http://127.0.0.1:8000/api/v1/whatsapp/send",
            json={
                "phone_number": phone,
                "message": message
            },
            timeout=2
        )
    except Exception as e:
        print(f"Failed to send due reminder: {e}")


def _extract_amount_from_note(note_text: str) -> float:
    if not note_text:
        return 0.0
    match = re.search(r"\$([0-9.,]+)", note_text)
    if not match:
        return 0.0
    try:
        return float(match.group(1).replace(",", ""))
    except Exception:
        return 0.0


@router.get("/{id}/report")
def export_customer_report(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Export customer sales/returns/payments/advances summary as CSV."""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    sales = db.query(Sale).filter(Sale.customer_ref_id == id).all()
    payments = db.query(CustomerPayment).filter(CustomerPayment.customer_id == id).all()
    advances = db.query(CustomerNote).filter(
        CustomerNote.customer_id == id,
        CustomerNote.note_type == "advance_payment",
    ).all()
    returns = db.query(PosReturn).join(Sale, PosReturn.sale_id == Sale.id).filter(
        Sale.customer_ref_id == id
    ).all()

    rows: List[Dict[str, Any]] = []

    for sale in sales:
        rows.append({
            "Type": "Sale",
            "Date": sale.created_at.isoformat(),
            "Reference": f"Sale #{sale.id}",
            "Amount": f"{sale.total:.2f}",
            "Details": f"Paid: {sale.amount_paid:.2f}, Due: {sale.amount_due:.2f}, Method: {sale.payment_method}",
        })

    for ret in returns:
        rows.append({
            "Type": "Return",
            "Date": ret.created_at.isoformat(),
            "Reference": f"Return #{ret.id}",
            "Amount": f"{ret.refund_amount:.2f}",
            "Details": f"Sale #{ret.sale_id or 'N/A'} - {ret.reason}",
        })

    for payment in payments:
        rows.append({
            "Type": "Payment",
            "Date": payment.payment_date.isoformat(),
            "Reference": f"Payment #{payment.id}",
            "Amount": f"{payment.amount:.2f}",
            "Details": f"Method: {payment.payment_method}",
        })

    for note in advances:
        amount = _extract_amount_from_note(note.note_text)
        rows.append({
            "Type": "Buy on Behalf",
            "Date": note.created_at.isoformat(),
            "Reference": f"Advance #{note.id}",
            "Amount": f"{amount:.2f}",
            "Details": note.note_text,
        })

    rows.sort(key=lambda r: r.get("Date", ""))

    if not rows:
        rows = [{"Type": "", "Date": "", "Reference": "", "Amount": "", "Details": "No data"}]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["Type", "Date", "Reference", "Amount", "Details"])
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)

    filename = f"customer_report_{id}.csv"
    return StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def normalize_phone_for_sales(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = "92" + digits
    return digits if digits else None


@router.post("/{id}/ledger/backfill")
def backfill_customer_ledger(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Backfill customer_ref_id on sales and customer_id on journal lines."""
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    normalized_phone = normalize_phone_for_sales(customer.phone)

    sales_query = db.query(Sale).filter(Sale.customer_ref_id.is_(None))
    if normalized_phone:
        sales_query = sales_query.filter(Sale.customer_phone == normalized_phone)
    else:
        sales_query = sales_query.filter(Sale.customer_phone.is_(None))

    sales_to_update = sales_query.all()
    updated_sales = 0
    for sale in sales_to_update:
        sale.customer_ref_id = customer.id
        sale.is_walkin = False
        updated_sales += 1
        db.add(sale)

    # Backfill journal lines for all customer sales
    from app.models.accounting import JournalLine
    linked_sales = db.query(Sale.id).filter(Sale.customer_ref_id == customer.id).all()
    linked_sale_ids = [row[0] for row in linked_sales]
    journal_lines = db.query(JournalLine).filter(
        JournalLine.sale_id.in_(linked_sale_ids),
        JournalLine.customer_id.is_(None)
    ).all() if linked_sale_ids else []

    updated_lines = 0
    for line in journal_lines:
        line.customer_id = customer.id
        updated_lines += 1
        db.add(line)

    db.commit()

    return {
        "success": True,
        "updated_sales": updated_sales,
        "updated_journal_lines": updated_lines,
    }


async def send_due_reminder_notification_async(phone: str, name: str, balance: float, customer_id: int):
    await asyncio.to_thread(send_due_reminder_notification, phone, name, balance, customer_id)


async def send_due_reminders_batch_async(customers: List[dict]):
    for customer in customers:
        await send_due_reminder_notification_async(
            customer["phone"],
            customer["name"],
            customer["balance"],
            customer["id"],
        )
        await asyncio.sleep(2)


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
