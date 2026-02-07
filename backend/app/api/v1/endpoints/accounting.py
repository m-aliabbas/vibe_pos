from typing import Any, List, Optional
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.api import deps
from app.models.accounting import Account, AccountType, JournalEntry, JournalLine
from app.schemas import accounting as accounting_schema
from app.services import accounting as accounting_service

router = APIRouter()


@router.get("/accounts", response_model=List[accounting_schema.Account])
def list_accounts(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
) -> Any:
    accounting_service.ensure_system_accounts(db)
    return db.query(Account).order_by(Account.code.asc()).all()


@router.post("/accounts", response_model=accounting_schema.Account)
def create_account(
    *,
    db: Session = Depends(deps.get_db),
    account_in: accounting_schema.AccountCreate,
    current_user = Depends(deps.get_current_user),
) -> Any:
    if account_in.type not in {t.value for t in AccountType}:
        raise HTTPException(status_code=400, detail="Invalid account type")

    existing = db.query(Account).filter(
        (Account.code == account_in.code) | (Account.name == account_in.name)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account code or name already exists")

    account = Account(
        code=account_in.code,
        name=account_in.name,
        type=account_in.type,
        is_system=False,
        is_active=account_in.is_active,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.get("/journal", response_model=List[accounting_schema.JournalEntry])
def list_journal_entries(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    source_type: Optional[str] = Query(None),
    current_user = Depends(deps.get_current_user),
) -> Any:
    query = db.query(JournalEntry).options(joinedload(JournalEntry.lines).joinedload(JournalLine.account))

    if start_date:
        query = query.filter(func.date(JournalEntry.entry_date) >= start_date)
    if end_date:
        query = query.filter(func.date(JournalEntry.entry_date) <= end_date)
    if source_type:
        query = query.filter(JournalEntry.source_type == source_type)

    return query.order_by(JournalEntry.entry_date.desc()).offset(skip).limit(limit).all()


@router.post("/journal", response_model=accounting_schema.JournalEntry)
def create_manual_entry(
    *,
    db: Session = Depends(deps.get_db),
    entry_in: accounting_schema.JournalEntryCreate,
    current_user = Depends(deps.get_current_user),
) -> Any:
    try:
        entry = accounting_service.create_journal_entry(
            db=db,
            description=entry_in.description,
            lines=[line.dict() for line in entry_in.lines],
            source_type=entry_in.source_type,
            source_id=entry_in.source_id,
            created_by=current_user.id,
            entry_date=entry_in.entry_date or datetime.utcnow(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    db.commit()
    db.refresh(entry)
    return entry


@router.get("/trial-balance", response_model=accounting_schema.TrialBalanceReport)
def trial_balance(
    db: Session = Depends(deps.get_db),
    as_of: Optional[date] = Query(None),
    current_user = Depends(deps.get_current_user),
) -> Any:
    accounting_service.ensure_system_accounts(db)

    query = db.query(
        Account.id,
        Account.code,
        Account.name,
        Account.type,
        func.coalesce(func.sum(JournalLine.debit), 0.0).label("debit"),
        func.coalesce(func.sum(JournalLine.credit), 0.0).label("credit"),
    ).join(JournalLine, JournalLine.account_id == Account.id, isouter=True)

    if as_of:
        query = query.join(JournalEntry, JournalEntry.id == JournalLine.entry_id, isouter=True)
        query = query.filter(func.date(JournalEntry.entry_date) <= as_of)

    query = query.group_by(Account.id, Account.code, Account.name, Account.type).order_by(Account.code.asc())

    rows = query.all()

    lines = []
    total_debits = 0.0
    total_credits = 0.0

    for row in rows:
        balance = (row.debit or 0.0) - (row.credit or 0.0)
        total_debits += row.debit or 0.0
        total_credits += row.credit or 0.0
        lines.append(
            accounting_schema.TrialBalanceLine(
                account_id=row.id,
                code=row.code,
                name=row.name,
                account_type=row.type,
                debit=row.debit or 0.0,
                credit=row.credit or 0.0,
                balance=balance,
            )
        )

    return accounting_schema.TrialBalanceReport(
        as_of=as_of,
        total_debits=total_debits,
        total_credits=total_credits,
        lines=lines,
    )
