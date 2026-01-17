from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from enum import Enum

class PaymentMethod(str, Enum):
    CASH = "cash"
    CARD = "card"
    MOBILE = "mobile"
    OTHER = "other"

# Sale Item Schemas
class SaleItemBase(BaseModel):
    product_id: int
    quantity: int
    variation_id: Optional[int] = None  # Optional variation
    unit: str = "piece"  # Unit of sale (piece, dozen, kg, etc.)

class SaleItemCreate(SaleItemBase):
    pass

class SaleItem(SaleItemBase):
    id: int
    sale_id: int
    unit_price: float
    total_price: float
    
    class Config:
        from_attributes = True

# Sale Schemas
class SaleBase(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    payment_method: PaymentMethod = PaymentMethod.CASH

class SaleCreate(SaleBase):
    items: List[SaleItemCreate]
    discount: Optional[float] = 0.0
    tax: Optional[float] = 0.0
    amount_paid: Optional[float] = None  # If None, assumes full payment

class Sale(SaleBase):
    id: int
    user_id: int
    subtotal: float
    discount: float = 0.0
    tax: float = 0.0
    total: float
    amount_paid: float = 0.0
    amount_due: float = 0.0
    change_amount: float = 0.0
    created_at: datetime
    items: List[SaleItem] = []

    class Config:
        from_attributes = True

# Stats Schema
class SaleStats(BaseModel):
    total_sales: int
    total_revenue: float
    average_sale: float
