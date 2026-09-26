from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.db.migrations.registry import MIGRATIONS, Migration
from app.db.migrations.runner import HISTORY_TABLE, MigrationError, upgrade_database
from tests.support.disposable_database import assert_disposable_database_path


def create_legacy_schema(database_path: Path) -> None:
    connection = sqlite3.connect(database_path)
    try:
        connection.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                name TEXT,
                quantity REAL DEFAULT 0
            );
            CREATE TABLE sales (
                id INTEGER PRIMARY KEY,
                total REAL DEFAULT 0
            );
            CREATE TABLE customers (
                id INTEGER PRIMARY KEY,
                outstanding_balance REAL DEFAULT 0,
                opening_balance REAL DEFAULT 0
            );
            CREATE TABLE vendors (
                id INTEGER PRIMARY KEY,
                opening_balance REAL DEFAULT 0,
                prepaid_credit REAL DEFAULT 0
            );
            CREATE TABLE customer_notes (
                id INTEGER PRIMARY KEY,
                customer_id INTEGER NOT NULL,
                note_text TEXT NOT NULL,
                FOREIGN KEY(customer_id) REFERENCES customers(id)
            );
            INSERT INTO products (id, name, quantity) VALUES (1, 'Synthetic item', 12.5);
            INSERT INTO sales (id, total) VALUES (1, 250.0);
            INSERT INTO customers (id, outstanding_balance, opening_balance)
                VALUES (1, 75.0, 10.0);
            INSERT INTO vendors (id, opening_balance, prepaid_credit)
                VALUES (1, 40.0, 5.0);
            INSERT INTO customer_notes (id, customer_id, note_text)
                VALUES (1, 1, 'Synthetic note');
            """
        )
        connection.commit()
    finally:
        connection.close()


class MigrationRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(prefix="vibepos-migrations-")
        self.root = Path(self.temporary_directory.name)
        self.database_path = self.root / "retail" / "data" / "pos.db"
        self.database_path.parent.mkdir(parents=True)
        assert_disposable_database_path(self.database_path)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_declared_checksums_match_migration_sources(self) -> None:
        for migration in MIGRATIONS:
            self.assertEqual(migration.checksum, migration.source_checksum())

    def test_old_database_is_backed_up_upgraded_and_idempotent(self) -> None:
        create_legacy_schema(self.database_path)

        first = upgrade_database(self.database_path, application_version="test-version")
        self.assertEqual(first.applied, tuple(item.migration_id for item in MIGRATIONS))
        self.assertIsNotNone(first.backup_path)
        assert first.backup_path is not None
        self.assertTrue(first.backup_path.is_file())
        self.assertTrue(first.backup_path.with_suffix(".json").is_file())

        with sqlite3.connect(self.database_path) as connection:
            product_columns = {
                row[1] for row in connection.execute("PRAGMA table_info(products)")
            }
            sale_columns = {row[1] for row in connection.execute("PRAGMA table_info(sales)")}
            note_columns = {
                row[1] for row in connection.execute("PRAGMA table_info(customer_notes)")
            }
            business_configuration = connection.execute(
                "SELECT application_id, profile_id, enabled_modules_json "
                "FROM business_configuration WHERE id = 1"
            ).fetchone()
            history = connection.execute(
                f"SELECT migration_id, application_version FROM {HISTORY_TABLE} ORDER BY migration_id"
            ).fetchall()
            self.assertEqual(
                connection.execute("SELECT name, quantity FROM products WHERE id = 1").fetchone(),
                ("Synthetic item", 12.5),
            )
            self.assertEqual(
                connection.execute(
                    "SELECT outstanding_balance, opening_balance FROM customers WHERE id = 1"
                ).fetchone(),
                (75.0, 10.0),
            )

        self.assertTrue(
            {"has_variations", "variation_attributes", "base_unit", "selling_units", "allow_decimal_qty"}
            <= product_columns
        )
        self.assertIn("previous_balance", sale_columns)
        self.assertTrue({"amount", "payment_method"} <= note_columns)
        self.assertEqual(business_configuration, ("retail", "retail", "[]"))
        self.assertEqual(
            history,
            [(item.migration_id, "test-version") for item in MIGRATIONS],
        )

        second = upgrade_database(self.database_path, application_version="test-version")
        self.assertEqual(second.applied, ())
        self.assertIsNone(second.backup_path)
        self.assertEqual(
            len(list(first.backup_path.parent.glob("*_pre_migration_*.db"))),
            1,
        )

    def test_failed_migration_rolls_back_and_reports_backup_recovery(self) -> None:
        create_legacy_schema(self.database_path)

        def fail_after_schema_change(connection: sqlite3.Connection) -> None:
            connection.execute("ALTER TABLE products ADD COLUMN should_rollback TEXT")
            raise RuntimeError("deliberate migration failure")

        failing = (
            Migration(
                migration_id="0001_deliberate_failure",
                description="Exercise transactional rollback",
                apply=fail_after_schema_change,
            ),
        )

        with self.assertRaises(MigrationError) as raised:
            upgrade_database(self.database_path, migrations=failing)

        self.assertIn("Restore", str(raised.exception))
        with sqlite3.connect(self.database_path) as connection:
            columns = {row[1] for row in connection.execute("PRAGMA table_info(products)")}
            self.assertNotIn("should_rollback", columns)
            self.assertFalse(
                connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
                    (HISTORY_TABLE,),
                ).fetchone()
            )

    def test_preexisting_foreign_key_violations_do_not_block_upgrade(self) -> None:
        create_legacy_schema(self.database_path)
        with sqlite3.connect(self.database_path) as connection:
            connection.execute(
                "CREATE TABLE orphaned_notes ("
                "id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, "
                "FOREIGN KEY(customer_id) REFERENCES customers(id))"
            )
            connection.execute(
                "INSERT INTO orphaned_notes (id, customer_id) VALUES (1, 999)"
            )

        result = upgrade_database(self.database_path)

        self.assertEqual(result.applied, tuple(item.migration_id for item in MIGRATIONS))

    def test_new_database_is_initialized_without_pre_migration_backup(self) -> None:
        def initialize() -> None:
            with sqlite3.connect(self.database_path) as connection:
                connection.execute(
                    "CREATE TABLE products (id INTEGER PRIMARY KEY, quantity REAL DEFAULT 0)"
                )

        result = upgrade_database(self.database_path, schema_initializer=initialize)
        self.assertEqual(result.applied, tuple(item.migration_id for item in MIGRATIONS))
        self.assertIsNone(result.backup_path)
        with sqlite3.connect(self.database_path) as connection:
            self.assertEqual(
                connection.execute(f"SELECT COUNT(*) FROM {HISTORY_TABLE}").fetchone()[0],
                len(MIGRATIONS),
            )

    def test_application_databases_keep_separate_history_and_backups(self) -> None:
        second_database = self.root / "workshop" / "data" / "pos.db"
        second_database.parent.mkdir(parents=True)
        assert_disposable_database_path(second_database)
        create_legacy_schema(self.database_path)
        create_legacy_schema(second_database)

        retail = upgrade_database(self.database_path)
        workshop = upgrade_database(second_database)

        assert retail.backup_path is not None
        assert workshop.backup_path is not None
        self.assertNotEqual(retail.backup_path, workshop.backup_path)
        self.assertEqual(
            retail.backup_path.parents[2], self.database_path.parent.parent.resolve()
        )
        self.assertEqual(
            workshop.backup_path.parents[2], second_database.parent.parent.resolve()
        )


if __name__ == "__main__":
    unittest.main()
