from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

from app.db.migrations.registry import MIGRATIONS, Migration, validate_registry


HISTORY_TABLE = "schema_migrations"
NON_BUSINESS_TABLES = {HISTORY_TABLE, "sqlite_sequence", "business_configuration"}
DEFAULT_APPLICATION_VERSION = "1.0.20"


class MigrationError(RuntimeError):
    """Raised when the database cannot be upgraded safely."""


@dataclass(frozen=True)
class MigrationResult:
    applied: tuple[str, ...]
    backup_path: Path | None


SchemaInitializer = Callable[[], None]


def _connect(database_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(str(database_path), timeout=30)
    connection.execute("PRAGMA busy_timeout = 30000")
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _is_populated(connection: sqlite3.Connection) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master "
        "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
    ).fetchone()
    return row is not None


def _history_exists(connection: sqlite3.Connection) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (HISTORY_TABLE,),
    ).fetchone()
    return row is not None


def _applied_migrations(connection: sqlite3.Connection) -> dict[str, str]:
    if not _history_exists(connection):
        return {}
    return {
        str(row[0]): str(row[1])
        for row in connection.execute(
            f"SELECT migration_id, checksum FROM {HISTORY_TABLE}"
        )
    }


def _create_history_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {HISTORY_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            migration_id VARCHAR(255) NOT NULL UNIQUE,
            checksum VARCHAR(64) NOT NULL,
            applied_at VARCHAR(40) NOT NULL,
            application_version VARCHAR(64) NOT NULL
        )
        """
    )


def _backup_directory(database_path: Path) -> Path:
    return database_path.parent.parent / "backups" / "migrations"


def _validate_database(connection: sqlite3.Connection, label: str) -> None:
    result = connection.execute("PRAGMA quick_check").fetchone()
    if result is None or str(result[0]).lower() != "ok":
        detail = result[0] if result else "no result"
        raise MigrationError(f"{label} failed SQLite quick_check: {detail}")


def _create_validated_backup(database_path: Path) -> Path:
    backup_dir = _backup_directory(database_path)
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
    backup_path = backup_dir / f"{database_path.stem}_pre_migration_{timestamp}.db"
    metadata_path = backup_path.with_suffix(".json")

    source = _connect(database_path)
    destination = sqlite3.connect(str(backup_path))
    try:
        _validate_database(source, "Source database")
        source.backup(destination)
        destination.commit()
        _validate_database(destination, "Pre-migration backup")
    except Exception:
        destination.close()
        source.close()
        backup_path.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        raise
    else:
        destination.close()
        source.close()

    if not backup_path.is_file() or backup_path.stat().st_size == 0:
        backup_path.unlink(missing_ok=True)
        raise MigrationError("Pre-migration backup was not created correctly")

    metadata_path.write_text(
        json.dumps(
            {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source_database": database_path.name,
                "backup_database": backup_path.name,
                "recovery": "Stop VibePOS and copy this file over the source database.",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return backup_path


def _table_names(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }


def _column_names(connection: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in connection.execute(f'PRAGMA table_info("{table}")')}


def _integrity_snapshot(connection: sqlite3.Connection) -> dict[str, float | int]:
    tables = _table_names(connection)
    snapshot: dict[str, float | int] = {}
    for table in sorted(tables - NON_BUSINESS_TABLES):
        snapshot[f"rows:{table}"] = int(
            connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        )

    important_totals = {
        "products": ("quantity",),
        "product_variations": ("quantity",),
        "stock_batches": ("quantity_received", "quantity_remaining"),
        "customers": ("outstanding_balance", "opening_balance"),
        "vendors": ("opening_balance", "prepaid_credit"),
    }
    for table, columns in important_totals.items():
        if table not in tables:
            continue
        existing = _column_names(connection, table)
        for column in columns:
            if column in existing:
                value = connection.execute(
                    f'SELECT COALESCE(SUM("{column}"), 0) FROM "{table}"'
                ).fetchone()[0]
                snapshot[f"sum:{table}.{column}"] = float(value or 0)
    return snapshot


def _foreign_key_violations(connection: sqlite3.Connection) -> set[tuple[object, ...]]:
    return {tuple(row) for row in connection.execute("PRAGMA foreign_key_check")}


def _verify_integrity(
    connection: sqlite3.Connection,
    before: dict[str, float | int],
    before_foreign_key_violations: set[tuple[object, ...]],
) -> None:
    _validate_database(connection, "Migrated database")
    foreign_key_errors = _foreign_key_violations(connection)
    introduced_foreign_key_errors = foreign_key_errors - before_foreign_key_violations
    if introduced_foreign_key_errors:
        raise MigrationError(
            "Migration introduced "
            f"{len(introduced_foreign_key_errors)} foreign-key violation(s)"
        )

    after = _integrity_snapshot(connection)
    changed = {
        key: (value, after.get(key))
        for key, value in before.items()
        if after.get(key) != value
    }
    if changed:
        raise MigrationError(f"Migration changed protected business totals: {changed}")

    tables = _table_names(connection)
    if {"journal_entries", "journal_lines"}.issubset(tables):
        unbalanced = connection.execute(
            """
            SELECT je.id
            FROM journal_entries AS je
            JOIN journal_lines AS jl ON jl.entry_id = je.id
            GROUP BY je.id
            HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.005
            LIMIT 1
            """
        ).fetchone()
        if unbalanced:
            raise MigrationError(f"Journal entry {unbalanced[0]} is not balanced")


def upgrade_database(
    database_path: str | Path,
    *,
    application_version: str = DEFAULT_APPLICATION_VERSION,
    schema_initializer: SchemaInitializer | None = None,
    migrations: Iterable[Migration] = MIGRATIONS,
) -> MigrationResult:
    """Apply pending SQLite migrations after producing a validated backup.

    New/empty databases are initialized and stamped without a backup because no
    customer state exists yet. Existing databases are backed up before *any*
    schema mutation, including creation of the migration history table.
    """

    path = Path(database_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = tuple(migrations)
    validate_registry(ordered)

    connection = _connect(path)
    try:
        populated = _is_populated(connection)
        applied = _applied_migrations(connection)
        known_ids = {migration.migration_id for migration in ordered}
        unknown = sorted(set(applied) - known_ids)
        if unknown:
            raise MigrationError(f"Database contains unknown migrations: {unknown}")
        for migration in ordered:
            recorded_checksum = applied.get(migration.migration_id)
            if recorded_checksum and recorded_checksum != migration.checksum:
                raise MigrationError(
                    f"Applied migration was modified: {migration.migration_id}"
                )
        pending = [migration for migration in ordered if migration.migration_id not in applied]
    finally:
        connection.close()

    if not pending:
        return MigrationResult(applied=(), backup_path=None)

    try:
        backup_path = _create_validated_backup(path) if populated else None
    except Exception as exc:
        raise MigrationError(
            "Database migration was stopped because a validated pre-migration "
            "backup could not be created"
        ) from exc

    applied_now: list[str] = []
    try:
        if schema_initializer is not None:
            schema_initializer()

        connection = _connect(path)
        try:
            before = _integrity_snapshot(connection)
            before_foreign_key_violations = _foreign_key_violations(connection)
            for migration in pending:
                if "sqlite" not in migration.supported_providers:
                    raise MigrationError(
                        f"Migration {migration.migration_id} does not support SQLite"
                    )
                try:
                    connection.execute("BEGIN IMMEDIATE")
                    _create_history_table(connection)
                    existing = connection.execute(
                        f"SELECT checksum FROM {HISTORY_TABLE} WHERE migration_id = ?",
                        (migration.migration_id,),
                    ).fetchone()
                    if existing:
                        if str(existing[0]) != migration.checksum:
                            raise MigrationError(
                                f"Applied migration was modified: {migration.migration_id}"
                            )
                        connection.commit()
                        continue
                    migration.apply(connection)
                    connection.execute(
                        f"""
                        INSERT INTO {HISTORY_TABLE}
                            (migration_id, checksum, applied_at, application_version)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            migration.migration_id,
                            migration.checksum,
                            datetime.now(timezone.utc).isoformat(),
                            application_version,
                        ),
                    )
                    connection.commit()
                    applied_now.append(migration.migration_id)
                except Exception:
                    connection.rollback()
                    raise
            _verify_integrity(connection, before, before_foreign_key_violations)
        finally:
            connection.close()
    except Exception as exc:
        recovery = f" Restore {backup_path} over {path}." if backup_path else ""
        raise MigrationError(f"Database migration failed; startup was stopped.{recovery}") from exc

    return MigrationResult(
        applied=tuple(applied_now),
        backup_path=backup_path,
    )
