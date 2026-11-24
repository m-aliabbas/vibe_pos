import sqlite3
from pathlib import Path

import pytest

from app.api.v1.endpoints import backup as backup_endpoint
from app.db.migrations import run_migrations
from app.db.session import engine


def _old_backup(path: Path) -> Path:
    """A backup file from an old VibePOS: no sale_blocked/company columns, no new tables."""
    with sqlite3.connect(path) as c:
        c.executescript(
            """
            CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR, hashed_password VARCHAR, role VARCHAR);
            INSERT INTO users VALUES (1, 'owner', 'x', 'admin');
            CREATE TABLE products (id INTEGER PRIMARY KEY, name VARCHAR, sku VARCHAR, selling_price FLOAT, quantity FLOAT);
            INSERT INTO products VALUES (1, 'Comb steel small', 'C1', 120, 5);
            CREATE TABLE sales (id INTEGER PRIMARY KEY, total FLOAT);
            INSERT INTO sales VALUES (1, 240);
            """
        )
    return path


def _live_db() -> Path:
    return Path(engine.url.database).resolve()


def test_restoring_an_old_backup_upgrades_it_immediately(tmp_path):
    run_migrations(engine, force=True)  # current-version live database

    backup_endpoint._restore_database(_old_backup(tmp_path / "old.db"))

    with sqlite3.connect(_live_db()) as c:
        cols = {r[1] for r in c.execute("PRAGMA table_info(products)")}
        assert {"sale_blocked", "company"} <= cols
        assert c.execute("SELECT name, sale_blocked FROM products").fetchone() == ("Comb steel small", 0)
        assert c.execute("SELECT amount_paid FROM sales").fetchone() == (240,)
        assert c.execute("SELECT count(*) FROM sqlite_master WHERE name='expenses'").fetchone() == (1,)


def test_failed_upgrade_after_restore_puts_previous_database_back(tmp_path, monkeypatch):
    run_migrations(engine, force=True)
    with sqlite3.connect(_live_db()) as c:
        c.execute("DELETE FROM products")
        c.execute("INSERT INTO products (id, name, sku) VALUES (99, 'Before restore', 'B99')")

    def broken(*_args, **_kwargs):
        raise RuntimeError("simulated upgrade failure")

    monkeypatch.setattr(backup_endpoint, "run_migrations", broken)
    with pytest.raises(RuntimeError):
        backup_endpoint._restore_database(_old_backup(tmp_path / "old.db"))

    with sqlite3.connect(_live_db()) as c:
        assert c.execute("SELECT name FROM products").fetchall() == [("Before restore",)]
