# Legacy migration scripts (reference only)

These are the one-off `migrate_*.py` scripts used before automatic migrations.
**Do not run them on a current database.** Some of their data fixes assume old
data. For example, `migrate_add_payment_tracking.py` marks every sale with
`amount_paid = 0` as fully paid, which would erase credit (udhar) sales today.

The server now upgrades databases automatically at startup. See `../MIGRATIONS.md`.
Their schema changes come from the models, and their still-relevant data fixes
are on-add backfills in `app/db/migrations/backfills.py`.
