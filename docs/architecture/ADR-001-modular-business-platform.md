# ADR-001: Modular Business Platform

- Status: Accepted — Phase 0 owner approval recorded 2026-09-25
- Date: 2026-09-25
- Branch: `feature/reuseable-packages`

## Context

VibePOS is a working offline-first desktop retail application built with Next.js,
FastAPI, SQLAlchemy, SQLite, and Tauri. The product must grow into a family that
can serve retail, clothing, milk-shop, auto-workshop, and restaurant businesses
without duplicating fixes or placing every workflow into one generic POS model.

The current application already contains reusable retail capabilities such as
units, fractional quantities, variations, batches, customer/vendor balances,
returns, and double-entry journals. It also contains workshop-specific mileage
fields directly on `customers`, demonstrating the coupling this architecture is
intended to prevent.

## Decision

Use one engineering repository with a modular business platform and independent
business domains.

1. Share stable capabilities, not universal business transactions.
2. Preserve the existing VibePOS retail application and migrate it incrementally.
3. Do not rewrite the existing backend in Rust/SQLx as part of modularization.
4. Use independent application entry points, installers, data directories, and
   migration histories when a product has a different primary transaction.
5. Permit profiles inside one application when the transaction workflow is
   genuinely compatible and differences are configuration/capabilities.
6. Version shared modules and test every consuming application before release.
7. Keep each independent desktop application's local database isolated.
8. Keep SQLite as the default offline database. Support PostgreSQL and MySQL
   through a tested SQLAlchemy provider layer with no silent fallback.
9. Bundle the supported Tier 1 database drivers in the standard backend sidecar
   so switching providers does not require rebuilding the application. Revisit
   provider-specific packages only if measured installer size or native-driver
   constraints justify them.

## Initial product classification

This classification was approved for the incremental migration baseline.

| Product | Proposed boundary | Reason |
| --- | --- | --- |
| Retail | Existing primary application | Current supported transaction is retail sale/purchase/return |
| Clothing retail | Retail profile initially | Variations and fractional units cover ready-made and fabric counter sales |
| Milk counter retail | Retail profile initially | Litre/pack sales fit retail units and fractional quantities |
| Auto workshop | Independent application consuming platform capabilities | Job card/work order is the primary transaction; parts and labour are components |
| Restaurant | Independent application consuming platform capabilities | Restaurant order/table/kitchen lifecycle differs from retail checkout |
| Rent-a-car | Future independent application; currently out of delivery scope | Booking/rental/inspection/return is a separate transaction model |
| Pharmacy | Future independent application/profile decision; out of scope | Dispensing and compliance requirements need separate discovery |

If clothing adds tailoring orders, or milk adds subscriptions, collection, or
production as its primary workflow, those parts should become app-owned modules
or independent applications rather than conditionals in retail sales.

## Dependency rules

```text
Application shell/UI
        ↓
Application commands and domain rules
        ↓
Shared capability interfaces
        ↓
SQLAlchemy repositories/adapters, printing, files, external services
```

- Platform code must not import a business application's domain.
- One business application must not import another application's domain.
- Domain/application services must not depend on React pages, FastAPI request
  objects, Tauri commands, or a concrete database driver.
- HTTP endpoints validate and authorize requests, then call application commands.
- React screens call typed API/application operations and never execute SQL.
- SQL dialect-specific behavior belongs in database providers or migrations.
- Shared interfaces must be extracted from proven common behavior, not guessed
  merely because two domains use similar names.

## Share-versus-own matrix

| Capability/concept | Platform/shared | Business-owned |
| --- | --- | --- |
| Authentication and sessions | Identity primitives and token policy | App-specific login presentation/entitlements |
| Users, roles, permissions | Permission engine and audit hooks | App-specific permission catalogue |
| Customer | Common identity/contact contract | Retail profile, vehicles, delivery preferences, rental verification |
| Database | Provider factory, sessions, migration protocol, health checks | App schema/migrations and data directory |
| Payments | Payment methods, posting interface, allocation primitives | When/why a domain requests or refunds payment |
| Invoices | Numbering/rendering/export interfaces | Source transaction and domain-specific sections |
| Accounting | Journal primitives and balancing rules | Domain posting policies and account mapping |
| Printing/reporting | Rendering/export primitives | App documents, operational reports, metrics |
| Audit | Append-only event contract and viewer primitives | Events and safe domain-specific details |
| Inventory | Reusable stock/unit/batch capabilities where applicable | Recipe usage, workshop parts, milk production, clothing cuts |
| Retail sale | No | Retail application |
| Workshop work order | No | Workshop application |
| Restaurant order | No | Restaurant application |
| Rental booking/contract | No | Rent-a-car application |

## Customer extension pattern

The common customer record contains stable identity/contact fields. Typed
business profile tables contain fields that drive validation, indexing,
permissions, or reporting. Examples include workshop vehicles and rental driving
licence data. The frontend composes a common customer section with an app-owned
profile section.

Configurable custom fields may support informational data, but critical business
rules must not rely on untyped JSON.

Existing oil/mileage columns will remain readable during a compatibility window.
A later additive migration will copy them to workshop vehicle/reminder tables and
verify the copy before any legacy-field removal is considered.

## Data and upgrade safety

- Existing installations default to retail and keep their current database.
- New tables/columns are additive first; destructive cleanup is a later,
  separately approved operation.
- Every schema change is ordered, idempotent, backed up, and tested twice against
  a disposable old-schema database.
- Business transactions commit stock, balances, payments, and accounting
  atomically.
- App databases, backups, uploads, licences, and migration histories remain
  isolated for independently installed applications.
- Selecting another database provider changes connectivity only. Moving existing
  data requires an explicit verified transfer workflow.

## Database provider decision

SQLAlchemy remains the current ORM and transaction layer. A provider registry
will encapsulate SQLite, PostgreSQL, and MySQL engine settings, health checks,
dialect features, migration behavior, and backup/restore behavior. Future
providers must pass the same conformance suite before being declared supported.

An unavailable configured PostgreSQL/MySQL database must produce an actionable,
credential-redacted startup error. It must not fall back to a new SQLite database.

## Release flow

```text
Fix versioned shared capability
        ↓
Run shared and per-application regression suites
        ↓
Build every affected application target
        ↓
Release each application on its own version/update channel
```

A shared-code fix is available to all products, but it is not assumed safe until
their tests and builds pass.

## Consequences

Benefits:

- Core fixes have one implementation.
- Products remain understandable to users and developers.
- Domain schemas and workflows do not pollute each other.
- Applications can evolve and release independently.
- Existing retail data and behavior can be protected incrementally.

Costs:

- Shared packages require compatibility/version discipline.
- Every core change requires a consumer test matrix.
- Independent apps require separate packaging, migration, and release validation.
- Database portability requires dialect-aware migrations, queries, and backups;
  SQLAlchemy alone does not make them automatically portable.

## Phase 0 approval questions

1. Approve or amend the proposed app/profile classifications.
2. Confirm whether auto workshop should be an independent app as recommended.
3. Confirm whether rent-a-car is only an architecture reference or should enter
   the delivery roadmap.
4. Confirm the first milk-shop scope: counter retail, subscriptions/delivery,
   producer collection/quality, or a combination.
5. Confirm the first restaurant scope: tables, kitchen display, modifiers, split
   bills, takeaway, and/or delivery.
