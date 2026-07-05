from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, field_validator
import json

# Product Variation Schemas
class SellingUnit(BaseModel):
    unit: str  # e.g., "piece", "dozen", "kg"
    conversion: float  # Conversion factor to base unit
    price: float  # Selling price for this unit

class ProductVariationBase(BaseModel):
    attributes: Dict[str, str]  # e.g., {"Size": "M", "Color": "Red"}
    sku: Optional[str] = None
    price_adjustment: float = 0.0
    quantity: float = 0.0
    barcode: Optional[str] = None
    
    @field_validator('attributes', mode='before')
    @classmethod
    def parse_attributes(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v) if v else {}
            except:
                return {}
        return v or {}

class ProductVariationCreate(ProductVariationBase):
    pass

class ProductVariationUpdate(BaseModel):
    attributes: Optional[Dict[str, str]] = None
    sku: Optional[str] = None
    price_adjustment: Optional[float] = None
    quantity: Optional[float] = None
    barcode: Optional[str] = None
    
    @field_validator('attributes', mode='before')
    @classmethod
    def parse_attributes(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v) if v else {}
            except:
                return {}
        return v or {}

class ProductVariation(ProductVariationBase):
    id: int
    product_id: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

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
    allow_decimal_qty: bool = False
    
    # Variation fields
    has_variations: bool = False
    variation_attributes: List[str] = []  # e.g., ["Size", "Color"]
    
    # Unit of measure fields
    base_unit: str = "piece"
    selling_units: List[SellingUnit] = []
    
    @field_validator('variation_attributes', mode='before')
    @classmethod
    def parse_variation_attributes(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v) if v else []
            except:
                return []
        return v or []
    
    @field_validator('selling_units', mode='before')
    @classmethod
    def parse_selling_units(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v) if v else []
                return [SellingUnit(**unit) if isinstance(unit, dict) else unit for unit in parsed]
            except:
                return []
        return v or []

class ProductCreate(ProductBase):
    pass # Initial quantity is always 0

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    selling_price: Optional[float] = None
    low_stock_threshold: Optional[int] = None
    allow_decimal_qty: Optional[bool] = None
    has_variations: Optional[bool] = None
    variation_attributes: Optional[List[str]] = None
    base_unit: Optional[str] = None
    selling_units: Optional[List[SellingUnit]] = None

    @field_validator('variation_attributes', mode='before')
    @classmethod
    def parse_variation_attributes(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v) if v else []
            except:
                return []
        return v

    @field_validator('selling_units', mode='before')
    @classmethod
    def parse_selling_units(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v) if v else []
                return [SellingUnit(**unit) if isinstance(unit, dict) else unit for unit in parsed]
            except:
                return []
        return v


class ProductStockAdjust(BaseModel):
    quantity_delta: float
    reason: str

    @field_validator('quantity_delta')
    @classmethod
    def validate_quantity_delta(cls, v):
        if v <= 0:
            raise ValueError('quantity_delta must be greater than 0')
        return v

    @field_validator('reason')
    @classmethod
    def validate_reason(cls, v):
        value = (v or '').strip()
        if not value:
            raise ValueError('reason is required')
        return value


class ProductStockAdjustmentLog(BaseModel):
    id: int
    product_id: int
    quantity_before: float
    quantity_delta: float
    quantity_after: float
    reason: str
    adjusted_by_user_id: int
    adjusted_by_username: Optional[str] = None
    created_at: str


class ProductDeleteConfirm(BaseModel):
    admin_password: str
    force_delete_used: bool = False

    @field_validator('admin_password')
    @classmethod
    def validate_admin_password(cls, v):
        value = (v or '').strip()
        if not value:
            raise ValueError('admin_password is required')
        return value

class Product(ProductBase):
    id: int
    quantity: float
    cost_price: float
    variations: List[ProductVariation] = []

    class Config:
        from_attributes = True
