# ADR-0012 — POS core in TypeScript behind an atomic-batch storage driver

**Status:** Accepted (Phase 3) · **Amends:** ADR-0004, architecture §6

## Context
ADR-0004 and architecture §6 placed the outbox, sync loop and SQLite access in the Tauri **Rust** core.
The development machine has no Rust toolchain or MSVC build tools, so a Tauri binary cannot be built yet.
Separately, the order-total and tax rules already live in TypeScript (`packages/domain`) and must give the
same result on the POS and the server.

## Decision
- The POS business logic — local schema and migrations, orders, finalize, outbox, receipt rendering, pull
  and push — is the TypeScript package `packages/pos-core`.
- It touches storage only through `SqlDriver`: `all(sql, params)` for reads and `batch(statements)` for
  writes. Every write is an atomic batch (`BEGIN IMMEDIATE … COMMIT`), optionally guarded by
  `expectChanges` (used for gap-free per-device sequence numbers).
- Drivers:
  - `NodeSqliteDriver` (Node's built-in `node:sqlite`, WAL, `synchronous=FULL`) — development, tests, and the
    headless POS used in the end-to-end slice. Available now.
  - Tauri driver — a Rust command executing one batch in one rusqlite transaction with the same pragmas.
    **Not built yet**; requires Rust (Phase 4).
- Rust keeps the parts that need native access: the SQLite file, printing (ESC/POS over USB/TCP), Windows
  Credential Manager, auto-update.

## Consequences
- Business rules are shared and unit-tested in one language; the Rust layer stays small.
- No read-modify-write transaction can span an `await`; the core reads first, then commits a guarded batch,
  and serialises its own writers. Guards make a concurrent writer fail loudly instead of corrupting numbers.
- The Phase 3 slice is verified with the Node driver. Durability of the Tauri driver must be re-verified when
  it exists (Phase 4 kill-during-write tests, acceptance P4-6).
