from typing import Any, Dict, Optional
from datetime import datetime
from pydantic import BaseModel


class HoldSaleBase(BaseModel):
    label: Optional[str] = None
    payload: Dict[str, Any]


class HoldSaleCreate(HoldSaleBase):
    pass


class HoldSale(HoldSaleBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
