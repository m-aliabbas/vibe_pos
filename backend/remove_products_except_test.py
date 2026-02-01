#!/usr/bin/env python3
"""
Script to remove all products from database except those with 'test' in the name.
"""

import sys
import os

# Add the backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.models.product import Product, ProductVariation
from app.db.base import Base

def remove_products_except_test():
    """Remove all products except those with 'test' in the name (case insensitive)."""
    
    # Create database tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # Create a database session
    db: Session = SessionLocal()
    
    try:
        # Query all products that do NOT contain 'test' in the name (case insensitive)
        products_to_delete = db.query(Product).filter(
            ~Product.name.ilike('%test%')
        ).all()
        
        print(f"Found {len(products_to_delete)} products to delete:")
        
        # Show products that will be deleted
        for product in products_to_delete:
            print(f"- ID: {product.id}, Name: {product.name}, SKU: {product.sku}")
        
        if products_to_delete:
            # Ask for confirmation
            response = input(f"\nAre you sure you want to delete these {len(products_to_delete)} products? (y/N): ")
            
            if response.lower().strip() == 'y':
                # Delete products (variations will be deleted automatically due to cascade)
                for product in products_to_delete:
                    db.delete(product)
                
                # Commit the transaction
                db.commit()
                print(f"✓ Successfully deleted {len(products_to_delete)} products!")
                
                # Show remaining products with 'test' in name
                remaining_products = db.query(Product).all()
                print(f"\nRemaining products ({len(remaining_products)}):")
                for product in remaining_products:
                    print(f"- ID: {product.id}, Name: {product.name}, SKU: {product.sku}")
            else:
                print("❌ Operation cancelled.")
        else:
            print("✓ No products found to delete (all existing products contain 'test' in the name).")
            
            # Show current products
            all_products = db.query(Product).all()
            print(f"\nCurrent products ({len(all_products)}):")
            for product in all_products:
                print(f"- ID: {product.id}, Name: {product.name}, SKU: {product.sku}")
    
    except Exception as e:
        print(f"❌ Error occurred: {e}")
        db.rollback()
        
    finally:
        db.close()

if __name__ == "__main__":
    remove_products_except_test()