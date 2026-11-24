-- =========================================================
-- weshop catalog / marketplace-independent RPCs
-- Reconstructed on the fresh Supabase project.
-- Apply after 0004_storage_policies.sql. Depends on:
--   0001_core_schema.sql (tables, enums, RLS, triggers, helpers)
--   0002_transactional_functions.sql (public._move_stock)
--
--   save_product    : admin-only catalog writer (product + specs + variants + images)
--   delete_product  : admin-only delete; archives instead when order history exists
--   search_products : anonymous storefront listing (facets, sort, count)
--   get_best_sellers: anonymous storefront ranking by units sold
-- =========================================================

-- ---------- ADMIN: upsert one product with its attributes, variants and images ----------
create or replace function public.save_product(
  _product jsonb,
  _attributes jsonb,
  _variants jsonb,
  _images jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_category_id uuid;
  v_name_fr text;
  v_name_ar text;
  v_slug text;
  v_sku text;
  v_description_fr text;
  v_description_ar text;
  v_brand text;
  v_model text;
  v_warranty text;
  v_status public.product_status;
  v_status_txt text;
  v_is_featured boolean;
  v_has_variants boolean;
  v_purchase numeric(12,3);
  v_attrs jsonb;
  v_vars jsonb;
  v_imgs jsonb;
  v_n int;
  v_i int;
  v_j int;
  v_e jsonb;
  v_o jsonb;
  v_opt_list jsonb;
  v_attr_id uuid;
  v_opt_id uuid;
  v_vid uuid;
  v_is_new boolean;
  v_sku_v text;
  v_price numeric(12,3);
  v_promo numeric(12,3);
  v_cost numeric(12,3);
  v_barcode text;
  v_is_active boolean;
  v_stock int;
  v_txt text;
  v_min_price numeric(12,3);
  v_min_eff numeric(12,3);
  v_eff numeric(12,3);
  v_active_count int := 0;
  v_skus_seen text[] := '{}';
  v_combo_keys text[] := '{}';
  v_combo text;
  v_missing text;
  v_kept_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if _product is null or jsonb_typeof(_product) <> 'object' then
    raise exception 'invalid_payload: product';
  end if;

  v_attrs := case when _attributes is null or jsonb_typeof(_attributes) <> 'array' then '[]'::jsonb else _attributes end;
  v_vars  := case when _variants   is null or jsonb_typeof(_variants)   <> 'array' then '[]'::jsonb else _variants   end;
  v_imgs  := case when _images     is null or jsonb_typeof(_images)     <> 'array' then '[]'::jsonb else _images     end;

  -- ---------- product scalars ----------
  v_name_fr := btrim(coalesce(_product->>'name_fr', ''));
  if v_name_fr = '' or length(v_name_fr) > 200 then
    raise exception 'invalid_payload: name_fr';
  end if;

  v_name_ar := nullif(btrim(coalesce(_product->>'name_ar', '')), '');
  if v_name_ar is not null and length(v_name_ar) > 200 then
    raise exception 'invalid_payload: name_ar';
  end if;

  v_slug := btrim(coalesce(_product->>'slug', ''));
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_payload: slug';
  end if;

  v_sku := btrim(coalesce(_product->>'sku', ''));
  if v_sku = '' or length(v_sku) > 64 then
    raise exception 'invalid_payload: sku';
  end if;

  v_description_fr := nullif(btrim(coalesce(_product->>'description_fr', '')), '');
  if v_description_fr is not null and length(v_description_fr) > 10000 then
    raise exception 'invalid_payload: description_fr';
  end if;

  v_description_ar := nullif(btrim(coalesce(_product->>'description_ar', '')), '');
  if v_description_ar is not null and length(v_description_ar) > 10000 then
    raise exception 'invalid_payload: description_ar';
  end if;

  v_brand := nullif(btrim(coalesce(_product->>'brand', '')), '');
  if v_brand is not null and length(v_brand) > 80 then
    raise exception 'invalid_payload: brand';
  end if;

  v_model := nullif(btrim(coalesce(_product->>'model', '')), '');
  if v_model is not null and length(v_model) > 80 then
    raise exception 'invalid_payload: model';
  end if;

  v_warranty := nullif(btrim(coalesce(_product->>'warranty', '')), '');
  if v_warranty is not null and length(v_warranty) > 200 then
    raise exception 'invalid_payload: warranty';
  end if;

  v_status_txt := coalesce(nullif(btrim(coalesce(_product->>'status', '')), ''), 'draft');
  if v_status_txt not in ('draft', 'published', 'archived') then
    raise exception 'invalid_payload: status';
  end if;
  v_status := v_status_txt::public.product_status;

  v_is_featured := coalesce((_product->>'is_featured')::boolean, false);
  v_has_variants := coalesce((_product->>'has_variants')::boolean, false);

  v_txt := nullif(btrim(coalesce(_product->>'purchase_price', '')), '');
  if v_txt is null then
    v_purchase := 0;
  elsif v_txt !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'invalid_payload: purchase_price';
  else
    v_purchase := v_txt::numeric(12,3);
  end if;

  -- ---------- category + target product ----------
  if nullif(btrim(coalesce(_product->>'category_id', '')), '') is null then
    raise exception 'category_required';
  end if;
  v_category_id := (_product->>'category_id')::uuid;
  if not exists (select 1 from public.categories c where c.id = v_category_id) then
    raise exception 'invalid_payload: category';
  end if;

  v_txt := nullif(btrim(coalesce(_product->>'id', '')), '');
  if v_txt is not null then
    v_id := v_txt::uuid;
    if not exists (select 1 from public.products p where p.id = v_id) then
      raise exception 'invalid_payload: product not found';
    end if;
  end if;

  -- case-insensitive uniqueness, excluding the row being edited
  if exists (
    select 1 from public.products p
    where lower(p.sku) = lower(v_sku) and p.id is distinct from v_id
  ) then
    raise exception 'duplicate_sku: %', v_sku;
  end if;
  if exists (
    select 1 from public.products p
    where lower(p.slug) = lower(v_slug) and p.id is distinct from v_id
  ) then
    raise exception 'duplicate_slug: %', v_slug;
  end if;

  -- ---------- images ----------
  if jsonb_array_length(v_imgs) > 20 then
    raise exception 'too_many_images';
  end if;
  for v_i in 0 .. jsonb_array_length(v_imgs) - 1 loop
    v_e := v_imgs -> v_i;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'invalid_payload: image';
    end if;
    if nullif(btrim(coalesce(v_e->>'url', '')), '') is null then
      raise exception 'invalid_payload: image url';
    end if;
    if nullif(btrim(coalesce(v_e->>'storage_path', '')), '') is not null and length(v_e->>'storage_path') > 1000 then
      raise exception 'invalid_payload: image storage_path';
    end if;
    if length(coalesce(v_e->>'alt', '')) > 200 then
      raise exception 'invalid_payload: image alt';
    end if;
  end loop;

  -- ---------- attribute values (spec sheet) ----------
  if jsonb_array_length(v_attrs) > 500 then
    raise exception 'invalid_payload: attributes';
  end if;
  for v_i in 0 .. jsonb_array_length(v_attrs) - 1 loop
    v_e := v_attrs -> v_i;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'invalid_payload: attribute';
    end if;
    if nullif(btrim(coalesce(v_e->>'attribute_id', '')), '') is null then
      raise exception 'invalid_attribute';
    end if;
    v_attr_id := (v_e->>'attribute_id')::uuid;
    if not exists (
      select 1 from public.get_category_attributes(v_category_id) ca where ca.id = v_attr_id
    ) then
      raise exception 'invalid_attribute';
    end if;
    if nullif(btrim(coalesce(v_e->>'option_id', '')), '') is not null then
      v_opt_id := (v_e->>'option_id')::uuid;
      if not exists (
        select 1 from public.category_attribute_options o
        where o.id = v_opt_id and o.attribute_id = v_attr_id
      ) then
        raise exception 'invalid_option';
      end if;
    end if;
    v_txt := nullif(btrim(coalesce(v_e->>'value_number', '')), '');
    if v_txt is not null and v_txt !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'invalid_payload: value_number';
    end if;
    v_txt := nullif(btrim(coalesce(v_e->>'value_boolean', '')), '');
    if v_txt is not null and lower(v_txt) not in ('true', 'false') then
      raise exception 'invalid_payload: value_boolean';
    end if;
    v_txt := nullif(btrim(coalesce(v_e->>'value_date', '')), '');
    if v_txt is not null and v_txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid_payload: value_date';
    end if;
  end loop;

  -- required, non-variant attributes of the category (inherited included)
  select string_agg(ca.name_fr, ', ')
    into v_missing
  from public.get_category_attributes(v_category_id) ca
  where ca.is_required
    and not ca.is_variant
    and not exists (
      select 1
      from jsonb_array_elements(v_attrs) e
      where (e->>'attribute_id')::uuid = ca.id
        and (
          nullif(btrim(coalesce(e->>'option_id', '')), '') is not null
          or nullif(btrim(coalesce(e->>'value_text', '')), '') is not null
          or nullif(btrim(coalesce(e->>'value_number', '')), '') is not null
          or nullif(btrim(coalesce(e->>'value_boolean', '')), '') is not null
          or nullif(btrim(coalesce(e->>'value_date', '')), '') is not null
        )
    );
  if v_missing is not null then
    raise exception 'missing_required: %', v_missing;
  end if;

  -- ---------- variants, first pass: validate + derive the product price ----------
  v_n := jsonb_array_length(v_vars);
  if v_n = 0 then
    raise exception 'variants_required';
  end if;
  if v_n > 200 then
    raise exception 'too_many_variants';
  end if;
  if not v_has_variants and v_n <> 1 then
    raise exception 'invalid_payload: exactly one variant is required when has_variants is false';
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_e := v_vars -> v_i;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'invalid_payload: variant';
    end if;

    if nullif(btrim(coalesce(v_e->>'id', '')), '') is not null then
      v_vid := (v_e->>'id')::uuid;
      if v_id is null or not exists (
        select 1 from public.product_variants pv where pv.id = v_vid and pv.product_id = v_id
      ) then
        raise exception 'invalid_payload: variant does not belong to this product';
      end if;
    end if;

    v_sku_v := btrim(coalesce(v_e->>'sku', ''));
    if v_sku_v = '' or length(v_sku_v) > 64 then
      raise exception 'invalid_payload: variant sku';
    end if;
    if lower(v_sku_v) = any (v_skus_seen) then
      raise exception 'duplicate_sku: %', v_sku_v;
    end if;
    if exists (
      select 1 from public.product_variants pv
      where lower(pv.sku) = lower(v_sku_v)
        and (v_id is null or pv.product_id is distinct from v_id)
    ) then
      raise exception 'duplicate_sku: %', v_sku_v;
    end if;
    v_skus_seen := array_append(v_skus_seen, lower(v_sku_v));

    v_txt := nullif(btrim(coalesce(v_e->>'price', '')), '');
    if v_txt is null or v_txt !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'invalid_payload: variant price';
    end if;
    v_price := v_txt::numeric(12,3);

    v_txt := nullif(btrim(coalesce(v_e->>'promo_price', '')), '');
    v_promo := null;
    if v_txt is not null then
      if v_txt !~ '^[0-9]+(\.[0-9]+)?$' then
        raise exception 'invalid_payload: variant promo_price';
      end if;
      v_promo := v_txt::numeric(12,3);
      if v_promo >= v_price then
        raise exception 'invalid_payload: promo_price must be lower than price';
      end if;
    end if;

    v_txt := nullif(btrim(coalesce(v_e->>'cost', '')), '');
    v_cost := 0;
    if v_txt is not null then
      if v_txt !~ '^[0-9]+(\.[0-9]+)?$' then
        raise exception 'invalid_payload: variant cost';
      end if;
      v_cost := v_txt::numeric(12,3);
    end if;

    v_barcode := nullif(btrim(coalesce(v_e->>'barcode', '')), '');
    if v_barcode is not null and length(v_barcode) > 64 then
      raise exception 'invalid_payload: variant barcode';
    end if;

    v_is_active := coalesce((v_e->>'is_active')::boolean, true);

    v_stock := 0;
    if nullif(btrim(coalesce(v_e->>'id', '')), '') is null then
      v_txt := nullif(btrim(coalesce(v_e->>'initial_stock', '')), '');
      if v_txt is not null then
        if v_txt !~ '^[0-9]+$' then
          raise exception 'invalid_quantity';
        end if;
        v_stock := v_txt::int;
        if v_stock > 100000 then
          raise exception 'invalid_quantity';
        end if;
      end if;
    end if;

    v_opt_list := coalesce(v_e->'options', '[]'::jsonb);
    if jsonb_typeof(v_opt_list) <> 'array' then
      raise exception 'invalid_payload: variant options';
    end if;
    if jsonb_array_length(v_opt_list) > 0 then
      if jsonb_array_length(v_opt_list) > 20 then
        raise exception 'invalid_payload: variant options';
      end if;
      for v_j in 0 .. jsonb_array_length(v_opt_list) - 1 loop
        v_o := v_opt_list -> v_j;
        if jsonb_typeof(v_o) <> 'object' then
          raise exception 'invalid_payload: variant option';
        end if;
        if nullif(btrim(coalesce(v_o->>'attribute_id', '')), '') is null
           or nullif(btrim(coalesce(v_o->>'option_id', '')), '') is null then
          raise exception 'invalid_payload: variant option';
        end if;
        v_attr_id := (v_o->>'attribute_id')::uuid;
        v_opt_id := (v_o->>'option_id')::uuid;
        if not exists (
          select 1 from public.get_category_attributes(v_category_id) ca where ca.id = v_attr_id
        ) then
          raise exception 'invalid_attribute';
        end if;
        if not exists (
          select 1 from public.category_attribute_options o
          where o.id = v_opt_id and o.attribute_id = v_attr_id
        ) then
          raise exception 'invalid_option';
        end if;
      end loop;

      -- canonical combination key (same idea as public.refresh_variant_combination)
      select string_agg((o->>'attribute_id') || ':' || (o->>'option_id'), '|' order by (o->>'attribute_id'))
        into v_combo
      from jsonb_array_elements(v_opt_list) o;
      if v_combo = any (v_combo_keys) then
        raise exception 'duplicate_combination';
      end if;
      v_combo_keys := array_append(v_combo_keys, v_combo);
    elsif v_has_variants then
      raise exception 'variant_options_required';
    end if;

    if v_is_active then
      v_active_count := v_active_count + 1;
      if v_min_price is null or v_price < v_min_price then
        v_min_price := v_price;
      end if;
      v_eff := coalesce(v_promo, v_price);
      if v_min_eff is null or v_eff < v_min_eff then
        v_min_eff := v_eff;
      end if;
    end if;
  end loop;

  if v_active_count = 0 then
    raise exception 'active_variant_required';
  end if;

  -- ---------- product row ----------
  if v_id is null then
    insert into public.products (
      category_id, name_fr, name_ar, slug, sku, description_fr, description_ar,
      brand, model, price, promo_price, warranty, status, has_variants, is_featured
    ) values (
      v_category_id, v_name_fr, v_name_ar, v_slug, v_sku, v_description_fr, v_description_ar,
      v_brand, v_model, v_min_price,
      case when v_min_eff is not null and v_min_eff < v_min_price then v_min_eff else null end,
      v_warranty, v_status, v_has_variants, v_is_featured
    )
    returning id into v_id;
  else
    update public.products set
      category_id = v_category_id,
      name_fr = v_name_fr,
      name_ar = v_name_ar,
      slug = v_slug,
      sku = v_sku,
      description_fr = v_description_fr,
      description_ar = v_description_ar,
      brand = v_brand,
      model = v_model,
      price = v_min_price,
      promo_price = case when v_min_eff is not null and v_min_eff < v_min_price then v_min_eff else null end,
      warranty = v_warranty,
      status = v_status,
      has_variants = v_has_variants,
      is_featured = v_is_featured
    where id = v_id;
  end if;

  -- published_at is left to public.set_published_at() (trigger on 0001) to avoid double stamping.

  -- admin-only purchase cost (trigger handle_new_variant copies it to new variant costs)
  insert into public.product_private (product_id, purchase_price, updated_at)
  values (v_id, v_purchase, now())
  on conflict (product_id) do update
    set purchase_price = excluded.purchase_price, updated_at = now();

  -- ---------- replace attributes and images wholesale ----------
  delete from public.product_attribute_values where product_id = v_id;
  if jsonb_array_length(v_attrs) > 0 then
    insert into public.product_attribute_values (
      product_id, attribute_id, option_id, value_text, value_number, value_boolean, value_date
    )
    select distinct on (
      (e->>'attribute_id')::uuid,
      coalesce(nullif(btrim(coalesce(e->>'option_id', '')), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    )
      v_id,
      (e->>'attribute_id')::uuid,
      nullif(btrim(coalesce(e->>'option_id', '')), '')::uuid,
      nullif(btrim(coalesce(e->>'value_text', '')), ''),
      nullif(btrim(coalesce(e->>'value_number', '')), '')::numeric,
      case lower(btrim(coalesce(e->>'value_boolean', '')))
        when 'true' then true
        when 'false' then false
        else null
      end,
      nullif(btrim(coalesce(e->>'value_date', '')), '')::date
    from jsonb_array_elements(v_attrs) e
    where nullif(btrim(coalesce(e->>'option_id', '')), '') is not null
       or nullif(btrim(coalesce(e->>'value_text', '')), '') is not null
       or nullif(btrim(coalesce(e->>'value_number', '')), '') is not null
       or nullif(btrim(coalesce(e->>'value_boolean', '')), '') is not null
       or nullif(btrim(coalesce(e->>'value_date', '')), '') is not null;
  end if;

  delete from public.product_images where product_id = v_id;
  if jsonb_array_length(v_imgs) > 0 then
    insert into public.product_images (product_id, storage_path, url, alt, position)
    select
      v_id,
      nullif(btrim(coalesce(e->>'storage_path', '')), ''),
      btrim(coalesce(e->>'url', '')),
      nullif(btrim(coalesce(e->>'alt', '')), ''),
      (t.ord - 1)::int
    from jsonb_array_elements(v_imgs) with ordinality as t(e, ord);
  end if;

  -- ---------- variants, second pass: upsert rows, options, costs, initial stock ----------
  v_kept_ids := '{}';
  for v_i in 0 .. v_n - 1 loop
    v_e := v_vars -> v_i;
    v_is_new := nullif(btrim(coalesce(v_e->>'id', '')), '') is null;

    -- values were validated in the first pass
    v_price := (v_e->>'price')::numeric(12,3);
    v_promo := nullif(btrim(coalesce(v_e->>'promo_price', '')), '')::numeric(12,3);
    v_cost := coalesce(nullif(btrim(coalesce(v_e->>'cost', '')), '')::numeric(12,3), 0);
    v_barcode := nullif(btrim(coalesce(v_e->>'barcode', '')), '');
    v_is_active := coalesce((v_e->>'is_active')::boolean, true);
    v_stock := case
      when v_is_new then coalesce(nullif(btrim(coalesce(v_e->>'initial_stock', '')), '')::int, 0)
      else 0
    end;
    v_opt_list := coalesce(v_e->'options', '[]'::jsonb);

    if v_is_new then
      insert into public.product_variants (
        product_id, sku, price, promo_price, barcode, is_active, is_default, position
      ) values (
        v_id, btrim(v_e->>'sku'), v_price, v_promo, v_barcode, v_is_active,
        (not v_has_variants or v_i = 0), v_i
      )
      returning id into v_vid;
    else
      v_vid := (v_e->>'id')::uuid;
      update public.product_variants set
        sku = btrim(v_e->>'sku'),
        price = v_price,
        promo_price = v_promo,
        barcode = v_barcode,
        is_active = v_is_active,
        is_default = (not v_has_variants or v_i = 0),
        position = v_i
      where id = v_vid and product_id = v_id;
    end if;

    delete from public.variant_attribute_values where variant_id = v_vid;
    if jsonb_array_length(v_opt_list) > 0 then
      insert into public.variant_attribute_values (variant_id, attribute_id, option_id)
      select distinct on ((o->>'attribute_id')::uuid)
        v_vid, (o->>'attribute_id')::uuid, (o->>'option_id')::uuid
      from jsonb_array_elements(v_opt_list) o;
    end if;

    insert into public.variant_costs (variant_id, cost)
    values (v_vid, v_cost)
    on conflict (variant_id) do update
      set cost = excluded.cost, updated_at = now();

    if v_is_new and v_stock > 0 then
      perform public._move_stock(v_vid, null, 'available', v_stock, 'initial', 'Stock initial', null, null, auth.uid());
    end if;

    v_kept_ids := array_append(v_kept_ids, v_vid);
  end loop;

  -- Removed variants: order lines keep a FK on the variant, so keep ordered ones (inactive)
  -- and hard-delete the rest.
  delete from public.product_variants pv
  where pv.product_id = v_id
    and not (pv.id = any (v_kept_ids))
    and not exists (select 1 from public.order_items oi where oi.variant_id = pv.id);

  update public.product_variants pv
  set is_active = false, is_default = false
  where pv.product_id = v_id
    and not (pv.id = any (v_kept_ids));

  -- Surface combination conflicts raised by the deferred unique constraint now,
  -- instead of at commit time.
  set constraints public.uq_variant_combination immediate;

  return v_id;
exception
  when invalid_text_representation then
    raise exception 'invalid_payload: invalid value';
  when invalid_datetime_format then
    raise exception 'invalid_payload: invalid date';
  when numeric_value_out_of_range then
    raise exception 'invalid_payload: value out of range';
  when string_data_right_truncation then
    raise exception 'invalid_payload: value too long';
end $$;

revoke all on function public.save_product(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_product(jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ---------- PUBLIC: storefront search (category tree, facets, sort, total count) ----------
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
            -- product-level specs (text/number/boolean/dropdown values)
            select 1
            from public.product_attribute_values pav
            where pav.product_id = b.id
              and pav.attribute_id::text = f.key
              and pav.option_id::text in (select jsonb_array_elements_text(f.value))
            union all
            -- variant axes (size, colour...) carried by active variants
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

-- ---------- PUBLIC: best sellers (units sold, published products only) ----------
create or replace function public.get_best_sellers(_limit int default 8)
returns table (product_id uuid, sold bigint)
language sql stable security definer set search_path = public as $$
  select oi.product_id, sum(oi.quantity)::bigint as sold
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  where p.status = 'published'
    and o.status not in ('cancelled', 'returned')
  group by oi.product_id
  order by sum(oi.quantity) desc, max(o.created_at) desc, oi.product_id
  limit least(greatest(coalesce(_limit, 8), 0), 100)
$$;

revoke all on function public.get_best_sellers(int) from public, anon;
grant execute on function public.get_best_sellers(int) to anon, authenticated;

-- ---------- ADMIN: delete a product, or archive it when order history exists ----------
-- Matches the generated RPC contract: returns 'deleted' on a hard delete and
-- 'archived' when order lines force us to keep the catalog row for history.
create or replace function public.delete_product(_product_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if _product_id is null then
    raise exception 'invalid_payload: product id';
  end if;
  if not exists (select 1 from public.products p where p.id = _product_id) then
    raise exception 'product_not_found';
  end if;

  -- order_items.variant_id is ON DELETE RESTRICT and product_id is ON DELETE SET NULL:
  -- deleting would fail or orphan history, so keep every row and archive the product instead.
  if exists (
    select 1
    from public.order_items oi
    where oi.product_id = _product_id
      or oi.variant_id in (select pv.id from public.product_variants pv where pv.product_id = _product_id)
  ) then
    update public.products
    set status = 'archived'
    where id = _product_id and status <> 'archived';
    return 'archived';
  end if;

  -- Safe to drop the movement log too: with no order line, these rows are not referenced
  -- by any order and the variant FK would only null them out.
  delete from public.inventory_movements im
  where im.variant_id in (select pv.id from public.product_variants pv where pv.product_id = _product_id);

  -- Cascades: product_private, product_attribute_values, product_images, product_variants,
  -- variant_costs, variant_attribute_values, inventory, reviews.
  delete from public.products p where p.id = _product_id;
  return 'deleted';
end $$;

revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;
