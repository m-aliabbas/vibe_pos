# VibePOS Change Map

Use this reference to locate impact quickly. Verify paths against the current tree.

## Core flow

| Layer | Primary location | Typical responsibility |
|---|---|---|
| UI routes | `frontend/app/` | Screens, route state, user workflows |
| Shared UI | `frontend/components/` | Layout, tables, guards, reusable controls |
| Client contract | `frontend/lib/api.ts` | TypeScript API types and Axios calls |
| Authentication state | `frontend/store/authStore.ts` | Login/session state |
| API composition | `backend/app/api/v1/api.py` | Router registration and prefixes |
| API endpoints | `backend/app/api/v1/endpoints/` | HTTP validation, permissions, orchestration |
| Validation contract | `backend/app/schemas/` | Pydantic request and response shapes |
| Persistence | `backend/app/models/` | SQLAlchemy tables and relationships |
| Domain services | `backend/app/services/` | Accounting, backup, license behavior |
| Database setup | `backend/app/db/` | Engine, sessions, model metadata |
| Schema upgrades | `backend/migrate_*.py` | Existing-installation migrations |
| Desktop runtime | `frontend/src-tauri/` | Sidecars, ports, resources, packaging |

## Change impact checklist

### Product, stock, sale, purchase, or return

Inspect products, sales/purchases, returns, held transactions, reports, stock batches/adjustments, and accounting. Confirm variation stock and base-product stock are not both mutated accidentally. Test fractional quantities and unit conversion where supported.

### Customer or vendor balance

Inspect opening balance, outstanding/payable balance, prepaid credit, payment records, sale/purchase totals, ledger output, and journal entries. Define whether the value represents a snapshot or a derived total and avoid maintaining two competing sources of truth.

### API contract

Update endpoint input/output, Pydantic schema, TypeScript interface, client function, and all UI callers together. Preserve error status meaning and nullability. Search by endpoint path, schema name, and field name.

### Database schema

Add a safe migration. Test on a copied or synthetic old schema, then run the migration a second time to prove idempotence. Confirm application startup works both before and after the migration mechanism expected by the packaged app.

### Reports and invoices

Trace the source transaction fields and rounding rules. Check on-screen values plus PDF/print exports. Validate empty periods, discounts, taxes, returns, partial payments, and credit sales as applicable.

### Tauri, ports, or LAN access

Inspect both `main.rs` and `main_mac.rs`, both Tauri config variants, `backend/run_server.py`, `frontend/package.json`, and `frontend/lib/api.ts`. Check development and packaged modes independently.

## Verification commands

Run from the repository root unless noted.

### General hygiene

```bash
git status --short
git diff --check
```

### Backend

```bash
python3 -m compileall -q backend/app backend/run_server.py
```

If dependencies are installed, run focused import/API tests with licensing disabled only through supported configuration. Never weaken production license enforcement just to make a test pass.

### Frontend

```bash
cd frontend
npx eslint path/to/touched-file.tsx
npm run lint
npm run build
```

The full build is especially important for server/client component boundaries, route parameters, and TypeScript contract changes.

### Tauri

```bash
cd frontend/src-tauri
cargo check
```

Use the appropriate manifest/configuration for the target platform where the repository separates macOS and Windows variants. Run `npm run tauri:build` only when packaging validation is warranted and the host has the prerequisites.

### Migrations

Point configuration to a temporary directory or disposable SQLite file. Seed representative old rows, run the migration twice, then query schema and data. Never target `data/pos.db`, `backend/data/pos.db`, or a customer backup.

## High-risk invariants

- A committed business transaction must not leave only some of stock, balances, payments, or journal entries updated.
- Journal entries must balance.
- Returns must not restore or deduct stock twice.
- Held transactions must not mutate final stock or accounting before completion unless that behavior is explicitly designed.
- Endpoint permissions must not depend solely on route guards in React.
- Local runtime data and credentials must never be bundled into source control or surfaced in logs.
