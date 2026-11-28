# PROJECT PROGRESS TRACKER

Last Updated: **2026-11-28**

## Overall Status

| Phase / Lot | Status | Notes |
|---|---|---|
| **Baseline (`greenshop` live)** | **DONE** | Single-vendor FR/AR storefront, catalog, variants, COD checkout, orders, inventory reservations, returns, finances ledger, configurable AI keys, AI Writer, Photo-to-Product, Social/Video Studio, Shopping Assistant. |
| **Phase 0 — Architecture & `/docs/*`** | **DONE** | All 8 continuity & architecture documents created and committed (`80dba4a`). |
| **Lot 1 — RBAC (10 Roles), Audit & E-Commerce Plus** | **DONE** | 100% live E2E verified (0 errors). |
| **Lot 2 — China ERP (Suppliers, POs, Imports, Landed Cost)** | **DONE (verifying live)** | Migration `0026` applied live: Warehouses, Historical FX Rates (CNY/USD/EUR→TND), China/Local Suppliers + Payments (`/admin/suppliers`), Multi-Currency POs + Partial/Full Receiving into traceable Stock Batches + Replenishment Suggestions (`/admin/purchases`), Import Shipments + Multi-Currency Import Expenses + 5-Method Landed Cost Calculator (`/admin/imports`), + 5 Landed Cost/Replenishment unit tests. |
| **Lot 3 — Delivery Adapters, COD Recon, CRM & Notifications** | **NEXT** | Migration `0027`, Carrier adapters + CSV, COD reconciliation, CRM segments & 360° timeline, FR/AR notifications. |
| **Lot 4 — Marketing & Meta Integration** | Pending | Migration `0026`, Meta Pixel + CAPI + Catalog XML feed + Ads stats, Campaigns, Abandoned Cart recovery. |
| **Lot 5 — AI Center & Human Approvals** | Pending | Migration `0027`, AI Center dashboard, AI Business Analyst (real SQL), Demand Forecasting, Pricing Assistant, Approval Queue. |
| **Lot 6 — Automation Engine, Finance P&L & BI** | Pending | Migration `0028`, Visual Automation Builder + logs, Operating Expenses + P&L + Tax, BI Dashboard + Exports. |
| **Lot 7 — Production Hardening & Full E2E QA** | Pending | Full Vitest suite, RLS security audit, full FR/AR E2E verification, deployment sign-off. |

---

## Completed Lot 1 Deliverables

- [x] Fixed Shopping Assistant guest stock lookup (`get_variant_availability` RPC + refined FR/AR promo & budget matching)
- [x] Migration `0023_rbac_audit_and_storefront_plus.sql` applied live & bundled into `supabase/bootstrap.sql`
- [x] 10 PRD RBAC roles (`super_admin`..`analyst`) + 25 granular permissions + `has_permission()` + `get_my_rbac_profile()` + `useAuth().can()`
- [x] Immutable Audit Log enhancement (`log_audit_event()`) & Admin Audit Log viewer (`/admin/settings` → Journal d'audit)
- [x] Configurable Homepage CMS (`homepage_sections` table + `/admin/settings` → Page d'accueil CMS + live rendering in `/`)
- [x] Storefront Plus: Wishlist (`/wishlist` + ProductCard & Product Detail heart), Buy Now, Recently Viewed, Search Autocomplete, Newsletter subscription, Customer Testimonials
- [x] Technical SEO: dynamic `/sitemap.xml`, `/robots.txt`, Schema.org Product JSON-LD
- [x] Admin Products Plus: Duplicate product RPC, UTF-8 CSV Export, Bulk Price Adjustment with audit log, Barcode / Weight / Dimensions / Video URL / SEO Meta Title & Description
- [x] Unit tests (`src/lib/lot1.test.ts`)
