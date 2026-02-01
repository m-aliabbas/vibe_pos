#!/usr/bin/env python3
"""
Script to import products from CSV file
Usage: python import_products_csv.py dummy_products.csv
"""
import csv
import json
import sys
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.product import Product, ProductVariation


def import_from_csv(csv_file):
    db = SessionLocal()
    
    print(f"📥 Importing products from {csv_file}...")
    
    imported_count = 0
    variation_count = 0
    
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                try:
                    # Parse JSON fields
                    variation_attrs = json.loads(row['variation_attributes'])
                    selling_units = json.loads(row['selling_units_json'])
                    has_variations = row['has_variations'].lower() == 'true'
                    
                    # Check if product already exists
                    existing = db.query(Product).filter(Product.sku == row['sku']).first()
                    if existing:
                        print(f"⚠️  Product with SKU {row['sku']} already exists. Skipping...")
                        continue
                    
                    # Create product
                    product = Product(
                        name=row['name'],
                        sku=row['sku'],
                        category=row['category'],
                        description=row['description'],
                        selling_price=float(row['selling_price']),
                        cost_price=float(row['cost_price']),
                        quantity=int(row['quantity']),
                        base_unit=row['base_unit'],
                        has_variations=has_variations,
                        variation_attributes=variation_attrs,
                        selling_units=selling_units
                    )
                    
                    db.add(product)
                    db.flush()
                    
                    print(f"✅ {row['name']} (SKU: {row['sku']})")
                    imported_count += 1
                    
                except Exception as e:
                    print(f"❌ Error importing {row.get('name', 'Unknown')}: {str(e)}")
        
        db.commit()
        print(f"\n✨ Import complete!")
        print(f"   Products imported: {imported_count}")
        
    except FileNotFoundError:
        print(f"❌ File not found: {csv_file}")
    except Exception as e:
        print(f"❌ Import failed: {str(e)}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python import_products_csv.py <csv_file>")
        print("Example: python import_products_csv.py dummy_products.csv")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    import_from_csv(csv_file)
