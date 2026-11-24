"""Developer CLI.

    python -m app.db.migrations status            # what would change
    python -m app.db.migrations upgrade           # apply now (with backup)
    python -m app.db.migrations backup            # just take a backup
    python -m app.db.migrations new "add loyalty points to customers"

Use --data-dir PATH (or the DATA_DIR env var) to choose the database. Run from backend/.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

VERSIONS_DIR = Path(__file__).parent / "versions"

TEMPLATE = '''"""{description}"""

import sqlite3

from app.db.migrations.runner import column_names, table_names

VERSION = "{version}"
DESCRIPTION = "{description}"
# Set True only if a brand-new database also needs this (e.g. inserting reference rows).
RUN_ON_FRESH_DB = False


def upgrade(conn: sqlite3.Connection) -> None:
    """Runs once, inside the startup migration transaction.

    New tables, columns and indexes from the models are added automatically
    before this runs -- use this for data changes, renames, splits, etc.
    Keep it idempotent where you can (check before you change).
    """
    # Example:
    # if "loyalty_points" in column_names(conn, "customers"):
    #     conn.execute("UPDATE customers SET loyalty_points = 0 WHERE loyalty_points IS NULL")
    raise NotImplementedError("Write the data migration, then remove this line")
'''


def _new(description: str) -> None:
    existing = sorted(int(m.group(1)) for p in VERSIONS_DIR.glob("v*.py") if (m := re.match(r"v(\d{4})_", p.name)))
    version = f"{(existing[-1] if existing else 0) + 1:04d}"
    slug = re.sub(r"[^a-z0-9]+", "_", description.lower()).strip("_")[:40] or "change"
    module = f"v{version}_{slug}"
    path = VERSIONS_DIR / f"{module}.py"
    path.write_text(TEMPLATE.format(version=version, description=description.replace('"', "'")), encoding="utf-8")

    registry = VERSIONS_DIR / "__init__.py"
    text = registry.read_text(encoding="utf-8")
    import_line = f"from app.db.migrations.versions import {module}\n"
    text = text.replace("\n# >>> registry", f"{import_line}\n# >>> registry", 1)
    text = text.replace("]\n# <<< registry", f"    {module},\n]\n# <<< registry", 1)
    registry.write_text(text, encoding="utf-8")
    print(f"Created {path.relative_to(Path.cwd()) if path.is_relative_to(Path.cwd()) else path}")
    print("Registered it in app/db/migrations/versions/__init__.py")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.db.migrations")
    parser.add_argument("--data-dir", help="folder that holds pos.db (default: DATA_DIR env or ./data)")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    up = sub.add_parser("upgrade")
    up.add_argument("--no-backup", action="store_true")
    sub.add_parser("backup")
    new = sub.add_parser("new")
    new.add_argument("description")
    args = parser.parse_args(argv)

    if args.command == "new":
        _new(args.description)
        return 0

    if args.data_dir:
        os.environ["DATA_DIR"] = str(Path(args.data_dir).resolve())

    from app.db.migrations.runner import MigrationError, backup_database, describe, plan_migrations, run_migrations
    from app.db.session import engine

    if args.command == "status":
        for line in describe(plan_migrations(engine)):
            print(line)
        return 0
    if args.command == "backup":
        print(backup_database(Path(engine.url.database).resolve(), "manual"))
        return 0
    try:
        report = run_migrations(engine, backup=not args.no_backup, log=print)
    except MigrationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    if not report.changed:
        print("Already up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
