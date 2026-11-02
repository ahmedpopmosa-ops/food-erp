# RestaurantOS

Multi-tenant SaaS restaurant management: offline-first POS, restaurant web dashboard, kitchen display,
inventory and recipes, purchasing, full double-entry accounting, and an operator console API, on a NestJS +
PostgreSQL backend. Arabic (RTL) first, English supported. Defaults: EGP, Africa/Cairo — both configurable.

**Status:** phases 2–7a (foundation, POS sync, dine-in, inventory, purchasing, general ledger, bank reconciliation,
kitchen display) are implemented and tested locally. Employees/payroll, analytics, loyalty, SaaS billing, the
operator console UI and the Tauri POS shell are not started. See
[status and limitations](docs/09-known-limitations-and-open-questions.md).

## Repository

| Path                   | What                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `apps/api`             | NestJS 11 API, Prisma 6, SQL migrations with RLS, Jest integration tests     |
| `apps/web`             | Restaurant dashboard (React + Vite)                                          |
| `apps/pos`             | Browser POS: `pos-core` in the browser with SQLite in OPFS                   |
| `packages/contracts`   | Zod schemas, permission catalog, role templates — shared by all apps         |
| `packages/domain`      | Pure business rules: `Money` (decimal, no floats), tax, order totals, states |
| `packages/pos-core`    | Offline POS core: local schema, outbox, sync client, receipts                |
| `infra/`               | API Dockerfile, PostgreSQL init script                                       |
| `scripts/local-db.mjs` | Embedded PostgreSQL for machines without Docker                              |
| `docs/`                | Design documents and ADRs                                                    |

## Run locally

Requirements: Node 20+. Docker is optional.

```bash
npm install
```

1. **Database** — pick one (both listen on `localhost:5433` and create the restricted `ros_app` role):
   - No Docker: `npm run db:local` in its own terminal (real PostgreSQL binaries, data in `.data/pg`)
   - Docker: `docker compose up -d postgres`
2. **Config**: copy `apps/api/.env.example` to `apps/api/.env`.
3. **Build, migrate, seed, run**:

```bash
npm run build:packages
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

```bash
npm run dev:pos
```

Dashboard on http://localhost:5173 (proxies `/api` to the API on :4000) · API docs at `/api/docs` (non-production) ·
spec at `/api/openapi.json`. The development seed's local-only accounts are listed at the top of
[`apps/api/prisma/seed.ts`](apps/api/prisma/seed.ts). `npm run db:import-menu` (dev only) imports the My Corner menu.

## Quality checks

```bash
npm test
```

Builds the packages, runs their unit tests (contracts, domain, pos-core) and then the API integration suite against
the real `restaurant_os_test` database (requires the database to be running). The suite truncates that database on
start, so run one suite per database at a time; point `TEST_DATABASE_URL` / `TEST_DATABASE_OWNER_URL` elsewhere to
run in parallel. Also: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run openapi` (writes
`apps/api/openapi.json`).

## Security model in one paragraph

Opaque session tokens in httpOnly cookies (only SHA-256 stored), CSRF double-submit on writes, login rate limit and
account lockout, Argon2id. Every request goes through one `AccessGuard`: route must declare `@Public`,
`@Authenticated`, `@RequirePermissions` or `@PlatformAccess` (unclassified routes are denied). Tenant data is
reached only through `PrismaService.withTenant()`, which sets a transaction-local `app.tenant_id`; PostgreSQL RLS
(enabled and forced) plus same-tenant composite foreign keys enforce isolation under the non-superuser `ros_app`
role. Audit rows are written in the same transaction and are append-only. Details: [doc 05](docs/05-security-model.md).

## Documents

| #   | Document                                                                  | Contents                                                                         |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 01  | [Scope & requirements](docs/01-scope-and-requirements.md)                 | Product, personas, module scope, NFRs, performance targets, assumptions, phases  |
| 02  | [Architecture](docs/02-architecture.md)                                   | System context, repo layout, module rules, transaction boundaries, POS internals |
| —   | [ADRs](docs/adr/README.md)                                                | 13 technical decision records                                                    |
| 03  | [ER diagram](docs/03-er-diagram.md)                                       | Mermaid ER diagrams by domain                                                    |
| 04  | [Data dictionary](docs/04-data-dictionary.md)                             | Tables, columns, constraints, states, POS local schema                           |
| 05  | [Security model](docs/05-security-model.md)                               | Threats, controls, authorization, RLS, crypto, privacy, audit                    |
| 06  | [Sync protocol](docs/06-sync-protocol.md)                                 | Versioned push/pull contract, idempotency, failure scenarios                     |
| 07  | [Accounting & inventory rules](docs/07-accounting-and-inventory-rules.md) | Invariants, state machines, posting rules, valuation, reconciliation             |
| 08  | [Acceptance criteria](docs/08-acceptance-criteria.md)                     | Testable criteria per phase                                                      |
| 09  | [Limitations & status](docs/09-known-limitations-and-open-questions.md)   | Status per phase, accepted limitations, decisions needed                         |
| 10  | [Deployment](docs/10-deployment.md)                                       | Environments, database roles, migrations as a release step, CI                   |
| 11  | [Benchmark](docs/11-benchmark-foodics-class.md)                           | Feature comparison with established restaurant systems                           |
