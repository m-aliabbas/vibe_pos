# Phase 1B Verification Record

Date: 2026-09-25
Status: Awaiting manual verification

## Delivered

- Validated SQLite/PostgreSQL/MySQL backend configuration with SQLite as the
  unchanged default and no fallback behavior.
- Provider registry covering engine construction, pool policy, TLS, health,
  capabilities, migration locks, backup, and restore.
- Provider-aware startup/bootstrap with checksum-protected migration history.
- Centralized portable report day/week/month expressions.
- MySQL-compatible bounded strings/TEXT and a named deferred DDL edge for the
  stock-batch relationship cycle.
- Provider-neutral retail transaction, rollback, date-boundary, concurrent
  migration, and verified-transfer conformance coverage.
- Maintenance-only provider transfer with source backup, exact confirmation,
  dependency ordering, nullable-FK deferral, identity repair, counts/totals
  comparison, and journal validation.
- Provider-native automatic/manual backup integration and maintenance-only
  restore, including legacy SQLite ZIP compatibility.
- PostgreSQL/MySQL drivers in macOS/Windows PyInstaller inputs and a container
  conformance workflow.
- Operator configuration, security, backup, transfer, rollback, and offline
  documentation.

## Automated evidence

- SQLite discovery suite: 21 tests passed; 11 server-only tests skipped by
  design.
- PostgreSQL 16 container: 11 conformance tests passed.
- MySQL 8.4 container: 11 conformance tests passed.
- The server suites cover cash/credit/fractional/variation sales, purchase,
  return, held transactions, rollback, balanced journals, Monday week/calendar
  month boundaries, concurrent migration locks, and verified SQLite transfer.
- Direct `app.main` startup passed for SQLite, PostgreSQL, and MySQL.
- Python compilation and `git diff --check` passed.
- A temporary macOS ARM PyInstaller build included all provider modules,
  `psycopg`, and `pymysql`.

## Verification limits

- PostgreSQL/MySQL native backup executables were not installed on the host.
  Their fail-closed adapters are implemented; native dump/restore must be
  exercised in the deployment environment that supplies `pg_dump`/`pg_restore`
  or `mysqldump`/`mysql`.
- A Windows sidecar and full Tauri installer were not built on this macOS host.
  The checked-in Windows lock/build inputs and CI conformance workflow include
  both server drivers.
- Fixed-precision money/quantity conversion remains the separately gated task
  `X-001`; Phase 1B preserves existing Float behavior.

## Owner manual verification

- [ ] Start an unchanged installation without database variables and confirm it
  opens its existing SQLite database.
- [ ] Configure an unavailable PostgreSQL/MySQL server and confirm startup fails
  clearly, redacts credentials, and creates no SQLite fallback.
- [ ] Run a native backup and restore for each selected deployment provider in a
  maintenance window.
- [ ] Transfer a disposable representative SQLite copy to PostgreSQL and MySQL,
  review the verification report, and compare critical screens/totals.
- [ ] Install a packaged build for each supported OS/provider combination and
  verify connectivity and offline implications.
