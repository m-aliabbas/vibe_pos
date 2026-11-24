# VibePOS Release Tracker

This file is the source-of-truth summary for application releases. Add user-visible changes under **Unreleased** as they are completed, then move them into a versioned section when the matching tag is published.

## Unreleased

- Fixed: databases first created by v1.0.26 failed to start on v1.0.30 ("no such column: version"). v1.0.26 used a different migration table; its history is now kept as `schema_migrations_v1026` and the upgrade continues automatically.


## v1.0.30 - 2026-11-24

### Database (automatic, no manual steps)

- The database upgrades itself at every startup: missing tables, columns and indexes are added from the models, and numbered migrations run once. A backup is saved to `data/backups/pre-migration/` first. If anything fails, everything is rolled back and the server does not start on a half-upgraded database.
- Restoring a backup from an older version upgrades it immediately; if that fails, the previous database is put back.
- New column `products.sale_blocked` (added automatically).
- Old `migrate_*.py` scripts moved to `backend/legacy_migrations/` (reference only, do not run).

### Sales terminal

- Keyboard-first: F2 search, F3 cart (arrows, +/-, D discount, Delete), F6 sell by amount, F8 hold, F9 checkout, F1 help. Enter completes a sale and starts the next one.
- Product window: quantity and discount first, live line total, and sell-by-amount in a side panel.
- Checkout: Amount Paid is focused first, with quick-cash buttons, Alt+1…4 payment method, a large "Change to return" / "Remaining (udhar)" line, and the payable amount in words.
- Stop selling a product (Ctrl+B, product window, product list or Inventory). Blocked products cannot be sold, and the server enforces this.

### All screens

- Keyboard layer: hold Alt to see keys, Alt+1…0 menus, Ctrl+K go to any screen, / search, ↑↓ rows, Alt+N new, Alt+S save, ? help.
- New black & white, flat, Odoo-style design with consistent page layout and list tables. Owner tools are in the user menu.
- Amounts shown in words under money fields. "$" labels replaced by "Rs".

### Fixes

- Dropdowns no longer overlap neighbouring fields, and a product's base unit is no longer listed twice.
- Inventory, Financial and Users reports no longer fail when decimal quantities have been sold. The Users report works again.
- History, Variations and Profile no longer go to login on refresh.

## v1.0.25 - 2026-10-03

### Backup

- Added Google Drive backup support.

## v1.0.24 - 2026-09-26

### Security and licensing

- Enforced explicit license expiration dates and limited local license-cache validity to 30 days.
- No database schema changes.

## v1.0.23 - 2026-09-24

- stable realease

## v1.0.22 - 2026-09-24

### Release checkpoint

- Synchronized application and desktop package versions for the v1.0.22 release.
- No database schema changes.

## v1.0.21 - 2026-09-24

### Release checkpoint

- Synchronized application and desktop package versions for the v1.0.21 release.
- No database schema changes.

## v1.0.20 - 2026-09-24

### Fixed

- Routed application update checks through the bundled Next.js server so GitHub release redirects do not fail inside the desktop webview with an HTTP 302/CORS error.

### Security and release process

- Limited public release assets to the Windows installer, `SHA256SUMS.txt`, and `latest.json`.
- Kept build diagnostics in the private GitHub Actions artifact.
- Added a publishing guard that stops a release if the public release-only repository contains files other than `README.md`.
- Added cleanup of unexpected assets when an existing release is republished.

### Data and migration notes

- No database schema changes.
- Existing customer data remains stored outside the installation directory under `%LOCALAPPDATA%\VibePOS` on Windows.

## Released versions

| Version | Release date | Notes |
|---|---|---|
| `v1.0.25` | 2026-10-03 | Added Google Drive backup support. |
| `v1.0.24` | 2026-09-26 | License expiration and local-cache validation updates. |
| `v1.0.23` | 2026-09-24 | Version synchronization and release checkpoint. |
| `v1.0.22` | 2026-09-24 | Version synchronization and release checkpoint. |
| `v1.0.21` | 2026-09-24 | Version synchronization and release checkpoint. |
| `v1.0.20` | 2026-09-24 | Fixed in-app update checks and hardened public release contents. |
| `v1.0.19` | 2026-09-23 | Bill-printing fixes. |
| `v1.0.18` | 2026-09-23 | Release checkpoint; no detailed notes were recorded. |
| `v1.0.17` | 2026-09-23 | Version synchronization and release packaging update. |
| `v1.0.16` | 2026-09-23 | Safe runtime-data migration and normalized release lock files. |
| `v0.2.2` | 2026-09-23 | Corrected Tauri package-version alignment. |
| `v0.2.1` | 2026-09-23 | Windows release-runner fixes and release checkpoint. |
| `v0.2.0` | 2026-09-23 | Initial tracked release. |

## Release checklist

1. Move completed notes from **Unreleased** into a new version section or table entry.
2. Record user-visible fixes, security changes, database migrations, and upgrade considerations.
3. Run `cd frontend && npm run set:version -- X.Y.Z`.
4. Run `cd frontend && npm run check:version -- vX.Y.Z`.
5. Run the relevant frontend, backend, and packaging checks described in `WINDOWS_RELEASE.md`.
6. Commit the release changes with `release: vX.Y.Z`.
7. Create and push the matching `vX.Y.Z` tag.
8. Confirm the Windows Release workflow succeeds and the public release contains only approved customer assets.
9. Verify `latest.json`, the installer checksum, and the in-app update check.

## Notes policy

- Do not include credentials, customer information, internal environment values, private repository URLs, or sensitive build logs.
- Describe changes in customer-facing language and call out any manual upgrade or migration steps.
- If a release has no database changes, state that explicitly.
