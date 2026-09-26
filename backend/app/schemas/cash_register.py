from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class CashRegisterOpen(BaseModel):
    opening_cash: float = Field(ge=0)


class CashRegisterClose(BaseModel):
    closing_cash: float = Field(ge=0)
    notes: Optional[str] = None


class CashRegisterSessionResponse(BaseModel):
    id: int
    user_id: int
    username: Optional[str] = None
    opening_cash: float
    opened_at: datetime
    closing_cash: Optional[float] = None
    expected_cash: Optional[float] = None
    difference: Optional[float] = None
    closed_at: Optional[datetime] = None
    status: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class CashRegisterStatusResponse(BaseModel):
    enabled: bool
    session: Optional[CashRegisterSessionResponse] = None
