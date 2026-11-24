# Database migrations

VibePOS upgrades its SQLite database **automatically every time the server starts**
(`run_server.py` before seeding, and `app/main.py` for `uvicorn app.main:app`).
Shops never run migration scripts by hand.

## What happens at startup

1. **Backup** – if anything needs changing, `pos.db` is copied to
   `<DATA_DIR>/backups/pre-migration/pos-<date>-<time>.db` (last 10 kept).
2. **New tables** from the models are created.
3. **New columns** that exist in a model but not in the database are added with
   the model's default (`default=` or `server_default=`).
4. **On-add backfills** (`app/db/migrations/backfills.py`) fill a column from old
   data *only at the moment that column is created*.
5. **New indexes** from the models are created. A unique index that fails because
   of duplicate data is skipped with a warning instead of blocking startup.
6. **Numbered migrations** in `app/db/migrations/versions/` run once each, in order,
   and are recorded in the `schema_migrations` table.

Steps 3–6 run in one transaction. If anything fails, everything is rolled back,
the log names the backup file, and the server refuses to start (it never serves
a half-upgraded database). A database opened by an older VibePOS that was already
migrated by a newer one only logs a warning.

## What do I do when I change the schema?

| Change | What to do |
|---|---|
| New table | Add the model and import it in `app/db/base.py`. Done. |
| New column | Add it to the model **with a default** (e.g. `default=False`, `default="piece"`, `default=list` for JSON). Done. |
| New column that must be filled from old data | Add it to the model, then register a backfill in `backfills.py`: `("table", "column"): "UPDATE …"`. |
| New index | `index=True` on the column (or `Index(...)` on the model). Done. |
| Rename / split / type change / move data / delete column | Write a numbered migration (below). |

Notes on SQLite:

- A `NOT NULL` column needs a constant default, otherwise it is added as nullable (a warning is logged).
- SQLite cannot add a `UNIQUE` column. Use `index=True, unique=True` (a unique index) instead.
- Dropping or renaming columns needs a numbered migration (`ALTER TABLE … RENAME COLUMN` / `DROP COLUMN` work on SQLite 3.35+).

## Numbered migrations

```bash
cd backend
.venv/Scripts/python.exe -m app.db.migrations new "split customer name into first and last"
```

This creates `app/db/migrations/versions/v000N_<slug>.py` and registers it in
`versions/__init__.py` (explicit imports so the PyInstaller build bundles it).
Fill in `upgrade(conn)`, which receives a `sqlite3.Connection` inside the startup
transaction. Do not commit or roll back inside it. Set `RUN_ON_FRESH_DB = True`
only if a brand-new database also needs it (for example, inserting reference rows).
Otherwise new databases just record it as `baseline`.

Never edit or renumber a migration that has shipped; add a new one.

## Commands (run from `backend/`)

```bash
.venv/Scripts/python.exe -m app.db.migrations status   [--data-dir PATH]   # what would change
.venv/Scripts/python.exe -m app.db.migrations upgrade  [--data-dir PATH]   # apply now (with backup)
.venv/Scripts/python.exe -m app.db.migrations backup   [--data-dir PATH]
.venv/Scripts/python.exe -m app.db.migrations new "description"
.venv/Scripts/python.exe -m pytest tests                                   # migration tests
```

Before a release, rehearse on a **copy** of a real shop database:
`status`, then `upgrade`, then `status` again (it should say nothing is missing).

## Restoring a backup

Stop VibePOS, rename the current `pos.db` (keep it), copy the chosen file from
`backups/pre-migration/` to `pos.db`, and start the matching (older) VibePOS
version.

## History

The old one-off scripts (`migrate_*.py`) are kept in `legacy_migrations/` for
reference only. Everything they added is now covered by the models and the
auto-migrator. Their data fixes that still matter live in `backfills.py`, and the
startup repair that used to live in `app/main.py` is migration `0001`.
