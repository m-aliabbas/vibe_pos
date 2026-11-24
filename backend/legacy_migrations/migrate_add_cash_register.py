#!/usr/bin/env python3
"""Add the cash drawer feature toggle and cash_register_sessions table safely."""

import sqlite3
from pathlib import Path
from typing import Optional


DB_PATHS = [
    Path("backend/data/pos.db"),
    Path("data/pos.db"),
    Path("pos.db"),
]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cash_register_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    opening_cash REAL DEFAULT 0.0,
    opened_at DATETIME,
    closing_cash REAL,
    expected_cash REAL,
    difference REAL,
    closed_at DATETIME,
    status TEXT DEFAULT 'open',
    notes TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
)
"""


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
        if table_exists:
            existing = {
                row[1] for row in conn.execute("PRAGMA table_info(store_settings)").fetchall()
            }
            if "cash_register_enabled" not in existing:
                conn.execute(
                    "ALTER TABLE store_settings ADD COLUMN cash_register_enabled BOOLEAN DEFAULT 0"
                )
                print("Added store_settings.cash_register_enabled")
        else:
            print("store_settings table does not exist yet; application startup will create it")

        conn.execute(CREATE_TABLE_SQL)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS ix_cash_register_sessions_user_id ON cash_register_sessions(user_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS ix_cash_register_sessions_opened_at ON cash_register_sessions(opened_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS ix_cash_register_sessions_status ON cash_register_sessions(status)"
        )
        conn.commit()
        print("Cash register migration complete")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
