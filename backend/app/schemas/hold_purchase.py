from typing import Any, Dict, Optional
from datetime import datetime
from pydantic import BaseModel


class HoldPurchaseBase(BaseModel):
    label: Optional[str] = None
    payload: Dict[str, Any]


class HoldPurchaseCreate(HoldPurchaseBase):
    pass


class HoldPurchase(HoldPurchaseBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True