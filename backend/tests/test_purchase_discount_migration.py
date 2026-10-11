import sqlite3
from pathlib import Path

from backend.migrate_add_product_company_purchase_discount import migrate


def test_purchase_discount_migration_is_idempotent(tmp_path: Path) -> None:
    db_path = tmp_path / "pos.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
        )
        connection.execute(
            "INSERT INTO products (id, name) VALUES (1, 'Existing product')"
        )
        connection.execute(
            "CREATE TABLE purchases ("
            "id INTEGER PRIMARY KEY, total_amount REAL NOT NULL"
            ")"
        )
        connection.execute(
            "INSERT INTO purchases (id, total_amount) VALUES (1, 125.5)"
        )

    migrate(db_path)
    migrate(db_path)

    with sqlite3.connect(db_path) as connection:
        product_columns = _column_names(connection, "products")
        purchase_columns = _column_names(connection, "purchases")
        # The packaged server performs this ORM-equivalent read while seeding,
        # before app.main gets a chance to run its fallback schema repair.
        product_row = connection.execute(
            "SELECT id, name, company FROM products WHERE id = 1"
        ).fetchone()
        row = connection.execute(
            "SELECT total_amount, subtotal_amount, discount FROM purchases WHERE id = 1"
        ).fetchone()

    assert "company" in product_columns
    assert {"subtotal_amount", "discount"}.issubset(purchase_columns)
    assert product_row == (1, "Existing product", None)
    assert row == (125.5, 125.5, 0.0)


def _column_names(connection: sqlite3.Connection, table: str) -> set[str]:
    return {
        str(row[1])
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }
