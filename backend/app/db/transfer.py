from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import MetaData, Table, func, inspect, select, text
from sqlalchemy.engine import Connection, Engine

from app.db.integrity import (
    assert_journals_balanced,
    capture_integrity_snapshot,
    compare_integrity_snapshots,
)
from app.db.providers.base import DatabaseProvider, DatabaseProviderError
from app.db.bootstrap import history_metadata, schema_migrations
from app.db.migrations.registry import MIGRATIONS


@dataclass(frozen=True)
class TransferResult:
    backup_path: Path
    copied_rows: dict[str, int]


def _repair_identity(connection: Connection, table: Table) -> None:
    primary_keys = list(table.primary_key.columns)
    if len(primary_keys) != 1 or not primary_keys[0].autoincrement:
        return
    key = primary_keys[0]
    maximum = int(connection.execute(select(func.max(key))).scalar() or 0)
    if connection.dialect.name == "postgresql" and maximum:
        sequence = connection.execute(
            text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
            {"table_name": table.name, "column_name": key.name},
        ).scalar()
        if sequence:
            connection.execute(
                text("SELECT setval(:sequence, :value, true)"),
                {"sequence": sequence, "value": maximum},
            )
    elif connection.dialect.name == "mysql":
        connection.exec_driver_sql(
            f"ALTER TABLE `{table.name}` AUTO_INCREMENT = {maximum + 1}"
        )


def transfer_database(
    source_provider: DatabaseProvider,
    source_engine: Engine,
    target_provider: DatabaseProvider,
    target_engine: Engine,
    metadata: MetaData,
    *,
    confirmation: str,
    backup_directory: Path,
) -> TransferResult:
    expected = f"{source_provider.name}->{target_provider.name}"
    if confirmation != expected:
        raise DatabaseProviderError(f"Transfer confirmation must exactly equal {expected!r}")
    if not source_provider.settings.DATABASE_MAINTENANCE_MODE or not target_provider.settings.DATABASE_MAINTENANCE_MODE:
        raise DatabaseProviderError(
            "Provider transfer requires DATABASE_MAINTENANCE_MODE=true for source and target"
        )

    source_provider.health_check(source_engine)
    target_provider.health_check(target_engine)
    target_tables = set(inspect(target_engine).get_table_names())
    if target_tables:
        target_snapshot = capture_integrity_snapshot(target_engine)
        nonempty = {
            key: value
            for key, value in target_snapshot.values.items()
            if key.startswith("rows:") and value and key != "rows:schema_migrations"
        }
        if nonempty:
            raise DatabaseProviderError(f"Transfer target is not empty: {sorted(nonempty)}")

    backup_path = source_provider.create_backup(
        source_engine, backup_directory, f"{source_provider.name}_pre_transfer"
    )
    source_snapshot = capture_integrity_snapshot(source_engine)
    copied: dict[str, int] = {}

    source_metadata = MetaData()
    source_metadata.reflect(bind=source_engine)

    with source_engine.connect() as source_connection, target_provider.migration_lock(
        target_engine
    ) as target_connection:
        metadata.create_all(bind=target_connection)
        if target_engine.dialect.name == "mysql":
            target_connection.exec_driver_sql("SET FOREIGN_KEY_CHECKS=0")
        elif target_engine.dialect.name == "sqlite":
            target_connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            for target_table in reversed(metadata.sorted_tables):
                if target_table.name != "schema_migrations":
                    target_connection.execute(target_table.delete())
            deferred_foreign_keys: list[tuple[Table, dict, dict]] = []
            for target_table in metadata.sorted_tables:
                name = target_table.name
                if name == "schema_migrations" or name not in source_metadata.tables:
                    continue
                source_table = source_metadata.tables[name]
                rows = [dict(row._mapping) for row in source_connection.execute(select(source_table))]
                primary_keys = list(target_table.primary_key.columns)
                nullable_foreign_keys = {
                    column.name
                    for column in target_table.columns
                    if column.nullable and column.foreign_keys
                }
                if rows and primary_keys and nullable_foreign_keys:
                    for row in rows:
                        deferred = {
                            column: row[column]
                            for column in nullable_foreign_keys
                            if row.get(column) is not None
                        }
                        if deferred:
                            identity = {column.name: row[column.name] for column in primary_keys}
                            deferred_foreign_keys.append((target_table, identity, deferred))
                            for column in deferred:
                                row[column] = None
                if rows:
                    target_connection.execute(target_table.insert(), rows)
                copied[name] = len(rows)
            for table, identity, values in deferred_foreign_keys:
                predicate = None
                for key, value in identity.items():
                    condition = table.c[key] == value
                    predicate = condition if predicate is None else predicate & condition
                target_connection.execute(table.update().where(predicate).values(**values))
        finally:
            if target_engine.dialect.name == "mysql":
                target_connection.exec_driver_sql("SET FOREIGN_KEY_CHECKS=1")
            elif target_engine.dialect.name == "sqlite":
                target_connection.exec_driver_sql("PRAGMA foreign_keys=ON")

        for table in metadata.sorted_tables:
            if table.name != "schema_migrations":
                _repair_identity(target_connection, table)

        history_metadata.create_all(bind=target_connection)
        target_connection.execute(schema_migrations.delete())
        target_connection.execute(
            schema_migrations.insert(),
            [
                {
                    "migration_id": migration.migration_id,
                    "checksum": migration.checksum,
                    "applied_at": "provider-transfer",
                    "application_version": "1.0.20",
                }
                for migration in MIGRATIONS
            ],
        )

    target_snapshot = capture_integrity_snapshot(target_engine)
    differences = compare_integrity_snapshots(source_snapshot, target_snapshot)
    if differences:
        raise DatabaseProviderError(f"Transferred database failed verification: {differences}")
    assert_journals_balanced(target_engine)
    return TransferResult(backup_path=backup_path, copied_rows=copied)
