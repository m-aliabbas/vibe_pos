# Phase 3 Verification Record

Date: 2026-09-26

Status: Awaiting owner manual verification

## Delivered

- Added `item_type` (`stock`, `service`, `prepared`, `non_stock`) to catalog
  products and typed backend/frontend contracts. Migration `0004_catalog_item_types`
  assigns existing products the compatible `stock` default.
- Extracted base-unit conversion, sale-line pricing, discounts, and sale totals
  into pure retail calculations. Currency line totals, subtotal, and total use
  decimal intermediates with two-place `ROUND_HALF_UP`; quantities remain
  fractional and unrounded.
- Added the retail inventory boundary for receive, issue, return, and adjustment.
  Variation stock and FIFO batch issue are centralized there.
- Added an injectable consumption-policy contract. Service/non-stock items do
  not mutate inventory; prepared-item consumption can be replaced by an owning
  module without changing retail sale orchestration.
- Added transport-independent retail sale commands and application service
  handling for line persistence, inventory issue, customer statistics, accounting,
  and commit. Sale create and update route through the same calculations.
- Routed purchase receiving/reversal, sale and purchase returns, and admin stock
  adjustments through the inventory boundary while retaining current HTTP
  contracts.
- Added application-neutral invoice/payment source references; domain workflows
  use `(application_id, transaction_type, transaction_id)` rather than forcing
  every transaction into the retail `sales` table.
- Removed import-time retail manifest loading from the package initializer so
  isolated application services do not import every HTTP endpoint.
- Documented staged currency/quantity precision in `task-tracker.md`.

## Automated evidence

- Backend suite: 62 tests discovered, 43 passed, 19 PostgreSQL/MySQL provider
  conformance tests skipped because server conformance services were not
  configured locally.
- Retail characterization: 16 tests passed, including typed catalog/payment/invoice
  contracts, cash/credit, fractional
  conversion, variations, service-item policy, prepared-item policy substitution,
  FIFO batch issue, purchase receipt/return, sale return, hold behavior, and
  failure-injection rollback across stock, customer balances, sale/purchase
  records, and accounting.
- Migration suite: 6 tests passed. Migration 0004 adds the `stock` default to a
  synthetic legacy database, preserves protected data, and is idempotent.
- Backend Python compilation: passed for the edited applications, endpoints,
  model/schema, migration, and tests.
- Pure calculations: price override, discount, tax, delivery, half-up rounding,
  and fractional unit conversion assertions passed.
- Frontend production build: passed, including TypeScript validation and all 27
  application routes.
- Scoped frontend ESLint: existing touched files report 18 errors and 15
  warnings at existing `any`, unused-symbol, and hook-dependency locations; the
  catalog type additions introduced no lint finding. The repository baseline
  already records widespread lint failures.

## Owner manual checklist

Use the Phase 3 checklist in `phases.md` to verify existing installations and
visible retail workflows against a disposable database before approving Phase 4.
No production database was modified during automated tests.
