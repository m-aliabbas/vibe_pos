from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
import enum

class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    MOBILE = "mobile"
    OTHER = "other"

class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))  # Cashier who made the sale
    
    # Customer linking - FK to customers table
    customer_ref_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)  # FK to customers.id
    is_walkin = Column(Boolean, default=True)  # True if no customer linked (walk-in customer)
    
    # Legacy fields (kept for backward compatibility, but prefer customer_ref_id)
    customer_name = Column(String, nullable=True)  # Optional customer name
    customer_phone = Column(String, nullable=True, index=True)  # Optional customer phone (format: 923171585452)
    
    payment_method = Column(String, default=PaymentMethod.CASH)
    
    subtotal = Column(Float, default=0.0)  # Sum of all items
    discount = Column(Float, default=0.0)  # Future: discount amount
    tax = Column(Float, default=0.0)  # Future: tax amount
    total = Column(Float, default=0.0)  # Final total (subtotal - discount + tax)
    
    # Payment tracking for udhar (credit) management
    amount_paid = Column(Float, default=0.0)  # Actual amount received
    amount_due = Column(Float, default=0.0)   # Remaining balance (udhar)
    change_amount = Column(Float, default=0.0)  # Change to return
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    user = relationship("User", backref="sales")
    customer = relationship("Customer", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")

class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    variation_id = Column(Integer, ForeignKey("product_variations.id"), nullable=True)  # Optional variation
    
    quantity = Column(Integer)
    unit = Column(String, default="piece")  # Unit of sale (piece, dozen, kg, etc.)
    unit_price = Column(Float)  # Price at time of sale (snapshot)
    total_price = Column(Float)  # quantity * unit_price
    
    # Relationships
    sale = relationship("Sale", back_populates="items")
    product = relationship("Product")
    variation = relationship("ProductVariation")
