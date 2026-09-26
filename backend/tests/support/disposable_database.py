from __future__ import annotations

import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Tuple

if TYPE_CHECKING:
    from sqlalchemy.engine import Engine


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
FORBIDDEN_DATABASES = {
    (REPOSITORY_ROOT / "data" / "pos.db").resolve(),
    (REPOSITORY_ROOT / "backend" / "data" / "pos.db").resolve(),
    (REPOSITORY_ROOT / "backend" / "pos.db").resolve(),
}


def assert_disposable_database_path(database_path: Path) -> None:
    resolved = database_path.resolve()
    temporary_root = Path(tempfile.gettempdir()).resolve()

    if resolved in FORBIDDEN_DATABASES:
        raise RuntimeError(f"Refusing to use a runtime database in tests: {resolved}")
    if temporary_root not in resolved.parents:
        raise RuntimeError(f"Test database must be below {temporary_root}: {resolved}")


def create_disposable_sqlite_engine() -> Tuple[tempfile.TemporaryDirectory, "Engine", Path]:
    from sqlalchemy import create_engine

    temporary_directory = tempfile.TemporaryDirectory(prefix="vibepos-tests-")
    database_path = Path(temporary_directory.name) / "characterization.db"
    assert_disposable_database_path(database_path)
    engine = create_engine(f"sqlite:///{database_path}")
    return temporary_directory, engine, database_path
