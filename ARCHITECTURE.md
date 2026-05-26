# VibePOS — Architecture Document

## Overview

VibePOS is a **desktop Point-of-Sale (POS) application** built for small to medium retail businesses. It ships as a single installable desktop app that bundles both a Python backend server and a Next.js frontend, packaged together using Tauri (Rust).

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri Desktop Shell (Rust)              │
│  ┌──────────────────────┐   ┌──────────────────────────┐   │
│  │  Next.js Frontend    │   │  FastAPI Backend Server  │   │
│  │  (next-server bin)   │◄──►  (backend-server bin)   │   │
│  │  Port: 3000          │   │  Port: 8000              │   │
│  └──────────────────────┘   └──────────┬───────────────┘   │
│                                        │                    │
│                              ┌─────────▼──────────┐        │
│                              │   SQLite Database  │        │
│                              │   data/pos.db      │        │
│                              └────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                                        │
                          ┌─────────────▼─────────────┐
                          │  Firebase Firestore        │
                          │  (License Enforcement)     │
                          └───────────────────────────┘
```

---

## Components

### 1. Tauri Shell (`frontend/src-tauri/`)

- **Technology**: Tauri v2 (Rust)
- **Role**: Wraps the web frontend in a native desktop window; bundles and launches both the Next.js and FastAPI servers as external binaries.
- **Key files**:
  - `tauri.conf.json` — Window config, bundle targets, external binaries, CSP policy
  - `Cargo.toml` — Rust dependencies
  - `src/` — Rust entry point
- **Build**: `npm run tauri:build` → produces a platform installer (`.dmg` / `.exe`)
- **Bundled binaries**:
  - `bin/next-server` — Compiled Next.js standalone server
  - `bin/backend-server` — PyInstaller-compiled FastAPI server

---

### 2. Frontend (`frontend/`)

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, Radix UI primitives, `shadcn/ui` components
- **State management**: Zustand (`store/authStore.ts`)
- **HTTP client**: Axios (`lib/api.ts`) — base URL `http://127.0.0.1:8000/api/v1`, JWT injected via request interceptor, token stored in `sessionStorage`
- **PDF/reports**: jsPDF + jspdf-autotable
- **Barcodes**: JsBarcode
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod validation

#### Page Routes (`app/`)

| Route | Purpose |
|-------|---------|
| `(auth)/` | Login page |
| `sales/` | POS sales terminal |
| `inventory/` | Product & stock management |
| `purchases/` | Purchase orders from vendors |
| `customers/` | Customer CRM + udhar (credit) management |
| `vendors/` | Vendor management |
| `returns/` | Sales/purchase returns & refunds |
| `accounting/` | Double-entry journal, accounts |
| `reports/` | Sales, stock, profit/loss reports |
| `backup/` | Manual & scheduled backup management |
| `users/` | User accounts & roles |
| `admin/` | Admin-only controls |
| `settings/` | Store branding, configuration |
| `profile/` | Current user profile |

#### Key Frontend Files

| File | Purpose |
|------|---------|
| `lib/api.ts` | Axios instance + all typed API functions |
| `lib/store-config.ts` | Store-level config helpers |
| `store/authStore.ts` | Zustand auth store (login, logout, checkAuth) |
| `components/AdminLayout.tsx` | Shared sidebar/navbar layout |
| `components/DataTable.tsx` | Reusable paginated data table |
| `components/ProtectedRoute.tsx` | Route auth guard |
| `components/CreditLimitAlert.tsx` | Udhar credit limit warning |

---

### 3. Backend (`backend/`)

- **Framework**: FastAPI 0.109, Python
- **Database ORM**: SQLAlchemy (sync), SQLite (`data/pos.db`)
- **Auth**: JWT via `python-jose`, passwords hashed with `argon2-cffi`
- **Validation**: Pydantic v2 + `pydantic-settings`
- **PDF generation**: ReportLab
- **Scheduled tasks**: APScheduler (daily auto-backup at 12:00 PM)
- **WhatsApp**: neonize (Go-based WhatsApp client)
- **License**: Firebase Admin SDK + Fernet-encrypted credential file

#### Directory Layout

```
backend/
├── run_server.py            # Entry point (uvicorn)
├── app/
│   ├── main.py              # FastAPI app, CORS, startup events
│   ├── core/
│   │   ├── config.py        # Pydantic Settings (env vars, DB URL, secrets)
│   │   └── security.py      # JWT create/verify helpers
│   ├── db/
│   │   ├── session.py       # SQLAlchemy engine, SessionLocal, Base, get_db()
│   │   └── base.py          # Imports all models for metadata
│   ├── api/v1/
│   │   ├── api.py           # Aggregates all routers under /api/v1
│   │   └── endpoints/       # One file per domain (see table below)
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   └── services/            # Business logic layer
```

#### API Endpoints

| Prefix | File | Responsibility |
|--------|------|---------------|
| `/auth` | `auth.py` | Login, token generation |
| `/users` | `users.py` | User CRUD, roles |
| `/customers` | `customers.py` | Customer CRUD, payments, notes |
| `/vendors` | `vendors.py` | Vendor CRUD, payable tracking |
| `/products` | `products.py` | Product CRUD, variations, units |
| `/purchases` | `purchases.py` | Purchase orders, stock update on save |
| `/sales` | `sales.py` | POS sales, stock deduction, udhar |
| `/hold-sales` | `hold_sales.py` | Park/resume incomplete sales |
| `/hold-purchases` | `hold_purchases.py` | Park/resume incomplete purchases |
| `/returns` | `returns.py` | Sales/purchase returns, refunds |
| `/accounting` | `accounting.py` | Chart of accounts, journal entries |
| `/reports` | `reports.py` | Aggregated reports (sales, stock, profit) |
| `/backup` | `backup.py` | Manual backup trigger, list backups |
| `/settings` | `settings.py` | Store info (name, address, phone) |
| (root) | `files.py` | Static file serving (product images) |
| (root) | `whatsapp.py` | Send WhatsApp messages |

---

### 4. Database Models

All models live in `backend/app/models/`. SQLite file: `backend/data/pos.db`.

| Model | Table | Key Fields |
|-------|-------|-----------|
| `User` | `users` | username, hashed_password, role |
| `Product` | `products` | name, sku, selling_price, cost_price, quantity, has_variations, selling_units |
| `ProductVariation` | `product_variations` | product_id, attributes (JSON), sku, price_adjustment, quantity |
| `Vendor` | `vendors` | name, phone, opening_balance, prepaid_credit |
| `Customer` | `customers` | phone, customer_id, outstanding_balance, credit_limit, opening_balance |
| `CustomerPayment` | `customer_payments` | customer_id, amount, payment_method |
| `CustomerNote` | `customer_notes` | customer_id, note_type, note_text |
| `Sale` | `sales` | customer_ref_id, total, amount_paid, amount_due (udhar), payment_method |
| `SaleItem` | `sale_items` | sale_id, product_id, variation_id, quantity, unit, unit_price |
| `Purchase` | `purchases` | vendor_id, total_amount, amount_paid, status |
| `PurchaseItem` | `purchase_items` | purchase_id, product_id, variation_id, quantity, unit_cost, expiry_date |
| `PosReturn` | `returns` | sale_id, refund_amount, reason, status |
| `Account` | `accounts` | code, name, type (asset/liability/equity/income/expense) |
| `JournalEntry` | `journal_entries` | entry_date, description, source_type, source_id |
| `JournalLine` | `journal_lines` | entry_id, account_id, debit, credit |
| `StoreSettings` | `store_settings` | store_name, address, phone, tax_id |

---

### 5. Services (`backend/app/services/`)

| Service | Purpose |
|---------|---------|
| `license.py` | Device fingerprinting (SHA-256 of hardware info), Firebase Firestore license check, encrypted local cache |
| `backup_scheduler.py` | APScheduler cron job — zips `data/*.db` daily at 12:00 PM into `data/backups/auto/` |
| `accounting.py` | Creates double-entry journal entries automatically when sales/purchases/returns occur |

---

### 6. Authentication & Security

- **Flow**: User POSTs credentials to `/api/v1/auth/login` → receives JWT → stored in `sessionStorage` → sent as `Authorization: Bearer <token>` on every request
- **Token expiry**: Configured via `ACCESS_TOKEN_EXPIRE_MINUTES` (currently 0 = non-expiring)
- **Roles**: Stored on the `User` model; `AdminRouteGuard` and `ProtectedRoute` enforce roles on the frontend
- **Password hashing**: Argon2 via `passlib`

---

### 7. License System

1. On startup, `check_license_or_exit()` is called.
2. A device fingerprint is generated (SHA-256 hash of OS info + MAC address + username).
3. The fingerprint is checked against Firebase Firestore collection `lisence_pos`.
4. Result is cached locally in `data/license_cache.enc` (Fernet-encrypted) to allow offline use.
5. If license check fails, the server raises `RuntimeError` and exits.

---

### 8. WhatsApp Integration

- Library: **neonize** (Python bindings for a Go-based WhatsApp client)
- Initialized at startup via `init_whatsapp()`
- Used to send receipts/notifications to customers
- Session stored in `data/whatsapp/`

---

### 9. Build & Distribution

#### Development
```bash
# Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev        # Next.js on port 3000
cd frontend && npm run tauri:dev  # Tauri dev window
```

#### Production Build
```bash
cd frontend && npm run tauri:build
```
This runs:
1. `next build` → exports standalone Next.js server
2. `node scripts/package-server.js` → copies server into `src-tauri/bin/`
3. PyInstaller (via `build_backend.sh`) → compiles FastAPI to `backend-server` binary
4. `tauri build` → bundles everything into a platform installer

---

### 10. Key Business Concepts

| Concept | Description |
|---------|-------------|
| **Udhar** | Credit/debit system — a customer's `outstanding_balance` tracks money owed. Partial payments are recorded in `customer_payments`. |
| **Hold Sale/Purchase** | Park an incomplete transaction to resume later without losing data. |
| **Product Variations** | A single product can have attributes (Size, Color) producing distinct SKU/price/stock entries. |
| **Selling Units** | A product can be sold in multiple units (e.g., piece, dozen, box) with separate conversion ratios and prices. |
| **Double-Entry Accounting** | Every sale/purchase/return automatically generates journal entries. Chart of accounts uses standard types (Asset, Liability, Equity, Income, Expense). |
| **Oil Change Tracking** | Optional customer field to track vehicle mileage and schedule oil changes (for automotive shops). |
| **Prepaid Credit** | Vendors can have a `prepaid_credit` balance from advance payments. |
