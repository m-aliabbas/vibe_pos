import sqlite3
import types
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.migrations import MigrationError, run_migrations
from app.db.migrations import runner
from app.models.product import Product


def _engine(path: Path):
    return create_engine(f"sqlite:///{path}")


def _cols(db: Path, table: str) -> dict[str, tuple]:
    with sqlite3.connect(db) as c:
        return {r[1]: r for r in c.execute(f"PRAGMA table_info({table})")}


def _make_old_db(db: Path) -> None:
    """A database shaped like an old VibePOS install, with real rows."""
    with sqlite3.connect(db) as c:
        c.executescript(
            """
            CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR, hashed_password VARCHAR, role VARCHAR);
            INSERT INTO users VALUES (1, 'admin', 'x', 'admin');
            CREATE TABLE products (id INTEGER PRIMARY KEY, name VARCHAR, sku VARCHAR, selling_price FLOAT, quantity FLOAT);
            INSERT INTO products (id, name, sku, selling_price, quantity) VALUES (1, 'Old rice', 'R1', 250, 10);
            CREATE TABLE purchases (id INTEGER PRIMARY KEY, total_amount FLOAT);
            INSERT INTO purchases VALUES (1, 125.5);
            CREATE TABLE sales (id INTEGER PRIMARY KEY, total FLOAT);
            INSERT INTO sales VALUES (1, 480);
            CREATE TABLE customer_notes (id INTEGER PRIMARY KEY, customer_id INTEGER, note_type VARCHAR, note_text VARCHAR);
            INSERT INTO customer_notes VALUES (1, 1, 'advance_payment', 'Advance via mobile: Rs 1,500 received');
            CREATE TABLE store_settings (id INTEGER PRIMARY KEY, store_name VARCHAR);
            INSERT INTO store_settings VALUES (1, 'My Shop');
            """
        )


def test_fresh_database_is_created_and_baselined(tmp_path):
    db = tmp_path / "pos.db"
    report = run_migrations(_engine(db), force=True)

    assert set(Base.metadata.tables) <= set(report.created_tables)
    assert report.backup_path is None  # nothing to protect yet
    with sqlite3.connect(db) as c:
        rows = c.execute("SELECT version, mode FROM schema_migrations").fetchall()
    assert ("0001", "baseline") in rows

    again = run_migrations(_engine(db), force=True)
    assert not again.changed


def test_old_database_is_upgraded_without_losing_data(tmp_path):
    db = tmp_path / "pos.db"
    _make_old_db(db)

    report = run_migrations(_engine(db), force=True)

    # backup of the original schema
    assert report.backup_path and report.backup_path.exists()
    assert "sale_blocked" not in _cols(report.backup_path, "products")

    # columns added with the model defaults
    products = _cols(db, "products")
    assert {"sale_blocked", "company", "allow_decimal_qty", "selling_units", "base_unit"} <= set(products)
    with sqlite3.connect(db) as c:
        row = c.execute("SELECT name, sale_blocked, base_unit, selling_units, allow_decimal_qty FROM products").fetchone()
        assert row == ("Old rice", 0, "piece", "[]", 0)
        assert c.execute("SELECT default_print_format, invoice_show_tax_id FROM store_settings").fetchone() == ("compact", 1)
        # on-add backfills ran because these columns were just created
        assert c.execute("SELECT subtotal_amount, discount FROM purchases").fetchone() == (125.5, 0)
        assert c.execute("SELECT amount_paid FROM sales").fetchone() == (480,)
        assert c.execute("SELECT amount, payment_method FROM customer_notes").fetchone() == (1500.0, "mobile")
        # new tables
        assert c.execute("SELECT count(*) FROM sqlite_master WHERE name='product_variations'").fetchone()[0] == 1
        assert c.execute("SELECT mode FROM schema_migrations WHERE version='0001'").fetchone() == ("run",)

    # the ORM can read the upgraded table
    with Session(_engine(db)) as s:
        product = s.get(Product, 1)
        assert product.name == "Old rice" and product.sale_blocked is False

    assert not run_migrations(_engine(db), force=True).changed


def test_backfill_does_not_touch_columns_that_already_existed(tmp_path):
    db = tmp_path / "pos.db"
    run_migrations(_engine(db), force=True)
    with sqlite3.connect(db) as c:
        c.execute("INSERT INTO sales (id, total, amount_paid) VALUES (7, 900, 0)")  # a credit (udhar) sale
        c.execute("ALTER TABLE products DROP COLUMN sale_blocked")  # simulate a newly added model column
    report = run_migrations(_engine(db), force=True)
    assert report.added_columns == ["products.sale_blocked"]
    with sqlite3.connect(db) as c:
        assert c.execute("SELECT amount_paid FROM sales WHERE id = 7").fetchone() == (0,)


def test_failed_migration_rolls_back_and_names_backup(tmp_path, monkeypatch):
    db = tmp_path / "pos.db"
    _make_old_db(db)

    def boom(conn):
        conn.execute("UPDATE products SET name = 'changed'")
        raise RuntimeError("simulated failure")

    broken = types.SimpleNamespace(VERSION="9999", DESCRIPTION="broken", upgrade=boom, __name__="broken")
    from app.db.migrations import versions

    monkeypatch.setattr(versions, "VERSIONS", [*versions.VERSIONS, broken])

    with pytest.raises(MigrationError) as err:
        run_migrations(_engine(db), force=True)
    assert "pre-migration" in str(err.value)

    with sqlite3.connect(db) as c:
        assert "sale_blocked" not in _cols(db, "products")  # column additions rolled back too
        assert c.execute("SELECT name FROM products").fetchone() == ("Old rice",)
        # nothing recorded: even the bookkeeping table was rolled back
        assert c.execute("SELECT count(*) FROM sqlite_master WHERE name='schema_migrations'").fetchone() == (0,)


def test_duplicate_data_skips_unique_index_instead_of_failing(tmp_path):
    db = tmp_path / "pos.db"
    _make_old_db(db)
    with sqlite3.connect(db) as c:
        c.execute("INSERT INTO products (id, name, sku) VALUES (2, 'Dup', 'R1')")
    report = run_migrations(_engine(db), force=True)
    assert "ix_products_sku" in report.skipped_indexes
    assert any("ix_products_sku" in w for w in report.warnings)


def test_newer_database_version_is_reported_not_fatal(tmp_path):
    db = tmp_path / "pos.db"
    run_migrations(_engine(db), force=True)
    with sqlite3.connect(db) as c:
        c.execute("INSERT INTO schema_migrations VALUES ('9000', 'from the future', 'now', 'run')")
    report = run_migrations(_engine(db), force=True)
    assert any("9000" in w for w in report.warnings)


def test_cli_new_creates_and_registers_migration(tmp_path, monkeypatch):
    from app.db.migrations import __main__ as cli

    versions_dir = tmp_path / "versions"
    versions_dir.mkdir()
    real = Path(cli.__file__).parent / "versions"
    (versions_dir / "__init__.py").write_text((real / "__init__.py").read_text(encoding="utf-8"), encoding="utf-8")
    (versions_dir / "v0001_baseline_repairs.py").write_text("", encoding="utf-8")
    monkeypatch.setattr(cli, "VERSIONS_DIR", versions_dir)

    cli._new("Add loyalty points")

    created = versions_dir / "v0002_add_loyalty_points.py"
    assert created.exists()
    assert 'VERSION = "0002"' in created.read_text(encoding="utf-8")
    registry = (versions_dir / "__init__.py").read_text(encoding="utf-8")
    assert "from app.db.migrations.versions import v0002_add_loyalty_points" in registry
    assert "    v0002_add_loyalty_points,\n]" in registry


def test_runner_column_ddl_matches_legacy_definitions():
    """The auto-migrator must produce what the old hand-written lists did."""
    from sqlalchemy.dialects import sqlite

    products = Base.metadata.tables["products"]
    ddl = {c.name: runner.column_ddl(c, sqlite.dialect())[0] for c in products.columns}
    assert ddl["base_unit"].endswith("DEFAULT 'piece'")
    assert ddl["selling_units"].endswith("DEFAULT '[]'")
    assert ddl["sale_blocked"].endswith("DEFAULT 0 NOT NULL")
