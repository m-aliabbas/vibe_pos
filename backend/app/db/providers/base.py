from __future__ import annotations

from abc import ABC, abstractmethod
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine, URL, make_url


@dataclass(frozen=True)
class ProviderCapabilities:
    provider: str
    offline: bool
    native_backup: bool
    transactional_ddl: bool
    migration_lock: bool


class DatabaseProviderError(RuntimeError):
    pass


class DatabaseProvider(ABC):
    name: str
    capabilities: ProviderCapabilities

    def __init__(self, settings) -> None:
        self.settings = settings
        self.url = make_url(settings.resolved_database_url)

    @abstractmethod
    def create_engine(self) -> Engine:
        raise NotImplementedError

    def health_check(self, engine: Engine) -> None:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception as exc:
            raise DatabaseProviderError(
                f"Unable to connect to configured {self.name} database "
                f"({self.redacted_url}); check the server, network, TLS, and credentials"
            ) from exc

    @property
    def redacted_url(self) -> str:
        return self.url.render_as_string(hide_password=True)

    @contextmanager
    def migration_lock(self, engine: Engine) -> Iterator[Connection]:
        with engine.begin() as connection:
            yield connection

    @abstractmethod
    def create_backup(self, engine: Engine, destination_dir: Path, prefix: str) -> Path:
        raise NotImplementedError

    @abstractmethod
    def restore_backup(self, engine: Engine, backup_path: Path) -> None:
        raise NotImplementedError

    def native_command_url(self) -> URL:
        return self.url
