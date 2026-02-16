from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from enum import Enum

class PurchaseStatus(str, Enum):
    PAID = "paid"
    PARTIAL = "partial"
    UNPAID = "unpaid"

class PurchaseItemBase(BaseModel):
    product_id: int
    quantity: int
    unit_cost: float
    expiry_date: Optional[datetime] = None
    variation_id: Optional[int] = None  # For products with variations

class PurchaseItemCreate(PurchaseItemBase):
    selling_price: Optional[float] = None
    update_selling_price: Optional[bool] = False

class PurchaseItem(PurchaseItemBase):
    id: int
    purchase_id: int
    total_cost: float
    
    class Config:
        from_attributes = True

class PurchaseBase(BaseModel):
    vendor_id: int
    amount_paid: float = 0.0

class PurchaseCreate(PurchaseBase):
    items: List[PurchaseItemCreate]


class PurchaseUpdate(PurchaseBase):
    items: List[PurchaseItemCreate]

class PurchasePaymentUpdate(BaseModel):
    amount_paid: float

class Purchase(PurchaseBase):
    id: int
    created_at: datetime
    total_amount: float
    status: PurchaseStatus
    items: List[PurchaseItem] = []

    class Config:
        from_attributes = True
