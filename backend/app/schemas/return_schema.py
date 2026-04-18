from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ReturnItemCreate(BaseModel):
    sale_item_id: Optional[int] = None  # Optional now
    product_id: Optional[int] = None  # Direct product return
    quantity_returned: int = None  # Renamed from quantity_returned for direct returns
    quantity: Optional[int] = None  # Alternative field name
    restocked: Optional[bool] = True  # Default: add back to inventory
    add_to_inventory: Optional[bool] = True  # Alternative field name

class ReturnCreate(BaseModel):
    sale_id: Optional[int] = None  # Optional now
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    reason: str  # "defective", "wrong_item", "customer_changed_mind", "damaged", "expired", "other"
    notes: Optional[str] = None
    items: List[ReturnItemCreate]
    refund_amount: Optional[float] = None  # If None, calculate from items
    # Settlement handling:
    # - auto: reduce due first, remaining paid in cash (legacy behavior)
    # - paid_to_customer: full cash refund
    # - added_to_account: full credit to customer account (prepaid/negative balance possible)
    settlement_mode: Optional[str] = "auto"

class ReturnItemResponse(BaseModel):
    id: int
    sale_item_id: int
    product_id: int
    product_name: Optional[str] = None
    variation_id: Optional[int] = None
    quantity_returned: int
    unit: str
    unit_price: float
    total_refund: float
    restocked: bool
    
    class Config:
        from_attributes = True

class ReturnResponse(BaseModel):
    id: int
    sale_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    processed_by: int
    processed_by_username: Optional[str] = None
    reason: str
    notes: Optional[str] = None
    status: str
    subtotal: float
    refund_amount: float
    created_at: datetime
    updated_at: datetime
    items: List[dict] = []  # Changed to dict for flexibility
    
    class Config:
        from_attributes = True

class ReturnStatusUpdate(BaseModel):
    status: str  # "approved" or "rejected"
    notes: Optional[str] = None
