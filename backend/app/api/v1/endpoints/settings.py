import io
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.models.settings import StoreSettings
from app.models.user import User
from app.schemas.settings import (
    LicenseStatusResponse,
    StoreSettingsBase,
    StoreSettingsResponse,
    StoreSettingsUpdate,
    WhatsAppReportSettingsResponse,
    WhatsAppReportSettingsUpdate,
)
from app.services.license import get_active_license_status

router = APIRouter()

MAX_LOGO_BYTES = 2 * 1024 * 1024
MAX_LOGO_PIXELS = 16_000_000
ALLOWED_LOGO_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _branding_dir() -> Path:
    path = Path(settings.DATA_DIR) / "branding"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _store_response(row: StoreSettings) -> StoreSettingsResponse:
    values = {
        field: getattr(row, field)
        for field in StoreSettingsBase.model_fields
    }
    return StoreSettingsResponse(
        id=row.id,
        logo_url="/settings/logo" if row.store_logo_filename else None,
        **values,
    )


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
    return _store_response(get_or_create_store_settings(db))


@router.get("/license-status", response_model=LicenseStatusResponse)
def get_license_status(
    _current_user: User = Depends(deps.get_current_active_admin),
):
    """Return the active license expiry summary without exposing license secrets."""
    return get_active_license_status()


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
    return _store_response(row)


@router.get("/logo")
def get_store_logo(db: Session = Depends(deps.get_db)):
    """Return the optional business logo used on customer-facing documents."""
    row = get_or_create_store_settings(db)
    if not row.store_logo_filename:
        raise HTTPException(status_code=404, detail="Business logo is not configured")
    logo_path = _branding_dir() / Path(row.store_logo_filename).name
    if not logo_path.is_file():
        raise HTTPException(status_code=404, detail="Business logo file is missing")
    return FileResponse(logo_path, media_type="image/png")


@router.put("/logo", response_model=StoreSettingsResponse)
async def upload_store_logo(
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    """Validate and store a business logo as a normalized PNG. Admin only."""
    if file.content_type not in ALLOWED_LOGO_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail="Logo must be a PNG, JPEG, or WebP image")
    contents = await file.read(MAX_LOGO_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=422, detail="Logo file is empty")
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="Logo must be 2 MB or smaller")

    temporary_path = _branding_dir() / "business-logo.upload.png"
    try:
        with Image.open(io.BytesIO(contents)) as source:
            if source.width * source.height > MAX_LOGO_PIXELS:
                raise ValueError("Logo dimensions are too large")
            source.verify()
        with Image.open(io.BytesIO(contents)) as source:
            logo = source.convert("RGBA")
            logo.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
            logo_path = _branding_dir() / "business-logo.png"
            logo.save(temporary_path, "PNG", optimize=True)
            temporary_path.replace(logo_path)
    except (UnidentifiedImageError, OSError, ValueError):
        if temporary_path.is_file():
            temporary_path.unlink()
        raise HTTPException(status_code=422, detail="Logo file is not a valid image")

    row = get_or_create_store_settings(db)
    row.store_logo_filename = "business-logo.png"
    db.commit()
    db.refresh(row)
    return _store_response(row)


@router.delete("/logo", response_model=StoreSettingsResponse)
def delete_store_logo(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    """Remove the configured business logo. Admin only."""
    row = get_or_create_store_settings(db)
    if row.store_logo_filename:
        logo_path = _branding_dir() / Path(row.store_logo_filename).name
        if logo_path.is_file():
            logo_path.unlink()
    row.store_logo_filename = None
    db.commit()
    db.refresh(row)
    return _store_response(row)


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
