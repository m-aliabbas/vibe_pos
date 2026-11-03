# VibePOS Agent Guide

Use `.agents/skills/vibe-pos-feature-development/SKILL.md` for every repository change. It contains the end-to-end workflow, architecture map, safety rules, and verification matrix.

## Mission

Maintain VibePOS as a coherent desktop POS system. Complete requested changes across every affected layer instead of patching only the visible screen. Preserve existing behavior unless the request explicitly changes it.

## Repository map

- `frontend/`: Next.js 16, React 19, TypeScript, Tailwind, and the Tauri v2 shell.
- `backend/`: FastAPI, Pydantic, SQLAlchemy, SQLite, accounting, backups, licensing, and migration scripts.
- `data/` and `backend/data/`: runtime state. Never treat local databases, uploads, backups, or credentials as source code.
- `Agent.md`: detailed architecture and business-domain overview. Verify details against current code because this document may lag implementation.

## Required working behavior

1. Read the relevant model, schema, endpoint/service, typed API client, and UI route before editing.
2. Trace financial and inventory effects end to end. Sales, purchases, returns, payments, stock, customer/vendor balances, and journal entries must remain consistent.
3. For persistent schema changes, update the SQLAlchemy model and add an idempotent migration compatible with existing SQLite installations. Do not delete or recreate a user's database.
4. Keep backend response schemas and `frontend/lib/api.ts` types/functions synchronized.
5. Preserve decimal quantities and currency precision; avoid unintentional integer coercion or floating-point equality assumptions.
6. Preserve authentication, role checks, desktop packaging, LAN behavior, and offline-safe startup unless the task explicitly changes them.
7. Never expose or commit secrets, decrypted Firebase credentials, tokens, local databases, customer/vendor exports, or generated build artifacts.
8. Inspect `git status` before and after work. Existing modifications belong to the user; do not overwrite or revert them.
9. Make the smallest coherent change, then run checks proportional to the affected layers.

## Baseline checks

```bash
cd frontend && npm run lint
cd frontend && npm run build
python3 -m compileall -q backend/app backend/run_server.py
```

## Mandatory UI and flow testing

Compiling and building is not enough. For every change that affects a screen or a user workflow, run the app and use it like a cashier before handing off:

1. Use a disposable data directory, never the user's real database:
   ```bash
   cd backend && DATA_DIR=<temp dir> uv run python run_server.py   # API on 127.0.0.1:8000, seeds admin/admin123
   cd frontend && npm run dev                                       # UI on http://localhost:4321
   ```
2. Open the UI in the browser, log in, and enter realistic data through the screens: create the products/customers the flow needs, then perform the changed workflow (e.g. make a sale, then return part of it).
3. Check the result on screen and in its side effects: totals, stock, balances, receipts, and reports touched by the change. Also try one invalid input (zero, over-limit, empty) and confirm it is rejected clearly.
4. Report exactly which flows were exercised and what was observed. If something could not be run (license gate, hardware, WhatsApp phone pairing, installer build), say so explicitly as an untested gap.

## Session git workflow

- At session start: if `git status --short` is clean, run `git pull` on the current branch first. If there are local changes, do not pull; work on top of them.
- At session end: commit the finished work and `git push -u origin <branch>`. Never push secrets, databases, or build artifacts.

Run narrower checks during iteration. A production Tauri build is required only when Rust, sidecar startup, packaging, or Tauri configuration changes. If a check cannot run because of missing dependencies, licensing, credentials, or platform constraints, report that explicitly.

## Definition of done

- The requested behavior works across all affected layers.
- Existing financial, inventory, and authorization invariants are preserved.
- Persistent changes have a safe upgrade path.
- Relevant checks pass, or unresolved verification gaps are clearly listed.
- The final handoff summarizes behavior, files changed, migration/setup needs, and checks run.
