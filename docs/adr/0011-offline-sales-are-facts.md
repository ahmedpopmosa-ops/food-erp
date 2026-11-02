# ADR-0011 — Offline sales are accepted as facts and flagged, never rejected for business drift

**Status:** Proposed

## Context
When a sale reaches the server, the customer has already paid and left. The catalog, prices or stock may
have changed since the device last pulled.

## Decision
- The server validates **structure and authority** (schema, device, tenant, branch, employee permission at
  `occurred_at` according to the device's catalog/permission snapshot version). Failures there are permanent
  rejections that need human action (and are quarantined, not deleted).
- **Business drift is not a rejection reason**: outdated price, discontinued product, insufficient stock,
  tax rate changed. The sale is recorded exactly as sold (historical snapshot), and a `sale_discrepancies`
  row is written (`price_outdated`, `product_inactive`, `negative_stock`, `totals_mismatch`, `late_posting`)
  for manager review.
- Negative stock is allowed by default (tenant setting); a disallowing tenant gets local stock estimates on
  the POS but the server still records synced sales and flags them.

## Consequences
- Money and records are never out of sync with reality.
- Managers need a discrepancy review screen (Phase 4) and reports that show flagged sales.
