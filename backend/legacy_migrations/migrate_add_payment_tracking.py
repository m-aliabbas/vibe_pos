#!/usr/bin/env python3
"""
Migration script to add payment tracking fields to sales table
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "pos.db")

print("🔧 Adding payment tracking fields to sales table...")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Check if columns already exist
    cursor.execute("PRAGMA table_info(sales)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if "amount_paid" not in columns:
        cursor.execute("ALTER TABLE sales ADD COLUMN amount_paid REAL DEFAULT 0.0")
        print("✅ Added amount_paid column")
    else:
        print("ℹ️  amount_paid column already exists")
    
    if "amount_due" not in columns:
        cursor.execute("ALTER TABLE sales ADD COLUMN amount_due REAL DEFAULT 0.0")
        print("✅ Added amount_due column")
    else:
        print("ℹ️  amount_due column already exists")
    
    if "change_amount" not in columns:
        cursor.execute("ALTER TABLE sales ADD COLUMN change_amount REAL DEFAULT 0.0")
        print("✅ Added change_amount column")
    else:
        print("ℹ️  change_amount column already exists")
    
    # Update existing sales to have amount_paid = total (assume all were fully paid)
    cursor.execute("UPDATE sales SET amount_paid = total WHERE amount_paid = 0")
    updated = cursor.rowcount
    print(f"✅ Updated {updated} existing sales to show full payment")
    
    conn.commit()
    print("\n✨ Migration completed successfully!")
    
except Exception as e:
    conn.rollback()
    print(f"\n❌ Migration failed: {str(e)}")
    raise
finally:
    conn.close()
