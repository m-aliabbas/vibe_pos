from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
import enum

class ReturnReason(str, enum.Enum):
    DEFECTIVE = "defective"
    WRONG_ITEM = "wrong_item"
    CUSTOMER_CHANGED_MIND = "customer_changed_mind"
    DAMAGED = "damaged"
    OTHER = "other"

class ReturnStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class PosReturn(Base):
    """Model for product returns/refunds"""
    __tablename__ = "returns"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True, index=True)  # Made optional
    processed_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # User who processed the return
    
    # Customer info for returns without sale
    customer_name = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    
    reason = Column(String, default=ReturnReason.OTHER)
    notes = Column(Text, nullable=True)
    status = Column(String, default=ReturnStatus.PENDING)
    
    # Financial tracking
    subtotal = Column(Float, default=0.0)  # Sum of returned items
    refund_amount = Column(Float, default=0.0)  # Actual refund amount (may differ from subtotal)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    sale = relationship("Sale", backref="returns")
    processed_by_user = relationship("User", backref="processed_returns")
    items = relationship("ReturnItem", back_populates="return_record", cascade="all, delete-orphan")


class ReturnItem(Base):
    """Individual items being returned"""
    __tablename__ = "return_items"

    id = Column(Integer, primary_key=True, index=True)
    return_id = Column(Integer, ForeignKey("returns.id"), nullable=False)
    sale_item_id = Column(Integer, ForeignKey("sale_items.id"), nullable=True)  # Made optional
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    variation_id = Column(Integer, ForeignKey("product_variations.id"), nullable=True)
    
    quantity_returned = Column(Integer, nullable=False)  # Quantity being returned
    unit = Column(String, default="piece")  # Unit (must match sale item unit)
    unit_price = Column(Float, nullable=True, default=0.0)  # Original unit price from sale (optional now)
    total_refund = Column(Float, nullable=True, default=0.0)  # quantity_returned * unit_price (optional now)
    
    restocked = Column(Boolean, default=True)  # Whether item was added back to inventory
    
    # Relationships
    return_record = relationship("PosReturn", back_populates="items")
    sale_item = relationship("SaleItem")
    product = relationship("Product")
    variation = relationship("ProductVariation")
