# ARCHITECTURAL DECISION RECORDS (ADRs)

## ADR-001: Evolve Existing `greenshop` Modular Monolith (TanStack Start + Supabase PostgreSQL + Vercel)
- **Date:** 2026-11-28
- **Status:** Accepted (confirmed with stakeholder)
- **Context:** PRD §17.1 recommends Next.js + Java 21 / Spring Boot 3 + PostgreSQL + Flyway + Redis + Docker *"unless a strong technical reason justifies an alternative"*. The project already has a live, deployed TanStack Start + React 19 + TypeScript + Tailwind + shadcn/ui + TanStack Query + Supabase PostgreSQL + Vercel application covering ~45% of the PRD baseline (storefront, catalog, variants, COD orders, transactional inventory, returns, finance ledger, AI Writer, Photo-to-Product, Social Studio, Shopping Assistant).
- **Decision:** Keep and evolve the existing stack as a **Modular Monolith** with strict module boundaries under `src/lib/<domain>/` and numbered PostgreSQL migrations (`supabase/migrations/0023+`).
- **Consequences:** Eliminates months of greenfield rewrite, preserves live production data & Vercel CI/CD, keeps PostgreSQL + RLS + transactional SQL functions as the single source of truth, and lets us deliver ERP/Import/CRM/Meta/AI/Automation incrementally.

## ADR-002: Strict Single-Vendor Enforcement
- **Date:** 2026-11-28
- **Status:** Accepted
- **Context:** Early migrations (`0007`–`0015`) added optional marketplace/seller tables & columns in PostgreSQL, though no seller signup or vendor routes exist in `src/routes`. PRD §1.1 & §26 mandate **Single-Vendor ONLY** (one company owns all products, purchases, warehouses, and inventory).
- **Decision:** Never expose third-party seller onboarding or multi-vendor splits in UI or API. Keep legacy columns inert (never destructively edit already-applied migrations per repo rules), and build all new ERP/Supplier/Warehouse/Finance modules strictly single-vendor.

## ADR-003: Transactional `SECURITY DEFINER` PostgreSQL RPCs for Critical Operations
- **Date:** 2026-11-28
- **Status:** Accepted
- **Context:** Stock reservations, purchase order receiving, landed cost allocation, COD reconciliation, and role grants must be atomic and immune to concurrent race conditions or client tampering.
- **Decision:** All critical mutations execute inside PostgreSQL `SECURITY DEFINER` functions with `set search_path = public`, explicit RBAC checks (`public.has_permission(...)`), row-level locking (`FOR UPDATE`), and immutable audit logging.

## ADR-004: Exact Decimal Monetary & Immutable Historical FX Rules
- **Date:** 2026-11-28
- **Status:** Accepted
- **Context:** TND uses 3 decimal places (millimes) and China imports involve CNY/USD/EUR converted to TND over time.
- **Decision:** Store all TND amounts in `numeric(12,3)` and foreign unit costs / exchange rates in `numeric(14,4)`. Each Purchase Order and Import Shipment captures its own FX rate snapshot so later FX updates never alter historical COGS or P&L.

## ADR-005: Provider-Independent External Adapters & Human Approval Gate
- **Date:** 2026-11-28
- **Status:** Accepted
- **Context:** Tunisian delivery carriers, e-payment gateways, Meta APIs, and AI providers vary in API availability and require strict credential protection and financial safety.
- **Decision:**
  1. All external integrations live behind modular server adapters with explicit `not_configured` / `connected` / `error` states and manual/CSV fallbacks — never faked successes.
  2. All secrets are stored server-side only (`REVOKE ALL` on secret tables for `anon`/`authenticated` + masked hints in UI).
  3. Any AI-generated action impacting pricing, purchase orders, stock adjustments, refunds, or ad spend writes to `public.ai_approvals` and requires explicit human approval before execution.
