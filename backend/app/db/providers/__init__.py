from __future__ import annotations

from app.db.providers.base import DatabaseProvider, DatabaseProviderError
from app.db.providers.mysql import MySQLProvider
from app.db.providers.postgresql import PostgreSQLProvider
from app.db.providers.sqlite import SQLiteProvider


PROVIDERS = {
    "sqlite": SQLiteProvider,
    "postgresql": PostgreSQLProvider,
    "mysql": MySQLProvider,
}


def create_provider(settings) -> DatabaseProvider:
    try:
        provider_class = PROVIDERS[settings.DATABASE_PROVIDER]
    except KeyError as exc:
        raise DatabaseProviderError(
            f"Unsupported database provider: {settings.DATABASE_PROVIDER}"
        ) from exc
    return provider_class(settings)


__all__ = ["DatabaseProvider", "DatabaseProviderError", "PROVIDERS", "create_provider"]
