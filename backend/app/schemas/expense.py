from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ExpenseCreate(BaseModel):
    expense_date: Optional[datetime] = None
    account_id: int
    amount: float = Field(gt=0)
    description: str = Field(min_length=1, max_length=500)
    payment_method: str = "cash"


class ExpenseRead(ExpenseCreate):
    id: int
    created_by: Optional[int] = None
    journal_entry_id: Optional[int] = None
    created_at: datetime
    account_name: str

    class Config:
        from_attributes = True
