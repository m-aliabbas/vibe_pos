#!/usr/bin/env python3
"""
Migration script to add prepaid_credit column to customers table
This tracks when a customer pays more than they owe (overpayment/advance)
"""
import sqlite3
import os

# Get the database path
db_path = os.path.join(os.path.dirname(__file__), "pos.db")
# Also try data/pos.db
if not os.path.exists(db_path):
    db_path = os.path.join(os.path.dirname(__file__), "data", "pos.db")

print("🔧 Adding prepaid_credit column to customers table...")
print(f"   Database: {db_path}")

if not os.path.exists(db_path):
    print(f"❌ Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Check if column already exists
    cursor.execute("PRAGMA table_info(customers)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'prepaid_credit' in columns:
        print("✅ Column 'prepaid_credit' already exists in customers table")
    else:
        # Add the column
        cursor.execute("ALTER TABLE customers ADD COLUMN prepaid_credit REAL DEFAULT 0.0")
        conn.commit()
        print("✅ Successfully added 'prepaid_credit' column to customers table")
    
except Exception as e:
    print(f"❌ Error: {e}")
    conn.rollback()
finally:
    conn.close()

print("\n✨ Migration complete! Customers can now have prepaid credit/advance balance.")
