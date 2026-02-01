#!/usr/bin/env python3
"""
Migration script to add delivery_charges to sales table and item_discount to sale_items table
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "data", "pos.db")

print("🔧 Adding grocery specific fields to database...")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # 1. Update sales table
    cursor.execute("PRAGMA table_info(sales)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if "delivery_charges" not in columns:
        cursor.execute("ALTER TABLE sales ADD COLUMN delivery_charges REAL DEFAULT 0.0")
        print("✅ Added delivery_charges column to sales table")
    else:
        print("ℹ️  delivery_charges column already exists in sales table")
        
    # 2. Update sale_items table
    cursor.execute("PRAGMA table_info(sale_items)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if "item_discount" not in columns:
        cursor.execute("ALTER TABLE sale_items ADD COLUMN item_discount REAL DEFAULT 0.0")
        print("✅ Added item_discount column to sale_items table")
    else:
        print("ℹ️  item_discount column already exists in sale_items table")

    conn.commit()
    print("\n✨ Migration completed successfully!")
    
except Exception as e:
    conn.rollback()
    print(f"\n❌ Migration failed: {str(e)}")
    raise
finally:
    conn.close()
