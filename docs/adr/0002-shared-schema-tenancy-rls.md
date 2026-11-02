# ADR-0002 — Shared-schema multi-tenancy with PostgreSQL RLS

**Status:** Proposed

## Context
Many small tenants, a few large chains. Schema-per-tenant multiplies migrations and connections;
database-per-tenant is costly. A single missed `WHERE tenant_id = …` must not leak data.

## Decision
- One schema; every tenant-scoped table has `tenant_id uuid NOT NULL`.
- RLS `ENABLE` + `FORCE` with policy `tenant_isolation USING (tenant_id = app_tenant_id()) WITH CHECK (same)`,
  where `app_tenant_id()` reads the transaction-local GUC `app.tenant_id` and returns NULL when unset (→ no rows).
- The API connects as `ros_app` (NOSUPERUSER, NOBYPASSRLS). Every tenant query runs inside
  `withTenant(tenantId, tx => …)` which issues `set_config('app.tenant_id', $1, true)`. Transaction-local
  settings are safe with PgBouncer in transaction-pooling mode; tested in CI (acceptance P2-8).
- Child rows reference parents with **composite foreign keys** `(parent_id, tenant_id)` so a row can never
  point at another tenant's parent even if application code is wrong.
- Services still filter by `tenant_id` explicitly; RLS is the safety net.
- Platform tables (`plans`, `tenants`, `subscriptions`, …) have no tenant RLS; they are reachable only by
  the operator role path. Support access to tenant data uses an audited `support_sessions` row and the same
  `withTenant` helper — there is no BYPASSRLS role in the application.
- Large tenants can later be moved to a dedicated database with the same schema (routing by tenant).

## Consequences
- Strong isolation with one migration path. Cost: every query carries the GUC set; negligible.
- Reporting across tenants (operator usage metrics) uses a separate read-only role with explicit,
  aggregate-only views.
