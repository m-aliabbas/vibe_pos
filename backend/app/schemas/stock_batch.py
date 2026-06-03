from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from enum import Enum


class BatchStatus(str, Enum):
    ACTIVE = "active"
    DEPLETED = "depleted"
    MERGED = "merged"


class MergeMethod(str, Enum):
    WEIGHTED_AVG = "weighted_avg"
    USE_LATEST = "use_latest"
    USE_LOWEST = "use_lowest"


class StockBatchRead(BaseModel):
    id: int
    product_id: int
    variation_id: Optional[int] = None
    purchase_item_id: Optional[int] = None
    batch_number: str
    quantity_received: float
    quantity_remaining: float
    unit_cost: float
    selling_price: float
    purchase_date: datetime
    expiry_date: Optional[datetime] = None
    status: BatchStatus
    merged_into_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    product_name: Optional[str] = None

    class Config:
        from_attributes = True


class StockBatchUpdate(BaseModel):
    selling_price: Optional[float] = None
    notes: Optional[str] = None


class StockBatchMergeRequest(BaseModel):
    batch_ids: List[int]
    merge_method: MergeMethod = MergeMethod.WEIGHTED_AVG
    new_selling_price: Optional[float] = None
    notes: Optional[str] = None


class StockBatchMergeResult(BaseModel):
    new_batch: StockBatchRead
    merged_count: int
    total_qty: float
    computed_cost: float


class BatchSummaryByProduct(BaseModel):
    product_id: int
    product_name: str
    total_qty: float
    active_batches: int
    avg_cost: float
    total_value: float
    batches: List[StockBatchRead]


class InventorySummary(BaseModel):
    total_inventory_value: float
    total_active_batches: int
    total_depleted_batches: int
    products_with_multiple_batches: int


class CostingComparison(BaseModel):
    product_id: int
    product_name: str
    fifo_cogs: float
    lifo_cogs: float
    wac_cogs: float
    units_sold: float
