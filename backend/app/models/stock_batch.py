from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
from app.core.timezone import now_pkt
import enum


class BatchStatus(str, enum.Enum):
    ACTIVE = "active"
    DEPLETED = "depleted"
    MERGED = "merged"


class StockBatch(Base):
    __tablename__ = "stock_batches"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    variation_id = Column(Integer, ForeignKey("product_variations.id"), nullable=True)
    purchase_item_id = Column(Integer, ForeignKey("purchase_items.id"), nullable=True)

    batch_number = Column(String, unique=True, index=True)
    quantity_received = Column(Float, nullable=False)
    quantity_remaining = Column(Float, nullable=False)
    unit_cost = Column(Float, nullable=False)
    selling_price = Column(Float, nullable=False)

    purchase_date = Column(DateTime, default=now_pkt, nullable=False)
    expiry_date = Column(DateTime, nullable=True)

    status = Column(String, default=BatchStatus.ACTIVE)
    merged_into_id = Column(Integer, ForeignKey("stock_batches.id"), nullable=True)
    notes = Column(String, nullable=True)

    created_at = Column(DateTime, default=now_pkt)

    product = relationship("Product")
    variation = relationship("ProductVariation")
