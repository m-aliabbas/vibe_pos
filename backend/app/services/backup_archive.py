import os
import secrets
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.core.timezone import now_pkt

POS_DATABASE_FILENAME = "pos.db"
REQUIRED_POS_TABLES = {"users", "products", "sales"}


@dataclass(frozen=True)
class DatabaseBackup:
    path: Path
    filename: str
    timestamp: str
    total_size: int


def get_pos_database(data_dir: Path) -> Path:
    """Return the one application database that belongs in a POS backup."""
    database_path = data_dir / POS_DATABASE_FILENAME
    if not database_path.is_file():
        raise FileNotFoundError(f"{POS_DATABASE_FILENAME} was not found")
    return database_path


def validate_pos_database(database_path: Path) -> None:
    """Reject corrupt SQLite files and unrelated SQLite databases."""
    if not database_path.is_file():
        raise ValueError("database file was not found")

    connection: sqlite3.Connection | None = None
    try:
        connection = sqlite3.connect(database_path)
        connection.execute("PRAGMA query_only=ON")
        integrity_result = connection.execute("PRAGMA quick_check").fetchone()
        if not integrity_result or integrity_result[0] != "ok":
            raise ValueError("database integrity check failed")

        table_names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        missing_tables = REQUIRED_POS_TABLES - table_names
        if missing_tables:
            raise ValueError("the selected file is not a VibePOS database")
    except sqlite3.DatabaseError as exc:
        raise ValueError("the selected file is not a valid SQLite database") from exc
    finally:
        if connection is not None:
            connection.close()


def _copy_sqlite_database(source_path: Path, destination_path: Path) -> None:
    source = sqlite3.connect(source_path)
    destination = sqlite3.connect(destination_path)
    try:
        source.execute("PRAGMA query_only=ON")
        source.backup(destination)
    finally:
        destination.close()
        source.close()


def create_database_backup(
    data_dir: Path,
    backup_dir: Path,
    *,
    filename_prefix: str = "pos_backup",
) -> DatabaseBackup:
    """Create a consistent SQLite snapshot containing only data/pos.db."""
    source_path = get_pos_database(data_dir)
    created_at = now_pkt()
    timestamp = created_at.strftime("%Y%m%d_%H%M%S")
    filename = f"{filename_prefix}_{timestamp}_{secrets.token_hex(4)}.db"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / filename
    temporary_path = backup_path.with_suffix(".db.part")

    try:
        _copy_sqlite_database(source_path, temporary_path)
        validate_pos_database(temporary_path)
        os.replace(temporary_path, backup_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        backup_path.unlink(missing_ok=True)
        raise

    return DatabaseBackup(
        path=backup_path,
        filename=filename,
        timestamp=created_at.isoformat(),
        total_size=backup_path.stat().st_size,
    )


def restore_pos_database(source_path: Path, data_dir: Path) -> None:
    """Restore a validated POS database through SQLite's online backup API."""
    validate_pos_database(source_path)
    target_path = data_dir / POS_DATABASE_FILENAME
    target_path.parent.mkdir(parents=True, exist_ok=True)

    source = sqlite3.connect(source_path)
    destination = sqlite3.connect(target_path, timeout=30)
    try:
        source.execute("PRAGMA query_only=ON")
        destination.execute("PRAGMA busy_timeout=30000")
        source.backup(destination)
    finally:
        destination.close()
        source.close()

    validate_pos_database(target_path)
