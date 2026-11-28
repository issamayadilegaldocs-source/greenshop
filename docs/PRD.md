# PRODUCT REQUIREMENTS DOCUMENT (PRD)
# ENTERPRISE E-COMMERCE & INTELLIGENT BUSINESS MANAGEMENT PLATFORM

- **Market:** Tunisia (TND — millimes precision `0.001`)
- **Platform Brand:** Maison Noura (`greenshop`)
- **Type:** Single-Vendor E-Commerce + ERP + CRM + AI Center + Marketing & Automation
- **Languages:** French (LTR, default) & Arabic (RTL, mandatory across all modules)
- **Version:** 1.0

---

## 1. Vision & Business Lifecycle

Centralize the entire business lifecycle of a Tunisian single-vendor company importing products primarily from China and selling directly to Tunisian consumers:

```
Supplier → Importation → Purchasing → Warehouse → Inventory → E-Commerce → Customer → Payment (COD / E-Pay) → Delivery → Accounting → Analytics → Marketing & Automation
```

### Mandatory Business Rules (Non-Negotiable)
1. **Single-Vendor only** — no third-party seller onboarding; one company owns all catalog, purchases, warehouses, inventory, and sales.
2. **TND sales currency** (`numeric(12,3)`) + **configurable foreign currencies** (CNY, USD, EUR) for international purchasing with immutable historical exchange rates.
3. **Bilingual French (LTR) + Arabic (RTL)** everywhere (storefront, admin, notifications, templates, reports).
4. **Cash on Delivery (COD)** is a first-class payment method alongside configurable Tunisian electronic payment adapters.
5. **Transactional inventory** separating Physical, Reserved, and Available stock (`available = physical - reserved`) with full movement auditability.
6. **Human approval gate** for all sensitive AI or commercial actions (pricing changes, purchase orders, refunds, stock adjustments, ad budgets, publishing campaigns).
7. **No fake integrations or simulated successes** — unconfigured external APIs must show explicit configuration state, manual/CSV workflows, and real error visibility.

---

## 2. Four Core Interfaces

| Interface | Target Users | Primary Scope |
|---|---|---|
| **A. E-Commerce Front Office** | Tunisian shoppers (guest & registered) | Configurable homepage, bilingual catalog, search/filters, wishlist, cart, COD/e-pay checkout, order tracking, customer account, AI shopping assistant |
| **B. Admin Back Office** | Internal team (10 RBAC roles) | KPI dashboard, products/variants/CSV/barcodes, China suppliers/POs/imports/landed cost, warehouse/inventory/replenishment, orders/delivery adapters/COD reconciliation, CRM/segments/timeline, finance/P&L, BI reports |
| **C. AI Center** | Admin, Product, Marketing, Analyst | AI dashboard & usage logs, AI Product & Photo Studio, AI Business Analyst (real DB SQL metrics), Demand Forecasting, Pricing Suggestions, AI Marketing & Support, Human Approval Queue |
| **D. Marketing & Automation Center** | Marketing Manager, Admin | Meta Business integration (Pixel, CAPI, Catalog feed, Ads Manager analytics), Campaigns, Abandoned Cart Recovery, Visual Workflow Automation Engine (Triggers → Conditions → Delays → Actions + execution logs) |

---

## 3. Target User Roles (RBAC — 10 Roles)

| Role | Code | Core Scope |
|---|---|---|
| Super Admin | `super_admin` | Complete system access, roles & security |
| Administrator | `admin` | General business management |
| Product Manager | `product_manager` | Products, categories, brands, attributes, pricing |
| Purchasing Manager | `purchasing_manager` | Suppliers, purchase orders, imports, landed cost |
| Warehouse Manager | `warehouse_manager` | Inventory, stock movements, transfers, physical counts |
| Order Manager | `order_manager` | Orders, confirmations, preparation, delivery |
| Accountant | `accountant` | Financial ledger, COD reconciliation, P&L, tax & exports |
| Marketing Manager | `marketing_manager` | Campaigns, CRM, Meta integration, abandoned carts |
| Customer Support | `customer_support` | Customers, complaints, returns, support tickets |
| Analyst | `analyst` | Read-only analytics, BI dashboards, reports |

---

## 4. Reference Map to Project Docs

- System Architecture & Module Map: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Database Schema & Migrations: [DATABASE.md](./DATABASE.md)
- Server Functions, RPC & API Contracts: [API.md](./API.md)
- Phased Delivery Roadmap: [ROADMAP.md](./ROADMAP.md)
- Live Progress Tracker: [PROGRESS.md](./PROGRESS.md)
- Architectural Decisions (ADRs): [DECISIONS.md](./DECISIONS.md)
- Testing & QA Protocol: [TESTING.md](./TESTING.md)
