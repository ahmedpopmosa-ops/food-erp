# ADR-0001 — Modular monolith with facade boundaries

**Status:** Proposed

## Context
Thirteen business domains share one database and need atomic cross-domain effects (a sale changes
orders, stock and the ledger at once). The team is small; operational overhead must be low.

## Decision
One NestJS application (`apps/api`) deployed as two processes (HTTP API, background worker). Each domain
is a Nest module with a single public facade. Modules may not import each other's repositories or query
each other's tables; an ESLint `boundaries` rule fails CI on violations. Cross-domain atomic work is a
facade call inside a shared transaction (`TenantTx` passed explicitly).

## Consequences
- Atomic cross-domain transactions without distributed sagas.
- A module can be extracted later because its interface is already explicit; nothing is extracted until a
  measured need (scaling, team ownership) exists.
- Risk: the shared transaction couples modules at runtime; mitigated by keeping facades narrow and tested.
