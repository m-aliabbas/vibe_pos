from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path


IMPORT_ROOT = tempfile.TemporaryDirectory(prefix="vibepos-provider-import-")
os.environ.setdefault("DATA_DIR", str(Path(IMPORT_ROOT.name) / "data"))
os.environ.setdefault("LICENSE_ENFORCEMENT", "false")

from pydantic import ValidationError
from sqlalchemy import create_engine, literal, select, text
from sqlalchemy.dialects import mysql, postgresql, sqlite

from app.core.config import Settings
from app.db.base import Base
from app.db.providers import create_provider
from app.db.providers.base import DatabaseProviderError
from app.db.query_helpers import report_period
from app.db.transfer import transfer_database
from app.models.customer import Customer
from app.models.product import Product


class DatabaseProviderTests(unittest.TestCase):
    def sqlite_settings(self, database_path: Path, *, maintenance: bool = False) -> Settings:
        return Settings(
            _env_file=None,
            DATA_DIR=str(database_path.parent),
            DATABASE_PROVIDER="sqlite",
            DATABASE_URL=f"sqlite:///{database_path}",
            DATABASE_MAINTENANCE_MODE=maintenance,
            LICENSE_ENFORCEMENT=False,
        )

    def test_default_configuration_preserves_app_data_sqlite_path(self) -> None:
        root = Path(IMPORT_ROOT.name) / "default"
        settings = Settings(_env_file=None, DATA_DIR=str(root), LICENSE_ENFORCEMENT=False)
        self.assertEqual(settings.DATABASE_PROVIDER, "sqlite")
        self.assertEqual(settings.resolved_database_url, f"sqlite:///{root.resolve() / 'pos.db'}")

    def test_server_provider_requires_matching_explicit_url(self) -> None:
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, DATABASE_PROVIDER="postgresql", DATABASE_URL=None)
        with self.assertRaises(ValidationError):
            Settings(
                _env_file=None,
                DATABASE_PROVIDER="mysql",
                DATABASE_URL="postgresql+psycopg://user:secret@db/pos",
            )

    def test_credentials_are_redacted_from_provider_diagnostics(self) -> None:
        settings = Settings(
            _env_file=None,
            DATABASE_PROVIDER="postgresql",
            DATABASE_URL="postgresql+psycopg://vibepos:super-secret@127.0.0.1:1/pos",
            DATABASE_CONNECT_TIMEOUT=1,
        )
        provider = create_provider(settings)
        self.assertNotIn("super-secret", provider.redacted_url)
        engine = provider.create_engine()
        try:
            with self.assertRaises(DatabaseProviderError) as raised:
                provider.health_check(engine)
            self.assertNotIn("super-secret", str(raised.exception))
            self.assertIn("127.0.0.1", str(raised.exception))
        finally:
            engine.dispose()

    def test_sqlite_provider_enforces_runtime_pragmas(self) -> None:
        with tempfile.TemporaryDirectory(prefix="vibepos-sqlite-provider-") as root:
            path = Path(root) / "data" / "pos.db"
            provider = create_provider(self.sqlite_settings(path))
            engine = provider.create_engine()
            try:
                with engine.connect() as connection:
                    self.assertEqual(connection.exec_driver_sql("PRAGMA foreign_keys").scalar(), 1)
                    self.assertEqual(connection.exec_driver_sql("PRAGMA journal_mode").scalar(), "wal")
                    self.assertEqual(connection.exec_driver_sql("PRAGMA busy_timeout").scalar(), 10000)
            finally:
                engine.dispose()

    def test_sqlite_backup_and_restore_are_validated_in_maintenance_mode(self) -> None:
        with tempfile.TemporaryDirectory(prefix="vibepos-sqlite-backup-") as root_value:
            root = Path(root_value)
            path = root / "data" / "pos.db"
            provider = create_provider(self.sqlite_settings(path, maintenance=True))
            engine = provider.create_engine()
            try:
                with engine.begin() as connection:
                    connection.exec_driver_sql("CREATE TABLE marker (value INTEGER NOT NULL)")
                    connection.exec_driver_sql("INSERT INTO marker (value) VALUES (7)")
                backup = provider.create_backup(engine, root / "backups", "test_backup")
                with engine.begin() as connection:
                    connection.exec_driver_sql("UPDATE marker SET value = 99")
                provider.restore_backup(engine, backup)
                with engine.connect() as connection:
                    self.assertEqual(
                        connection.exec_driver_sql("SELECT value FROM marker").scalar_one(),
                        7,
                    )
            finally:
                engine.dispose()

    def test_report_period_compiles_for_every_tier_one_dialect(self) -> None:
        expression = report_period(text("created_at"), "weekly")
        compiled = {
            "sqlite": str(expression.compile(dialect=sqlite.dialect())),
            "postgresql": str(expression.compile(dialect=postgresql.dialect())),
            "mysql": str(expression.compile(dialect=mysql.dialect())),
        }
        self.assertIn("strftime", compiled["sqlite"])
        self.assertIn("date_trunc", compiled["postgresql"])
        self.assertIn("WEEKDAY", compiled["mysql"])

    def test_sqlite_report_period_uses_monday_week_and_calendar_month(self) -> None:
        engine = create_engine("sqlite:///:memory:")
        try:
            with engine.connect() as connection:
                week = connection.execute(
                    select(report_period(literal(datetime(2025, 1, 1, 12, 0)), "weekly"))
                ).scalar_one()
                month = connection.execute(
                    select(report_period(literal(datetime(2025, 1, 1, 12, 0)), "monthly"))
                ).scalar_one()
            self.assertEqual(week, "2024-12-30")
            self.assertEqual(month, "2025-01")
        finally:
            engine.dispose()

    def test_verified_sqlite_to_sqlite_transfer_preserves_business_totals(self) -> None:
        with tempfile.TemporaryDirectory(prefix="vibepos-transfer-") as root_value:
            root = Path(root_value)
            source_path = root / "source" / "data" / "pos.db"
            target_path = root / "target" / "data" / "pos.db"
            source = create_provider(self.sqlite_settings(source_path, maintenance=True))
            target = create_provider(self.sqlite_settings(target_path, maintenance=True))
            source_engine = source.create_engine()
            target_engine = target.create_engine()
            try:
                Base.metadata.create_all(source_engine)
                with source_engine.begin() as connection:
                    connection.execute(
                        Product.__table__.insert().values(id=1, name="Synthetic", quantity=12.5)
                    )
                    connection.execute(
                        Customer.__table__.insert().values(
                            id=1,
                            customer_id="C1",
                            outstanding_balance=25.0,
                            opening_balance=5.0,
                        )
                    )
                result = transfer_database(
                    source,
                    source_engine,
                    target,
                    target_engine,
                    Base.metadata,
                    confirmation="sqlite->sqlite",
                    backup_directory=root / "backups",
                )
                self.assertTrue(result.backup_path.is_file())
                with target_engine.connect() as connection:
                    self.assertEqual(
                        connection.execute(select(Product.name, Product.quantity)).one(),
                        ("Synthetic", 12.5),
                    )
                    self.assertEqual(
                        connection.execute(
                            select(Customer.outstanding_balance, Customer.opening_balance)
                        ).one(),
                        (25.0, 5.0),
                    )
            finally:
                source_engine.dispose()
                target_engine.dispose()


if __name__ == "__main__":
    unittest.main()
