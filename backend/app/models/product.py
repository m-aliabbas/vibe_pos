from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base
from datetime import datetime

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    sku = Column(String, index=True, unique=True, nullable=True) # Barcode
    category = Column(String, index=True, default="Uncategorized")
    description = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    
    selling_price = Column(Float, default=0.0)
    cost_price = Column(Float, default=0.0) # Updated via purchase
    quantity = Column(Integer, default=0)
    low_stock_threshold = Column(Integer, default=10)
    
    # Variation fields
    has_variations = Column(Boolean, default=False)
    variation_attributes = Column(JSON, default=list)  # e.g., ["Size", "Color", "Material"]
    
    # Unit of measure fields
    base_unit = Column(String, default="piece")  # Base unit for inventory tracking
    selling_units = Column(JSON, default=list)  # e.g., [{"unit": "piece", "conversion": 1, "price": 10}, {"unit": "dozen", "conversion": 12, "price": 110}]
    
    # Relationships
    variations = relationship("ProductVariation", back_populates="product", cascade="all, delete-orphan")


class ProductVariation(Base):
    __tablename__ = "product_variations"
    
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    
    # Variation attributes stored as JSON: {"Size": "M", "Color": "Red"}
    attributes = Column(JSON, nullable=False)
    
    sku = Column(String, index=True, unique=True, nullable=True)  # Unique SKU per variation
    price_adjustment = Column(Float, default=0.0)  # +/- from base product price
    quantity = Column(Integer, default=0)
    barcode = Column(String, index=True, unique=True, nullable=True)
    
    # Timestamps
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.utcnow().isoformat(), onupdate=lambda: datetime.utcnow().isoformat())
    
    # Relationships
    product = relationship("Product", back_populates="variations")
