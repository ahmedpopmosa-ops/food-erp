# 03 — Entity-Relationship Diagram

Split by domain for readability. Column details, constraints and states are in
[`04-data-dictionary.md`](04-data-dictionary.md). Every tenant-scoped entity carries `tenant_id` (omitted from
the diagrams below except on `tenants`); every FK between tenant-scoped tables is a composite
`(id, tenant_id)` FK (ADR-0002).

## 1. Platform, tenancy, identity
```mermaid
erDiagram
  plans ||--o{ plan_entitlements : defines
  plans ||--o{ subscriptions : "subscribed via"
  tenants ||--o{ subscriptions : has
  subscriptions ||--o{ subscription_invoices : bills
  subscription_invoices ||--o{ payment_attempts : "paid by"
  tenants ||--|| tenant_settings : configures
  tenants ||--o{ branches : owns
  tenants ||--o{ memberships : has
  users ||--o{ memberships : "member of"
  roles ||--o{ memberships : grants
  roles ||--o{ role_permissions : contains
  permissions ||--o{ role_permissions : "granted in"
  memberships ||--o{ membership_branches : "scoped to"
  branches ||--o{ membership_branches : ""
  users ||--o{ sessions : opens
  users ||--o{ password_reset_tokens : requests
  branches ||--o{ devices : hosts
  devices ||--o{ device_tokens : authenticates
  devices ||--o{ license_leases : receives
  tenants ||--o{ audit_logs : records
  platform_users ||--o{ support_sessions : opens
  tenants ||--o{ support_sessions : "accessed in"
  platform_users ||--o{ platform_audit_logs : records
```

## 2. Restaurant setup and menu
```mermaid
erDiagram
  branches ||--o{ warehouses : has
  branches ||--o{ service_areas : has
  service_areas ||--o{ dining_tables : contains
  branches ||--o{ printers : has
  branches ||--o{ kitchen_stations : has
  tax_categories ||--o{ tax_category_rates : maps
  tax_rates ||--o{ tax_category_rates : "applied in"
  payment_methods }o--|| accounts : "posts to"
  receipt_templates ||--o{ branches : "used by"
  categories ||--o{ categories : parent
  categories ||--o{ products : groups
  products ||--o{ product_variants : has
  tax_categories ||--o{ products : taxes
  product_variants ||--o{ product_prices : priced
  branches ||--o{ product_prices : "optional scope"
  products ||--o{ product_modifier_groups : offers
  modifier_groups ||--o{ product_modifier_groups : ""
  modifier_groups ||--o{ modifiers : contains
  products ||--o{ branch_product_availability : ""
  branches ||--o{ branch_product_availability : ""
  product_variants ||--o{ recipes : "made by"
  modifiers ||--o{ recipes : "made by"
  kitchen_stations ||--o{ product_station_routes : receives
  products ||--o{ product_station_routes : "routed to"
  branches ||--o{ catalog_versions : publishes
```

## 3. POS, sales, cash, kitchen
```mermaid
erDiagram
  branches ||--o{ orders : takes
  devices ||--o{ orders : "created on"
  dining_tables |o--o{ orders : seats
  customers |o--o{ orders : places
  orders ||--o{ order_items : contains
  order_items ||--o{ order_item_modifiers : has
  product_variants ||--o{ order_items : "sold as"
  orders ||--o{ order_adjustments : "discount / service charge"
  orders |o--o| orders : "merged into"
  orders ||--o{ invoices : "billed by (split bills)"
  invoices ||--o{ invoice_lines : contains
  invoice_lines }o--|| order_items : "from"
  invoices ||--o{ invoice_taxes : "tax summary"
  invoices ||--o{ payments : "settled by"
  payment_methods ||--o{ payments : via
  invoices ||--o{ refunds : "refunded by"
  refunds ||--o{ refund_lines : contains
  refund_lines }o--|| invoice_lines : reverses
  refunds ||--o{ payments : "pays out"
  cash_sessions ||--o{ payments : "collected in"
  cash_sessions ||--o{ cash_movements : records
  devices ||--o{ cash_sessions : "opened on"
  employees ||--o{ cash_sessions : "operated by"
  approvals }o--|| employees : "approved by"
  orders ||--o{ kitchen_tickets : "fires"
  kitchen_stations ||--o{ kitchen_tickets : receives
  kitchen_tickets ||--o{ kitchen_ticket_items : contains
  kitchen_tickets ||--o{ kitchen_ticket_events : "state history"
  invoices ||--o{ sale_discrepancies : flags
```

## 4. Inventory, recipes, production
```mermaid
erDiagram
  units ||--o{ unit_conversions : from
  inventory_items ||--o{ unit_conversions : "item-specific"
  inventory_items ||--o{ recipe_lines : "used in"
  recipes ||--o{ recipe_versions : versions
  recipe_versions ||--o{ recipe_lines : contains
  inventory_items |o--o| recipes : "semi-finished made by"
  warehouses ||--o{ stock_balances : holds
  inventory_items ||--o{ stock_balances : ""
  warehouses ||--o{ stock_movements : ""
  inventory_items ||--o{ stock_movements : ""
  stock_batches |o--o{ stock_movements : "batch of"
  inventory_items ||--o{ stock_batches : ""
  stock_counts ||--o{ stock_count_lines : contains
  stock_adjustments ||--o{ stock_adjustment_lines : contains
  stock_transfers ||--o{ stock_transfer_lines : contains
  production_orders ||--o{ production_order_lines : "consumes"
  recipe_versions ||--o{ production_orders : "follows"
```
`stock_movements.source_type/source_id` point at the originating document (invoice line, refund line, goods
receipt line, adjustment line, count line, transfer line, production order, supplier return line).

## 5. Purchasing and suppliers
```mermaid
erDiagram
  suppliers ||--o{ supplier_quotations : quotes
  supplier_quotations ||--o{ supplier_quotation_lines : ""
  suppliers ||--o{ purchase_orders : receives
  purchase_orders ||--o{ purchase_order_lines : ""
  purchase_orders ||--o{ goods_receipts : "received by"
  goods_receipts ||--o{ goods_receipt_lines : ""
  goods_receipt_lines }o--o| purchase_order_lines : fulfils
  goods_receipts ||--o{ landed_costs : "additional cost"
  suppliers ||--o{ supplier_invoices : bills
  supplier_invoices ||--o{ supplier_invoice_lines : ""
  supplier_invoice_lines }o--o| goods_receipt_lines : matches
  suppliers ||--o{ supplier_payments : paid
  supplier_payments ||--o{ supplier_payment_allocations : allocates
  supplier_invoices ||--o{ supplier_payment_allocations : settled
  suppliers ||--o{ supplier_returns : returns
  supplier_returns ||--o{ supplier_return_lines : ""
```

## 6. Customers and loyalty
```mermaid
erDiagram
  customers ||--o{ customer_addresses : has
  customers ||--o| loyalty_accounts : holds
  loyalty_programs ||--o{ loyalty_accounts : ""
  loyalty_accounts ||--o{ loyalty_transactions : ledger
  promotions ||--o{ coupons : issues
  coupons ||--o{ coupon_redemptions : "redeemed in"
  invoices ||--o{ coupon_redemptions : ""
```

## 7. Accounting
```mermaid
erDiagram
  accounts ||--o{ accounts : parent
  fiscal_years ||--o{ accounting_periods : contains
  accounting_periods ||--o{ journal_entries : "posted in"
  journal_entries ||--o{ journal_lines : contains
  accounts ||--o{ journal_lines : "debited/credited"
  cost_centers |o--o{ journal_lines : dimension
  branches |o--o{ journal_lines : dimension
  journal_entries |o--o| journal_entries : "reversal of"
  accounting_mappings }o--|| accounts : "resolves to"
  bank_accounts ||--|| accounts : "GL account"
  bank_accounts ||--o{ bank_statement_lines : imports
  bank_statement_lines |o--o| journal_lines : "matched to"
  expense_categories }o--|| accounts : "posts to"
  expenses }o--|| expense_categories : ""
```
`journal_entries.source_type/source_id` link back to the operational document that produced them.

## 8. Employees and payroll
```mermaid
erDiagram
  employees |o--o| users : "login (optional)"
  employees ||--o{ employee_branches : "assigned to"
  employees ||--o{ shift_assignments : works
  shifts ||--o{ shift_assignments : ""
  employees ||--o{ attendance_records : clocks
  employees ||--o{ leave_requests : requests
  payroll_runs ||--o{ payroll_lines : contains
  employees ||--o{ payroll_lines : paid
  payroll_lines ||--o{ payroll_line_items : "earnings / deductions"
  employees ||--o{ employee_advances : receives
```

## 9. Sync and integration infrastructure
```mermaid
erDiagram
  devices ||--o{ sync_batches : uploads
  sync_batches ||--o{ sync_operations : contains
  sync_operations ||--|| idempotency_keys : "guarded by"
  devices ||--|| device_sync_state : "cursor & health"
  tenants ||--o{ change_log : "pull feed"
  tenants ||--o{ outbox_events : publishes
```
