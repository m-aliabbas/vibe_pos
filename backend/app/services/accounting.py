from datetime import datetime
from typing import Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models.accounting import Account, AccountType, JournalEntry, JournalLine


SYSTEM_ACCOUNTS: Dict[str, Dict[str, str]] = {
    "CASH": {"code": "1000", "name": "Cash", "type": AccountType.ASSET},
    "BANK": {"code": "1010", "name": "Bank", "type": AccountType.ASSET},
    "ACCOUNTS_RECEIVABLE": {"code": "1100", "name": "Accounts Receivable", "type": AccountType.ASSET},
    "INVENTORY": {"code": "1200", "name": "Inventory", "type": AccountType.ASSET},
    "VENDOR_ADVANCES": {"code": "1210", "name": "Vendor Advances", "type": AccountType.ASSET},
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

    return {
        acc.code: acc
        for acc in db.query(Account).filter(Account.code.in_([a["code"] for a in SYSTEM_ACCOUNTS.values()])).all()
    }


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


def post_purchase_entry(db: Session, purchase, amount_paid: float, created_by: Optional[int]) -> JournalEntry:
    ensure_system_accounts(db)
    amount_due = max(0.0, purchase.total_amount - amount_paid)
    lines = [
        {
            "account_code": SYSTEM_ACCOUNTS["INVENTORY"]["code"],
            "debit": purchase.total_amount,
            "credit": 0.0,
            "purchase_id": purchase.id,
            "vendor_id": purchase.vendor_id,
        }
    ]

    if amount_paid > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["CASH"]["code"],
            "debit": 0.0,
            "credit": amount_paid,
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

    lines = [
        {
            "account_code": SYSTEM_ACCOUNTS["SALES_RETURNS"]["code"],
            "debit": refund_amount,
            "credit": 0.0,
            "return_id": return_record.id,
            "sale_id": return_record.sale_id,
        }
    ]

    if ar_reduction > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["ACCOUNTS_RECEIVABLE"]["code"],
            "debit": 0.0,
            "credit": ar_reduction,
            "return_id": return_record.id,
            "sale_id": return_record.sale_id,
        })

    if cash_refund > 0:
        lines.append({
            "account_code": SYSTEM_ACCOUNTS["CASH"]["code"],
            "debit": 0.0,
            "credit": cash_refund,
            "return_id": return_record.id,
            "sale_id": return_record.sale_id,
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
