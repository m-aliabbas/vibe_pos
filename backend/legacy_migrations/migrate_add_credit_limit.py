#!/usr/bin/env python3
"""
Migration script to add credit_limit to the customers table.
- Adds credit_limit column (REAL, nullable) — NULL means unlimited
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "data", "pos.db")

print("🔧 Adding credit_limit column to customers table...")
print(f"   Database: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("PRAGMA table_info(customers)")
    columns = [row[1] for row in cursor.fetchall()]

    if 'credit_limit' not in columns:
        cursor.execute("ALTER TABLE customers ADD COLUMN credit_limit REAL")
        print("✅ Added credit_limit column (NULL = unlimited)")
    else:
        print("⚠️  credit_limit column already exists — skipping")

    conn.commit()
    print("\n✅ Migration complete.")

except Exception as e:
    conn.rollback()
    print(f"\n❌ Migration failed: {e}")
    raise

finally:
    conn.close()
