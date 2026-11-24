"""Automatic, upgrade-safe schema migrations for the VibePOS SQLite database.

Every startup calls :func:`run_migrations`, which:

1. creates tables that exist in the models but not in the database;
2. adds model columns that are missing from existing tables (ALTER TABLE ADD COLUMN),
   using the model's default, and runs any registered *on-add backfill* for that
   column (so historic data fixes only ever run on databases that really lacked it);
3. creates missing model indexes;
4. runs numbered migrations from ``app/db/migrations/versions`` that have not been
   applied yet, recording each in the ``schema_migrations`` table.

Steps 2-4 run in one SQLite transaction (``BEGIN IMMEDIATE``). A copy of the
database is written to ``<DATA_DIR>/backups/pre-migration/`` before anything is
changed. If a step fails the transaction is rolled back, the error names the
backup file, and startup stops instead of serving a half-migrated database.
"""

from __future__ import annotations

import datetime as _dt
import enum
import json
import logging
import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Optional

from sqlalchemy import Column, Index
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateIndex
from sqlalchemy.sql.schema import ColumnDefault, DefaultClause
from sqlalchemy.types import JSON

logger = logging.getLogger("vibepos.migrations")

MIGRATIONS_TABLE = "schema_migrations"
BACKUP_DIR_NAME = "pre-migration"
KEEP_BACKUPS = 10

_lock = threading.Lock()
_completed: set[str] = set()


class MigrationError(RuntimeError):
    """Raised when the database could not be migrated; the database is left unchanged."""


@dataclass
class Plan:
    db_path: Path
    fresh: bool
    missing_tables: list[str] = field(default_factory=list)
    missing_columns: list[tuple[str, Column]] = field(default_factory=list)
    missing_indexes: list[Index] = field(default_factory=list)
    pending_versions: list = field(default_factory=list)
    unknown_versions: list[str] = field(default_factory=list)
    applied_versions: list[str] = field(default_factory=list)

    @property
    def needs_changes(self) -> bool:
        return bool(self.missing_tables or self.missing_columns or self.missing_indexes or self.pending_versions)


@dataclass
class Report:
    db_path: Path
    created_tables: list[str] = field(default_factory=list)
    added_columns: list[str] = field(default_factory=list)
    created_indexes: list[str] = field(default_factory=list)
    skipped_indexes: list[str] = field(default_factory=list)
    applied_versions: list[str] = field(default_factory=list)
    backup_path: Optional[Path] = None
    warnings: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.created_tables or self.added_columns or self.created_indexes or self.applied_versions)


# --------------------------------------------------------------------------- helpers


def _metadata():
    # Importing base registers every model on Base.metadata.
    from app.db.base import Base

    return Base.metadata


def _sqlite_path(engine: Engine) -> Path:
    if engine.dialect.name != "sqlite":
        raise MigrationError(f"Only SQLite is supported, got {engine.dialect.name}")
    database = engine.url.database
    if not database or database == ":memory:":
        raise MigrationError("An on-disk SQLite database is required for migrations")
    return Path(database).resolve()


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=30, isolation_level=None)  # explicit transactions
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def table_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
    return {r[0] for r in rows}


def column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()}


def index_names(conn: sqlite3.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()}


def _literal(value) -> Optional[str]:
    if isinstance(value, enum.Enum):
        value = value.name  # SQLAlchemy Enum columns store member names
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, (list, dict)):
        return "'" + json.dumps(value).replace("'", "''") + "'"
    return None


def _default_sql(column: Column, dialect) -> Optional[str]:
    server_default = column.server_default
    if isinstance(server_default, DefaultClause):
        arg = server_default.arg
        if isinstance(arg, str):
            return _literal(arg)
        return str(arg.compile(dialect=dialect))
    default = column.default
    if isinstance(default, ColumnDefault):
        if default.is_scalar:
            return _literal(default.arg)
        if default.is_callable and isinstance(column.type, JSON):
            try:
                return _literal(default.arg(None))  # e.g. default=list -> '[]'
            except Exception:  # pragma: no cover - defensive
                return None
    return None


def column_ddl(column: Column, dialect) -> tuple[str, Optional[str]]:
    """Return the ADD COLUMN definition and an optional warning."""
    type_sql = column.type.compile(dialect=dialect)
    default = _default_sql(column, dialect)
    parts = [f'"{column.name}"', type_sql]
    warning = None
    if default is not None:
        parts.append(f"DEFAULT {default}")
        if not column.nullable and not column.primary_key:
            parts.append("NOT NULL")
    elif not column.nullable and not column.primary_key:
        warning = (
            f"{column.table.name}.{column.name} is NOT NULL in the model but has no constant default; "
            "it was added as nullable (existing rows get NULL)."
        )
    if column.unique and not column.index:
        warning = (warning + " " if warning else "") + (
            f"{column.table.name}.{column.name} is unique in the model; SQLite cannot add a UNIQUE column, "
            "add a unique index in a numbered migration if needed."
        )
    return " ".join(parts), warning


def _versions():
    from app.db.migrations.versions import VERSIONS

    seen: set[str] = set()
    for module in VERSIONS:
        version = getattr(module, "VERSION", None)
        if not version or not callable(getattr(module, "upgrade", None)):
            raise MigrationError(f"Migration module {module.__name__} needs VERSION and upgrade(conn)")
        if version in seen:
            raise MigrationError(f"Duplicate migration version {version}")
        seen.add(version)
    return sorted(VERSIONS, key=lambda m: m.VERSION)


def _ensure_migrations_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        f"CREATE TABLE IF NOT EXISTS {MIGRATIONS_TABLE} ("
        "version TEXT PRIMARY KEY, "
        "description TEXT NOT NULL, "
        "applied_at TEXT NOT NULL, "
        "mode TEXT NOT NULL DEFAULT 'run')"
    )


def _applied_versions(conn: sqlite3.Connection) -> list[str]:
    if MIGRATIONS_TABLE not in table_names(conn):
        return []
    return [r[0] for r in conn.execute(f"SELECT version FROM {MIGRATIONS_TABLE} ORDER BY version").fetchall()]


# --------------------------------------------------------------------------- planning


def plan_migrations(engine: Engine) -> Plan:
    """Describe what :func:`run_migrations` would change, without changing anything."""
    db_path = _sqlite_path(engine)
    metadata = _metadata()
    fresh = not db_path.exists() or db_path.stat().st_size == 0
    plan = Plan(db_path=db_path, fresh=fresh)

    existing_tables: set[str] = set()
    existing_indexes: set[str] = set()
    applied: list[str] = []
    if not fresh:
        conn = _connect(db_path)
        try:
            existing_tables = table_names(conn)
            existing_indexes = index_names(conn)
            applied = _applied_versions(conn)
            for table in metadata.tables.values():
                if table.name not in existing_tables:
                    continue
                have = column_names(conn, table.name)
                for column in table.columns:
                    if column.name not in have:
                        plan.missing_columns.append((table.name, column))
        finally:
            conn.close()

    model_tables = [t.name for t in metadata.tables.values()]
    user_tables = existing_tables - {MIGRATIONS_TABLE}
    plan.fresh = fresh or not (user_tables & set(model_tables))
    plan.missing_tables = [name for name in model_tables if name not in existing_tables]
    for table in metadata.tables.values():
        if table.name in plan.missing_tables:
            continue  # create_all creates its indexes
        for index in table.indexes:
            if index.name and index.name not in existing_indexes:
                plan.missing_indexes.append(index)

    plan.applied_versions = applied
    known = _versions()
    known_ids = {m.VERSION for m in known}
    plan.pending_versions = [m for m in known if m.VERSION not in applied]
    plan.unknown_versions = [v for v in applied if v not in known_ids]
    return plan


# --------------------------------------------------------------------------- backup


def backup_database(db_path: Path, label: str = "") -> Path:
    """Consistent copy of the database (WAL-safe) into <data dir>/backups/pre-migration/."""
    backup_dir = db_path.parent / "backups" / BACKUP_DIR_NAME
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    suffix = f"-{label}" if label else ""
    target = backup_dir / f"pos-{stamp}{suffix}.db"
    n = 1
    while target.exists():
        target = backup_dir / f"pos-{stamp}{suffix}-{n}.db"
        n += 1
    src = sqlite3.connect(str(db_path), timeout=30)
    dst = sqlite3.connect(str(target))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    backups = sorted(backup_dir.glob("pos-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in backups[KEEP_BACKUPS:]:
        try:
            old.unlink()
        except OSError:
            pass
    return target


# --------------------------------------------------------------------------- execution


def run_migrations(
    engine: Optional[Engine] = None,
    *,
    backup: bool = True,
    log: Callable[[str], None] = None,
    force: bool = False,
) -> Report:
    """Bring the database up to date with the models and numbered migrations.

    Safe to call many times; work is done once per database per process.
    """
    if engine is None:
        from app.db.session import engine as default_engine

        engine = default_engine
    emit = log or (lambda msg: logger.info(msg))
    db_path = _sqlite_path(engine)
    key = str(db_path)

    with _lock:
        if key in _completed and not force:
            return Report(db_path=db_path)
        report = _run(engine, db_path, backup=backup, emit=emit)
        _completed.add(key)
        return report


def _run(engine: Engine, db_path: Path, *, backup: bool, emit: Callable[[str], None]) -> Report:
    from app.db.migrations.backfills import run_backfill

    metadata = _metadata()
    plan = plan_migrations(engine)
    report = Report(db_path=db_path)

    for version in plan.unknown_versions:
        report.warnings.append(
            f"Database has migration {version} that this VibePOS version does not know "
            "(it was opened by a newer version). Continuing without downgrading."
        )
    for warning in report.warnings:
        emit(f"[migrations] WARNING: {warning}")

    if not plan.needs_changes:
        return report

    if backup and not plan.fresh and db_path.exists():
        report.backup_path = backup_database(db_path)
        emit(f"[migrations] Backup saved: {report.backup_path}")

    # 1) New tables (also builds a fresh database). Idempotent.
    if plan.missing_tables:
        metadata.create_all(bind=engine, tables=[metadata.tables[n] for n in plan.missing_tables])
        report.created_tables = list(plan.missing_tables)
        emit(f"[migrations] Created tables: {', '.join(plan.missing_tables)}")

    conn = _connect(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        _ensure_migrations_table(conn)

        # 2) Missing columns (+ backfills registered for them)
        for table_name, column in plan.missing_columns:
            if column.name in column_names(conn, table_name):
                continue
            ddl, warning = column_ddl(column, engine.dialect)
            conn.execute(f'ALTER TABLE "{table_name}" ADD COLUMN {ddl}')
            report.added_columns.append(f"{table_name}.{column.name}")
            if warning:
                report.warnings.append(warning)
                emit(f"[migrations] WARNING: {warning}")
        if report.added_columns:
            emit(f"[migrations] Added columns: {', '.join(report.added_columns)}")
        # Backfills run after every column exists (one may read another new column).
        for added in report.added_columns:
            table_name, column_name = added.split(".", 1)
            if run_backfill(conn, table_name, column_name):
                emit(f"[migrations] Backfilled {added}")

        # 3) Missing indexes. A unique index can fail on duplicate data: skip it with a warning.
        existing = index_names(conn)
        for index in plan.missing_indexes:
            if index.name in existing:
                continue
            sql = str(CreateIndex(index).compile(dialect=engine.dialect)).replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS", 1)
            sql = sql.replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS", 1)
            conn.execute("SAVEPOINT idx")
            try:
                conn.execute(sql)
                conn.execute("RELEASE idx")
                report.created_indexes.append(index.name)
            except sqlite3.IntegrityError as exc:
                conn.execute("ROLLBACK TO idx")
                conn.execute("RELEASE idx")
                msg = f"Could not create unique index {index.name} (duplicate data: {exc}); skipped."
                report.skipped_indexes.append(index.name)
                report.warnings.append(msg)
                emit(f"[migrations] WARNING: {msg}")
        if report.created_indexes:
            emit(f"[migrations] Created indexes: {', '.join(report.created_indexes)}")

        # 4) Numbered migrations
        now = _dt.datetime.now().isoformat(timespec="seconds")
        for module in plan.pending_versions:
            description = getattr(module, "DESCRIPTION", module.__name__)
            if plan.fresh and not getattr(module, "RUN_ON_FRESH_DB", False):
                mode = "baseline"  # brand-new database already matches the models
            else:
                emit(f"[migrations] Applying {module.VERSION}: {description}")
                module.upgrade(conn)
                mode = "run"
            conn.execute(
                f"INSERT INTO {MIGRATIONS_TABLE} (version, description, applied_at, mode) VALUES (?, ?, ?, ?)",
                (module.VERSION, description, now, mode),
            )
            report.applied_versions.append(module.VERSION)

        conn.execute("COMMIT")
    except Exception as exc:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        where = f" A backup taken just before is at {report.backup_path}." if report.backup_path else ""
        raise MigrationError(f"Database migration failed and was rolled back: {exc}.{where}") from exc
    finally:
        conn.close()

    if report.changed:
        emit(f"[migrations] Database is up to date ({db_path}).")
    return report


def describe(plan: Plan) -> Iterable[str]:
    yield f"Database: {plan.db_path}{'  (new)' if plan.fresh else ''}"
    yield f"Applied migrations: {', '.join(plan.applied_versions) or 'none'}"
    yield f"Pending migrations: {', '.join(m.VERSION + ' ' + getattr(m, 'DESCRIPTION', '') for m in plan.pending_versions) or 'none'}"
    yield f"Missing tables: {', '.join(plan.missing_tables) or 'none'}"
    yield f"Missing columns: {', '.join(f'{t}.{c.name}' for t, c in plan.missing_columns) or 'none'}"
    yield f"Missing indexes: {', '.join(i.name for i in plan.missing_indexes) or 'none'}"
    if plan.unknown_versions:
        yield f"Unknown (newer) migrations in database: {', '.join(plan.unknown_versions)}"


__all__ = [
    "MigrationError",
    "Plan",
    "Report",
    "backup_database",
    "column_names",
    "describe",
    "plan_migrations",
    "run_migrations",
    "table_names",
]
