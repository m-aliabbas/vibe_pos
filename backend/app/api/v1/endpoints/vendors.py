from typing import Any, List, Optional
import csv
import io
import asyncio
import requests
from fastapi.responses import StreamingResponse
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, File, UploadFile, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from app.api import deps
from app.models.vendor import Vendor
from app.models.purchase import Purchase, PurchaseStatus
from app.models.accounting import JournalEntry, JournalLine, Account
from app.schemas import vendor as vendor_schema
from app.services import accounting as accounting_service

router = APIRouter()


def _get_store_name() -> str:
    """Return the configured store name from DB."""
    from app.db.session import SessionLocal
    from app.models.settings import StoreSettings
    db = SessionLocal()
    try:
        row = db.query(StoreSettings).filter(StoreSettings.id == 1).first()
        if row and row.store_name:
            return row.store_name
    except Exception:
        pass
    finally:
        db.close()
    return "My Store"


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("92") and len(digits) > 10:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) > 10:
        digits = digits[1:]
    if len(digits) > 10:
        digits = digits[-10:]
    return digits


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

@router.get("/", response_model=List[vendor_schema.Vendor])
def read_vendors(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by name, contact, email, or phone"),
) -> Any:
    query = db.query(Vendor)
    if search:
        search_term = f"%{search}%"
        phone_variants = build_phone_variants(search)
        phone_filters = [Vendor.phone.ilike(f"%{variant}%") for variant in phone_variants]
        query = query.filter(
            or_(
                Vendor.name.ilike(search_term),
                Vendor.contact_name.ilike(search_term),
                Vendor.email.ilike(search_term),
                Vendor.phone.ilike(search_term),
                *phone_filters,
            )
        )

    return query.order_by(Vendor.id.asc()).offset(skip).limit(limit).all()


@router.get("/count")
def count_vendors(
    db: Session = Depends(deps.get_db),
    search: Optional[str] = Query(None, description="Search by name, contact, email, or phone"),
) -> Any:
    query = db.query(Vendor)
    if search:
        search_term = f"%{search}%"
        phone_variants = build_phone_variants(search)
        phone_filters = [Vendor.phone.ilike(f"%{variant}%") for variant in phone_variants]
        query = query.filter(
            or_(
                Vendor.name.ilike(search_term),
                Vendor.contact_name.ilike(search_term),
                Vendor.email.ilike(search_term),
                Vendor.phone.ilike(search_term),
                *phone_filters,
            )
        )

    return {"total": query.count()}

@router.get("/export-csv")
def export_vendors_csv(
    db: Session = Depends(deps.get_db),
) -> Any:
    """Export all vendors as CSV."""
    vendors = db.query(Vendor).order_by(Vendor.id.asc()).all()

    output = io.StringIO()
    fieldnames = [
        "name",
        "contact_name",
        "email",
        "phone",
        "address",
        "opening_balance",
        "prepaid_credit",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for vendor in vendors:
        writer.writerow(
            {
                "name": vendor.name or "",
                "contact_name": vendor.contact_name or "",
                "email": vendor.email or "",
                "phone": vendor.phone or "",
                "address": vendor.address or "",
                "opening_balance": float(vendor.opening_balance or 0),
                "prepaid_credit": float(vendor.prepaid_credit or 0),
            }
        )

    output.seek(0)
    return StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=vendors.csv"},
    )

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
    
    vendor_data = vendor_in.dict()
    if vendor_data.get("phone"):
        vendor_data["phone"] = normalize_phone(vendor_data["phone"])

    vendor = Vendor(**vendor_data)
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
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

            raw_phone = (row.get("phone") or "").strip() or None
            vendor = Vendor(
                name=name,
                contact_name=(row.get("contact_name") or "").strip() or None,
                email=(row.get("email") or "").strip() or None,
                phone=normalize_phone(raw_phone) if raw_phone else None,
                address=(row.get("address") or "").strip() or None,
                opening_balance=opening_balance,
            )

            db.add(vendor)
            db.commit()
            db.refresh(vendor)

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

@router.get("/{id}", response_model=vendor_schema.Vendor)
def get_vendor(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """Get a specific vendor by ID."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
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

    update_data = vendor_in.dict(exclude_unset=True)
    opening_balance = update_data.pop("opening_balance", None)

    for field, value in update_data.items():
        if field == "phone" and value:
            value = normalize_phone(value)
        setattr(vendor, field, value)

    if opening_balance is not None:
        if opening_balance < 0:
            raise HTTPException(
                status_code=400,
                detail="Opening balance must be greater than or equal to 0",
            )
        vendor.opening_balance = float(opening_balance)
    
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@router.delete("/{id}")
def delete_vendor(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """Delete a vendor when it has no linked purchases or ledger entries."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    purchase_count = db.query(func.count(Purchase.id)).filter(Purchase.vendor_id == id).scalar() or 0
    ledger_count = db.query(func.count(JournalLine.id)).filter(JournalLine.vendor_id == id).scalar() or 0

    if purchase_count > 0 or ledger_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot delete vendor with existing transactions. "
                "Remove related purchases/ledger entries first."
            ),
        )

    db.delete(vendor)
    db.commit()
    return {"message": "Vendor deleted successfully"}


@router.get("/{id}/report")
def export_vendor_report(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """Export vendor purchases and payments summary as CSV."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    purchases = db.query(Purchase).filter(
        Purchase.vendor_id == id,
        Purchase.items.any(),
    ).all()

    accounting_service.ensure_system_accounts(db)
    ap_code = accounting_service.SYSTEM_ACCOUNTS["ACCOUNTS_PAYABLE"]["code"]
    ap_account = db.query(Account).filter(Account.code == ap_code).first()

    payments: List[JournalLine] = []
    if ap_account:
        payments = db.query(JournalLine).join(
            JournalEntry, JournalEntry.id == JournalLine.entry_id
        ).filter(
            JournalLine.vendor_id == id,
            JournalLine.account_id == ap_account.id,
            JournalLine.debit > 0
        ).all()

    rows: List[dict] = []

    for purchase in purchases:
        rows.append({
            "Type": "Purchase",
            "Date": purchase.created_at.isoformat(),
            "Reference": f"Purchase #{purchase.id}",
            "Amount": f"{purchase.total_amount:.2f}",
            "Details": f"Paid: {purchase.amount_paid:.2f}, Status: {purchase.status}",
        })

    for line in payments:
        entry = line.entry
        rows.append({
            "Type": "Payment",
            "Date": entry.entry_date.isoformat() if entry else "",
            "Reference": entry.description if entry else "Payment",
            "Amount": f"{(line.debit or 0.0):.2f}",
            "Details": f"Source: {entry.source_type if entry else ''}",
        })

    rows.sort(key=lambda r: r.get("Date", ""))

    if not rows:
        rows = [{"Type": "", "Date": "", "Reference": "", "Amount": "", "Details": "No data"}]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["Type", "Date", "Reference", "Amount", "Details"])
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)

    filename = f"vendor_report_{id}.csv"
    return StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.post("/{id}/payment")
def make_vendor_payment(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    payment_in: vendor_schema.VendorPayment,
    background_tasks: BackgroundTasks,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """Record vendor payment at vendor-ledger level or auto-allocate across purchases."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    if payment_in.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")

    reference_note = (payment_in.reference_note or "").strip() or None
    vendor_level = bool(payment_in.vendor_level)
    previous_credit = max(0.0, accounting_service.get_vendor_advance_balance(db, id))

    if not vendor_level:
        remaining_payment = float(payment_in.amount)
        current_payable = max(0.0, accounting_service.get_vendor_balance(db, id))
        if remaining_payment > current_payable + 0.005:
            raise HTTPException(
                status_code=400,
                detail="Payment exceeds vendor payable. Enable vendor-level payment to keep extra as advance.",
            )

        purchases = (
            db.query(Purchase)
            .filter(Purchase.vendor_id == id)
            .order_by(Purchase.created_at.asc(), Purchase.id.asc())
            .all()
        )

        updated_purchases = []
        applied_amount = 0.0

        for purchase in purchases:
            if remaining_payment <= 0:
                break

            total_amount = float(purchase.total_amount or 0.0)
            current_paid = float(purchase.amount_paid or 0.0)
            due = max(0.0, total_amount - current_paid)
            if due <= 0:
                continue

            apply_now = min(remaining_payment, due)
            purchase.amount_paid = current_paid + apply_now
            if purchase.amount_paid >= total_amount:
                purchase.status = PurchaseStatus.PAID
            elif purchase.amount_paid > 0:
                purchase.status = PurchaseStatus.PARTIAL
            else:
                purchase.status = PurchaseStatus.UNPAID

            db.add(purchase)
            accounting_service.post_purchase_payment_delta(
                db=db,
                purchase=purchase,
                delta_amount=apply_now,
                created_by=current_user.id,
            )

            remaining_payment -= apply_now
            applied_amount += apply_now
            updated_purchases.append(
                {
                    "purchase_id": purchase.id,
                    "payment_applied": apply_now,
                    "new_balance": max(0.0, float(purchase.total_amount or 0.0) - float(purchase.amount_paid or 0.0)),
                }
            )

        if remaining_payment > 0.005:
            raise HTTPException(
                status_code=400,
                detail="Unable to allocate full payment to purchases. Enable vendor-level payment for advance credit.",
            )

        vendor.prepaid_credit = max(0.0, accounting_service.get_vendor_advance_balance(db, id))
        db.add(vendor)
        db.commit()
        db.refresh(vendor)

        return {
            "message": "Payment applied successfully",
            "mode": "purchase_level",
            "total_payment": payment_in.amount,
            "previous_credit": previous_credit,
            "prepaid_used": 0.0,
            "applied_amount": applied_amount,
            "new_prepaid_credit": vendor.prepaid_credit,
            "updated_purchases": updated_purchases,
        }

    # Ledger-level payable balance; keep behavior explicit (no auto clearing of existing advance).
    current_payable = max(0.0, accounting_service.get_vendor_balance(db, id))
    applied_amount = min(float(payment_in.amount), current_payable)
    new_prepaid_from_cash = max(0.0, float(payment_in.amount) - applied_amount)
    prepaid_used = 0.0

    # Keep prepaid credit as explicit wallet for vendor-level overpayments.
    vendor.prepaid_credit = previous_credit + new_prepaid_from_cash
    db.add(vendor)

    accounting_service.post_vendor_payment(
        db=db,
        vendor_id=id,
        payment_amount=payment_in.amount,
        applied_amount=applied_amount,
        prepaid_used=prepaid_used,
        new_prepaid_from_cash=new_prepaid_from_cash,
        created_by=current_user.id,
        reference_note=reference_note,
    )
    db.commit()
    
    # Send WhatsApp notification if vendor has phone
    if vendor.phone:
        background_tasks.add_task(
            send_vendor_payment_notification_async,
            vendor.phone,
            payment_in.amount,
            vendor.name,
        )
    
    return {
        "message": "Payment applied successfully",
        "mode": "vendor_level",
        "total_payment": payment_in.amount,
        "previous_credit": previous_credit,
        "prepaid_used": prepaid_used,
        "applied_amount": applied_amount,
        "new_prepaid_credit": vendor.prepaid_credit,
        "updated_purchases": []
    }


@router.post("/{id}/settle-balance")
def settle_vendor_balance(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    settlement_in: vendor_schema.VendorSettlement,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """Settle vendor net balance to zero using an explicit accounting adjustment entry."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    reason = (settlement_in.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Settlement reason is required")

    payable_balance = max(0.0, accounting_service.get_vendor_balance(db, id))
    advance_balance = max(0.0, accounting_service.get_vendor_advance_balance(db, id))

    if payable_balance == 0 and advance_balance == 0 and (vendor.prepaid_credit or 0) == 0:
        return {
            "message": "Vendor is already settled",
            "settled_payable": 0.0,
            "settled_advance": 0.0,
            "new_payable_balance": 0.0,
            "new_prepaid_credit": 0.0,
        }

    accounting_service.post_vendor_settlement(
        db=db,
        vendor_id=id,
        payable_balance=payable_balance,
        advance_balance=advance_balance,
        reason=reason,
        created_by=current_user.id,
    )

    # Keep denormalized field aligned with ledger settlement.
    vendor.prepaid_credit = 0.0
    db.add(vendor)
    db.commit()
    db.refresh(vendor)

    return {
        "message": "Vendor balance settled to zero",
        "settled_payable": payable_balance,
        "settled_advance": advance_balance,
        "new_payable_balance": 0.0,
        "new_prepaid_credit": vendor.prepaid_credit,
    }

@router.get("/{id}/payments")
def get_vendor_payments(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """List vendor payment/advance journal entries shown in payment history."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    entries = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type.in_(["vendor_payment", "vendor_advance"]),
            JournalEntry.source_id == id,
        )
        .order_by(JournalEntry.entry_date.desc())
        .all()
    )

    result = []
    for entry in entries:
        total_debit = sum(float(line.debit or 0.0) for line in entry.lines)
        total_credit = sum(float(line.credit or 0.0) for line in entry.lines)
        amount = max(total_debit, total_credit)
        # Extract reference note from description
        note = ""
        if ": " in entry.description:
            note = entry.description.split(": ", 1)[1]
        result.append({
            "id": entry.id,
            "amount": amount,
            "date": entry.entry_date.isoformat() if entry.entry_date else None,
            "reference_note": note,
            "description": entry.description,
            "source_type": entry.source_type,
        })
    return result


@router.delete("/{id}/payments/{entry_id}")
def delete_vendor_payment(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    entry_id: int,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """Delete a vendor payment/advance entry and reverse its ledger effect."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id,
        JournalEntry.source_type.in_(["vendor_payment", "vendor_advance"]),
        JournalEntry.source_id == id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Payment not found")

    db.delete(entry)
    vendor.prepaid_credit = max(0.0, accounting_service.get_vendor_advance_balance(db, id))
    db.add(vendor)
    db.commit()
    return {"message": "Vendor payment deleted successfully"}


@router.put("/{id}/payments/{entry_id}")
def update_vendor_payment(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    entry_id: int,
    payment_in: vendor_schema.VendorPayment,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """Update the reference note of a vendor payment. Amount changes are not supported to preserve accounting integrity."""
    vendor = db.query(Vendor).filter(Vendor.id == id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id,
        JournalEntry.source_type.in_(["vendor_payment", "vendor_advance"]),
        JournalEntry.source_id == id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Payment not found")

    note = (payment_in.reference_note or "").strip()
    note_suffix = f": {note}" if note else ""
    if entry.source_type == "vendor_advance":
        entry.description = f"Vendor advance #{id}{note_suffix}"
    else:
        entry.description = f"Vendor payment settlement #{id}{note_suffix}"
    db.add(entry)
    db.commit()
    db.refresh(entry)

    total_debit = sum(float(line.debit or 0.0) for line in entry.lines)
    total_credit = sum(float(line.credit or 0.0) for line in entry.lines)
    amount = max(total_debit, total_credit)
    return {
        "id": entry.id,
        "amount": amount,
        "date": entry.entry_date.isoformat() if entry.entry_date else None,
        "reference_note": note,
        "description": entry.description,
        "source_type": entry.source_type,
    }


async def send_vendor_payment_notification_async(phone: str, amount: float, vendor_name: str):
    """Send WhatsApp notification for vendor payment without blocking the request path."""
    try:
        # Normalize phone if needed
        if phone.startswith('0'):
            phone = '92' + phone[1:]
        elif len(phone) == 10:
            phone = '92' + phone
            
        store = _get_store_name()
        message = f"✅ *Payment Sent to Vendor*\n\n" \
              f"Store: {store}\n" \
              f"Vendor: {vendor_name}\n" \
              f"Amount Paid: RS{amount:,.2f}\n\n" \
              f"Transaction recorded successfully.\n" \
              f"— {store}"
        await asyncio.to_thread(
            requests.post,
            "http://127.0.0.1:8000/api/v1/whatsapp/send",
            json={
                "phone_number": phone,
                "message": message
            },
            timeout=2,
        )
    except Exception as e:
        print(f"Failed to send vendor payment notification: {e}")
