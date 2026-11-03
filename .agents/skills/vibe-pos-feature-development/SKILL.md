---
name: vibe-pos-feature-development
description: Implement, modify, debug, or review features in the VibePOS repository across its Next.js/React frontend, FastAPI/SQLAlchemy backend, SQLite data model and migrations, accounting and inventory rules, and Tauri desktop packaging. Use for any VibePOS code change, bug fix, new screen, API endpoint, database field, sales or purchase behavior, report, customer or vendor workflow, LAN behavior, build change, or repository-level technical review.
---

# Develop VibePOS Features

Deliver coherent, upgrade-safe changes across the affected layers. Treat this as a transactional business system, not only a web interface.

## Begin with evidence

1. Read root `AGENTS.md` and inspect `git status --short`.
2. Read `Agent.md` for orientation, but confirm every relevant claim in current code.
3. Read [references/change-map.md](references/change-map.md) for likely files and checks.
4. Trace the current behavior before designing the change:
   - UI route and components
   - typed frontend client in `frontend/lib/api.ts`
   - FastAPI router and dependencies
   - Pydantic request/response schemas
   - SQLAlchemy models and services
   - stock, balance, accounting, backup, and migration effects
5. Inspect nearby implementations and reuse established patterns.

Do not overwrite, reformat, or revert unrelated user changes. Treat untracked files and dirty worktree content as user-owned.

## Design the smallest coherent change

Write down the affected layers and invariants before editing. Prefer extending existing domain modules over introducing parallel abstractions.

For an API or UI feature, keep this contract aligned:

```text
SQLAlchemy model / service
        ↕
Pydantic schema ↔ FastAPI endpoint ↔ frontend/lib/api.ts ↔ page/component
```

When changing persistent data:

- Update the canonical SQLAlchemy model.
- Add an idempotent `backend/migrate_*.py` migration for existing installations.
- Preserve existing data and safe defaults.
- Avoid table recreation unless a carefully tested SQLite limitation requires it.
- Import new models from `backend/app/db/base.py` when metadata discovery requires it.
- Check packaged-build path behavior; runtime data must remain outside immutable bundled resources.

When changing transactions:

- Keep stock mutations atomic with the originating sale, purchase, or return.
- Keep customer/vendor balances and payment history consistent.
- Keep double-entry journals balanced: total debits must equal total credits.
- Define refund, discount, tax, prepaid-credit, partial-payment, and cancellation behavior explicitly.
- Preserve decimal quantities and deliberate currency rounding.
- Roll back the database session on failure and avoid committing partial workflows.

When changing access or deployment:

- Enforce authorization on the backend even if the frontend hides controls.
- Preserve JWT injection and session behavior.
- Check both macOS and Windows Tauri entry/config variants when sidecars, ports, or startup change.
- Treat development server settings separately from packaged sidecar behavior.
- Preserve LAN-safe host resolution in the frontend API base URL unless intentionally changing it.

## Implement

Use targeted patches and keep naming consistent with the surrounding domain. Add comments only for non-obvious business constraints. Do not add dependencies unless existing libraries cannot reasonably solve the problem.

Never print, decrypt, modify, or commit secrets, Firebase keys, local license caches, databases, customer/vendor CSV data, uploads, or backups. Use synthetic fixtures for verification.

## Verify by risk

Run focused checks first, then the relevant layer checks from [references/change-map.md](references/change-map.md).

At minimum:

- Python changes: compile touched modules and exercise pure logic or endpoints where feasible.
- Frontend changes: run ESLint on touched files, then `npm run lint` for completed work.
- Contract changes: compare backend schemas with TypeScript interfaces and API calls.
- Schema changes: test the migration twice against a disposable database and confirm existing rows survive.
- Financial/inventory changes: test success, validation failure, partial payment, and rollback paths with synthetic data.
- Tauri/build changes: run the platform-appropriate Rust check and production build when feasible.

Do not mutate the user's real database to test. Create a temporary data directory or disposable database.

Then run the app and test the UI flow by entering data, as described in "Mandatory UI and flow testing" in `AGENTS.md`. A change that touches a screen or workflow is not done until it has been clicked through in the browser with realistic data, including one invalid input.

## Review the finished diff

Before handing off:

1. Inspect `git diff --check` and the scoped diff.
2. Confirm no secrets, generated artifacts, local data, or unrelated changes entered the patch.
3. Confirm all callers were updated when a contract changed.
4. Confirm error states, empty states, loading states, and permissions where relevant.
5. Report checks actually run; do not imply unrun checks passed.

Summarize the delivered behavior, important files, migration or setup requirements, and any remaining verification gaps.
