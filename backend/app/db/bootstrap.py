from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import Column, Integer, MetaData, String, Table, inspect, select
from sqlalchemy.engine import Engine

from app.db.integrity import assert_journals_balanced
from app.db.migrations.registry import MIGRATIONS
from app.db.migrations.runner import MigrationError, MigrationResult, upgrade_database
from app.db.providers.base import DatabaseProvider
from app.db.providers.sqlite import SQLiteProvider


history_metadata = MetaData()
schema_migrations = Table(
    "schema_migrations",
    history_metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("migration_id", String(255), nullable=False, unique=True),
    Column("checksum", String(64), nullable=False),
    Column("applied_at", String(40), nullable=False),
    Column("application_version", String(64), nullable=False),
)


def _server_database_has_rows(engine: Engine, table_names: set[str]) -> bool:
    metadata = MetaData()
    with engine.connect() as connection:
        for table_name in sorted(table_names - {"schema_migrations"}):
            table = Table(table_name, metadata, autoload_with=connection)
            if connection.execute(select(table).limit(1)).first() is not None:
                return True
    return False


def bootstrap_database(
    provider: DatabaseProvider,
    engine: Engine,
    application_metadata: MetaData,
    *,
    application_version: str = "1.0.20",
) -> MigrationResult:
    provider.health_check(engine)
    if isinstance(provider, SQLiteProvider):
        return upgrade_database(
            provider.database_path,
            application_version=application_version,
            schema_initializer=lambda: application_metadata.create_all(bind=engine),
        )

    initial_tables = set(inspect(engine).get_table_names())
    if "schema_migrations" not in initial_tables and _server_database_has_rows(engine, initial_tables):
        raise MigrationError(
            f"Configured {provider.name} database has application data but no migration history; "
            "use the verified provider-transfer command instead of adopting it in place"
        )

    backup_path: Path | None = None
    if "schema_migrations" in initial_tables:
        with engine.connect() as connection:
            applied_before = {
                row.migration_id
                for row in connection.execute(select(schema_migrations.c.migration_id))
            }
        if len(applied_before) < len(MIGRATIONS):
            backup_path = provider.create_backup(
                engine,
                Path(provider.settings.DATA_DIR).resolve().parent / "backups" / "migrations",
                f"{provider.name}_pre_migration",
            )

    applied_now: list[str] = []
    with provider.migration_lock(engine) as connection:
        application_metadata.create_all(bind=connection)
        history_metadata.create_all(bind=connection)
        applied = {
            row.migration_id: row.checksum
            for row in connection.execute(
                select(schema_migrations.c.migration_id, schema_migrations.c.checksum)
            )
        }
        for migration in MIGRATIONS:
            checksum = applied.get(migration.migration_id)
            if checksum and checksum != migration.checksum:
                raise MigrationError(f"Applied migration was modified: {migration.migration_id}")
            if checksum:
                continue
            if provider.name not in migration.supported_providers:
                # A clean server schema is created from current ORM metadata. Historical
                # SQLite compatibility migrations are stamped, not replayed as raw DDL.
                pass
            elif migration.apply_sqlalchemy is not None:
                migration.apply_sqlalchemy(connection)
            else:
                raise MigrationError(
                    f"Migration {migration.migration_id} declares {provider.name} support "
                    "but has no provider-neutral implementation"
                )
            connection.execute(
                schema_migrations.insert().values(
                    migration_id=migration.migration_id,
                    checksum=migration.checksum,
                    applied_at=datetime.now(timezone.utc).isoformat(),
                    application_version=application_version,
                )
            )
            applied_now.append(migration.migration_id)
        assert_journals_balanced(connection)

    return MigrationResult(tuple(applied_now), backup_path)
