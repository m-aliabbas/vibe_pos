# Database Provider Configuration and Operations

Status: Phase 1B implementation

## Supported Tier 1 providers

| Provider | Tested version | SQLAlchemy driver | Offline | Backup tool |
| --- | --- | --- | --- | --- |
| SQLite | Runtime SQLite 3 | Python `sqlite3` | Yes | Online SQLite backup API |
| PostgreSQL | 16 | `psycopg` 3.2 | No | `pg_dump` / `pg_restore` |
| MySQL | 8.4 | `PyMySQL` 1.1 | No | `mysqldump` / `mysql` |

SQLite remains the zero-configuration default. PostgreSQL and MySQL are explicit
choices and never fall back to SQLite if a driver, server, TLS setting, network,
or credential is unavailable.

## Configuration

Configuration is backend-only and should be supplied through the packaged
backend environment or operating-system secret management. It must never be
placed in frontend environment variables, JavaScript bundles, support logs, or
screenshots.

SQLite default (existing installations require no changes):

```dotenv
DATABASE_PROVIDER=sqlite
DATA_DIR=data
```

PostgreSQL example:

```dotenv
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql+psycopg://vibepos:replace-me@db.example.internal:5432/vibepos
DATABASE_SSL_MODE=verify-full
DATABASE_SSL_CA=/secure/path/ca.pem
```

MySQL example:

```dotenv
DATABASE_PROVIDER=mysql
DATABASE_URL=mysql+pymysql://vibepos:replace-me@db.example.internal:3306/vibepos
DATABASE_SSL_MODE=verify_identity
DATABASE_SSL_CA=/secure/path/ca.pem
```

Shared tuning settings are `DATABASE_CONNECT_TIMEOUT`, `DATABASE_POOL_SIZE`,
`DATABASE_MAX_OVERFLOW`, and `DATABASE_POOL_RECYCLE_SECONDS`. Server connections
use pre-ping. MySQL connections use `utf8mb4`, UTC, and strict transactional SQL
mode. SQLite uses WAL, foreign-key enforcement, `busy_timeout`, and normal
synchronous mode.

Connection diagnostics render passwords as `***`. Credentials are passed to
native backup tools through `PGPASSWORD` or `MYSQL_PWD`, not command arguments.

## Schema and locking

Every provider implements health checks and an exclusive migration lock:

- SQLite: `BEGIN IMMEDIATE`;
- PostgreSQL: session advisory lock;
- MySQL: named `GET_LOCK`.

A clean server database is created from current ORM metadata and receives the
same migration history as SQLite. An existing server database containing rows
but no VibePOS migration history is rejected; use the verified transfer command.
This prevents accidental adoption of an unrelated schema.

Historical migrations `0001` and `0002` remain SQLite compatibility migrations.
They are stamped, not replayed, on a clean PostgreSQL/MySQL schema. Future
migrations must explicitly declare supported providers and supply portable or
provider-specific operations.

## Portability audit

- Boolean, JSON, DateTime, integer identity, foreign-key, index, and unique
  metadata compile and run on all three Tier 1 providers.
- String fields are bounded to 255 characters where indexed or identifier-like;
  descriptions, addresses, reasons, and notes use `TEXT`.
- The nullable purchase-item/stock-batch foreign-key cycle has an explicit named
  deferred DDL edge for server schema creation.
- Day, Monday-based week, and calendar-month report buckets have centralized
  SQLite/PostgreSQL/MySQL compilers and boundary conformance tests.
- Monetary and quantity columns intentionally remain `Float` to preserve this
  phase's behavior. The separately tracked fixed-precision migration must be
  additive, reconciled, and approved before changing them to `Numeric`.

## Backup and restore

Automatic and manual database backups call the selected provider adapter.
SQLite backups are validated with `quick_check`. PostgreSQL and MySQL require
compatible native client programs on `PATH`; native command failures stop the
operation without exposing credentials.

Restore is destructive and requires `DATABASE_MAINTENANCE_MODE=true`. Stop all
other application processes first. Legacy SQLite ZIP backups remain readable;
new backups use the provider-native format. PostgreSQL/MySQL restore limitations
follow their native tools, permissions, extensions, and server-version rules.

## Verified provider transfer

Changing `DATABASE_PROVIDER` does not move data. Use a maintenance window and an
empty target database:

```bash
cd backend
export VIBEPOS_SOURCE_DATABASE_URL='sqlite:////absolute/path/to/pos.db'
export VIBEPOS_TARGET_DATABASE_URL='postgresql+psycopg://vibepos:replace-me@host:5432/vibepos'
python -m scripts.transfer_database \
  --source-provider sqlite \
  --target-provider postgresql \
  --data-dir /absolute/path/to/runtime-data \
  --confirm 'sqlite->postgresql'
```

The command requires an exact source-to-target confirmation, maintenance mode
for both adapters, a healthy empty target, and an exclusive target migration
lock. It creates and validates a source backup first, copies tables in dependency
order, defers nullable foreign keys, repairs identities/sequences, writes current
migration history, then compares every table count plus stock and customer/vendor
totals and checks journal balance. A mismatch fails the transfer; the source
remains authoritative and recoverable.

Do not edit configuration to point the production app at the target until the
transfer report passes and the source is retained according to backup policy.

## Offline implications

SQLite starts and operates without a network. PostgreSQL and MySQL require the
configured server throughout normal use; loss of connectivity is an operator-
visible startup/runtime error. No local SQLite replica or automatic fallback is
created.
