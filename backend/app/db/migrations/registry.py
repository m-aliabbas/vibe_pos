from __future__ import annotations

import hashlib
import inspect
import re
import sqlite3
from dataclasses import dataclass
from typing import Callable


MigrationCallable = Callable[[sqlite3.Connection], None]


@dataclass(frozen=True)
class Migration:
    migration_id: str
    description: str
    apply: MigrationCallable
    supported_providers: tuple[str, ...] = ("sqlite",)

    @property
    def checksum(self) -> str:
        source = inspect.getsource(self.apply).encode("utf-8")
        return hashlib.sha256(source).hexdigest()


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
        raise ValueError(f"Unsafe table name: {table!r}")
    return {str(row[1]) for row in connection.execute(f'PRAGMA table_info("{table}")')}


def _add_column_if_missing(
    connection: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    if table not in _table_names(connection) or column in _columns(connection, table):
        return
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", column):
        raise ValueError(f"Unsafe column name: {column!r}")
    connection.execute(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}')


def _table_names(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }


def establish_legacy_baseline(connection: sqlite3.Connection) -> None:
    """Record the last schema guaranteed by the legacy startup path.

    Legacy standalone scripts had no shared history. This migration intentionally
    performs only idempotent checks for columns that the application previously
    added at startup, so already-upgraded databases are stamped without replaying
    historical data transformations.
    """

    additions = {
        "products": (
            ("has_variations", "BOOLEAN DEFAULT 0"),
            ("variation_attributes", "TEXT DEFAULT '[]'"),
            ("base_unit", "TEXT DEFAULT 'piece'"),
            ("selling_units", "TEXT DEFAULT '[]'"),
            ("allow_decimal_qty", "BOOLEAN DEFAULT 0"),
        ),
    }
    for table, columns in additions.items():
        for column, definition in columns:
            _add_column_if_missing(connection, table, column, definition)


def migrate_startup_column_additions(connection: sqlite3.Connection) -> None:
    """Replace the unversioned ``app.main.ensure_schema_columns`` mutation."""

    additions = {
        "sales": (("previous_balance", "REAL DEFAULT 0"),),
        "customer_notes": (
            ("amount", "REAL"),
            ("payment_method", "VARCHAR"),
        ),
    }
    for table, columns in additions.items():
        for column, definition in columns:
            _add_column_if_missing(connection, table, column, definition)


MIGRATIONS: tuple[Migration, ...] = (
    Migration(
        migration_id="0001_legacy_schema_baseline",
        description="Baseline legacy product schema additions",
        apply=establish_legacy_baseline,
    ),
    Migration(
        migration_id="0002_startup_column_additions",
        description="Version the schema columns formerly added during import",
        apply=migrate_startup_column_additions,
    ),
)


def validate_registry(migrations: tuple[Migration, ...] = MIGRATIONS) -> None:
    identifiers = [migration.migration_id for migration in migrations]
    if identifiers != sorted(identifiers):
        raise ValueError("Migration registry must be ordered by migration_id")
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Migration identifiers must be unique")


validate_registry()
