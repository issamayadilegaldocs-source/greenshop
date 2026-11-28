# API, SERVER FUNCTIONS & RPC CONTRACTS

All client-to-backend communication uses:
1. **TanStack Start Typed Server Functions (`src/lib/*.functions.ts`)** validated with Zod schemas and authenticated via `requireSupabaseAuth` (admin/customer) or `optionalAuthClient` (public storefront).
2. **Nitro HTTP Endpoints (`src/routes/api/*`)** for machine-to-machine routes (SEO XML sitemap, robots.txt, Meta product catalog feed, CAPI relay, delivery/payment webhooks).
3. **PostgreSQL `SECURITY DEFINER` RPCs** for atomic transactional mutations.

---

## 1. Existing Live Endpoints & Server Functions

### Storefront (`src/lib/catalog.functions.ts`, `src/lib/shop.functions.ts`)
- `getPublicCategories()`, `getStoreSettings()`
- `getHomeCatalog()`, `getShopCatalog(filters)`, `getProductBySlug(slug)`
- `validatePromoCode(code, subtotal)`
- `createStoreOrder(payload)` → calls `public.create_order(...)` (reserves stock atomically, links `user_id` when authenticated)
- `trackStoreOrder(reference, phone)` → calls `public.track_order(...)`

### AI & Config (`src/lib/ai-*.functions.ts`)
- `getAiSettingsStatus()` (Admin) / `saveAiSettings(payload)` (Admin) / `testAiConnection(candidate)` (Admin)
- `generateDescription(input)` (Admin)
- `analyzeProductPhoto(input)` (Admin) / `generateMarketingPhoto(input)` (Admin)
- `generateSocialPack(input)` (Staff/Admin)
- `startAiProductVideo(input)` / `pollAiProductVideo(input)` (Staff/Admin)
- `getAssistantStatus()` (Public) / `sendAssistantMessage(messages, locale)` (Public + optional customer JWT)

---

## 2. Planned Contracts by Lot

### Lot 1 — RBAC, Audit & Storefront Plus
- `src/lib/rbac.functions.ts`: `getMyPermissions()`, `listRolesAndPermissions()`, `updateRolePermissions()`, `assignUserRbacRole()`, `listAuditLogs(filters)`
- `src/lib/storefront-cms.functions.ts`: `getHomepageSections()`, `saveHomepageSections()`, `toggleWishlist(productId)`, `subscribeNewsletter(email)`, `listBrands()`, `saveBrand()`
- `src/routes/sitemap[.]xml.ts` (`GET /sitemap.xml`) & `src/routes/robots[.]txt.ts` (`GET /robots.txt`)

### Lot 2 — ERP China Import, Purchasing & Landed Cost
- `src/lib/erp/suppliers.functions.ts`: `listSuppliers()`, `saveSupplier()`, `getSupplierProfile(id)`, `recordSupplierPayment()`
- `src/lib/erp/purchasing.functions.ts`: `listPurchaseOrders()`, `createPurchaseOrder()`, `transitionPurchaseOrder()`, `receivePurchaseOrderItems()`
- `src/lib/erp/imports.functions.ts`: `listExchangeRates()`, `saveExchangeRate()`, `listImportShipments()`, `saveImportShipment()`, `addImportExpense()`, `calculateAndApplyLandedCost(shipmentId, method)`
- `src/lib/erp/replenishment.functions.ts`: `getReplenishmentSuggestions()`, `createDraftPoFromSuggestions()` (always creates `DRAFT` PO requiring human approval)

### Lot 3 — Delivery Adapters, COD Reconciliation, CRM & Notifications
- `src/lib/delivery.functions.ts`: `listDeliveryProviders()`, `saveDeliveryProvider()`, `createDeliveryShipment()`, `importDeliveryCsv()`, `exportOrdersForCarrierCsv()`, `reconcileCodBatch()`
- `src/lib/crm.functions.ts`: `listCustomerSegments()`, `getCustomer360(customerId)`, `addCustomerNote()`, `updateCustomerConsent()`
- `src/lib/notifications.functions.ts`: `listNotifications()`, `markNotificationRead()`, `listNotificationTemplates()`, `saveNotificationTemplate()`

### Lot 4 — Marketing & Meta Center
- `src/lib/meta.functions.ts`: `getMetaIntegrationStatus()`, `saveMetaConfig()`, `testMetaConnection()`, `syncMetaCatalog()`, `fetchMetaAdInsights()`, `sendCapiEvent(event)`
- `src/routes/api/meta-catalog[.]xml.ts` (`GET /api/meta-catalog.xml` — live Meta/Google Shopping XML product feed)
- `src/lib/marketing.functions.ts`: `listCampaigns()`, `saveCampaign()`, `listAbandonedCarts()`, `trackAbandonedCart()`, `triggerCartRecovery()`

### Lot 5 — AI Center & Human Approval Queue
- `src/lib/ai-center.functions.ts`: `getAiCenterOverview()`, `askAiBusinessAnalyst(question)` (runs validated read-only SQL/RPC aggregations — never fabricates figures), `generateDemandForecast()`, `generatePricingRecommendations()`, `listAiApprovals()`, `approveOrRejectAiAction(id, decision)`

### Lot 6 — Automation Engine, Finance P&L & BI Reports
- `src/lib/automation.functions.ts`: `listWorkflows()`, `saveWorkflow()`, `toggleWorkflow()`, `runWorkflowManually()`, `listWorkflowExecutions()`
- `src/lib/finance.functions.ts`: `listOperatingExpenses()`, `saveOperatingExpense()`, `getProfitAndLossReport(range)`, `exportReportCsv(type, range)`
- `src/lib/analytics.functions.ts`: `getBiDashboard(range)` (Sales, Inventory, Marketing, Operational KPIs)
