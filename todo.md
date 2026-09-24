# VibePOS Feature Work

## Scope and decisions

- Quotes are non-posting sales drafts until converted to a sale. They need line items, customer, status, expiry, printable output, and send support.
- Return bills remain linked to the original sale and must never mutate stock or accounting twice. The existing return invoice/send flow is retained and will be checked while quote work is added.
- Opening balances are historical dated entries, not mutable daily snapshots. Customer and vendor ledgers calculate the balance at any date from the opening entry plus journal activity.
- Expenses are posted as balanced journal entries: debit an expense account and credit cash/bank or a payable. They must appear in P&L and the shop ledger.
- Shop ledger is the journal view with account/date/source filters. P&L shows revenue, cost of goods sold, operating expenses, and net profit for a selected period.
- Buy-on-behalf remains a customer receivable transaction, with payment method, date, description, edit/delete, ledger impact, and notifications.

## Implementation checklist

- [x] Add first-class expense model, schema, API, migration, and journal posting.
- [x] Add expense management UI and expose expenses in P&L and shop ledger.
- [ ] Add dated opening-balance entries for customers and vendors with safe journal posting and UI controls.
- [x] Add sales-terminal quotation flow in the shared checkout dialog, including customer details, print, non-posting save, and WhatsApp quotation-image send action.
- [ ] Add dedicated quote history, editing/expiry/status tracking, and conversion-to-sale workflow.
- [x] Verify the existing return bill print/send flow and buy-on-behalf ledger/notification flow as the baseline for follow-up work.
- [ ] Add focused backend tests for balanced postings, date filtering, conversion, and rollback paths.
- [ ] Run frontend lint/build, backend compile checks, migration idempotence checks, and diff hygiene checks.
