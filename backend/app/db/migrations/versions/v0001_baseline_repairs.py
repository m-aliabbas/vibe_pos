"""Repairs that app/main.py used to run on every startup, now run once per database."""

import sqlite3

from app.db.migrations.runner import column_names, table_names

VERSION = "0001"
DESCRIPTION = "Baseline: purchase subtotal/discount repair"
# A brand-new database is created from the models and needs no repair.
RUN_ON_FRESH_DB = False


def upgrade(conn: sqlite3.Connection) -> None:
    if "purchases" not in table_names(conn):
        return
    columns = column_names(conn, "purchases")
    if {"subtotal_amount", "total_amount"} <= columns:
        conn.execute(
            "UPDATE purchases SET subtotal_amount = total_amount "
            "WHERE subtotal_amount IS NULL "
            "OR (subtotal_amount = 0 AND COALESCE(total_amount, 0) != 0)"
        )
    if "discount" in columns:
        conn.execute("UPDATE purchases SET discount = 0 WHERE discount IS NULL")
