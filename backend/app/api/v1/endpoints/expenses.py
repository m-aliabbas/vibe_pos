from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.models.accounting import Account, AccountType
from app.models.expense import Expense
from app.models.user import User
from app.schemas import expense as expense_schema
from app.services import accounting as accounting_service

router = APIRouter()


@router.get("", response_model=List[expense_schema.ExpenseRead])
def list_expenses(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    query = db.query(Expense).options(joinedload(Expense.account))
    if start_date:
        query = query.filter(Expense.expense_date >= start_date)
    if end_date:
        query = query.filter(Expense.expense_date <= end_date)
    return query.order_by(Expense.expense_date.desc(), Expense.id.desc()).all()


@router.post("", response_model=expense_schema.ExpenseRead)
def create_expense(
    expense_in: expense_schema.ExpenseCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    account = db.query(Account).filter(
        Account.id == expense_in.account_id,
        Account.type == AccountType.EXPENSE.value,
        Account.is_active.is_(True),
    ).first()
    if not account:
        raise HTTPException(status_code=400, detail="Choose an active expense account")
    if expense_in.payment_method not in {"cash", "bank"}:
        raise HTTPException(status_code=400, detail="Payment method must be cash or bank")

    expense = Expense(
        expense_date=expense_in.expense_date,
        account_id=account.id,
        amount=round(expense_in.amount, 2),
        description=expense_in.description.strip(),
        payment_method=expense_in.payment_method,
        created_by=current_user.id,
    )
    db.add(expense)
    db.flush()
    try:
        entry = accounting_service.create_journal_entry(
            db=db,
            description=f"Expense #{expense.id}: {expense.description}",
            source_type="expense",
            source_id=expense.id,
            created_by=current_user.id,
            entry_date=expense.expense_date,
            lines=[
                {"account_id": account.id, "debit": expense.amount, "credit": 0.0, "memo": expense.description},
                {"account_code": accounting_service.get_payment_account_code(expense.payment_method), "debit": 0.0, "credit": expense.amount, "memo": expense.description},
            ],
        )
        expense.journal_entry_id = entry.id
        db.commit()
        db.refresh(expense)
        return expense
    except (ValueError, TypeError) as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.journal_entry_id:
        from app.models.accounting import JournalEntry
        journal_entry = db.query(JournalEntry).filter(JournalEntry.id == expense.journal_entry_id).first()
        if journal_entry:
            db.delete(journal_entry)
    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted successfully"}
