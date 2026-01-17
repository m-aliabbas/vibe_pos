"""
Migration script to add variation and unit support to sale_items.
"""
import sqlite3

def migrate_database():
    conn = sqlite3.connect('pos.db')
    cursor = conn.cursor()
    
    try:
        # Check if columns exist before adding
        cursor.execute("PRAGMA table_info(sale_items)")
        existing_columns = [col[1] for col in cursor.fetchall()]
        
        # Add variation_id column to sale_items
        if 'variation_id' not in existing_columns:
            print("Adding variation_id column to sale_items...")
            cursor.execute("ALTER TABLE sale_items ADD COLUMN variation_id INTEGER")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sale_items_variation_id ON sale_items(variation_id)")
        
        # Add unit column to sale_items
        if 'unit' not in existing_columns:
            print("Adding unit column to sale_items...")
            cursor.execute("ALTER TABLE sale_items ADD COLUMN unit TEXT DEFAULT 'piece'")
        
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
