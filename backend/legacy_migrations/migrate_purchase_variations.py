"""
Migration script to add variation support to purchase_items.
"""
import sqlite3

def migrate_database():
    conn = sqlite3.connect('pos.db')
    cursor = conn.cursor()
    
    try:
        # Check if column exists before adding
        cursor.execute("PRAGMA table_info(purchase_items)")
        existing_columns = [col[1] for col in cursor.fetchall()]
        
        # Add variation_id column to purchase_items
        if 'variation_id' not in existing_columns:
            print("Adding variation_id column to purchase_items...")
            cursor.execute("ALTER TABLE purchase_items ADD COLUMN variation_id INTEGER")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_purchase_items_variation_id ON purchase_items(variation_id)")
        
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
