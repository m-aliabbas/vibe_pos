from __future__ import annotations

import os
import shutil
import subprocess
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from app.db.providers.base import DatabaseProvider, DatabaseProviderError, ProviderCapabilities


class PostgreSQLProvider(DatabaseProvider):
    name = "postgresql"
    capabilities = ProviderCapabilities("postgresql", False, True, True, True)
    _lock_id = 846_326_771

    def create_engine(self) -> Engine:
        connect_args = {"connect_timeout": self.settings.DATABASE_CONNECT_TIMEOUT}
        if self.settings.DATABASE_SSL_MODE:
            connect_args["sslmode"] = self.settings.DATABASE_SSL_MODE
        if self.settings.DATABASE_SSL_CA:
            connect_args["sslrootcert"] = self.settings.DATABASE_SSL_CA
        try:
            return create_engine(
                self.settings.resolved_database_url,
                pool_pre_ping=True,
                pool_size=self.settings.DATABASE_POOL_SIZE,
                max_overflow=self.settings.DATABASE_MAX_OVERFLOW,
                pool_recycle=self.settings.DATABASE_POOL_RECYCLE_SECONDS,
                connect_args=connect_args,
            )
        except ModuleNotFoundError as exc:
            raise DatabaseProviderError(
                "PostgreSQL driver is not installed; install the psycopg[binary] backend extra"
            ) from exc

    @contextmanager
    def migration_lock(self, engine: Engine) -> Iterator[Connection]:
        with engine.connect() as connection:
            connection.execute(text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": self._lock_id})
            try:
                yield connection
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": self._lock_id})
                connection.commit()

    def _environment(self) -> dict[str, str]:
        environment = os.environ.copy()
        if self.url.password:
            environment["PGPASSWORD"] = self.url.password
        return environment

    def create_backup(self, engine: Engine, destination_dir: Path, prefix: str) -> Path:
        executable = shutil.which("pg_dump")
        if not executable:
            raise DatabaseProviderError("pg_dump is required for PostgreSQL backups")
        destination_dir.mkdir(parents=True, exist_ok=True)
        path = destination_dir / f"{prefix}_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.dump"
        command = [
            executable,
            "--format=custom",
            "--file",
            str(path),
            self.url.set(password=None).render_as_string(hide_password=False),
        ]
        try:
            subprocess.run(command, env=self._environment(), check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            raise DatabaseProviderError("PostgreSQL backup failed; inspect server access and pg_dump compatibility") from exc
        if not path.is_file() or path.stat().st_size == 0:
            raise DatabaseProviderError("PostgreSQL backup is empty")
        validator = shutil.which("pg_restore")
        if not validator:
            path.unlink(missing_ok=True)
            raise DatabaseProviderError("pg_restore is required to validate PostgreSQL backups")
        try:
            subprocess.run(
                [validator, "--list", str(path)],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as exc:
            path.unlink(missing_ok=True)
            raise DatabaseProviderError("PostgreSQL backup validation failed") from exc
        return path

    def restore_backup(self, engine: Engine, backup_path: Path) -> None:
        if not self.settings.DATABASE_MAINTENANCE_MODE:
            raise DatabaseProviderError("Restore requires DATABASE_MAINTENANCE_MODE=true")
        executable = shutil.which("pg_restore")
        if not executable:
            raise DatabaseProviderError("pg_restore is required for PostgreSQL restore")
        subprocess.run(
            [
                executable,
                "--clean",
                "--if-exists",
                "--dbname",
                self.url.set(password=None).render_as_string(hide_password=False),
                str(backup_path),
            ],
            env=self._environment(), check=True, capture_output=True, text=True,
        )
