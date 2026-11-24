# Project rules (weshop)

- The Supabase project is user-managed (project ref `msjlwxjsmijwnyywhknf`). The schema lives in
  `supabase/migrations/*.sql`; apply it with `npm run db:push` (Supabase CLI) or paste
  `supabase/bootstrap.sql` into the Supabase SQL editor. Never edit migrations that were already
  applied — add a new numbered file instead. Why: the database must be reproducible from git.
- `src/integrations/supabase/types.ts` is generated from the live database; regenerate it with
  `npm run db:types` after schema changes. Why: hand-written types drift from the real schema.
- Critical business operations (orders, stock moves, cash collection, returns, role grants) run only through SECURITY DEFINER database functions; clients never write orders/inventory/finance tables directly. Why: guarantees each stock reservation, release, restock and accounting entry happens exactly once.
- Every product sells through variants; a product without options gets one default variant. Why: stock, cost and order lines stay uniform per variant.
- Purchase costs live in admin-only tables (`product_private`, `variant_costs`), never on public catalog rows. Why: public catalog reads must not expose margins.
- Catalog images go in the private `catalog` bucket with long-lived signed links stored on the row. Why: images must render for anonymous shoppers without a public bucket.
- Bilingual content uses `_fr` / `_ar` column pairs read through `pickLocale`; UI strings use `useI18n().t` or `tr(fr, ar)`. Why: French default with Arabic RTL everywhere.
- Public storefront reads go through `src/lib/catalog.functions.ts` server functions with the publishable key so pages render on the server. Why: SEO and fast first paint.
- AI product copy is generated only through the admin-gated `generateDescription` server function (`src/lib/ai-description.functions.ts` → `src/lib/ai/description.server.ts`), driven by admin-managed rows in `description_templates`; the reusable `DescriptionGenerator` component exposes `onApply` so the product form can reuse it. Why: prompts and the AI key stay server-side, and writing styles stay editable without code changes.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, Supabase access token) are server-only environment variables. Never add them to `.env` with a `VITE_`/`NEXT_PUBLIC_` prefix, never commit `.env`. Why: Vite-inlined variables end up in the browser bundle.
- The app is a TanStack Start app (React 19 + Vite 8), not Next.js or a plain SPA: routes are file-based under `src/routes`, `NEXT_PUBLIC_*` variables only work because `envPrefix` exposes them — prefer `VITE_*`.
