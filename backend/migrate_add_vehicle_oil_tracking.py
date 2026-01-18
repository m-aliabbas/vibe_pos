#!/usr/bin/env python3
"""
Migration script to add Vehicle Oil Change Tracking to Customer
- Adds current_mileage column
- Adds oil_change_interval column
- Adds next_oil_change_mileage column
"""
import sqlite3
import os
from datetime import datetime

# Database path
# it is in data/pos.db relative to this script
db_path = os.path.join(os.path.dirname(__file__), "data", "pos.db")

print("🔧 Adding Vehicle Oil Change Tracking to Customers...")
print(f"   Database: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # =====================
    # Add new columns to customers table
    # =====================
    print("\n📋 Adding oil change tracking columns to customers table...")
    
    # Check if columns exist before adding
    cursor.execute("PRAGMA table_info(customers)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if 'current_mileage' not in columns:
        cursor.execute("""
            ALTER TABLE customers 
            ADD COLUMN current_mileage INTEGER
        """)
        print("✅ Added current_mileage column")
    else:
        print("⚠️  current_mileage column already exists")
    
    if 'oil_change_interval' not in columns:
        cursor.execute("""
            ALTER TABLE customers 
            ADD COLUMN oil_change_interval INTEGER
        """)
        print("✅ Added oil_change_interval column")
    else:
        print("⚠️  oil_change_interval column already exists")
    
    if 'next_oil_change_mileage' not in columns:
        cursor.execute("""
            ALTER TABLE customers 
            ADD COLUMN next_oil_change_mileage INTEGER
        """)
        print("✅ Added next_oil_change_mileage column")
    else:
        print("⚠️  next_oil_change_mileage column already exists")
    
    conn.commit()
    print("\n✅ Vehicle Oil Change Tracking migration completed successfully!")
    
except Exception as e:
    conn.rollback()
    print(f"\n❌ Migration failed: {str(e)}")
    raise
finally:
    conn.close()
