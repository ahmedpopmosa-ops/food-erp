# 10 — Deployment (Phase 2 skeleton)

Status: written for the Phase 2 API only. Backup/restore drills, monitoring dashboards and incident runbooks are
Phase 8 work and are **not** done yet.

## 1. Environments
| Env | Database | Notes |
|---|---|---|
| dev | embedded PostgreSQL (`npm run db:local`) or `docker compose up -d postgres`, port 5433 | `apps/api/.env` from `.env.example` |
| test | `restaurant_os_test` on the same server | `apps/api/test/env.ts` forces it; CI overrides with `TEST_DATABASE_URL` |
| staging / production | managed PostgreSQL 16 with PITR | configuration only through real environment variables / secret manager |

## 2. Database roles
| Role | Used by | Rights |
|---|---|---|
| owner (`postgres` locally, a dedicated owner role in production) | `db:migrate` release step, permission sync, dev seed | DDL |
| `ros_app` | API and (later) worker | DML only, `NOBYPASSRLS`, no access to `_prisma_migrations`, no UPDATE/DELETE on audit tables, no writes to `permissions` |

`DATABASE_URL` (app) and `DATABASE_OWNER_URL` (owner) must be different roles in every environment.
The app role is created outside migrations (`scripts/local-db.mjs`, `infra/postgres/init.sh`, or the platform's
user management); migrations only create it as `NOLOGIN` if missing and grant privileges.

## 3. Release procedure (API)
1. Build the image: `docker build -f infra/api.Dockerfile -t restaurant-os-api:<version> .`
2. Run migrations with the owner role (one-off job, same image):
   `DATABASE_OWNER_URL=… npm run db:migrate -w @ros/api` — applies `prisma migrate deploy` then syncs the
   permission catalog. Migrations are forward-only; a bad migration is fixed by a new migration.
3. Roll out the API containers (`node apps/api/dist/src/main.js`). Readiness probe: `GET /api/health/ready`,
   liveness: `GET /api/health/live`.
4. Startup refuses invalid configuration. In production it also refuses `MAIL_TRANSPORT=log` (no real mail adapter
   exists yet) and `COOKIE_SECURE=false` — production deployment is therefore **blocked until a mail adapter is
   implemented**.

## 4. CI (`.github/workflows/ci.yml`)
Lint, format check, typecheck, unit + integration tests against a PostgreSQL 16 service with a real `ros_app` role,
schema/migration drift check, OpenAPI export as an artifact, Docker image build.
**Not yet run**: this machine has no git or GitHub remote, so the workflow has only been written, not executed.
The Docker image build has also not been executed (Docker is not installed here).
