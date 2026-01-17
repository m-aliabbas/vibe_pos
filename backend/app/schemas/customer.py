from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class CustomerNoteBase(BaseModel):
    note_type: str = "general"  # general, credit_history, special_instruction, reminder, preference
    note_text: str


class CustomerNoteCreate(CustomerNoteBase):
    pass


class CustomerNoteUpdate(BaseModel):
    note_type: Optional[str] = None
    note_text: Optional[str] = None


class CustomerNote(CustomerNoteBase):
    id: int
    customer_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerPaymentBase(BaseModel):
    amount: float
    payment_method: str = "cash"
    reference_note: Optional[str] = None


class CustomerPaymentCreate(CustomerPaymentBase):
    pass


class CustomerPayment(CustomerPaymentBase):
    id: int
    customer_id: int
    payment_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerBase(BaseModel):
    phone: Optional[str] = None
    customer_id: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    address: Optional[str] = None


class CustomerCreate(CustomerBase):
    """At least one of phone or customer_id must be provided"""
    pass


class CustomerUpdate(BaseModel):
    phone: Optional[str] = None
    customer_id: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    address: Optional[str] = None


class CustomerResponse(CustomerBase):
    id: int
    total_purchases: int
    total_spent: float
    outstanding_balance: float
    member_since: datetime
    created_at: datetime
    updated_at: datetime
    notes: List[CustomerNote] = []
    payments: List[CustomerPayment] = []

    class Config:
        from_attributes = True


class CustomerSimple(BaseModel):
    """Simplified customer response for cart/checkout display"""
    id: int
    customer_id: Optional[str]
    phone: Optional[str]
    name: Optional[str]
    outstanding_balance: float

    class Config:
        from_attributes = True


class CustomerListResponse(BaseModel):
    id: int
    customer_id: Optional[str]
    phone: Optional[str]
    name: Optional[str]
    total_purchases: int
    total_spent: float
    outstanding_balance: float
    created_at: datetime

    class Config:
        from_attributes = True
