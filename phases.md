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
| Active phase | Phase 2 — App manifests, profiles, and capabilities |
| Status | Awaiting manual verification |
| Started | 2026-09-26 |
| Owner approval | Pending Phase 2 manual verification |
| Production database changes | Additive business configuration and retail-profile default only |

## Phase sequence

| Phase | Deliverable | Status | Manual approval required before |
| --- | --- | --- | --- |
| 0 | Architecture decisions, boundary inventory, and retail characterization baseline | Approved | Phase 1 |
| 1 | Safe ordered migration runner, pre-migration backup, and recovery behavior | Approved | Phase 1B |
| 1B | SQLite/PostgreSQL/MySQL connector and provider conformance layer | Approved | Phase 2 |
| 2 | Application manifests, business profiles, and capability enforcement | Awaiting manual verification | Phase 3 |
| 3 | Shared capability boundaries and retail transaction services | Not started | Phase 4 |
| 4 | Frontend composition, registries, and independent application shells | Not started | Phase 5 |
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

- [ ] An upgraded existing installation opens as `retail` with its original data and branding.
- [ ] Existing retail navigation and core transaction screens remain unchanged.
- [ ] `/api/v1/app-config` reports the expected identity, profile, branding, versions, and capabilities.
- [ ] A capability disabled by a test license returns HTTP 403 on direct endpoint access.
- [ ] Profile selection works on an empty disposable database and is blocked after transactions exist.
- [ ] An existing entitlement-free license cache continues to work offline.

Approval record:

| Field | Value |
| --- | --- |
| Decision | Pending |
| Approved by | — |
| Approval date | — |
| Notes | — |

## Phase 3 — Transaction and shared-capability boundaries

Manual focus: repeat cash/credit/unit/variation/purchase/return workflows and
confirm stock, balances, and journals remain consistent after the refactor.

## Phase 4 — Frontend composition and application shells

Manual focus: verify navigation, keyboard/scanner behavior, loading/errors,
customer-form composition, branding, and separation between application shells.

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
