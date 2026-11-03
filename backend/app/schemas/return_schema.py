from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ReturnItemCreate(BaseModel):
    sale_item_id: Optional[int] = None  # Optional now
    purchase_item_id: Optional[int] = None  # For purchase/vendor returns
    product_id: Optional[int] = None  # Direct product return
    quantity_returned: Optional[float] = None  # Decimal allowed (e.g. 0.25 kg)
    quantity: Optional[float] = None  # Alternative field name
    unit_cost: Optional[float] = None  # For purchase/vendor returns
    restocked: Optional[bool] = True  # Default: add back to inventory
    add_to_inventory: Optional[bool] = True  # Alternative field name
    remove_from_inventory: Optional[bool] = None  # For purchase/vendor returns

class ReturnCreate(BaseModel):
    sale_id: Optional[int] = None  # Optional now
    purchase_id: Optional[int] = None  # For purchase/vendor returns
    return_type: Optional[str] = "sale"  # sale | direct | purchase
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
    quantity_returned: float
    unit: str
    unit_price: float
    total_refund: float
    restocked: bool
    
    class Config:
        from_attributes = True

class ReturnResponse(BaseModel):
    id: int
    sale_id: Optional[int] = None
    purchase_id: Optional[int] = None
    return_type: Optional[str] = "sale"
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
