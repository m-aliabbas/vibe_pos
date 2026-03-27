from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.models.settings import StoreSettings
from app.models.user import User
from app.schemas.settings import StoreSettingsResponse, StoreSettingsUpdate

router = APIRouter()


def get_or_create_store_settings(db: Session) -> StoreSettings:
    """Return existing store settings row or create the default singleton."""
    row = db.query(StoreSettings).filter(StoreSettings.id == 1).first()
    if not row:
        row = StoreSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/store", response_model=StoreSettingsResponse)
def get_store_settings(db: Session = Depends(deps.get_db)):
    """Return the current store information (public — used by receipts/invoices)."""
    return get_or_create_store_settings(db)


@router.put("/store", response_model=StoreSettingsResponse)
def update_store_settings(
    payload: StoreSettingsUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    """Update store information. Admin only."""
    row = get_or_create_store_settings(db)
    for field, value in payload.model_dump(exclude_unset=False).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row
