# Phase 2 Verification Record

Date: 2026-09-26

Status: Approved by owner after manual verification on 2026-09-26

## Delivered

- Stable application, profile, module, shared-package, and capability identifiers.
- A static retail manifest that owns its routers, model inventory, migration
  registry, compatible profiles, versions, and shared-package requirements.
- Additive migration `0003_retail_business_configuration`, which persists and
  seeds existing installations as `retail` without changing business totals.
- Backend capability dependencies on every manifest-owned router.
- Optional license restrictions for application, profiles, modules, and
  capabilities, with permissive compatibility for existing online/offline
  license records that have no entitlement fields.
- Typed `GET /api/v1/app-config` and admin-only profile-change contract, mirrored
  in `frontend/lib/api.ts`.
- Direct profile-switch protection after sales, purchases, returns, or journals
  exist, plus a future verified-conversion callback seam.
- Shared service protocols and explicit app/module ownership rules for typed
  customer extensions.
- Startup validation for cross-application router ownership, migration
  inventory, and shared-package compatibility.
- Frozen-runtime-safe migration checksums and cross-platform PyInstaller
  multiprocessing dispatch.

## Automated evidence

- Backend suite: 45 discovered, 34 passed, 11 server-provider tests skipped
  because PostgreSQL/MySQL conformance services were not configured locally.
- Backend compilation: passed for `backend/app` and `backend/run_server.py`.
- Isolated direct startup: passed with a disposable SQLite data directory; 124
  routes included the unchanged retail sale path and the new app-config path.
- Migration test: passed twice on a disposable legacy database; the persistent
  configuration row is `retail` and existing protected totals survive.
- Frontend production build: passed, including TypeScript validation and all 27
  application routes.
- Frontend lint: reproduces the recorded pre-existing baseline of 131 errors and
  80 warnings. The touched API client has four pre-existing `any` errors and no
  new finding on the Phase 2 types.
- Temporary PyInstaller build: passed. A fresh frozen backend migrated and
  seeded a disposable SQLite database, started once on macOS, and returned HTTP
  200 from `/api/v1/app-config` with profile `retail`, schema version `3`, and
  the expected retail capability set.
- `git diff --check`: passed.

The PostgreSQL/MySQL migration path is provider-neutral and covered by the
existing CI conformance job. Its live services were unavailable in this local
environment, so that CI matrix remains an external verification item.

## Owner manual checklist

- [x] An upgraded existing installation opens as the `retail` profile with its
  original store branding and data.
- [x] Existing retail navigation and core sale, purchase, return, customer, report,
  and settings screens behave as before.
- [x] `GET /api/v1/app-config` reports the expected application, retail profile,
  branding, versions, and capabilities.
- [x] A capability explicitly removed by a test license produces HTTP 403 even when
  its endpoint is called directly.
- [x] A compatible profile can be selected on an empty disposable database, while
  direct switching is rejected after transactional data exists.
- [x] An existing license/cache without entitlement fields remains usable offline.

Approval record:

| Field | Value |
| --- | --- |
| Decision | Approved |
| Approved by | Owner |
| Approval date | 2026-09-26 |
| Notes | Owner confirmed completion of the manual checklist and authorized Phase 3. |
