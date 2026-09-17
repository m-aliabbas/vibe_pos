# VibePOS Future Development Plan

## Purpose

This document describes the recommended future direction for VibePOS. It is a
product roadmap, not a fixed delivery schedule. Priorities can be adjusted for a
specific customer or business type, but operational control and data integrity
should come before growth-oriented features.

VibePOS already provides a strong base: sales and purchases, held transactions,
returns, products and variations, multiple selling units, customer and vendor
credit, stock auditing, double-entry accounting, reporting, backups, user roles,
WhatsApp notifications, and vehicle oil-change tracking.

The next releases should focus on making that base easier to control, audit,
scale, and operate safely every day.

## Product Principles

Every future feature should follow these rules:

- A business transaction must update stock, balances, payments, and accounting
  together or update none of them.
- Completed transactions should be reversed with traceable entries, not silently
  edited or deleted.
- Financial values and fractional quantities must retain deliberate precision.
- Permissions must be enforced by the backend, not only hidden in the interface.
- Database changes must include an idempotent migration for existing SQLite
  installations.
- The desktop application must remain usable offline unless a feature explicitly
  requires an online service.
- Local databases, credentials, backups, exports, and customer information must
  never be bundled into source control.
- Reports must be derived from the same source of truth as operational screens.

## Priority Summary

| Phase | Focus | Main outcome |
| --- | --- | --- |
| 1 | Daily control and financial accuracy | Cash, expenses, corrections, and sensitive actions become fully accountable |
| 2 | Inventory and purchasing efficiency | Reordering, receiving, labels, and stock traceability require less manual work |
| 3 | Customer and order growth | Better credit collection, promotions, loyalty, quotations, and fulfillment |
| 4 | Scale and resilience | Multi-location operation, stronger recovery, integrations, and advanced security |
| 5 | Industry extensions | Optional modules tailored to retail, grocery, automotive, restaurant, or services |

---

## Phase 1: Daily Control and Financial Accuracy

These items should be implemented first because they reduce cash leakage,
accounting gaps, accidental changes, and disputes between staff and management.

### 1. Cash Drawer and Cashier Shifts

**Why it matters:** Sales reports show how much was sold, but a store also needs
to prove how much cash should physically be in each drawer. A shift record makes
cash shortages, overages, withdrawals, and handovers visible.

**Recommended scope:**

- Open a shift with cashier, register, opening time, and starting cash float.
- Record cash paid in and paid out with a reason and responsible user.
- Calculate expected cash from opening float, cash sales, refunds, and movements.
- Close a shift with counted cash and a declared shortage or overage.
- Require a manager reason or approval for material variances.
- Produce printable X reports during a shift and a final Z report at closure.
- Prevent or explicitly control simultaneous open shifts on one register.

**Definition of done:** Every cash transaction belongs to an open drawer session,
closing totals reconcile to recorded activity, and historical shifts cannot be
silently changed.

### 2. Complete Expense Management

**Why it matters:** VibePOS has expense-type accounting accounts and financial
report structures, but it does not yet maintain a detailed operational expense
register. Without it, profit and cash-flow reports can be incomplete.

**Recommended scope:**

- Create expense categories and payees.
- Record date, amount, payment method, reference, notes, and receipt attachment.
- Support cash, bank, and payable expenses.
- Support recurring expense templates without duplicating entries incorrectly.
- Allow approval, rejection, correction, and reversal workflows.
- Generate balanced journal entries automatically.
- Include expenses in profit-and-loss and cash-flow reports.

**Definition of done:** An approved expense changes the correct cash/bank or
payable balance, produces a balanced journal entry, appears in reports, and can
only be corrected through an auditable reversal.

### 3. Permanent Audit Trail

**Why it matters:** A POS must answer who changed a price, refunded an invoice,
adjusted stock, altered credit, or changed a setting. Transaction timestamps alone
are not a sufficient audit trail.

**Recommended scope:**

- Record actor, action, entity type, entity ID, time, and device/session context.
- Store safe before-and-after values for important changes.
- Cover login activity, sales, returns, payments, expenses, stock adjustments,
  prices, customer/vendor balances, users, permissions, and settings.
- Require reasons for sensitive actions.
- Provide searchable admin reports and CSV export.
- Make audit records append-only for ordinary application users.

**Definition of done:** Every sensitive business change can be traced to a user,
time, reason, and affected record without exposing credentials or secrets.

### 4. Granular Permissions and Manager Approval

**Why it matters:** A simple admin/cashier distinction becomes insufficient when
different staff members are trusted with different operations.

**Recommended scope:**

- Define permissions such as view cost, override price, apply large discount,
  refund, exchange, void, adjust stock, export data, manage users, and restore a
  backup.
- Allow reusable roles and optional per-user overrides.
- Add manager PIN approval for restricted actions at the point of use.
- Record both the acting employee and approving manager in the audit trail.
- Enforce every permission in backend endpoints.

**Definition of done:** A user cannot perform a restricted action through either
the interface or a direct API call, and approved overrides remain traceable.

### 5. Safe Void, Cancellation, and Exchange Workflow

**Why it matters:** Stores need to correct mistakes without damaging stock,
customer balances, cash totals, or accounting history.

**Recommended scope:**

- Distinguish cart cancellation, completed-sale void, refund, and exchange.
- Require a reason and, where configured, manager approval.
- Reverse stock, customer credit, payment, tax, discount, and journal effects.
- Allow exchanges to calculate an additional amount due or refund owed.
- Mark original and reversal records clearly on invoices and reports.
- Disallow deletion or in-place rewriting of finalized financial transactions.

**Definition of done:** Each correction leaves stock and accounting accurate,
preserves the original transaction, and can be followed from either record.

### 6. Backup and Recovery Hardening

**Why it matters:** Automatic backup creation is useful only when backups are
valid, protected, retained appropriately, and easy to restore.

**Recommended scope:**

- Encrypt backups and support a user-selected external destination.
- Define daily, weekly, and monthly retention policies.
- Show last successful backup and backup-health warnings.
- Validate archive contents after creation.
- Provide restore preview, confirmation, and an automatic pre-restore backup.
- Periodically test restoration against a disposable database.
- Document recovery steps for both Windows and macOS packages.

**Definition of done:** A non-technical administrator can identify a healthy
backup and restore it safely without overwriting the only recoverable copy.

---

## Phase 2: Inventory and Purchasing Efficiency

### 7. Purchase-Order and Receiving Lifecycle

**Why it matters:** An order placed with a supplier is not the same as inventory
physically received. Separating the stages prevents premature stock increases and
supports delayed or partial deliveries.

**Recommended scope:**

- Draft, approved, ordered, partially received, received, cancelled, and closed
  purchase-order states.
- Partial receiving with accepted, damaged, rejected, and backordered quantities.
- Supplier invoice/reference matching.
- Purchase returns and supplier debit notes.
- Freight, tax, duty, and other landed-cost allocation.
- Attach purchase documents and receiving notes.

**Definition of done:** Stock increases only for received quantities, payables
reflect approved supplier obligations, and partial receipts remain visible.

### 8. Automatic Replenishment

**Why it matters:** Low-stock reports identify a problem, but suggested purchasing
helps staff act on it consistently.

**Recommended scope:**

- Reorder point, target stock, preferred supplier, pack size, and lead time.
- Suggested purchase quantities based on stock, open orders, and sales velocity.
- One-click creation of draft purchase orders grouped by supplier.
- Out-of-stock risk, slow-moving, dead-stock, and inventory-aging reports.
- Optional seasonal or manual demand adjustments.

**Definition of done:** Suggested quantities explain their calculation and never
double-count stock already on an open purchase order.

### 9. Barcode and Label Printing

**Why it matters:** Receiving and selling stock becomes faster and less error-prone
when every product and variation can be scanned.

**Recommended scope:**

- Generate or store barcodes for base products and variations.
- Print configurable label sheets and thermal-printer formats.
- Include product name, SKU, price, barcode, batch, or expiry where appropriate.
- Print labels directly from a purchase receipt or selected inventory rows.
- Improve scanner-first keyboard navigation on sales and receiving screens.
- Optionally support encoded-weight barcodes for grocery deployments.

**Definition of done:** A user can receive an item, print its label, scan it at
checkout, and resolve duplicate or unknown barcodes clearly.

### 10. Serial Number, Batch, Expiry, and Warranty Tracking

**Why it matters:** Some businesses must identify the exact unit or batch sold for
warranty, recall, expiry, or regulatory reasons.

**Recommended scope:**

- Optional tracking mode per product: none, batch, or unique serial number.
- Capture serial/IMEI numbers during receiving and sale.
- Track manufacture date, expiry date, batch status, and supplier.
- Warn about near-expiry stock and optionally block expired sales.
- Record warranty period and warranty claims against the sold item.
- Provide forward and backward traceability for recalls.

**Definition of done:** The system can identify where a tracked unit came from,
when it was sold, to whom it was sold, and whether it remains under warranty.

### 11. Advanced Pricing Controls

**Why it matters:** Growing retailers often need different prices without allowing
uncontrolled cashier overrides.

**Recommended scope:**

- Retail, wholesale, and customer-group price lists.
- Quantity breaks and scheduled price changes.
- Minimum selling price and below-cost warnings or blocking.
- Margin and markup calculator.
- Price-change history and label-reprint queue.
- Location-specific pricing when multi-location support is enabled.

**Definition of done:** The price selected at checkout is deterministic, explains
which rule applied, and respects approval requirements.

---

## Phase 3: Customer and Order Growth

### 12. Accounts Receivable and Payable Aging

**Why it matters:** A total customer or vendor balance does not show which invoices
are overdue or where incoming payments should be allocated.

**Recommended scope:**

- Invoice-level payment allocation.
- Current, 30-day, 60-day, 90-day, and older aging buckets.
- Customer and vendor statements with opening and closing balances.
- Due dates, promised-payment dates, and collection notes.
- Configurable WhatsApp reminders and overdue alerts.
- Credit-limit override with manager approval.

**Definition of done:** The outstanding total agrees with invoice allocations and
the general ledger, including advances, returns, and partial payments.

### 13. Loyalty, Gift Cards, and Promotions

**Why it matters:** These tools encourage repeat purchases and enable controlled
marketing without relying on manual discounts.

**Recommended scope:**

- Points earning, redemption, expiry, and manual adjustment history.
- Membership tiers and customer groups.
- Gift-card issuance, redemption, balance lookup, and cancellation.
- Coupon codes, bundles, buy-one-get-one, and product/category promotions.
- Promotion schedules, usage limits, stacking rules, and exclusions.
- Liability accounting for unredeemed gift cards and applicable loyalty balances.

**Definition of done:** Promotion selection is predictable, refunds reverse the
appropriate benefits, and stored-value liabilities reconcile to accounting.

### 14. Quotations, Sales Orders, Deposits, and Layaway

**Why it matters:** Not every customer transaction is completed immediately at the
counter. Quotations and orders allow the sale to progress without affecting stock
or revenue too early.

**Recommended scope:**

- Create, print, share, revise, expire, accept, and reject quotations.
- Convert quotations to sales orders and sales orders to invoices.
- Reserve stock according to configurable rules.
- Record deposits, installments, remaining balance, and due dates.
- Support cancellation and deposit-refund policies.
- Keep draft/ordered activity separate from recognized revenue.

**Definition of done:** Conversion preserves line items and pricing history while
stock, payments, customer balances, and accounting change only at the correct stage.

### 15. Delivery and Fulfillment

**Why it matters:** Delivery charges already exist on sales, but a complete
fulfillment workflow would show whether an order is ready, dispatched, delivered,
or still awaiting collection.

**Recommended scope:**

- Delivery or pickup method, address, contact, date, and time slot.
- Pending, preparing, ready, dispatched, delivered, failed, and cancelled states.
- Packing slips and delivery notes.
- Driver assignment and proof-of-delivery reference.
- Cash-on-delivery collection and reconciliation.
- Delivery charges based on area or configured service.

**Definition of done:** Staff can see every unfulfilled order, and delivery status
does not incorrectly recognize payment or move stock twice.

### 16. Customer Communication Center

**Why it matters:** VibePOS already uses WhatsApp. Centralizing communication would
make receipts, statements, reminders, and service notices consistent and traceable.

**Recommended scope:**

- Reusable templates for receipts, statements, overdue reminders, promotions, and
  vehicle-service reminders.
- Customer consent and opt-out preferences.
- Message queue, retry handling, delivery status, and failure visibility.
- Communication history linked to the customer and originating transaction.
- Scheduled campaigns with role approval and audience preview.

**Definition of done:** Messages are permission-aware, auditable, retry safely, and
never block completion of the underlying sale or payment.

---

## Phase 4: Scale, Integration, and Resilience

### 17. Multi-Location and Warehouse Inventory

**Why it matters:** Multiple shops or storage locations need separate stock counts
and controlled movement while management still sees consolidated results.

**Recommended scope:**

- Store, warehouse, register, and location-specific user assignments.
- Stock, pricing, sales, purchases, expenses, and reports by location.
- Transfer request, approval, dispatch, in-transit, partial receipt, and completion.
- Damaged, missing, or rejected transfer quantities.
- Inter-location accounting rules where required.
- Consolidated company dashboard and location comparison.

**Definition of done:** Every unit is owned by exactly one location or documented
as in transit, and permissions limit users to their assigned locations.

### 18. Data Import, Export, and Integration API

**Why it matters:** Reliable interchange reduces manual entry and makes VibePOS
easier to adopt alongside accounting, e-commerce, payment, or reporting systems.

**Recommended scope:**

- Guided import for products, opening stock, customers, vendors, and balances.
- Preview, validation, duplicate detection, dry run, and downloadable error file.
- CSV/Excel/PDF exports with consistent filters and totals.
- Versioned integration API with scoped credentials and rate limits.
- Idempotency protection for external transaction creation.
- Webhooks or an outbox for reliable outbound synchronization.

**Definition of done:** Imports cannot partially corrupt business data, exports
reconcile with on-screen reports, and repeated API requests do not duplicate sales.

### 19. Security Improvements

**Why it matters:** As more locations and integrations are added, account and data
protection must grow with them.

**Recommended scope:**

- Configurable session timeout and quick screen lock.
- Short cashier PIN after a trusted device has been authenticated.
- Secure password reset and optional administrator multi-factor authentication.
- Active-session and trusted-device management.
- Secret rotation and secure integration credential storage.
- Security event logging without recording passwords, tokens, or sensitive keys.

**Definition of done:** Lost credentials or an unattended terminal can be revoked
or locked without compromising transaction history or offline-safe operation.

### 20. Tax and Compliance Configuration

**Why it matters:** Tax and invoice rules vary by business and jurisdiction and
should not be hard-coded into sales calculations or receipt layouts.

**Recommended scope:**

- Inclusive and exclusive tax modes.
- Multiple rates and product tax categories.
- Customer exemptions and exemption evidence.
- Configurable invoice sequences and fiscal periods.
- Credit notes and debit notes linked to original invoices.
- Locked accounting periods with controlled adjustment entries.
- Country-specific electronic invoicing only when a confirmed market requires it.

**Definition of done:** Receipts, returns, reports, and journals use the same tax
calculation and rounding policy, including historical transactions.

---

## Phase 5: Optional Industry Modules

These features should be developed only when the target customers justify the
extra complexity. They should be separate modules where possible.

### Retail and Grocery

- Weighing-scale barcode support.
- Shelf-label management and price-change queues.
- Expiry markdown rules.
- Fast cycle counting using a scanner.
- Customer-facing display and optional self-checkout.

### Automotive and Service Workshops

- Vehicle profiles and complete service history.
- Job cards, technician assignment, labor lines, and parts consumption.
- Service estimates and approval history.
- Warranty claims and maintenance reminders.
- Mileage-based service schedules extending the existing oil-change tracking.

### Restaurant and Food Service

- Tables, guest count, course management, and bill splitting.
- Kitchen display or kitchen tickets.
- Recipes, ingredients, modifiers, and ingredient-level stock consumption.
- Tips, service charges, and waiter attribution.

### Appointment-Based Businesses

- Staff calendars, service duration, and resource availability.
- Booking deposits, rescheduling, cancellation, and reminders.
- Employee commission calculation and export.

### E-commerce and Remote Management

- Online catalog and order synchronization.
- Central inventory availability and overselling prevention.
- Mobile owner dashboard with read-only alerts and summaries.
- Payment-terminal integration without storing sensitive card data in VibePOS.

---

## Suggested Delivery Sequence

A practical implementation order is:

1. Cash drawer and cashier shifts.
2. Detailed expense management.
3. Audit trail.
4. Granular permissions and manager approval.
5. Void, cancellation, and exchange workflow.
6. Backup and restore hardening.
7. Purchase-order receiving and replenishment.
8. Barcode and label printing.
9. Receivable/payable aging.
10. Batch, serial, expiry, and warranty tracking.
11. Pricing, loyalty, and promotions.
12. Quotations, orders, deposits, and fulfillment.
13. Multi-location inventory.
14. External integrations and optional industry modules.

## Planning Template for Each Feature

Before implementation begins, create a short feature specification containing:

- **Problem:** What operational problem is being solved?
- **Users:** Which roles can view, create, approve, reverse, or export the data?
- **Workflow:** What are the valid states and transitions?
- **Financial effect:** Which accounts, payments, balances, taxes, or cash totals
  change?
- **Inventory effect:** When and how does stock move?
- **Data model:** Which records are permanent, and what migration is required?
- **Offline behavior:** What works without internet, and how are retries handled?
- **Corrections:** How is a mistake reversed without losing history?
- **Reporting:** Which operational and financial reports must reconcile?
- **Acceptance tests:** Which normal, partial, failure, rollback, and permission
  cases prove the feature is complete?

## Success Measures

The roadmap is succeeding when VibePOS can demonstrate:

- Daily cash variance by cashier and register.
- Profit reports that include operational expenses and reconcile to journals.
- Full traceability for refunds, discounts, stock changes, and balance corrections.
- Fewer stockouts and less dead inventory.
- Faster receiving and checkout through reliable barcode workflows.
- Clear overdue customer and vendor balances.
- Verified backups that can actually be restored.
- Consistent behavior across development, LAN use, and packaged desktop builds.

