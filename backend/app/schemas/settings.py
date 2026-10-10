from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel


class StoreSettingsBase(BaseModel):
    store_name: Optional[str] = "My Store"
    store_address: Optional[str] = ""
    store_phone: Optional[str] = ""
    store_email: Optional[str] = ""
    store_city: Optional[str] = ""
    store_tax_id: Optional[str] = ""
    store_website: Optional[str] = ""
    cash_register_enabled: Optional[bool] = False
    default_print_format: Literal["compact", "professional", "mobile"] = "compact"
    default_whatsapp_format: Literal["compact", "professional", "mobile"] = "mobile"
    default_print_design: Literal["classic", "modern", "minimal"] = "classic"
    default_whatsapp_design: Literal["classic", "modern", "minimal"] = "modern"
    invoice_show_tax_id: bool = True
    invoice_show_cashier: bool = True
    invoice_show_sku: bool = False
    invoice_show_customer_balance: bool = True
    invoice_footer_message: str = "Thank you for your business!"
    invoice_terms: str = "Return and exchange accepted with invoice."


class StoreSettingsUpdate(StoreSettingsBase):
    pass


class StoreSettingsResponse(StoreSettingsBase):
    id: int
    logo_url: Optional[str] = None

    class Config:
        from_attributes = True


class LicenseStatusResponse(BaseModel):
    enforced: bool
    expires_at: Optional[datetime] = None
    days_remaining: Optional[int] = None


class WhatsAppReportSettingsUpdate(BaseModel):
    owner_number: str = ""
    daily_report_enabled: bool = False
    daily_report_time: str = "09:00"


class WhatsAppReportSettingsResponse(WhatsAppReportSettingsUpdate):
    last_daily_report_date: Optional[date] = None
