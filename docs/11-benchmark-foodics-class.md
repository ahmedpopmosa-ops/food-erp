# 11 — Benchmark against a Foodics-class restaurant platform

The product owner wants RestaurantOS to compare with **Foodics**, a cloud POS and restaurant-management
platform popular in the Gulf and Egypt. This document lists the capability areas such platforms are publicly
known for, and where RestaurantOS stands on each.

**This is a feature benchmark, not a copy.** We don't reuse Foodics' name, logo, screens, texts or other
assets. Our UI and code are our own.

**Not verified against Foodics' current offering.** The list comes from general knowledge of this product
category. Before using it for planning or sales, check it against Foodics' public website and a live demo
account. Rows marked *(verify)* are especially uncertain.

Status key: ✅ built and tested · 🟡 partial · ⏳ planned (phase) · ❌ not planned yet

| Area | Typical Foodics-class capability | RestaurantOS today |
|---|---|---|
| **Cashier POS** | Fast product grid by category, search, modifiers/combos, notes | 🟡 Logic ✅ (orders, modifiers, pricing, VAT, finalize) · **screens not built** (need Rust/Tauri or a browser POS) · combos ❌ |
| | Dine-in / takeaway / delivery / drive-thru order types | 🟡 dine-in (tables, guests, service charge) / takeaway / delivery / phone ✅ · drive-thru ❌ |
| | Tables & floor plan, transfer, merge, split bills | ✅ logic + table API · floor-plan editor UI ❌ · open orders not shared across tills |
| | Discounts, coupons, service charge, tips | ✅ line/order discounts with approval limit, service charge · coupons ⏳ 7 · tips ❌ |
| | Multiple payment methods, split tender, change | ✅ |
| | Works offline, syncs later | ✅ (outbox, idempotent sync, crash-tested) — stronger guarantees than typical *(verify)* |
| | Cash drawer: open/close till, pay-in/out, variance | ✅ |
| | Refunds / voids with manager approval | ✅ refunds, voids (sent items need a manager PIN), cancel after kitchen |
| | Customer display, receipt & kitchen printers | 🟡 receipt + kitchen ticket (text, emulator) ✅ · Arabic raster ⏳ · customer display ❌ |
| **Kitchen** | Kitchen Display System, stations, timers | 🟡 KDS with stations (category routing), timers, delay highlight, voids and cancellations, audited states ✅ · online only (no LAN mode), no item-level states/courses, no bump bar or sound ❌ |
| **Menu management** | Central menu, branch prices, scheduled price changes, combos, timed menus | 🟡 central menu + branch/channel/scheduled prices ✅ · combos/timed menus ❌ |
| **Inventory** | Ingredients, recipes, stock counts, transfers, wastage, purchasing, suppliers | 🟡 items, versioned recipes, counts, inter-branch transfers, wastage, opening balances ✅ (API) · suppliers, purchase orders with approval, goods receipts with freight, supplier invoices (3-way match), returns, supplier payments ✅ (API) · dashboard screens for all of these ✅ (Arabic/English, checked by hand) · supplier credit notes ❌ |
| | Costing, theoretical vs actual consumption | 🟡 weighted-average COGS posted per sale ✅ · count differences ✅ · theoretical-vs-actual report ⏳ 6–7 |
| **Accounting** | Integrations with external accounting tools *(verify)* | Built-in double-entry ledger ✅ (sales, refunds, cash, stock, purchasing) · manual entries, reversals, period close, year close, P&L / balance sheet / cash flow / GL, sub-ledger reconciliation, bank reconciliation ✅ (API + screens) · export to external tools ❌ — **RestaurantOS goes further here by design** |
| | VAT invoices, e-invoicing (ZATCA KSA / ETA Egypt) | 🟡 VAT 14% ✅ · ETA e-receipt adapter ⏳ (doc 09 Q1) · ZATCA ❌ |
| **Multi-branch & reports** | Dashboard: sales by branch/product/employee/payment, live sales | 🟡 sales list + journal + trial balance ✅ · analytics reports ⏳ 7 |
| **People** | Employees, roles, permissions, attendance/shifts | 🟡 employees + POS roles + PINs ✅ (API) · attendance/shifts ⏳ 7 |
| **Customers & loyalty** | Customer profiles, loyalty, gift cards | ⏳ 7 · gift cards ❌ |
| **Channels** | Online ordering / QR menu / ordering kiosk | ❌ not in brief — candidate addition |
| | Delivery aggregator integrations (Talabat, HungerStation, Jahez…) *(verify list)* | ❌ adapter interface only (doc 01) |
| **Payments** | Integrated card terminals / own payment product | ❌ (semi-integrated adapter later, doc 05 §6) |
| **Platform** | App marketplace / open API for partners | 🟡 versioned REST + OpenAPI ✅ · partner API keys/webhooks ❌ |
| | Multi-tenant SaaS, subscriptions, onboarding | 🟡 tenancy + onboarding ✅ · billing ⏳ 7 |

## Biggest gaps to close for a credible Foodics-class product
1. **POS screens** (touch-first cashier UI in Arabic). Needs the Rust toolchain for the Tauri shell; a browser
   POS mode could ship earlier.
2. ~~Modifiers, discounts, tables and floor plan, split/merge~~: logic done in Phase 4b. Next is a dashboard UI for them,
   plus shared open orders across tills (a LAN or online "live order" mode).
3. ~~**Kitchen display**~~: done in Phase 7a (online). Next: offline/LAN mode and station-routed kitchen printing.
4. ~~Inventory, recipes and purchasing~~: stock ledger and COGS (Phase 5a) and purchasing with supplier
   payables (Phase 5b) are done, with dashboard screens.
5. **Reports dashboard** (sales by hour, item, employee, branch).
6. **Channels not in the original brief:** QR menu or online ordering, and delivery-aggregator integrations.
   These are commercially important in Egypt and the Gulf and need a scope decision (doc 09 Q11).

## Question for the product owner
**Q11:** Which of these should move ahead of the current phase order? Options include POS screens first,
kitchen display earlier, adding online ordering or aggregators to scope, and e-invoicing (ETA) before launch.
