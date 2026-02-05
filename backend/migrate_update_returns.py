"""
Migration: Update returns table to support direct product returns
- Make sale_id nullable
- Add customer_name and customer_phone columns
- Make sale_item_id nullable in return_items
- Make unit_price and total_refund nullable in return_items

SQLite version - uses table recreation for modifying columns
"""

from sqlalchemy import create_engine, text
from app.core.config import settings

def migrate():
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Start transaction
        trans = conn.begin()
        
        try:
            print("Updating returns table...")
            
            # Add customer_name column
            try:
                conn.execute(text("""
                    ALTER TABLE returns 
                    ADD COLUMN customer_name VARCHAR(255)
                """))
                print("✓ Added customer_name column")
            except Exception as e:
                print(f"  customer_name column might already exist: {e}")
            
            # Add customer_phone column
            try:
                conn.execute(text("""
                    ALTER TABLE returns 
                    ADD COLUMN customer_phone VARCHAR(50)
                """))
                print("✓ Added customer_phone column")
            except Exception as e:
                print(f"  customer_phone column might already exist: {e}")
            
            # For SQLite, we need to recreate the table to make sale_id nullable
            print("\nRecreating returns table with nullable sale_id...")
            try:
                # Create new table
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS returns_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sale_id INTEGER NULL,
                        processed_by INTEGER NOT NULL,
                        customer_name VARCHAR(255),
                        customer_phone VARCHAR(50),
                        reason VARCHAR(100),
                        notes TEXT,
                        status VARCHAR(50),
                        subtotal FLOAT DEFAULT 0.0,
                        refund_amount FLOAT DEFAULT 0.0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (sale_id) REFERENCES sales (id),
                        FOREIGN KEY (processed_by) REFERENCES users (id)
                    )
                """))
                
                # Copy data
                conn.execute(text("""
                    INSERT INTO returns_new 
                    SELECT id, sale_id, processed_by, customer_name, customer_phone, 
                           reason, notes, status, subtotal, refund_amount, created_at, updated_at
                    FROM returns
                """))
                
                # Drop old table
                conn.execute(text("DROP TABLE returns"))
                
                # Rename new table
                conn.execute(text("ALTER TABLE returns_new RENAME TO returns"))
                
                print("✓ Recreated returns table with nullable sale_id")
            except Exception as e:
                print(f"  Error recreating returns table: {e}")
            
            print("\nRecreating return_items table with nullable columns...")
            try:
                # Create new table
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS return_items_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        return_id INTEGER NOT NULL,
                        sale_item_id INTEGER NULL,
                        product_id INTEGER NOT NULL,
                        variation_id INTEGER NULL,
                        quantity_returned INTEGER NOT NULL,
                        unit VARCHAR(50) DEFAULT 'piece',
                        unit_price FLOAT DEFAULT 0.0,
                        total_refund FLOAT DEFAULT 0.0,
                        restocked BOOLEAN DEFAULT 1,
                        FOREIGN KEY (return_id) REFERENCES returns (id) ON DELETE CASCADE,
                        FOREIGN KEY (sale_item_id) REFERENCES sale_items (id),
                        FOREIGN KEY (product_id) REFERENCES products (id),
                        FOREIGN KEY (variation_id) REFERENCES product_variations (id)
                    )
                """))
                
                # Copy data
                conn.execute(text("""
                    INSERT INTO return_items_new 
                    SELECT id, return_id, sale_item_id, product_id, variation_id,
                           quantity_returned, unit, unit_price, total_refund, restocked
                    FROM return_items
                """))
                
                # Drop old table
                conn.execute(text("DROP TABLE return_items"))
                
                # Rename new table
                conn.execute(text("ALTER TABLE return_items_new RENAME TO return_items"))
                
                print("✓ Recreated return_items table with nullable columns")
            except Exception as e:
                print(f"  Error recreating return_items table: {e}")
            
            # Commit transaction
            trans.commit()
            print("\n✅ Migration completed successfully!")
            
        except Exception as e:
            trans.rollback()
            print(f"\n❌ Migration failed: {e}")
            raise

if __name__ == "__main__":
    migrate()
