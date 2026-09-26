from __future__ import annotations

import hashlib
import inspect
import re
import sqlite3
from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from sqlalchemy.engine import Connection


MigrationCallable = Callable[[sqlite3.Connection], None]
SQLAlchemyMigrationCallable = Callable[["Connection"], None]


@dataclass(frozen=True)
class Migration:
    migration_id: str
    description: str
    apply: MigrationCallable
    supported_providers: tuple[str, ...] = ("sqlite",)
    apply_sqlalchemy: SQLAlchemyMigrationCallable | None = None
    declared_checksum: str | None = None

    @property
    def checksum(self) -> str:
        if self.declared_checksum is not None:
            return self.declared_checksum
        return self.source_checksum()

    def source_checksum(self) -> str:
        """Calculate a development-time checksum; source is absent when frozen."""
        source = inspect.getsource(self.apply).encode("utf-8")
        if self.apply_sqlalchemy is not None:
            source += b"\n--sqlalchemy--\n" + inspect.getsource(
                self.apply_sqlalchemy
            ).encode("utf-8")
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


def migrate_retail_business_configuration(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS business_configuration (
            id INTEGER PRIMARY KEY,
            application_id VARCHAR(255) NOT NULL DEFAULT 'retail',
            profile_id VARCHAR(255) NOT NULL DEFAULT 'retail',
            enabled_modules_json TEXT NOT NULL DEFAULT '[]'
        )
        """
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO business_configuration
            (id, application_id, profile_id, enabled_modules_json)
        VALUES (1, 'retail', 'retail', '[]')
        """
    )


def migrate_retail_business_configuration_sqlalchemy(connection) -> None:
    from sqlalchemy import text

    existing = connection.execute(
        text("SELECT id FROM business_configuration WHERE id = 1")
    ).first()
    if existing is None:
        connection.execute(
            text(
                "INSERT INTO business_configuration "
                "(id, application_id, profile_id, enabled_modules_json) "
                "VALUES (1, 'retail', 'retail', '[]')"
            )
        )


MIGRATIONS: tuple[Migration, ...] = (
    Migration(
        migration_id="0001_legacy_schema_baseline",
        description="Baseline legacy product schema additions",
        apply=establish_legacy_baseline,
        declared_checksum="a2534de63ad44603b27f64ea47c4b7984f510a91e3d1c0a7b532e4fa4412774f",
    ),
    Migration(
        migration_id="0002_startup_column_additions",
        description="Version the schema columns formerly added during import",
        apply=migrate_startup_column_additions,
        declared_checksum="f76e485a82389fea6c4d833608029fd2948b2a994f0866cfe2834f7df2a1ea59",
    ),
    Migration(
        migration_id="0003_retail_business_configuration",
        description="Persist the retail application and business-profile default",
        apply=migrate_retail_business_configuration,
        supported_providers=("sqlite", "postgresql", "mysql"),
        apply_sqlalchemy=migrate_retail_business_configuration_sqlalchemy,
        declared_checksum="11c0a106435d7eabb984e3f526c7830cc20560b16020dbf48ab389f0f616c16b",
    ),
)


def validate_registry(migrations: tuple[Migration, ...] = MIGRATIONS) -> None:
    identifiers = [migration.migration_id for migration in migrations]
    if identifiers != sorted(identifiers):
        raise ValueError("Migration registry must be ordered by migration_id")
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Migration identifiers must be unique")


validate_registry()
