from datetime import datetime
from typing import Dict, Iterable, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import Account, AccountType, JournalEntry, JournalLine


SYSTEM_ACCOUNTS: Dict[str, Dict[str, str]] = {
    "CASH": {"code": "1000", "name": "Cash", "type": AccountType.ASSET},
    "BANK": {"code": "1010", "name": "Bank", "type": AccountType.ASSET},
    "ACCOUNTS_RECEIVABLE": {"code": "1100", "name": "Accounts Receivable", "type": AccountType.ASSET},
    "INVENTORY": {"code": "1200", "name": "Inventory", "type": AccountType.ASSET},
    "VENDOR_ADVANCES": {"code": "1210", "name": "Vendor Advances", "type": AccountType.ASSET},
    "BALANCE_ADJUSTMENTS": {"code": "3900", "name": "Balance Adjustments", "type": AccountType.EQUITY},
    "ACCOUNTS_PAYABLE": {"code": "2000", "name": "Accounts Payable", "type": AccountType.LIABILITY},
    "SALES_REVENUE": {"code": "4000", "name": "Sales Revenue", "type": AccountType.INCOME},
    "SALES_RETURNS": {"code": "4100", "name": "Sales Returns & Allowances", "type": AccountType.INCOME},
}


def ensure_system_accounts(db: Session) -> Dict[str, Account]:
    existing = {
        acc.code: acc
        for acc in db.query(Account).filter(Account.is_system.is_(True)).all()
    }

    created_any = False
    for account in SYSTEM_ACCOUNTS.values():
        if account["code"] not in existing:
            acc = Account(
                code=account["code"],
                name=account["name"],
                type=account["type"],
                is_system=True,
                is_active=True,
            )
            db.add(acc)
            created_any = True
    if created_any:
        db.flush()


def get_customer_balance(db: Session, customer_id: int, opening_balance: float = 0.0) -> float:
    balances = get_customer_balances(db, {customer_id: opening_balance})
    return balances.get(customer_id, round(float(opening_balance or 0.0), 2))


def get_customer_balances(db: Session, opening_balances: Dict[int, float]) -> Dict[int, float]:
    if not opening_balances:
        return {}

    ensure_system_accounts(db)
    ar_code = SYSTEM_ACCOUNTS["ACCOUNTS_RECEIVABLE"]["code"]
    ar_account_id = db.query(Account.id).filter(Account.code == ar_code).scalar()
    if ar_account_id is None:
        return {
            customer_id: round(float(opening_balance or 0.0), 2)
            for customer_id, opening_balance in opening_balances.items()
        }

    rows = db.query(
        JournalLine.customer_id,
        func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0.0),
    ).filter(
        JournalLine.account_id == ar_account_id,
        JournalLine.customer_id.in_(list(opening_balances.keys())),
    ).group_by(
        JournalLine.customer_id,
    ).all()

    journal_deltas = {
        customer_id: float(delta or 0.0)
        for customer_id, delta in rows
        if customer_id is not None
    }

    return {
        customer_id: round(float(opening_balance or 0.0) + journal_deltas.get(customer_id, 0.0), 2)
        for customer_id, opening_balance in opening_balances.items()
    }


def get_vendor_balance(db: Session, vendor_id: int) -> float:
    """Return vendor payable balance from AP journal (positive means we owe vendor)."""
    ensure_system_accounts(db)
    ap_code = SYSTEM_ACCOUNTS["ACCOUNTS_PAYABLE"]["code"]
    ap_account_id = db.query(Account.id).filter(Account.code == ap_code).scalar()
    if ap_account_id is None:
        return 0.0

    delta = db.query(
        func.coalesce(func.sum(JournalLine.credit - JournalLine.debit), 0.0)
    ).filter(
        JournalLine.account_id == ap_account_id,
        JournalLine.vendor_id == vendor_id,
    ).scalar()

    return round(float(delta or 0.0), 2)


def get_vendor_advance_balance(db: Session, vendor_id: int) -> float:
    """Return vendor prepaid/advance balance from Vendor Advances account."""
    ensure_system_accounts(db)
    adv_code = SYSTEM_ACCOUNTS["VENDOR_ADVANCES"]["code"]
    adv_account_id = db.query(Account.id).filter(Account.code == adv_code).scalar()
    if adv_account_id is None:
        return 0.0

    delta = db.query(
        func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0.0)
    ).filter(
        JournalLine.account_id == adv_account_id,
        JournalLine.vendor_id == vendor_id,
    ).scalar()

    return round(float(delta or 0.0), 2)


def get_payment_account_code(payment_method: Optional[str]) -> str:
    method = (payment_method or "cash").lower()
    if method == "cash":
        return SYSTEM_ACCOUNTS["CASH"]["code"]
    return SYSTEM_ACCOUNTS["BANK"]["code"]


def _get_account_by_code(db: Session, code: str) -> Account:
    account = db.query(Account).filter(Account.code == code).first()
    if not account:
        raise ValueError(f"Account with code {code} not found")
    return account


def create_journal_entry(
    *,
    db: Session,
    description: str,
    lines: Iterable[dict],
    source_type: Optional[str] = None,
    source_id: Optional[int] = None,
    created_by: Optional[int] = None,
    entry_date: Optional[datetime] = None,
) -> JournalEntry:
    ensure_system_accounts(db)

    prepared_lines: List[JournalLine] = []
    debit_total = 0.0
    credit_total = 0.0

    for line in lines:
        debit = float(line.get("debit") or 0.0)
        credit = float(line.get("credit") or 0.0)
        if debit < 0 or credit < 0:
            raise ValueError("Debit and credit must be non-negative")
        if debit == 0 and credit == 0:
            raise ValueError("Each journal line must have a debit or credit")

        account_id = line.get("account_id")
        account_code = line.get("account_code")

        if account_id is None and account_code is None:
            raise ValueError("Each journal line must include account_id or account_code")

        if account_id is None:
            account = _get_account_by_code(db, account_code)
            account_id = account.id

        prepared_lines.append(
            JournalLine(
                account_id=account_id,
                debit=debit,
                credit=credit,
                memo=line.get("memo"),
                customer_id=line.get("customer_id"),
                vendor_id=line.get("vendor_id"),
                sale_id=line.get("sale_id"),
                purchase_id=line.get("purchase_id"),
                return_id=line.get("return_id"),
            )
        )

        debit_total += debit
        credit_total += credit

    if round(debit_total - credit_total, 2) != 0:
        raise ValueError("Journal entry is not balanced")

    entry = JournalEntry(
        entry_date=entry_date or datetime.utcnow(),
        description=description,
        source_type=source_type,
        source_id=source_id,
        created_by=created_by,
        lines=prepared_lines,
    )
    db.add(entry)
    db.flush()
    return entry


def post_sale_entry(db: Session, sale, payment_method: Optional[str], created_by: Optional[int]) -> JournalEntry:
    ensure_system_accounts(db)
    paid_amount = max(0.0, sale.total - sale.amount_due)
    lines = []

    if paid_amount > 0:
        lines.append({
            "account_code": get_payment_account_code(payment_method),
            "debit": paid_amount,
            "credit": 0.0,
            "sale_id": sale.id,
            "customer_id": sale.customer_ref_id,
        })

    if sale.amount_due > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_RECEIVABLE"]["code"],
            "debit": sale.amount_due,
            "credit": 0.0,
            "sale_id": sale.id,
            "customer_id": sale.customer_ref_id,
        })

    lines.append({
        "account_code": SYSTEM_ACCOUNTS["SALES_REVENUE"]["code"],
        "debit": 0.0,
        "credit": sale.total,
        "sale_id": sale.id,
        "customer_id": sale.customer_ref_id,
    })

    return create_journal_entry(
        db=db,
        description=f"Sale #{sale.id}",
        lines=lines,
        source_type="sale",
        source_id=sale.id,
        created_by=created_by,
        entry_date=sale.created_at,
    )


def post_purchase_entry(
    db: Session,
    purchase,
    amount_paid: float,
    created_by: Optional[int],
    prepaid_used: float = 0.0,
) -> JournalEntry:
    ensure_system_accounts(db)
    cash_paid = max(0.0, float(amount_paid or 0.0))
    prepaid_applied = max(0.0, float(prepaid_used or 0.0))
    purchase_total = max(0.0, float(purchase.total_amount or 0.0))

    # Existing prepaid credit settles part of the purchase first.
    payable_after_prepaid = max(0.0, purchase_total - prepaid_applied)
    cash_applied_to_purchase = min(cash_paid, payable_after_prepaid)
    cash_overpaid_to_advance = max(0.0, cash_paid - cash_applied_to_purchase)
    amount_due = max(0.0, payable_after_prepaid - cash_applied_to_purchase)

    lines = [
        {
            "account_code": SYSTEM_ACCOUNTS["INVENTORY"]["code"],
            "debit": purchase.total_amount,
            "credit": 0.0,
            "purchase_id": purchase.id,
            "vendor_id": purchase.vendor_id,
        }
    ]

    if cash_paid > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["CASH"]["code"],
            "debit": 0.0,
            "credit": cash_paid,
            "purchase_id": purchase.id,
            "vendor_id": purchase.vendor_id,
        })

    if prepaid_applied > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["VENDOR_ADVANCES"]["code"],
            "debit": 0.0,
            "credit": prepaid_applied,
            "purchase_id": purchase.id,
            "vendor_id": purchase.vendor_id,
        })

    if amount_due > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_PAYABLE"]["code"],
            "debit": 0.0,
            "credit": amount_due,
            "purchase_id": purchase.id,
            "vendor_id": purchase.vendor_id,
        })

    if cash_overpaid_to_advance > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["VENDOR_ADVANCES"]["code"],
            "debit": cash_overpaid_to_advance,
            "credit": 0.0,
            "purchase_id": purchase.id,
            "vendor_id": purchase.vendor_id,
        })

    return create_journal_entry(
        db=db,
        description=f"Purchase #{purchase.id}",
        lines=lines,
        source_type="purchase",
        source_id=purchase.id,
        created_by=created_by,
        entry_date=purchase.created_at,
    )


def post_purchase_payment_delta(
    db: Session,
    purchase,
    delta_amount: float,
    created_by: Optional[int],
) -> Optional[JournalEntry]:
    if delta_amount == 0:
        return None

    ensure_system_accounts(db)
    if delta_amount > 0:
        lines = [
            {
                "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_PAYABLE"]["code"],
                "debit": delta_amount,
                "credit": 0.0,
                "purchase_id": purchase.id,
                "vendor_id": purchase.vendor_id,
            },
            {
                "account_code": SYSTEM_ACCOUNTS["CASH"]["code"],
                "debit": 0.0,
                "credit": delta_amount,
                "purchase_id": purchase.id,
                "vendor_id": purchase.vendor_id,
            },
        ]
        description = f"Purchase payment update #{purchase.id}"
    else:
        delta = abs(delta_amount)
        lines = [
            {
                "account_code": SYSTEM_ACCOUNTS["CASH"]["code"],
                "debit": delta,
                "credit": 0.0,
                "purchase_id": purchase.id,
                "vendor_id": purchase.vendor_id,
            },
            {
                "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_PAYABLE"]["code"],
                "debit": 0.0,
                "credit": delta,
                "purchase_id": purchase.id,
                "vendor_id": purchase.vendor_id,
            },
        ]
        description = f"Purchase payment reversal #{purchase.id}"

    return create_journal_entry(
        db=db,
        description=description,
        lines=lines,
        source_type="purchase_payment",
        source_id=purchase.id,
        created_by=created_by,
        entry_date=datetime.utcnow(),
    )


def post_return_entry(
    db: Session,
    return_record,
    refund_amount: float,
    ar_reduction: float,
    cash_refund: float,
    created_by: Optional[int],
) -> Optional[JournalEntry]:
    if refund_amount <= 0:
        return None

    ensure_system_accounts(db)

    # Get customer_id from the sale if available
    customer_id = None
    if return_record.sale_id:
        from app.models.sale import Sale
        sale = db.query(Sale).filter(Sale.id == return_record.sale_id).first()
        if sale:
            customer_id = sale.customer_ref_id

    lines = [
        {
            "account_code": SYSTEM_ACCOUNTS["SALES_RETURNS"]["code"],
            "debit": refund_amount,
            "credit": 0.0,
            "return_id": return_record.id,
            "sale_id": return_record.sale_id,
            "customer_id": customer_id,
        }
    ]

    if ar_reduction > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_RECEIVABLE"]["code"],
            "debit": 0.0,
            "credit": ar_reduction,
            "return_id": return_record.id,
            "sale_id": return_record.sale_id,
            "customer_id": customer_id,
        })

    if cash_refund > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["CASH"]["code"],
            "debit": 0.0,
            "credit": cash_refund,
            "return_id": return_record.id,
            "sale_id": return_record.sale_id,
            "customer_id": customer_id,
        })

    return create_journal_entry(
        db=db,
        description=f"Return #{return_record.id}",
        lines=lines,
        source_type="return",
        source_id=return_record.id,
        created_by=created_by,
        entry_date=return_record.created_at,
    )


def post_customer_payment(
    db: Session,
    customer_id: int,
    amount: float,
    payment_method: Optional[str],
    created_by: Optional[int],
) -> JournalEntry:
    ensure_system_accounts(db)
    lines = [
        {
            "account_code": get_payment_account_code(payment_method),
            "debit": amount,
            "credit": 0.0,
            "customer_id": customer_id,
        },
        {
            "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_RECEIVABLE"]["code"],
            "debit": 0.0,
            "credit": amount,
            "customer_id": customer_id,
        },
    ]

    return create_journal_entry(
        db=db,
        description=f"Customer payment #{customer_id}",
        lines=lines,
        source_type="customer_payment",
        source_id=customer_id,
        created_by=created_by,
        entry_date=datetime.utcnow(),
    )


def post_customer_advance(
    db: Session,
    customer_id: int,
    amount: float,
    payment_method: Optional[str],
    created_by: Optional[int],
) -> JournalEntry:
    ensure_system_accounts(db)
    lines = [
        {
            "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_RECEIVABLE"]["code"],
            "debit": amount,
            "credit": 0.0,
            "customer_id": customer_id,
        },
        {
            "account_code": get_payment_account_code(payment_method),
            "debit": 0.0,
            "credit": amount,
            "customer_id": customer_id,
        },
    ]

    return create_journal_entry(
        db=db,
        description=f"Customer advance #{customer_id}",
        lines=lines,
        source_type="customer_advance",
        source_id=customer_id,
        created_by=created_by,
        entry_date=datetime.utcnow(),
    )


def post_vendor_payment(
    db: Session,
    vendor_id: int,
    payment_amount: float,
    applied_amount: float,
    prepaid_used: float,
    new_prepaid_from_cash: float,
    created_by: Optional[int],
) -> List[JournalEntry]:
    ensure_system_accounts(db)
    entries: List[JournalEntry] = []

    cash_applied = min(payment_amount, applied_amount)

    if applied_amount > 0:
        lines = [
            {
                "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_PAYABLE"]["code"],
                "debit": applied_amount,
                "credit": 0.0,
                "vendor_id": vendor_id,
            }
        ]

        if cash_applied > 0:
            lines.append({
                "account_code": SYSTEM_ACCOUNTS["CASH"]["code"],
                "debit": 0.0,
                "credit": cash_applied,
                "vendor_id": vendor_id,
            })

        if prepaid_used > 0:
            lines.append({
                "account_code": SYSTEM_ACCOUNTS["VENDOR_ADVANCES"]["code"],
                "debit": 0.0,
                "credit": prepaid_used,
                "vendor_id": vendor_id,
            })

        entries.append(
            create_journal_entry(
                db=db,
                description=f"Vendor payment settlement #{vendor_id}",
                lines=lines,
                source_type="vendor_payment",
                source_id=vendor_id,
                created_by=created_by,
                entry_date=datetime.utcnow(),
            )
        )

    if new_prepaid_from_cash > 0:
        lines = [
            {
                "account_code": SYSTEM_ACCOUNTS["VENDOR_ADVANCES"]["code"],
                "debit": new_prepaid_from_cash,
                "credit": 0.0,
                "vendor_id": vendor_id,
            },
            {
                "account_code": SYSTEM_ACCOUNTS["CASH"]["code"],
                "debit": 0.0,
                "credit": new_prepaid_from_cash,
                "vendor_id": vendor_id,
            },
        ]
        entries.append(
            create_journal_entry(
                db=db,
                description=f"Vendor advance #{vendor_id}",
                lines=lines,
                source_type="vendor_advance",
                source_id=vendor_id,
                created_by=created_by,
                entry_date=datetime.utcnow(),
            )
        )

    return entries


def post_vendor_settlement(
    db: Session,
    vendor_id: int,
    payable_balance: float,
    advance_balance: float,
    reason: str,
    created_by: Optional[int],
) -> Optional[JournalEntry]:
    """Post a single adjustment entry that settles vendor payable/advance balances to zero."""
    ensure_system_accounts(db)

    payable = max(0.0, float(payable_balance or 0.0))
    advance = max(0.0, float(advance_balance or 0.0))
    if payable == 0 and advance == 0:
        return None

    lines = []
    if payable > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_PAYABLE"]["code"],
            "debit": payable,
            "credit": 0.0,
            "vendor_id": vendor_id,
        })
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["BALANCE_ADJUSTMENTS"]["code"],
            "debit": 0.0,
            "credit": payable,
            "vendor_id": vendor_id,
        })

    if advance > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["BALANCE_ADJUSTMENTS"]["code"],
            "debit": advance,
            "credit": 0.0,
            "vendor_id": vendor_id,
        })
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["VENDOR_ADVANCES"]["code"],
            "debit": 0.0,
            "credit": advance,
            "vendor_id": vendor_id,
        })

    return create_journal_entry(
        db=db,
        description=f"Vendor settlement #{vendor_id}: {reason}",
        lines=lines,
        source_type="vendor_settlement",
        source_id=vendor_id,
        created_by=created_by,
        entry_date=datetime.utcnow(),
    )
