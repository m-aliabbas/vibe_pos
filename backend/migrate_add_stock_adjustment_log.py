#!/usr/bin/env python3
"""
Migration script to add product_stock_adjustments table
"""
import os
import sqlite3


db_path = os.path.join(os.path.dirname(__file__), "pos.db")

print("Adding product_stock_adjustments table...")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS product_stock_adjustments (
            id INTEGER PRIMARY KEY,
            product_id INTEGER NOT NULL,
            adjusted_by_user_id INTEGER NOT NULL,
            quantity_before REAL NOT NULL DEFAULT 0.0,
            quantity_delta REAL NOT NULL,
            quantity_after REAL NOT NULL DEFAULT 0.0,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(product_id) REFERENCES products(id),
            FOREIGN KEY(adjusted_by_user_id) REFERENCES users(id)
        )
        """
    )

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_stock_adjustments_product_id ON product_stock_adjustments(product_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_stock_adjustments_adjusted_by_user_id ON product_stock_adjustments(adjusted_by_user_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_stock_adjustments_created_at ON product_stock_adjustments(created_at)"
    )

    conn.commit()
    print("Migration completed successfully.")
except Exception as e:
    conn.rollback()
    print(f"Migration failed: {str(e)}")
    raise
finally:
    conn.close()
