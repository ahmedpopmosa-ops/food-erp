# 06 — Offline Synchronization Protocol (v1)

Status: **Phase 1 draft**. Contract schemas will live in `packages/contracts/sync/` (Zod) and be published in
OpenAPI. Protocol version: `sync/1`. Each operation type has its own `schema_version` (integer).

## 1. Principles
1. **Operations are facts/commands, not row replication.** The device says "sale finalized with this content";
   the server derives invoices, stock and ledger effects.
2. **At-least-once delivery + idempotent processing** = exactly-once effect.
3. **Push is per-operation transactional**; a batch is just transport.
4. **No last-write-wins** for invoices, payments, refunds, cash, stock movements or journals. Those records
   are append-only facts; conflicts are surfaced as discrepancies.
5. **Pull is server-authoritative reference data**, applied whole-page atomically on the device.

## 2. Authentication
`Authorization: Bearer <device access token>`. The server resolves `tenant_id`, `branch_id`, `device_id`,
`device.status` and subscription state from the token. **Any tenant/branch/device ids inside the payload must
equal the token's** or the op is rejected `scope_mismatch` (permanent).

## 3. Push
`POST /v1/sync/push`
```json
{
  "protocol": "sync/1",
  "batch_id": "0192f0c4-…",            // UUIDv7, device-generated, reused on retry of the same batch
  "device_time": "2026-10-29T12:00:00.000Z",
  "client": { "app_version": "1.4.2", "local_schema_version": 7 },
  "operations": [
    {
      "operation_id": "0192f0c4-7b1e-7c3a-…",   // UUIDv7, unique forever
      "tenant_id": "…", "branch_id": "…", "device_id": "…",
      "operation_type": "sale.finalized",
      "schema_version": 1,
      "occurred_at": "2026-10-29T11:58:03.120Z",
      "local_seq": 1842,
      "depends_on": ["0192f0b9-…"],             // e.g. cash_session.opened
      "refs": { "catalog_version": 311, "permission_version": 42, "entity": { "type": "invoice", "id": "…" } },
      "payload": { … }                           // schema per operation_type@schema_version
    }
  ]
}
```
Limits: ≤ 200 ops and ≤ 1 MB per request (413 otherwise). `Content-Encoding: gzip` accepted.

### Response (always 200 when the batch was parsed; per-op status)
```json
{
  "batch_id": "…",
  "server_time": "2026-10-29T12:00:01.020Z",
  "results": [
    { "operation_id": "…", "status": "accepted",          "server_refs": { "invoice_id": "…", "journal_entry_id": "…" } },
    { "operation_id": "…", "status": "already_processed", "server_refs": { … } },
    { "operation_id": "…", "status": "retryable",         "error": { "code": "lock_timeout" }, "retry_after_ms": 5000 },
    { "operation_id": "…", "status": "rejected",          "error": { "code": "payload_invalid", "details": [ … ] } },
    { "operation_id": "…", "status": "blocked",           "error": { "code": "dependency_rejected", "operation_id": "…" } }
  ],
  "lease": { "payload": "…", "signature": "…" }       // renewed license lease when due
}
```
Whole-request errors: `401 device_token_invalid`, `403 device_disabled`, `402 subscription_suspended`
(ops are **not** processed, device keeps them), `426 client_upgrade_required` (app below minimum),
`429 rate_limited`, `5xx` (device retries the whole batch; per-op idempotency makes this safe).

### Status semantics on the device
| Status | Device action |
|---|---|
| `accepted`, `already_processed` | Mark outbox row `acked`, store `server_refs` |
| `retryable` | Keep `pending`, backoff (`retry_after_ms` or exponential with jitter) |
| `rejected` | Mark `rejected`, show on Sync screen, require manager action (export/notes); never auto-deleted |
| `blocked` | Mark `blocked`; becomes pending again when its dependency is resolved by an operator fix |

## 4. Server processing algorithm (per operation)
```
validate envelope (Zod)                         → rejected: payload_invalid
check scope (token vs payload ids)              → rejected: scope_mismatch
check operation_type allowed for device kind    → rejected: operation_not_allowed
check schema_version supported                  → rejected: schema_version_unsupported
canonical payload hash = sha256(JCS(payload))
BEGIN (withTenant)
  INSERT idempotency_keys(scope='sync', key=operation_id, request_hash, status='in_progress')
    ON CONFLICT DO NOTHING
  if conflict:
     row = SELECT … FOR UPDATE (waits if a concurrent request is processing it)
     if row.request_hash ≠ hash      → ROLLBACK; rejected: idempotency_key_reused
     if row.status = 'completed'     → ROLLBACK; already_processed + row.resource_refs
  check depends_on all accepted/already_processed → else blocked / retryable (if not yet received)
  handler = registry[operation_type][schema_version]
  refs = handler.apply(tx, op)        // domain facades: sales, inventory, accounting, audit
  UPDATE idempotency_keys SET status='completed', resource_refs=refs
  UPSERT sync_operations (status='accepted', server_refs=refs)
COMMIT
on serialization/deadlock/lock timeout → retry ≤3 internally, then retryable
on domain error marked permanent (e.g. id_conflict) → separate tx records sync_operations rejected
```
`sync_operations` and `sync_batches` rows are written for diagnostics; the source of truth for "processed" is
`idempotency_keys` inside the business transaction, so a crash between commit and response is safe.

Operations from one device are processed **in `local_seq` order** within a batch. Across devices there is no
ordering guarantee; handlers must be commutative with respect to other devices' ops (they are, because each
op creates its own facts).

## 5. Operation types (v1)
| operation_type | Creates on server | Depends on |
|---|---|---|
| `cash_session.opened` | cash_session | — |
| `cash_movement.recorded` | cash_movement + journal | cash_session.opened |
| `sale.finalized` | order (+items, modifiers, adjustments), invoice (+lines, taxes), payments, stock movements, journal entry, kitchen archive, loyalty earn, discrepancies | cash_session.opened (if cash) |
| `order.cancelled` | order (cancelled) + void records + wastage movements for items sent to kitchen (configurable) | — |
| `payment.recorded` | payment against an existing invoice (settling on-account) + journal | sale.finalized |
| `refund.issued` | refund + lines + payment out + optional stock return + journal | sale.finalized |
| `cash_session.closed` | session close, variance journal | all ops of the session |
| `attendance.clocked` | attendance record | — |
| `approval.recorded` | approval (if not embedded in the op it authorizes) | — |
| `kitchen.fired` (v1, Phase 7a) | one kitchen ticket per station (category routes, else the branch's default station), ticket items, `new` event | — (never rejected on content, so it cannot block later operations) |
| `kitchen.voided` (v1, Phase 7a) | void stamp on the ticket item; a ticket with no live items is cancelled; unknown items are a no-op | — |
| `kitchen.state_changed` | kitchen ticket event from a device (when KDS offline mode lands; today states change online via the dashboard) | sale/order op |

Open orders (not finalized) are **not** synced as financial facts in v1; they stay local. A device crash
before finalization keeps them in SQLite. (Cross-device open-order sharing is a later LAN feature.)

## 6. Pull
`GET /v1/sync/pull?cursor=<change_seq>&limit=500`
```json
{ "cursor": 98123, "next_cursor": 98623, "has_more": true,
  "catalog_version": 311, "permission_version": 42,
  "changes": [ { "entity_type": "product_price", "op": "upsert", "id": "…", "data": { … } },
               { "entity_type": "modifier",      "op": "delete", "id": "…" } ] }
```
- Changes come from `change_log` filtered to the device's tenant and (branch-specific entities) its branch.
- Device applies a page in one SQLite transaction and stores `next_cursor` in the same transaction → resumable.
- `cursor=0` or `410 cursor_expired` (change_log pruned beyond retention) → full snapshot: `GET /v1/sync/snapshot`
  streamed per entity type; device swaps reference tables atomically.
- Entities: branch, settings, tables, categories, products, variants, prices (current + future-dated so scheduled
  changes apply offline at `valid_from`), modifiers, routes, tax rates/categories, payment methods, receipt
  template, employees (POS fields + PIN hash + permissions), promotions/coupons, device config.

## 7. Failure scenarios
| Scenario | Behaviour |
|---|---|
| Multiple devices offline in a branch | Each device has its own sequences (`BR1-D02-…`), ids and cash session. On reconnect all facts are accepted; nothing is merged. Shared resources (tables) conflicts → `table_conflict` discrepancy only |
| Duplicate delivery of a batch | Same `operation_id`s → `already_processed` with the original `server_refs` |
| Network loss during upload | Device did not get a response → retries the same batch; server either never saw it (processes) or processed some ops (returns `already_processed` for those) |
| Ack lost after server commit | Identical to above; device marks acked when `already_processed` arrives |
| Local crash mid-finalize | SQLite transaction not committed → sale not shown as completed; UI restores the open order from local state. Committed → outbox row exists and will sync |
| Crash between print and commit | Printing happens **after** commit, from the committed record. Unprinted committed receipts are re-queued from `print_jobs` on restart |
| Outdated catalog version | Sale accepted with its snapshot prices; `price_outdated` discrepancy if the price differs from the price valid at `occurred_at` for that branch/channel |
| Product deleted/archived meanwhile | Accepted; `product_inactive` discrepancy. Variant ids are never hard-deleted |
| Employee permission revoked meanwhile | Accepted if permitted under the device's `permission_version` at `occurred_at`; `permission_outdated` discrepancy |
| Disabled device | Push → `403 device_disabled`; ops remain on the device; manager can export an encrypted ops file and an admin imports it via `POST /v1/sync/import` (audited), after which normal idempotency applies |
| Subscription suspended | `402`; POS stops new sales when lease expires; queued ops accepted after reactivation |
| Expired lease while offline | POS enters "no new sales" mode; can still print reprints, close session, sync |
| Permanent validation error | `rejected` + `sync_operations.status = quarantined` server-side with payload kept; operator/manager fixes data (e.g. adds missing account mapping) and requests reprocessing (`POST /v1/sync/operations/{id}/retry`) — same idempotency key |
| Server-side mapping missing (e.g. no revenue account) | `rejected` with `posting_mapping_missing`, marked **retryable after fix**; device keeps it pending with long backoff (1 h) instead of terminal reject |
| Clock skew on device | `occurred_at` stored as reported; `received_at` server time; skew > 5 min recorded in `device_sync_state.clock_skew_ms` and surfaced; business date derived from `occurred_at` in branch timezone unless skew > 24 h, then server date + discrepancy |
| Closed accounting period | Sale posted with `entry_date` = first open period date, `original_date` = sale date, `late_posting` discrepancy |
| Local schema upgrade with pending ops | Migration runs in a transaction after file backup; outbox payloads are immutable JSON with their own `schema_version`, so old ops are sent as-is and the server keeps handlers for older versions |

## 8. Limitations of disconnected operation (by design)
- **No real-time cross-branch or cross-device stock coordination while offline.** Two branches may both sell
  the last portion; the system records both and shows negative stock.
- Single-use coupons and loyalty redemptions can be over-redeemed offline (flagged on sync).
- Device revocation and price changes take effect only on the device's next successful sync/pull.
- Open orders are device-local in v1: another POS cannot pick up a table's open order until LAN sync exists.
- Server-side reports lag by the device's unsynced backlog; the dashboard shows per-device "last synced" and
  pending count so managers know what is missing.

## 9. Diagnostics
- POS Sync screen: online state, last push/pull, pending/rejected/blocked counts, oldest pending age, per-op
  error codes (translated), "export diagnostics bundle" (redacted DB extract + logs, encrypted for support).
- Server: `/v1/admin/sync/failures` (operator), tenant dashboard device health page, metrics
  `sync_ops_total{status}`, `sync_lag_seconds`, `sync_batch_duration_ms`.
