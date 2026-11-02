# ADR-0007 — Accounting and stock effects posted in the same transaction as the source document

**Status:** Proposed

## Context
"Sale completion and its related financial posting must be consistent and recoverable." Options:
(a) post synchronously in the same DB transaction; (b) emit an event and post asynchronously.

## Decision
(a) for every financial document: the stock movements and the journal entry are created by facade calls in
the same transaction that records the document. If posting cannot succeed (missing mapping, closed period
for a manual document), the transaction rolls back and the caller gets a precise error.
Per-sale journal entries are created initially. A tenant setting `posting_granularity = per_document |
daily_summary` is reserved; daily summary (one entry per branch per business date per mapping) would be
produced by a job that posts and **links** the source documents, and is not implemented in the MVP.

## Consequences
- There is never a "sale without its journal entry" state to reconcile.
- Sync ingestion is heavier per op; measured in Phase 8 against the burst target.
- Volume: ~1 entry with 4–8 lines per sale. At 1,000 sales/day/branch this is acceptable for PostgreSQL;
  partitioning `journal_lines` by `entry_date` is planned when a tenant exceeds 50 M lines.
