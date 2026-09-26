from __future__ import annotations

import json
import sqlite3
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Connection, Engine

from app.db.providers.base import DatabaseProvider, DatabaseProviderError, ProviderCapabilities


class SQLiteProvider(DatabaseProvider):
    name = "sqlite"
    capabilities = ProviderCapabilities(
        provider="sqlite",
        offline=True,
        native_backup=True,
        transactional_ddl=True,
        migration_lock=True,
    )

    @property
    def database_path(self) -> Path:
        if not self.url.database:
            raise DatabaseProviderError("SQLite DATABASE_URL must include a database path")
        return Path(self.url.database).expanduser().resolve()

    def _validate_writable_path(self) -> None:
        parent = self.database_path.parent
        parent.mkdir(parents=True, exist_ok=True)
        try:
            with tempfile.NamedTemporaryFile(dir=parent, prefix=".vibepos-write-", delete=True):
                pass
        except OSError as exc:
            raise DatabaseProviderError(f"SQLite directory is not writable: {parent}") from exc

    def create_engine(self) -> Engine:
        self._validate_writable_path()
        engine = create_engine(
            self.settings.resolved_database_url,
            connect_args={
                "check_same_thread": False,
                "timeout": self.settings.DATABASE_CONNECT_TIMEOUT,
            },
        )

        @event.listens_for(engine, "connect")
        def configure_sqlite(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute(
                f"PRAGMA busy_timeout={int(self.settings.DATABASE_CONNECT_TIMEOUT * 1000)}"
            )
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine

    @contextmanager
    def migration_lock(self, engine: Engine) -> Iterator[Connection]:
        with engine.connect() as connection:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            try:
                yield connection
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def create_backup(self, engine: Engine, destination_dir: Path, prefix: str) -> Path:
        destination_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
        destination = destination_dir / f"{prefix}_{timestamp}.db"
        source = sqlite3.connect(str(self.database_path), timeout=30)
        target = sqlite3.connect(str(destination))
        try:
            if source.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise DatabaseProviderError("Source SQLite database failed quick_check")
            source.backup(target)
            target.commit()
            if target.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise DatabaseProviderError("SQLite backup failed quick_check")
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        finally:
            target.close()
            source.close()
        destination.with_suffix(".json").write_text(
            json.dumps({"provider": self.name, "created_at": datetime.now(timezone.utc).isoformat()}),
            encoding="utf-8",
        )
        return destination

    def restore_backup(self, engine: Engine, backup_path: Path) -> None:
        if not self.settings.DATABASE_MAINTENANCE_MODE:
            raise DatabaseProviderError("Restore requires DATABASE_MAINTENANCE_MODE=true")
        engine.dispose()
        source = sqlite3.connect(str(backup_path))
        target = sqlite3.connect(str(self.database_path))
        try:
            if source.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise DatabaseProviderError("SQLite restore source failed quick_check")
            source.backup(target)
            target.commit()
        finally:
            target.close()
            source.close()
