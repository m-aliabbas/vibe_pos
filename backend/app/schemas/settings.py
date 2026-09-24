from datetime import date
from typing import Optional
from pydantic import BaseModel


class StoreSettingsBase(BaseModel):
    store_name: Optional[str] = "My Store"
    store_address: Optional[str] = ""
    store_phone: Optional[str] = ""
    store_email: Optional[str] = ""
    store_city: Optional[str] = ""
    store_tax_id: Optional[str] = ""
    store_website: Optional[str] = ""


class StoreSettingsUpdate(StoreSettingsBase):
    pass


class StoreSettingsResponse(StoreSettingsBase):
    id: int

    class Config:
        from_attributes = True


class WhatsAppReportSettingsUpdate(BaseModel):
    owner_number: str = ""
    daily_report_enabled: bool = False
    daily_report_time: str = "09:00"


class WhatsAppReportSettingsResponse(WhatsAppReportSettingsUpdate):
    last_daily_report_date: Optional[date] = None
