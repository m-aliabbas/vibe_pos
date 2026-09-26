# Phase 1 Verification Record

Date: 2026-09-25  
Status: Awaiting manual verification

## Delivered

- Ordered, checksum-protected SQLite migration registry.
- `schema_migrations` history with unique identifier, timestamp, checksum, and
  application version.
- One startup path for direct Uvicorn and packaged `run_server.py` execution.
- Validated SQLite online backup before any existing-database mutation.
- Transactional per-migration execution and fail-closed recovery messages.
- Legacy startup-column baseline and removal of unversioned schema mutation.
- Post-migration quick check, foreign-key check, journal balance check, row-count
  comparison, and customer/vendor/stock total comparison.
- Disposable tests for old/new databases, a second run, rollback, row survival,
  and isolated application roots.
- Operator recovery and multi-dialect strategy documentation.

## Automated evidence

- `python -m unittest discover -s tests -v`: 13 tests passed.
- `python -m compileall -q backend/app backend/run_server.py backend/tests`:
  passed.
- Disposable direct `app.main` startup: new database received both migration
  records and no unnecessary backup.
- Disposable representative pre-history schema: one backup created; product
  stock and customer balances survived; `PRAGMA quick_check` returned `ok`.
- Temporary PyInstaller macOS ARM build: passed; analysis included
  `app.db.migrations`, `.registry`, and `.runner`.
- `npm run build`: passed for the frontend production build.
- `git diff --check`: passed.

The full Tauri installer was not produced on this host because the repository's
`frontend/src-tauri/bin` directory does not contain the required prebuilt Next
and backend external binaries. The migration modules require no loose resources
and were confirmed in a frozen PyInstaller dependency graph. A Windows sidecar
build remains a Windows/CI release-matrix check.

## Manual verification

Use only a disposable copy of a representative installation database.

- [ ] Launch the upgraded build and confirm a new file appears under
  `backups/migrations/` before the first upgrade.
- [ ] Confirm the application opens and expected customer, vendor, stock, and
  accounting totals match the source copy.
- [ ] Restart and confirm no second migration backup or duplicate history rows
  are created.
- [ ] Exercise a deliberately failing test build and confirm startup stops with
  the recovery backup path.
- [ ] Restore the reported backup while VibePOS is stopped and confirm the older
  build can open it.
