import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.settings import StoreSettings
from app.models.user import User
from app.schemas.settings import (
    StoreSettingsResponse,
    StoreSettingsUpdate,
    WhatsAppReportSettingsResponse,
    WhatsAppReportSettingsUpdate,
)

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


def _normalize_whatsapp_number(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = "92" + digits[1:]
    elif len(digits) == 10 and digits.startswith("3"):
        digits = "92" + digits
    if digits and not 10 <= len(digits) <= 15:
        raise HTTPException(
            status_code=422,
            detail="Owner WhatsApp number must include a valid country code",
        )
    return digits


def _validate_report_time(value: str) -> str:
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value or ""):
        raise HTTPException(status_code=422, detail="Daily report time must use HH:MM")
    return value


@router.get("/whatsapp-reports", response_model=WhatsAppReportSettingsResponse)
def get_whatsapp_report_settings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    """Return private WhatsApp owner/report settings. Admin only."""
    row = get_or_create_store_settings(db)
    return WhatsAppReportSettingsResponse(
        owner_number=row.whatsapp_owner_number or "",
        daily_report_enabled=bool(row.whatsapp_daily_report_enabled),
        daily_report_time=row.whatsapp_daily_report_time or "09:00",
        last_daily_report_date=row.whatsapp_last_daily_report_date,
    )


@router.put("/whatsapp-reports", response_model=WhatsAppReportSettingsResponse)
def update_whatsapp_report_settings(
    payload: WhatsAppReportSettingsUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    """Configure the authorized owner and automatic previous-day report."""
    owner_number = _normalize_whatsapp_number(payload.owner_number)
    report_time = _validate_report_time(payload.daily_report_time)
    if payload.daily_report_enabled and not owner_number:
        raise HTTPException(
            status_code=422,
            detail="Set an owner WhatsApp number before enabling daily reports",
        )

    row = get_or_create_store_settings(db)
    if (row.whatsapp_owner_number or "") != owner_number:
        row.whatsapp_last_daily_report_date = None
    row.whatsapp_owner_number = owner_number
    row.whatsapp_daily_report_enabled = payload.daily_report_enabled
    row.whatsapp_daily_report_time = report_time
    db.commit()
    db.refresh(row)
    return WhatsAppReportSettingsResponse(
        owner_number=row.whatsapp_owner_number or "",
        daily_report_enabled=bool(row.whatsapp_daily_report_enabled),
        daily_report_time=row.whatsapp_daily_report_time or "09:00",
        last_daily_report_date=row.whatsapp_last_daily_report_date,
    )
