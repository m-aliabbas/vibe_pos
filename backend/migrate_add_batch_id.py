#!/usr/bin/env python3
"""
Migration script to add batch_id column to purchase_items and sale_items tables.
"""
import os
import sqlite3

db_path = os.path.join(os.path.dirname(__file__), "data", "pos.db")

print(f"Running migration on: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("PRAGMA table_info(purchase_items)")
    cols = [r[1] for r in cursor.fetchall()]
    if "batch_id" not in cols:
        cursor.execute(
            "ALTER TABLE purchase_items ADD COLUMN batch_id INTEGER REFERENCES stock_batches(id)"
        )
        print("Added batch_id to purchase_items")
    else:
        print("purchase_items.batch_id already exists, skipping.")

    cursor.execute("PRAGMA table_info(sale_items)")
    cols = [r[1] for r in cursor.fetchall()]
    if "batch_id" not in cols:
        cursor.execute(
            "ALTER TABLE sale_items ADD COLUMN batch_id INTEGER REFERENCES stock_batches(id)"
        )
        print("Added batch_id to sale_items")
    else:
        print("sale_items.batch_id already exists, skipping.")

    conn.commit()
    print("Migration completed successfully.")
except Exception as e:
    conn.rollback()
    print(f"Migration failed: {e}")
    raise
finally:
    conn.close()
