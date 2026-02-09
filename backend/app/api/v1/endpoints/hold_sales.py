from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.hold_sale import HoldSale
from app.schemas import hold_sale as hold_sale_schema
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[hold_sale_schema.HoldSale])
def list_hold_sales(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    return (
        db.query(HoldSale)
        .filter(HoldSale.user_id == current_user.id)
        .order_by(HoldSale.created_at.desc())
        .all()
    )


@router.post("/", response_model=hold_sale_schema.HoldSale)
def create_hold_sale(
    *,
    db: Session = Depends(deps.get_db),
    hold_in: hold_sale_schema.HoldSaleCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    hold = HoldSale(
        user_id=current_user.id,
        label=hold_in.label,
        payload=hold_in.payload,
    )
    db.add(hold)
    db.commit()
    db.refresh(hold)
    return hold


@router.delete("/{hold_id}")
def delete_hold_sale(
    *,
    db: Session = Depends(deps.get_db),
    hold_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    hold = db.query(HoldSale).filter(HoldSale.id == hold_id).first()
    if not hold:
        raise HTTPException(status_code=404, detail="Hold sale not found")
    if hold.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(hold)
    db.commit()
    return {"message": "Hold sale deleted"}
