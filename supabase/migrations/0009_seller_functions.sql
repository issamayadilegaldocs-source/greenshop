-- =========================================================
-- weshop marketplace — seller & listing functions
-- Onboarding, moderation, seller-owned catalog writes and
-- seller-safe inventory adjustments.
-- =========================================================

-- ---------- helpers ----------
-- Any seller profile for the caller (pending applications included).
create or replace function public.my_seller_id()
returns uuid language sql stable security definer set search_path = public as $$
  select sp.id from public.seller_profiles sp
  where sp.user_id = auth.uid()
  order by sp.created_at
  limit 1
$$;

-- Only an approved seller can sell.
create or replace function public.current_seller_id()
returns uuid language sql stable security definer set search_path = public as $$
  select sp.id from public.seller_profiles sp
  where sp.user_id = auth.uid() and sp.status = 'approved'
  limit 1
$$;

create or replace function public.is_seller()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_seller_id() is not null
$$;

revoke execute on function public.my_seller_id() from public, anon;
revoke execute on function public.current_seller_id() from public, anon;
revoke execute on function public.is_seller() from public, anon;
grant execute on function public.my_seller_id() to authenticated;
grant execute on function public.current_seller_id() to authenticated;
grant execute on function public.is_seller() to authenticated;

create or replace function public.require_seller()
returns public.seller_profiles language plpgsql stable security definer set search_path = public as $$
declare v public.seller_profiles;
begin
  select * into v from public.seller_profiles where user_id = auth.uid() and status = 'approved' limit 1;
  if not found then raise exception 'not_a_seller'; end if;
  return v;
end $$;
revoke execute on function public.require_seller() from public, anon, authenticated;
-- internal only: callers must be SECURITY DEFINER functions

-- ---------- SELLER ONBOARDING ----------
create or replace function public.submit_seller_application(_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.seller_profiles;
  v_seller_id uuid;
  v_name text;
  v_slug text;
  v_phone text;
  v_email text;
  v_city text;
  v_address text;
  v_desc_fr text;
  v_desc_ar text;
  v_logo text;
  v_extra jsonb;
  v_from public.seller_status;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if _payload is null or jsonb_typeof(_payload) <> 'object' then raise exception 'invalid_payload'; end if;

  v_name := btrim(coalesce(_payload->>'shop_name', ''));
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'invalid_shop_name'; end if;

  v_slug := btrim(coalesce(_payload->>'shop_slug', ''));
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 80 then raise exception 'invalid_shop_slug'; end if;
  if exists (select 1 from public.seller_profiles sp where sp.shop_slug = v_slug and sp.user_id <> v_uid) then
    raise exception 'shop_slug_taken';
  end if;

  v_phone := public.normalize_phone(_payload->>'phone');
  if v_phone is null then raise exception 'invalid_phone'; end if;

  v_email := nullif(btrim(coalesce(_payload->>'email', '')), '');
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;

  v_city := btrim(coalesce(_payload->>'city', ''));
  if length(v_city) < 2 or length(v_city) > 80 then raise exception 'invalid_city'; end if;

  v_address := nullif(btrim(coalesce(_payload->>'address', '')), '');
  if v_address is not null and length(v_address) > 500 then raise exception 'invalid_address'; end if;

  v_desc_fr := nullif(btrim(coalesce(_payload->>'description_fr', '')), '');
  if v_desc_fr is not null and length(v_desc_fr) > 2000 then raise exception 'invalid_description'; end if;
  v_desc_ar := nullif(btrim(coalesce(_payload->>'description_ar', '')), '');
  if v_desc_ar is not null and length(v_desc_ar) > 2000 then raise exception 'invalid_description'; end if;

  v_logo := nullif(btrim(coalesce(_payload->>'logo_url', '')), '');
  if v_logo is not null and length(v_logo) > 1000 then raise exception 'invalid_logo'; end if;

  v_extra := case when jsonb_typeof(coalesce(_payload->'extra', '{}'::jsonb)) = 'object'
                  then coalesce(_payload->'extra', '{}'::jsonb) else '{}'::jsonb end;

  -- Admin-configured application questions: required fields must be filled.
  for r in select * from public.seller_application_fields where is_active and is_required loop
    if nullif(btrim(coalesce(v_extra->>r.field_key, '')), '') is null then
      raise exception 'missing_required: %', r.label_fr;
    end if;
    if r.field_type = 'select' and array_length(r.options, 1) > 0
       and not ((v_extra->>r.field_key) = any (r.options)) then
      raise exception 'invalid_option: %', r.label_fr;
    end if;
  end loop;

  select * into v_profile from public.seller_profiles where user_id = v_uid for update;
  if found then
    v_from := v_profile.status;
    if v_profile.status = 'approved' then raise exception 'already_seller'; end if;
    if v_profile.status = 'pending' then raise exception 'application_pending'; end if;
    if v_profile.status = 'suspended' then raise exception 'seller_suspended'; end if;

    v_seller_id := v_profile.id;
    update public.seller_profiles set
      shop_name = v_name,
      shop_slug = v_slug,
      phone = v_phone,
      email = v_email,
      city = v_city,
      address = v_address,
      description_fr = v_desc_fr,
      description_ar = v_desc_ar,
      logo_url = v_logo,
      extra = v_extra,
      status = 'pending',
      admin_note = null,
      approved_at = null,
      approved_by = null,
      suspended_at = null
    where id = v_seller_id;
  else
    v_from := null;
    insert into public.seller_profiles(
      user_id, shop_name, shop_slug, phone, email, city, address,
      description_fr, description_ar, logo_url, extra, status
    ) values (
      v_uid, v_name, v_slug, v_phone, v_email, v_city, v_address,
      v_desc_fr, v_desc_ar, v_logo, v_extra, 'pending'
    ) returning id into v_seller_id;
  end if;

  insert into public.seller_applications(
    seller_id, user_id, shop_name, shop_slug, phone, email, city, address,
    description_fr, description_ar, logo_url, extra, status
  ) values (
    v_seller_id, v_uid, v_name, v_slug, v_phone, v_email, v_city, v_address,
    v_desc_fr, v_desc_ar, v_logo, v_extra, 'pending'
  );

  insert into public.seller_status_history(seller_id, from_status, to_status, note, changed_by)
  values (v_seller_id, v_from, 'pending', 'Candidature envoyée', v_uid);

  return jsonb_build_object('seller_id', v_seller_id, 'shop_slug', v_slug, 'status', 'pending');
end $$;
revoke execute on function public.submit_seller_application(jsonb) from public, anon;
grant execute on function public.submit_seller_application(jsonb) to authenticated;

-- Seller updates their public shop details (never status or rating).
create or replace function public.update_seller_profile(_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_seller public.seller_profiles;
  v_name text;
  v_slug text;
  v_phone text;
  v_email text;
  v_city text;
  v_address text;
  v_desc_fr text;
  v_desc_ar text;
  v_logo text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_seller from public.seller_profiles where user_id = v_uid for update;
  if not found then raise exception 'not_a_seller'; end if;
  if v_seller.status = 'suspended' then raise exception 'seller_suspended'; end if;
  if _payload is null or jsonb_typeof(_payload) <> 'object' then raise exception 'invalid_payload'; end if;

  v_name := btrim(coalesce(_payload->>'shop_name', v_seller.shop_name));
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'invalid_shop_name'; end if;

  v_slug := btrim(coalesce(_payload->>'shop_slug', v_seller.shop_slug));
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 80 then raise exception 'invalid_shop_slug'; end if;
  if exists (select 1 from public.seller_profiles sp where sp.shop_slug = v_slug and sp.id <> v_seller.id) then
    raise exception 'shop_slug_taken';
  end if;

  v_phone := public.normalize_phone(coalesce(_payload->>'phone', v_seller.phone));
  if v_phone is null then raise exception 'invalid_phone'; end if;

  v_email := nullif(btrim(coalesce(_payload->>'email', v_seller.email, '')), '');
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;

  v_city := btrim(coalesce(_payload->>'city', v_seller.city));
  if length(v_city) < 2 or length(v_city) > 80 then raise exception 'invalid_city'; end if;

  v_address := nullif(btrim(coalesce(_payload->>'address', v_seller.address, '')), '');
  if v_address is not null and length(v_address) > 500 then raise exception 'invalid_address'; end if;

  v_desc_fr := nullif(btrim(coalesce(_payload->>'description_fr', v_seller.description_fr, '')), '');
  if v_desc_fr is not null and length(v_desc_fr) > 2000 then raise exception 'invalid_description'; end if;
  v_desc_ar := nullif(btrim(coalesce(_payload->>'description_ar', v_seller.description_ar, '')), '');
  if v_desc_ar is not null and length(v_desc_ar) > 2000 then raise exception 'invalid_description'; end if;

  v_logo := nullif(btrim(coalesce(_payload->>'logo_url', v_seller.logo_url, '')), '');
  if v_logo is not null and length(v_logo) > 1000 then raise exception 'invalid_logo'; end if;

  update public.seller_profiles set
    shop_name = v_name,
    shop_slug = v_slug,
    phone = v_phone,
    email = v_email,
    city = v_city,
    address = v_address,
    description_fr = v_desc_fr,
    description_ar = v_desc_ar,
    logo_url = v_logo,
    extra = case when jsonb_typeof(coalesce(_payload->'extra', v_seller.extra)) = 'object'
                 then coalesce(_payload->'extra', v_seller.extra) else v_seller.extra end
  where id = v_seller.id;
end $$;
revoke execute on function public.update_seller_profile(jsonb) from public, anon;
grant execute on function public.update_seller_profile(jsonb) to authenticated;

-- Admin approves, rejects or suspends a seller.
create or replace function public.admin_review_seller(
  _seller_id uuid,
  _status public.seller_status,
  _note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v public.seller_profiles;
  v_note text := nullif(left(btrim(coalesce(_note, '')), 2000), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if _status not in ('approved', 'rejected', 'suspended') then raise exception 'invalid_status'; end if;

  select * into v from public.seller_profiles where id = _seller_id for update;
  if not found then raise exception 'seller_not_found'; end if;
  if v.status = _status then raise exception 'same_status'; end if;
  if v.status = 'pending' and _status = 'suspended' then raise exception 'invalid_transition'; end if;
  if v.status = 'suspended' and _status = 'rejected' then raise exception 'invalid_transition'; end if;

  update public.seller_profiles set
    status = _status,
    admin_note = coalesce(v_note, admin_note),
    approved_at = case when _status = 'approved' then now() else approved_at end,
    approved_by = case when _status = 'approved' then auth.uid() else approved_by end,
    suspended_at = case when _status = 'suspended' then now() else suspended_at end
  where id = _seller_id;

  if _status = 'suspended' then
    update public.products
    set status = 'paused'
    where seller_id = _seller_id and status = 'published';
  end if;

  update public.seller_applications
  set status = _status, reviewed_by = auth.uid(), reviewed_at = now(), admin_note = coalesce(v_note, admin_note)
  where seller_id = _seller_id and status = 'pending';

  insert into public.seller_status_history(seller_id, from_status, to_status, note, changed_by)
  values (_seller_id, v.status, _status, v_note, auth.uid());

  insert into public.notifications(user_id, title, body, link)
  values (v.user_id, 'Boutique ' || v.shop_name, 'Statut : ' || _status::text, '/seller/dashboard');
end $$;
revoke execute on function public.admin_review_seller(uuid, public.seller_status, text) from public, anon;
grant execute on function public.admin_review_seller(uuid, public.seller_status, text) to authenticated;

-- ---------- LISTING LIFECYCLE ----------
create or replace function public.submit_listing(_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_seller_id uuid := public.current_seller_id();
  v public.products;
begin
  if v_seller_id is null then raise exception 'not_a_seller'; end if;
  select * into v from public.products where id = _product_id for update;
  if not found or v.seller_id is distinct from v_seller_id then raise exception 'product_not_found'; end if;
  if v.status not in ('draft', 'rejected', 'paused') then raise exception 'invalid_status'; end if;

  update public.products set
    status = 'pending',
    submitted_at = now(),
    moderation_feedback = null
  where id = _product_id;

  insert into public.listing_moderation_history(product_id, action, note, actor_id)
  values (_product_id, 'submitted', 'Soumis à validation', auth.uid());
end $$;
revoke execute on function public.submit_listing(uuid) from public, anon;
grant execute on function public.submit_listing(uuid) to authenticated;

create or replace function public.moderate_listing(
  _product_id uuid,
  _action public.moderation_action,
  _note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v public.products;
  v_seller_user uuid;
  v_note text := nullif(left(btrim(coalesce(_note, '')), 2000), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v from public.products where id = _product_id for update;
  if not found then raise exception 'product_not_found'; end if;
  if v.seller_id is null then raise exception 'not_a_listing'; end if;

  case _action
    when 'approved' then
      update public.products set status = 'published', approved_at = now(), approved_by = auth.uid(),
        moderation_feedback = null where id = _product_id;
    when 'reactivated' then
      update public.products set status = 'published', approved_at = now(), approved_by = auth.uid(),
        moderation_feedback = null where id = _product_id;
    when 'rejected' then
      if v_note is null then raise exception 'note_required'; end if;
      update public.products set status = 'rejected', moderation_feedback = v_note where id = _product_id;
    when 'paused' then
      update public.products set status = 'paused' where id = _product_id;
    when 'archived' then
      update public.products set status = 'archived' where id = _product_id;
    else
      raise exception 'invalid_action';
  end case;

  insert into public.listing_moderation_history(product_id, action, note, actor_id)
  values (_product_id, _action, v_note, auth.uid());

  select sp.user_id into v_seller_user from public.seller_profiles sp where sp.id = v.seller_id;
  if v_seller_user is not null then
    insert into public.notifications(user_id, title, body, link)
    values (v_seller_user, 'Annonce ' || v.name_fr, 'Modération : ' || _action::text, '/seller/listings');
  end if;
end $$;
revoke execute on function public.moderate_listing(uuid, public.moderation_action, text) from public, anon;
grant execute on function public.moderate_listing(uuid, public.moderation_action, text) to authenticated;

create or replace function public.seller_set_listing_status(_product_id uuid, _status public.product_status)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_seller_id uuid := public.current_seller_id();
  v public.products;
  v_action public.moderation_action;
begin
  if v_seller_id is null then raise exception 'not_a_seller'; end if;
  if _status not in ('draft', 'paused', 'archived') then raise exception 'invalid_status'; end if;
  select * into v from public.products where id = _product_id for update;
  if not found or v.seller_id is distinct from v_seller_id then raise exception 'product_not_found'; end if;
  if v.status = _status then raise exception 'same_status'; end if;

  update public.products set status = _status where id = _product_id;

  v_action := case _status
    when 'paused' then 'paused'::public.moderation_action
    when 'archived' then 'archived'::public.moderation_action
    else 'updated'::public.moderation_action
  end;
  insert into public.listing_moderation_history(product_id, action, note, actor_id)
  values (_product_id, v_action, 'Action vendeur', auth.uid());
end $$;
revoke execute on function public.seller_set_listing_status(uuid, public.product_status) from public, anon;
grant execute on function public.seller_set_listing_status(uuid, public.product_status) to authenticated;

-- ---------- SELLER INVENTORY ----------
create or replace function public.seller_adjust_inventory(
  _variant_id uuid,
  _action text,
  _quantity int,
  _reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_seller_id uuid := public.current_seller_id();
  v_product uuid;
begin
  if v_seller_id is null then raise exception 'not_a_seller'; end if;
  if coalesce(length(trim(_reason)), 0) < 2 then raise exception 'reason_required'; end if;
  if _quantity is null or _quantity <= 0 or _quantity > 100000 then raise exception 'invalid_quantity'; end if;

  select pv.product_id into v_product
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = _variant_id and p.seller_id = v_seller_id;
  if v_product is null then raise exception 'variant_not_found'; end if;

  case _action
    when 'restock'          then perform public._move_stock(_variant_id, null, 'available', _quantity, 'restock', _reason, null, null, auth.uid());
    when 'remove'           then perform public._move_stock(_variant_id, 'available', null, _quantity, 'removal', _reason, null, null, auth.uid());
    when 'damage'           then perform public._move_stock(_variant_id, 'available', 'damaged', _quantity, 'damage', _reason, null, null, auth.uid());
    when 'repair_damaged'   then perform public._move_stock(_variant_id, 'damaged', 'available', _quantity, 'damage_repaired', _reason, null, null, auth.uid());
    when 'writeoff_damaged' then perform public._move_stock(_variant_id, 'damaged', null, _quantity, 'damage_writeoff', _reason, null, null, auth.uid());
    else raise exception 'invalid_action';
  end case;
end $$;
revoke execute on function public.seller_adjust_inventory(uuid, text, int, text) from public, anon;
grant execute on function public.seller_adjust_inventory(uuid, text, int, text) to authenticated;

-- ---------- CATALOG WRITER (admin + seller aware) ----------
create or replace function public.save_product(
  _product jsonb,
  _attributes jsonb,
  _variants jsonb,
  _images jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_seller_id uuid;
  v_id uuid;
  v_owner_id uuid;
  v_prev_status public.product_status;
  v_prev_condition public.listing_condition;
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
  v_condition public.listing_condition;
  v_condition_txt text;
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
  v_settings public.store_settings;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_is_admin := public.is_admin();
  if not v_is_admin then
    v_seller_id := public.current_seller_id();
    if v_seller_id is null then raise exception 'forbidden'; end if;
  end if;

  if _product is null or jsonb_typeof(_product) <> 'object' then
    raise exception 'invalid_payload: product';
  end if;

  select * into v_settings from public.store_settings where id;

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

  -- ---------- category + target product ----------
  if nullif(btrim(coalesce(_product->>'category_id', '')), '') is null then
    raise exception 'category_required';
  end if;
  v_category_id := (_product->>'category_id')::uuid;
  if not exists (select 1 from public.categories c where c.id = v_category_id and c.is_active) then
    raise exception 'invalid_payload: category';
  end if;

  v_txt := nullif(btrim(coalesce(_product->>'id', '')), '');
  if v_txt is not null then
    v_id := v_txt::uuid;
    select p.status, p.seller_id, p.condition
      into v_prev_status, v_owner_id, v_prev_condition
    from public.products p where p.id = v_id for update;
    if not found then raise exception 'invalid_payload: product not found'; end if;
    if not v_is_admin and v_owner_id is distinct from v_seller_id then raise exception 'forbidden'; end if;
  end if;

  -- ---------- status rules ----------
  v_status_txt := coalesce(
    nullif(btrim(coalesce(_product->>'status', '')), ''),
    case when v_id is null then 'draft' else v_prev_status::text end
  );

  if v_is_admin then
    if v_status_txt not in ('draft', 'published', 'archived', 'pending', 'rejected', 'paused') then
      raise exception 'invalid_payload: status';
    end if;
    v_status := v_status_txt::public.product_status;
  else
    if v_status_txt not in ('draft', 'published', 'pending', 'paused') then
      raise exception 'invalid_payload: status';
    end if;
    if v_id is null then
      if v_status_txt = 'published' then raise exception 'cannot_publish'; end if;
      v_status := case when v_status_txt = 'pending' then 'pending'::public.product_status else 'draft'::public.product_status end;
    elsif v_status_txt = 'published' then
      if v_prev_status <> 'published' then raise exception 'cannot_publish'; end if;
      v_status := case when coalesce(v_settings.reapprove_seller_edits, true)
                       then 'pending'::public.product_status else 'published'::public.product_status end;
    else
      v_status := v_status_txt::public.product_status;
    end if;
  end if;

  -- ---------- condition (second-hand) ----------
  if _product ? 'condition' then
    v_condition_txt := nullif(btrim(coalesce(_product->>'condition', '')), '');
    if v_condition_txt is not null then
      if v_condition_txt not in ('new', 'like_new', 'good', 'acceptable', 'other') then
        raise exception 'invalid_payload: condition';
      end if;
      if not exists (select 1 from public.categories c where c.id = v_category_id and c.allows_condition) then
        raise exception 'condition_not_allowed';
      end if;
      if not (v_condition_txt = any (coalesce(v_settings.condition_options, array[]::text[]))) then
        raise exception 'invalid_payload: condition';
      end if;
      v_condition := v_condition_txt::public.listing_condition;
    else
      v_condition := null;
    end if;
  else
    v_condition := v_prev_condition;
  end if;

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
    if nullif(btrim(coalesce(v_e->>'storage_path', '')), '') is not null then
      if length(v_e->>'storage_path') > 1000 then
        raise exception 'invalid_payload: image storage_path';
      end if;
      if not v_is_admin and (v_e->>'storage_path') not like ('sellers/' || v_seller_id::text || '/%') then
        raise exception 'invalid_image_path';
      end if;
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
      brand, model, price, promo_price, warranty, status, has_variants, is_featured,
      seller_id, condition
    ) values (
      v_category_id, v_name_fr, v_name_ar, v_slug, v_sku, v_description_fr, v_description_ar,
      v_brand, v_model, v_min_price,
      case when v_min_eff is not null and v_min_eff < v_min_price then v_min_eff else null end,
      v_warranty, v_status, v_has_variants,
      case when v_is_admin then v_is_featured else false end,
      v_seller_id, v_condition
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
      is_featured = case when v_is_admin then v_is_featured else is_featured end,
      seller_id = case when v_is_admin then seller_id else v_seller_id end,
      condition = v_condition,
      submitted_at = case when v_status = 'pending' and v_prev_status is distinct from 'pending' then now() else submitted_at end,
      moderation_feedback = case when v_status = 'pending' then null else moderation_feedback end
    where id = v_id;
  end if;

  if v_is_admin and v_owner_id is not null and v_status = 'published' and v_prev_status is distinct from 'published' then
    update public.products set approved_at = now(), approved_by = v_uid, moderation_feedback = null where id = v_id;
  end if;

  if not v_is_admin then
    insert into public.listing_moderation_history(product_id, action, note, actor_id)
    values (
      v_id,
      case v_status
        when 'pending' then 'submitted'::public.moderation_action
        when 'paused' then 'paused'::public.moderation_action
        when 'archived' then 'archived'::public.moderation_action
        else 'updated'::public.moderation_action
      end,
      'Mise à jour vendeur',
      v_uid
    );
  end if;

  -- published_at is left to public.set_published_at() (trigger on 0001).

  -- admin-only purchase cost (trigger handle_new_variant copies it to new variant costs)
  if v_is_admin then
    insert into public.product_private (product_id, purchase_price, updated_at)
    values (v_id, v_purchase, now())
    on conflict (product_id) do update
      set purchase_price = excluded.purchase_price, updated_at = now();
  end if;

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

    if v_is_admin then
      insert into public.variant_costs (variant_id, cost)
      values (v_vid, v_cost)
      on conflict (variant_id) do update
        set cost = excluded.cost, updated_at = now();
    else
      -- keep any cost already set by the platform; new rows default to 0 (trigger).
      insert into public.variant_costs (variant_id, cost)
      values (v_vid, 0)
      on conflict (variant_id) do nothing;
    end if;

    if v_is_new and v_stock > 0 then
      perform public._move_stock(v_vid, null, 'available', v_stock, 'initial', 'Stock initial', null, null, v_uid);
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

  -- Surface combination conflicts raised by the deferred unique constraint now.
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

-- ---------- DELETE LISTING (admin + owner seller) ----------
create or replace function public.delete_product(_product_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_seller_id uuid;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if _product_id is null then raise exception 'invalid_payload: product id'; end if;

  select p.seller_id into v_owner from public.products p where p.id = _product_id;
  if not found then raise exception 'product_not_found'; end if;

  if not public.is_admin() then
    v_seller_id := public.current_seller_id();
    if v_seller_id is null or v_owner is distinct from v_seller_id then raise exception 'forbidden'; end if;
  end if;

  -- order history forces us to keep the catalog row
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

  delete from public.inventory_movements im
  where im.variant_id in (select pv.id from public.product_variants pv where pv.product_id = _product_id);

  delete from public.products p where p.id = _product_id;
  return 'deleted';
end $$;

revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;
