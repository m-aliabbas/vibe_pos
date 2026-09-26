# VibePOS Modular Business Platform Implementation Tracker

## Purpose

This document is the execution tracker for evolving VibePOS into a modular
business platform that supports retail, auto workshop, clothing, milk-shop, and
restaurant products from one shared engineering codebase.

The architecture work must preserve the current retail behavior and all existing
customer data. This tracker complements `FUTURE_PLAN.md`; it does not replace the
general product roadmap.

## Target outcome

- One repository and one shared, versioned business platform.
- One default `retail` profile for every existing installation.
- Reusable horizontal capabilities such as fractional quantities, units,
  variations, batches, expiry, credit, and stock audit.
- Independent business applications or profiles where workflows genuinely
  differ, while presenting each product independently to its users.
- Separate application entry points, installers, runtime data, and migration
  histories for business domains that are classified as independent apps.
- Core fixes reach every consuming product through versioned shared modules,
  regression tests, rebuilds, and application releases.
- No long-lived per-industry Git branches.

## Platform boundary principles

The implementation must follow these principles:

- Share stable infrastructure and capabilities, not one universal business
  workflow.
- Retail sales, workshop job cards, restaurant orders, and rental bookings are
  different transactions and may use independent domain models.
- Shared candidates include authentication, permissions, common customer
  identity, settings, database/migration infrastructure, payments, invoice
  rendering, printing, reporting primitives, and audit logging.
- Each business application owns its domain rules, workflows, forms, tables,
  reports, and application services.
- No business application may import another business application's domain
  module. Applications depend only on explicitly shared platform packages.
- A shared concept does not require one shared database table. For example, a
  restaurant order and retail sale may remain separate while both use shared
  payment or invoice capabilities.
- Each independently installed application owns its SQLite database. Installed
  applications must never depend on a shared local database file.
- Existing VibePOS will be migrated incrementally. Establishing the platform is
  not authorization to rewrite the working FastAPI backend in Rust or replace
  Next.js/Tauri.
- Storage interfaces may allow a future PostgreSQL/cloud implementation, but
  SQLite remains the default offline desktop source of truth. PostgreSQL and
  MySQL are supported through an explicit database-provider layer, not scattered
  dialect conditionals.

## Database portability rule

VibePOS must make database selection configuration-driven while acknowledging
that connecting to a database and moving existing data are different operations.

- Tier 1 providers: SQLite, PostgreSQL, and MySQL.
- Additional databases may be added through a provider adapter only after they
  pass the same conformance suite; "any database" is not assumed automatically.
- SQLAlchemy remains the ORM and transaction boundary for the current backend.
- Application/domain services must not import `sqlite3`, PostgreSQL drivers, or
  MySQL drivers directly.
- Dialect-specific engine options, health checks, SQL functions, migrations,
  backup/restore, and operational capabilities belong to database adapters.
- SQLite stays zero-configuration and offline-first. Selecting a server database
  must never silently fall back to a new SQLite database, because that could
  split business data.
- Changing a connection target does not automatically transfer data. A separate,
  verified export/import or provider-migration workflow is required to move an
  existing installation.
- Database URLs and credentials are backend secrets. They must not be returned
  to the frontend, written to logs, or committed.

## Shared customer rule

Customer identity is shared; business-specific customer data is extended rather
than added as dozens of nullable columns to the core customer table.

- Common identity: name, phone, email, address, status, and common preferences.
- Business profiles: workshop vehicles/service details, retail loyalty/pricing,
  restaurant delivery preferences, or rental verification details.
- Business fields used for validation, indexing, or reports must be proper typed
  columns in business-owned extension tables.
- User-defined informational fields may use a configurable custom-field schema,
  but critical business rules must not depend on untyped JSON.
- Frontends compose a common customer form section with an application-owned
  profile section.

## Tracker rules

Status values:

- `[ ]` Not started
- `[~]` In progress
- `[?]` Implemented and awaiting manual verification
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
- [ ] Independently installed applications never read or write another
  application's local database.
- [ ] A shared-module update is regression-tested against every consuming
  application before any installer is released.
- [ ] The same database conformance suite passes for every supported provider.
- [ ] Provider switching never silently creates a second source of truth or
  loses existing application data.

## Architecture decisions

| ID | Decision | Status | Current direction |
| --- | --- | --- | --- |
| ADR-001 | Product-line structure | Accepted | Modular monolith in one repository |
| ADR-002 | Deployment shape | Accepted | Independent app entry points/installers for distinct domains; profiles may share an app when workflows are truly compatible |
| ADR-003 | App/profile classification | Accepted | Classify each vertical by transaction model before choosing app versus profile |
| ADR-004 | Existing-install default | Accepted | Automatically use `retail` |
| ADR-005 | Module loading | Accepted | Static registries compatible with PyInstaller |
| ADR-006 | Profile switching | Accepted | Controlled conversion after transactional data exists |
| ADR-007 | Business transaction integration | Accepted | Domain-owned transaction may produce/reference a shared invoice/payment record; do not force every domain into retail `sales` |
| ADR-008 | Database upgrades | Accepted | Ordered, idempotent migrations with schema history |
| ADR-009 | Customer model | Accepted | Common customer identity plus typed business-owned profile tables and composed forms |
| ADR-010 | Technology migration | Accepted | Keep FastAPI, Next.js, SQLite, and Tauri while extracting boundaries incrementally |
| ADR-011 | Local data ownership | Accepted | Each independent desktop app owns its database and migrations |
| ADR-012 | Shared-code delivery | Accepted | Version shared modules and rebuild/test each consuming application before release |
| ADR-013 | Database provider layer | Accepted | SQLAlchemy-based provider registry with SQLite, PostgreSQL, and MySQL as tested Tier 1 providers |
| ADR-014 | Database switching | Accepted | Configuration selects a connection; a separate verified workflow transfers existing data |
| ADR-015 | Offline behavior | Accepted | SQLite is the default; unavailable server databases fail visibly and never silently fall back |

## Phase overview

| Phase | Focus | Depends on | Status |
| --- | --- | --- | --- |
| 0 | Decisions, baseline, and characterization | None | Approved |
| 1 | Upgrade and migration safety | Phase 0 | Approved |
| 1B | Database connector and provider portability | Phase 1 | Approved |
| 2 | Platform capabilities, app manifests, and profiles | Phase 1B | Approved |
| 3 | Shared capability and business-transaction boundaries | Phase 2 | Awaiting manual verification |
| 4 | Frontend composition and application shells | Phases 2-3 | Not started |
| 5 | Auto workshop proof application/module | Phase 4 | Not started |
| 6 | Restaurant application/module | Phase 5 lessons applied | Not started |
| 7 | Clothing profile/module | Phase 4 | Not started |
| 8 | Milk-shop profile/module | Phase 4 | Not started |
| 9 | Packaging, licensing, release, and rollout | Required module phases | Not started |

---

## Phase 0 — Decisions, baseline, and characterization

**Goal:** Freeze the intended boundaries and capture current retail behavior
before refactoring it.

### Tasks

- [x] **ARCH-001:** Write the modular-monolith architecture decision record,
  including core domains, horizontal capabilities, vertical modules, and
  dependency rules.
- [x] **ARCH-002:** Define application boundaries and independent release units.
  Default to separate entry points/installers for domains with different primary
  transactions, while allowing closely related retail profiles to share an app.
- [x] **ARCH-003:** Classify retail, clothing, milk-shop, workshop, restaurant,
  and any future rent-a-car/pharmacy product as either an independent app, a
  profile, or a reusable capability, with written reasons.
- [x] **ARCH-004:** Define the minimum workflows for workshop, restaurant,
  clothing, and milk-shop before designing their schemas.
- [x] **ARCH-005:** Inventory the current API routes, database tables, frontend
  routes, navigation entries, and packaging imports by domain.
- [x] **ARCH-006:** Document core dependency rules. Vertical modules may depend
  on platform services; the platform and business apps must not import another
  business application's domain module.
- [x] **ARCH-007:** Produce a share-versus-own matrix for authentication,
  customers, payments, invoicing, accounting, reporting, inventory, orders, and
  application-specific workflows.
- [x] **ARCH-008:** Define the incremental extraction strategy that preserves the
  current FastAPI/Next.js/Tauri application. Explicitly reject a big-bang Rust or
  SQLx rewrite for the existing POS.
- [x] **ARCH-009:** Define shared package versioning and the regression/build
  matrix required before a core fix is released to consuming applications.
- [x] **ARCH-010:** Define per-application database paths, migration ownership,
  backup locations, application identifiers, and rules preventing cross-app
  database access.
- [x] **ARCH-011:** Define the common customer identity contract, business
  profile-table pattern, composed form pattern, and custom-field limits.
- [x] **ARCH-012:** Define the database-provider support contract and Tier 1
  versions/drivers for SQLite, PostgreSQL, and MySQL, including packaging and
  license implications.
- [x] **ARCH-013:** Decide whether packaged desktop builds bundle all Tier 1
  drivers or use provider-specific build extras, while keeping configuration
  behavior consistent.
- [x] **TEST-001:** Add a backend test foundation using a disposable SQLite
  database and supported license bypass/configuration for tests only.
- [x] **TEST-002:** Add retail characterization tests for cash sale, credit sale,
  partial payment, variation sale, fractional/unit-converted sale, and rollback.
- [x] **TEST-003:** Add characterization tests for purchase, return, held sale,
  held purchase, customer/vendor balances, stock batches, and journal balance.
- [x] **TEST-004:** Capture representative API contracts needed by the current
  frontend, without copying any real customer data.

### Exit gate

- Architecture decisions are accepted.
- Every proposed business product is classified as an app, profile, or reusable
  capability.
- Shared platform boundaries and per-app data ownership are documented.
- Current retail behavior is protected by repeatable tests.
- The test database cannot resolve to a production/customer data path.
- No production behavior or schema has changed in this phase.

---

## Phase 1 — Upgrade and migration safety

**Goal:** Establish a single safe database-upgrade mechanism before adding
profiles or module tables.

### Tasks

- [x] **MIG-001:** Add a schema migration history table with a unique migration
  identifier, applied timestamp, and application version.
- [x] **MIG-002:** Add an ordered migration registry/runner that executes before
  normal application startup and safely skips already-applied migrations.
- [x] **MIG-003:** Define the baseline for databases already upgraded by the
  existing standalone migration scripts and `ensure_schema_columns()`.
- [x] **MIG-004:** Move startup column additions into versioned, idempotent
  migrations while preserving compatibility with current installations.
- [x] **MIG-005:** Create an automatic timestamped pre-migration backup in the
  writable runtime data directory.
- [x] **MIG-006:** Validate the backup before applying a migration and fail closed
  if a recoverable backup cannot be produced.
- [x] **MIG-007:** Ensure each migration is transactional where SQLite supports it
  and has a documented recovery path where it does not.
- [x] **MIG-008:** Add migration tests against synthetic old-version databases,
  run every migration twice, and verify that existing rows survive.
- [x] **MIG-009:** Add post-migration integrity checks for important row counts,
  foreign keys, journal balance, customer/vendor balances, and stock totals.
- [x] **MIG-010:** Verify migration discovery and execution in development,
  PyInstaller backend builds, and Tauri startup paths on supported platforms.
- [x] **MIG-011:** Document operator-visible failure and recovery behavior; never
  silently open a partially migrated database.
- [x] **MIG-012:** Add tests proving each independent application resolves only
  its own writable data directory, database, backups, uploads, and migration
  history.
- [x] **MIG-013:** Select and document the migration engine's multi-dialect
  strategy. New migrations must declare supported providers and avoid raw
  SQLite-only DDL outside the SQLite adapter.

### Exit gate

- A copy of a representative old database upgrades successfully.
- Running the migration runner twice produces no additional changes.
- A deliberately failing migration demonstrates rollback/recovery behavior.
- Existing customer data and financial totals remain unchanged.

---

## Phase 1B — Database connector and provider portability

**Goal:** Make database selection a tested backend configuration concern while
keeping SQLite as the safe default and providing explicit PostgreSQL/MySQL
support.

### Tasks

- [x] **DB-001:** Add validated backend settings for application database
  provider and URL. Preserve the current SQLite data-directory default for every
  existing installation.
- [x] **DB-002:** Add a database-provider registry/factory responsible for driver
  selection, engine construction, pool settings, timeouts, TLS options, health
  checks, and dialect capability metadata.
- [x] **DB-003:** Implement and test the SQLite provider, including WAL,
  `busy_timeout`, thread settings, writable data-path validation, and offline
  startup.
- [x] **DB-004:** Implement and test the PostgreSQL provider using a supported
  SQLAlchemy driver, deliberate connection pooling, TLS configuration, and clear
  startup diagnostics.
- [x] **DB-005:** Implement and test the MySQL provider using a supported
  SQLAlchemy driver, Unicode settings, strict SQL mode expectations, time-zone
  handling, pooling, TLS, and clear startup diagnostics.
- [x] **DB-006:** Define the adapter/conformance interface for future providers.
  A provider is unsupported until it implements migrations, health checks,
  backup/restore or logical export, and passes all contract tests.
- [x] **DB-007:** Remove direct database-driver use from application runtime
  paths. Restrict `sqlite3`, PostgreSQL-driver, MySQL-driver, `PRAGMA`, and other
  dialect SQL to provider/migration adapters.
- [x] **DB-008:** Replace SQLite-specific reporting expressions such as
  `strftime` with portable query helpers or centralized dialect implementations;
  verify week/month boundaries and time zones produce equivalent reports.
- [x] **DB-009:** Audit ORM models and migrations for portability across Boolean,
  JSON, DateTime, Decimal/Numeric, auto-increment IDs, foreign keys, indexes,
  unique constraints, and identifier lengths.
- [x] **DB-010:** Add provider-neutral transaction tests for sale, purchase,
  return, stock adjustment, customer/vendor balances, and balanced journals.
- [x] **DB-011:** Run the conformance suite against disposable SQLite plus
  containerized PostgreSQL and MySQL databases in local/CI test workflows.
- [x] **DB-012:** Implement provider-aware schema creation/migration locking so
  two application processes cannot apply the same upgrade concurrently.
- [x] **DB-013:** Add provider-aware backup and restore adapters. SQLite may use a
  database/file-safe backup; PostgreSQL/MySQL require consistent logical/native
  backup strategies with restore verification.
- [x] **DB-014:** Add a provider-to-provider data transfer tool using a canonical
  logical format or controlled row-copy process with dependency ordering,
  identity/sequence repair, and transactional import where supported.
- [x] **DB-015:** Before transfer, create and verify a source backup. After
  transfer, compare table counts, key business totals, foreign keys, stock,
  customer/vendor balances, and journal balance.
- [x] **DB-016:** Prevent live provider switching while application processes are
  using the database. Require maintenance mode, exclusive migration lock, and an
  explicit operator confirmation identifying source and target.
- [x] **DB-017:** Never silently fall back to SQLite when a configured server
  database is unavailable. Show an actionable startup error without exposing
  credentials.
- [x] **DB-018:** Ensure database credentials remain backend-only, are redacted in
  errors/logs, and are supplied through secure deployment configuration rather
  than frontend settings or source control.
- [x] **DB-019:** Include supported database drivers and migration resources in
  the appropriate PyInstaller/Tauri builds and test packaged connectivity.
- [x] **DB-020:** Document configuration examples, supported versions, connection
  prerequisites, backup differences, migration steps, rollback limits, and
  offline implications for each Tier 1 provider.

### Exit gate

- Existing installations still open their original SQLite database without
  configuration changes.
- A clean installation and the full database conformance suite pass on SQLite,
  PostgreSQL, and MySQL.
- The application fails clearly, without fallback, when the selected provider is
  unavailable or misconfigured.
- A synthetic SQLite dataset transfers to PostgreSQL and MySQL with verified row
  counts and matching business totals; the source remains recoverable.
- No database credentials appear in frontend payloads, logs, source control, or
  packaged static assets.

---

## Phase 2 — Platform capabilities, app manifests, and profiles

**Goal:** Introduce backend-authoritative application manifests, compatible
profiles, and shared capability contracts without changing the current retail
experience.

### Tasks

- [x] **MOD-001:** Define stable identifiers for applications, profiles, modules,
  shared packages, and reusable capabilities.
- [x] **MOD-002:** Add a persistent business-profile configuration with a safe
  migration that assigns `retail` to every existing database.
- [x] **MOD-003:** Add static, per-application backend manifests declaring shared
  capabilities, app-owned routers, model imports, migrations, and metadata.
- [x] **MOD-004:** Ensure all registered models are imported for SQLAlchemy
  metadata discovery and included in packaged builds.
- [x] **MOD-005:** Add a typed `GET /api/v1/app-config` contract returning the app
  identity, profile, enabled capabilities, branding, shared-package versions,
  and application/schema versions.
- [x] **MOD-006:** Add backend capability dependencies/guards and apply them to
  module-only endpoints.
- [x] **MOD-007:** Define profile-change rules. Prevent unsafe direct switching
  after transactional data exists and provide a future conversion seam.
- [x] **MOD-008:** Integrate profile/module entitlements with licensing while
  preserving offline-safe startup and existing licenses.
- [x] **MOD-009:** Add tests proving disabled module endpoints cannot be accessed
  directly and existing retail endpoints remain available.
- [x] **MOD-010:** Document the source of truth: backend configuration and license
  determine capability access; frontend configuration controls presentation only.
- [x] **MOD-011:** Define shared service interfaces for customer identity,
  payments, invoice rendering, printing, reporting, permissions, and audit
  logging without forcing app-specific tables into one universal schema.
- [x] **MOD-012:** Add typed business customer-profile tables only in the owning
  app/module; do not add their fields to the common customer table.
- [x] **MOD-013:** Define shared package compatibility/version metadata and fail
  startup/build clearly when an application requests an incompatible version.

### Exit gate

- An existing database automatically starts as `retail`.
- The current retail API contract and behavior remain unchanged.
- Capabilities are enforced by the backend.
- App configuration is available to the frontend through one typed endpoint.
- Independent app manifests cannot activate another app's domain routes or
  database migrations.

---

## Phase 3 — Shared capability and business-transaction boundaries

**Goal:** Create explicit extension points so vertical modules do not add large
conditional blocks to sales, purchases, returns, or accounting endpoints, while
avoiding a universal transaction model for unrelated businesses.

### Tasks

- [x] **CORE-001:** Define core catalog item types such as stock item, service,
  prepared item, and non-stock item without changing existing products by
  default.
- [x] **CORE-002:** Extract pure unit-conversion and sale-total calculations from
  HTTP endpoints and cover rounding, discounts, tax, and price overrides.
- [x] **CORE-003:** Introduce an inventory service for receiving, issuing,
  returning, and adjusting stock, including variations and FIFO batches.
- [x] **CORE-004:** Introduce an application-level retail sale service that validates,
  prices, persists, applies inventory, updates customer balances, posts
  accounting, and commits atomically.
- [x] **CORE-005:** Define an inventory-consumption policy for stock, service, and
  prepared items; restaurant recipe consumption will implement this seam later.
- [x] **CORE-006:** Refactor purchase and return workflows to use the same
  inventory boundary without changing their external contracts.
- [x] **CORE-007:** Preserve held-transaction behavior and prove that holds do not
  prematurely mutate final stock or journals.
- [x] **CORE-008:** Define how domain-owned transactions produce or reference
  shared invoice/payment records. Use a unique `sale_id` only for a workflow that
  is genuinely a retail sale; do not store workshop, restaurant, or rental state
  on the retail `sales` table.
- [x] **CORE-009:** Add failure-injection tests proving rollback across stock,
  balances, sale records, and accounting.
- [x] **CORE-010:** Decide and document the staged precision strategy for currency
  and quantities. Do not combine a full Float-to-Decimal migration with an
  unrelated module change.
- [x] **CORE-011:** Define application-layer commands for each domain workflow so
  React pages call business operations rather than SQL/repository details.
- [x] **CORE-012:** Place storage behind focused repository/service boundaries
  where it materially improves testability or future database replacement; do
  not create a generic repository abstraction with no domain value.
- [x] **CORE-013:** Separate shared invoice rendering/payment capabilities from
  retail sale orchestration so other apps can consume them without importing
  the retail sales domain.

### Phase 3 precision decision

- Currency calculations use `Decimal` intermediates and round each persisted
  sale-line amount and the resulting subtotal/total to two decimal places using
  `ROUND_HALF_UP`.
- Quantity conversion retains configured fractional precision and does not round
  converted stock quantities.
- Existing ORM storage remains `Float`; a repository-wide Float-to-Decimal
  migration is deferred to a separately tested phase.
- Sale-specific invoice and accounting orchestration remains retail-owned.
  Shared payment/invoice requests identify their source with an
  `(application_id, transaction_type, transaction_id)` reference rather than a
  universal retail `sale_id`.

### Exit gate

- Existing sales, purchases, and returns pass characterization tests.
- Core transaction endpoints orchestrate application services rather than owning
  all business logic.
- Stock and accounting remain atomic under induced failures.
- A new retail/prepared-item consumption policy can be added without editing the
  retail sale algorithm.
- A workshop job or restaurant order can use shared invoice/payment capabilities
  without pretending to be a retail sale.

---

## Phase 4 — Frontend composition and application shells

**Goal:** Make navigation and composition app/profile-aware, support independent
React/Tauri entry points when selected by Phase 0, and keep the existing retail
UI intact.

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
- [ ] **UI-010:** Compose customer forms from a shared common-information section
  and an app-owned profile section; do not make the common customer form aware
  of every business type.
- [ ] **UI-011:** Where Phase 0 selects independent products, create separate app
  shells/entry points with independent navigation, branding, Tauri identifiers,
  data directories, and build targets.
- [ ] **UI-012:** Add import-boundary checks so one business application cannot
  import another application's frontend features.

### Exit gate

- Retail users see no unintended navigation or workflow change.
- Module routes are hidden and blocked when disabled.
- The core sales and inventory pages accept controlled module contributions.
- Independent application shells share approved UI packages but remain separate
  from the user's perspective.
- Frontend lint and production build pass.

---

## Phase 5 — Auto workshop proof application/module

**Goal:** Validate the platform architecture using the workshop behavior that has
already leaked into the shared customer model. Implement it within the app or
profile boundary selected and documented in Phase 0.

### Tasks

- [ ] **WS-001:** Confirm workshop workflows: multiple vehicles per customer,
  job cards, technicians, parts, labour, mileage, reminders, estimates, and
  invoicing.
- [ ] **WS-002:** Add workshop-owned models for vehicles, service reminders, work
  orders/job cards, and work-order lines using additive migrations in the
  workshop application's/schema's migration history.
- [ ] **WS-003:** Copy existing customer oil-change data into vehicle/reminder
  records without deleting the legacy customer columns.
- [ ] **WS-004:** Add a migration verification report for copied oil-change data,
  including unmappable or incomplete records.
- [ ] **WS-005:** Add workshop APIs, schemas, permissions, and frontend types.
- [ ] **WS-006:** Add workshop navigation and screens only when the workshop
  capability is enabled.
- [ ] **WS-007:** Support parts as stock items and labour/services as non-stock
  sale lines.
- [ ] **WS-008:** Finalize a work order into exactly one workshop invoice/payment
  outcome and balanced journal transaction through shared capabilities; prevent
  duplicate invoicing without forcing job-card state into retail sales.
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

## Phase 6 — Restaurant application/module

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
- [ ] **REST-008:** Finalize restaurant orders through shared invoice, payment,
  and accounting capabilities while keeping restaurant order state in the
  restaurant domain; prevent duplicate finalization.
- [ ] **REST-009:** Add restaurant reports for ingredient usage, theoretical
  versus actual stock, wastage, menu profitability, tables, and order channels.
- [ ] **REST-010:** Test fractional ingredients, insufficient ingredients,
  modifiers, partial/split payment as scoped, cancellation, rollback, and
  receipt/kitchen printing.

### Exit gate

- Selling a menu item consumes the correct ingredients once.
- Order state transitions cannot create duplicate stock or accounting effects.
- Retail and workshop profiles do not expose restaurant APIs or screens.
- Restaurant orders use shared customer, invoice, payment, and accounting
  capabilities without importing the retail sales workflow.

---

## Phase 7 — Clothing profile/module

**Goal:** Reuse existing variation and fractional-unit capabilities, adding a
module or independent application only for workflows that cannot be expressed
by an existing retail profile and shared capabilities.

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
assuming that all milk shops operate the same way. Use a retail profile for
simple counter sales and an independent app boundary if subscriptions,
collection, or production becomes the primary transaction model.

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

**Goal:** Ship independent products and compatible profiles safely from the same
codebase and prove upgrades on real packaging paths without exposing or sharing
customer data between installed applications.

### Tasks

- [ ] **REL-001:** Ensure static module imports, models, migrations, routers, and
  assets are included in Windows and macOS packaged builds.
- [ ] **REL-002:** Confirm application/module licensing and cached offline
  entitlements do not prevent an already licensed retail installation from
  starting.
- [ ] **REL-003:** Build independent installers from explicit application targets
  with distinct Tauri identifiers, branding, data directories, and app versions;
  profile variants of the same app may use runtime configuration.
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
- [ ] **REL-011:** Version shared packages and run a CI regression/build matrix
  for every consuming application before publishing a shared-core fix.
- [ ] **REL-012:** Prove that simultaneously installed applications use separate
  databases, backups, uploads, license/application identity, and update channels.
- [ ] **REL-013:** Maintain independent application release notes and versions
  while recording the shared-platform version consumed by each release.
- [ ] **REL-014:** Publish and enforce a supported database version/driver matrix;
  run provider conformance tests before releasing backend or migration changes.
- [ ] **REL-015:** Smoke-test packaged applications with the default SQLite
  database and external PostgreSQL/MySQL connections, including unavailable
  server, TLS failure, credential redaction, backup, and migration behavior.

### Exit gate

- Every released application records the exact shared-platform version/commit it
  consumes.
- Existing retail data upgrades without loss.
- Offline startup, LAN behavior, licensing, backups, and packaging still work.
- Independent applications can coexist without reading, overwriting, backing up,
  or migrating each other's data.
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
- [ ] **X-008:** Evaluate JavaScript workspace/package extraction only after
  internal boundaries stabilize; do not reorganize the repository merely to
  imitate a target directory diagram.
- [ ] **X-009:** Evaluate a future Rust/SQLx backend only for a truly new product
  with measured benefits. Do not make it a prerequisite for modularizing the
  existing POS.
- [ ] **X-010:** Add cloud synchronization or a hosted API only when a concrete
  multi-user deployment requires it. Direct PostgreSQL/MySQL connectivity does
  not by itself solve offline sync, conflict resolution, or tenancy.

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
- Run the database conformance suite for SQLite and the supported PostgreSQL and
  MySQL versions whenever ORM queries, migrations, reporting SQL, engine setup,
  backup/restore, or transaction handling changes.
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
| 2026-09-25 | Architecture guidance review | Complete | Added independent-app, shared-platform, customer-extension, data-isolation, and versioned-core principles | Compared attached guidance with the current FastAPI/Next.js/Tauri repository | Resolve app-versus-profile classifications in Phase 0 |
| 2026-09-25 | Database portability planning | Complete | Added a provider layer and dedicated SQLite/PostgreSQL/MySQL implementation phase | Audited current engine configuration, SQLite-only startup/migrations, and report SQL | Implement only after migration safety foundation |
| 2026-09-25 | Phase 0 | Awaiting manual verification | Added architecture ADR, business scope, current-system inventory, phase gates, disposable database tests, and API contract snapshot | 9 backend tests pass; Python compile passes; frontend build passes; `git diff --check` passes; existing frontend lint baseline has 131 errors/80 warnings | Owner reviews `phases.md`; do not begin Phase 1 before explicit approval |
| 2026-09-25 | Phase 0 approval | Complete | Owner approved the architecture and retail baseline for migration | Explicit owner approval in the Codex task | Begin Phase 1 only |
| 2026-09-25 | Phase 1 | Awaiting manual verification | Added ordered migrations, validated pre-upgrade backups, fail-closed recovery, integrity checks, and isolated disposable migration tests | 13 backend tests pass; Python compile passes; frontend build passes; temporary PyInstaller build includes migration modules; `git diff --check` passes | Owner completes the Phase 1 checklist in `phases.md`; do not begin Phase 1B before approval |
| 2026-09-25 | Phase 1 approval | Complete | Owner completed the migration backup, idempotence, recovery, and totals checklist | Explicit owner approval in the Codex task | Begin Phase 1B only |
| 2026-09-25 | Phase 1B | Awaiting manual verification | Added explicit SQLite/PostgreSQL/MySQL providers, portable reporting, migration locks, native backup adapters, guarded verified transfer, model portability fixes, packaging drivers, and CI conformance | SQLite suite passes; 11 PostgreSQL 16 and 11 MySQL 8.4 conformance tests pass; direct startup passes on all providers; provider-aware PyInstaller build passes | Owner completes the Phase 1B checklist in `phases.md`; do not begin Phase 2 before approval |
| 2026-09-26 | Phase 1B approval | Complete | Owner completed the database provider, backup/restore, transfer, and packaged connectivity checklist | Explicit owner approval in the Codex task | Begin Phase 2 only |
| 2026-09-26 | Phase 2 | In progress | Started backend-authoritative app manifests, business profiles, and capability enforcement | Work in progress | Complete the Phase 2 automated gate before manual verification |
| 2026-09-26 | Phase 2 | Awaiting manual verification | Added the retail manifest, persistent retail profile, typed app-config contract, capability/license enforcement, profile-switch safety, shared service contracts, and compatibility validation | 34 backend tests pass; Python compile passes; frontend build passes; temporary frozen backend starts and serves app-config; lint remains at the recorded 131-error/80-warning baseline | Owner completes the Phase 2 checklist in `phases.md`; do not begin Phase 3 before approval |
| 2026-09-26 | Phase 2 approval | Complete | Owner confirmed completion of the Phase 2 manual checklist and approved the phase | Explicit owner confirmation in the current task | Begin Phase 3 only |
| 2026-09-26 | Phase 3 | Awaiting manual verification | Added typed catalog items, pure rounded sale calculations, inventory consumption policies, retail sale commands, shared inventory mutation, and application-neutral invoice/payment references | Backend suite: 43 passed, 19 provider-service tests skipped; migration and Python compilation pass; frontend build passes; see Phase 3 verification record | Owner completes `phases.md` Phase 3 checklist before Phase 4 |
| 2026-09-26 | Phase 2 approval | Complete | Owner confirmed completion of the Phase 2 manual checklist and approved the phase | Explicit owner confirmation in the current task | Begin Phase 3 only |
| 2026-09-26 | Phase 3 | In progress | Started shared capability and retail transaction-boundary extraction | Work in progress | Complete the Phase 3 automated gate before manual verification |

## Open questions

Resolve these during Phase 0 rather than making assumptions inside vertical
implementations:

1. Which products are independent applications, which are profiles of the retail
   app, and which are only reusable capabilities? The starting hypothesis is:
   clothing retail is a retail profile; simple milk retail is a retail profile;
   restaurant and rent-a-car are independent apps; workshop requires a deliberate
   decision based on the desired job-card workflow.
2. Which capabilities must be shared in the first platform release? Avoid
   extracting code merely because two applications currently use similar words.
3. Does clothing mean ready-made garments, fabric by length, tailoring, or all
   three?
4. Does milk-shop mean counter retail, delivery subscriptions, producer
   collection/quality testing, or all three?
5. Which restaurant features are required initially: tables, kitchen display,
   modifiers, split bills, delivery, and/or takeaway?
6. How long should old workshop oil-tracking columns remain readable after their
   data is copied into vehicle records?
7. Is rent-a-car part of this implementation roadmap now, or was the attachment
   supplied only as an architectural reference?
8. Should independent products share one repository release cadence or maintain
   separate application versions while pinning a shared-platform version?
9. Which PostgreSQL and MySQL server/driver versions should be supported in the
   first release, and must every desktop installer bundle both drivers?
10. Will PostgreSQL/MySQL normally run on the shop's LAN or on a remote server?
    Remote hosting changes TLS, availability, latency, and offline expectations.
