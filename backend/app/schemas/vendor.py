from typing import Optional
from pydantic import BaseModel

class VendorBase(BaseModel):
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class VendorCreate(VendorBase):
    opening_balance: Optional[float] = 0.0

class VendorUpdate(VendorBase):
    opening_balance: Optional[float] = None

class VendorPayment(BaseModel):
    amount: float

class Vendor(VendorBase):
    id: int
    opening_balance: float
    prepaid_credit: float = 0.0

    class Config:
        from_attributes = True
