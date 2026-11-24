-- =========================================================
-- weshop marketplace — public search + row-level security
-- Sellers only ever see their own shop, listings, order lines,
-- returns and settlements. Public reads stay published-only.
-- =========================================================

-- ---------- PUBLIC: storefront search (seller-approved only) ----------
create or replace function public.search_products(
  _q text default null,
  _category_id uuid default null,
  _filters jsonb default '{}'::jsonb,
  _sort text default 'relevance',
  _limit int default 24,
  _offset int default 0,
  _min_price numeric default null,
  _max_price numeric default null
) returns table (product_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  with recursive category_tree as (
    select c.id
    from public.categories c
    where c.id = _category_id
    union all
    select c.id
    from public.categories c
    join category_tree t on c.parent_id = t.id
  ),
  base as (
    select
      p.id,
      p.category_id,
      p.name_fr,
      p.name_ar,
      p.sku,
      p.brand,
      p.is_featured,
      p.rating_avg,
      p.rating_count,
      p.created_at,
      coalesce(p.published_at, p.created_at) as listed_at,
      coalesce(vp.min_variant_price, coalesce(p.promo_price, p.price)) as effective_price,
      coalesce(sold.total, 0)::bigint as sold,
      lower(btrim(coalesce(_q, ''))) as q_key,
      case
        when coalesce(nullif(btrim(_sort), ''), 'relevance') in
             ('relevance', 'new', 'price_asc', 'price_desc', 'popular', 'rating')
          then coalesce(nullif(btrim(_sort), ''), 'relevance')
        else 'relevance'
      end as sort_key
    from public.products p
    left join lateral (
      select min(coalesce(v.promo_price, v.price)) as min_variant_price
      from public.product_variants v
      where v.product_id = p.id and v.is_active
    ) vp on true
    left join lateral (
      select sum(oi.quantity) as total
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = p.id
        and o.status not in ('cancelled', 'returned')
    ) sold on true
    where p.status = 'published'
      and (p.seller_id is null or exists (
        select 1 from public.seller_profiles sp
        where sp.id = p.seller_id and sp.status = 'approved'
      ))
  ),
  matched as (
    select b.*
    from base b
    where (_category_id is null or b.category_id in (select id from category_tree))
      and (
        b.q_key = ''
        or position(b.q_key in lower(b.name_fr)) > 0
        or position(b.q_key in lower(coalesce(b.name_ar, ''))) > 0
        or position(b.q_key in lower(b.sku)) > 0
        or position(b.q_key in lower(coalesce(b.brand, ''))) > 0
      )
      and (_min_price is null or b.effective_price >= _min_price)
      and (_max_price is null or b.effective_price <= _max_price)
      and not exists (
        select 1
        from jsonb_each(
          case
            when jsonb_typeof(coalesce(_filters, '{}'::jsonb)) = 'object'
              then coalesce(_filters, '{}'::jsonb)
            else '{}'::jsonb
          end
        ) f
        where jsonb_typeof(f.value) = 'array'
          and jsonb_array_length(f.value) > 0
          and not exists (
            select 1
            from public.product_attribute_values pav
            where pav.product_id = b.id
              and pav.attribute_id::text = f.key
              and pav.option_id::text in (select jsonb_array_elements_text(f.value))
            union all
            select 1
            from public.variant_attribute_values vav
            join public.product_variants pv on pv.id = vav.variant_id
            where pv.product_id = b.id
              and pv.is_active
              and vav.attribute_id::text = f.key
              and vav.option_id::text in (select jsonb_array_elements_text(f.value))
          )
      )
  ),
  ranked as (
    select
      m.*,
      count(*) over () as total,
      case
        when m.q_key = '' then 0
        when lower(m.name_fr) = m.q_key
          or lower(coalesce(m.name_ar, '')) = m.q_key
          or lower(m.sku) = m.q_key then 0
        when starts_with(lower(m.name_fr), m.q_key)
          or starts_with(lower(coalesce(m.name_ar, '')), m.q_key) then 1
        when starts_with(lower(coalesce(m.brand, '')), m.q_key) then 2
        else 3
      end as match_rank
    from matched m
  )
  select r.id as product_id, r.total
  from ranked r
  order by
    case when r.sort_key = 'relevance' then r.match_rank end asc nulls last,
    case when r.sort_key = 'new' then r.listed_at end desc nulls last,
    case when r.sort_key = 'price_asc' then r.effective_price end asc nulls last,
    case when r.sort_key = 'price_desc' then r.effective_price end desc nulls last,
    case when r.sort_key = 'popular' then r.sold end desc nulls last,
    case when r.sort_key = 'rating' then r.rating_avg end desc nulls last,
    case when r.sort_key = 'rating' then r.rating_count end desc nulls last,
    r.is_featured desc,
    r.listed_at desc nulls last,
    r.created_at desc,
    r.id asc
  limit least(greatest(coalesce(_limit, 24), 0), 500)
  offset greatest(coalesce(_offset, 0), 0)
$$;

revoke all on function public.search_products(text, uuid, jsonb, text, int, int, numeric, numeric) from public, anon;
grant execute on function public.search_products(text, uuid, jsonb, text, int, int, numeric, numeric) to anon, authenticated;

create or replace function public.get_best_sellers(_limit int default 8)
returns table (product_id uuid, sold bigint)
language sql stable security definer set search_path = public as $$
  select oi.product_id, sum(oi.quantity)::bigint as sold
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  where p.status = 'published'
    and (p.seller_id is null or exists (
      select 1 from public.seller_profiles sp
      where sp.id = p.seller_id and sp.status = 'approved'
    ))
    and o.status not in ('cancelled', 'returned')
  group by oi.product_id
  order by sum(oi.quantity) desc, max(o.created_at) desc, oi.product_id
  limit least(greatest(coalesce(_limit, 8), 0), 100)
$$;

revoke all on function public.get_best_sellers(int) from public, anon;
grant execute on function public.get_best_sellers(int) to anon, authenticated;

create or replace function public.get_variant_availability(_product_ids uuid[])
returns table (variant_id uuid, product_id uuid, available int)
language sql stable security definer set search_path = public as $$
  select v.id, v.product_id, i.available
  from public.product_variants v
  join public.products p on p.id = v.product_id
  join public.inventory i on i.variant_id = v.id
  where v.product_id = any(_product_ids)
    and p.status = 'published'
    and v.is_active
    and (p.seller_id is null or exists (
      select 1 from public.seller_profiles sp
      where sp.id = p.seller_id and sp.status = 'approved'
    ))
$$;
grant execute on function public.get_variant_availability(uuid[]) to anon, authenticated;

-- ---------- PUBLIC SHOP HELPERS ----------
create or replace function public.get_seller_shop(_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(s) from public.public_seller_shops s where s.shop_slug = lower(btrim(coalesce(_slug, ''))) limit 1
$$;
grant execute on function public.get_seller_shop(text) to anon, authenticated;

-- ---------- SELLER ORDER VIEW ----------
-- Seller-safe projection: their group totals + delivery details only.
create or replace view public.seller_orders_view
with (security_invoker = false) as
select
  g.id as seller_group_id,
  g.order_id,
  o.reference,
  o.customer_name,
  o.phone,
  o.email,
  o.city,
  o.address,
  o.instructions,
  o.status as order_status,
  g.status,
  g.subtotal,
  g.discount_total,
  g.refund_total,
  g.commission_rate,
  g.commission_fixed,
  g.commission_total,
  g.commission_reversed,
  g.net_amount,
  g.stock_state,
  g.delivered_at,
  g.created_at,
  o.payment_status,
  o.created_at as order_created_at,
  (select count(*) from public.order_items oi where oi.seller_group_id = g.id) as item_count
from public.seller_order_groups g
join public.orders o on o.id = g.order_id
where g.seller_id = public.current_seller_id();

grant select on public.seller_orders_view to authenticated;

-- ---------- SELLER PROFILES ----------
drop policy if exists "Sellers read own profile" on public.seller_profiles;
create policy "Sellers read own profile" on public.seller_profiles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Sellers read own applications" on public.seller_applications;
create policy "Sellers read own applications" on public.seller_applications
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Sellers read own status history" on public.seller_status_history;
create policy "Sellers read own status history" on public.seller_status_history
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.seller_profiles sp where sp.id = seller_id and sp.user_id = auth.uid()
    )
  );

drop policy if exists "Sellers read own commission" on public.seller_commission_settings;
create policy "Sellers read own commission" on public.seller_commission_settings
  for select to authenticated using (
    public.is_admin() or seller_id in (select sp.id from public.seller_profiles sp where sp.user_id = auth.uid())
  );

drop policy if exists "Application fields readable" on public.seller_application_fields;
create policy "Application fields readable" on public.seller_application_fields
  for select to authenticated using (is_active or public.is_admin());
drop policy if exists "Admins manage application fields" on public.seller_application_fields;
create policy "Admins manage application fields" on public.seller_application_fields
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- LISTINGS ----------
drop policy if exists "Sellers read own products" on public.products;
create policy "Sellers read own products" on public.products
  for select to authenticated using (seller_id = public.current_seller_id());

drop policy if exists "Sellers read own product values" on public.product_attribute_values;
create policy "Sellers read own product values" on public.product_attribute_values
  for select to authenticated using (exists (
    select 1 from public.products p where p.id = product_id and p.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own product images" on public.product_images;
create policy "Sellers read own product images" on public.product_images
  for select to authenticated using (exists (
    select 1 from public.products p where p.id = product_id and p.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own variants" on public.product_variants;
create policy "Sellers read own variants" on public.product_variants
  for select to authenticated using (exists (
    select 1 from public.products p where p.id = product_id and p.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own variant values" on public.variant_attribute_values;
create policy "Sellers read own variant values" on public.variant_attribute_values
  for select to authenticated using (exists (
    select 1
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = variant_id and p.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own inventory" on public.inventory;
create policy "Sellers read own inventory" on public.inventory
  for select to authenticated using (exists (
    select 1
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = variant_id and p.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own movements" on public.inventory_movements;
create policy "Sellers read own movements" on public.inventory_movements
  for select to authenticated using (exists (
    select 1
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = variant_id and p.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own moderation" on public.listing_moderation_history;
create policy "Sellers read own moderation" on public.listing_moderation_history
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.products p where p.id = product_id and p.seller_id = public.current_seller_id()
    )
  );

-- ---------- SELLER ORDERS ----------
drop policy if exists "Sellers read own groups" on public.seller_order_groups;
create policy "Sellers read own groups" on public.seller_order_groups
  for select to authenticated using (public.is_admin() or seller_id = public.current_seller_id());

drop policy if exists "Sellers read own group history" on public.seller_order_status_history;
create policy "Sellers read own group history" on public.seller_order_status_history
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.seller_order_groups g where g.id = seller_group_id and g.seller_id = public.current_seller_id()
    )
  );

drop policy if exists "Sellers read own order items" on public.order_items;
create policy "Sellers read own order items" on public.order_items
  for select to authenticated using (seller_id = public.current_seller_id());

-- ---------- SELLER RETURNS ----------
drop policy if exists "Sellers read returns with own items" on public.returns;
create policy "Sellers read returns with own items" on public.returns
  for select to authenticated using (exists (
    select 1
    from public.return_items ri
    join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = returns.id and oi.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own return items" on public.return_items;
create policy "Sellers read own return items" on public.return_items
  for select to authenticated using (exists (
    select 1 from public.order_items oi where oi.id = order_item_id and oi.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own return history" on public.return_status_history;
create policy "Sellers read own return history" on public.return_status_history
  for select to authenticated using (exists (
    select 1
    from public.return_items ri
    join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = return_id and oi.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own return notes" on public.seller_return_notes;
create policy "Sellers read own return notes" on public.seller_return_notes
  for select to authenticated using (seller_id = public.current_seller_id() or public.is_admin());

drop policy if exists "Sellers add own return notes" on public.seller_return_notes;
create policy "Sellers add own return notes" on public.seller_return_notes
  for insert to authenticated with check (
    seller_id = public.current_seller_id() and author_id = auth.uid()
  );

-- ---------- SELLER REVIEWS ----------
drop policy if exists "Sellers read reviews of own products" on public.reviews;
create policy "Sellers read reviews of own products" on public.reviews
  for select to authenticated using (exists (
    select 1 from public.products p where p.id = product_id and p.seller_id = public.current_seller_id()
  ));

-- ---------- SETTLEMENTS ----------
drop policy if exists "Sellers read own settlements" on public.seller_settlements;
create policy "Sellers read own settlements" on public.seller_settlements
  for select to authenticated using (seller_id = public.current_seller_id() or public.is_admin());

drop policy if exists "Sellers read own settlement items" on public.seller_settlement_items;
create policy "Sellers read own settlement items" on public.seller_settlement_items
  for select to authenticated using (public.is_admin() or exists (
    select 1 from public.seller_settlements s where s.id = settlement_id and s.seller_id = public.current_seller_id()
  ));

drop policy if exists "Sellers read own settlement payments" on public.seller_settlement_payments;
create policy "Sellers read own settlement payments" on public.seller_settlement_payments
  for select to authenticated using (public.is_admin() or exists (
    select 1 from public.seller_settlements s where s.id = settlement_id and s.seller_id = public.current_seller_id()
  ));

-- ---------- STORAGE: SELLER UPLOADS ----------
-- Path convention: sellers/<seller_id>/<random>.<ext> inside the private catalog bucket.
drop policy if exists "Sellers upload own catalog images" on storage.objects;
create policy "Sellers upload own catalog images" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalog'
    and (storage.foldername(name))[1] = 'sellers'
    and (storage.foldername(name))[2] = public.current_seller_id()::text
  );

drop policy if exists "Sellers update own catalog images" on storage.objects;
create policy "Sellers update own catalog images" on storage.objects for update to authenticated
  using (
    bucket_id = 'catalog'
    and (storage.foldername(name))[1] = 'sellers'
    and (storage.foldername(name))[2] = public.current_seller_id()::text
  );

drop policy if exists "Sellers delete own catalog images" on storage.objects;
create policy "Sellers delete own catalog images" on storage.objects for delete to authenticated
  using (
    bucket_id = 'catalog'
    and (storage.foldername(name))[1] = 'sellers'
    and (storage.foldername(name))[2] = public.current_seller_id()::text
  );
