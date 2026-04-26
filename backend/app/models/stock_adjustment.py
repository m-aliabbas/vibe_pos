from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.session import Base


class ProductStockAdjustment(Base):
    __tablename__ = "product_stock_adjustments"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    adjusted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    quantity_before = Column(Float, nullable=False, default=0.0)
    quantity_delta = Column(Float, nullable=False)
    quantity_after = Column(Float, nullable=False, default=0.0)
    reason = Column(String, nullable=False)
    created_at = Column(String, nullable=False, default=lambda: datetime.utcnow().isoformat())

    product = relationship("Product")
    adjusted_by_user = relationship("User")
