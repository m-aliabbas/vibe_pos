"""
Add allow_decimal_qty column to products table for point/float sale quantities.
"""
import sqlite3
from pathlib import Path


DB_PATHS = [
    Path("backend/data/pos.db"),
    Path("data/pos.db"),
    Path("pos.db"),
]


def migrate() -> None:
    db_path = next((p for p in DB_PATHS if p.exists()), None)
    if not db_path:
        print("Database file not found. Checked:", ", ".join(str(p) for p in DB_PATHS))
        return

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(products)")
        existing_columns = [row[1] for row in cursor.fetchall()]

        if "allow_decimal_qty" in existing_columns:
            print("allow_decimal_qty already exists. Nothing to do.")
            return

        cursor.execute("ALTER TABLE products ADD COLUMN allow_decimal_qty BOOLEAN DEFAULT 0")
        conn.commit()
        print(f"Migration successful: added allow_decimal_qty to products in {db_path}")
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
