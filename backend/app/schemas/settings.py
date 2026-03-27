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
