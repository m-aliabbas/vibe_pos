from sqlalchemy import Column, Integer, String as SQLString, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
from app.core.timezone import now_pkt
import enum

String = SQLString(255)

class PurchaseStatus(str, enum.Enum):
    PAID = "paid"
    PARTIAL = "partial"
    UNPAID = "unpaid"

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"))
    created_at = Column(DateTime, default=now_pkt)
    
    total_amount = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0)
    status = Column(String, default=PurchaseStatus.UNPAID)
    
    vendor = relationship("Vendor", backref="purchases")
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")

class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    variation_id = Column(Integer, ForeignKey("product_variations.id"), nullable=True)
    
    quantity = Column(Float)
    unit_cost = Column(Float)
    total_cost = Column(Float) # quantity * unit_cost
    expiry_date = Column(DateTime, nullable=True)
    # Break the nullable purchase-item/stock-batch DDL cycle for server databases.
    batch_id = Column(
        Integer,
        ForeignKey("stock_batches.id", use_alter=True, name="fk_purchase_items_batch_id"),
        nullable=True,
    )

    purchase = relationship("Purchase", back_populates="items")
    product = relationship("Product")
    variation = relationship("ProductVariation")

    @property
    def product_name(self):
        if self.product and getattr(self.product, "name", None):
            return self.product.name
        return None
