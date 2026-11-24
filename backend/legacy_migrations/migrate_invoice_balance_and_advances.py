#!/usr/bin/env python3
"""Add invoice balance snapshots and structured buy-on-behalf fields."""
import os
import re
import sqlite3

db_path = os.path.join(os.path.dirname(__file__), "data", "pos.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    additions = {
        "sales": [("previous_balance", "REAL DEFAULT 0")],
        "customer_notes": [("amount", "REAL"), ("payment_method", "TEXT")],
    }
    for table, columns in additions.items():
        cursor.execute(f"PRAGMA table_info({table})")
        existing = {row[1] for row in cursor.fetchall()}
        for name, definition in columns:
            if name not in existing:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
                print(f"Added {table}.{name}")

    # Backfill structured values from the legacy display text.
    cursor.execute(
        "SELECT id, note_text FROM customer_notes "
        "WHERE note_type = 'advance_payment' AND amount IS NULL"
    )
    for note_id, text_value in cursor.fetchall():
        amount_match = re.search(r"(?:rs|\$)\s*([0-9.,]+)", text_value or "", re.I)
        method_match = re.search(r"via\s+([a-z_]+):", text_value or "", re.I)
        amount = float(amount_match.group(1).replace(",", "")) if amount_match else None
        method = method_match.group(1) if method_match else "cash"
        cursor.execute(
            "UPDATE customer_notes SET amount = ?, payment_method = ? WHERE id = ?",
            (amount, method, note_id),
        )

    conn.commit()
    print("Migration complete")
except Exception:
    conn.rollback()
    raise
finally:
    conn.close()
