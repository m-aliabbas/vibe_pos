# Database Migration and Recovery Contract

Status: Phase 1 implementation; application identity extension added in Phase 4

## Runtime behavior

Each application target uses the ordered registry under
`backend/app/db/migrations/` against its own configured database. Both direct
Uvicorn imports and the packaged `run_server.py` launcher select the application
manifest and execute the same runner before accepting requests or seeding data.
Tauri supplies an application ID and relative writable data path. Retail keeps
its legacy `VibePOS/data` location; workshop and restaurant use separate
`VibePOS/<application-id>/data` roots.

For an existing SQLite database with pending migrations, startup:

1. runs SQLite `quick_check` against the source;
2. creates an online, timestamped database backup under
   `<application-root>/backups/migrations/`;
3. opens and validates the backup with `quick_check`;
4. initializes any missing ORM tables;
5. applies each migration and its history record in one `BEGIN IMMEDIATE`
   transaction;
6. checks foreign keys, journal balance, important row counts, customer/vendor
   balances, and stock totals; and
7. starts the application only if every check succeeds.

Empty/new databases have no customer state to protect. They are initialized and
stamped without creating a pre-migration backup. Running the runner again is a
no-op and does not create another backup.

## Legacy baseline

The old standalone `migrate_*.py` scripts did not share a history table. Migration
`0001_legacy_schema_baseline` therefore inspects the schema and idempotently adds
only the product columns previously guaranteed by packaged startup. Migration
`0002_startup_column_additions` takes ownership of the additions formerly made
by `app.main.ensure_schema_columns()`. Migration `0003` records the default
retail application/profile, and `0004` adds the compatible `stock` item type.
Migration `0005_application_identity` stamps an empty independent-app database
with its selected application/profile. It refuses to reassign a database when
any business table contains rows; a populated retail database is never converted
by switching an installer or environment variable.

Already-upgraded installations are stamped without replaying historical data
transformations. The standalone scripts remain historical references and must
not be used for new schema changes.

## Failure and recovery

Migration errors stop backend startup. The error reports the validated backup
path; the application never continues against a known partially upgraded
database. To recover:

1. stop every VibePOS process using the database;
2. retain the failed database and logs for diagnosis;
3. copy the reported `*_pre_migration_*.db` file over the application `pos.db`;
4. correct or roll back the application release; and
5. restart and confirm the migration log and database health.

SQLite supports transactional execution for the additive DDL currently in the
registry. If a future SQLite operation requires table recreation or cannot be
made fully transactional, its migration must document that limitation and rely
on the validated pre-migration backup for recovery.

## Multi-dialect strategy

Phase 1 intentionally supports only SQLite. Every migration declares its
supported providers. PostgreSQL and MySQL must fail as unsupported until Phase
1B supplies provider-specific locking, DDL adapters, backup validation, and
conformance tests. New migrations must use provider-neutral operations or an
explicit provider adapter; raw SQLite DDL must not be presented as portable.

## Packaging

The registry imports migration callables statically as Python modules. PyInstaller
therefore discovers them through normal analysis; there are no loose migration
files or runtime directory scans to bundle. PyInstaller also explicitly includes
the workshop and restaurant manifests selected dynamically by application ID.
Tauri targets share sidecar binaries but have distinct application IDs, bundle
identifiers, app-owned data roots, and build configurations. They use the
existing `4321` frontend and `8000` backend ports because only one target is
expected to run at a time. Retail alone copies legacy bundled data and applies
retail sample seeding; independent targets never copy the retail data resource
or create the retail sample catalog.
