"""Add invoice design and optional logo settings to existing SQLite installs."""

import os
import sqlite3
from pathlib import Path


COLUMNS = {
    "store_logo_filename": "TEXT",
    "default_print_format": "TEXT DEFAULT 'compact'",
    "default_whatsapp_format": "TEXT DEFAULT 'mobile'",
    "default_print_design": "TEXT DEFAULT 'classic'",
    "default_whatsapp_design": "TEXT DEFAULT 'modern'",
    "invoice_show_tax_id": "BOOLEAN DEFAULT 1",
    "invoice_show_cashier": "BOOLEAN DEFAULT 1",
    "invoice_show_sku": "BOOLEAN DEFAULT 0",
    "invoice_show_customer_balance": "BOOLEAN DEFAULT 1",
    "invoice_footer_message": "TEXT DEFAULT 'Thank you for your business!'",
    "invoice_terms": "TEXT DEFAULT 'Return and exchange accepted with invoice.'",
}


def migrate(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        table_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_settings'"
        ).fetchone()
        if not table_exists:
            print("store_settings table does not exist; application startup will create it")
            return

        existing = {
            row[1] for row in connection.execute("PRAGMA table_info(store_settings)").fetchall()
        }
        for name, definition in COLUMNS.items():
            if name not in existing:
                connection.execute(f"ALTER TABLE store_settings ADD COLUMN {name} {definition}")
                print(f"Added store_settings.{name}")
        connection.commit()


if __name__ == "__main__":
    data_dir = Path(os.environ.get("DATA_DIR", "data"))
    migrate(data_dir / "pos.db")
    print("Invoice design settings migration complete")
