from typing import Optional, List, Dict, Any
from pydantic import BaseModel

# Product Variation Schemas
class SellingUnit(BaseModel):
    unit: str  # e.g., "piece", "dozen", "kg"
    conversion: float  # Conversion factor to base unit
    price: float  # Selling price for this unit

class ProductVariationBase(BaseModel):
    attributes: Dict[str, str]  # e.g., {"Size": "M", "Color": "Red"}
    sku: Optional[str] = None
    price_adjustment: float = 0.0
    quantity: int = 0
    barcode: Optional[str] = None

class ProductVariationCreate(ProductVariationBase):
    pass

class ProductVariationUpdate(BaseModel):
    attributes: Optional[Dict[str, str]] = None
    sku: Optional[str] = None
    price_adjustment: Optional[float] = None
    quantity: Optional[int] = None
    barcode: Optional[str] = None

class ProductVariation(ProductVariationBase):
    id: int
    product_id: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

# Product Schemas
class ProductBase(BaseModel):
    name: str
    sku: Optional[str] = None
    category: Optional[str] = "Uncategorized"
    description: Optional[str] = None
    image_url: Optional[str] = None
    selling_price: float = 0.0
    low_stock_threshold: Optional[int] = 10
    
    # Variation fields
    has_variations: bool = False
    variation_attributes: List[str] = []  # e.g., ["Size", "Color"]
    
    # Unit of measure fields
    base_unit: str = "piece"
    selling_units: List[SellingUnit] = []

class ProductCreate(ProductBase):
    pass # Initial quantity is always 0

class ProductUpdate(ProductBase):
    pass

class Product(ProductBase):
    id: int
    quantity: int
    cost_price: float
    variations: List[ProductVariation] = []

    class Config:
        from_attributes = True
