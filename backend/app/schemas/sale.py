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
    quantity: float
    variation_id: Optional[int] = None  # Optional variation
    unit: str = "piece"  # Unit of sale (piece, dozen, kg, etc.)
    item_discount: float = 0.0 # Discount on this specific item
    unit_price: Optional[float] = None  # Optional override per unit

class SaleItemCreate(SaleItemBase):
    pass

class SaleItem(SaleItemBase):
    id: int
    sale_id: int
    unit_price: float
    total_price: float
    product_name: Optional[str] = None
    variation_attributes: Optional[dict] = None
    
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
    delivery_charges: Optional[float] = 0.0
    amount_paid: Optional[float] = None  # If None, assumes full payment
    # Customer linking - can provide customer_ref_id or phone to link/create customer
    customer_ref_id: Optional[int] = None  # Direct link to customer by internal ID
    customer_id: Optional[str] = None  # Link by readable customer_id (e.g., CUST001)


class SaleUpdate(SaleBase):
    items: List[SaleItemCreate]
    discount: Optional[float] = 0.0
    tax: Optional[float] = 0.0
    delivery_charges: Optional[float] = 0.0
    amount_paid: Optional[float] = None
    customer_ref_id: Optional[int] = None
    customer_id: Optional[str] = None

class Sale(SaleBase):
    id: int
    user_id: int
    subtotal: float
    discount: float = 0.0
    tax: float = 0.0
    delivery_charges: float = 0.0
    total: float
    amount_paid: float = 0.0
    amount_due: float = 0.0
    change_amount: float = 0.0
    created_at: datetime
    items: List[SaleItem] = []
    # Customer linking fields
    customer_ref_id: Optional[int] = None
    is_walkin: bool = True

    class Config:
        from_attributes = True

# Stats Schema
class SaleStats(BaseModel):
    total_sales: int
    total_revenue: float
    average_sale: float
