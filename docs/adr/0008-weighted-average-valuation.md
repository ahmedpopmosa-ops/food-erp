# ADR-0008 — Perpetual weighted-average valuation first, FIFO behind a policy interface

**Status:** Proposed

## Decision
- `ValuationPolicy` interface with `receive(balance, qty, unitCost)` and `issue(balance, qty) → cost`.
- MVP implements **perpetual weighted average per (item, warehouse)**: on receipt,
  `avg = (value + qty_in × cost) / (qty + qty_in)`; issues are costed at the current `avg`.
- When quantity on hand is ≤ 0 (negative stock allowed, ADR-0011), issues use the **last known average
  cost**, falling back to the item's standard cost; a receipt into negative stock first settles the negative
  quantity and books the cost difference to `inventory_price_variance`.
- FIFO (`stock_layers` table consumed oldest first) is designed but not built until a tenant needs it. The
  policy is set per tenant and **cannot be changed** once movements exist, except at a fiscal year start with
  a documented revaluation entry.
- Movements are never updated. Corrections are new movements.

## Consequences
Simple, predictable costs. Late-synced sales are costed at processing time (assumption A3) — documented
as a known limitation.
