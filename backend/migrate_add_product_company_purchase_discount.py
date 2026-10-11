"""Add product company and vendor-purchase discount fields safely.

Run from ``backend/`` with:
    python migrate_add_product_company_purchase_discount.py

``DATA_DIR`` may point at a disposable or deployed data directory. The
migration is idempotent and preserves existing purchase totals.
"""

import os
import sqlite3
from pathlib import Path


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {
        str(row[1])
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone() is not None


def migrate(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        if _table_exists(connection, "products"):
            product_columns = _columns(connection, "products")
            if "company" not in product_columns:
                connection.execute("ALTER TABLE products ADD COLUMN company TEXT")
            connection.execute(
                "CREATE INDEX IF NOT EXISTS ix_products_company ON products (company)"
            )

        if _table_exists(connection, "purchases"):
            purchase_columns = _columns(connection, "purchases")
            if "subtotal_amount" not in purchase_columns:
                connection.execute(
                    "ALTER TABLE purchases ADD COLUMN subtotal_amount REAL DEFAULT 0"
                )
            if "discount" not in purchase_columns:
                connection.execute(
                    "ALTER TABLE purchases ADD COLUMN discount REAL DEFAULT 0"
                )
            connection.execute(
                "UPDATE purchases "
                "SET subtotal_amount = total_amount "
                "WHERE subtotal_amount IS NULL "
                "OR (subtotal_amount = 0 AND COALESCE(total_amount, 0) != 0)"
            )
            connection.execute(
                "UPDATE purchases SET discount = 0 WHERE discount IS NULL"
            )

        connection.commit()


if __name__ == "__main__":
    data_dir = Path(os.environ.get("DATA_DIR", "data"))
    database_path = data_dir / "pos.db"
    if not database_path.exists():
        print(f"Database not found at {database_path}; application startup will create it")
    else:
        migrate(database_path)
        print("Product company and purchase discount migration complete")
