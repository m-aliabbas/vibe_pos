# VibePOS Release Tracker

This file is the source-of-truth summary for application releases. Add user-visible changes under **Unreleased** as they are completed, then move them into a versioned section when the matching tag is published.

## Unreleased

No changes recorded yet.

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
