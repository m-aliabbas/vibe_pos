from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.product import Product


WORKSHOP_SAMPLE_PRODUCTS = (
    {
        "name": "Engine Oil 10W-40 (4L)",
        "sku": "WS-OIL-10W40-4L",
        "category": "Engine Oil",
        "description": "Sample sealed four-litre engine oil can",
        "item_type": "stock",
        "selling_price": 5200.0,
        "cost_price": 4400.0,
        "quantity": 12.0,
        "base_unit": "can",
        "low_stock_threshold": 3,
    },
    {
        "name": "Engine Oil 20W-50 (4L)",
        "sku": "WS-OIL-20W50-4L",
        "category": "Engine Oil",
        "description": "Sample sealed four-litre engine oil can",
        "item_type": "stock",
        "selling_price": 4600.0,
        "cost_price": 3900.0,
        "quantity": 12.0,
        "base_unit": "can",
        "low_stock_threshold": 3,
    },
    {
        "name": "Open Engine Oil 20W-50",
        "sku": "WS-OPEN-OIL-20W50",
        "category": "Engine Oil",
        "description": "Sample open oil sold by decimal litre quantity",
        "item_type": "stock",
        "selling_price": 1150.0,
        "cost_price": 900.0,
        "quantity": 40.0,
        "allow_decimal_qty": True,
        "base_unit": "liter",
        "selling_units": [
            {"unit": "liter", "conversion": 1.0, "price": 1150.0},
        ],
        "low_stock_threshold": 8,
    },
    {
        "name": "Standard Oil Filter",
        "sku": "WS-FILTER-OIL-STD",
        "category": "Filters",
        "description": "Sample standard replacement oil filter",
        "item_type": "stock",
        "selling_price": 850.0,
        "cost_price": 600.0,
        "quantity": 20.0,
        "base_unit": "piece",
        "low_stock_threshold": 5,
    },
    {
        "name": "Standard Air Filter",
        "sku": "WS-FILTER-AIR-STD",
        "category": "Filters",
        "description": "Sample standard replacement air filter",
        "item_type": "stock",
        "selling_price": 1400.0,
        "cost_price": 1000.0,
        "quantity": 15.0,
        "base_unit": "piece",
        "low_stock_threshold": 4,
    },
    {
        "name": "Oil Change Labour",
        "sku": "WS-SERVICE-OIL-CHANGE",
        "category": "Workshop Services",
        "description": "Sample oil-change labour service",
        "item_type": "service",
        "selling_price": 500.0,
        "cost_price": 0.0,
        "quantity": 0.0,
        "base_unit": "service",
        "low_stock_threshold": 0,
    },
)


def seed_workshop_sample_products(db: Session) -> int:
    """Add missing standard workshop items without changing existing products."""

    standard_skus = {str(product["sku"]) for product in WORKSHOP_SAMPLE_PRODUCTS}
    existing_skus = {
        sku
        for (sku,) in db.query(Product.sku).filter(Product.sku.in_(standard_skus)).all()
        if sku
    }
    missing = [product for product in WORKSHOP_SAMPLE_PRODUCTS if product["sku"] not in existing_skus]
    if not missing:
        return 0
    db.add_all(Product(**product) for product in missing)
    db.commit()
    return len(missing)
