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


def migrate_catalog_item_types(connection: sqlite3.Connection) -> None:
    if "products" not in _table_names(connection):
        return
    if "item_type" not in _columns(connection, "products"):
        connection.execute(
            "ALTER TABLE products ADD COLUMN item_type VARCHAR(32) NOT NULL DEFAULT 'stock'"
        )


def migrate_catalog_item_types_sqlalchemy(connection) -> None:
    from sqlalchemy import inspect, text

    inspector = inspect(connection)
    if not inspector.has_table("products"):
        return
    columns = {column["name"] for column in inspector.get_columns("products")}
    if "item_type" not in columns:
        connection.execute(
            text("ALTER TABLE products ADD COLUMN item_type VARCHAR(32) NOT NULL DEFAULT 'stock'")
        )


def migrate_store_settings_extensions(connection: sqlite3.Connection) -> None:
    """Add expense/cash-register/invoice-design/WhatsApp-report columns to store_settings."""
    if "store_settings" not in _table_names(connection):
        return
    additions = (
        ("store_logo_filename", "TEXT"),
        ("default_print_format", "VARCHAR DEFAULT 'compact'"),
        ("default_whatsapp_format", "VARCHAR DEFAULT 'mobile'"),
        ("default_print_design", "VARCHAR DEFAULT 'classic'"),
        ("default_whatsapp_design", "VARCHAR DEFAULT 'modern'"),
        ("invoice_show_tax_id", "BOOLEAN DEFAULT 1"),
        ("invoice_show_cashier", "BOOLEAN DEFAULT 1"),
        ("invoice_show_sku", "BOOLEAN DEFAULT 0"),
        ("invoice_show_customer_balance", "BOOLEAN DEFAULT 1"),
        ("invoice_footer_message", "TEXT DEFAULT 'Thank you for your business!'"),
        ("invoice_terms", "TEXT DEFAULT 'Return and exchange accepted with invoice.'"),
        ("whatsapp_owner_number", "VARCHAR DEFAULT ''"),
        ("whatsapp_daily_report_enabled", "BOOLEAN DEFAULT 0"),
        ("whatsapp_daily_report_time", "VARCHAR DEFAULT '09:00'"),
        ("whatsapp_last_daily_report_date", "DATE"),
        ("cash_register_enabled", "BOOLEAN DEFAULT 0"),
    )
    for column, definition in additions:
        _add_column_if_missing(connection, "store_settings", column, definition)


def migrate_store_settings_extensions_sqlalchemy(connection) -> None:
    from sqlalchemy import inspect, text

    inspector = inspect(connection)
    if not inspector.has_table("store_settings"):
        return
    existing = {column["name"] for column in inspector.get_columns("store_settings")}
    additions = (
        ("store_logo_filename", "VARCHAR(255)"),
        ("default_print_format", "VARCHAR(255) DEFAULT 'compact'"),
        ("default_whatsapp_format", "VARCHAR(255) DEFAULT 'mobile'"),
        ("default_print_design", "VARCHAR(255) DEFAULT 'classic'"),
        ("default_whatsapp_design", "VARCHAR(255) DEFAULT 'modern'"),
        ("invoice_show_tax_id", "BOOLEAN DEFAULT TRUE"),
        ("invoice_show_cashier", "BOOLEAN DEFAULT TRUE"),
        ("invoice_show_sku", "BOOLEAN DEFAULT FALSE"),
        ("invoice_show_customer_balance", "BOOLEAN DEFAULT TRUE"),
        ("invoice_footer_message", "TEXT"),
        ("invoice_terms", "TEXT"),
        ("whatsapp_owner_number", "VARCHAR(255) DEFAULT ''"),
        ("whatsapp_daily_report_enabled", "BOOLEAN DEFAULT FALSE"),
        ("whatsapp_daily_report_time", "VARCHAR(255) DEFAULT '09:00'"),
        ("whatsapp_last_daily_report_date", "DATE"),
        ("cash_register_enabled", "BOOLEAN DEFAULT FALSE"),
    )
    for column, definition in additions:
        if column not in existing:
            connection.execute(
                text(f'ALTER TABLE store_settings ADD COLUMN "{column}" {definition}')
            )


def migrate_product_company_and_purchase_discounts(connection: sqlite3.Connection) -> None:
    """Add product company metadata and invoice-level purchase discounts."""
    _add_column_if_missing(connection, "products", "company", "VARCHAR")
    _add_column_if_missing(connection, "purchases", "subtotal_amount", "REAL DEFAULT 0")
    _add_column_if_missing(connection, "purchases", "discount", "REAL DEFAULT 0")
    if "purchases" in _table_names(connection):
        connection.execute(
            "UPDATE purchases SET subtotal_amount = total_amount "
            "WHERE subtotal_amount IS NULL OR subtotal_amount = 0"
        )


def migrate_product_company_and_purchase_discounts_sqlalchemy(connection) -> None:
    from sqlalchemy import inspect, text

    inspector = inspect(connection)
    if inspector.has_table("products"):
        product_columns = {column["name"] for column in inspector.get_columns("products")}
        if "company" not in product_columns:
            connection.execute(text('ALTER TABLE products ADD COLUMN company VARCHAR(255)'))
    if inspector.has_table("purchases"):
        purchase_columns = {column["name"] for column in inspector.get_columns("purchases")}
        if "subtotal_amount" not in purchase_columns:
            connection.execute(text('ALTER TABLE purchases ADD COLUMN subtotal_amount FLOAT DEFAULT 0'))
        if "discount" not in purchase_columns:
            connection.execute(text('ALTER TABLE purchases ADD COLUMN discount FLOAT DEFAULT 0'))
        connection.execute(
            text(
                "UPDATE purchases SET subtotal_amount = total_amount "
                "WHERE subtotal_amount IS NULL OR subtotal_amount = 0"
            )
        )


def _selected_application_identity() -> tuple[str, str]:
    import os

    from app.platform.identifiers import ApplicationId

    application_id = ApplicationId(os.environ.get("APPLICATION_ID", "retail"))
    return application_id.value, application_id.value


def migrate_application_identity(connection: sqlite3.Connection) -> None:
    application_id, profile_id = _selected_application_identity()
    row = connection.execute(
        "SELECT application_id FROM business_configuration WHERE id = 1"
    ).fetchone()
    if row is None:
        connection.execute(
            "INSERT INTO business_configuration "
            "(id, application_id, profile_id, enabled_modules_json) VALUES (1, ?, ?, '[]')",
            (application_id, profile_id),
        )
        return
    if row[0] == application_id:
        return

    tables = {
        str(item[0])
        for item in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    protected_tables = tables - {"business_configuration", "schema_migrations"}
    for table in sorted(protected_tables):
        escaped_name = table.replace('"', '""')
        if connection.execute(f'SELECT 1 FROM "{escaped_name}" LIMIT 1').fetchone():
            raise RuntimeError(
                f"Database belongs to {row[0]!r} and contains data; "
                f"refusing to assign it to {application_id!r}"
            )

    connection.execute(
        "UPDATE business_configuration SET application_id = ?, profile_id = ?, "
        "enabled_modules_json = '[]' WHERE id = 1",
        (application_id, profile_id),
    )


def migrate_application_identity_sqlalchemy(connection) -> None:
    from sqlalchemy import MetaData, Table, inspect, select, text

    application_id, profile_id = _selected_application_identity()
    existing = connection.execute(
        text("SELECT application_id FROM business_configuration WHERE id = 1")
    ).first()
    if existing is None:
        connection.execute(
            text(
                "INSERT INTO business_configuration "
                "(id, application_id, profile_id, enabled_modules_json) "
                "VALUES (1, :application_id, :profile_id, '[]')"
            ),
            {"application_id": application_id, "profile_id": profile_id},
        )
        return
    if existing.application_id == application_id:
        return

    metadata = MetaData()
    tables = set(inspect(connection).get_table_names()) - {
        "business_configuration",
        "schema_migrations",
    }
    for table_name in sorted(tables):
        table = Table(table_name, metadata, autoload_with=connection)
        if connection.execute(select(table).limit(1)).first() is not None:
            raise RuntimeError(
                f"Database belongs to {existing.application_id!r} and contains data; "
                f"refusing to assign it to {application_id!r}"
            )

    connection.execute(
        text(
            "UPDATE business_configuration SET application_id = :application_id, "
            "profile_id = :profile_id, enabled_modules_json = '[]' WHERE id = 1"
        ),
        {"application_id": application_id, "profile_id": profile_id},
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
    Migration(
        migration_id="0004_catalog_item_types",
        description="Add typed catalog item classification with stock compatibility default",
        apply=migrate_catalog_item_types,
        supported_providers=("sqlite", "postgresql", "mysql"),
        apply_sqlalchemy=migrate_catalog_item_types_sqlalchemy,
        declared_checksum="f4c738c6b175539576ab4e6b43032b32ca53bb478a8f821c4aea5629f6e6a7a7",
    ),
    Migration(
        migration_id="0005_application_identity",
        description="Bind fresh empty databases to their selected application target",
        apply=migrate_application_identity,
        supported_providers=("sqlite", "postgresql", "mysql"),
        apply_sqlalchemy=migrate_application_identity_sqlalchemy,
        declared_checksum="de7aaf8f1eeaa00d01920ff0cc7a9f2352a19ac9b9b5027e680463672c3e70c8",
    ),
    Migration(
        migration_id="0006_store_settings_extensions",
        description="Add invoice-design, WhatsApp-report, and cash-register columns to store_settings",
        apply=migrate_store_settings_extensions,
        supported_providers=("sqlite", "postgresql", "mysql"),
        apply_sqlalchemy=migrate_store_settings_extensions_sqlalchemy,
    ),
    Migration(
        migration_id="0007_product_company_and_purchase_discounts",
        description="Add product company metadata and purchase discount totals",
        apply=migrate_product_company_and_purchase_discounts,
        supported_providers=("sqlite", "postgresql", "mysql"),
        apply_sqlalchemy=migrate_product_company_and_purchase_discounts_sqlalchemy,
    ),
)


def validate_registry(migrations: tuple[Migration, ...] = MIGRATIONS) -> None:
    identifiers = [migration.migration_id for migration in migrations]
    if identifiers != sorted(identifiers):
        raise ValueError("Migration registry must be ordered by migration_id")
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Migration identifiers must be unique")


validate_registry()
