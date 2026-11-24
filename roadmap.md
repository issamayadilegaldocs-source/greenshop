# weshop roadmap

- [x] Infra — dropped the Lovable-managed backend: own Supabase project, schema + RLS + RPCs + storage in `supabase/migrations/`, env-based configuration
- [x] Phase 1 — Cloud, database schema, auth, roles, RLS, first-admin setup
- [x] Phase 2 — Admin layout, dashboard, dynamic categories + attributes
- [ ] Phase 3 — Products, images, dynamic attributes, variants, inventory (embed DescriptionGenerator in the product form via onApply)
- [ ] Phase 4 — Storefront: home, shop, search, filters, product page, cart
- [ ] Phase 5 — COD checkout, create_order, stock reservation, tracking, admin orders
- [ ] Phase 6 — Returns, reviews, cash collection, finance dashboard
- [ ] Phase 7 — Testing, security review, responsive polish

- [x] Answer: suggest a good next step after the remix (user question)
- [x] AI product description writer with admin-managed templates (user request)
- [x] Fill the shop with an editable demo catalog (categories, attributes, products, variants, stock, images) (user request — ships in `supabase/migrations/0006_seed_demo_catalog.sql`)
