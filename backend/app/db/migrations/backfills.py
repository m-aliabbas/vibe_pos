"""Data fixes that run only at the moment a missing column is added.

When an old database is opened and the auto-migrator adds one of these columns,
the matching backfill fills it from existing data. A database that already had
the column never runs it, so these can safely contain one-off assumptions about
historic data (for example: sales made before payment tracking were fully paid).

Register new ones in ``BACKFILLS`` as ``(table, column): sql_or_function``.
Functions receive the open ``sqlite3.Connection`` (inside the migration transaction).
"""

from __future__ import annotations

import re
import sqlite3
from typing import Callable, Union

from app.db.migrations.runner import column_names


def _customer_note_amounts(conn: sqlite3.Connection) -> None:
    """Parse amount/method out of legacy advance-payment note text."""
    if "payment_method" not in column_names(conn, "customer_notes"):
        return
    rows = conn.execute(
        "SELECT id, note_text FROM customer_notes WHERE note_type = 'advance_payment' AND amount IS NULL"
    ).fetchall()
    for note_id, text_value in rows:
        amount_match = re.search(r"(?:rs|\$)\s*([0-9.,]+)", text_value or "", re.I)
        method_match = re.search(r"via\s+([a-z_]+):", text_value or "", re.I)
        amount = float(amount_match.group(1).replace(",", "")) if amount_match else None
        method = method_match.group(1) if method_match else "cash"
        conn.execute(
            "UPDATE customer_notes SET amount = ?, payment_method = ? WHERE id = ?",
            (amount, method, note_id),
        )


BACKFILLS: dict[tuple[str, str], Union[str, Callable[[sqlite3.Connection], None]]] = {
    # Purchases recorded before discounts existed: subtotal equals the total paid.
    ("purchases", "subtotal_amount"): "UPDATE purchases SET subtotal_amount = total_amount",
    # Sales recorded before payment tracking were all paid in full.
    ("sales", "amount_paid"): "UPDATE sales SET amount_paid = total",
    # Advance-payment notes used to keep the amount only in their text.
    ("customer_notes", "amount"): _customer_note_amounts,
}


def run_backfill(conn: sqlite3.Connection, table: str, column: str) -> bool:
    action = BACKFILLS.get((table, column))
    if action is None:
        return False
    if isinstance(action, str):
        conn.execute(action)
    else:
        action(conn)
    return True
