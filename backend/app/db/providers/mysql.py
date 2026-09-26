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


class MySQLProvider(DatabaseProvider):
    name = "mysql"
    capabilities = ProviderCapabilities("mysql", False, True, False, True)
    _lock_name = "vibepos_schema_migration"

    def create_engine(self) -> Engine:
        connect_args: dict[str, object] = {
            "connect_timeout": self.settings.DATABASE_CONNECT_TIMEOUT,
            "charset": "utf8mb4",
            "init_command": "SET time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO'",
        }
        if self.settings.DATABASE_SSL_CA:
            connect_args["ssl"] = {"ca": self.settings.DATABASE_SSL_CA}
        elif self.settings.DATABASE_SSL_MODE in {"required", "verify_ca", "verify_identity"}:
            connect_args["ssl"] = {}
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
                "MySQL driver is not installed; install the PyMySQL backend dependency"
            ) from exc

    @contextmanager
    def migration_lock(self, engine: Engine) -> Iterator[Connection]:
        with engine.connect() as connection:
            acquired = connection.execute(
                text("SELECT GET_LOCK(:name, :timeout)"),
                {"name": self._lock_name, "timeout": self.settings.DATABASE_CONNECT_TIMEOUT},
            ).scalar()
            if acquired != 1:
                raise DatabaseProviderError("Could not acquire MySQL migration lock")
            try:
                yield connection
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": self._lock_name})
                connection.commit()

    def _client_args(self) -> list[str]:
        args = [f"--host={self.url.host or 'localhost'}", f"--port={self.url.port or 3306}"]
        if self.url.username:
            args.append(f"--user={self.url.username}")
        if self.settings.DATABASE_SSL_CA:
            args.append(f"--ssl-ca={self.settings.DATABASE_SSL_CA}")
        return args

    def _environment(self) -> dict[str, str]:
        environment = os.environ.copy()
        if self.url.password:
            environment["MYSQL_PWD"] = self.url.password
        return environment

    def create_backup(self, engine: Engine, destination_dir: Path, prefix: str) -> Path:
        executable = shutil.which("mysqldump")
        if not executable:
            raise DatabaseProviderError("mysqldump is required for MySQL backups")
        destination_dir.mkdir(parents=True, exist_ok=True)
        path = destination_dir / f"{prefix}_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.sql"
        command = [executable, *self._client_args(), "--single-transaction", "--routines", self.url.database or ""]
        with path.open("wb") as output:
            try:
                subprocess.run(command, env=self._environment(), check=True, stdout=output, stderr=subprocess.PIPE)
            except subprocess.CalledProcessError as exc:
                path.unlink(missing_ok=True)
                raise DatabaseProviderError("MySQL backup failed; inspect server access and mysqldump compatibility") from exc
        if path.stat().st_size == 0:
            raise DatabaseProviderError("MySQL backup is empty")
        tail = path.read_bytes()[-4096:]
        if b"Dump completed" not in tail:
            path.unlink(missing_ok=True)
            raise DatabaseProviderError("MySQL backup validation marker is missing")
        return path

    def restore_backup(self, engine: Engine, backup_path: Path) -> None:
        if not self.settings.DATABASE_MAINTENANCE_MODE:
            raise DatabaseProviderError("Restore requires DATABASE_MAINTENANCE_MODE=true")
        executable = shutil.which("mysql")
        if not executable:
            raise DatabaseProviderError("mysql client is required for MySQL restore")
        with backup_path.open("rb") as source:
            subprocess.run(
                [executable, *self._client_args(), self.url.database or ""],
                env=self._environment(), check=True, stdin=source, stderr=subprocess.PIPE,
            )
