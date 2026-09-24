# VibePOS Modular Architecture Implementation Tracker

## Purpose

This document is the execution tracker for converting VibePOS into a modular
monolith that supports retail, auto workshop, clothing, milk-shop, and
restaurant profiles from one shared codebase.

The architecture work must preserve the current retail behavior and all existing
customer data. This tracker complements `FUTURE_PLAN.md`; it does not replace the
general product roadmap.

## Target outcome

- One repository and one shared VibePOS core.
- One default `retail` profile for every existing installation.
- Reusable horizontal capabilities such as fractional quantities, units,
  variations, batches, expiry, credit, and stock audit.
- Optional vertical modules for workshop, restaurant, clothing, and milk-shop
  workflows.
- Core fixes flow to every profile because every installer is built from the
  same source commit.
- No long-lived per-industry Git branches.

## Tracker rules

Status values:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete and verified
- `[!]` Blocked; record the blocker in the completion log

Working rules:

1. Complete phases in order unless a task explicitly says it can run in
   parallel.
2. Start a phase only after its entry criteria are met.
3. Mark a task complete only after its acceptance criteria and checks pass.
4. Record important decisions in the decision log before implementing behavior
   that depends on them.
5. Record migrations, verification commands, and unresolved gaps in the
   completion log.
6. Never test a migration against `data/pos.db`, `backend/data/pos.db`, or a
   customer backup. Always use a disposable database.
7. Do not commit local databases, backups, uploads, credentials, exports, build
   output, or generated runtime state.

## Non-negotiable invariants

- [ ] Existing customers, vendors, products, sales, purchases, returns,
  payments, stock, and journals survive every upgrade.
- [ ] Existing installations resolve to the `retail` profile without manual
  setup and retain the current user experience.
- [ ] A business transaction updates stock, balances, payments, and accounting
  together or updates none of them.
- [ ] Every journal entry remains balanced.
- [ ] Held transactions do not post final stock or accounting effects early.
- [ ] Returns do not restore or deduct stock twice.
- [ ] Fractional quantities and unit conversions retain deliberate precision.
- [ ] Backend authorization and capability checks protect endpoints even when a
  frontend route is hidden.
- [ ] Runtime data remains outside immutable application resources in packaged
  Windows and macOS builds.
- [ ] A failed migration leaves a recoverable pre-upgrade database.

## Architecture decisions

| ID | Decision | Status | Current direction |
| --- | --- | --- | --- |
| ADR-001 | Product-line structure | Proposed | Modular monolith in one repository |
| ADR-002 | Deployment shape | Proposed | One universal installer with a licensed/configured profile |
| ADR-003 | Profile model | Proposed | One primary profile plus reusable capabilities |
| ADR-004 | Existing-install default | Proposed | Automatically use `retail` |
| ADR-005 | Module loading | Proposed | Static registries compatible with PyInstaller |
| ADR-006 | Profile switching | Proposed | Controlled conversion after transactional data exists |
| ADR-007 | Vertical-to-sale link | Proposed | Vertical record references a core `sale_id` |
| ADR-008 | Database upgrades | Proposed | Ordered, idempotent migrations with schema history |

## Phase overview

| Phase | Focus | Depends on | Status |
| --- | --- | --- | --- |
| 0 | Decisions, baseline, and characterization | None | Not started |
| 1 | Upgrade and migration safety | Phase 0 | Not started |
| 2 | Business profiles and capability registry | Phase 1 | Not started |
| 3 | Core transaction and inventory boundaries | Phase 2 | Not started |
| 4 | Frontend modular shell | Phases 2-3 | Not started |
| 5 | Auto workshop proof module | Phase 4 | Not started |
| 6 | Restaurant module | Phase 5 lessons applied | Not started |
| 7 | Clothing profile/module | Phase 4 | Not started |
| 8 | Milk-shop profile/module | Phase 4 | Not started |
| 9 | Packaging, licensing, release, and rollout | Required module phases | Not started |

---

## Phase 0 — Decisions, baseline, and characterization

**Goal:** Freeze the intended boundaries and capture current retail behavior
before refactoring it.

### Tasks

- [ ] **ARCH-001:** Write the modular-monolith architecture decision record,
  including core domains, horizontal capabilities, vertical modules, and
  dependency rules.
- [ ] **ARCH-002:** Confirm whether releases use one universal installer or
  separately branded installers built from the same commit.
- [ ] **ARCH-003:** Confirm whether a store can enable multiple vertical modules
  or must have one primary profile with optional capabilities.
- [ ] **ARCH-004:** Define the minimum workflows for workshop, restaurant,
  clothing, and milk-shop before designing their schemas.
- [ ] **ARCH-005:** Inventory the current API routes, database tables, frontend
  routes, navigation entries, and packaging imports by domain.
- [ ] **ARCH-006:** Document core dependency rules. Vertical modules may depend
  on core services; core domains must not import vertical modules.
- [ ] **TEST-001:** Add a backend test foundation using a disposable SQLite
  database and supported license bypass/configuration for tests only.
- [ ] **TEST-002:** Add retail characterization tests for cash sale, credit sale,
  partial payment, variation sale, fractional/unit-converted sale, and rollback.
- [ ] **TEST-003:** Add characterization tests for purchase, return, held sale,
  held purchase, customer/vendor balances, stock batches, and journal balance.
- [ ] **TEST-004:** Capture representative API contracts needed by the current
  frontend, without copying any real customer data.

### Exit gate

- Architecture decisions are accepted.
- Current retail behavior is protected by repeatable tests.
- The test database cannot resolve to a production/customer data path.
- No production behavior or schema has changed in this phase.

---

## Phase 1 — Upgrade and migration safety

**Goal:** Establish a single safe database-upgrade mechanism before adding
profiles or module tables.

### Tasks

- [ ] **MIG-001:** Add a schema migration history table with a unique migration
  identifier, applied timestamp, and application version.
- [ ] **MIG-002:** Add an ordered migration registry/runner that executes before
  normal application startup and safely skips already-applied migrations.
- [ ] **MIG-003:** Define the baseline for databases already upgraded by the
  existing standalone migration scripts and `ensure_schema_columns()`.
- [ ] **MIG-004:** Move startup column additions into versioned, idempotent
  migrations while preserving compatibility with current installations.
- [ ] **MIG-005:** Create an automatic timestamped pre-migration backup in the
  writable runtime data directory.
- [ ] **MIG-006:** Validate the backup before applying a migration and fail closed
  if a recoverable backup cannot be produced.
- [ ] **MIG-007:** Ensure each migration is transactional where SQLite supports it
  and has a documented recovery path where it does not.
- [ ] **MIG-008:** Add migration tests against synthetic old-version databases,
  run every migration twice, and verify that existing rows survive.
- [ ] **MIG-009:** Add post-migration integrity checks for important row counts,
  foreign keys, journal balance, customer/vendor balances, and stock totals.
- [ ] **MIG-010:** Verify migration discovery and execution in development,
  PyInstaller backend builds, and Tauri startup paths on supported platforms.
- [ ] **MIG-011:** Document operator-visible failure and recovery behavior; never
  silently open a partially migrated database.

### Exit gate

- A copy of a representative old database upgrades successfully.
- Running the migration runner twice produces no additional changes.
- A deliberately failing migration demonstrates rollback/recovery behavior.
- Existing customer data and financial totals remain unchanged.

---

## Phase 2 — Business profiles and capability registry

**Goal:** Introduce a backend-authoritative profile without changing the current
retail experience.

### Tasks

- [ ] **MOD-001:** Define stable identifiers for profiles, modules, and reusable
  capabilities.
- [ ] **MOD-002:** Add a persistent business-profile configuration with a safe
  migration that assigns `retail` to every existing database.
- [ ] **MOD-003:** Add a static backend module registry declaring routers,
  capabilities, model imports, migrations, and module metadata.
- [ ] **MOD-004:** Ensure all registered models are imported for SQLAlchemy
  metadata discovery and included in packaged builds.
- [ ] **MOD-005:** Add a typed `GET /api/v1/app-config` contract returning the
  profile, enabled capabilities, branding, and application/schema versions.
- [ ] **MOD-006:** Add backend capability dependencies/guards and apply them to
  module-only endpoints.
- [ ] **MOD-007:** Define profile-change rules. Prevent unsafe direct switching
  after transactional data exists and provide a future conversion seam.
- [ ] **MOD-008:** Integrate profile/module entitlements with licensing while
  preserving offline-safe startup and existing licenses.
- [ ] **MOD-009:** Add tests proving disabled module endpoints cannot be accessed
  directly and existing retail endpoints remain available.
- [ ] **MOD-010:** Document the source of truth: backend configuration and license
  determine capability access; frontend configuration controls presentation only.

### Exit gate

- An existing database automatically starts as `retail`.
- The current retail API contract and behavior remain unchanged.
- Capabilities are enforced by the backend.
- App configuration is available to the frontend through one typed endpoint.

---

## Phase 3 — Core transaction and inventory boundaries

**Goal:** Create explicit extension points so vertical modules do not add large
conditional blocks to sales, purchases, returns, or accounting endpoints.

### Tasks

- [ ] **CORE-001:** Define core catalog item types such as stock item, service,
  prepared item, and non-stock item without changing existing products by
  default.
- [ ] **CORE-002:** Extract pure unit-conversion and sale-total calculations from
  HTTP endpoints and cover rounding, discounts, tax, and price overrides.
- [ ] **CORE-003:** Introduce an inventory service for receiving, issuing,
  returning, and adjusting stock, including variations and FIFO batches.
- [ ] **CORE-004:** Introduce an application-level sale service that validates,
  prices, persists, applies inventory, updates customer balances, posts
  accounting, and commits atomically.
- [ ] **CORE-005:** Define an inventory-consumption policy for stock, service, and
  prepared items; restaurant recipe consumption will implement this seam later.
- [ ] **CORE-006:** Refactor purchase and return workflows to use the same
  inventory boundary without changing their external contracts.
- [ ] **CORE-007:** Preserve held-transaction behavior and prove that holds do not
  prematurely mutate final stock or journals.
- [ ] **CORE-008:** Define how vertical records link to finalized sales. Prefer a
  vertical table with a unique `sale_id` over vertical columns on `sales`.
- [ ] **CORE-009:** Add failure-injection tests proving rollback across stock,
  balances, sale records, and accounting.
- [ ] **CORE-010:** Decide and document the staged precision strategy for currency
  and quantities. Do not combine a full Float-to-Decimal migration with an
  unrelated module change.

### Exit gate

- Existing sales, purchases, and returns pass characterization tests.
- Core transaction endpoints orchestrate application services rather than owning
  all business logic.
- Stock and accounting remain atomic under induced failures.
- A new consumption policy can be added without editing the core sale algorithm.

---

## Phase 4 — Frontend modular shell

**Goal:** Make navigation and vertical UI composition profile-aware while keeping
the existing retail UI intact.

### Tasks

- [ ] **UI-001:** Add typed frontend app-configuration interfaces and API client
  functions synchronized with the backend schema.
- [ ] **UI-002:** Add an app-configuration provider with explicit loading,
  unavailable, and fallback states.
- [ ] **UI-003:** Replace duplicated hardcoded navigation definitions with a
  registry that includes required roles and capabilities.
- [ ] **UI-004:** Add route-level capability guards for module pages while keeping
  backend enforcement authoritative.
- [ ] **UI-005:** Extract reusable POS pieces from the large sales page: product
  search, cart, totals, customer/payment section, and completion flow.
- [ ] **UI-006:** Extract reusable inventory form sections for item type, units,
  fractional quantity, variations, and module contributions.
- [ ] **UI-007:** Define supported module UI contribution points instead of
  allowing arbitrary module code inside core pages.
- [ ] **UI-008:** Confirm the `retail` profile renders the same navigation,
  workflows, receipts, and reports as before the refactor.
- [ ] **UI-009:** Run accessibility, keyboard/scanner workflow, empty-state,
  loading-state, and error-state checks on the refactored screens.

### Exit gate

- Retail users see no unintended navigation or workflow change.
- Module routes are hidden and blocked when disabled.
- The core sales and inventory pages accept controlled module contributions.
- Frontend lint and production build pass.

---

## Phase 5 — Auto workshop proof module

**Goal:** Validate the module architecture using the workshop behavior that has
already leaked into the shared customer model.

### Tasks

- [ ] **WS-001:** Confirm workshop workflows: multiple vehicles per customer,
  job cards, technicians, parts, labour, mileage, reminders, estimates, and
  invoicing.
- [ ] **WS-002:** Add workshop models for vehicles, service reminders, work
  orders/job cards, and work-order lines using additive migrations.
- [ ] **WS-003:** Copy existing customer oil-change data into vehicle/reminder
  records without deleting the legacy customer columns.
- [ ] **WS-004:** Add a migration verification report for copied oil-change data,
  including unmappable or incomplete records.
- [ ] **WS-005:** Add workshop APIs, schemas, permissions, and frontend types.
- [ ] **WS-006:** Add workshop navigation and screens only when the workshop
  capability is enabled.
- [ ] **WS-007:** Support parts as stock items and labour/services as non-stock
  sale lines.
- [ ] **WS-008:** Finalize a work order into exactly one core sale and balanced
  journal transaction; prevent duplicate invoicing.
- [ ] **WS-009:** Add service history and due-reminder reporting.
- [ ] **WS-010:** Test old retail databases, old oil-tracking databases, workshop
  sale rollback, returns, customer credit, and invoice printing.
- [ ] **WS-011:** Retain legacy oil fields for a compatibility window. Plan their
  removal only after multiple verified releases, if removal remains worthwhile.

### Exit gate

- Workshop behavior is isolated from core customer records.
- Retail installations remain unchanged.
- Existing oil-change information is preserved and auditable.
- Parts, labour, balances, stock, and accounting remain consistent.

---

## Phase 6 — Restaurant module

**Goal:** Support menu preparation, ingredient consumption, dining tables, and
kitchen workflow without duplicating core sales/accounting.

### Tasks

- [ ] **REST-001:** Confirm restaurant scope: dine-in, takeaway, delivery,
  modifiers, kitchen stations, table transfers, split bills, and order states.
- [ ] **REST-002:** Add relational models for ingredients, recipes, recipe lines,
  menu items, modifiers, dining tables, restaurant orders, and kitchen tickets.
- [ ] **REST-003:** Define recipe versions or snapshots so historical ingredient
  usage remains explainable after a recipe changes.
- [ ] **REST-004:** Implement prepared-item inventory consumption through the
  Phase 3 policy, converting recipe units into ingredient base units.
- [ ] **REST-005:** Define cancellation, wastage, void, return, and reopened-order
  inventory behavior before enabling each action.
- [ ] **REST-006:** Add table/session and kitchen-ticket APIs with backend
  permissions and valid state transitions.
- [ ] **REST-007:** Add restaurant POS, floor/table, kitchen, recipe, and menu
  management screens behind restaurant capabilities.
- [ ] **REST-008:** Finalize restaurant orders through the core sale/payment/
  accounting service and prevent duplicate finalization.
- [ ] **REST-009:** Add restaurant reports for ingredient usage, theoretical
  versus actual stock, wastage, menu profitability, tables, and order channels.
- [ ] **REST-010:** Test fractional ingredients, insufficient ingredients,
  modifiers, partial/split payment as scoped, cancellation, rollback, and
  receipt/kitchen printing.

### Exit gate

- Selling a menu item consumes the correct ingredients once.
- Order state transitions cannot create duplicate stock or accounting effects.
- Retail and workshop profiles do not expose restaurant APIs or screens.
- Restaurant sales still use the shared customer, payment, and accounting core.

---

## Phase 7 — Clothing profile/module

**Goal:** Reuse existing variation and fractional-unit capabilities, adding a
module only for workflows that cannot be expressed by configuration.

### Tasks

- [ ] **CLOTH-001:** Confirm whether the scope is fabric retail, ready-made
  garments, tailoring, or a combination.
- [ ] **CLOTH-002:** Validate existing size/color/material variations and
  metre/yard fractional sales against real workflows using synthetic data.
- [ ] **CLOTH-003:** Define unit-conversion and rounding rules for metres, yards,
  pieces, rolls, and packs.
- [ ] **CLOTH-004:** If required, add roll/lot and cut tracking while maintaining
  one inventory source of truth.
- [ ] **CLOTH-005:** If required, add customer measurements and tailoring orders
  as module-owned records rather than customer/product columns.
- [ ] **CLOTH-006:** Add capability-specific forms, reports, labels, and receipts.
- [ ] **CLOTH-007:** Test partial roll sales, returns, conversions, variations,
  negative-stock prevention, and valuation.

### Exit gate

- Basic clothing retail works through shared capabilities where possible.
- Any clothing-specific data remains in the clothing module.
- Fractional stock and unit reports reconcile to base units.

---

## Phase 8 — Milk-shop profile/module

**Goal:** Implement only the milk business model actually required, rather than
assuming that all milk shops operate the same way.

### Tasks

- [ ] **MILK-001:** Select and document the scope: counter retail, recurring home
  delivery, producer collection, fat/SNF quality testing, or a combination.
- [ ] **MILK-002:** Validate litre-based fractional sales and container/pack unit
  conversions through shared capabilities.
- [ ] **MILK-003:** If delivery is required, add subscriptions, delivery routes,
  schedules, skips, quantity changes, delivery records, and periodic billing.
- [ ] **MILK-004:** If producer collection is required, add supplier collection,
  quantity, quality readings, rate calculation, rejection, and settlement.
- [ ] **MILK-005:** Define spoilage, wastage, production/conversion, and returnable
  container inventory rules where applicable.
- [ ] **MILK-006:** Add milk-specific screens, permissions, receipts, statements,
  and operational reports behind capabilities.
- [ ] **MILK-007:** Test fractional quantity, recurring billing, credit,
  cancellations/skips, spoilage, supplier payable, and rollback for the selected
  scope.

### Exit gate

- The implemented module matches the explicitly selected milk-shop model.
- Shared retail behavior handles simple cases without duplicate code.
- Delivery or procurement records reconcile with inventory and accounting.

---

## Phase 9 — Packaging, licensing, release, and rollout

**Goal:** Ship enabled profiles safely from the same codebase and prove upgrades
on real packaging paths without exposing customer data.

### Tasks

- [ ] **REL-001:** Ensure static module imports, models, migrations, routers, and
  assets are included in Windows and macOS packaged builds.
- [ ] **REL-002:** Confirm module licensing and cached offline entitlements do not
  prevent an already licensed retail installation from starting.
- [ ] **REL-003:** Decide whether branding is runtime configuration or a CI build
  matrix; all variants must use the same source commit and version.
- [ ] **REL-004:** Add upgrade tests from representative tagged versions to the
  modular release using disposable database copies.
- [ ] **REL-005:** Verify pre-upgrade backup, migration logs, startup recovery,
  downgrade limitations, and operator-facing errors in packaged builds.
- [ ] **REL-006:** Run backend compile/tests, frontend lint/build, Rust checks,
  and warranted production Tauri builds.
- [ ] **REL-007:** Perform profile smoke tests for authentication, sale, purchase,
  return, reports, backup/restore, LAN mode, and offline startup.
- [ ] **REL-008:** Document release notes, database changes, compatibility window,
  and recovery steps in `RELEASE_TRACKER.md` and operator documentation.
- [ ] **REL-009:** Roll out first to synthetic/internal data, then a controlled
  pilot with a verified backup, then broader installations.
- [ ] **REL-010:** Monitor migration failures, integrity warnings, startup issues,
  and module-specific transaction errors before expanding rollout.

### Exit gate

- Every released profile is built from the same tagged core commit.
- Existing retail data upgrades without loss.
- Offline startup, LAN behavior, licensing, backups, and packaging still work.
- Recovery steps have been exercised rather than only documented.

---

## Cross-cutting backlog

These items are important but should be scheduled separately so they do not make
the initial modularization unreviewable:

- [ ] **X-001:** Plan and execute fixed-precision currency migration.
- [ ] **X-002:** Plan and execute deliberate quantity precision improvements.
- [ ] **X-003:** Replace JSON unit conversions with relational definitions if the
  module requirements exceed the current structure.
- [ ] **X-004:** Introduce a durable stock-movement ledger if Phase 3 cannot
  provide sufficient auditability through the current batch/adjustment models.
- [ ] **X-005:** Add a permanent business audit trail for sensitive changes.
- [ ] **X-006:** Add granular permissions and manager approvals.
- [ ] **X-007:** Define supported module API/version compatibility rules if
  modules are ever distributed independently.

## Standard verification gate for every implementation phase

Run the focused tests for the changed behavior first, followed by the relevant
checks below:

```bash
git status --short
git diff --check
python3 -m compileall -q backend/app backend/run_server.py
cd frontend && npm run lint
cd frontend && npm run build
```

Additionally:

- Run migrations twice against a disposable old-schema database.
- Compare row counts and important business totals before and after migrations.
- Test transaction validation failure and database rollback paths.
- Run `cargo check` when Tauri code or configuration changes.
- Run a production Tauri build when sidecars, packaging, resources, migration
  discovery, or startup behavior changes.
- Inspect the final diff for secrets, local data, generated artifacts, and
  unrelated changes.

## Completion log

Add one row whenever a task or phase is completed or blocked.

| Date | Task/phase | Status | Summary | Verification / evidence | Follow-up |
| --- | --- | --- | --- | --- | --- |
| 2026-09-24 | Planning | Complete | Created modular architecture implementation tracker | Documentation review and `git diff --check` | Begin Phase 0 only after architecture decisions are confirmed |

## Open questions

Resolve these during Phase 0 rather than making assumptions inside vertical
implementations:

1. Should one installation enable multiple vertical modules, or exactly one
   primary business profile?
2. Should all profiles ship in one universal installer, or should CI produce
   separately branded installers from the same commit?
3. Does clothing mean ready-made garments, fabric by length, tailoring, or all
   three?
4. Does milk-shop mean counter retail, delivery subscriptions, producer
   collection/quality testing, or all three?
5. Which restaurant features are required initially: tables, kitchen display,
   modifiers, split bills, delivery, and/or takeaway?
6. How long should old workshop oil-tracking columns remain readable after their
   data is copied into vehicle records?
