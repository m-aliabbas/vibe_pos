from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.models.vendor import Vendor
from app.models.product import Product, ProductVariation
from app.core.security import get_password_hash
import json

def seed():
    db = SessionLocal()
    
    # Create Admin User
    if not db.query(User).filter(User.username == "admin").first():
        admin = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True
        )
        db.add(admin)
        print("✓ Admin user created")
    else:
        print("✓ Admin user already exists")
    
    # Create Cashier User
    if not db.query(User).filter(User.username == "cashier").first():
        cashier = User(
            username="cashier",
            email="cashier@example.com",
            hashed_password=get_password_hash("cashier123"),
            role=UserRole.CASHIER,
            is_active=True
        )
        db.add(cashier)
        print("✓ Cashier user created")
    else:
        print("✓ Cashier user already exists")
    
    db.commit()
    
    # Create Sample Vendor
    if not db.query(Vendor).filter(Vendor.name == "ABC Suppliers").first():
        vendor = Vendor(
            name="ABC Suppliers",
            contact_name="Mike Johnson",
            phone="555-1234",
            email="mike@abcsuppliers.com",
            address="123 Business St, City"
        )
        db.add(vendor)
        db.commit()
        print("✓ Sample vendor created")
    else:
        print("✓ Sample vendor already exists")
    
    # Create Sample Products
    
    # 1. T-Shirt with Size & Color variations
    tshirt = db.query(Product).filter(Product.name == "Cotton T-Shirt").first()
    if not tshirt:
        tshirt = Product(
            name="Cotton T-Shirt",
            sku="TSH001",
            category="Clothing",
            description="Comfortable cotton t-shirt",
            selling_price=15.00,
            cost_price=8.00,
            quantity=0,  # Stock is in variations
            has_variations=True,
            variation_attributes=["Size", "Color"],
            base_unit="piece",
            selling_units=[]
        )
        db.add(tshirt)
        db.commit()
        print("✓ T-Shirt product created")
        
        # Create variations for T-Shirt
        sizes = ["S", "M", "L", "XL"]
        colors = ["Red", "Blue", "Black"]
        
        for size in sizes:
            for color in colors:
                variation = ProductVariation(
                    product_id=tshirt.id,
                    attributes={"Size": size, "Color": color},
                    sku=f"TSH001-{size}-{color[:3].upper()}",
                    price_adjustment=2.00 if size == "XL" else 0.00,
                    quantity=50,
                    barcode=None
                )
                db.add(variation)
        
        db.commit()
        print(f"  ✓ Created {len(sizes) * len(colors)} T-Shirt variations")
    else:
        print("✓ T-Shirt product already exists")
    
    # 2. Eggs with unit of measure (dozen)
    eggs = db.query(Product).filter(Product.name == "Fresh Eggs").first()
    if not eggs:
        eggs = Product(
            name="Fresh Eggs",
            sku="EGG001",
            category="Dairy & Eggs",
            description="Farm fresh eggs",
            selling_price=0.50,  # Price per piece
            cost_price=0.30,
            quantity=500,  # 500 pieces in stock
            has_variations=False,
            variation_attributes=[],
            base_unit="piece",
            selling_units=[
                {"unit": "dozen", "conversion": 12, "price": 5.50},
                {"unit": "tray", "conversion": 30, "price": 13.00}
            ]
        )
        db.add(eggs)
        db.commit()
        print("✓ Fresh Eggs product created with unit options")
    else:
        print("✓ Fresh Eggs product already exists")
    
    # 3. Bottled Water with bulk units
    water = db.query(Product).filter(Product.name == "Mineral Water").first()
    if not water:
        water = Product(
            name="Mineral Water",
            sku="WTR001",
            category="Beverages",
            description="500ml bottled water",
            selling_price=1.00,  # Price per bottle
            cost_price=0.60,
            quantity=1000,  # 1000 bottles in stock
            has_variations=False,
            variation_attributes=[],
            base_unit="bottle",
            selling_units=[
                {"unit": "pack", "conversion": 6, "price": 5.50},
                {"unit": "case", "conversion": 24, "price": 20.00}
            ]
        )
        db.add(water)
        db.commit()
        print("✓ Mineral Water product created with unit options")
    else:
        print("✓ Mineral Water product already exists")
    
    # 4. Rice with weight-based units
    rice = db.query(Product).filter(Product.name == "Basmati Rice").first()
    if not rice:
        rice = Product(
            name="Basmati Rice",
            sku="RICE001",
            category="Grains",
            description="Premium basmati rice",
            selling_price=3.00,  # Price per kg
            cost_price=2.00,
            quantity=500,  # 500 kg in stock
            has_variations=False,
            variation_attributes=[],
            base_unit="kg",
            selling_units=[
                {"unit": "gram", "conversion": 0.001, "price": 0.003},
                {"unit": "bag5kg", "conversion": 5, "price": 14.00},
                {"unit": "bag10kg", "conversion": 10, "price": 27.00}
            ]
        )
        db.add(rice)
        db.commit()
        print("✓ Basmati Rice product created with weight-based units")
    else:
        print("✓ Basmati Rice product already exists")
    
    # 5. Running Shoes with Size variation
    shoes = db.query(Product).filter(Product.name == "Running Shoes").first()
    if not shoes:
        shoes = Product(
            name="Running Shoes",
            sku="SHOE001",
            category="Footwear",
            description="Comfortable running shoes",
            selling_price=60.00,
            cost_price=35.00,
            quantity=0,  # Stock is in variations
            has_variations=True,
            variation_attributes=["Size"],
            base_unit="pair",
            selling_units=[]
        )
        db.add(shoes)
        db.commit()
        print("✓ Running Shoes product created")
        
        # Create variations for Shoes
        sizes = ["7", "8", "9", "10", "11", "12"]
        
        for size in sizes:
            variation = ProductVariation(
                product_id=shoes.id,
                attributes={"Size": size},
                sku=f"SHOE001-{size}",
                price_adjustment=0.00,
                quantity=30,
                barcode=None
            )
            db.add(variation)
        
        db.commit()
        print(f"  ✓ Created {len(sizes)} Running Shoes variations")
    else:
        print("✓ Running Shoes product already exists")
    
    # 6. Regular product without variations (for comparison)
    cola = db.query(Product).filter(Product.name == "Coca Cola").first()
    if not cola:
        cola = Product(
            name="Coca Cola",
            sku="COLA001",
            category="Beverages",
            description="330ml can",
            selling_price=1.50,
            cost_price=0.90,
            quantity=200,
            has_variations=False,
            variation_attributes=[],
            base_unit="can",
            selling_units=[]
        )
        db.add(cola)
        db.commit()
        print("✓ Coca Cola product created (regular product)")
    else:
        print("✓ Coca Cola product already exists")
    
    print("\n" + "="*50)
    print("🎉 Seed data completed successfully!")
    print("="*50)
    print("\nSample credentials:")
    print("  Admin:   username='admin',   password='admin123'")
    print("  Cashier: username='cashier', password='cashier123'")
    print("\nSample products created:")
    print("  • Cotton T-Shirt (12 variations: S/M/L/XL × Red/Blue/Black)")
    print("  • Fresh Eggs (with dozen and tray units)")
    print("  • Mineral Water (with pack and case units)")
    print("  • Basmati Rice (with gram, 5kg bag, 10kg bag units)")
    print("  • Running Shoes (6 size variations)")
    print("  • Coca Cola (regular product without variations)")
    print("="*50 + "\n")
    
    db.close()

if __name__ == "__main__":
    seed()

