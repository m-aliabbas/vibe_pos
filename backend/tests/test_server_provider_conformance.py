from __future__ import annotations

import os
import tempfile
from pathlib import Path
import unittest
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import MetaData, literal, select
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.db.base import Base
from app.db.providers import create_provider
from app.db.transfer import transfer_database
from app.db.query_helpers import report_period
from app.db.bootstrap import bootstrap_database, schema_migrations
from app.models.customer import Customer
from app.models.product import Product
from app.models.user import User, UserRole
from tests import test_retail_characterization as retail


class ServerProviderRetailConformanceTests(retail.RetailCharacterizationTests):
    """Run the protected retail transaction contract on a configured server DB."""

    def setUp(self) -> None:
        provider_name = os.environ.get("VIBEPOS_CONFORMANCE_PROVIDER")
        database_url = os.environ.get("VIBEPOS_CONFORMANCE_DATABASE_URL")
        if not provider_name or not database_url:
            self.skipTest("server provider conformance environment is not configured")
        settings = Settings(
            _env_file=None,
            DATABASE_PROVIDER=provider_name,
            DATABASE_URL=database_url,
            DATA_DIR=os.environ["DATA_DIR"],
            LICENSE_ENFORCEMENT=False,
        )
        self.provider = create_provider(settings)
        self.engine = self.provider.create_engine()
        self.provider.health_check(self.engine)
        Base.metadata.drop_all(bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.database_path = None
        session_factory = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = session_factory()
        self.user = User(
            username="conformance-admin",
            hashed_password="not-a-real-password-hash",
            role=UserRole.ADMIN,
            is_active=True,
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

    def tearDown(self) -> None:
        if not hasattr(self, "engine"):
            return
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_report_week_and_month_boundaries_match_sqlite_contract(self) -> None:
        with self.engine.connect() as connection:
            week = connection.execute(
                select(report_period(literal(datetime(2025, 1, 1, 12, 0)), "weekly"))
            ).scalar_one()
            month = connection.execute(
                select(report_period(literal(datetime(2025, 1, 1, 12, 0)), "monthly"))
            ).scalar_one()
        self.assertEqual(week, "2024-12-30")
        self.assertEqual(month, "2025-01")


class ServerProviderTransferConformanceTests(unittest.TestCase):
    def _configured_target(self):
        provider_name = os.environ.get("VIBEPOS_CONFORMANCE_PROVIDER")
        database_url = os.environ.get("VIBEPOS_CONFORMANCE_DATABASE_URL")
        if not provider_name or not database_url:
            self.skipTest("server provider conformance environment is not configured")
        settings = Settings(
            _env_file=None,
            DATA_DIR=os.environ["DATA_DIR"],
            DATABASE_PROVIDER=provider_name,
            DATABASE_URL=database_url,
            DATABASE_MAINTENANCE_MODE=True,
            LICENSE_ENFORCEMENT=False,
        )
        return provider_name, create_provider(settings)

    def test_concurrent_bootstrap_uses_one_provider_migration_history(self) -> None:
        _provider_name, provider = self._configured_target()
        engine = provider.create_engine()
        cleanup = MetaData()
        cleanup.reflect(bind=engine)
        cleanup.drop_all(bind=engine)
        second_engine = provider.create_engine()
        try:
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(
                    executor.map(
                        lambda selected_engine: bootstrap_database(
                            provider, selected_engine, Base.metadata
                        ),
                        (engine, second_engine),
                    )
                )
            self.assertEqual(sum(len(result.applied) for result in results), 3)
            with engine.connect() as connection:
                self.assertEqual(
                    connection.execute(
                        select(schema_migrations.c.migration_id).order_by(
                            schema_migrations.c.migration_id
                        )
                    ).fetchall(),
                    [
                        ("0001_legacy_schema_baseline",),
                        ("0002_startup_column_additions",),
                        ("0003_retail_business_configuration",),
                    ],
                )
        finally:
            cleanup = MetaData()
            cleanup.reflect(bind=engine)
            cleanup.drop_all(bind=engine)
            second_engine.dispose()
            engine.dispose()

    def test_verified_sqlite_transfer_to_configured_server(self) -> None:
        provider_name, target = self._configured_target()

        with tempfile.TemporaryDirectory(prefix="vibepos-server-transfer-") as root_value:
            root = Path(root_value)
            source_settings = Settings(
                _env_file=None,
                DATA_DIR=str(root / "source" / "data"),
                DATABASE_PROVIDER="sqlite",
                DATABASE_URL=f"sqlite:///{root / 'source' / 'data' / 'pos.db'}",
                DATABASE_MAINTENANCE_MODE=True,
                LICENSE_ENFORCEMENT=False,
            )
            source = create_provider(source_settings)
            source_engine = source.create_engine()
            target_engine = target.create_engine()
            cleanup_metadata = MetaData()
            cleanup_metadata.reflect(bind=target_engine)
            cleanup_metadata.drop_all(bind=target_engine)
            try:
                Base.metadata.create_all(source_engine)
                with source_engine.begin() as connection:
                    connection.execute(
                        Product.__table__.insert().values(id=1, name="Transfer item", quantity=9.5)
                    )
                    connection.execute(
                        Customer.__table__.insert().values(
                            id=1,
                            customer_id="TRANSFER-C1",
                            outstanding_balance=45.0,
                            opening_balance=10.0,
                        )
                    )
                result = transfer_database(
                    source,
                    source_engine,
                    target,
                    target_engine,
                    Base.metadata,
                    confirmation=f"sqlite->{provider_name}",
                    backup_directory=root / "backups",
                )
                self.assertTrue(result.backup_path.is_file())
                with target_engine.connect() as connection:
                    self.assertEqual(
                        connection.execute(select(Product.name, Product.quantity)).one(),
                        ("Transfer item", 9.5),
                    )
                    self.assertEqual(
                        connection.execute(
                            select(Customer.outstanding_balance, Customer.opening_balance)
                        ).one(),
                        (45.0, 10.0),
                    )
            finally:
                cleanup_metadata = MetaData()
                cleanup_metadata.reflect(bind=target_engine)
                cleanup_metadata.drop_all(bind=target_engine)
                source_engine.dispose()
                target_engine.dispose()
