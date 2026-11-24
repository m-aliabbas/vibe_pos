"""
Migration script to add product variation support.
Adds variation fields to products table and creates product_variations table.
"""
import sqlite3
import json

def migrate_database():
    conn = sqlite3.connect('pos.db')
    cursor = conn.cursor()
    
    try:
        # Check if columns exist before adding
        cursor.execute("PRAGMA table_info(products)")
        existing_columns = [col[1] for col in cursor.fetchall()]
        
        # Add variation fields to products table
        if 'has_variations' not in existing_columns:
            print("Adding has_variations column...")
            cursor.execute("ALTER TABLE products ADD COLUMN has_variations BOOLEAN DEFAULT 0")
        
        if 'variation_attributes' not in existing_columns:
            print("Adding variation_attributes column...")
            cursor.execute("ALTER TABLE products ADD COLUMN variation_attributes TEXT DEFAULT '[]'")
        
        if 'base_unit' not in existing_columns:
            print("Adding base_unit column...")
            cursor.execute("ALTER TABLE products ADD COLUMN base_unit TEXT DEFAULT 'piece'")
        
        if 'selling_units' not in existing_columns:
            print("Adding selling_units column...")
            cursor.execute("ALTER TABLE products ADD COLUMN selling_units TEXT DEFAULT '[]'")
        
        # Create product_variations table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS product_variations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                attributes TEXT NOT NULL,
                sku TEXT UNIQUE,
                price_adjustment REAL DEFAULT 0.0,
                quantity INTEGER DEFAULT 0,
                barcode TEXT UNIQUE,
                created_at TEXT,
                updated_at TEXT,
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
        """)
        print("Created product_variations table")
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_product_variations_product_id ON product_variations(product_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_product_variations_sku ON product_variations(sku)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_product_variations_barcode ON product_variations(barcode)")
        print("Created indexes for product_variations table")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()
