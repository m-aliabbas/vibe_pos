from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.models.product import Product, ProductVariation
from app.schemas import product as product_schema

router = APIRouter()

@router.get("/", response_model=List[product_schema.Product])
def read_products(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    category: Optional[str] = None,
) -> Any:
    query = db.query(Product)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    if category and category != "All":
        query = query.filter(Product.category == category)
        
    return query.offset(skip).limit(limit).all()

@router.post("/", response_model=product_schema.Product)
def create_product(
    *,
    db: Session = Depends(deps.get_db),
    product_in: product_schema.ProductCreate,
) -> Any:
    if product_in.sku:
        product = db.query(Product).filter(Product.sku == product_in.sku).first()
        if product:
            raise HTTPException(status_code=400, detail="Product with this SKU already exists")
            
    product = Product(**product_in.dict())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@router.get("/{id}", response_model=product_schema.Product)
def get_product(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.put("/{id}", response_model=product_schema.Product)
def update_product(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    product_in: product_schema.ProductUpdate,
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    for field, value in product_in.dict(exclude_unset=True).items():
        setattr(product, field, value)
        
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@router.delete("/{id}")
def delete_product(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user = Depends(deps.get_current_active_admin),
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    db.delete(product)
    db.commit()
    return {"message": "Product deleted successfully"}


# ========== Product Variation Endpoints ==========

@router.get("/{product_id}/variations", response_model=List[product_schema.ProductVariation])
def get_product_variations(
    *,
    db: Session = Depends(deps.get_db),
    product_id: int,
) -> Any:
    """Get all variations for a product"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    variations = db.query(ProductVariation).filter(ProductVariation.product_id == product_id).all()
    return variations

@router.post("/{product_id}/variations", response_model=product_schema.ProductVariation)
def create_product_variation(
    *,
    db: Session = Depends(deps.get_db),
    product_id: int,
    variation_in: product_schema.ProductVariationCreate,
) -> Any:
    """Create a new variation for a product"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if not product.has_variations:
        raise HTTPException(status_code=400, detail="Product does not support variations")
    
    # Check if SKU already exists
    if variation_in.sku:
        existing = db.query(ProductVariation).filter(ProductVariation.sku == variation_in.sku).first()
        if existing:
            raise HTTPException(status_code=400, detail="Variation with this SKU already exists")
    
    # Check if barcode already exists
    if variation_in.barcode:
        existing = db.query(ProductVariation).filter(ProductVariation.barcode == variation_in.barcode).first()
        if existing:
            raise HTTPException(status_code=400, detail="Variation with this barcode already exists")
    
    # Check if variation with same attributes already exists
    existing_variations = db.query(ProductVariation).filter(ProductVariation.product_id == product_id).all()
    for existing in existing_variations:
        if existing.attributes == variation_in.attributes:
            raise HTTPException(status_code=400, detail="Variation with these attributes already exists")
    
    variation = ProductVariation(
        product_id=product_id,
        **variation_in.dict()
    )
    db.add(variation)
    db.commit()
    db.refresh(variation)
    return variation

@router.put("/variations/{variation_id}", response_model=product_schema.ProductVariation)
def update_product_variation(
    *,
    db: Session = Depends(deps.get_db),
    variation_id: int,
    variation_in: product_schema.ProductVariationUpdate,
) -> Any:
    """Update a product variation"""
    variation = db.query(ProductVariation).filter(ProductVariation.id == variation_id).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")
    
    # Check if updated SKU already exists
    if variation_in.sku and variation_in.sku != variation.sku:
        existing = db.query(ProductVariation).filter(
            ProductVariation.sku == variation_in.sku,
            ProductVariation.id != variation_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Variation with this SKU already exists")
    
    # Check if updated barcode already exists
    if variation_in.barcode and variation_in.barcode != variation.barcode:
        existing = db.query(ProductVariation).filter(
            ProductVariation.barcode == variation_in.barcode,
            ProductVariation.id != variation_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Variation with this barcode already exists")
    
    for field, value in variation_in.dict(exclude_unset=True).items():
        setattr(variation, field, value)
    
    db.add(variation)
    db.commit()
    db.refresh(variation)
    return variation

@router.delete("/variations/{variation_id}")
def delete_product_variation(
    *,
    db: Session = Depends(deps.get_db),
    variation_id: int,
    current_user = Depends(deps.get_current_active_admin),
) -> Any:
    """Delete a product variation"""
    variation = db.query(ProductVariation).filter(ProductVariation.id == variation_id).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")
    
    db.delete(variation)
    db.commit()
    return {"message": "Variation deleted successfully"}
