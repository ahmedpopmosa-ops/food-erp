# 05 — Security Model

Status: **Phase 1 draft**. Threat model is STRIDE-lite; each control lists where it is tested.

## 1. Assets and actors
| Asset | Why it matters |
|---|---|
| Tenant business data (sales, costs, suppliers, customers) | Confidential; competitors are other tenants |
| Financial records (invoices, journals) | Integrity; legal retention |
| Payroll and employee PII | Highly sensitive; restricted even inside the tenant |
| Customer PII (phone, address) | Privacy law (e.g. Egypt PDPL 151/2020, GDPR for EU guests) |
| Credentials, session/device tokens, signing keys | Account and device takeover |

| Actor | Trust |
|---|---|
| Anonymous internet | None |
| Tenant user (web) | Limited to memberships, roles, branches |
| POS device | Limited to its tenant + branch; can only submit allowed operation types |
| Employee on POS (PIN) | POS permissions only, own branch |
| Platform operator | Platform data; tenant data only via audited support session |
| Insider with DB read access | Must not see secrets (encrypted) |

## 2. Threats and controls
| Threat | Control | Test |
|---|---|---|
| Cross-tenant read/write (IDOR) | Tenant from session/device token only, never from request body; service filters; RLS FORCE; composite FKs | P2-5..P2-8 generated IDOR suite |
| Privilege escalation inside a tenant | `@RequirePermissions` on every route (lint rule: no route without decorator or `@Public`); branch scope check in services; owner role immutable | P2-9 |
| Operator abuse | Separate app/origin/cookie; MFA; support sessions with reason, ticket, expiry and full audit; tenant can view support access log | P2-11, P7 |
| Session theft | httpOnly Secure SameSite cookies, short idle timeout, revocation, rotate on login/privilege change | P2-3 |
| CSRF | SameSite + double-submit token on non-GET | P2 |
| Brute force | Login 10/min/IP + per-account lockout with backoff; pairing code 5 attempts; PIN local lockout | P2-3 |
| Device token theft | Refresh rotation with reuse detection → revoke device; tokens in Windows Credential Manager | P4 |
| Forged / replayed sync ops | Device auth; tenant/branch from token; `operation_id` uniqueness; payload hash must match on replay; allowed op types per device kind | P3-5 |
| Tampered offline totals | Server recomputes from lines; discrepancies flagged; employee permissions re-checked | P3-6 |
| Financial tampering | Posted documents/ledgers immutable by trigger; append-only audit; reversals only | P6-2 |
| Injection | Prisma parameterized queries; raw SQL only via tagged templates; Zod validation on every input; output encoding in React | lint + P8 |
| SSRF / file abuse | No user-supplied URLs fetched server-side; uploads via presigned PUT with type/size limits; images re-encoded | P8 |
| Secrets leakage | Env / secret manager only; `.env` git-ignored; pino redaction (`authorization`, `cookie`, `password`, `pin`, `token`, `*_enc`); secret scanning in CI | P8-3 |
| Supply chain | Lockfiles, `npm audit`/`cargo audit`, Dependabot, signed POS releases, SBOM | P8-3 |
| Data loss | PITR, encrypted backups, restore drills | P8-2 |

## 3. Authorization model
- **Permission keys** `<resource>.<action>` (canonical list in `packages/contracts/permissions.ts`).
- **Roles** are tenant-defined sets of permissions; system templates are seeded.
- **Scope**: membership `all_branches` or explicit branch list. Branch-scoped resources (orders, cash sessions,
  stock in a branch's warehouses, branch reports) check scope in the service layer; consolidated reports
  filter to the user's branches.
- **Sensitive permissions** (`payroll.view`, `hr.view_sensitive`, `accounting.period_reopen`, `sales.refund`,
  `data.export`, `users.manage`, `roles.manage`) are flagged; granting them is audited and shown in a review screen.
- **Field-level restriction**: salary, national id and bank details are in separate tables/encrypted columns
  and are only selected by code paths guarded by the corresponding permission; exports reuse the same paths.
- **POS**: employee role permissions are pulled to devices; the server re-validates on ingest against the
  permission snapshot version the device used (`permission_outdated` discrepancy if revoked meanwhile).

## 4. Tenant isolation in the database
- Roles: `ros_owner` (migrations), `ros_app` (API/worker; NOBYPASSRLS), `ros_reporting` (read-only, aggregate
  views for operator metrics), `ros_backup`. Least privilege: `ros_app` has no DDL, no access to
  `_prisma_migrations`, `UPDATE/DELETE` revoked on ledgers and audit tables.
- `withTenant(tenantId, fn)`: transaction + `set_config('app.tenant_id', $1, true)`; RLS policies use
  `app_tenant_id()` that returns NULL when unset. Transaction-local, so safe with PgBouncer transaction pooling.
- CI test enumerates all tables with a `tenant_id` column and asserts RLS is enabled+forced with a policy.

## 5. Cryptography
| Use | Algorithm |
|---|---|
| Passwords | Argon2id (m=64 MiB, t=3, p=1; re-hash on parameter change) |
| POS PINs | Argon2id low-memory profile (m=16 MiB) + per-employee salt; 4–6 digits + lockout |
| Session/device/reset tokens | 256-bit random; SHA-256 stored |
| Field encryption | AES-256-GCM with per-tenant data keys wrapped by a KMS master key (local dev: env key) |
| License lease | Ed25519 signatures; key rotation via `kid` with two public keys embedded in POS |
| Transport | TLS 1.2+ everywhere, HSTS; POS pins the API host certificate's public key set (with backup pin) |
| Backups | Encrypted at rest (provider KMS) + client-side encryption for logical dumps |

## 6. Payment data
No PAN, CVV, or track data is ever accepted by the API (Zod schemas reject 13–19 digit numeric strings in
reference fields). Card payments store method, amount, last-4 if provided by the terminal, and approval code.
Integrated card terminals (later) must use a semi-integrated model where card data never touches RestaurantOS.

## 7. Privacy and data lifecycle
- **Tenant export**: owner-triggered job builds a ZIP (CSV + JSON) of all tenant data to S3, presigned link
  valid 24 h, audited.
- **Tenant deletion**: tenant `closed` → read-only 30 days → personal data anonymized; financial records
  retained for the statutory period (configurable per country; Egypt default 5 years per tax law) then purged by job.
  Exact retention per country requires legal confirmation (listed in doc 09).
- **Customer erasure**: anonymize customer PII (`anonymized_at`), keep financial documents with the snapshot
  replaced by "Anonymized customer" where law allows; tax-invoice buyer details may need retention.
- Logs never contain PII values; ids only. Log retention 30 days hot, 1 year cold.

## 8. Audit
- Tenant `audit_logs` and `platform_audit_logs` are append-only (REVOKE + no UPDATE paths).
- Written in the same transaction as the change. Includes actor, action, entity, diff (redacted), request id,
  operation id, support session id.
- Tamper evidence (later): daily hash chain of audit rows per tenant stored in S3 object-lock bucket.
