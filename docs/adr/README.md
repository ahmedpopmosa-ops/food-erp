# Architecture Decision Records

Format: context → decision → consequences. Status is `Proposed` until the Phase 1 review, then `Accepted`.
A superseded ADR is never edited; a new ADR supersedes it.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith with facade boundaries | Proposed |
| [0002](0002-shared-schema-tenancy-rls.md) | Shared-schema multi-tenancy with PostgreSQL RLS | Proposed |
| [0003](0003-prisma-with-raw-sql-migrations.md) | Prisma ORM with hand-written SQL for RLS, triggers and checks | Proposed |
| [0004](0004-offline-first-pos-outbox.md) | Offline-first POS: SQLite + transactional outbox + idempotent push | Proposed |
| [0005](0005-client-generated-ids.md) | Client-generated UUIDv7 ids and derived child ids | Proposed |
| [0006](0006-money-and-decimal.md) | Money as NUMERIC + decimal library; no floats anywhere | Proposed |
| [0007](0007-synchronous-posting.md) | Accounting and stock effects posted in the same transaction as the source document | Proposed |
| [0008](0008-weighted-average-valuation.md) | Perpetual weighted-average valuation first, FIFO behind a policy interface | Proposed |
| [0009](0009-sessions-and-device-auth.md) | Opaque sessions for people, rotating tokens + signed license lease for devices | Proposed |
| [0010](0010-react-vite-separate-admin.md) | React + Vite web apps; operator console as a separate app and origin | Proposed |
| [0011](0011-offline-sales-are-facts.md) | Offline sales are accepted as facts and flagged, never rejected for business drift | Proposed |
| [0012](0012-pos-core-in-typescript.md) | POS core in TypeScript behind an atomic-batch storage driver (amends 0004) | Accepted |
| [0013](0013-pos-pins-and-lease-keys.md) | POS PINs with PBKDF2 (WebCrypto) and Ed25519 lease keys (amends 0009) | Accepted |
