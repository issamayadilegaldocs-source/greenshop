# TESTING & QUALITY ASSURANCE PROTOCOL

Every lot must pass all applicable quality gates before being marked `DONE` in [PROGRESS.md](./PROGRESS.md).

---

## 1. Automated Verification Commands

```powershell
# TypeScript strict check
npm run typecheck

# ESLint check
npm run lint

# Unit & integration tests (Vitest)
npm run test

# Production SSR + client build
npm run build

# Rebuild consolidated Supabase bootstrap script after any migration
npm run db:bundle
```

---

## 2. Test Layers

### A. Unit Tests (`src/**/*.test.ts` — Vitest)
- Landed cost allocation math (by quantity, weight, volume, value, manual) + multi-currency CNY/USD/EUR → TND conversion rounding (`0.001`).
- P&L calculations (`Net Sales - COGS = Gross Profit`, `Gross Profit - Operating Expenses = Net Profit`).
- Stock reservation invariants (`available = physical - reserved`, non-negative checks).
- Order & PO state machine transition guards (rejecting invalid transitions).
- Automation condition evaluator & retry backoff logic.
- RBAC permission resolution for all 10 roles.

### B. Database & RLS Security Checks
- Verify every new table has `ENABLE ROW LEVEL SECURITY`.
- Verify secret tables (`ai_provider_settings`, `integration_configs`) have `REVOKE ALL FROM anon, authenticated`.
- Verify non-privileged customer & restricted staff roles receive `forbidden` / `0 rows` on unauthorized tables/RPCs.
- Verify `audit_logs` records sensitive operations and cannot be updated/deleted by non-super-admins.

### C. Live End-to-End Browser QA (`https://greenshop-drab.vercel.app`)
Run real browser journeys after each lot deployment in **both French (LTR) and Arabic (RTL)**:
1. Storefront browse, search, filters, wishlist, cart, guest & registered COD checkout, order tracking, Shopping Assistant (`+ Panier` + order lookup).
2. Admin RBAC login & restricted module checks.
3. ERP cycle: Create Supplier → Create China PO (CNY) → Create Import Shipment → Add freight/customs → Calculate Landed Cost (TND) → Receive into Inventory → Verify stock batch & product landed cost.
4. Order & Delivery cycle: Confirm COD order → Pack → Create Carrier Shipment / CSV export → Deliver → Reconcile COD payment → Verify Finance P&L.
5. Marketing, AI Center (Analyst + Approval Queue), Automation trigger execution & logs.

### D. Zero-Regression Gate
- 0 console errors
- 0 unhandled HTTP 5xx responses
- 0 broken images
- Verified responsive layout on desktop & mobile, LTR & RTL.
