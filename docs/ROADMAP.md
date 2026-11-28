# DEVELOPMENT ROADMAP (PHASE 0 → LOT 7)

Execution follows an incremental, test-gated approach. Every lot ships with real database migrations, server logic, bilingual FR/AR UI, RBAC enforcement, automated/E2E verification, and a `PROGRESS.md` update before moving to the next lot.

---

## Phase 0 — Architecture & Continuity Foundation (CURRENT)
- Full PRD analysis & gap audit against existing `greenshop`.
- Establish `/docs/` continuity pack (`PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `ROADMAP.md`, `PROGRESS.md`, `DECISIONS.md`, `TESTING.md`).
- Confirm stack & lot sequence with stakeholders.

## Lot 1 — RBAC (10 Roles), Audit Logs & Complete E-Commerce Front Office
1. Fix Shopping Assistant public stock lookup (`get_variant_availability` RPC) & verify guest "+ Panier" + AR flows.
2. Migration `0023_rbac_audit_and_storefront_plus.sql`: 10-role RBAC matrix (`super_admin`..`analyst`), granular `module.action` permissions, `audit_logs` viewer, `brands`, `collections`, `wishlists`, `newsletter_subscribers`, `homepage_sections`, product SEO/weight/barcode/video fields.
3. Admin UI: Roles & Permissions matrix + Audit Log table in `/admin/settings`; Brands & Homepage CMS config; Product CSV export/import, duplicate product, bulk price/stock editor, barcode field.
4. Storefront UI: Configurable homepage sections (bestsellers, new arrivals, promos, recently viewed, testimonials, newsletter), Wishlist (`/my-wishlist`), Buy Now 1-click checkout, search autocomplete, dynamic `/sitemap.xml`, `/robots.txt`, and Schema.org Product JSON-LD.

## Lot 2 — China ERP: Suppliers, Purchasing, Imports, Landed Cost & Warehouse
1. Migration `0024_erp_suppliers_purchases_imports.sql`: Central warehouse, multi-currency exchange rates (CNY/USD/EUR → TND historical snapshots), `suppliers`, `purchase_orders`, `import_shipments`, `import_expenses`, `landed_cost_allocations`, `stock_batches`, `physical_inventory_counts`.
2. Admin Modules:
   - `/admin/suppliers` — Supplier directory, ratings, payment terms, documents, payment ledger.
   - `/admin/purchases` — Multi-currency Purchase Orders (`DRAFT → SENT → CONFIRMED → PARTIALLY_RECEIVED → RECEIVED → CLOSED`) with partial receiving into inventory.
   - `/admin/imports` — Import Shipments (`PREPARING → SHIPPED → IN_TRANSIT → CUSTOMS → ARRIVED → COMPLETED`), expense capture (freight, customs, insurance, handling), **Landed Cost Calculator** (allocate by quantity, weight, volume, value, or manual) writing immutable batch landed cost in TND.
   - `/admin/inventory` upgrade — Physical vs Reserved vs Available clarity, batch & barcode/QR generation, physical count adjustment, **Replenishment Suggestions** (creates `DRAFT` PO only, never auto-sends).

## Lot 3 — Delivery Adapters, COD Reconciliation, CRM & Notifications
1. Migration `0025_delivery_crm_notifications.sql`: Configurable `delivery_providers` (API + manual/CSV adapters), `delivery_shipments`, `cod_reconciliation_batches`, `payment_providers`; CRM segments, customer 360° notes, consents, loyalty points; FR/AR `notification_templates` & in-app `notifications`.
2. Admin Modules:
   - `/admin/delivery` — Carrier adapters (Aramex/First Delivery/Navex/Custom CSV), shipment creation, CSV bulk export/import, COD cash reconciliation report (collected vs carrier fee vs net payable).
   - `/admin/orders` upgrade — Full PRD status workflow (`NEW → PENDING_CONFIRMATION → CONFIRMED → PROCESSING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED` + `FAILED_DELIVERY`/`RETURN_REQUESTED`/`REFUNDED`) with transition guards and phone-confirmation notes.
   - `/admin/customers` upgrade — Auto/manual segmentation (New, Returning, VIP, Inactive, Frequent Returns, Abandoned Cart), Customer 360° Timeline, consent/unsubscribe management.
   - Header Notification Center + `/admin/notifications` bilingual templates.

## Lot 4 — Marketing Center & Official Meta Integration
1. Migration `0026_marketing_meta_abandoned_carts.sql`: `integration_configs`, `integration_logs`, `meta_catalog_sync_logs`, `meta_events_log`, `meta_ad_snapshots`, `marketing_campaigns`, `abandoned_carts`.
2. Features:
   - `/admin/marketing` — Campaigns manager (launch, flash sale, seasonal, retargeting) & Abandoned Cart Recovery list + reminder triggers.
   - `/admin/marketing/meta` — Meta Business config (Pixel ID, CAPI Access Token, Ad Account ID, Catalog ID) with real connection test, browser Meta Pixel + server-side Conversions API deduplication (`PageView`, `ViewContent`, `Search`, `AddToCart`, `InitiateCheckout`, `Purchase`), live `/api/meta-catalog.xml` feed, and Ads Manager performance table (Spend, Impressions, Clicks, CTR, CPC, CPM, ROAS) with human approval gate on budget edits.

## Lot 5 — Dedicated AI Center & Human Approval System
1. Migration `0027_ai_center_and_approvals.sql`: `ai_usage_logs`, `ai_recommendations`, `ai_approvals`.
2. `/admin/ai-center`:
   - AI Dashboard (usage stats, generated content count, pending approvals, provider config).
   - **AI Business Analyst** connected to real validated SQL aggregations (profitability, dead stock, best categories, repeat buyers, reorder advice — zero invented figures).
   - **AI Demand Forecasting** (historical velocity + supplier lead time + confidence band).
   - **AI Pricing Assistant** (landed cost + current margin + suggested TND price → submits to Approval Queue, never changes live price directly).
   - **Human Approval Queue** (Approve / Reject with full diff & audit log).

## Lot 6 — Automation Engine, Finance P&L & BI Analytics
1. Migration `0028_automation_engine_and_finance_pnl.sql`: `automation_workflows`, `automation_executions`, `automation_step_logs`, `operating_expenses`, `tax_settings`, `scheduled_reports`.
2. `/admin/automations` — Visual Workflow Builder (Triggers, Conditions, Delays, Actions, active toggle, manual test run, execution logs & retries) + prebuilt templates (New Order, Low Stock, Delivered Review Request, Abandoned Cart).
3. `/admin/finances` upgrade — Operating expenses, configurable Tunisian tax settings, true **P&L Statement** (`Net Sales - COGS = Gross Profit; Gross Profit - Operating Expenses = Estimated Net Profit`), cashflow vs outstanding COD.
4. `/admin/analytics` — Dedicated BI Dashboard (Sales, Inventory, Marketing ROAS/CAC, Operational delivery/return rates) + CSV/Excel/PDF printable exports.

## Lot 7 — Production Hardening, Security Audit & Full E2E QA
- Unit & integration test suite (Vitest: landed cost math, stock reservation invariants, P&L calculations, RBAC matrix).
- Full security & RLS verification (verify every restricted role & anonymous endpoint).
- Responsive FR (LTR) & AR (RTL) audit across all modules.
- Production deployment verification & complete technical/user handoff documentation.
