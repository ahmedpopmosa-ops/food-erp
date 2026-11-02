# ADR-0004 — Offline-first POS: SQLite + transactional outbox + idempotent push

**Status:** Proposed

## Context
Restaurant internet is unreliable. Selling must never wait for the cloud, and a completed sale must never
be lost or duplicated, including across crashes, power loss and lost acknowledgements.

## Decision
- The POS writes every business fact (sale finalized, refund issued, cash movement, session closed, …)
  **and** a corresponding row in `outbox` in the same SQLite transaction. The UI reports success only after
  COMMIT returns with `synchronous=FULL`.
- A background sync task sends outbox rows in local-sequence order to `POST /v1/sync/push`. Each op carries
  a client-generated `operation_id` (UUIDv7). The server enforces uniqueness of `(tenant_id, operation_id)`
  in `idempotency_keys` inside the processing transaction and returns the stored result on repeats.
- Push semantics: per-operation results; a rejected op does not block others **unless** a later op depends
  on it (`depends_on` field), in which case dependants are held as `blocked`.
- Pull: `GET /v1/sync/pull?cursor=` returns reference data changes (catalog, prices, taxes, users' PIN
  hashes, settings) from a per-tenant monotonically increasing `change_seq`.
- Full protocol: [`../06-sync-protocol.md`](../06-sync-protocol.md).

## Consequences
- At-least-once delivery + idempotent processing = exactly-once effect.
- Ops are **commands describing facts**, not row replication. No last-write-wins for financial or stock data.
- The server must keep handlers for old `schema_version`s for as long as devices may run old builds
  (support window: current and previous two POS minor versions).
