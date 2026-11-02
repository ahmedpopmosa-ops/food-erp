# 09 — Known Limitations, Unfinished Work and Open Questions

Updated at the end of every phase. Nothing here is claimed as working.

## 1. Implementation status
| Area | Status (2026-10-30) |
|---|---|
| Phase 1 documentation | Approved |
| Phase 2 API foundation | **Implemented and tested locally** (see §1.1) |
| Phase 3 vertical slice | **Implemented and tested locally** (see §1.3) |
| Phase 4a POS operations | **Implemented and tested locally** (see §1.5) |
| Phase 4b dine-in | **Implemented and tested locally** (see §1.7) — POS logic and API only, no screens |
| Phase 5a inventory | **Implemented and tested locally** (see §1.9) — API only, no screens |
| Phase 5b purchasing | **Implemented and tested locally** (see §1.11); screens in §1.13 |
| Phase 6a general ledger, periods, statements, reconciliation | **Implemented and tested locally** (see §1.14) — API only, no screens |
| Phase 6b bank reconciliation + accounting screens | **Implemented and tested locally** (see §1.17) |
| Phase 7a kitchen display | **Implemented and tested locally** (see §1.18) |
| Phase 7b–7e employees & payroll, analytics, loyalty, SaaS billing | **Not started** |
| Web dashboard | **Partial**: login, products, devices (pairing), sales with journal, trial balance, and inventory + purchasing screens (see §1.13). Other screens later |
| Operator console UI | **Not started** (API exists) |
| POS app (Tauri shell + screens) | **Not started** — POS logic exists as `packages/pos-core` (ADR-0012); the Tauri shell and Rust driver need Rust installed |
| Redis/BullMQ worker, S3 storage | **Not started** — containers declared in docker-compose, nothing reads them |
| Any external integration (payment gateway, e-mail, tax authority, delivery aggregators) | **Not started**. Mail has only a development `log` transport; production startup is refused until a real adapter exists |

### 1.1 Phase 2 acceptance criteria (doc 08)
Verified on 2026-10-30 on Windows 11 with embedded PostgreSQL 18 (`npm test`: 23 unit + 60 integration tests passing).

| Criterion | Status |
|---|---|
| P2-1 lint, typecheck, tests from a clean checkout | Passing locally; **CI workflow written but never run** (no git/GitHub here) |
| P2-2 migrations on an empty DB, re-run is a no-op | Passing (embedded PostgreSQL). `docker compose` path written, **not run** (no Docker here) |
| P2-3 login, same error for unknown e-mail, rate limit 429 | Passing (`auth`, `throttle` suites); account lockout also tested |
| P2-4 reset token single-use, 30 min, hashed | Passing |
| P2-5 RLS enabled + forced + policy on every tenant table | Passing (catalog query test) |
| P2-6 zero rows without tenant context | Passing |
| P2-7 cross-tenant id → 404, generated from the route list | Passing (fails if a new parameterised route has no case) |
| P2-8 RLS through pooled connections | **Partly**: tested with a single reused Prisma connection (`connection_limit=1`); **not tested behind PgBouncer** |
| P2-9 403 without permission, branch scope | Passing (generated over every permission-guarded route) |
| P2-10 audit in same transaction, append-only | Passing (permission-denied test on UPDATE/DELETE) |
| P2-11 operator vs tenant sessions | Passing |
| P2-12 OpenAPI generated and served | Passing (test asserts every route is documented) |

### 1.2 Phase 2 known gaps
- ~~Device registration and device tokens~~ — done in Phase 3. License leases still open (see §1.4).
- MFA for operators (ADR-0010) is not implemented.
- Members list is visible to every holder of `users.view`, regardless of branch scope.
- Settings `PATCH` silently ignores unknown fields (e.g. `valuationMethod`) instead of rejecting them.
- Docker image, CI workflow and docker-compose stack are unexecuted.
- Field-level encryption (AES-256-GCM) has no consumer yet and is not implemented.

### 1.3 Phase 3 acceptance criteria (doc 08)
Verified on 2026-10-30 (`npm test`: 42 unit + 85 integration tests passing; dashboard checked in a browser).

| Criterion | Status |
|---|---|
| P3-1 product created in the dashboard reaches the POS by pull | Passing (`slice` suite) and checked manually in the web UI |
| P3-2 offline finalize commits sale, payments, outbox op in one SQLite transaction | Passing (`slice`, `pos-core` atomicity test with an injected mid-batch failure) |
| P3-3 receipt prints with no network | Passing against the **file printer emulator**; no physical printer tested |
| P3-4 outbox drains to exactly one order/invoice/payment and one balanced entry | Passing |
| P3-5 repeated batch → `already_processed` with same refs | Passing (sequential, concurrent and lost-ack cases) |
| P3-6 recomputed totals; mismatch accepted and flagged | Passing (`totals_mismatch`, `price_outdated`, `payment_mismatch`, `late_posting` discrepancies) |
| P3-7 trial balance balances | Passing |

### 1.4 Phase 3 known gaps
- **POS runs headless only.** No POS screens and no Tauri build (no Rust toolchain here). The slice uses the real
  POS core on a real SQLite file with Node's driver.
- **Receipts are English-only text.** Arabic needs raster rendering for most thermal printers (Phase 4).
- **No cash sessions yet.** Cash payments carry no `cash_session_id`; there is no drawer reconciliation.
- ~~**No COGS.**~~ Done in Phase 5a: each synced sale also posts a COGS entry from its recipe consumption.
- **License lease not issued.** The Ed25519 lease is not implemented, so an offline POS has no expiry yet (P4-10).
- **Missing account mappings.** A sale blocked by a missing mapping is quarantined and retried hourly by the
  device; there is no dashboard screen to review quarantined operations yet.
- ~~**Fiscal years.** Only the current year is seeded; a December sale with its period closed had no later open
  period~~: fixed in Phase 6a — the next calendar year is created on demand (and by `POST
  /accounting/fiscal-years/next`).
- **Discrepancies.** They are listed per invoice, but nothing can resolve them yet.
- **Business date at the server.** It is computed from the device's `occurred_at`; clock-skew handling (doc 06 §7)
  is recorded but not acted on.

### 1.5 Phase 4a acceptance criteria (doc 08)
Verified on 2026-10-30 (`npm test`: 55 unit + 90 integration tests passing).

| Criterion | Status |
|---|---|
| P4-1 split / merge / table transfer | **Not started** (Phase 4b) |
| P4-2 partial payments with two methods; change for cash only | Passing (`pos-core`) |
| P4-3 manager PIN approval, recorded | Passing for refunds and pay-outs. Voiding items already sent to the kitchen waits for the kitchen flow (4b) |
| P4-4 refund references original; qty ≤ sold − refunded | Passing on device and server (row lock + DB CHECK); split exactly to the cent |
| P4-5 cash session expected / variance posted | Passing; server recomputes expected and posts to cash over/short |
| P4-6 kill the POS mid-write | Passing: **25** hard kills (not 100) on Node's SQLite driver; the Tauri driver doesn't exist yet |
| P4-7 lost ack → `already_processed` | Passing (Phase 3) |
| P4-8 two devices offline | Passing for sales, numbering and drawers. **Table conflicts not covered** (no tables yet) |
| P4-9 disabled device | Server rejects (Phase 3); ops stay on the device and `exportPending()` exports them. Admin import endpoint **not built** |
| P4-10 expired lease → no new sales | Passing; forged leases rejected |
| P4-11 local migration keeps unsynced ops | Passing (v1 → v2 fixture database) |

### 1.6 Phase 4a known gaps
- **No POS screens.** The POS logic is complete for this scope but still headless; the Tauri shell needs Rust.
- **No dashboard screen for staff yet.** Employees and PINs exist only through the API.
- **Closing a drawer with ops still pending.** If an earlier sale in the same session was rejected or is still
  retrying when the close arrives, the server's expected cash differs from the device's. The difference is
  visible (`device_expected_cash`), but nothing reviews it yet.
- **Two devices refunding the same invoice offline.** The second refund to sync is rejected
  (`refund_exceeds_sale`) and kept for follow-up, even though the cash was already handed back.
- **Opening float is not posted.** No safe account is tracked yet. Pay-ins and pay-outs post against "cash in safe".
- **Lease public key.** The device trusts the key it receives at pairing; production builds must embed it (ADR-0013).

### 1.7 Phase 4b (dine-in)
Verified on 2026-10-30 (`npm test`: 67 unit + 93 integration tests passing).

| Item | Status |
|---|---|
| Modifiers (groups with min/max, price deltas, shown on invoice lines) | Passing (POS validation, server price re-check) |
| Line and order discounts; VAT on the discounted price; approval above `maxDiscountPct` | Passing (POS blocks without approval; server flags `discount_unapproved`) |
| Dine-in service charge (configurable rate and tax category), posted to service charge revenue | Passing |
| Tables and floor plan (dashboard API), occupancy, transfer | Passing |
| Split by items, merge orders (P4-1) | Passing |
| Kitchen ticket printing, void unsent (cashier) / sent (manager approval) (P4-3) | Passing; voids travel with the sale and are stored as voided order items |
| Cancel after kitchen → `order.cancelled` with approval | Passing |
| Two devices on one table offline (P4-8) | Passing: both sales kept, the later one flagged `table_conflict` |
| `sale.finalized` v1/v2 from older POS builds | Still accepted (converted to v3 on the server) |

### 1.8 Phase 4b known gaps
- **No POS screens** (Tauri/Rust). Everything here runs headless through `packages/pos-core`.
- **Dashboard has no pages** for modifiers, tables, staff or the new settings (API only).
- **Split bill by amount.** Covered by partial payments on one invoice; no "split into N invoices" mode.
- **Open orders are device-local.** Another till cannot pick up a table's open order, so the floor plan
  shows only this device's orders. That is why conflicts are detected after sync rather than prevented.
- **Kitchen printing is text only**, with no routing of printed tickets to stations and no reprint. (~~No
  kitchen display~~: done in Phase 7a, §1.18 — the display routes by station; the printer does not yet.)
- ~~**Voided items are not yet costed.**~~ Done in Phase 5a: voids and cancellations after the kitchen become
  wastage movements.
- **Sets of modifiers.** Not supported: no nested modifiers and no per-modifier recipes.

### 1.9 Phase 5a (inventory)
Verified on 2026-10-30 (`npm test`: 73 unit + 105 integration tests passing; `inventory` suite has 11 tests).

| Item | Status |
|---|---|
| Stock items with base unit (g / ml / pc), built-in and per-item unit conversions, minimum level | Passing |
| Versioned recipes per variant (yield, waste %); new version retires the old, versions are immutable | Passing; each invoice line stores the recipe version used |
| Append-only stock ledger, perpetual weighted average, one movement per source line (DB unique index) | Passing (UPDATE/DELETE denied, sign/type CHECK, replayed sale does not consume twice) |
| Recipe consumption + COGS journal on every synced sale | Passing (Dr 5100 / Cr 1200 from the same movements) |
| Wastage from voids after the kitchen and from `order.cancelled` | Passing (Dr 5200 / Cr 1200) |
| Negative stock allowed, flagged `negative_stock`; next receipt settles it as price variance | Passing (revaluation movement → 5400) |
| Opening balances, adjustments ±, wastage, spoilage (numbered ADJ-) | Passing |
| Counts: snapshot, entry, approval against stock at approval time (CNT-) | Passing |
| Transfers between branches through a transit warehouse; shortfall on receipt → transfer variance (TRF-) | Passing (1200 ↔ 1210, shortage to 5300) |
| Reconciliation: Σ movements = balances, GL 1200 + 1210 = stock value | Passing after every test step |
| Branch scope on warehouses; IDOR checks on all new routes | Passing |

**Fixed during this phase:** the `immutable_except()` trigger did nothing when declared without arguments
(`TG_ARGV` is NULL, so the comparison was NULL). This affected `invoice_taxes`, `refund_lines` and `approvals`
since Phase 3, as well as the new recipe and adjustment lines. Migration `20261031000200` fixes it, and the
`rls` suite now checks every such table.

### 1.10 Phase 5a known gaps
- ~~**No dashboard pages** for inventory~~: added (§1.13).
- **Refunds do not return stock.** A refunded sale keeps its consumption; whether food comes back is a manager
  decision (`refund_return` movement type exists, no flow uses it).
- **Modifiers consume nothing.** Recipes are per variant only ("extra cheese" uses no stock).
- **Consumption warehouse.** Always the branch's first `main` warehouse; kitchen/bar sub-stores and production
  (semi-finished items) are not modelled yet.
- **Counts freeze nothing.** Sales during a count are respected (difference = counted − stock at approval),
  but there is no count-sheet export or blind count mode.
- **Transit uses one weighted average** across all open transfers, so a transfer may arrive at a slightly
  different cost than it left at if several are in transit at once.
- **Lock ordering across separate postings.** A sale's consumption and its wastage lock balances in two steps;
  concurrent sales on the same items could deadlock. PostgreSQL aborts one; the sync service retries only
  Prisma's `P2034`, and a deadlock raised inside the raw `FOR UPDATE` query may surface differently. **Not tested.**
- ~~**Receiving purchases**~~: done in Phase 5b (§1.11).

### 1.11 Phase 5b (purchasing)
Verified on 2026-10-30 (`npm test`: 73 unit + 112 integration tests passing; `purchasing` suite has 7 tests,
run on tenant B).

| Item | Status |
|---|---|
| Suppliers (code, names, tax number, payment terms) | Passing (duplicate code → 409) |
| Purchase orders: draft → approved (`purchasing.approve`) → partially received → received; cancel if nothing received (PO-) | Passing |
| Goods receipts against an order (order price by default, any unit) or direct (GRN-) | Passing; over-receipt and items not on the order → 400 |
| Freight/handling charges capitalised into stock, split by goods value | Passing (Dr 1200 / Cr 2110 goods, Cr 2120 charges) |
| Supplier invoices matched to receipt lines; GRNI cleared at received value; price difference → 5400; input VAT → 1300; AP → 2100 (PINV-) | Passing; printed total must match, duplicate supplier invoice number → 409, over-invoicing → 400 |
| Non-stock invoice lines (freight, services) to a chosen postable, non-control account | Passing (clears the 2120 freight accrual in the test) |
| Returns to supplier of received, not yet invoiced goods (RTN-) | Passing (Dr 2110 received value / Cr 1200 weighted average, difference → 5400) |
| Supplier payments by cash (1140) or bank (1150), fully allocated to open invoices (SPAY-) | Passing; over-allocation refused by a single conditional update, so concurrent payments cannot overpay |
| Supplier statement (open invoices, payments, balance, uninvoiced value) | Passing |
| Reconciliation: open invoices = GL 2100, uninvoiced receipts = GL 2110 (to the cent) | Passing |
| DB protection: posted lines immutable, running totals bounded by CHECKs, no DELETE for the app role | Passing |
| Branch scope (orders, receipts, returns by warehouse); invoices and payments need all branches; IDOR on all new routes | Passing |

New accounts in the default chart: 1150 Bank, 1300 Input VAT, 2100 Accounts payable (control), 2110 Goods
received not invoiced (control), 2120 Accrued purchase charges. `npm run db:migrate` now also runs
`prisma/sync-accounts.ts`, which adds template accounts and mappings that a tenant is missing (idempotent,
never changes existing ones); the dev database's tenant was synced this way. A tenant whose accountant
remapped or removed one of these keys gets `posting_mapping_missing` (422) on purchasing postings.

### 1.12 Phase 5b known gaps
- ~~**No dashboard pages** for purchasing~~: added (§1.13).
- **No supplier credit notes.** Goods can be returned only while uninvoiced; after invoicing, a return needs a
  credit note flow (not built). Invoices cannot be cancelled either.
- **No supplier advances.** A payment must be fully allocated to open invoices.
- **No approval limits or segregation of duties.** Anyone with `purchasing.approve` can approve any order,
  including one they created.
- **Price differences always go to price variance (5400)**, never back into stock value, even if the goods are
  still on hand. There is no tolerance check: any difference is accepted and shown on the invoice line.
- **Returned charges.** A return releases GRNI at goods value only; the freight capitalised into the returned
  goods ends up in price variance.
- **Single currency.** Purchases are in the tenant's base currency; no foreign-currency suppliers.
- **Invoice and payment permission.** Both use `suppliers.payments` (accountant role); there is no separate
  permission for entering invoices.
- **The Phase 5a lock-ordering note applies.** Receipts, returns and invoices lock in a fixed order within one
  document, but this is **not load-tested**.

### 1.13 Inventory and purchasing screens (web dashboard)
Verified on 2026-10-30: `npm run typecheck`, `npm run lint`, `npm test` (73 unit + 112 integration) and
`npm run build -w @ros/web` pass. **There are no automated UI tests**; the screens were checked by hand in the
browser against the dev database (owner account, English and Arabic). That run covered: create item with a
custom unit (sack = 50 000 g) → supplier → purchase order in sacks → approve → partial receipt with freight →
supplier invoice with a price difference, a freight line and 14% VAT (mismatch warning shown before the right
total) → overpayment refused with its message → bank part-payment → cash payment of the rest → stock count
with a loss → movements. Reconciliation banners matched at every step.

| Screen | Contents |
|---|---|
| Inventory › Stock | Balances per warehouse (filter), average cost, below-minimum / negative badges, ledger and GL reconciliation (owner/accountant) |
| Inventory › Items | List, add item (kind, base unit, standard cost, minimum, one extra unit) |
| Inventory › Recipes | Pick a product, see the active version, save a new version (prefilled from the active one) |
| Inventory › Adjustments / Counts / Transfers / Movements | Lists and forms; count sheet with entry and approval; transfer dispatch and receipt with shortfall; paged movements |
| Purchasing › Orders / Receipts / Returns | PO create, approve, cancel, receive against the order (with charges); direct receipt; return of uninvoiced goods from the receipt |
| Purchasing › Invoices / Payments / Suppliers | Invoice entry matched to open receipt lines plus account lines, live total check, VAT fill; payment allocation with "pay all"; supplier statement with overdue flags; payables reconciliation |

Buttons and tabs follow the user's permissions; the API enforces them regardless. New API support:
`GET /v1/inventory/warehouses` (branch-scoped; `?destinations=true` lists every non-transit store so a branch
manager can send a transfer to another branch), and supplier-invoice detail now returns each goods line's item.

Known gaps of the screens:
- **Transfers were not exercised in the browser** (the dev tenant has one stock warehouse); they are covered by
  the API tests only.
- Quantities in receive/count/return/transfer-receipt grids are entered in the item's **base unit** (g, ml, pc);
  order and adjustment lines accept any unit of the item.
- Validation messages from the API (field level) are in English; form-level errors are translated.
- Items and suppliers cannot be edited or archived from the UI (no API for it yet).
- Wide tables scroll horizontally on phones; there is no card layout for small screens.

### 1.14 Phase 6a (general ledger, periods, statements, reconciliation)
Verified on 2026-10-31 (`npm test`: 73 unit + 119 integration tests passing; `ledger` suite has 7 tests, run on
tenant B in a 2025 fiscal year created by the suite). The full suite was also run once in a second order
(alphabetical, ledger last) and passed; doing so exposed two order-dependent tests, fixed below.

| Acceptance | Status |
|---|---|
| P6-1 unbalanced entries refused (service + deferred trigger) | Passing (from Phase 3; manual entries add a 400 `journal.unbalanced` check) |
| P6-2 posted entries immutable; correction only by a linked reversal | Passing: `POST /accounting/journal-entries/:id/reverse` mirrors every line, sets `reversal_of_id`, one reversal per entry (409 on a second), never dated before the original. Only **manual** entries can be reversed; documents (sales, purchases, stock) are corrected through their own flows |
| P6-3 posting by mapping, never half-posted | Passing for every document: a missing mapping fails the whole transaction with 422 `posting_mapping_missing` (sync operations are quarantined and retried, back-office requests can simply be resent). There is **no persisted `posting_failed` document state** — nothing is ever saved unposted |
| P6-4 closed periods | Passing: manual entries need the date's own period open (closed → 422 `accounting.periodClosed`; soft-closed → 403 unless `accounting.post_in_soft_closed`). A new trigger refuses any posted entry in a closed period except a year's closing entry. Late POS sales still go to the first open period with `original_date` |
| P6-5 statements from journal lines; balance sheet balances; retained earnings roll on year close | Passing: profit & loss (optional branch), balance sheet with current-year earnings, cash flow (indirect, reconciles opening + change = closing), general ledger with running balance. Year close posts one `year_close` entry per year, per branch, into retained earnings; the year and its periods are then frozen by triggers |
| P6-6 sub-ledgers = GL | Passing: `GET /accounting/reconciliation` — sales (invoices − refunds vs revenue/discount/service-charge accounts), payables, GRNI, inventory value, stock ledger, documents without entry, trial balance. A manual revenue entry shows as a difference |
| P6-7 bank reconciliation | Passing in Phase 6b (§1.17) |

Periods move open → soft_closed → closed in date order, reopen from the latest closed one backwards with a
reason (audited, `accounting.period_reopen`). A pre-close checklist lists open discrepancies, unapplied sync
operations, counts in progress, transfers in transit, uninvoiced receipt lines and draft orders (informational;
it does not block closing). Fiscal years are calendar years; the next one is created automatically when a
posting needs it (never more than one year ahead) or with `POST /accounting/fiscal-years/next`.

**Test fixes found by the second order:** the fixtures did not fill `supplier_payment_allocations` (and payments
and returns), so the RLS "every table has data" check only passed when the purchasing suite ran first — tenant
B's fixture purchase now includes a return and a part payment. A sync pull test assumed no other suite deletes
tenant-B rows; it now checks only the core catalog types.

### 1.15 Phase 6a known gaps
- ~~**No accounting screens**~~: added in Phase 6b (§1.17).
- **No draft journal entries.** Manual entries post at once; there is no draft/approve step or maker-checker rule.
- **Calendar fiscal years only.** A tenant whose year does not start in January is not supported.
- **Balance sheet and cash flow are tenant-wide.** Only the profit and loss can be filtered by branch.
- **Cash flow classification is coarse:** equity accounts are financing, `fixed_asset` accounts investing,
  everything else operating. The default chart has no fixed-asset accounts yet.
- **Reconciliation gaps:** payments per method vs clearing accounts, cash sessions vs drawer account and
  AR are not checked yet (doc 07 §7). Payables, GRNI and inventory are compared as of now, not for the range.
- **Year close cannot be undone.** A closed year has no reopen path (by design here; an accountant may want one).
- **Soft-closed periods block late POS sales.** Like closed ones, they send synced sales to the next open
  period; doc 07 only requires that for closed periods. To be confirmed by the accountant.

### 1.16 Fixes from the Phase 6a review
Verified on 2026-10-31 (`npm test`: 73 unit + 124 integration tests, 15 suites, passing in the default and in
alphabetical order; new `write-safety` suite has 5 tests). Also checked by hand: the dashboard's adjustment
form posts with its key (201).

1. **Back-office writes could be applied twice** (found in review; present since Phase 5a). A resent request —
   double submit, or a retry after a lost response — posted a second journal entry, payment, receipt and so
   on. Doc 02 requires an `Idempotency-Key`. Now every financial write requires it (400
   `idempotency.keyRequired` otherwise): stock adjustments, count approval, transfer dispatch and receipt,
   goods receipts, supplier invoices, payments and returns, manual journal entries, reversals and year close.
   The key is stored **in the same transaction** as the change, with the response; a repeat (also a
   concurrent one) returns that response with `Idempotent-Replayed: true`, the same key with a different
   request is 422 `idempotency.keyReused`, and a failed request leaves no key behind. Keys are per user. The
   dashboard keeps one key per form until the write succeeds.
2. **A period could be closed underneath an entry being posted into it.** The closed-period check read the
   status without a lock. The posting service now share-locks the chosen period until commit (choosing again
   if a close committed first) and the database trigger takes the same lock, so a close waits for in-flight
   entries. The new test holds an entry open and shows the status change waiting for it. It was **not** run
   against the code before the fix.

Still open:
- Doc 02 says *every* mutating endpoint accepts `Idempotency-Key`; only the financial ones above use it. On
  other writes (items, suppliers, orders, settings…) the header is ignored.
- Stored keys never expire (`expires_at` is not set or cleaned up).
- A route marked idempotent must make its change in the request's first tenant transaction (true for all
  routes above; a new route must keep it so).
- From the review, not fixed: seeded periods before a tenant's start month must each be closed before the
  first real one; read endpoints of the ledger (journal list/detail, trial balance, fiscal years, checklist)
  do not require all-branch access (only roles with `accounting.view`, none of them branch-scoped by
  default).

### 1.17 Phase 6b (bank reconciliation and accounting screens)
Verified on 2026-10-31 (`npm test`: 73 unit + 128 integration tests, 16 suites, passing in the default and in
alphabetical order; new `bank` suite has 4 tests; `npm run build -w @ros/web` passes).

**Bank reconciliation (P6-7).**
- **Import.** A statement is imported as the bank printed it: signed lines, which must lead from the opening
  to the closing balance. Only bank and clearing accounts can be used (clearing accounts cover card and
  wallet settlements). The dashboard reads the lines from pasted CSV.
- **Matching.** Each bank line is matched to one posted journal line on the same account, for the same signed
  amount (a database trigger checks this). A journal line can be matched only once, across all statements.
- **Auto-match.** It pairs a line only when exactly one free journal line has that amount within ±3 days.
  Ambiguous lines are left to the user.
- **Bank-only lines** (fees, interest) are posted from the statement against a chosen account and matched in
  one step.
- **Completing** needs every bank line matched. The statement and its lines are then frozen by a trigger.
- **Visibility.** Unmatched bank lines and unmatched journal lines stay visible.
- **Summary.** It compares the ledger balance minus outstanding book lines plus unrecorded bank lines with the
  printed closing balance. It is informational: book lines from before the first imported statement always
  count as outstanding.
- New default account **5500 Bank charges** (added to existing tenants by the account sync).

**Accounting screens (Arabic/English).** The Accounting section now has these tabs:
- **Trial balance.**
- **Journal:** list with date filter; entry detail; manual entry with a live debit/credit check (posting is
  disabled until balanced); reversal of manual entries.
- **Periods:** soft-close, close, and reopen with a reason; checklist; open next year; close year.
- **Financial statements:** P&L with optional branch, balance sheet, cash flow, general ledger.
- **Reconciliation:** the seven checks.
- **Bank reconciliation:** import, auto-match, manual match and unmatch, post-and-match, complete.

Financial forms send an Idempotency-Key (also new for bank import and post-line).

**Checked by hand in the browser** on the dev database, in Arabic:
- the journal list, periods, P&L and reconciliation pages render with correct figures;
- a bank statement for account 1150 (a supplier transfer of −1,000 and a fee of −15) was imported, the
  transfer auto-matched, the fee posted and matched, and the statement completed with a zero difference;
- an unbalanced manual entry kept "post" disabled; the balanced one posted, was reversed, and the original
  showed "reversed by".

Two UI bugs found and fixed in that run:
- Detail pages kept form state when moving to another document (reversal fields, receive and return
  quantities). They now reset per document.
- The statement import defaulted to the card clearing account; bank accounts now come first.

**Known gaps**
- **Bank lines can't be split or grouped.** A deposit of three sales or one transfer paying two invoices
  needs one journal line of the same amount.
- **Import formats.** Only pasted CSV in one format (date, description, amount, reference); no OFX/MT940,
  no file upload.
- **A completed reconciliation cannot be reopened**, and no check stops one statement overlapping another.
- **Re-posting a bank line after unmatching it** fails: its entry already exists (the entry's id comes from
  the line). Match the line to that entry instead.
- **The periods screen** shows every year at once with no paging. The checklist only informs; it does not
  block closing.
- **No automated UI tests**; the screens were checked by hand as above.

### 1.18 Phase 7a (kitchen display, P7-5)
Verified on 2026-11-01 (`npm test`: 73 unit + 134 integration tests, 17 suites, passing in the default and in
alphabetical order; new `kitchen` suite has 6 tests; the `dine-in` suite now also checks the kitchen
tickets created by two real POS tills through sync).

| Item | Status |
|---|---|
| POS: "send to kitchen" queues `kitchen.fired` with the items, modifiers and a label (table, or channel + short ref), in the same atomic batch that marks them sent; voiding a sent item queues `kitchen.voided` | Passing (`pos-core` dine-in test) |
| Server: one ticket per station, routed by product category per branch; unrouted or unknown items go to the branch's default station (created on first use as "Kitchen") | Passing |
| Ticket numbers per branch per business day; a replayed firing creates nothing new | Passing |
| States new → preparing → ready → served, ready → preparing (recall), new → ready; optimistic (`from` must match, else 409); final states frozen by a trigger | Passing |
| Every change recorded in an append-only event table with its actor (device or user) | Passing (UPDATE/DELETE denied) |
| Elapsed time per ticket; delayed after the station's threshold while new or preparing | Passing |
| Voided items struck through; a ticket with no live items cancelled; `order.cancelled` cancels open tickets; a firing arriving after its order's cancellation is filed cancelled | Passing |
| Branch scope (stations, tickets); kitchen staff list their branches via `/kitchen/branches`; IDOR on all new routes | Passing |
| Screens: kitchen display (station filter, in-progress/done, big touch buttons, one-second timers, 5-second polling) and station set-up (code, names, delay minutes, default, categories) | Checked by hand in Arabic on the dev database: two fired orders (one 12 minutes old shown delayed), start → ready → served, done view, creating a station with a category |

Design note: routing is by **product category** per branch, not by individual product as data dictionary §7
describes (`product_station_routes`); it needs far less set-up. Per-product overrides are not built.

### 1.19 Phase 7a known gaps
- **Online only.** The kitchen screen polls the cloud every 5 s; with the internet down it shows nothing new
  (kitchen *printing* still works offline). No LAN mode, no push (websocket) updates.
- **Ticket-level states only.** Items cannot be marked done one by one; there are no courses (fire/hold).
- **Orders moved between tables** keep their old ticket label; items moved by a merge or split keep their
  original tickets, and a later void of a moved item is not reflected on the screen.
- **Timers use the device's fire time** (capped at the server's clock); a POS with a wrong clock shows wrong
  elapsed times.
- **No sound or bump-bar support**, no all-day item count, no printed station tickets.
- Station set-up needs `catalog.manage`; ticket moves need `kitchen.update` (kitchen role).

### 1.20 Browser POS look, category pictures and the My Corner menu
- **Browser POS (`apps/pos`)**: side rail, menu tiles with category pictures (or a coloured initial), cart with
  quantity merging (a repeat tap on an unsent, undiscounted line with the same options raises its quantity),
  quick cash amounts with change shown, Arabic receipt in the branch's time zone (browser print only; the
  ESC/POS text stays English). Tested by pos-core unit tests and by hand in the browser.
- **Category pictures**: `categories.image`, a data URL (SVG/PNG/JPEG/WebP, ≤ ~256 KB, checked in the database
  and the API), set on create or with `PATCH /catalog/categories/:id`, synced to the till and shown on its
  items' tiles. Pictures are per category, not per product.
- **My Corner menu**: `npm run db:import-menu` (apps/api, dev only) creates the restaurant `my-corner` with its 4
  branches, 20 sections, 187 items and till staff from `prisma/menus/my-corner.ts`. Sized items (pizza,
  feteer) are one product with a required «الحجم» choice: medium at the base price, large at +difference.
  Section pictures are original drawings (`prisma/menus/illustrations.ts`), not photos of the dishes.

Known gaps: no picture upload screen in the dashboard yet (API only); no per-product pictures; the menu PDF's
item descriptions (pizza and feteer fillings) were not imported, as products have no description field.

### 1.21 Tables screen (web dashboard)
- **Dashboard → الطاولات / Tables** (`setup.branches.view` to see, `setup.branches.manage` to change): per
  branch, tables grouped by area; add one table or a numbered range (prefix + from/to, at most 100 at once,
  one request per table, stops at the first failure and names it); rename, change seats, move to another area
  (found or created by name), stop and resume using a table. New API: `PATCH /tables/:id`.
- **Tables are stopped, never deleted** (orders and invoices point at them). On the till a stopped table
  disappears from the floor plan unless it still has an open order (it stays until that order is paid or
  moved), new orders cannot be opened on it, and areas with no table in use are hidden.
- Tested: API (duplicate name, area named in both languages, stop), cross-tenant check, pos-core unit test,
  and by hand in the browser (range add into a new area, stop, rename, duplicate refused, till after sync).

Known gaps: no drag-and-drop floor layout, no area ordering or renaming, no table merge/split in the
dashboard (the till does those).

## 2. Design limitations (accepted)
- No real-time stock coordination between disconnected branches/devices; negative stock possible (ADR-0011).
- Device revocation, price changes and permission changes reach an offline device only on its next sync;
  maximum exposure = license lease period (default 7 days, configurable down to 1 day).
- Late-synced sales are costed at server processing time, not at `occurred_at` (A3).
- Late-synced sales for a closed period post into the first open period (`late_posting`).
- Offline over-redemption of coupons/loyalty points is possible and flagged.
- Open orders are device-local until LAN sync (later); a table's open order cannot move between devices offline.
- Receipt numbering is per device, not gap-free per tenant (A4).
- One base currency per tenant; no foreign-currency tender or revaluation in MVP.
- Payroll statutory calculations are not implemented (entered amounts only).
- KDS requires connectivity to the cloud in MVP; kitchen *printing* works offline.
- FIFO valuation designed, not built.
- Daily-summary posting granularity reserved, not built.

## 3. Open questions for the product owner
| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Must Egypt ETA e-receipt be supported at launch? Which tenants (by turnover) are in scope? | Adapter interface only; launch blocked for in-scope tenants |
| Q2 | Should POS refuse sales when local stock estimate is ≤ 0 for tenants that disallow negative stock? | No — sell and flag |
| Q3 | Is a central gap-free invoice number required by any target market? | No |
| Q4 | Payment gateway for SaaS billing (Paymob, Fawry, Stripe, …)? | Adapter + manual "mark as paid" by operator |
| Q5 | Retention periods per country for financial records and customer data | Egypt: 5 years financial (to confirm with counsel); customer PII until erasure request or 2 years inactivity |
| Q6 | Is service charge restaurant revenue or a staff liability? | Revenue (mapping can change it) |
| Q7 | Reference POS hardware and printer models to certify | Celeron N4020/4 GB; Epson TM-T20/T88 and common Xprinter 80 mm (ESC/POS) |
| Q8 | Hosting region and data-residency requirements | Single region (EU-central or Middle East), documented per tenant |
| Q9 | Should the operator console be able to write tenant data during support, or read-only? | Read-only by default; write requires a second operator's approval |
| Q10 | Plans and limits (branches/devices/users per plan) | Starter 1/2/5, Growth 3/10/25, Chain unlimited — placeholders |

## 4. Documentation still to come
- `10-operations.md` — backup, restore, monitoring, alerting, incident runbooks (Phase 2 skeleton, Phase 8 complete).
- `11-deployment.md` — environments, CI/CD, release and POS update procedure (Phase 2).
- OpenAPI spec — generated from code (Phase 2+).
