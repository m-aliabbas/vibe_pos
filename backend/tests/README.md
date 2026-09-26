# Backend characterization tests

These tests protect current retail behavior while VibePOS is modularized.

They create a new SQLite database inside an operating-system temporary directory
for every test. The helper rejects repository/runtime database paths, including
`data/pos.db` and `backend/data/pos.db`.

Run after installing `backend/requirements.txt` with Python 3.10 or newer:

```bash
cd backend
python -m unittest discover -s tests -v
```

Do not point test configuration at a copied customer backup. Migration tests use
separate synthetic fixtures and will be introduced in Phase 1.
