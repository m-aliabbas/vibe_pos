# VibePOS Release Tracker

This file is the source-of-truth summary for application releases. Add user-visible changes under **Unreleased** as they are completed, then move them into a versioned section when the matching tag is published.

## Unreleased

No changes recorded yet.

## v1.0.26 - 2026-10-10

### Inventory and purchasing

- Added company/brand details to products, including inventory editing and CSV import/export support.
- Added invoice-level purchase discounts and applied them consistently to payable balances and effective inventory cost.

### Customers and reports

- Added customer filters for balance status, udhar range, and sales activity.
- Added company, category, and product filters to the per-product sales report.
- Added expired-batch reporting and complete low-stock/out-of-stock totals to the analytics dashboard.

### Licensing, backup, and updates

- Added administrator warnings when a license is within five days of expiry.
- Fixed Google Drive desktop sign-in to use Google's required loopback IP redirect handling.
- Added automatic GitHub release checks and checksum-verified in-app installer downloads.

### Data and migration notes

- Added the `products.company`, `purchases.subtotal_amount`, and `purchases.discount` fields through an automatic idempotent migration.
- Existing purchase totals are preserved and backfilled as subtotals; no manual upgrade steps are required.

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
| `v1.0.26` | 2026-10-10 | Purchasing, inventory, customer filtering, reporting, licensing, backup, and update improvements. |
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
