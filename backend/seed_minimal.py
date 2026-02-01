#!/usr/bin/env python3
"""
Wipe operational data and seed minimal defaults:
- Keep users table intact
- Ensure admin user exists
- Create a default vendor
- Create a single test product

Run: python seed_minimal.py
"""
from app.db.session import SessionLocal, engine
from app.models.user import User, UserRole
from app.models.vendor import Vendor
from app.models.product import Product
from app.models.purchase import Purchase, PurchaseItem
from app.models.sale import Sale, SaleItem
from app.models.customer import Customer, CustomerNote, CustomerPayment
from app.models.product import ProductVariation
from app.core.security import get_password_hash

def wipe_data(db):
    from sqlalchemy import inspect

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    def safe_delete(model, table_name: str):
        if table_name in existing_tables:
            db.query(model).delete()

    safe_delete(SaleItem, "sale_items")
    safe_delete(Sale, "sales")
    safe_delete(PurchaseItem, "purchase_items")
    safe_delete(Purchase, "purchases")
    safe_delete(ProductVariation, "product_variations")
    safe_delete(Product, "products")
    safe_delete(CustomerPayment, "customer_payments")
    safe_delete(CustomerNote, "customer_notes")
    safe_delete(Customer, "customers")
    safe_delete(Vendor, "vendors")
    db.commit()


def ensure_admin(db):
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print("✓ Admin user created (admin / admin123)")
    else:
        print("✓ Admin user already exists")


def create_defaults(db):
    vendor = Vendor(
        name="Default Vendor",
        contact_name="Default",
        phone="",
        email="",
        address="",
    )
    db.add(vendor)
    db.commit()
    print("✓ Default vendor created")

    product = Product(
        name="Test Product",
        sku="TEST-001",
        category="Test",
        description="Default test product",
        selling_price=1.00,
        cost_price=0.50,
        quantity=0,
        has_variations=False,
        variation_attributes=[],
        base_unit="piece",
        selling_units=[],
    )
    db.add(product)
    db.commit()
    print("✓ Test product created")


def main():
    db = SessionLocal()
    try:
        wipe_data(db)
        ensure_admin(db)
        create_defaults(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
