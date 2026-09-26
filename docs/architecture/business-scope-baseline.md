# Business Scope Baseline

Status: Accepted for the Phase 0 migration baseline on 2026-09-25

This document defines the minimum workflow assumptions needed to establish
application boundaries. It is not the final product specification for each app.

## Retail

Primary transaction: retail sale.

Minimum preserved workflows:

- Products, variants, units, fractional quantities, and stock batches.
- Purchases from vendors and FIFO batch creation.
- Cash, card/mobile/other, partial payment, and customer credit.
- Held sales/purchases without final posting.
- Sale, direct, and vendor returns.
- Customer/vendor ledgers and balanced journals.
- Receipts/invoices, reports, backups, LAN use, and offline startup.

## Clothing retail profile

Primary transaction: retail sale unless tailoring becomes part of the approved
scope.

Initial scope:

- Size/color/material variations.
- Pieces, metres, yards, rolls, and packs with explicit conversions.
- Fractional sales and returns that reconcile to base stock.

Possible later clothing-owned scope:

- Roll/cut traceability.
- Customer measurements.
- Tailoring orders and production states.

## Milk-shop retail profile/application

Primary transaction for the initial profile: counter retail sale.

Initial scope:

- Litres and fractional quantities.
- Pack/container unit conversions.
- Cash and customer-credit sales.

Features that trigger an app-owned workflow:

- Recurring delivery subscriptions and route completion.
- Producer collection, fat/SNF quality readings, and rate calculation.
- Production/conversion, spoilage, or returnable-container tracking.

## Auto workshop application

Primary transaction: work order/job card, not a retail sale.

Minimum proposed workflow:

1. Register a customer and one or more vehicles.
2. Open an estimate/job card with complaint, mileage, and assigned technician.
3. Add stock-controlled parts and non-stock labour/services.
4. Move the work order through approved operational states.
5. Finalize exactly once into invoice, payment/customer balance, stock issues,
   and balanced accounting.
6. Record service history and next-service/oil reminders.

Existing customer mileage/oil data must be copied and verified through an
additive compatibility migration or explicit transfer, depending on the final
application boundary.

## Restaurant application

Primary transaction: restaurant order, not a retail sale.

Minimum proposed workflow:

1. Define ingredients, menu items, recipes, and unit conversions.
2. Open a dine-in/table, takeaway, or delivery order as approved in discovery.
3. Send order items through explicit kitchen preparation states.
4. Apply modifiers and recipe-version snapshots.
5. Finalize exactly once into invoice/payment, ingredient consumption, customer
   balance where applicable, and balanced accounting.
6. Handle cancellation, wastage, return/refund, and reopened-order behavior
   without double stock or journal effects.

## Rent-a-car reference application

Primary transaction: reservation/rental contract/vehicle return.

It is classified as an independent future application for architecture purposes.
No rent-a-car implementation is included until the owner explicitly adds it to
the delivery roadmap.

## Approved boundary decisions

- Workshop and restaurant remain independent applications.
- Clothing and counter-only milk retail begin as retail profiles; workflows
  with a different primary transaction remain app-owned.
- Rent-a-car remains an architecture reference until separately added to the
  delivery roadmap.
- Detailed first-release feature selection remains part of each application's
  discovery phase and does not change these approved boundaries.
