# PROJECT PROGRESS TRACKER

Last Updated: **2026-11-28**

## Overall Status

| Phase / Lot | Status | Notes |
|---|---|---|
| **Baseline (`greenshop` live)** | **DONE** | Single-vendor FR/AR storefront, catalog, variants, COD checkout, orders, inventory reservations, returns, finances ledger, configurable AI keys, AI Writer, Photo-to-Product, Social/Video Studio, Shopping Assistant (deployed on Vercel + Supabase `msjlwxjsmijwnyywhknf`). |
| **Phase 0 — Architecture & `/docs/*`** | **DONE** | All 8 continuity & architecture documents created and aligned on TanStack Start + Supabase Postgres Modular Monolith. |
| **Lot 1 — RBAC (10 Roles), Audit & E-Commerce Plus** | **NEXT** | Includes fixing Shopping Assistant public stock check (`get_variant_availability`), 10-role RBAC + Audit Logs, Brands, Wishlist, Homepage CMS, SEO (`sitemap.xml`, `robots.txt`, JSON-LD), Product CSV/Bulk/Duplicate/Barcode. |
| **Lot 2 — China ERP (Suppliers, POs, Imports, Landed Cost)** | Pending | Migration `0024`, Suppliers, Multi-currency POs, Shipments, Landed Cost calculator, Warehouse batches & Replenishment. |
| **Lot 3 — Delivery Adapters, COD Recon, CRM & Notifications** | Pending | Migration `0025`, Carrier adapters + CSV, COD reconciliation, CRM segments & 360° timeline, FR/AR notifications. |
| **Lot 4 — Marketing & Meta Integration** | Pending | Migration `0026`, Meta Pixel + CAPI + Catalog XML feed + Ads stats, Campaigns, Abandoned Cart recovery. |
| **Lot 5 — AI Center & Human Approvals** | Pending | Migration `0027`, AI Center dashboard, AI Business Analyst (real SQL), Demand Forecasting, Pricing Assistant, Approval Queue. |
| **Lot 6 — Automation Engine, Finance P&L & BI** | Pending | Migration `0028`, Visual Automation Builder + logs, Operating Expenses + P&L + Tax, BI Dashboard + Exports. |
| **Lot 7 — Production Hardening & Full E2E QA** | Pending | Vitest suite, RLS security audit, full FR/AR E2E verification, deployment sign-off. |

---

## Completed Baseline Deliverables (Pre-PRD Foundation)

- [x] Bilingual FR (LTR) + AR (RTL) Storefront & Admin (`src/lib/i18n.tsx`)
- [x] Supabase PostgreSQL schema (`0001`–`0022`) + `bootstrap.sql` bundler + generated types
- [x] Transactional order creation, stock reservation/release/restock, COD payment recording, returns RLS fix
- [x] Admin Dashboard, Categories & Attributes, Products & Variants, Inventory, Orders, Returns, Reviews, Finances, Customers, Settings
- [x] Configurable AI Provider Settings (`0022_ai_provider_settings.sql` + `/admin/settings` UI + OpenAI connection test)
- [x] AI Description Writer FR/AR (`/admin/ai-writer`)
- [x] 1-Click Photo-to-Product AI + Studio/Lifestyle Marketing Photos (`PhotoToProductCard.tsx`)
- [x] Social & Promo Video Reels Studio (`/admin/social-studio` + Kling 2.1 Fal/Replicate integration)
- [x] Storefront AI Shopping Assistant (`ShoppingAssistant.tsx` — signed-in order tracking verified; guest stock RPC fix queued at top of Lot 1)

## Known Open Defect Carried Into Lot 1
- [ ] **Shopping Assistant guest stock check (`src/lib/ai-assistant.functions.ts`):** Direct join on `inventory(available)` is hidden by RLS for `anon`, causing guest assistant product cards to show `in_stock: false`. Fix: use `sb.rpc("get_variant_availability", { _product_ids })` (same pattern as `src/lib/shop.functions.ts`).
