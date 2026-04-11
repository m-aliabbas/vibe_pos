from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.hold_purchase import HoldPurchase
from app.models.user import User
from app.schemas import hold_purchase as hold_purchase_schema

router = APIRouter()


@router.get("/", response_model=List[hold_purchase_schema.HoldPurchase])
def list_hold_purchases(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    return (
        db.query(HoldPurchase)
        .filter(HoldPurchase.user_id == current_user.id)
        .order_by(HoldPurchase.created_at.desc())
        .all()
    )


@router.post("/", response_model=hold_purchase_schema.HoldPurchase)
def create_hold_purchase(
    *,
    db: Session = Depends(deps.get_db),
    hold_in: hold_purchase_schema.HoldPurchaseCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    hold = HoldPurchase(
        user_id=current_user.id,
        label=hold_in.label,
        payload=hold_in.payload,
    )
    db.add(hold)
    db.commit()
    db.refresh(hold)
    return hold


@router.delete("/{hold_id}")
def delete_hold_purchase(
    *,
    db: Session = Depends(deps.get_db),
    hold_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    hold = db.query(HoldPurchase).filter(HoldPurchase.id == hold_id).first()
    if not hold:
        raise HTTPException(status_code=404, detail="Hold purchase not found")
    if hold.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(hold)
    db.commit()
    return {"message": "Hold purchase deleted"}