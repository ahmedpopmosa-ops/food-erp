# 01 — Scope and Requirements

Status: **Phase 1 draft for review** · Owner: engineering · Last updated: 2026-10-29

## 1. Product
RestaurantOS is a multi-tenant SaaS for independent restaurants and chains. One subscribed business
(a **tenant**) runs any number of **branches**, each with **warehouses**, **POS devices**, employees and
a menu, and manages purchasing, inventory, recipes and full double-entry accounting from a cloud dashboard.

| Part | Users | Runs on | Connectivity |
|---|---|---|---|
| POS desktop app (`apps/pos`) | Cashiers, waiters, branch managers | Windows 10/11 PC (Tauri 2) | **Offline-first**; syncs when online |
| Restaurant dashboard (`apps/web`) | Owners, managers, accountants, storekeepers, HR | Browser | Online |
| Operator console (`apps/admin`) | Platform staff (us) | Browser, separate origin | Online |
| API + worker (`apps/api`) | All of the above, devices | Linux containers | — |
| PostgreSQL, Redis, S3-compatible storage | — | Managed services | — |

Defaults: language **Arabic (RTL)** with English; currency **EGP**; timezone **Africa/Cairo**. All three are
tenant/branch configuration, never constants in business logic. Country tax rules are data (tax templates),
not code.

## 2. Personas and primary jobs
| Persona | Primary jobs |
|---|---|
| Platform operator | Onboard tenants, manage plans/subscriptions, watch health and sync failures, support with audited access |
| Tenant owner | Configure business, branches, users, roles; see consolidated reports; approve sensitive actions |
| Branch manager | Open/close days, approve voids/refunds/discounts, review cash variance, stock counts |
| Cashier / waiter | Take orders, accept payments, print receipts, manage tables — must work offline |
| Kitchen staff | See tickets per station, mark preparation states |
| Storekeeper | Receive goods, transfers, counts, wastage, production of semi-finished items |
| Purchasing officer | Suppliers, quotations, purchase orders, supplier invoices |
| Accountant | Chart of accounts, journal entries, periods, reconciliation, financial statements, payments |
| HR / payroll officer | Employees, shifts, attendance, leave, payroll (restricted data) |

## 3. Scope by module
"MVP" = what the module must do to be called implemented. "Later" = documented but not promised.
Phase numbers refer to the roadmap in §6.

| # | Module | MVP | Later | Phase |
|---|---|---|---|---|
| A | Tenancy & subscriptions | Tenants, plans, entitlements, usage limits, trial/active/past-due/grace/suspended lifecycle, subscription invoices, payment attempts via **payment-gateway adapter** | Automated card billing with a real gateway, proration, coupons for plans | 2 (core), 7 |
| B | Identity & access | Email+password (Argon2id), opaque sessions, password reset, RBAC, branch scoping, device registration (pairing code), POS employee PIN, append-only audit log | MFA (TOTP), SSO | 2 |
| C | Restaurant setup | Branches, warehouses, service areas, tables, devices, printers, tax rates/categories, payment methods, receipt templates, accounting settings | Floor-plan editor with drag & drop | 2–3 |
| D | Menu | Categories, products, variants, modifier groups/modifiers, branch/channel prices with validity dates, branch availability, tax categories, recipe link | Combo/meal builder, time-of-day menus | 3, 5 |
| E | POS | Dine-in/takeaway/delivery/phone orders, modifiers, item & order discounts, service charge, taxes, split/merge bills, table transfer, partial & multi-method payments, cash sessions with variance, receipts/reprint, refunds, voids, manager approvals | Customer display, card-terminal integration | 3–4 |
| F | Offline & sync | SQLite with migrations, transactional outbox, idempotent push, pull cursor, retries with backoff+jitter, diagnostics screen, crash recovery, license lease | LAN peer sync between POS devices | 3–4 |
| G | Kitchen | Stations, routing, tickets, states (new→preparing→ready→served), elapsed time, delay thresholds, kitchen ticket printing (offline) | Local-network KDS that works with the cloud down | 7 |
| H | Inventory & recipes | Items (ingredient, semi-finished, resale), units & conversions, versioned recipes, movements ledger, balances, batches & expiry, counts, adjustments, wastage, transfers, production orders, weighted-average valuation | FIFO valuation (interface ready), demand forecasting | 5 |
| I | Purchasing | Suppliers, quotations, POs with approval, partial receipts, supplier invoices with 3-way link, landed costs, payments, returns, balances | Supplier portal | 5 |
| J | Customers & loyalty | Customer profiles, addresses, history, loyalty points ledger, coupons, promotions | Marketing campaigns, SMS/WhatsApp adapters | 7 |
| K | Accounting | Chart of accounts, fiscal years/periods with close, journals, posting rules for every operational document, cost centers, bank/cash accounts, expenses, bank reconciliation, GL, trial balance, P&L, balance sheet, cash flow (indirect), account statements | Multi-currency revaluation, consolidation across tenants | 6 |
| L | Employees | Profiles, branch assignment, shifts, attendance, leave, payroll runs/lines, advances, deductions, incentives, restricted visibility | Statutory payroll engine per country (not claimed) | 7 |
| M | Reporting | Sales by day/branch/product/category/employee/channel, avg ticket, discounts, refunds, payment methods, cash variance, peak hours, stock valuation & movements, low stock, wastage, recipe cost, theoretical vs actual, gross margin, COGS, supplier balances, financial statements; filters + export permission | Scheduled report e-mails, BI connector | 3–7 |

### Out of scope (explicitly)
- Storing card numbers (PAN) or CVV. Card payments are recorded as method + reference only.
- Fiscal-device / tax-authority e-receipt submission (e.g. Egypt ETA e-receipt). An adapter interface is
  defined; no live integration until credentials and certification are available.
- Food-delivery aggregator integrations (Talabat, Elmenus, …) — adapter interface only, later.
- Microservices. The backend is a modular monolith (see ADR-0001).

## 4. Non-functional requirements
| Area | Requirement | Verified in |
|---|---|---|
| Offline | POS sells, takes payment, prints receipts and keeps a durable record with **no network** for at least the license-lease period (default 7 days) | Phase 4 fault-injection tests |
| Durability | A sale acknowledged on the POS screen survives power loss (SQLite WAL, `synchronous=FULL`, single transaction) | Phase 4 kill-during-write test |
| Correctness | Server is authoritative for accounting and inventory; frontend totals are re-derived and checked | Phase 3+ integration tests |
| Idempotency | Any operation retried N times has exactly one effect | Phase 3 tests, Phase 8 load test |
| Isolation | No API call or SQL session can read/write another tenant's rows | Phase 2 cross-tenant tests, RLS tests |
| Security | OWASP ASVS L2 targets for web/API; secrets only in env/secret manager; audit log append-only | Phase 8 review |
| i18n | Every UI string translated (ar, en); RTL via logical CSS; numbers/dates/currency via `Intl` with tenant locale | Lint rule + E2E in both locales |
| Accessibility | WCAG 2.2 AA for web; POS keyboard + touch operable, minimum touch target 44 px | Phase 8 audit |
| Observability | Structured JSON logs with request/operation ids and no PII/secrets; health + readiness endpoints; metrics | Phase 2+ |
| Backup | PITR on PostgreSQL (≥ 7 days), daily encrypted logical backups (≥ 35 days), quarterly restore drill | Phase 8 restore test |

### Performance targets (to be measured on reference hardware in Phase 8)
Reference POS hardware: Intel Celeron N4020 / 4 GB RAM / SATA SSD / Windows 10 — the low end of restaurant PCs.
Reference server: 2 vCPU / 4 GB API container, PostgreSQL 16 with 2 vCPU / 8 GB.

| Operation | Target |
|---|---|
| POS: add item to order (UI update) | p95 ≤ 50 ms |
| POS: finalize sale (totals, durable SQLite commit, outbox row) | p95 ≤ 150 ms |
| POS: start of receipt printing after finalize | ≤ 1 s |
| POS: cold start to selling screen | ≤ 5 s |
| POS: catalog of 2,000 products, search-as-you-type | p95 ≤ 30 ms per keystroke |
| Sync push: batch of 200 sale operations | server p95 ≤ 2 s |
| Sync burst: 50 devices × 500 queued sales reconnecting together | drained ≤ 10 min, zero duplicates, zero lost ops |
| Dashboard API reads | p95 ≤ 300 ms (reports over 1 year of one branch ≤ 3 s) |

These are targets, not results. No performance claim will be made until measured.

## 5. Assumptions (need product-owner confirmation)
| # | Assumption | Impact if wrong |
|---|---|---|
| A1 | A POS sale that completed offline is a **fact**: the server records it even if prices/catalog changed meanwhile; discrepancies are flagged, not rejected | If rejection is wanted, cashiers would hold money with no record — unacceptable, so we only flag |
| A2 | Negative stock is **allowed** (configurable per tenant, default allowed) because offline branches cannot be blocked | If disallowed, offline selling must stop when local stock estimate hits zero |
| A3 | Inventory cost of a sale is taken from the weighted average **when the server processes** the sale, not retroactively at `occurred_at` | Late-synced sales may carry a slightly different cost than if processed live; documented in limitations |
| A4 | Receipt numbers are per device (`<branch>-<device>-<seq>`); no gap-free tenant-wide numbering while offline | If a tax authority requires central gap-free numbering, an online-only mode or fiscal device is needed |
| A5 | One base currency per tenant (EGP default). Foreign-currency cash tendered is out of MVP | Multi-currency requires revaluation (later) |
| A6 | Prices may be tax-inclusive or tax-exclusive per tenant setting; Egypt default = inclusive | Affects totals computation and receipt layout |
| A7 | Service charge is a configurable percentage, taxable or not by tax template | Country-specific; handled as data |
| A8 | Restaurant refunds do **not** return food to stock by default (refund line flag can override) | Affects COGS and wastage reporting |
| A9 | A user account is global (one email) and may be a member of several tenants | Simplifies consultants/accountants serving many restaurants |
| A10 | The accounting posting rules in `07-accounting-and-inventory-rules.md` are a starting point and **must be reviewed by a qualified accountant** before production | Misstated financial statements |

## 6. Delivery phases
| Phase | Deliverable | Exit criterion |
|---|---|---|
| 1 | These documents | Reviewed and approved |
| 2 | Monorepo, shared packages, CI, migrations, auth, tenancy, RBAC, RLS, cross-tenant tests | CI green; isolation test suite passes |
| 3 | Vertical slice: product → order → payment → local persist → receipt → sync → server invoice + journal entry | E2E test passes against real DB and real SQLite |
| 4 | Full POS, cash sessions, refunds, voids, approvals, offline recovery scenarios | Fault-injection suite passes |
| 5 | Inventory, recipes, purchasing, suppliers, transfers | Reconciliation tests pass |
| 6 | Accounting completion, posting rules for all documents, reconciliation, statements | Trial balance always balances; statements tie to GL |
| 7 | Subscriptions & onboarding, employees/payroll, analytics, kitchen, loyalty | Module acceptance tests pass |
| 8 | Security, performance, recovery, production readiness | Targets measured and documented |

Acceptance criteria per phase: [`08-acceptance-criteria.md`](08-acceptance-criteria.md).
