# 08 — Acceptance Criteria

Every criterion below must map to at least one automated test (test id in brackets once written).
A phase is done only when all of its criteria pass in CI against real PostgreSQL / real SQLite —
never against mocks of the database.

Legend: **[U]** unit · **[I]** API/DB integration · **[E]** Playwright / POS end-to-end · **[F]** fault injection · **[L]** load.

## Phase 1 — Definition
- P1-1 Scope, architecture, ADRs, ER diagram, data dictionary, security model, sync protocol, accounting
  & inventory rules, limitations exist in `docs/` and are reviewed by the product owner.
- P1-2 Every entity group listed in the brief appears in the data dictionary with keys, tenant ownership and constraints.
- P1-3 Every document type has a state machine with permitted transitions.
- P1-4 Accounting assumptions requiring an accountant's review are listed (doc 07 §8).

## Phase 2 — Foundation
- P2-1 `npm ci && npm run lint && npm run typecheck && npm test` passes from a clean checkout. [CI]
- P2-2 `docker compose up` starts PostgreSQL, Redis, MinIO; `npm run db:migrate` applies all migrations to an empty DB; re-running is a no-op. [I]
- P2-3 Login with correct password returns a session cookie; wrong password and unknown email return the same error in similar time; 11th attempt within a minute from one IP returns 429. [I]
- P2-4 Password reset token is single-use, expires in 30 minutes, and is stored hashed. [I]
- P2-5 Every tenant-scoped table has RLS `ENABLE` + `FORCE` and a `tenant_isolation` policy (checked by a test that queries `pg_class`/`pg_policies`). [I]
- P2-6 With the app DB role, a transaction without `app.tenant_id` sees zero rows in every tenant table. [I]
- P2-7 For each tenant API resource, a user of tenant A calling with an id belonging to tenant B gets 404 (not 403, not data). Generated from the route list so new routes are covered automatically. [I]
- P2-8 RLS holds through a pooled connection reused across tenants (PgBouncer transaction mode in CI). [I]
- P2-9 A user without permission `X` gets 403 on every endpoint annotated with `X`; branch-scoped users cannot act on other branches. [I]
- P2-10 Every mutating endpoint writes an audit row in the same transaction; the app role cannot `UPDATE`/`DELETE` audit rows. [I]
- P2-11 Platform operator endpoints reject tenant sessions and vice versa. [I]
- P2-12 OpenAPI document is generated at build and served at `/api/docs` (non-production) and `/api/openapi.json`. [I]

## Phase 3 — Vertical slice
- P3-1 A manager creates a product with price and tax category in the dashboard; it appears on the POS after pull sync. [E]
- P3-2 POS creates an order, takes a cash payment and finalizes **with the network disabled**; the sale, its lines, payment and an outbox row are committed in one SQLite transaction. [E][F]
- P3-3 A receipt prints (or renders to the printer emulator in CI) with no network. [E]
- P3-4 On reconnect, the outbox drains; the server creates exactly one order, invoice, invoice lines, payment and one **balanced** posted journal entry. [E][I]
- P3-5 Sending the same batch 3 times yields 1 effect; responses after the first are `already_processed` with the same server references. [I]
- P3-6 Server recomputes totals from lines; a payload whose stated totals disagree with recomputation by more than the rounding tolerance is accepted **and flagged** (`sale_discrepancies` row), never silently corrected. [I]
- P3-7 Trial balance for the tenant balances after the sale. [I]

## Phase 4 — Full POS & offline recovery
- P4-1 Split bill by items and by amount; merge two open orders; transfer an order to another table — all audited. [E]
- P4-2 Partial payments with two methods; change is computed for cash only; overpayment on non-cash is rejected. [U][E]
- P4-3 Void of an item already sent to kitchen requires a manager PIN with permission `pos.void_sent_item`; the approval is recorded. [E]
- P4-4 Refund references the original invoice and lines; refunded quantity per line can never exceed sold minus already refunded. [U][I]
- P4-5 Cash session: opening float, pay-ins/outs, expected cash = float + cash sales − cash refunds ± movements; counted vs expected variance is posted to cash over/short. [U][I]
- P4-6 Kill the POS process at 20 random points during finalize/sync (100 runs): after restart, no sale is lost, none duplicated, local DB passes integrity check. [F]
- P4-7 Server processes a batch but the response is dropped; retry returns `already_processed`; device marks ops acknowledged. [F]
- P4-8 Two devices in one branch offline for 24 h with conflicting table usage both upload; both sales are kept; the table conflict is reported, no financial record is merged or overwritten. [F]
- P4-9 A disabled device's push is rejected with `device_disabled`; its queued ops stay intact locally for manager export. [I][E]
- P4-10 An expired license lease puts the POS into "no new sales" mode with a clear message; queued ops still sync after renewal. [E]
- P4-11 Local SQLite migration from schema N to N+1 preserves all unsynced ops (migration test with fixture DB). [I]

## Phase 5 — Inventory & purchasing
- P5-1 Selling a product with recipe version V creates consumption movements exactly equal to Σ(recipe line qty × converted units × qty sold); reproducible later from V. [U][I]
- P5-2 Σ movements per (item, warehouse) equals `stock_balances` quantity and value; reconciliation report lists any mismatch. [I]
- P5-3 Weighted-average cost updates on each receipt; issues use current average; no historical movement is ever updated (DB trigger rejects UPDATE/DELETE). [U][I]
- P5-4 Stock count approval creates adjustment movements for differences only. [I]
- P5-5 Transfer: dispatch moves stock to in-transit; receipt moves it to destination; short receipt records a transfer variance. [I]
- P5-6 PO → partial GRN → second GRN → supplier invoice links all; invoice cannot bill more than received (tolerance configurable). [I]
- P5-7 Landed costs allocated by value/quantity/weight increase item cost of the receipt. [U][I]
- P5-8 Production order consumes ingredients and produces a semi-finished item at their summed cost. [I]

## Phase 6 — Accounting
- P6-1 A journal entry with Σdebit ≠ Σcredit cannot be posted (service check **and** deferred DB constraint trigger). [U][I]
- P6-2 Posted entries/lines cannot be updated or deleted by the app role (trigger); correction only via reversal entry linked to the original. [I]
- P6-3 Each document type posts according to its rule in doc 07 using tenant accounting mappings; missing mapping blocks posting with a clear error and leaves the document in `posting_failed` for retry, never half-posted. [I]
- P6-4 Posting in a closed period is rejected for manual entries; late-synced POS sales post to the first open period with `original_date` preserved and a `late_posting` flag. [I]
- P6-5 Trial balance, P&L, balance sheet and cash flow are derived from journal lines only; balance sheet balances; retained earnings roll on year close. [I]
- P6-6 Sales subledger total = sales revenue GL for any date range; AP subledger = AP control account; mismatches appear in the reconciliation report. [I]
- P6-7 Bank reconciliation matches statement lines to journal lines; unmatched lines remain visible. [I]

## Phase 7 — SaaS, employees, analytics, kitchen, loyalty
- P7-1 Trial → active on successful payment (adapter test double in tests, real gateway only with credentials); past due → grace → suspended on schedule; suspended tenants are read-only, POS gets no lease renewal. [I]
- P7-2 Usage limits (branches, devices, users) are enforced at creation time with a clear error. [I]
- P7-3 Users without `payroll.view` never receive salary fields from any endpoint (including exports and reports). [I]
- P7-4 Payroll run posts a balanced entry and cannot be edited after approval. [I]
- P7-5 KDS shows tickets per station with elapsed time; state changes are audited; delayed tickets highlight after the station threshold. [E]
- P7-6 Loyalty points ledger: balance = Σ transactions; redemption cannot exceed balance; points earned only on finalized invoices. [U][I]
- P7-7 Each report reconciles with the GL or the stock ledger for the same filter. [I]

## Phase 8 — Production readiness
- P8-1 Performance targets in doc 01 §4 measured on reference hardware; results committed with method. [L]
- P8-2 Restore drill: restore latest backup + PITR to a new instance, run integrity checks, document RTO/RPO achieved. [I]
- P8-3 Dependency, container and secret scans clean or accepted with justification. [CI]
- P8-4 Security test pass: authz matrix, CSRF, rate limits, input validation, IDOR suite. [I]
- P8-5 Runbooks for incidents (doc 10) exercised once each. [manual, recorded]
