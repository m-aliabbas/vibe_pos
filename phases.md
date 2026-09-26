# VibePOS Platform Phase Gates

## Purpose

This is the short, manual-approval tracker for the modular business-platform
work. Detailed task IDs, technical acceptance criteria, and the completion log
remain in [`task-tracker.md`](task-tracker.md).

Codex must implement only one phase at a time. At the end of each phase:

1. Codex runs the documented automated checks.
2. Codex changes the phase status to **Awaiting manual verification**.
3. The owner performs the manual checklist.
4. The owner explicitly approves or rejects the phase.
5. Only after approval may the next phase begin.

Status values: **Not started**, **In progress**, **Awaiting manual verification**,
**Approved**, or **Blocked**.

## Current gate

| Field | Value |
| --- | --- |
| Active phase | Phase 4 — Frontend composition and application shells |
| Status | Approved |
| Started | 2026-09-26 |
| Owner approval | Phase 3 approved by owner on 2026-09-26 |
| Production database changes | Additive `products.item_type`; existing rows default to `stock` |

## Phase sequence

| Phase | Deliverable | Status | Manual approval required before |
| --- | --- | --- | --- |
| 0 | Architecture decisions, boundary inventory, and retail characterization baseline | Approved | Phase 1 |
| 1 | Safe ordered migration runner, pre-migration backup, and recovery behavior | Approved | Phase 1B |
| 1B | SQLite/PostgreSQL/MySQL connector and provider conformance layer | Approved | Phase 2 |
| 2 | Application manifests, business profiles, and capability enforcement | Approved | Phase 3 |
| 3 | Shared capability boundaries and retail transaction services | Approved | Phase 4 |
| 4 | Frontend composition, registries, and independent application shells | Approved | Phase 5 |
| 5 | Auto-workshop application/module | Not started | Phase 6 or release |
| 6 | Restaurant application/module | Not started | Restaurant release |
| 7 | Clothing profile/module | Not started | Clothing release |
| 8 | Milk-shop profile/module | Not started | Milk-shop release |
| 9 | Packaging, licensing, release matrix, pilot, and rollout | Not started | Production rollout |

## Phase 0 — Architecture and retail baseline

### Deliverables

- [Architecture decision record and dependency rules](docs/architecture/ADR-001-modular-business-platform.md).
- [Business scope and app-versus-profile proposal](docs/architecture/business-scope-baseline.md).
- Share-versus-own capability matrix in the architecture decision record.
- [Current backend/frontend/database/packaging inventory](docs/architecture/current-system-inventory.md).
- Disposable-database test foundation under `backend/tests/`.
- Characterization coverage for current retail transactions and API contracts.
- [Automated verification record](docs/architecture/phase-0-verification.md).

### Automated gate

- Backend characterization tests pass using only a disposable database.
- Backend Python compilation passes.
- Frontend lint and build pass, or any pre-existing failures are recorded.
- `git diff --check` passes.
- No runtime database, backup, credential, export, or generated artifact is added.

### Owner manual verification

- [ x] Agree with the proposed app/profile classification.
- [ x] Agree that different primary transactions remain separate domains.
- [ x] Agree with the shared platform capability list.
- [ x] Agree with the common-customer plus business-profile extension pattern.
- [ x] Agree that the existing FastAPI/Next.js/Tauri application is migrated
  incrementally rather than rewritten.
- [ x] Review the current retail characterization scenarios and confirm that they
  represent behavior that must be preserved.
- [ x] Confirm SQLite remains the default and PostgreSQL/MySQL are explicit
  provider choices without silent fallback.

Approval record:

| Field | Value |
| --- | --- |
| Decision | Approved |
| Approved by | Owner |
| Approval date | 2026-09-25 |
| Notes | Phase 0 approved for migration; begin Phase 1. |

## Phase 1 — Upgrade and migration safety

Manual focus: verify automatic backup, idempotent upgrades, failed-migration
recovery, and unchanged customer/financial totals on a disposable copy.

Implementation and automated evidence: [Phase 1 verification record](docs/architecture/phase-1-verification.md).

Owner manual verification:

- [x] A disposable old database creates a validated pre-migration backup.
- [x] The upgraded application preserves customer, vendor, stock, and journal totals.
- [x] A second startup applies nothing and creates no duplicate backup.
- [x] A deliberately failing migration stops startup and the backup restores cleanly.

Approval record:

| Field | Value |
| --- | --- |
| Decision | Approved |
| Approved by | Owner |
| Approval date | 2026-09-25 |
| Notes | Phase 1 manual verification complete; begin Phase 1B. |

## Phase 1B — Database connector and provider portability

Manual focus: verify unchanged SQLite startup, explicit PostgreSQL/MySQL
configuration, clear connection errors, no fallback, and a verified synthetic
data transfer.

Implementation and automated evidence: [Phase 1B verification record](docs/architecture/phase-1b-verification.md).

Owner manual verification:

- [x] Existing installations open the original SQLite database without new configuration.
- [x] Unavailable server databases fail visibly with credentials redacted and no fallback.
- [x] Provider-native backup and restore pass in a maintenance window.
- [x] A disposable SQLite copy transfers to PostgreSQL and MySQL with matching totals.
- [x] Packaged supported-OS/provider combinations connect successfully.

Approval record:

| Field | Value |
| --- | --- |
| Decision | Approved |
| Approved by | Owner |
| Approval date | 2026-09-26 |
| Notes | Phase 1B manually verified; begin Phase 2. |

## Phase 2 — App manifests, profiles, and capabilities

Manual focus: verify existing installations become retail automatically, retail
screens remain unchanged, and disabled application capabilities are blocked by
the backend.

Implementation and automated evidence: [Phase 2 verification record](docs/architecture/phase-2-verification.md).

Owner manual verification:

- [x] An upgraded existing installation opens as `retail` with its original data and branding.
- [x] Existing retail navigation and core transaction screens remain unchanged.
- [x] `/api/v1/app-config` reports the expected identity, profile, branding, versions, and capabilities.
- [x] A capability disabled by a test license returns HTTP 403 on direct endpoint access.
- [x] Profile selection works on an empty disposable database and is blocked after transactions exist.
- [x] An existing entitlement-free license cache continues to work offline.

Approval record:

| Field | Value |
| --- | --- |
| Decision | Approved |
| Approved by | Owner |
| Approval date | 2026-09-26 |
| Notes | Owner confirmed completion of the Phase 2 manual checklist; begin Phase 3. |

## Phase 3 — Transaction and shared-capability boundaries

Manual focus: repeat cash/credit/unit/variation/purchase/return workflows and
confirm stock, balances, and journals remain consistent after the refactor.

Implementation and automated evidence: [Phase 3 verification record](docs/architecture/phase-3-verification.md).

Owner manual verification:

- [x] Existing catalog rows upgrade as `stock`; service and non-stock items do not mutate inventory.
- [x] Cash, credit, partial payment, price override, discount, tax, and delivery totals match expected rounded amounts.
- [x] Fractional/base-unit conversions and variation stock remain accurate.
- [x] Purchase receiving, FIFO sale issue, purchase return, and sale return update stock once.
- [x] Customer/vendor balances and every resulting journal remain consistent and balanced.
- [x] Held sales and purchases do not change stock or journals before completion.
- [x] A deliberately failed accounting post rolls back transaction, stock, and customer balance changes.

Approval record:

| Field | Value |
| --- | --- |
| Decision | Approved |
| Approved by | Owner |
| Approval date | 2026-09-26 |
| Notes | Owner confirmed all Phase 3 manual checks passed; begin Phase 4. |

## Phase 4 — Frontend composition and application shells

Manual focus: verify navigation, keyboard/scanner behavior, loading/errors,
customer-form composition, branding, and separation between application shells.

Implementation started on 2026-09-26. The first delivered slice adds a typed
app-configuration provider with explicit backend/fallback states, a role- and
capability-aware navigation registry shared by the retail navbar and admin
sidebar, route-level capability guards, and configuration-driven shell branding.
The owner manually verified that foundation and confirmed it is behaving as
expected. A reusable POS product-search/category toolbar has now been extracted;
the owner manually verified the search/category controls, scanner and keyboard
selection behavior, and focus behavior. Its focused lint and the frontend
production build pass. POS product search, cart table, totals/action panel,
checkout customer/payment sections, and sale-completion dialog are extracted as
controlled components; transaction, lookup, and currency calculations remain in
the sales route. The owner manually verified POS search/scanner/keyboard/focus
and checkout customer lookup, selection, removal, and walk-in behavior.

Inventory create/edit forms share item-type, unit conversion, fractional
quantity, selling-unit, and variation sections; `item_type` is included in both
product requests and legacy rows default to `stock`. Customer create/edit forms
share common identity fields, with financial and profile fields outside that
section. Typed module UI slots are available at the POS, catalog, and customer
profile surfaces. Frontend import-boundary checks prevent cross-application
imports. Focused lint, boundary tests (2/2), boundary scan, production build
(27 routes), and `git diff --check` pass. Repository-wide lint still reports
existing findings in legacy pages.

The owner confirmed on 2026-09-26 that Phase 4 manual verification is complete,
including retail cart/payment/checkout/hold, receipt/report regression,
accessibility/loading/error/empty states, and the independent app target,
identity, data-isolation, and first-admin checks.
Independent app isolation is now implemented: workshop/restaurant manifests and
profiles, app-scoped writable data roots, fail-closed application identity
migration, separate Tauri identifiers/config overlays/build scripts, shared
4321/8000 ports for one-at-a-time use, app-aware login/navigation/workspace
shells, and one-time independent-app administrator bootstrap.

Automated backend compilation, migration/data-path tests, frontend target and
boundary tests, focused lint, production build, and `git diff --check` pass. The
native Cargo build was not available in this environment because `cargo`/`rustc`
are absent; the owner confirmed the packaged target checks manually. Full FastAPI
integration tests were not run here because FastAPI was absent from the default
Python shell, but the owner-side backend logs confirm retail startup and
transactions work. The retail manifest export regression was fixed and isolated
startup probes pass for all three app IDs with temporary data roots.

Approval record:

| Field | Value |
| --- | --- |
| Decision | Approved |
| Approved by | Owner |
| Approval date | 2026-09-26 |
| Notes | Owner confirmed all Phase 4 manual and independent-target verification is complete. |

## Phase 5 — Auto workshop

Manual focus: verify vehicles, job cards, parts, labour, reminders, historical
oil data, invoicing, stock, customer balances, and accounting.

## Phase 6 — Restaurant

Manual focus: verify recipes, ingredient units, tables, kitchen states,
cancellations/wastage, finalization, receipts, stock, and accounting.

## Phase 7 — Clothing

Manual focus: verify variations, metres/yards, roll/cut behavior if enabled,
returns, valuation, labels, and reports.

## Phase 8 — Milk shop

Manual focus depends on approved scope: counter retail, delivery subscriptions,
producer collection/quality testing, production, spoilage, or containers.

## Phase 9 — Packaging and rollout

Manual focus: install/upgrade packaged builds, verify app/data isolation,
licensing, LAN/offline startup, backup/restore, release metadata, and pilot
recovery steps before production rollout.
