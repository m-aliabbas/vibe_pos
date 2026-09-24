from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.api import deps
from app.api.v1.endpoints.settings import get_or_create_store_settings
from app.core.timezone import now_pkt
from app.models.cash_register import CashRegisterSession, CashRegisterStatus
from app.models.sale import Sale
from app.models.user import User
from app.schemas.cash_register import (
    CashRegisterClose,
    CashRegisterOpen,
    CashRegisterSessionResponse,
    CashRegisterStatusResponse,
)

router = APIRouter()


def _to_response(session: CashRegisterSession) -> CashRegisterSessionResponse:
    return CashRegisterSessionResponse(
        id=session.id,
        user_id=session.user_id,
        username=session.user.username if session.user else None,
        opening_cash=session.opening_cash,
        opened_at=session.opened_at,
        closing_cash=session.closing_cash,
        expected_cash=session.expected_cash,
        difference=session.difference,
        closed_at=session.closed_at,
        status=session.status,
        notes=session.notes,
    )


def _get_open_session(db: Session, user_id: int) -> Optional[CashRegisterSession]:
    return (
        db.query(CashRegisterSession)
        .filter(CashRegisterSession.user_id == user_id, CashRegisterSession.status == CashRegisterStatus.OPEN)
        .order_by(CashRegisterSession.opened_at.desc())
        .first()
    )


@router.get("/status", response_model=CashRegisterStatusResponse)
def get_cash_register_status(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Return whether the cash-drawer feature is on and the caller's open session, if any."""
    store_settings = get_or_create_store_settings(db)
    session = _get_open_session(db, current_user.id)
    return CashRegisterStatusResponse(
        enabled=bool(store_settings.cash_register_enabled),
        session=_to_response(session) if session else None,
    )


@router.post("/open", response_model=CashRegisterSessionResponse)
def open_cash_register(
    payload: CashRegisterOpen,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Start a cash-drawer session by declaring the starting cash amount."""
    store_settings = get_or_create_store_settings(db)
    if not store_settings.cash_register_enabled:
        raise HTTPException(status_code=400, detail="Cash drawer tracking is not enabled")

    if _get_open_session(db, current_user.id):
        raise HTTPException(status_code=400, detail="A cash drawer session is already open")

    session = CashRegisterSession(
        user_id=current_user.id,
        opening_cash=payload.opening_cash,
        opened_at=now_pkt(),
        status=CashRegisterStatus.OPEN,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _to_response(session)


@router.post("/close", response_model=CashRegisterSessionResponse)
def close_cash_register(
    payload: CashRegisterClose,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Close the caller's open session, recording counted cash vs. expected cash."""
    session = _get_open_session(db, current_user.id)
    if not session:
        raise HTTPException(status_code=400, detail="No open cash drawer session found")

    closed_at = now_pkt()
    # Net cash added to the drawer from this user's cash sales during the session
    # (amount actually tendered minus change handed back).
    cash_sales = (
        db.query(Sale)
        .filter(
            and_(
                Sale.user_id == current_user.id,
                Sale.payment_method == "cash",
                Sale.created_at >= session.opened_at,
                Sale.created_at <= closed_at,
            )
        )
        .all()
    )
    net_cash_from_sales = sum(
        float(sale.amount_paid or 0) - float(sale.change_amount or 0) for sale in cash_sales
    )
    expected_cash = float(session.opening_cash or 0) + net_cash_from_sales

    session.closing_cash = payload.closing_cash
    session.expected_cash = expected_cash
    session.difference = payload.closing_cash - expected_cash
    session.closed_at = closed_at
    session.status = CashRegisterStatus.CLOSED
    if payload.notes:
        session.notes = payload.notes

    db.commit()
    db.refresh(session)
    return _to_response(session)


@router.get("/open-sessions", response_model=List[CashRegisterSessionResponse])
def list_open_cash_sessions(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    """Admin: see every user's currently open cash drawer and how much cash they have."""
    sessions = (
        db.query(CashRegisterSession)
        .filter(CashRegisterSession.status == CashRegisterStatus.OPEN)
        .order_by(CashRegisterSession.opened_at.desc())
        .all()
    )
    return [_to_response(session) for session in sessions]


@router.get("/sessions", response_model=List[CashRegisterSessionResponse])
def list_cash_sessions(
    user_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    """Admin: cash drawer session history for audit/reporting."""
    query = db.query(CashRegisterSession)
    if user_id is not None:
        query = query.filter(CashRegisterSession.user_id == user_id)
    if start_date:
        try:
            query = query.filter(CashRegisterSession.opened_at >= datetime.fromisoformat(start_date))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format")
    if end_date:
        try:
            query = query.filter(CashRegisterSession.opened_at <= datetime.fromisoformat(end_date))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format")

    sessions = query.order_by(CashRegisterSession.opened_at.desc()).limit(limit).all()
    return [_to_response(session) for session in sessions]
