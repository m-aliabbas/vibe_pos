#!/usr/bin/env python3
"""
Script to seed dummy products into the database
Includes:
- Simple products (no variations)
- Products with variations (size, color, etc.)
- Different categories
- Multiple selling units
"""
import json
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.product import Product, ProductVariation


def seed_products():
    db = SessionLocal()
    
    # Check if products already exist
    existing_count = db.query(Product).count()
    if existing_count > 0:
        print(f"⚠️  Database already has {existing_count} products. Skipping seed.")
        db.close()
        return
    
    print("🌱 Seeding dummy products...")
    
    # ============================================
    # 1. SIMPLE PRODUCTS (No Variations)
    # ============================================
    
    simple_products = [
        {
            "name": "Fresh Eggs",
            "sku": "EGG001",
            "category": "Dairy & Eggs",
            "description": "Fresh farm eggs, pack of 12",
            "selling_price": 4.50,
            "cost_price": 2.50,
            "quantity": 150,
            "base_unit": "dozen",
            "selling_units": [
                {"unit": "piece", "conversion": 1, "price": 0.50},
                {"unit": "dozen", "conversion": 12, "price": 4.50}
            ]
        },
        {
            "name": "Mineral Water",
            "sku": "WTR001",
            "category": "Beverages",
            "description": "1L Mineral water bottle",
            "selling_price": 1.50,
            "cost_price": 0.75,
            "quantity": 300,
            "base_unit": "bottle",
            "selling_units": [
                {"unit": "bottle", "conversion": 1, "price": 1.50},
                {"unit": "case", "conversion": 20, "price": 28.00}
            ]
        },
        {
            "name": "Basmati Rice",
            "sku": "RICE001",
            "category": "Grains",
            "description": "Premium basmati rice, 5kg bag",
            "selling_price": 15.00,
            "cost_price": 8.00,
            "quantity": 80,
            "base_unit": "kg",
            "selling_units": [
                {"unit": "kg", "conversion": 1, "price": 3.00},
                {"unit": "bag", "conversion": 5, "price": 15.00}
            ]
        },
        {
            "name": "Cooking Oil",
            "sku": "OIL001",
            "category": "Oils & Condiments",
            "description": "Vegetable cooking oil, 1L",
            "selling_price": 5.50,
            "cost_price": 3.00,
            "quantity": 120,
            "base_unit": "liter",
            "selling_units": [
                {"unit": "liter", "conversion": 1, "price": 5.50},
                {"unit": "gallon", "conversion": 3.78, "price": 20.00}
            ]
        },
        {
            "name": "Bread",
            "sku": "BRD001",
            "category": "Bakery",
            "description": "Whole wheat bread loaf",
            "selling_price": 2.50,
            "cost_price": 1.20,
            "quantity": 200,
            "base_unit": "loaf",
            "selling_units": [
                {"unit": "loaf", "conversion": 1, "price": 2.50}
            ]
        },
    ]
    
    # ============================================
    # 2. PRODUCTS WITH VARIATIONS
    # ============================================
    
    variation_products = [
        {
            "name": "Cotton T-Shirt",
            "sku": "TSH001",
            "category": "Clothing",
            "description": "100% cotton comfortable t-shirt",
            "selling_price": 12.00,
            "cost_price": 6.00,
            "base_unit": "piece",
            "has_variations": True,
            "variation_attributes": ["Size", "Color"],
            "variations": [
                {"attributes": {"Size": "S", "Color": "Red"}, "sku": "TSH-S-RED", "quantity": 20, "price_adjustment": 0},
                {"attributes": {"Size": "S", "Color": "Blue"}, "sku": "TSH-S-BLUE", "quantity": 15, "price_adjustment": 0},
                {"attributes": {"Size": "M", "Color": "Red"}, "sku": "TSH-M-RED", "quantity": 25, "price_adjustment": 0},
                {"attributes": {"Size": "M", "Color": "Blue"}, "sku": "TSH-M-BLUE", "quantity": 20, "price_adjustment": 0},
                {"attributes": {"Size": "L", "Color": "Red"}, "sku": "TSH-L-RED", "quantity": 18, "price_adjustment": 1.00},
                {"attributes": {"Size": "L", "Color": "Blue"}, "sku": "TSH-L-BLUE", "quantity": 16, "price_adjustment": 1.00},
            ]
        },
        {
            "name": "Running Shoes",
            "sku": "SHOE001",
            "category": "Footwear",
            "description": "Comfortable running shoes",
            "selling_price": 65.00,
            "cost_price": 35.00,
            "base_unit": "pair",
            "has_variations": True,
            "variation_attributes": ["Size"],
            "variations": [
                {"attributes": {"Size": "6"}, "sku": "SHOE-6", "quantity": 10, "price_adjustment": 0},
                {"attributes": {"Size": "7"}, "sku": "SHOE-7", "quantity": 15, "price_adjustment": 0},
                {"attributes": {"Size": "8"}, "sku": "SHOE-8", "quantity": 20, "price_adjustment": 0},
                {"attributes": {"Size": "9"}, "sku": "SHOE-9", "quantity": 18, "price_adjustment": 0},
                {"attributes": {"Size": "10"}, "sku": "SHOE-10", "quantity": 12, "price_adjustment": 0},
                {"attributes": {"Size": "11"}, "sku": "SHOE-11", "quantity": 8, "price_adjustment": 2.00},
            ]
        },
        {
            "name": "Mobile Phone Case",
            "sku": "CASE001",
            "category": "Electronics",
            "description": "Protective phone case",
            "selling_price": 8.50,
            "cost_price": 3.50,
            "base_unit": "piece",
            "has_variations": True,
            "variation_attributes": ["Model", "Color"],
            "variations": [
                {"attributes": {"Model": "iPhone 12", "Color": "Black"}, "sku": "CASE-IP12-BLK", "quantity": 30, "price_adjustment": 0},
                {"attributes": {"Model": "iPhone 12", "Color": "Blue"}, "sku": "CASE-IP12-BLU", "quantity": 25, "price_adjustment": 0},
                {"attributes": {"Model": "Samsung S21", "Color": "Black"}, "sku": "CASE-S21-BLK", "quantity": 28, "price_adjustment": 0},
                {"attributes": {"Model": "Samsung S21", "Color": "Red"}, "sku": "CASE-S21-RED", "quantity": 22, "price_adjustment": 0},
            ]
        },
        {
            "name": "Coffee Beans",
            "sku": "COFFEE001",
            "category": "Beverages",
            "description": "Premium roasted coffee beans",
            "selling_price": 12.00,
            "cost_price": 6.00,
            "base_unit": "kg",
            "has_variations": True,
            "variation_attributes": ["Roast Level", "Origin"],
            "variations": [
                {"attributes": {"Roast Level": "Light", "Origin": "Brazil"}, "sku": "COFFEE-LIGHT-BR", "quantity": 15, "price_adjustment": 0},
                {"attributes": {"Roast Level": "Medium", "Origin": "Brazil"}, "sku": "COFFEE-MED-BR", "quantity": 20, "price_adjustment": 0.50},
                {"attributes": {"Roast Level": "Dark", "Origin": "Brazil"}, "sku": "COFFEE-DARK-BR", "quantity": 18, "price_adjustment": 1.00},
                {"attributes": {"Roast Level": "Medium", "Origin": "Colombia"}, "sku": "COFFEE-MED-CO", "quantity": 12, "price_adjustment": 1.50},
                {"attributes": {"Roast Level": "Dark", "Origin": "Colombia"}, "sku": "COFFEE-DARK-CO", "quantity": 10, "price_adjustment": 2.00},
            ]
        },
    ]
    
    # ============================================
    # ADD SIMPLE PRODUCTS
    # ============================================
    print("\n📦 Adding simple products...")
    for prod_data in simple_products:
        product = Product(
            name=prod_data["name"],
            sku=prod_data["sku"],
            category=prod_data["category"],
            description=prod_data.get("description"),
            selling_price=prod_data["selling_price"],
            cost_price=prod_data["cost_price"],
            quantity=prod_data["quantity"],
            base_unit=prod_data["base_unit"],
            selling_units=prod_data["selling_units"],
            has_variations=False,
        )
        db.add(product)
        print(f"  ✅ {prod_data['name']} (SKU: {prod_data['sku']})")
    
    db.commit()
    
    # ============================================
    # ADD PRODUCTS WITH VARIATIONS
    # ============================================
    print("\n🎨 Adding products with variations...")
    for prod_data in variation_products:
        product = Product(
            name=prod_data["name"],
            sku=prod_data["sku"],
            category=prod_data["category"],
            description=prod_data.get("description"),
            selling_price=prod_data["selling_price"],
            cost_price=prod_data["cost_price"],
            quantity=0,  # Will be calculated from variations
            base_unit=prod_data["base_unit"],
            has_variations=True,
            variation_attributes=prod_data["variation_attributes"],
            selling_units=[{"unit": prod_data["base_unit"], "conversion": 1, "price": prod_data["selling_price"]}]
        )
        db.add(product)
        db.flush()  # Flush to get the product ID
        
        print(f"  ✅ {prod_data['name']} (SKU: {prod_data['sku']})")
        print(f"     Variations: {', '.join(prod_data['variation_attributes'])}")
        
        # Add variations
        total_qty = 0
        for var_data in prod_data["variations"]:
            variation = ProductVariation(
                product_id=product.id,
                attributes=var_data["attributes"],
                sku=var_data["sku"],
                quantity=var_data["quantity"],
                price_adjustment=var_data.get("price_adjustment", 0)
            )
            db.add(variation)
            total_qty += var_data["quantity"]
            print(f"       - {json.dumps(var_data['attributes'])}: {var_data['quantity']} units")
        
        # Update product quantity with sum of all variations
        product.quantity = total_qty
    
    db.commit()
    
    # ============================================
    # SUMMARY
    # ============================================
    total_products = db.query(Product).count()
    total_variations = db.query(ProductVariation).count()
    
    print(f"\n✨ Seeding complete!")
    print(f"   Total Products: {total_products}")
    print(f"   Total Variations: {total_variations}")
    
    db.close()


if __name__ == "__main__":
    seed_products()
