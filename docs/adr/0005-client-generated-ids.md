# ADR-0005 — Client-generated UUIDv7 ids and derived child ids

**Status:** Proposed

## Context
Records created offline need identities before the server sees them, and those identities must be stable
across retries so the server can deduplicate and the POS can reference server records.

## Decision
- Root records created on a device (order, invoice, payment, refund, cash session, cash movement) get a
  **UUIDv7** generated on the device at creation time and stored with the record. The server uses the same
  value as primary key — there is no id remapping.
- Child records (order items, invoice lines, invoice taxes) get **UUIDv5(namespace = parent id, name = line
  key)** where the line key is a stable local line number. Re-sending the same payload always yields the same ids.
- Server-created derivative records (stock movements, journal entries for a sale) get UUIDv5 derived from
  `(operation_id, purpose, index)`, so re-processing after a crash in a retried transaction is deterministic.
- Human-readable numbers are separate: `<branch_code>-<device_code>-<seq>` from a per-device local sequence.
- The server rejects a root id already used by a **different** operation (`id_conflict`, permanent).

## Consequences
- UUIDv7 is time-ordered, so B-tree inserts stay efficient.
- Devices must have a sane clock only for ordering hints; correctness never depends on the clock.
