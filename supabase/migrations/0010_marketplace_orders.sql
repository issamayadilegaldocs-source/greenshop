-- =========================================================
-- weshop marketplace — orders, fulfillment, returns, finance
-- One customer-facing order, one group per seller (plus one
-- platform group for admin-owned items), commission snapshots,
-- seller settlements and admin customer aggregates.
-- =========================================================

-- ---------- GROUP-LEVEL STOCK + PLATFORM GROUPS ----------
-- A platform group (seller_id is null) carries admin-owned lines so
-- every order line follows the same reservation/consumption path.
alter table public.seller_order_groups
  alter column seller_id drop not null,
  add column if not exists stock_state public.stock_state not null default 'reserved';

alter table public.seller_order_groups
  drop constraint if exists seller_order_groups_order_id_seller_id_key;

create unique index if not exists uq_seller_group_order_seller
  on public.seller_order_groups(order_id, coalesce(seller_id, '00000000-0000-0000-0000-000000000000'::uuid));

create sequence if not exists public.settlement_ref_seq start 1001;

-- ---------- status helpers ----------
create or replace function public._order_status_rank(_status public.order_status)
returns int language sql immutable set search_path = public as $$
  select case _status
    when 'pending' then 0
    when 'confirmed' then 1
    when 'preparing' then 2
    when 'shipped' then 3
    when 'out_for_delivery' then 4
    when 'delivered' then 5
    else 9
  end
$$;
revoke execute on function public._order_status_rank(public.order_status) from public, anon, authenticated;

create or replace function public._order_status_from_rank(_rank int)
returns public.order_status language sql immutable set search_path = public as $$
  select case _rank
    when 0 then 'pending'::public.order_status
    when 1 then 'confirmed'::public.order_status
    when 2 then 'preparing'::public.order_status
    when 3 then 'shipped'::public.order_status
    when 4 then 'out_for_delivery'::public.order_status
    else 'delivered'::public.order_status
  end
$$;
revoke execute on function public._order_status_from_rank(int) from public, anon, authenticated;

-- ---------- CREATE ORDER (COD, mixed vendors) ----------
create or replace function public.create_order(
  _customer_name text, _phone text, _city text, _address text,
  _instructions text, _email text, _items jsonb,
  _promo_code text default null, _save_address boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := public.normalize_phone(_phone);
  v_order_id uuid;
  v_ref text;
  r record;
  v_var record;
  v_unit numeric(12,3);
  v_subtotal numeric(12,3) := 0;
  v_discount numeric(12,3) := 0;
  v_fee numeric(12,3) := 0;
  v_settings public.store_settings;
  v_promo public.promotions;
  v_lines int := 0;
  v_group_id uuid;
  v_rate numeric(5,2);
  v_fixed numeric(12,3);
  v_group_commission numeric(12,3);
  v_group_subtotal numeric(12,3);
  v_group_discount numeric(12,3);
  v_has_seller boolean := false;
begin
  if coalesce(length(trim(_customer_name)), 0) < 2 or length(_customer_name) > 120 then raise exception 'invalid_name'; end if;
  if v_phone is null then raise exception 'invalid_phone'; end if;
  if coalesce(length(trim(_city)), 0) < 2 or length(_city) > 80 then raise exception 'invalid_city'; end if;
  if coalesce(length(trim(_address)), 0) < 5 or length(_address) > 500 then raise exception 'invalid_address'; end if;
  if length(coalesce(_instructions, '')) > 500 then raise exception 'invalid_instructions'; end if;
  if _email is not null and length(trim(_email)) > 0 and _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 or jsonb_array_length(_items) > 50 then
    raise exception 'invalid_items';
  end if;

  select * into v_settings from public.store_settings where id;

  v_ref := 'WS' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.order_ref_seq')::text, 6, '0');

  insert into public.orders(reference, user_id, customer_name, phone, email, city, address, instructions, status, stock_state)
  values (v_ref, v_uid, trim(_customer_name), v_phone, nullif(trim(coalesce(_email, '')), ''), trim(_city), trim(_address),
          nullif(trim(coalesce(_instructions, '')), ''), 'pending', 'reserved')
  returning id into v_order_id;

  -- aggregate duplicate lines; lock in variant id order to avoid deadlocks
  for r in
    select (e->>'variant_id')::uuid as variant_id, sum((e->>'quantity')::int) as qty
    from jsonb_array_elements(_items) e
    group by 1 order by 1
  loop
    if r.variant_id is null or r.qty is null or r.qty < 1 or r.qty > 100 then raise exception 'invalid_quantity'; end if;

    select v.id, v.sku, v.price, v.promo_price, v.is_active, p.id as product_id, p.name_fr, p.status,
           p.seller_id,
           coalesce(c.cost, 0) as cost,
           (select string_agg(coalesce(o.label_fr, o.value), ' / ' order by a.display_order, a.name_fr)
              from public.variant_attribute_values vav
              join public.category_attribute_options o on o.id = vav.option_id
              join public.category_attributes a on a.id = vav.attribute_id
             where vav.variant_id = v.id) as label,
           (select pi.url from public.product_images pi where pi.product_id = p.id order by pi.position limit 1) as image
      into v_var
      from public.product_variants v
      join public.products p on p.id = v.product_id
      left join public.variant_costs c on c.variant_id = v.id
     where v.id = r.variant_id;

    if not found or not v_var.is_active or v_var.status <> 'published' then
      raise exception 'variant_unavailable';
    end if;

    -- a suspended seller's items must not be sellable even if a listing is stale
    if v_var.seller_id is not null and not exists (
      select 1 from public.seller_profiles sp where sp.id = v_var.seller_id and sp.status = 'approved'
    ) then
      raise exception 'variant_unavailable';
    end if;

    perform 1 from public.inventory where variant_id = r.variant_id and available >= r.qty for update;
    if not found then raise exception 'insufficient_stock:%', v_var.sku; end if;

    perform public._move_stock(r.variant_id, 'available', 'reserved', r.qty::int, 'reservation', 'Commande ' || v_ref, v_order_id, null, v_uid);

    v_unit := coalesce(v_var.promo_price, v_var.price);
    insert into public.order_items(order_id, product_id, variant_id, product_name, variant_label, sku, image_url, unit_price, unit_cost, quantity, line_total, seller_id)
    values (v_order_id, v_var.product_id, r.variant_id, v_var.name_fr, v_var.label, v_var.sku, v_var.image, v_unit, v_var.cost, r.qty, v_unit * r.qty, v_var.seller_id);

    if v_var.seller_id is not null then v_has_seller := true; end if;
    v_subtotal := v_subtotal + v_unit * r.qty;
    v_lines := v_lines + 1;
  end loop;

  if v_lines = 0 then raise exception 'invalid_items'; end if;

  if _promo_code is not null and length(trim(_promo_code)) > 0 then
    select * into v_promo from public.promotions
     where code = upper(trim(_promo_code)) and is_active
       and (starts_at is null or starts_at <= now())
       and (ends_at is null or ends_at >= now())
       and (max_uses is null or used_count < max_uses)
     for update;
    if not found then raise exception 'invalid_promo'; end if;
    if v_subtotal < v_promo.min_order_amount then raise exception 'promo_min_not_met'; end if;
    v_discount := case when v_promo.type = 'percent' then round(v_subtotal * v_promo.value / 100, 3)
                       else least(v_promo.value, v_subtotal) end;
    update public.promotions set used_count = used_count + 1 where id = v_promo.id;
  end if;

  v_fee := case when v_settings.free_delivery_threshold is not null and (v_subtotal - v_discount) >= v_settings.free_delivery_threshold
                then 0 else coalesce(v_settings.delivery_fee, 0) end;

  -- allocate the order-level discount to each line (last line takes the rounding remainder)
  if v_discount > 0 then
    with base as (
      select oi.id,
             round(v_discount * oi.line_total / nullif(v_subtotal, 0), 3) as d,
             row_number() over (order by oi.id) as rn,
             count(*) over () as cnt
      from public.order_items oi
      where oi.order_id = v_order_id
    ), calc as (
      select b.id,
             case when b.rn = b.cnt
                  then v_discount - coalesce(sum(b.d) over (order by b.id rows between unbounded preceding and 1 preceding), 0)
                  else b.d end as d
      from base b
    )
    update public.order_items oi
    set discount_amount = greatest(calc.d, 0)
    from calc
    where oi.id = calc.id;
  end if;

  -- ---------- seller groups ----------
  for r in
    select oi.seller_id,
           sum(oi.line_total) as subtotal,
           sum(oi.discount_amount) as discount
    from public.order_items oi
    where oi.order_id = v_order_id and oi.seller_id is not null
    group by oi.seller_id
    order by oi.seller_id
  loop
    select coalesce((select scs.commission_pct from public.seller_commission_settings scs where scs.seller_id = r.seller_id),
                    (select scs.commission_pct from public.seller_commission_settings scs where scs.seller_id is null),
                    v_settings.default_commission_pct, 0)
      into v_rate;
    select coalesce((select scs.fixed_fee from public.seller_commission_settings scs where scs.seller_id = r.seller_id),
                    (select scs.fixed_fee from public.seller_commission_settings scs where scs.seller_id is null),
                    v_settings.commission_fixed_fee, 0)
      into v_fixed;

    insert into public.seller_order_groups(
      order_id, seller_id, status, subtotal, discount_total,
      commission_rate, commission_fixed, commission_total, net_amount, stock_state
    ) values (
      v_order_id, r.seller_id, 'pending', r.subtotal, r.discount,
      v_rate, v_fixed, 0, 0, 'reserved'
    ) returning id into v_group_id;

    update public.order_items set
      seller_group_id = v_group_id,
      commission_rate = v_rate,
      commission_amount = round((line_total - discount_amount) * v_rate / 100, 3)
    where order_id = v_order_id and seller_id = r.seller_id;

    select coalesce(sum(commission_amount), 0) into v_group_commission
    from public.order_items where seller_group_id = v_group_id;

    update public.seller_order_groups set
      commission_total = v_group_commission,
      net_amount = r.subtotal - r.discount - v_group_commission - v_fixed
    where id = v_group_id;

    insert into public.seller_order_status_history(seller_group_id, from_status, to_status, note, changed_by)
    values (v_group_id, null, 'pending', 'Commande passée', v_uid);
  end loop;

  -- ---------- platform group (admin-owned lines) ----------
  select sum(oi.line_total), sum(oi.discount_amount)
    into v_group_subtotal, v_group_discount
  from public.order_items oi
  where oi.order_id = v_order_id and oi.seller_id is null;

  if v_group_subtotal is not null then
    insert into public.seller_order_groups(
      order_id, seller_id, status, subtotal, discount_total,
      commission_rate, commission_fixed, commission_total, net_amount, stock_state
    ) values (
      v_order_id, null, 'pending', v_group_subtotal, v_group_discount,
      0, 0, 0, v_group_subtotal - v_group_discount, 'reserved'
    ) returning id into v_group_id;

    update public.order_items set seller_group_id = v_group_id
    where order_id = v_order_id and seller_id is null;

    insert into public.seller_order_status_history(seller_group_id, from_status, to_status, note, changed_by)
    values (v_group_id, null, 'pending', 'Commande passée', v_uid);
  end if;

  update public.orders set
    subtotal = v_subtotal, discount_total = v_discount, delivery_fee = v_fee,
    total = v_subtotal - v_discount + v_fee,
    promotion_id = v_promo.id, promo_code = v_promo.code,
    has_seller_items = v_has_seller
  where id = v_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, note, changed_by)
  values (v_order_id, null, 'pending', 'Commande passée', v_uid);

  if v_uid is not null and _save_address then
    if not exists (select 1 from public.addresses where user_id = v_uid and address_line = trim(_address) and city = trim(_city)) then
      insert into public.addresses(user_id, full_name, phone, city, address_line, instructions, is_default)
      values (v_uid, trim(_customer_name), v_phone, trim(_city), trim(_address), nullif(trim(coalesce(_instructions, '')), ''),
              not exists (select 1 from public.addresses where user_id = v_uid));
    end if;
  end if;

  return jsonb_build_object('order_id', v_order_id, 'reference', v_ref, 'total', v_subtotal - v_discount + v_fee,
                            'has_seller_items', v_has_seller);
end $$;
grant execute on function public.create_order(text, text, text, text, text, text, jsonb, text, boolean) to anon, authenticated;

-- ---------- internal: fulfill one group ----------
create or replace function public._apply_group_status(
  _group_id uuid,
  _status public.order_status,
  _note text,
  _actor uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_group public.seller_order_groups;
  v_order public.orders;
  r record;
  v_rev numeric(12,3);
  v_cogs numeric(12,3);
  v_disc numeric(12,3);
begin
  select * into v_group from public.seller_order_groups where id = _group_id for update;
  if not found then raise exception 'seller_group_not_found'; end if;
  if v_group.status = _status then raise exception 'same_status'; end if;
  if v_group.status in ('cancelled', 'returned') then raise exception 'invalid_transition'; end if;
  if v_group.status = 'delivered' and _status <> 'returned' then raise exception 'invalid_transition'; end if;
  if _status = 'returned' and v_group.status <> 'delivered' then raise exception 'invalid_transition'; end if;

  select * into v_order from public.orders where id = v_group.order_id;

  -- stock leaves the seller / platform warehouse exactly once
  if _status in ('shipped', 'out_for_delivery', 'delivered') and v_group.stock_state = 'reserved' then
    for r in select variant_id, sum(quantity)::int q from public.order_items
             where seller_group_id = _group_id group by variant_id order by variant_id loop
      perform public._move_stock(r.variant_id, 'reserved', null, r.q, 'shipment', 'Expédition ' || v_order.reference, v_order.id, null, _actor);
    end loop;
    update public.seller_order_groups set stock_state = 'consumed' where id = _group_id;
    v_group.stock_state := 'consumed';
  end if;

  if _status = 'cancelled' then
    if v_group.stock_state = 'reserved' then
      for r in select variant_id, sum(quantity)::int q from public.order_items
               where seller_group_id = _group_id group by variant_id order by variant_id loop
        perform public._move_stock(r.variant_id, 'reserved', 'available', r.q, 'reservation_release', 'Annulation ' || v_order.reference, v_order.id, null, _actor);
      end loop;
    elsif v_group.stock_state = 'consumed' then
      for r in select variant_id, sum(quantity)::int q from public.order_items
               where seller_group_id = _group_id group by variant_id order by variant_id loop
        perform public._move_stock(r.variant_id, null, 'available', r.q, 'delivery_return', 'Retour livreur ' || v_order.reference, v_order.id, null, _actor);
      end loop;
    end if;
    update public.seller_order_groups set stock_state = 'released' where id = _group_id;
    v_group.stock_state := 'released';
  end if;

  update public.seller_order_groups set
    status = _status,
    delivered_at = case when _status = 'delivered' then now() else delivered_at end
  where id = _group_id;

  insert into public.seller_order_status_history(seller_group_id, from_status, to_status, note, changed_by)
  values (_group_id, v_group.status, _status, nullif(left(trim(coalesce(_note, '')), 500), ''), _actor);

  if _status = 'delivered' then
    if v_group.seller_id is null then
      select coalesce(sum(line_total - discount_amount), 0),
             coalesce(sum(unit_cost * quantity), 0),
             coalesce(sum(discount_amount), 0)
        into v_rev, v_cogs, v_disc
      from public.order_items where seller_group_id = _group_id;

      insert into public.finance_entries(entry_type, amount, order_id, dedupe_key, created_by)
      values ('revenue', v_rev, v_order.id, 'revenue:' || v_order.id, _actor),
             ('cogs', v_cogs, v_order.id, 'cogs:' || v_order.id, _actor),
             ('discount', v_disc, v_order.id, 'discount:' || v_order.id, _actor)
      on conflict (dedupe_key) do nothing;
    else
      insert into public.finance_entries(entry_type, amount, order_id, seller_id, seller_group_id, dedupe_key, created_by, note)
      values ('commission', v_group.commission_total + v_group.commission_fixed, v_order.id, v_group.seller_id, _group_id,
              'commission:' || _group_id, _actor, 'Commission ' || v_group.commission_rate::text || '%')
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
end $$;
revoke execute on function public._apply_group_status(uuid, public.order_status, text, uuid) from public, anon, authenticated;

-- ---------- internal: derive the customer-facing order status ----------
create or replace function public._refresh_order_status_from_groups(_order_id uuid, _actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_total int;
  v_cancelled int;
  v_delivered int;
  v_returned int;
  v_min int;
  v_target public.order_status;
begin
  select * into v_order from public.orders where id = _order_id for update;
  if not found then return; end if;

  select count(*),
         count(*) filter (where status = 'cancelled'),
         count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'returned')
    into v_total, v_cancelled, v_delivered, v_returned
  from public.seller_order_groups where order_id = _order_id;

  if v_total = 0 then return; end if;

  if v_cancelled = v_total then
    v_target := 'cancelled';
  elsif v_returned = v_total then
    v_target := 'returned';
  elsif v_delivered + v_returned + v_cancelled = v_total and v_delivered > 0 then
    v_target := 'delivered';
  else
    select min(public._order_status_rank(status))
      into v_min
    from public.seller_order_groups
    where order_id = _order_id and status not in ('cancelled', 'returned');
    if v_min is null then
      v_target := case when v_returned > 0 then 'returned'::public.order_status else 'cancelled'::public.order_status end;
    else
      v_target := public._order_status_from_rank(v_min);
    end if;
  end if;

  if v_order.status = v_target then return; end if;

  update public.orders set
    status = v_target,
    stock_state = case
      when v_target = 'cancelled' then 'released'::public.stock_state
      when v_target in ('shipped','out_for_delivery','delivered','returned') then 'consumed'::public.stock_state
      else stock_state
    end,
    confirmed_at = case when v_target = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    shipped_at   = case when v_target = 'shipped' then coalesce(shipped_at, now()) else shipped_at end,
    delivered_at = case when v_target = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    cancelled_at = case when v_target = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end
  where id = _order_id;

  insert into public.order_status_history(order_id, from_status, to_status, note, changed_by)
  values (_order_id, v_order.status, v_target, 'Mise à jour du statut', _actor);

  if v_target = 'delivered' then
    insert into public.finance_entries(entry_type, amount, order_id, dedupe_key, created_by)
    values ('delivery_income', v_order.delivery_fee, _order_id, 'delivery:' || _order_id, _actor)
    on conflict (dedupe_key) do nothing;
  end if;

  if v_order.user_id is not null then
    insert into public.notifications(user_id, title, body, link)
    values (v_order.user_id, 'Commande ' || v_order.reference, 'Statut : ' || v_target::text, '/my-orders');
  end if;
end $$;
revoke execute on function public._refresh_order_status_from_groups(uuid, uuid) from public, anon, authenticated;

-- ---------- admin: apply a status to the whole order ----------
create or replace function public._apply_order_status(_order_id uuid, _status public.order_status, _note text, _actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_allowed boolean;
  v_group public.seller_order_groups;
  r record;
  v_cogs numeric(12,3);
  v_has_groups boolean;
begin
  select * into v_order from public.orders where id = _order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = _status then raise exception 'same_status'; end if;

  v_allowed := case v_order.status
    when 'pending' then _status in ('confirmed','cancelled')
    when 'confirmed' then _status in ('preparing','cancelled')
    when 'preparing' then _status in ('shipped','cancelled')
    when 'shipped' then _status in ('out_for_delivery','delivered','cancelled')
    when 'out_for_delivery' then _status in ('delivered','cancelled')
    when 'delivered' then _status in ('returned')
    else false end;
  if not v_allowed then raise exception 'invalid_transition'; end if;

  select exists (select 1 from public.seller_order_groups where order_id = _order_id) into v_has_groups;

  if v_has_groups then
    if _status = 'returned' then
      for v_group in select * from public.seller_order_groups where order_id = _order_id loop
        if v_group.status = 'delivered' then
          perform public._apply_group_status(v_group.id, 'returned', _note, _actor);
        elsif v_group.status not in ('returned', 'cancelled') then
          raise exception 'invalid_transition';
        end if;
      end loop;
    elsif _status = 'cancelled' then
      for v_group in select * from public.seller_order_groups
                     where order_id = _order_id and status not in ('cancelled','returned') loop
        if v_group.status = 'delivered' then raise exception 'invalid_transition'; end if;
        perform public._apply_group_status(v_group.id, 'cancelled', _note, _actor);
      end loop;
    else
      for v_group in select * from public.seller_order_groups where order_id = _order_id loop
        if v_group.status in ('cancelled','returned') then continue; end if;
        -- groups already ahead of the requested order status keep their progress
        if public._order_status_rank(v_group.status) >= public._order_status_rank(_status) then continue; end if;
        perform public._apply_group_status(v_group.id, _status, _note, _actor);
      end loop;
    end if;

    perform public._refresh_order_status_from_groups(_order_id, _actor);
    return;
  end if;

  -- ---------- legacy orders created before seller groups ----------
  if _status in ('shipped','delivered') and v_order.stock_state = 'reserved' then
    for r in select variant_id, sum(quantity)::int q from public.order_items where order_id = _order_id group by variant_id order by variant_id loop
      perform public._move_stock(r.variant_id, 'reserved', null, r.q, 'shipment', 'Expédition ' || v_order.reference, _order_id, null, _actor);
    end loop;
    update public.orders set stock_state = 'consumed' where id = _order_id;
    v_order.stock_state := 'consumed';
  end if;

  if _status = 'cancelled' then
    if v_order.stock_state = 'reserved' then
      for r in select variant_id, sum(quantity)::int q from public.order_items where order_id = _order_id group by variant_id order by variant_id loop
        perform public._move_stock(r.variant_id, 'reserved', 'available', r.q, 'reservation_release', 'Annulation ' || v_order.reference, _order_id, null, _actor);
      end loop;
    elsif v_order.stock_state = 'consumed' then
      for r in select variant_id, sum(quantity)::int q from public.order_items where order_id = _order_id group by variant_id order by variant_id loop
        perform public._move_stock(r.variant_id, null, 'available', r.q, 'delivery_return', 'Retour livreur ' || v_order.reference, _order_id, null, _actor);
      end loop;
    end if;
    update public.orders set stock_state = 'released' where id = _order_id;
  end if;

  if _status = 'delivered' then
    select coalesce(sum(unit_cost * quantity), 0) into v_cogs from public.order_items where order_id = _order_id;
    insert into public.finance_entries(entry_type, amount, order_id, dedupe_key, created_by)
    values ('revenue', v_order.subtotal, _order_id, 'revenue:' || _order_id, _actor),
           ('cogs', v_cogs, _order_id, 'cogs:' || _order_id, _actor),
           ('discount', v_order.discount_total, _order_id, 'discount:' || _order_id, _actor),
           ('delivery_income', v_order.delivery_fee, _order_id, 'delivery:' || _order_id, _actor)
    on conflict (dedupe_key) do nothing;
  end if;

  update public.orders set
    status = _status,
    confirmed_at = case when _status = 'confirmed' then now() else confirmed_at end,
    shipped_at   = case when _status = 'shipped' then now() else shipped_at end,
    delivered_at = case when _status = 'delivered' then now() else delivered_at end,
    cancelled_at = case when _status = 'cancelled' then now() else cancelled_at end
  where id = _order_id;

  insert into public.order_status_history(order_id, from_status, to_status, note, changed_by)
  values (_order_id, v_order.status, _status, nullif(left(trim(coalesce(_note, '')), 500), ''), _actor);

  if v_order.user_id is not null then
    insert into public.notifications(user_id, title, body, link)
    values (v_order.user_id, 'Commande ' || v_order.reference, 'Statut : ' || _status::text, '/my-orders');
  end if;
end $$;
revoke execute on function public._apply_order_status(uuid, public.order_status, text, uuid) from public, anon, authenticated;

-- ---------- seller fulfillment ----------
create or replace function public.update_seller_order_status(
  _seller_group_id uuid,
  _status public.order_status,
  _note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_seller_id uuid := public.current_seller_id();
  v_group public.seller_order_groups;
  v_allowed boolean;
begin
  if v_seller_id is null then raise exception 'not_a_seller'; end if;
  select * into v_group from public.seller_order_groups where id = _seller_group_id for update;
  if not found or v_group.seller_id is distinct from v_seller_id then raise exception 'seller_group_not_found'; end if;
  if v_group.status = _status then raise exception 'same_status'; end if;

  v_allowed := case v_group.status
    when 'pending' then _status in ('confirmed','cancelled')
    when 'confirmed' then _status in ('preparing','cancelled')
    when 'preparing' then _status in ('shipped','cancelled')
    when 'shipped' then _status in ('out_for_delivery','delivered','cancelled')
    when 'out_for_delivery' then _status in ('delivered','cancelled')
    else false end;
  if not v_allowed then raise exception 'invalid_transition'; end if;

  perform public._apply_group_status(_seller_group_id, _status, _note, auth.uid());
  perform public._refresh_order_status_from_groups(v_group.order_id, auth.uid());
end $$;
revoke execute on function public.update_seller_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.update_seller_order_status(uuid, public.order_status, text) to authenticated;

-- ---------- seller-specific returns ----------
create or replace function public.seller_update_return_status(
  _return_id uuid,
  _status public.return_status,
  _note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_seller_id uuid := public.current_seller_id();
  v_ret public.returns;
  v_ok boolean;
  v_bad int;
begin
  if v_seller_id is null then raise exception 'not_a_seller'; end if;
  select * into v_ret from public.returns where id = _return_id for update;
  if not found then raise exception 'return_not_found'; end if;

  -- a seller may only act when every returned line belongs to them
  select count(*) into v_bad
  from public.return_items ri
  join public.order_items oi on oi.id = ri.order_item_id
  where ri.return_id = _return_id and oi.seller_id is distinct from v_seller_id;
  if v_bad > 0 or not exists (select 1 from public.return_items ri where ri.return_id = _return_id) then
    raise exception 'forbidden';
  end if;

  v_ok := case v_ret.status
    when 'requested' then _status in ('approved','rejected')
    when 'approved' then _status in ('received','rejected')
    else false end;
  if not v_ok then raise exception 'invalid_transition'; end if;

  update public.returns
  set status = _status,
      admin_note = coalesce(nullif(left(trim(coalesce(_note, '')), 2000), ''), admin_note)
  where id = _return_id;

  insert into public.return_status_history(return_id, from_status, to_status, note, changed_by)
  values (_return_id, v_ret.status, _status, nullif(left(trim(coalesce(_note, '')), 500), ''), auth.uid());

  insert into public.notifications(user_id, title, body, link)
  values (v_ret.user_id, 'Retour ' || v_ret.reference, 'Statut : ' || _status::text, '/my-returns');
end $$;
revoke execute on function public.seller_update_return_status(uuid, public.return_status, text) from public, anon;
grant execute on function public.seller_update_return_status(uuid, public.return_status, text) to authenticated;

-- ---------- internal: is every line of a group fully returned? ----------
create or replace function public._seller_group_fully_returned(_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.order_items oi
    where oi.seller_group_id = _group_id
      and oi.quantity > coalesce((
        select sum(ri.quantity)
        from public.return_items ri
        join public.returns rt on rt.id = ri.return_id
        where ri.order_item_id = oi.id and rt.status = 'processed' and ri.processed_at is not null
      ), 0)
  )
$$;
revoke execute on function public._seller_group_fully_returned(uuid) from public, anon, authenticated;

-- ---------- admin: process a return ----------
create or replace function public.process_return(_return_id uuid, _items jsonb, _note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ret public.returns;
  v_order public.orders;
  r record;
  v_ri public.return_items;
  v_oi public.order_items;
  v_cond public.return_condition;
  v_refund numeric(12,3) := 0;
  v_loss numeric(12,3) := 0;
  v_ordered int;
  v_returned int;
  v_line_refund numeric(12,3);
  v_comm_rev numeric(12,3);
  v_group_ids uuid[] := '{}';
  v_gid uuid;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into v_ret from public.returns where id = _return_id for update;
  if not found then raise exception 'return_not_found'; end if;
  if v_ret.status not in ('approved','received') then raise exception 'return_not_ready'; end if;
  select * into v_order from public.orders where id = v_ret.order_id for update;

  for r in select (e->>'return_item_id')::uuid as rid, (e->>'condition') as cond from jsonb_array_elements(_items) e loop
    select * into v_ri from public.return_items where id = r.rid and return_id = _return_id for update;
    if not found then raise exception 'invalid_item'; end if;
    if v_ri.processed_at is not null then raise exception 'already_processed'; end if;
    v_cond := r.cond::public.return_condition;
    select * into v_oi from public.order_items where id = v_ri.order_item_id;

    if v_cond = 'resalable' then
      perform public._move_stock(v_ri.variant_id, null, 'available', v_ri.quantity, 'return_restock', 'Retour ' || v_ret.reference, v_ret.order_id, _return_id, auth.uid());
      update public.return_items set condition = v_cond, processed_at = now(), loss_amount = 0 where id = v_ri.id;
    else
      perform public._move_stock(v_ri.variant_id, null, 'damaged', v_ri.quantity, 'return_damaged', 'Retour ' || v_ret.reference || ' (' || v_cond::text || ')', v_ret.order_id, _return_id, auth.uid());
      update public.return_items set condition = v_cond, processed_at = now(), loss_amount = v_oi.unit_cost * v_ri.quantity where id = v_ri.id;
      -- platform-owned loss is booked here; seller-owned loss stays on the seller's net
      if v_oi.seller_id is null then
        insert into public.finance_entries(entry_type, amount, order_id, return_id, variant_id, dedupe_key, created_by)
        values ('return_loss', v_oi.unit_cost * v_ri.quantity, v_ret.order_id, _return_id, v_ri.variant_id, 'return_loss:' || v_ri.id, auth.uid())
        on conflict (dedupe_key) do nothing;
        v_loss := v_loss + v_oi.unit_cost * v_ri.quantity;
      end if;
    end if;

    v_line_refund := round((v_oi.line_total - v_oi.discount_amount) * v_ri.quantity / v_oi.quantity, 3);

    if v_oi.seller_id is null then
      insert into public.finance_entries(entry_type, amount, order_id, return_id, variant_id, dedupe_key, created_by)
      values ('return_revenue_reversal', v_oi.unit_price * v_ri.quantity, v_ret.order_id, _return_id, v_ri.variant_id, 'return_rev:' || v_ri.id, auth.uid()),
             ('return_cogs_reversal', v_oi.unit_cost * v_ri.quantity, v_ret.order_id, _return_id, v_ri.variant_id, 'return_cogs:' || v_ri.id, auth.uid())
      on conflict (dedupe_key) do nothing;
    else
      -- reverse the platform commission on the returned seller quantity
      v_comm_rev := round(v_oi.commission_amount * v_ri.quantity / v_oi.quantity, 3);
      if v_comm_rev > 0 then
        insert into public.finance_entries(entry_type, amount, order_id, return_id, seller_id, seller_group_id, dedupe_key, created_by)
        values ('commission_reversal', v_comm_rev, v_ret.order_id, _return_id, v_oi.seller_id, v_oi.seller_group_id, 'commission_rev:' || v_ri.id, auth.uid())
        on conflict (dedupe_key) do nothing;

        update public.seller_order_groups set
          commission_reversed = commission_reversed + v_comm_rev,
          net_amount = subtotal - discount_total - refund_total - (commission_total - (commission_reversed + v_comm_rev)) - commission_fixed
        where id = v_oi.seller_group_id;
      end if;
    end if;

    if v_oi.seller_group_id is not null then
      update public.seller_order_groups set
        refund_total = refund_total + v_line_refund,
        net_amount = subtotal - discount_total - (refund_total + v_line_refund)
                    - (commission_total - commission_reversed)
                    - case when seller_id is null then 0 else commission_fixed end
      where id = v_oi.seller_group_id;
      if v_oi.seller_group_id <> all (v_group_ids) then
        v_group_ids := array_append(v_group_ids, v_oi.seller_group_id);
      end if;
    end if;

    v_refund := v_refund + v_line_refund;
  end loop;

  if exists (select 1 from public.return_items where return_id = _return_id and processed_at is null) then
    raise exception 'all_items_required';
  end if;

  update public.returns set
    status = 'processed', refund_amount = v_refund, processed_at = now(), processed_by = auth.uid(),
    admin_note = coalesce(nullif(left(trim(coalesce(_note, '')), 2000), ''), admin_note)
  where id = _return_id;

  insert into public.return_status_history(return_id, from_status, to_status, note, changed_by)
  values (_return_id, v_ret.status, 'processed', nullif(left(trim(coalesce(_note, '')), 500), ''), auth.uid());

  if v_order.payment_status = 'paid' and v_refund > 0 then
    insert into public.finance_entries(entry_type, amount, order_id, return_id, dedupe_key, created_by)
    values ('refund', v_refund, v_order.id, _return_id, 'refund:' || _return_id, auth.uid())
    on conflict (dedupe_key) do nothing;
  end if;

  -- mark groups whose every line is returned
  foreach v_gid in array v_group_ids loop
    if public._seller_group_fully_returned(v_gid) then
      if exists (select 1 from public.seller_order_groups where id = v_gid and status = 'delivered') then
        perform public._apply_group_status(v_gid, 'returned', 'Retour complet ' || v_ret.reference, auth.uid());
      end if;
    end if;
  end loop;

  select coalesce(sum(quantity), 0) into v_ordered from public.order_items where order_id = v_order.id;
  select coalesce(sum(ri.quantity), 0) into v_returned
  from public.return_items ri join public.returns rt on rt.id = ri.return_id
  where rt.order_id = v_order.id and rt.status = 'processed';

  if v_returned >= v_ordered and v_order.status = 'delivered' then
    perform public._apply_order_status(v_order.id, 'returned', 'Retour complet ' || v_ret.reference, auth.uid());
    if v_order.payment_status = 'paid' then
      update public.orders set payment_status = 'refunded' where id = v_order.id;
    end if;
  else
    perform public._refresh_order_status_from_groups(v_order.id, auth.uid());
  end if;

  insert into public.notifications(user_id, title, body, link)
  values (v_ret.user_id, 'Retour ' || v_ret.reference, 'Votre retour a été traité', '/my-returns');

  return jsonb_build_object('refund', v_refund, 'loss', v_loss);
end $$;
revoke execute on function public.process_return(uuid, jsonb, text) from public, anon;
grant execute on function public.process_return(uuid, jsonb, text) to authenticated;

-- ---------- settlements ----------
create or replace function public.admin_create_settlement(
  _seller_id uuid,
  _period_start date default null,
  _period_end date default null,
  _note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_seller public.seller_profiles;
  v_window int;
  v_ref text;
  v_id uuid;
  v_count int;
  v_gross numeric(12,3);
  v_discounts numeric(12,3);
  v_refunds numeric(12,3);
  v_commission numeric(12,3);
  v_fees numeric(12,3);
  v_net numeric(12,3);
  v_start date;
  v_end date;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_seller from public.seller_profiles where id = _seller_id;
  if not found then raise exception 'seller_not_found'; end if;
  if v_seller.status <> 'approved' then raise exception 'seller_not_approved'; end if;
  if _period_start is not null and _period_end is not null and _period_start > _period_end then
    raise exception 'invalid_period';
  end if;

  select return_window_days into v_window from public.store_settings where id;

  select count(*),
         coalesce(sum(g.subtotal), 0),
         coalesce(sum(g.discount_total), 0),
         coalesce(sum(g.refund_total), 0),
         coalesce(sum(g.commission_total - g.commission_reversed), 0),
         coalesce(sum(g.commission_fixed), 0),
         coalesce(sum(g.net_amount), 0),
         min(g.delivered_at::date),
         max(g.delivered_at::date)
    into v_count, v_gross, v_discounts, v_refunds, v_commission, v_fees, v_net, v_start, v_end
  from public.seller_order_groups g
  join public.orders o on o.id = g.order_id
  where g.seller_id = _seller_id
    and g.status = 'delivered'
    and o.payment_status = 'paid'
    and g.delivered_at <= now() - make_interval(days => coalesce(v_window, 0))
    and (_period_start is null or g.delivered_at::date >= _period_start)
    and (_period_end is null or g.delivered_at::date <= _period_end)
    and not exists (select 1 from public.seller_settlement_items si where si.seller_group_id = g.id)
    and not exists (
      select 1
      from public.returns rt
      join public.return_items ri on ri.return_id = rt.id
      join public.order_items oi on oi.id = ri.order_item_id
      where oi.seller_group_id = g.id
        and rt.status in ('requested','approved','received')
    );

  if v_count = 0 then raise exception 'no_eligible_groups'; end if;

  v_ref := 'ST' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.settlement_ref_seq')::text, 5, '0');

  insert into public.seller_settlements(
    reference, seller_id, period_start, period_end,
    gross_sales, discounts, refunds, commission, fees, net_amount,
    status, note, created_at
  ) values (
    v_ref, _seller_id, coalesce(_period_start, v_start), coalesce(_period_end, v_end),
    v_gross, v_discounts, v_refunds, v_commission, v_fees, v_net,
    'pending', nullif(left(trim(coalesce(_note, '')), 2000), ''), now()
  ) returning id into v_id;

  insert into public.seller_settlement_items(settlement_id, seller_group_id, gross_amount, commission_amount, net_amount)
  select v_id, g.id, g.subtotal - g.discount_total - g.refund_total,
         g.commission_total - g.commission_reversed + g.commission_fixed,
         g.net_amount
  from public.seller_order_groups g
  join public.orders o on o.id = g.order_id
  where g.seller_id = _seller_id
    and g.status = 'delivered'
    and o.payment_status = 'paid'
    and g.delivered_at <= now() - make_interval(days => coalesce(v_window, 0))
    and (_period_start is null or g.delivered_at::date >= _period_start)
    and (_period_end is null or g.delivered_at::date <= _period_end)
    and not exists (select 1 from public.seller_settlement_items si where si.seller_group_id = g.id)
    and not exists (
      select 1
      from public.returns rt
      join public.return_items ri on ri.return_id = rt.id
      join public.order_items oi on oi.id = ri.order_item_id
      where oi.seller_group_id = g.id
        and rt.status in ('requested','approved','received')
    );

  return jsonb_build_object(
    'settlement_id', v_id, 'reference', v_ref, 'group_count', v_count,
    'net_amount', v_net, 'commission', v_commission, 'fees', v_fees
  );
end $$;
revoke execute on function public.admin_create_settlement(uuid, date, date, text) from public, anon;
grant execute on function public.admin_create_settlement(uuid, date, date, text) to authenticated;

create or replace function public.admin_record_settlement_payment(
  _settlement_id uuid,
  _amount numeric,
  _note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.seller_settlements;
  v_payment_id uuid;
  v_paid numeric(12,3);
  v_remaining numeric(12,3);
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if _amount is null or _amount <= 0 then raise exception 'invalid_amount'; end if;
  select * into v from public.seller_settlements where id = _settlement_id for update;
  if not found then raise exception 'settlement_not_found'; end if;
  if v.status = 'cancelled' then raise exception 'settlement_cancelled'; end if;

  v_remaining := v.net_amount - v.paid_amount;
  if v_remaining <= 0 then raise exception 'already_paid'; end if;
  if _amount > v_remaining then raise exception 'amount_exceeds_balance'; end if;
  if _note is not null and length(_note) > 500 then raise exception 'invalid_note'; end if;

  insert into public.seller_settlement_payments(settlement_id, amount, recorded_by, note)
  values (_settlement_id, _amount, auth.uid(), nullif(left(trim(_note), 500), ''))
  returning id into v_payment_id;

  v_paid := v.paid_amount + _amount;

  update public.seller_settlements set
    paid_amount = v_paid,
    status = case when v_paid >= v.net_amount then 'paid'::public.settlement_status else 'partial'::public.settlement_status end,
    settled_at = case when v_paid >= v.net_amount then now() else settled_at end,
    settled_by = case when v_paid >= v.net_amount then auth.uid() else settled_by end
  where id = _settlement_id;

  insert into public.finance_entries(entry_type, amount, seller_id, dedupe_key, created_by, note)
  values ('seller_settlement', _amount, v.seller_id, 'settlement_pay:' || v_payment_id, auth.uid(),
          'Règlement ' || v.reference)
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object('settlement_id', _settlement_id, 'paid_amount', v_paid, 'net_amount', v.net_amount,
                            'status', case when v_paid >= v.net_amount then 'paid' else 'partial' end);
end $$;
revoke execute on function public.admin_record_settlement_payment(uuid, numeric, text) from public, anon;
grant execute on function public.admin_record_settlement_payment(uuid, numeric, text) to authenticated;

create or replace function public.admin_cancel_settlement(_settlement_id uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.seller_settlements;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v from public.seller_settlements where id = _settlement_id for update;
  if not found then raise exception 'settlement_not_found'; end if;
  if v.status <> 'pending' or v.paid_amount > 0 then raise exception 'cannot_cancel'; end if;

  delete from public.seller_settlement_items where settlement_id = _settlement_id;
  update public.seller_settlements set
    status = 'cancelled',
    note = coalesce(nullif(left(trim(coalesce(_note, '')), 2000), ''), note)
  where id = _settlement_id;
end $$;
revoke execute on function public.admin_cancel_settlement(uuid, text) from public, anon;
grant execute on function public.admin_cancel_settlement(uuid, text) to authenticated;

-- ---------- admin customer directory ----------
create or replace function public.admin_customer_directory(
  _q text default null,
  _limit int default 25,
  _offset int default 0
) returns table (
  customer_key text, user_id uuid, full_name text, phone text, email text, city text,
  order_count bigint, delivered_count bigint, cancelled_count bigint,
  total_spent numeric, last_order_at timestamptz, first_order_at timestamptz, total bigint
) language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(lower(btrim(coalesce(_q, ''))), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  with grouped as (
    select
      case when o.user_id is not null then 'u:' || o.user_id::text else 'g:' || o.phone end as customer_key,
      max(o.user_id::text)::uuid as user_id,
      max(o.customer_name) as full_name,
      max(o.phone) as phone,
      max(o.email) as email,
      max(o.city) as city,
      count(*) as order_count,
      count(*) filter (where o.status = 'delivered') as delivered_count,
      count(*) filter (where o.status = 'cancelled') as cancelled_count,
      coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)::numeric(12,3) as total_spent,
      max(o.created_at) as last_order_at,
      min(o.created_at) as first_order_at
    from public.orders o
    group by 1
  ), filtered as (
    select g.* from grouped g
    where v_q is null
       or position(v_q in lower(g.full_name)) > 0
       or position(v_q in g.phone) > 0
       or position(v_q in lower(coalesce(g.email, ''))) > 0
       or position(v_q in lower(coalesce(g.city, ''))) > 0
  )
  select f.customer_key, f.user_id, f.full_name, f.phone, f.email, f.city,
         f.order_count, f.delivered_count, f.cancelled_count, f.total_spent,
         f.last_order_at, f.first_order_at, count(*) over () as total
  from filtered f
  order by f.last_order_at desc, f.customer_key
  limit least(greatest(coalesce(_limit, 25), 1), 200)
  offset greatest(coalesce(_offset, 0), 0);
end $$;
revoke execute on function public.admin_customer_directory(text, int, int) from public, anon;
grant execute on function public.admin_customer_directory(text, int, int) to authenticated;
