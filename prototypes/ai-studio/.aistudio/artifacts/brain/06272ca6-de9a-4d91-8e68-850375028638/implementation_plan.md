# RestaurantOS — Master Architecture & Implementation Plan

RestaurantOS is a production-oriented, multi-tenant SaaS Restaurant Management System engineered for independent eateries and restaurant chains. It unites an offline-first point-of-sale terminal, a cloud-based restaurant operations and financial management hub, and a platform operator administration console under a unified, RTL-first Arabic interface with instantaneous English localization and EGP/Cairo localized standards.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The architectural blueprint establishes five fundamental invariant systems that govern all phases of RestaurantOS:
> 1. **Offline-First Transactional Outbox**: Local POS operations generate deterministic client UUIDs and append to a durable local outbox with retry, backoff, and idempotent server reconciliation. Financial documents (invoices, payments, stock movements) never use naive last-write-wins.
> 2. **Immutable Double-Entry Accounting**: Every finalized sale, payment, supplier invoice, stock wastage, and payroll entry automatically posts a balanced journal entry ($\sum \text{Debits} = \sum \text{Credits}$). Posted vouchers are immutable; corrections require audited reversal entries.
> 3. **Recipe Depletion & Inventory Integrity**: Finalized orders deplete ingredient stocks according to the active recipe version. Wastage and stock transfers produce auditable stock movements with weighted-average valuation.
> 4. **Tenant & Branch Isolation**: Strict tenant scoping across all state stores and database models prevents cross-tenant data leakage.
> 5. **Bilingual RTL/LTR Design**: Native Arabic typography with full right-to-left layout symmetry, accompanied by a seamless toggle to English LTR, adhering to strict zero-pill metadata and high-density tabular standards.

- **Confirmed Default Posture**: Arabic RTL interface with Egyptian Pound (`ج.م` / `EGP`) currency, `Africa/Cairo` timezone, and one-click toggle to English LTR.
- **Showcase Tenant Dataset**: Egyptian Fast-Casual & Grill brand ("مطعم قصر الشام والشواية" / "Al-Qasr Grill & Shawarma") featuring Dine-in floor tables, Takeaway/Counter, Delivery routes, multi-ingredient recipe depletion, cash sessions, supplier procurement, and double-entry general ledger.
- **Workspace Navigation Mode**: Unified Workspace Switcher enabling instant switching between:
  - **POS Terminal** (Cash session, floor plan, order builder, split payment, offline outbox, receipt printer).
  - **Kitchen Display System (KDS)** (Station tickets, prep timers, bump bar).
  - **Restaurant Manager Cloud Hub** (Menu, Inventory, Purchasing, Accounting, Employees, Reports).
  - **SaaS Operator Console** (Tenants, Subscriptions, Plans, Health & Sync Monitor).

---

## 1. Overview & Core Concept

### What It Does
RestaurantOS delivers end-to-end operational and financial control for restaurant businesses:
- **Cashier & POS Staff**: Rapid ordering across Dine-in, Takeaway, and Delivery modes with table visualizers, modifier groups, customer loyalty lookup, split/merged bills, and cash register session accountability (opening float, cash movements, blind closing counts, and variance detection). Continues operating seamlessly when disconnected from the cloud.
- **Kitchen & Expedite Staff**: Real-time Kitchen Display System (KDS) routing order items to dedicated grill, cold, and beverage stations with SLA elapsed timers and completion bumps.
- **Kitchen Managers & Warehouse Keepers**: Ingredient catalog with multi-level unit conversions (kg $\to$ g, carton $\to$ piece), recipe versioning with theoretical vs. actual consumption tracking, purchase order receipting with landed costs, stock counts, wastage tracking, and inter-branch transfers.
- **Accountants & Business Owners**: Full double-entry general ledger, chart of accounts conforming to standard unified accounting systems, trial balances, income statements (P&L), balance sheets, cash flow, and automated posting rules for sales, Cost of Goods Sold (COGS), accounts receivable, supplier payables, and VAT.
- **SaaS Platform Operators**: Tenant management, plan tiers, subscription billing cycles, usage quotas (max branches, max devices), device registration, and platform health telemetry.

### Target Audience & Persona
- **Cashiers & Waiters**: Fast, tactile touch screen interface, minimal clicks, instant receipts.
- **Branch Managers**: Daily cash reconciliation, shift control, inventory reordering, staff attendance.
- **Executive Chefs**: Recipe formulation, food cost percentage analysis, ingredient substitution.
- **Financial Controllers**: Period closings, tax audits, immutable journal entries, vendor payables.
- **Franchise & Platform Owners**: Centralized branch metrics, subscription status, and tenant lifecycle.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **POS Shift Lifecycle & Order Flow**:
   Cashier signs in with PIN $\to$ Enters opening cash float $\to$ Selects Dine-in table or Counter/Takeaway $\to$ Taps category & item $\to$ Customizes modifiers (e.g., Extra Garlic Dip, No Pickles, Double Meat) $\to$ Kitchen ticket transmits immediately $\to$ Customer splits bill by item or amount $\to$ Cash/Card/Wallet payment processed $\to$ Local thermal receipt rendered with QR e-invoice compliance $\to$ Cash session closed with counted denomination tally and variance report.
2. **Procurement to Inventory & Accounting Flow**:
   Create Purchase Order for meat & spices $\to$ Receive Goods at Central Warehouse with supplier delivery note $\to$ Record supplier invoice with VAT $\to$ System automatically debits Inventory Asset, debits Input VAT, credits Accounts Payable $\to$ Recalculate weighted average unit costs $\to$ Settle payment via Bank Transfer (debit AP, credit Bank).
3. **Sales Depletion to COGS Voucher Flow**:
   Customer orders 5 Beef Shawarma Meals $\to$ POS finalizes sale $\to$ Inventory engine deducts 1.0 kg Marinated Beef, 5 Saj Breads, 0.25 kg Tahini Sauce $\to$ Accounting engine generates journal entry: Debit Cash/Receivables, Credit Sales Revenue, Credit Output VAT, and Debit COGS, Credit Inventory Asset.

### Visual Identity & Theme
- **Aesthetic Direction**: High-density, utilitarian, tactile professional software. Modern editorial restraint without distracting AI glow, purple gradients, or floating toy bubbles.
- **Color Palette & Hierarchy**:
  - Dominant Canvas: Deep architectural dark slate (`#0B0F17`) in POS/KDS for eye comfort under bright restaurant lighting, paired with crisp neutral cream/white (`#F8FAFC`) in Manager & Accounting dashboards.
  - Structural Surfaces: Flat borders (`#E2E8F0` / `#1E293B`) with single-level elevation and generous hairline dividers.
  - Accents: High-intent Emerald Green (`#059669` / `#10B981`) for completed payments and active orders, Amber (`#D97706`) for delayed kitchen orders or open sessions, and Crimson (`#DC2626`) for voids, variances, and expired stock.
- **Typography**:
  - Display & Headings: `Plus Jakarta Sans` / `Cairo` (Google Font optimized for Arabic legibility and modern numerals).
  - Data & Metrics: `tabular-nums font-mono` for all currencies, prices, quantities, journal entry debits/credits, and ticket timers to prevent layout jitter.
- **Anti-Slop Restraint**: Zero static pill enclosures on metadata; tags and statuses use unboxed inline text with typographic dots (`·`). Single-line controls with truncation guards.

---

## 3. Key Product Decisions & Trade-Offs

| Decision Area | Chosen Approach | Rationale | Alternatives Considered |
| :--- | :--- | :--- | :--- |
| **Architecture Model** | Modular Monolith (TypeScript + Vite React frontend with client/server domain modules) | Ensures maximum reliability, unified type sharing, and single-port deployment inside AI Studio container, avoiding distributed network failure modes. | Microservices (rejected: high complexity and network latency) |
| **Local Offline Storage** | IndexedDB with transactional outbox queue & persistent SQLite schema abstraction | Guarantees instant POS responsiveness, full offline capabilities in browsers and Tauri desktop wrappers, and zero network block on checkout. | Pure cloud API (rejected: fails during internet drops) |
| **Accounting Architecture** | Classical Double-Entry General Ledger with Immutable Journal Entries & Automatic Posting Engine | Complies with international GAAP/IFRS standards and Egyptian Tax Authority audit requirements; balances debits and credits on every post. | Simple cash-in/cash-out tracking (rejected: unacceptable for real accounting) |
| **Inventory Costing** | Weighted Average Cost (WAC) with batch-level expiry tracking | Provides mathematically stable margins and handles price volatility from supplier invoices smoothly without locking past transactions. | LIFO (disallowed under IFRS) or naive static pricing |
| **Localization & Direction** | Full bidirectional RTL/LTR engine with Arabic default and English switch | Critical for Egyptian and Middle Eastern restaurant staff, while catering to multilingual management teams. | Arabic-only or English-only |

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RestaurantOS Web & Desktop                      │
├────────────────────────────────────────────────────────────────────────┤
│  Top Navigation: Workspace Switcher · Tenant Switcher · Language (AR/EN)│
├───────────────┬───────────────────┬──────────────────┬─────────────────┤
│ 🛒 POS        │ 🍳 KDS            │ 📊 Manager Hub   │ 🏢 SaaS Admin   │
│ · Floor Tables│ · Prep Stations   │ · Menu & Prices  │ · Tenants & Plan│
│ · Order Items │ · Elapsed Timers  │ · Inventory & WAC│ · Subscriptions │
│ · Split Bill  │ · Bump State      │ · Purchasing/POs │ · Health Telemet│
│ · Cash Session│ · Sound/Alert     │ · Double-Entry GL│ · Sync Outbox   │
│ · Thermal E-QR│                   │ · HR & Payroll   │                 │
├───────────────┴───────────────────┴──────────────────┴─────────────────┤
│              Offline-First Data Engine & Transactional Outbox          │
│  · Local IndexedDB / SQLite Store                                      │
│  · Outbox Queue: [Op ID, Tenant, Branch, Payload, State, RetryCount]   │
│  · Idempotent Server Sync Worker with Exponential Backoff              │
├────────────────────────────────────────────────────────────────────────┤
│                       Modular Domain Service Layer                     │
│  Tenancy · Auth/RBAC · Menu · POS/Orders · Inventory · Accounting · HR │
├────────────────────────────────────────────────────────────────────────┤
│               PostgreSQL Schemas & Normalized Relational DB            │
│  Tenants, Branches, Users, Products, Recipes, StockMovements,          │
│  Orders, Invoices, Payments, Accounts, JournalEntries, JournalLines    │
└────────────────────────────────────────────────────────────────────────┘
```

### Complete Entity Relationship (ER) & Data Dictionary

#### 1. Tenancy, Subscriptions & Auth
- `tenants`: `id` (UUID), `name`, `subdomain`, `currency` (`EGP`), `timezone` (`Africa/Cairo`), `tax_registration_number`, `created_at`.
- `plans`: `id`, `name`, `tier_code` (`STARTER`, `PRO`, `ENTERPRISE`), `max_branches`, `max_devices`, `price_monthly`, `price_annual`, `features_json`.
- `subscriptions`: `id`, `tenant_id`, `plan_id`, `status` (`ACTIVE`, `TRIAL`, `GRACE_PERIOD`, `SUSPENDED`), `current_period_start`, `current_period_end`.
- `branches`: `id`, `tenant_id`, `code`, `name_ar`, `name_en`, `address`, `phone`, `default_warehouse_id`.
- `warehouses`: `id`, `tenant_id`, `branch_id`, `code`, `name_ar`, `name_en`, `is_central`.
- `devices`: `id`, `tenant_id`, `branch_id`, `device_code`, `device_type` (`POS`, `KDS`, `HANDHELD`), `pairing_token`, `last_sync_at`, `status`.
- `users`: `id`, `tenant_id`, `email`, `password_hash`, `pin_code`, `full_name`, `role` (`SUPER_ADMIN`, `OWNER`, `MANAGER`, `CASHIER`, `KITCHEN`, `ACCOUNTANT`), `is_active`.

#### 2. Menu, Recipes & Inventory
- `categories`: `id`, `tenant_id`, `name_ar`, `name_en`, `color_code`, `display_order`, `tax_rate` (e.g., 0.14 for 14% VAT).
- `products`: `id`, `tenant_id`, `category_id`, `sku`, `barcode`, `name_ar`, `name_en`, `base_price`, `cost_price`, `pricing_type`, `has_modifiers`, `track_inventory`.
- `modifiers`: `id`, `tenant_id`, `group_name_ar`, `name_ar`, `name_en`, `price_delta`, `cost_delta`.
- `ingredients`: `id`, `tenant_id`, `code`, `name_ar`, `name_en`, `base_unit` (`g`, `ml`, `piece`), `current_cost_per_unit`, `minimum_alert_stock`.
- `ingredient_conversions`: `id`, `ingredient_id`, `from_unit` (`kg`), `to_unit` (`g`), `factor` (1000).
- `recipes`: `id`, `tenant_id`, `product_id`, `version_number`, `yield_quantity`, `is_active`.
- `recipe_items`: `id`, `recipe_id`, `ingredient_id`, `quantity`, `unit`.
- `stock_balances`: `id`, `tenant_id`, `warehouse_id`, `ingredient_id`, `quantity_on_hand`, `weighted_average_cost`.
- `stock_movements`: `id`, `tenant_id`, `warehouse_id`, `ingredient_id`, `movement_type` (`SALE_DEPLETION`, `PURCHASE_RECEIPT`, `WASTAGE`, `TRANSFER_IN`, `TRANSFER_OUT`, `STOCK_COUNT_ADJUSTMENT`), `quantity`, `unit_cost`, `total_cost`, `reference_type`, `reference_id`, `occurred_at`.

#### 3. Orders, Invoices, POS & Cash Sessions
- `cash_sessions`: `id`, `tenant_id`, `branch_id`, `device_id`, `user_id`, `opened_at`, `closed_at`, `opening_float`, `total_sales_cash`, `total_sales_card`, `cash_in`, `cash_out`, `expected_cash`, `counted_cash`, `variance`, `status` (`OPEN`, `CLOSED`).
- `orders`: `id`, `tenant_id`, `branch_id`, `order_number`, `order_type` (`DINE_IN`, `TAKEAWAY`, `DELIVERY`), `table_id`, `customer_id`, `status` (`OPEN`, `SENT_TO_KITCHEN`, `READY`, `PAID`, `CANCELLED`), `subtotal`, `discount_amount`, `service_charge`, `tax_amount`, `grand_total`, `created_at`.
- `order_items`: `id`, `order_id`, `product_id`, `quantity`, `unit_price`, `modifiers_json`, `station_code` (`GRILL`, `COLD`, `BEV`), `kitchen_state` (`PENDING`, `PREPARING`, `READY`), `total_price`.
- `payments`: `id`, `tenant_id`, `order_id`, `cash_session_id`, `payment_method` (`CASH`, `CARD`, `INSTAPAY_WALLET`, `CUSTOMER_CREDIT`), `amount`, `reference_number`, `tendered_amount`, `change_amount`, `paid_at`.

#### 4. Double-Entry Accounting
- `chart_of_accounts`: `id`, `tenant_id`, `account_code`, `name_ar`, `name_en`, `account_type` (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`), `parent_account_id`, `is_active`.
  - Standard pre-configured accounts:
    - `1010`: Cash on Hand (POS Register)
    - `1020`: Bank Account / POS Terminal Card Clearing
    - `1100`: Accounts Receivable (Credit Customers)
    - `1200`: Raw Material Inventory Asset
    - `2010`: Accounts Payable (Suppliers)
    - `2100`: VAT Payable (14% Output VAT)
    - `2110`: VAT Input Deductible
    - `4010`: Food & Beverage Sales Revenue
    - `5010`: Cost of Goods Sold (COGS - Food Cost)
    - `5020`: Inventory Spoilage & Wastage Expense
    - `5030`: Cash Register Shortage/Over Variance
- `journal_entries`: `id`, `tenant_id`, `branch_id`, `entry_number`, `entry_date`, `source_document_type` (`POS_SALE`, `PURCHASE_RECEIPT`, `SUPPLIER_PAYMENT`, `STOCK_WASTAGE`, `CASH_VARIANCE`), `source_document_id`, `memo`, `is_posted`, `posted_at`.
- `journal_lines`: `id`, `journal_entry_id`, `account_id`, `debit`, `credit`, `currency`, `exchange_rate` (1.00). Invariant: $\sum \text{Debit} = \sum \text{Credit}$.

#### 5. Offline Sync Outbox & Recovery
- `sync_outbox`: `operation_id` (UUID), `tenant_id`, `branch_id`, `device_id`, `operation_type` (`CREATE_ORDER`, `POST_PAYMENT`, `CLOSE_CASH_SESSION`, `RECORD_STOCK_MOVEMENT`), `payload_json`, `occurred_at`, `status` (`PENDING`, `SYNCED`, `RETRY_FAILED`, `CONFLICT`), `retry_count`, `error_message`.

---

## 5. Phased Implementation Roadmap

### Phase 1: Architecture, ER Schemas & Core Data Models (This Step)
- Establish the data dictionary, double-entry ledger rules, offline outbox protocol, and unified multi-tenant schema.

### Phase 2: Application Shell, Bilingual RTL Engine & Monorepo State
- Configure Tailwind CSS with Arabic typography (`Cairo`, `Plus Jakarta Sans`) and bidirectional layout (`dir="rtl"` / `dir="ltr"`).
- Build the top navigation bar following the Top Bar Contract (Wordmark, single-line links, primary actions).
- Implement the local store, mock persistent database, and client outbox with realistic Egyptian showcase data.

### Phase 3: Vertical Slice (Product $\to$ Order $\to$ Payment $\to$ Thermal E-Receipt $\to$ Outbox Sync $\to$ Journal Entry)
- Complete POS ordering view with category navigation, product cards, modifiers popup, and order ticket preview.
- Split-bill and multi-payment checkout (Cash with change calculation, Card, InstaPay/Vodafone Cash).
- Printable thermal receipt modal with Egyptian Tax Authority compliant QR code and breakdown.
- Automatic creation of the balanced double-entry voucher (`Debit 1010 Cash`, `Credit 4010 Revenue`, `Credit 2100 VAT`).

### Phase 4: Full POS Operations, Tables, Floor Plan & Cash Sessions
- Table floor layout with Dine-in table states (Available, Occupied, Bill Requested).
- Open/Close Cash Session modal with blind cash count, expected cash math, and variance journal posting (`Shortage/Over`).
- Order voids, cancellations, and manager PIN authorization workflows.

### Phase 5: Kitchen Display System (KDS) & Prep Stations
- Real-time station cards (Grill, Cold/Salad, Bar/Beverage) with color-coded ticket aging timers.
- Bump bar actions for line cook item completion and order ready alerts.

### Phase 6: Inventory, Recipes, Purchasing & Waste Management
- Ingredients catalog with unit conversions (kg to g) and minimum threshold alerts.
- Recipe builder with ingredient proportions and automatic food cost calculation.
- Stock movements log: automatic recipe depletion on POS order, purchase order receipting, and wastage logging.
- Inter-warehouse transfer and stock count reconciliation.

### Phase 7: Double-Entry Accounting Hub & Financial Reports
- Interactive Chart of Accounts browser with hierarchical tree.
- Immutable Journal Entry viewer showing balanced debit/credit voucher lines.
- Financial Statements: General Ledger, Trial Balance, Income Statement (P&L), Balance Sheet, and Tax Summary.

### Phase 8: SaaS Operator Console, HR & Production Readiness Verification
- SaaS operator dashboard for tenant management, subscription tiers, and device synchronization monitors.
- Employee directory, shift attendance, and payroll advance calculations.
- Rigorous TypeScript compile verification and error boundary checks.

---

## 6. Acceptance Criteria

1. **POS Operational Completeness**: Cashier can open a cash session, choose a table or takeaway, add menu items with modifiers, take partial or split payments, calculate change, print an invoice, and close the session with accurate variance calculation.
2. **Offline-First Resilience**: Transactions are durably saved to the local outbox immediately. Sync engine shows visual sync status indicator and can simulate offline mode without interrupting sales.
3. **Accounting Mathematical Invariant**: Every posted sale or procurement event generates a balanced journal voucher ($\sum \text{Debits} \equiv \sum \text{Credits}$).
4. **Inventory depleted via Recipes**: Finalizing a meal decrements the exact quantity of underlying ingredients from the branch warehouse stock balance.
5. **Bilingual Excellence**: Full seamless toggling between Arabic (RTL) and English (LTR) with preserved number formatting and tabular alignments.
6. **Zero-Pill Anti-Slop UI**: Clean typography, unboxed metadata separators, zero spurious status dots, and responsive desktop layout.
