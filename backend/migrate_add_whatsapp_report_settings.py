#!/usr/bin/env python3
"""Add private WhatsApp owner and scheduled-report settings safely."""

import sqlite3
from pathlib import Path
from typing import Optional


DB_PATHS = [
    Path("backend/data/pos.db"),
    Path("data/pos.db"),
    Path("pos.db"),
]

ADDITIONS = [
    ("whatsapp_owner_number", "TEXT DEFAULT ''"),
    ("whatsapp_daily_report_enabled", "BOOLEAN DEFAULT 0"),
    ("whatsapp_daily_report_time", "TEXT DEFAULT '09:00'"),
    ("whatsapp_last_daily_report_date", "DATE"),
]


def migrate(db_path: Optional[Path] = None) -> None:
    selected_path = db_path or next((path for path in DB_PATHS if path.exists()), None)
    if selected_path is None:
        print("Database file not found. Checked:", ", ".join(map(str, DB_PATHS)))
        return

    conn = sqlite3.connect(str(selected_path))
    try:
        table_exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_settings'"
        ).fetchone()
        if not table_exists:
            print("store_settings table does not exist yet; application startup will create it")
            return

        existing = {
            row[1] for row in conn.execute("PRAGMA table_info(store_settings)").fetchall()
        }
        for column, definition in ADDITIONS:
            if column not in existing:
                conn.execute(
                    f"ALTER TABLE store_settings ADD COLUMN {column} {definition}"
                )
                print(f"Added store_settings.{column}")
        conn.commit()
        print("WhatsApp report settings migration complete")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
