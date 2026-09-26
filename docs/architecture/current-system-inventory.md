# Current System Inventory for Modularization

Date: 2026-09-25

This inventory is a Phase 0 snapshot. It identifies present ownership and
coupling; it does not change production behavior.

## Runtime and packaging

| Layer | Current implementation | Main locations |
| --- | --- | --- |
| Desktop | Tauri v2 launches frontend/backend sidecars | `frontend/src-tauri/` |
| Frontend | Next.js 16, React 19, TypeScript | `frontend/app/`, `frontend/components/` |
| Backend | FastAPI, synchronous SQLAlchemy | `backend/app/` |
| Default database | SQLite in writable runtime data directory | `backend/app/db/session.py`, `backend/run_server.py` |
| Authentication | JWT and Argon2 | `backend/app/api/deps.py`, `backend/app/core/security.py` |
| Licensing | Firebase with encrypted offline cache | `backend/app/services/license.py` |
| Backups | Scheduled/manual archive behavior | `backend/app/services/backup_scheduler.py`, backup endpoints |

## Backend domain inventory

| Domain | Endpoints | Models/schemas/services | Notes |
| --- | --- | --- | --- |
| Auth/users | `auth.py`, `users.py` | `user.py`, auth/user schemas | Shared-platform candidate |
| Customers | `customers.py` | `customer.py`, customer schemas | Common identity mixed with workshop oil fields |
| Vendors | `vendors.py` | `vendor.py`, vendor schemas | Retail commerce capability |
| Catalog/inventory | `products.py`, `stock_audit.py` | products, variations, batches, adjustments | Units/variations are reusable; mutations are endpoint-coupled |
| Sales | `sales.py` | sale models/schemas, accounting service | Large endpoint module owns pricing, stock, balances, accounting, invoices |
| Purchases | `purchases.py` | purchase models/schemas | Directly mutates stock, batches, vendor credit, accounting |
| Holds | `hold_sales.py`, `hold_purchases.py` | JSON payload hold tables | Must remain non-posting until completion |
| Returns | `returns.py` | return models/schemas | Handles sale, direct, and vendor returns with inventory/accounting effects |
| Accounting | `accounting.py` | accounts, journals, posting service | Shared primitives; posting policies are transaction-specific |
| Reports | `reports.py` | report schemas | Contains SQLite-specific date grouping expressions |
| Settings | `settings.py` | singleton store settings | Candidate for app manifest/profile linkage |
| Files/WhatsApp | `files.py`, `whatsapp.py` | file and messaging code | Infrastructure capability with runtime state |
| Backup | `backup.py` | backup scheduler/service | Currently assumes local SQLite/file-oriented behavior |

## Frontend route inventory

| Area | Main routes/components | Coupling concern |
| --- | --- | --- |
| POS | `frontend/app/sales/` | Main sales page combines search, units, cart, payment, invoice behavior |
| Inventory | `frontend/app/inventory/` | Product form combines catalog, units, variation, and stock concerns |
| Customers/vendors | `frontend/app/customers/`, `vendors/` | Customer UI contains workshop-related data requirements |
| Returns | `frontend/app/returns/` | Retail transaction-specific workflow |
| Accounting/reports | `frontend/app/accounting/`, `reports/` | Shared presentation candidates with app-owned reports |
| Administration | `admin/`, `users/`, `settings/`, `backup/`, `updates/` | Navigation is duplicated/hardcoded in layout components |
| API contract | `frontend/lib/api.ts` | Central 700+ line client mixes domains |
| Navigation | `Navbar.tsx`, `AdminLayout.tsx` | Hardcoded routes; no app/capability registry |

## High-coupling hotspots

- `frontend/app/sales/page.tsx`: approximately 3,200 lines.
- `frontend/app/inventory/page.tsx`: approximately 1,400 lines.
- `backend/app/api/v1/endpoints/sales.py`: approximately 1,300 lines.
- `backend/app/api/v1/endpoints/reports.py`: multiple domains and
  SQLite-specific date functions.
- `frontend/lib/api.ts`: central typed client for unrelated domains.
- `backend/app/models/customer.py`: common customer plus workshop mileage fields.
- `backend/app/main.py`: table creation and ad-hoc startup column additions.

## Database portability inventory

- `backend/app/core/config.py` derives `DATABASE_URL` only from the SQLite data
  directory.
- `backend/app/db/session.py` already conditionally applies SQLite connection
  arguments and WAL pragmas, which is a useful starting seam.
- Many legacy migration scripts import `sqlite3` and use `PRAGMA`/SQLite DDL.
- `backend/run_server.py` contains SQLite-specific discovery and repair logic.
- Reports use `func.strftime`, which requires a portable date-grouping strategy.
- Backup behavior must be split into SQLite and server-database adapters.

## Current API contract snapshot

The Phase 0 executable contract snapshot covers these critical route families:

| Prefix | Required current behavior |
| --- | --- |
| `/api/v1/sales` | Cash/credit totals, units, variations, inventory, journals, rollback |
| `/api/v1/purchases` | Vendor validation, stock/batches, payments/prepaid credit, journals |
| `/api/v1/returns` | Sale/direct/vendor modes, stock, settlement, journals |
| `/api/v1/hold-sales` | User-owned payload storage without final stock/accounting posting |
| `/api/v1/hold-purchases` | User-owned payload storage without final stock/accounting posting |
| `/api/v1/products` | Catalog, variations, units, fractional flags, stock adjustments |
| `/api/v1/customers` | Identity, credit, payment history, ledger, current workshop fields |
| `/api/v1/vendors` | Identity, payable/prepaid balances, ledger |
| `/api/v1/accounting` | Balanced journal/account queries |
| `/api/v1/settings/store` | Existing store branding contract |

## Phase 0 constraints

- Do not move files or rename production imports yet.
- Do not add profile columns or module tables yet.
- Do not replace the migration mechanism yet.
- Do not touch real databases, backups, uploads, licences, or customer exports.
- Establish tests and approved boundaries before refactoring transaction code.
