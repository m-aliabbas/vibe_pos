from sqlalchemy import Column, ForeignKey, Integer, String, Float, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.session import Base
from datetime import datetime


class Customer(Base):
    __tablename__ = "customers"

    # Primary key - auto-increment internal ID
    id = Column(Integer, primary_key=True, index=True)
    
    # Unique readable identifier (e.g., CUST001, CUST002)
    customer_id = Column(String, unique=True, index=True, nullable=True)
    
    # Contact information - at least one of (phone, customer_id) must exist
    phone = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=True)
    
    # Customer details
    name = Column(String, nullable=True)
    address = Column(String, nullable=True)
    
    # Financial tracking
    total_purchases = Column(Integer, default=0)  # Count of sales transactions
    total_spent = Column(Float, default=0.0)  # Total amount spent
    outstanding_balance = Column(Float, default=0.0)  # Balance (positive = owes money, negative = prepaid credit)
    opening_balance = Column(Float, default=0.0)  # Initial balance from legacy/manual system
    credit_limit = Column(Float, nullable=True, default=None)  # Max allowed outstanding balance (None = unlimited)
    
    # Vehicle Oil Change Tracking (optional)
    current_mileage = Column(Integer, nullable=True)  # Current vehicle mileage
    oil_change_interval = Column(Integer, nullable=True)  # Distance oil can go (e.g., 3000 km)
    next_oil_change_mileage = Column(Integer, nullable=True)  # Next mileage for oil change
    
    # Metadata
    member_since = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    sales = relationship("Sale", back_populates="customer")
    notes = relationship("CustomerNote", back_populates="customer", cascade="all, delete-orphan")
    payments = relationship("CustomerPayment", back_populates="customer", cascade="all, delete-orphan")
    
    # Constraints - at least phone or customer_id must be present
    __table_args__ = (
        UniqueConstraint('phone', name='_phone_unique'),
        UniqueConstraint('customer_id', name='_customer_id_unique'),
    )


class CustomerNote(Base):
    __tablename__ = "customer_notes"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    
    note_type = Column(String, default="general")  # general, credit_history, special_instruction, reminder, preference
    note_text = Column(String, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    customer = relationship("Customer", back_populates="notes")


class CustomerPayment(Base):
    __tablename__ = "customer_payments"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    
    amount = Column(Float, nullable=False)  # Amount paid towards udhar
    payment_method = Column(String, default="cash")  # cash, card, mobile, etc.
    payment_date = Column(DateTime, default=datetime.utcnow)
    
    reference_note = Column(String, nullable=True)  # Optional reference or notes
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    customer = relationship("Customer", back_populates="payments")
    