# 04 — Data Dictionary (initial)

Status: **Phase 1 draft**. Columns listed are the contract for Phase 2+ migrations; minor additions are
expected, but every invariant listed here must be enforced as stated (DB constraint, trigger or service rule —
marked **DB** or **SVC**).

## 0. Conventions
| Convention | Rule |
|---|---|
| Primary key | `id uuid` (UUIDv7; server-generated or device-generated per ADR-0005) |
| Tenant ownership | `tenant_id uuid NOT NULL` on every tenant-scoped table, RLS policy `tenant_isolation`, composite unique `(id, tenant_id)` for FK targets **DB** |
| Standard columns | `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL`, `created_by uuid NULL` (user), `updated_by uuid NULL`, `row_version int NOT NULL DEFAULT 1` (optimistic locking on mutable master data). Listed below as **std**. Ledger tables (append-only) have `created_at`/`created_by` only. |
| Money | `NUMERIC(19,4)`; totals rounded to currency minor units; `currency_code char(3)` on headers (ADR-0006) |
| Quantity | `NUMERIC(19,6)`; Rate/percent `NUMERIC(9,6)` |
| Time | `timestamptz` UTC. `business_date date` = date in branch timezone after the branch day-cutoff |
| Text | `text` with CHECK on length where user-entered; names have `name_ar` / `name_en` where shown to customers |
| Soft delete | `archived_at timestamptz NULL` only on master data (products, suppliers, accounts, …). **Never** on documents or ledgers. |
| State | `status text NOT NULL` with `CHECK (status IN (…))`; transitions enforced in SVC; terminal/posted states additionally protected by triggers |
| Device facts | Tables receiving POS facts have `device_id`, `operation_id`, `occurred_at` (device clock), `received_at` (server) |
| Immutability triggers | `forbid_update_delete()` on ledgers; `forbid_change_when_posted()` on documents (allows only listed status/linkage columns) |

Scope: **P** = platform (no tenant RLS) · **T** = tenant-scoped (RLS) · **G** = global reference data (read-only for app).

---

## 1. Platform & SaaS
### plans — P
| Column | Type | Notes |
|---|---|---|
| id, std | | |
| code | text UNIQUE | `starter`, `growth`, `chain` |
| name_ar, name_en | text | |
| billing_interval | text | CHECK `month`/`year` |
| price, currency_code | numeric, char(3) | |
| trial_days | int | ≥ 0 |
| is_public | bool | |
| archived_at | timestamptz | plans are archived, never deleted (subscriptions reference them) |

### plan_entitlements — P
`plan_id` FK, `feature_key text` (e.g. `module.accounting`, `limit.branches`, `limit.devices`, `limit.users`),
`limit_value int NULL` (NULL = unlimited, for limits), `enabled bool`. UNIQUE `(plan_id, feature_key)`.

### tenants — P (also the RLS key)
`id`, std, `legal_name`, `display_name`, `slug UNIQUE`, `country_code char(2)`, `default_locale` (`ar-EG`),
`base_currency char(3)` (immutable after first posted entry — **SVC + trigger**), `timezone` (`Africa/Cairo`),
`status` CHECK (`onboarding`,`active`,`suspended`,`closed`), `data_region`, `closed_at`.

### subscriptions — P
`tenant_id` FK, `plan_id` FK, `status` CHECK (`trialing`,`active`,`past_due`,`grace`,`suspended`,`cancelled`,`expired`),
`trial_ends_at`, `current_period_start`, `current_period_end`, `grace_ends_at`, `cancel_at_period_end bool`,
`external_ref` (gateway). Partial UNIQUE `(tenant_id) WHERE status IN ('trialing','active','past_due','grace','suspended')` — one live subscription per tenant **DB**.

Transitions: trialing→active|expired; active→past_due|cancelled; past_due→active|grace; grace→active|suspended;
suspended→active|cancelled. Each transition audited in `platform_audit_logs`.

### subscription_invoices — P
`subscription_id`, `tenant_id`, `number UNIQUE`, `period_start`, `period_end`, `subtotal`, `tax_total`, `total`,
`currency_code`, `status` CHECK (`open`,`paid`,`void`,`uncollectible`), `due_at`, `paid_at`. Immutable once `paid` or `void`.

### payment_attempts — P
`subscription_invoice_id`, `amount`, `gateway` (adapter name), `gateway_ref`, `status` CHECK (`pending`,`succeeded`,`failed`),
`failure_code`, `attempted_at`, `idempotency_key UNIQUE`. No card data — gateway token reference only.

### platform_users — P
`email UNIQUE (citext)`, `password_hash` (Argon2id), `mfa_secret_enc` (AES-256-GCM), `role` CHECK (`owner`,`support`,`billing`,`readonly`), `disabled_at`.

### support_sessions — P
`platform_user_id`, `tenant_id`, `reason text NOT NULL`, `ticket_ref`, `access_level` CHECK (`read`,`write`), `started_at`, `expires_at` (≤ 4 h), `ended_at`. Every support request's tenant transaction references the session id in audit.

### platform_audit_logs — P (append-only)
`platform_user_id`, `action`, `target_type`, `target_id`, `tenant_id NULL`, `ip`, `user_agent`, `changes jsonb`, `created_at`. `REVOKE UPDATE, DELETE`.

## 2. Identity & access
### users — G-ish (global identity, not tenant-RLS; readable only via membership joins)
`email citext UNIQUE`, `password_hash`, `full_name`, `locale`, `email_verified_at`, `last_login_at`, `disabled_at`, `failed_login_count`, `locked_until`.

### memberships — T
`tenant_id`, `user_id`, `role_id`, `status` CHECK (`invited`,`active`,`disabled`), `all_branches bool`. UNIQUE `(tenant_id, user_id)`.

### membership_branches — T
`membership_id`, `branch_id`. UNIQUE pair. Used when `all_branches = false` — **SVC** restricts every branch-scoped query/command.

### roles — T
`name`, `is_system bool` (seeded templates: owner, manager, cashier, waiter, kitchen, storekeeper, purchasing, accountant, hr), std. UNIQUE `(tenant_id, lower(name))`. System `owner` role cannot be edited or deleted.

### permissions — G
`key text PK` (`<resource>.<action>`, e.g. `sales.refund`, `pos.void_sent_item`, `payroll.view`, `accounting.period_close`), `module`, `description_ar/en`, `is_sensitive bool`. Canonical list lives in `packages/contracts/permissions.ts`; migration syncs it.

### role_permissions — T
`role_id`, `permission_key`. UNIQUE pair.

### sessions — T-agnostic (keyed by user)
`user_id`, `token_hash bytea UNIQUE`, `csrf_token_hash`, `active_tenant_id NULL`, `ip`, `user_agent`, `expires_at`, `idle_expires_at`, `revoked_at`.

### password_reset_tokens
`user_id`, `token_hash UNIQUE`, `expires_at` (30 min), `used_at`. Single use **SVC**.

### devices — T
`branch_id`, `code text` (2–4 chars, receipt prefix; UNIQUE `(tenant_id, branch_id, code)`), `name`, `kind` CHECK (`pos`,`kds`),
`status` CHECK (`pending_pairing`,`active`,`disabled`,`retired`), `pairing_code_hash`, `pairing_expires_at`, `app_version`, `os_version`,
`last_seen_at`, `local_schema_version int`, std. Counts against `limit.devices` **SVC**.

### device_tokens — T
`device_id`, `kind` CHECK (`access`,`refresh`), `token_hash UNIQUE`, `family_id` (refresh rotation), `expires_at`, `used_at`, `revoked_at`.

### license_leases — T (append-only)
`device_id`, `payload jsonb`, `signature bytea`, `valid_from`, `valid_until`, `issued_at`.

### audit_logs — T (append-only)
`actor_type` CHECK (`user`,`employee`,`device`,`system`,`support`), `actor_id`, `branch_id NULL`, `action` (`sales.refund.issued`…), `entity_type`, `entity_id`,
`changes jsonb` (before/after for master data; never secrets, never full card or salary data unless actor has right — salary diffs stored encrypted), `request_id`, `operation_id NULL`,
`support_session_id NULL`, `ip`, `created_at`. `REVOKE UPDATE, DELETE` from app role **DB**. Index `(tenant_id, entity_type, entity_id, created_at)`.

## 3. Restaurant setup
### tenant_settings — T (1 row per tenant)
`price_includes_tax bool` (default true), `tax_rounding` CHECK (`line`,`document`), `allow_negative_stock bool` (true),
`valuation_method` CHECK (`weighted_average`,`fifo`) (immutable once movements exist), `posting_granularity` CHECK (`per_document`,`daily_summary`),
`business_day_cutoff time` (04:00), `receipt_footer_ar/en`, `lease_days int` (7, 1–30), `refund_returns_stock_default bool` (false), `discount_requires_approval_above numeric(9,6)`.

### branches — T
`code` UNIQUE per tenant, `name_ar/en`, `address`, `phone`, `timezone` (defaults tenant), `currency_code` (= tenant base in MVP **DB CHECK via trigger**), `tax_registration_no`, `receipt_template_id`, `default_warehouse_id`, `cost_center_id`, `status` CHECK (`active`,`closed`), std. Counts against `limit.branches`.

### warehouses — T
`branch_id`, `code`, `name`, `kind` CHECK (`main`,`kitchen`,`bar`,`transit`), `is_active`. UNIQUE `(tenant_id, code)`. One `transit` warehouse per tenant created automatically.

### service_areas / dining_tables — T
service_areas: `branch_id`, `name`, `sort`. dining_tables: `service_area_id`, `branch_id`, `label` UNIQUE per branch, `seats`, `shape`, `pos_x`, `pos_y`, `is_active`.

### printers — T
`branch_id`, `name`, `connection` CHECK (`usb`,`network`), `address`, `paper_width_mm` (58/80), `role` CHECK (`receipt`,`kitchen`,`label`), `kitchen_station_id NULL`.

### tax_rates — T
`code`, `name_ar/en`, `rate numeric(9,6)`, `kind` CHECK (`vat`,`service`,`table_tax`,`other`), `is_compound bool`, `valid_from`, `valid_to`, `output_account_id`, `input_account_id`. Rates are **versioned by validity dates**, never edited after use.

### tax_categories / tax_category_rates — T
tax_categories: `code`, `name`. tax_category_rates: `tax_category_id`, `tax_rate_id`, `applies_to` CHECK (`sale`,`purchase`), `sequence`. A country template (e.g. `EG`: VAT 14 %) seeds these as **data**.

### payment_methods — T
`code`, `name_ar/en`, `kind` CHECK (`cash`,`card`,`wallet`,`bank_transfer`,`on_account`,`voucher`,`other`), `account_id` (clearing/cash GL account), `opens_drawer bool`, `allows_change bool` (only `cash`), `requires_reference bool`, `is_active`.

### receipt_templates — T
`name`, `layout jsonb` (validated schema: header, lines, taxes, footer, QR placeholder), `locale`, `paper_width_mm`.

## 4. Menu / catalog
### categories — T
`parent_id NULL`, `name_ar/en`, `sort`, `color`, `image_key`, `archived_at`.

### products — T
`category_id`, `sku` UNIQUE per tenant (nullable), `name_ar/en`, `description_ar/en`, `kind` CHECK (`menu_item`,`resale_item`,`service`), `tax_category_id`,
`inventory_item_id NULL` (for resale items tracked as stock), `kitchen_routing bool`, `image_key`, `archived_at`, std.

### product_variants — T
`product_id`, `name_ar/en` (e.g. Small/Large), `sku`, `is_default bool`, `sort`, `archived_at`. Partial UNIQUE one default per product **DB**. Every product has ≥ 1 variant (the default); order items always reference a variant.

### product_prices — T
`variant_id`, `branch_id NULL` (NULL = all branches), `channel NULL` CHECK (`dine_in`,`takeaway`,`delivery`,`phone`), `price numeric`, `currency_code`, `valid_from timestamptz`, `valid_to NULL`.
Exclusion constraint (btree_gist): no overlapping validity for the same `(variant_id, branch_id, channel)` **DB**. Scheduled price changes = future `valid_from`. Rows are never updated once `valid_from` has passed — a change closes `valid_to` and inserts a new row **SVC + trigger**.

### modifier_groups / modifiers / product_modifier_groups — T
modifier_groups: `name_ar/en`, `min_select`, `max_select` (CHECK `0 ≤ min ≤ max`), `required bool`.
modifiers: `group_id`, `name_ar/en`, `price_delta`, `inventory_item_id NULL`, `qty NULL`, `unit_id NULL`, `archived_at`.
product_modifier_groups: `product_id`, `group_id`, `sort`. UNIQUE pair.

### branch_product_availability — T
`branch_id`, `product_id`, `is_available bool`, `available_from time NULL`, `available_to time NULL`, `out_of_stock_until NULL`.

### product_station_routes — T
`product_id`, `branch_id`, `kitchen_station_id`. UNIQUE `(product_id, branch_id, kitchen_station_id)`.

### catalog_versions — T
`branch_id`, `version bigint`, `published_at`, `change_seq bigint` (pull cursor at publish). POS records the catalog version used on every sale.

## 5. Inventory & recipes
### units — T (seeded with G defaults)
`code` (`g`,`kg`,`ml`,`l`,`pc`,`box`…), `name_ar/en`, `dimension` CHECK (`mass`,`volume`,`count`,`length`), `factor_to_base numeric(19,9)` (base: g, ml, pc).

### unit_conversions — T
`inventory_item_id NULL`, `from_unit_id`, `to_unit_id`, `factor numeric(19,9) > 0`. Item-specific conversions allow cross-dimension (e.g. 1 box = 12 pc for item X). UNIQUE `(tenant_id, inventory_item_id, from_unit_id, to_unit_id)`.

### inventory_items — T  *(fulfils the brief's "ingredients" entity)*
`code`, `name_ar/en`, `kind` CHECK (`ingredient`,`semi_finished`,`resale`,`packaging`,`consumable`), `base_unit_id`, `purchase_unit_id`, `standard_cost`,
`track_batches bool`, `track_expiry bool`, `min_qty`, `reorder_qty`, `inventory_account_id NULL` (else category mapping), `archived_at`, std.

### recipes / recipe_versions / recipe_lines — T
recipes: `target_type` CHECK (`variant`,`modifier`,`inventory_item`), `target_id`, `name`. UNIQUE `(tenant_id, target_type, target_id)`.
recipe_versions: `recipe_id`, `version int`, `yield_qty`, `yield_unit_id`, `status` CHECK (`draft`,`active`,`retired`), `effective_from timestamptz`, `approved_by`.
Partial UNIQUE one `active` per recipe **DB**. Active/retired versions are immutable **trigger** — editing creates a new version.
recipe_lines: `recipe_version_id`, `inventory_item_id`, `qty`, `unit_id`, `waste_pct numeric(9,6)` (≥0, <1).
Consumption for a sale line = Σ(line.qty × conv(unit→item base) ÷ (1 − waste_pct)) ÷ yield × sold_qty — computed in `packages/domain`, using the version referenced on the invoice line.

### stock_movements — T (append-only ledger)
| Column | Notes |
|---|---|
| id | UUIDv5 derived from source (ADR-0005) |
| warehouse_id, inventory_item_id, batch_id NULL | |
| movement_type | CHECK (`purchase_receipt`,`sale_consumption`,`refund_return`,`adjustment_in`,`adjustment_out`,`count_gain`,`count_loss`,`wastage`,`spoilage`,`transfer_out`,`transfer_in`,`transfer_variance`,`production_consume`,`production_output`,`supplier_return`,`opening_balance`) |
| qty_base | signed quantity in base unit; CHECK sign matches type **DB** |
| unit_cost, total_cost | at posting time per valuation policy; `total_cost = qty_base × unit_cost` rounded |
| source_type, source_id, source_line_id | originating document |
| business_date, occurred_at, posted_at | |
| journal_entry_id NULL | linked entry |
| reason_code NULL | wastage/spoilage/adjustment reason |
`forbid_update_delete()` trigger **DB**. UNIQUE `(tenant_id, source_type, source_line_id, movement_type, inventory_item_id)` prevents duplicate effects **DB**.

### stock_balances — T
`warehouse_id`, `inventory_item_id`, `qty_base`, `total_value`, `avg_unit_cost`, `last_movement_id`, `updated_at`. PK `(tenant_id, warehouse_id, inventory_item_id)`.
Updated only by the inventory facade in the same transaction as the movement, under `FOR UPDATE` **SVC**. Reconciliation: `qty_base = Σ movements.qty_base`, `total_value = Σ movements.total_cost` (report exposes mismatches).

### stock_batches — T
`inventory_item_id`, `warehouse_id`, `batch_no`, `expiry_date NULL`, `received_at`, `qty_remaining` (cache, reconciled against movements).

### stock_counts / stock_count_lines — T
Header: `warehouse_id`, `number`, `count_type` CHECK (`full`,`cycle`,`spot`), `status` CHECK (`draft`,`in_progress`,`submitted`,`approved`,`cancelled`), `snapshot_at`, `approved_by`, `approved_at`.
Lines: `inventory_item_id`, `batch_id NULL`, `system_qty` (snapshot), `counted_qty`, `unit_id`, `difference_qty_base`. Approval generates `count_gain/loss` movements for non-zero differences only.

### stock_adjustments / stock_adjustment_lines — T
Header: `warehouse_id`, `number`, `kind` CHECK (`adjustment`,`wastage`,`spoilage`,`opening_balance`), `reason_code`, `status` CHECK (`draft`,`posted`,`cancelled`), `posted_at`. Lines: item, batch, qty, unit, `unit_cost NULL` (only for `opening_balance`/`adjustment_in`).

### stock_transfers / stock_transfer_lines — T
Header: `number`, `from_warehouse_id`, `to_warehouse_id` (CHECK different), `status` CHECK (`draft`,`dispatched`,`received`,`cancelled`), `dispatched_at/by`, `received_at/by`.
Lines: item, batch, `qty_sent`, `qty_received NULL`, unit. Dispatch: `transfer_out` source + `transfer_in` to tenant transit warehouse. Receive: `transfer_out` transit + `transfer_in` destination; difference → `transfer_variance`.

### production_orders / production_order_lines — T
Header: `warehouse_id`, `number`, `output_item_id`, `recipe_version_id`, `planned_qty`, `produced_qty`, `status` CHECK (`draft`,`in_progress`,`completed`,`cancelled`), `completed_at`.
Lines: consumed item, `planned_qty`, `actual_qty`. Completion: `production_consume` movements and one `production_output` whose unit cost = Σ consumed cost ÷ produced qty.

## 6. POS & sales
### orders — T
| Column | Notes |
|---|---|
| id | device UUIDv7 |
| branch_id, device_id, employee_id (opened by) | |
| local_number | `BR1-D02-000123` UNIQUE `(tenant_id, local_number)` |
| channel | CHECK (`dine_in`,`takeaway`,`delivery`,`phone`) |
| table_id NULL, guests int NULL, customer_id NULL, delivery_address jsonb NULL | address snapshot |
| status | CHECK (`open`,`closed`,`cancelled`,`merged`) |
| merged_into_order_id NULL | when `merged` |
| catalog_version | version used on device |
| opened_at, closed_at, business_date | |
| operation_id | op that created it |
Orders are operational; the financial record is the invoice. A cancelled order with no invoice has no accounting effect; items sent to kitchen and voided are recorded for wastage reporting.

### order_items — T
`order_id`, `line_no int`, `variant_id`, `product_name_ar/en` (snapshot), `qty`, `unit_price` (snapshot), `price_source` (product_price id),
`tax_category_id` (snapshot), `recipe_version_id NULL` (snapshot), `notes`, `status` CHECK (`pending`,`sent`,`voided`), `voided_reason`, `void_approval_id NULL`, `seat_no NULL`, `course NULL`.
UNIQUE `(order_id, line_no)`.

### order_item_modifiers — T
`order_item_id`, `modifier_id`, `name_ar/en` (snapshot), `qty`, `price_delta` (snapshot), `recipe_version_id NULL`.

### order_adjustments — T
`order_id`, `order_item_id NULL`, `kind` CHECK (`discount`,`service_charge`,`rounding`), `method` CHECK (`percent`,`amount`), `value`, `reason_code`, `promotion_id NULL`, `coupon_id NULL`, `approval_id NULL`.

### invoices — T  *(the finalized fiscal receipt; immutable)*
| Column | Notes |
|---|---|
| id | device UUIDv7 |
| order_id, branch_id, device_id, cash_session_id, employee_id | |
| number | per-device sequence `BR1-D02-000123`; UNIQUE `(tenant_id, number)` |
| kind | CHECK (`sale`) — credit notes are `refunds` |
| customer_id NULL, customer_snapshot jsonb NULL | name, tax id, address at time of sale |
| currency_code, prices_include_tax | snapshot of setting |
| subtotal, discount_total, service_charge_total, tax_total, rounding_total, total | All components stored **net of tax** (for tax-inclusive pricing the calculator extracts tax first). CHECK `total = subtotal − discount_total + service_charge_total + tax_total + rounding_total` **DB** |
| paid_total, refunded_total | maintained by payments/refunds; CHECK `refunded_total ≤ total` |
| status | CHECK (`issued`,`partially_refunded`,`refunded`) |
| payment_status | CHECK (`unpaid`,`partially_paid`,`paid`) — `unpaid` only via `on_account` |
| issued_at, business_date, catalog_version | |
| journal_entry_id | |
| operation_id, received_at, fiscal_ref NULL | tax-authority reference (adapter, later) |
`forbid_change_when_posted()`: only `status`, `paid_total`, `refunded_total`, `payment_status`, `fiscal_ref` may change, and only via the sales facade **DB**. No DELETE.

### invoice_lines — T (immutable)
`invoice_id`, `line_no`, `order_item_id`, `variant_id`, `description_ar/en` (snapshot incl. modifiers), `qty`, `unit_price`, `discount_amount`, `service_charge_amount`,
`net_amount`, `tax_amount`, `gross_amount`, `tax_category_id`, `recipe_version_id`, `refunded_qty` (maintained), CHECK `refunded_qty ≤ qty`.

### invoice_taxes — T (immutable)
`invoice_id`, `tax_rate_id`, `rate` (snapshot), `taxable_base`, `tax_amount`. Σ `tax_amount` = invoice `tax_total` **SVC (checked on ingest)**.

### payments — T (immutable)
`invoice_id NULL`, `refund_id NULL` (CHECK exactly one), `direction` CHECK (`in`,`out`), `payment_method_id`, `amount > 0`, `tendered NULL`, `change_given NULL` (only cash),
`reference` (card approval code / wallet ref — never PAN), `cash_session_id NULL`, `employee_id`, `occurred_at`, `journal_entry_id`, `operation_id`.

### refunds / refund_lines — T (immutable)
refunds: `invoice_id` NOT NULL (refunds always reference the original), `number`, `branch_id`, `device_id`, `cash_session_id`, `reason_code`, `notes`, `total`, `tax_total`, `approval_id NOT NULL`, `issued_at`, `journal_entry_id`, `operation_id`.
refund_lines: `refund_id`, `invoice_line_id`, `qty > 0`, `net_amount`, `tax_amount`, `gross_amount`, `return_to_stock bool`.
Constraint: Σ refund_lines.qty per invoice_line ≤ invoice_line.qty — enforced by locking the invoice line and updating `refunded_qty` with CHECK **DB + SVC**.

### cash_sessions — T
`branch_id`, `device_id`, `employee_id`, `status` CHECK (`open`,`closed`), `opened_at`, `opening_float`, `closed_at`, `expected_cash`, `counted_cash`, `variance`, `counted_breakdown jsonb`, `closed_by`, `journal_entry_id NULL`.
Partial UNIQUE one open session per device **DB**. Closed sessions immutable.

### cash_movements — T (immutable)
`cash_session_id`, `kind` CHECK (`pay_in`,`pay_out`,`drop`,`float_adjust`), `amount > 0`, `reason`, `account_id NULL` (for pay-out expenses), `employee_id`, `approval_id NULL`, `occurred_at`, `operation_id`, `journal_entry_id`.

### approvals — T (immutable)
`action` (`pos.void_sent_item`, `sales.refund`, `pos.discount_over_limit`, `pos.reopen_order`, `purchasing.po_approve`…), `requested_by_employee_id`, `approved_by_employee_id` (must hold permission at `occurred_at` per device snapshot; **SVC** re-checks), `subject_type`, `subject_id`, `method` CHECK (`pin`,`online`), `occurred_at`, `device_id NULL`, `operation_id NULL`.

### sale_discrepancies — T
`invoice_id`, `kind` CHECK (`price_outdated`,`product_inactive`,`negative_stock`,`totals_mismatch`,`late_posting`,`permission_outdated`,`table_conflict`), `details jsonb`, `status` CHECK (`open`,`acknowledged`,`resolved`), `resolved_by`, `resolved_at`, `resolution_note`.

### document_sequences — T
`scope_type` (`device`,`branch`,`tenant`), `scope_id`, `doc_type`, `prefix`, `next_value bigint`. Server-side numbering for dashboard documents (PO, GRN, JE…) via `UPDATE … RETURNING` under row lock.

## 7. Kitchen
kitchen_stations — `branch_id`, `name_ar/en`, `delay_threshold_sec`, `printer_id NULL`.
kitchen_tickets — `order_id`, `kitchen_station_id`, `ticket_no`, `status` CHECK (`new`,`preparing`,`ready`,`served`,`cancelled`), `fired_at`, `ready_at`, `served_at`, `course`.
kitchen_ticket_items — `ticket_id`, `order_item_id`, `qty`, `description` (snapshot), `status` (same set), `voided bool`.
kitchen_ticket_events — append-only: `ticket_id`, `item_id NULL`, `from_status`, `to_status`, `actor_type`, `actor_id`, `device_id`, `occurred_at`.

## 8. Purchasing & suppliers
### suppliers — T
`code`, `name`, `tax_registration_no`, `contact jsonb`, `payment_terms_days`, `currency_code`, `payable_account_id NULL`, `archived_at`, std.
### supplier_quotations / lines — T
Header: `supplier_id`, `number`, `valid_until`, `status` CHECK (`draft`,`received`,`accepted`,`rejected`,`expired`). Lines: item, qty, unit, unit_price, tax_category.
### purchase_orders / purchase_order_lines — T
Header: `supplier_id`, `branch_id`, `warehouse_id`, `number`, `quotation_id NULL`, `status` CHECK (`draft`,`pending_approval`,`approved`,`partially_received`,`received`,`closed`,`cancelled`), `expected_at`, `approved_by`, `approved_at`, totals, `currency_code`.
Lines: `inventory_item_id`, `qty`, `unit_id`, `unit_price`, `tax_category_id`, `qty_received` (maintained). Approved POs: only `status` and `qty_received` change.
Transitions: draft→pending_approval→approved→partially_received→received→closed; draft|pending_approval|approved(no receipts)→cancelled.
### goods_receipts / goods_receipt_lines — T
Header: `purchase_order_id NULL`, `supplier_id`, `warehouse_id`, `number`, `supplier_delivery_ref`, `status` CHECK (`draft`,`posted`,`cancelled`), `received_at`, `posted_at`, `journal_entry_id`.
Lines: `po_line_id NULL`, item, `qty`, `unit_id`, `unit_cost`, `batch_no`, `expiry_date`, `landed_cost_alloc` (maintained), `qty_invoiced` (maintained). Posted → immutable except maintained columns.
### landed_costs — T
`goods_receipt_id`, `description`, `amount`, `allocation_method` CHECK (`value`,`quantity`,`weight`), `supplier_invoice_id NULL`, `posted_at`. Posting allocates to lines and creates inventory value movements (cost-only adjustment) for qty still on hand; consumed share → `inventory_price_variance`.
### supplier_invoices / supplier_invoice_lines — T
Header: `supplier_id`, `number` (internal), `supplier_invoice_no` (UNIQUE `(tenant_id, supplier_id, supplier_invoice_no)`), `invoice_date`, `due_date`, totals, `currency_code`,
`status` CHECK (`draft`,`posted`,`partially_paid`,`paid`,`cancelled`), `paid_total`, `journal_entry_id`.
Lines: `goods_receipt_line_id NULL`, `kind` CHECK (`item`,`landed_cost`,`expense`), item/expense account, qty, unit_price, tax. Matched qty ≤ received − already invoiced (+ tolerance) **SVC**. Posted → immutable except payment columns; correction = supplier credit note (kind of `supplier_returns` or reversal).
### supplier_payments / supplier_payment_allocations — T
Payment: `supplier_id`, `number`, `paid_at`, `amount`, `method` (bank/cash account), `reference`, `status` CHECK (`draft`,`posted`,`voided`), `journal_entry_id`. Voiding posts a reversal.
Allocation: `supplier_payment_id`, `supplier_invoice_id`, `amount`. Σ allocations ≤ payment amount; Σ per invoice ≤ invoice outstanding **SVC + lock**.
### supplier_returns / supplier_return_lines — T
Header: `supplier_id`, `goods_receipt_id NULL`, `number`, `status` CHECK (`draft`,`posted`,`cancelled`), `journal_entry_id`. Lines: item, qty, unit_cost (from original receipt), creates `supplier_return` movements and AP debit note.

## 9. Customers & loyalty
customers — `name`, `phone` (E.164, UNIQUE per tenant when present), `email`, `tax_id`, `birth_date NULL`, `marketing_consent bool`, `consent_at`, `notes`, `anonymized_at` (privacy erasure replaces PII, keeps id for financial history), `receivable_account_id NULL`, std.
customer_addresses — `customer_id`, `label`, `address_line`, `area`, `city`, `geo point NULL`, `is_default`.
loyalty_programs — `name`, `earn_rate` (points per currency unit), `redeem_value` (currency per point), `min_redeem_points`, `expiry_days NULL`, `is_active`.
loyalty_accounts — `customer_id UNIQUE`, `program_id`, `points_balance` (cache = Σ transactions, CHECK ≥ 0).
loyalty_transactions — append-only: `account_id`, `kind` CHECK (`earn`,`redeem`,`expire`,`adjust`,`reverse`), `points` (signed), `invoice_id NULL`, `refund_id NULL`, `operation_id NULL`, `occurred_at`.
promotions — `name`, `kind` CHECK (`percent_off`,`amount_off`,`bogo`,`happy_hour`), `rules jsonb` (validated), `valid_from`, `valid_to`, `branch_ids uuid[] NULL`, `channels text[] NULL`, `is_active`.
coupons — `promotion_id`, `code` UNIQUE per tenant (case-insensitive), `max_redemptions`, `per_customer_limit`, `valid_from`, `valid_to`.
coupon_redemptions — `coupon_id`, `invoice_id`, `customer_id NULL`, `amount`, `operation_id`. Offline redemption of single-use coupons can exceed the limit before sync — limitation documented; flagged as discrepancy.

## 10. Accounting
### accounts — T
`code` UNIQUE per tenant, `name_ar/en`, `parent_id NULL`, `type` CHECK (`asset`,`liability`,`equity`,`revenue`,`expense`), `subtype` (`cash`,`bank`,`receivable`,`payable`,`inventory`,`tax`,`cogs`,`clearing`,…),
`normal_balance` CHECK (`debit`,`credit`), `is_postable bool` (false for group accounts — **DB trigger** rejects lines on non-postable), `is_control bool` (AR/AP/inventory: manual entries forbidden **SVC**), `currency_code`, `archived_at` (only when balance = 0 **SVC**).
### fiscal_years / accounting_periods — T
fiscal_years: `name`, `start_date`, `end_date`, `status` CHECK (`open`,`closed`), `closing_entry_id NULL`.
accounting_periods: `fiscal_year_id`, `period_no`, `start_date`, `end_date`, `status` CHECK (`open`,`soft_closed`,`closed`), `closed_by`, `closed_at`, `reopened_count`.
Exclusion constraint: periods of a tenant do not overlap **DB**. `soft_closed` = only users with `accounting.post_in_soft_closed`; `closed` = nobody; reopening requires `accounting.period_reopen` and is audited.
### journal_entries — T
| Column | Notes |
|---|---|
| number | per tenant per fiscal year, assigned at posting |
| entry_date | accounting date; must fall in an open period at posting |
| original_date NULL | for late postings (offline sales) |
| period_id | |
| source_type, source_id | `invoice`, `refund`, `payment`, `cash_session`, `goods_receipt`, `supplier_invoice`, `supplier_payment`, `stock_adjustment`, `stock_count`, `stock_transfer`, `production_order`, `payroll_run`, `expense`, `manual`, `reversal`, `year_close` |
| status | CHECK (`draft`,`posted`) — drafts only for manual entries |
| reversal_of_id NULL, reversed_by_id NULL | UNIQUE `reversal_of_id` (one reversal per entry) |
| memo, posted_at, posted_by | |
| idempotency_key | UNIQUE `(tenant_id, source_type, source_id, purpose)` prevents duplicate posting of one document **DB** |
Triggers: `forbid_change_when_posted` (no column changes except `reversed_by_id`); **deferred constraint trigger** `journal_balanced` checks Σdebit = Σcredit > 0 for posted entries at COMMIT **DB**.
### journal_lines — T
`journal_entry_id`, `line_no`, `account_id`, `debit NUMERIC(19,4) ≥ 0`, `credit ≥ 0`, CHECK exactly one > 0 **DB**, `currency_code`, `branch_id NULL`, `cost_center_id NULL`, `partner_type NULL` (`customer`,`supplier`,`employee`), `partner_id NULL`, `description`, `reconciled bool`, `bank_statement_line_id NULL`.
Immutable after entry posted (trigger), except the reconciliation columns.
### accounting_mappings — T
`mapping_key` (`sales_revenue`, `sales_discount`, `service_charge_revenue`, `output_tax:<tax_rate>`, `input_tax:<tax_rate>`, `cogs`, `inventory`, `grni`, `ap_control`, `ar_control`, `cash_over_short`, `rounding`, `inventory_price_variance`, `inventory_count_variance`, `wastage_expense`, `inventory_in_transit`, `payroll_expense`, `payroll_payable`, `employee_advances`, `retained_earnings`, `current_year_earnings`…),
`scope_type` CHECK (`tenant`,`branch`,`category`,`inventory_item_kind`,`payment_method`,`tax_rate`), `scope_id NULL`, `account_id`. UNIQUE `(tenant_id, mapping_key, scope_type, scope_id)`. Resolution: most specific scope wins.
### cost_centers — T
`code`, `name`, `parent_id`, `archived_at`. Each branch has a default cost center.
### bank_accounts — T
`account_id UNIQUE` (GL), `bank_name`, `iban_last4` (no full numbers stored unless required — then encrypted), `currency_code`.
### bank_statement_lines — T
`bank_account_id`, `statement_date`, `amount` (signed), `description`, `external_ref`, `import_batch_id`, `match_status` CHECK (`unmatched`,`matched`,`ignored`), `matched_line_id NULL`. UNIQUE `(bank_account_id, external_ref)` when present.
### expense_categories / expenses — T
expense_categories: `name`, `account_id`. expenses: `branch_id`, `number`, `expense_category_id`, `amount`, `tax_amount`, `paid_from_account_id` or `supplier_id`, `status` CHECK (`draft`,`posted`,`voided`), `journal_entry_id`, `attachment_key`.

## 11. Employees & payroll
employees — `employee_no`, `full_name_ar/en`, `user_id NULL`, `role_id NULL` (POS role), `pos_pin_hash NULL`, `phone`, `national_id_enc` (AES-256-GCM, visible only with `hr.view_sensitive`), `hire_date`, `termination_date`, `status` CHECK (`active`,`suspended`,`terminated`), std.
employee_branches — `employee_id`, `branch_id`, `is_primary`.
employee_compensation — `employee_id`, `base_salary`, `pay_frequency`, `valid_from`, `valid_to`, `bank_details_enc`. **Separate table** so salary columns can be denied to the general HR read path (column privileges + `payroll.view` permission).
shifts / shift_assignments — template shifts and per-day assignments (`branch_id`, `employee_id`, `starts_at`, `ends_at`).
attendance_records — `employee_id`, `branch_id`, `clock_in`, `clock_out`, `source` CHECK (`pos`,`web`,`manual`), `device_id NULL`, `operation_id NULL`, `approved_by NULL`.
leave_requests — `employee_id`, `kind`, `start_date`, `end_date`, `status` CHECK (`requested`,`approved`,`rejected`,`cancelled`), `decided_by`.
payroll_runs — `period_start`, `period_end`, `branch_id NULL`, `status` CHECK (`draft`,`calculated`,`approved`,`posted`,`paid`), `journal_entry_id`, `payment_entry_id`. Immutable from `approved`.
payroll_lines — `payroll_run_id`, `employee_id`, `gross`, `deductions`, `net`. payroll_line_items — `payroll_line_id`, `kind` CHECK (`basic`,`overtime`,`incentive`,`allowance`,`deduction`,`advance_recovery`,`tax`,`social_insurance`), `amount`, `account_mapping_key`.
employee_advances — `employee_id`, `amount`, `issued_at`, `recovered_amount`, `status` CHECK (`open`,`settled`), `journal_entry_id`.
Country-specific payroll tax and social insurance are **not calculated**; they are entered amounts (limitation).

## 12. Sync & integration infrastructure
### sync_batches — T
`device_id`, `batch_id` (device UUID; UNIQUE `(tenant_id, device_id, batch_id)`), `received_at`, `op_count`, `accepted`, `duplicates`, `rejected`, `retryable`, `client_app_version`, `client_schema_version`, `duration_ms`.
### sync_operations — T
`operation_id` (device UUIDv7), `batch_id`, `device_id`, `branch_id`, `operation_type`, `schema_version`, `occurred_at`, `local_seq bigint`, `depends_on uuid[]`, `payload_hash bytea` (SHA-256 of canonical payload), `payload jsonb` (retained 90 days, then hash only), `status` CHECK (`accepted`,`already_processed`,`rejected`,`retryable`,`blocked`,`quarantined`), `error_code`, `error_detail jsonb`, `server_refs jsonb`, `processed_at`, `attempts int`.
UNIQUE `(tenant_id, operation_id)`.
### idempotency_keys — T
`scope` (`sync`, `http:<route>`), `key`, `request_hash bytea`, `status` CHECK (`in_progress`,`completed`), `response jsonb`, `resource_refs jsonb`, `created_at`, `expires_at` (sync: never; http: 7 days). PK `(tenant_id, scope, key)`.
Same key with a different `request_hash` → `409 idempotency_key_reused` (permanent rejection for sync).
### device_sync_state — T
`device_id PK`, `pull_cursor bigint`, `last_push_at`, `last_pull_at`, `last_error_code`, `pending_ops_reported int`, `oldest_pending_at`, `clock_skew_ms`.
### change_log — T
`change_seq bigserial` (global sequence; cursor compares per tenant), `entity_type`, `entity_id`, `branch_id NULL`, `op` CHECK (`upsert`,`delete`), `changed_at`. Written by triggers on pullable tables (catalog, prices, taxes, payment methods, tables, employees' POS fields, settings). Index `(tenant_id, change_seq)`.
### outbox_events — T
`event_type`, `aggregate_type`, `aggregate_id`, `payload jsonb`, `occurred_at`, `published_at NULL`, `attempts`, `last_error`. Worker publishes with `FOR UPDATE SKIP LOCKED`; consumers are idempotent by event id.

## 13. POS local SQLite schema (summary)
Mirrors the subset the device needs, plus local-only tables:
- Reference (pulled, read-only locally): branch, tables, catalog (categories, products, variants, prices, modifiers, routes), taxes, payment methods, receipt template, employees (id, name, role, PIN hash, permissions), settings, `license_lease`.
- Facts (created locally, immutable after finalize): `orders`, `order_items`, `order_item_modifiers`, `order_adjustments`, `invoices`, `invoice_lines`, `invoice_taxes`, `payments`, `refunds`, `refund_lines`, `cash_sessions`, `cash_movements`, `approvals`, `attendance`.
- `outbox(local_seq INTEGER PRIMARY KEY, operation_id TEXT UNIQUE, operation_type, schema_version, payload TEXT, depends_on TEXT, status CHECK (pending|in_flight|acked|rejected|blocked), attempts, next_attempt_at, last_error, server_refs, created_at)`.
- `sequences(doc_type PRIMARY KEY, next_value)` — incremented in the same transaction as the document.
- `sync_state(pull_cursor, last_success_at, last_error)`, `print_jobs(id, document_id, kind, status, attempts)`, `local_audit`.
- `PRAGMA user_version` = local schema version; migrations embedded in the binary.
