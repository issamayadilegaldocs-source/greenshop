-- =========================================================
-- weshop transactional business functions
-- =========================================================

-- normalize Tunisian phone to 8 digits (returns null if invalid)
create or replace function public.normalize_phone(_phone text)
returns text language plpgsql immutable set search_path = public as $$
declare v text := regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g');
begin
  if v like '00216%' then v := substr(v, 6); end if;
  if v like '216%' and length(v) = 11 then v := substr(v, 4); end if;
  if v ~ '^[2-9][0-9]{7}$' then return v; end if;
  return null;
end $$;

-- ---------- internal: move stock between buckets with movement log ----------
create or replace function public._move_stock(
  _variant_id uuid, _from text, _to text, _qty int, _type public.movement_type,
  _reason text, _order_id uuid, _return_id uuid, _actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_inv public.inventory; v_sku text;
begin
  if _qty is null or _qty <= 0 then raise exception 'invalid_quantity'; end if;
  select * into v_inv from public.inventory where variant_id = _variant_id for update;
  if not found then raise exception 'inventory_not_found'; end if;
  if _from = 'available' and v_inv.available < _qty then raise exception 'insufficient_stock'; end if;
  if _from = 'reserved'  and v_inv.reserved  < _qty then raise exception 'insufficient_reserved'; end if;
  if _from = 'damaged'   and v_inv.damaged   < _qty then raise exception 'insufficient_damaged'; end if;
  if _from = 'incoming'  and v_inv.incoming  < _qty then raise exception 'insufficient_incoming'; end if;

  update public.inventory set
    available = available - (case when _from = 'available' then _qty else 0 end) + (case when _to = 'available' then _qty else 0 end),
    reserved  = reserved  - (case when _from = 'reserved'  then _qty else 0 end) + (case when _to = 'reserved'  then _qty else 0 end),
    damaged   = damaged   - (case when _from = 'damaged'   then _qty else 0 end) + (case when _to = 'damaged'   then _qty else 0 end),
    incoming  = incoming  - (case when _from = 'incoming'  then _qty else 0 end) + (case when _to = 'incoming'  then _qty else 0 end),
    updated_at = now()
  where variant_id = _variant_id;

  select sku into v_sku from public.product_variants where id = _variant_id;
  insert into public.inventory_movements(variant_id, sku, from_bucket, to_bucket, quantity, movement_type, reason, order_id, return_id, created_by)
  values (_variant_id, v_sku, _from, _to, _qty, _type, left(_reason, 500), _order_id, _return_id, _actor);
end $$;
revoke execute on function public._move_stock(uuid, text, text, int, public.movement_type, text, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------- availability for storefront ----------
create or replace function public.get_variant_availability(_product_ids uuid[])
returns table (variant_id uuid, product_id uuid, available int)
language sql stable security definer set search_path = public as $$
  select v.id, v.product_id, i.available
  from public.product_variants v
  join public.products p on p.id = v.product_id
  join public.inventory i on i.variant_id = v.id
  where v.product_id = any(_product_ids) and p.status = 'published' and v.is_active
$$;
grant execute on function public.get_variant_availability(uuid[]) to anon, authenticated;

-- ---------- CREATE ORDER (COD) ----------
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

    perform 1 from public.inventory where variant_id = r.variant_id and available >= r.qty for update;
    if not found then raise exception 'insufficient_stock:%', v_var.sku; end if;

    perform public._move_stock(r.variant_id, 'available', 'reserved', r.qty::int, 'reservation', 'Commande ' || v_ref, v_order_id, null, v_uid);

    v_unit := coalesce(v_var.promo_price, v_var.price);
    insert into public.order_items(order_id, product_id, variant_id, product_name, variant_label, sku, image_url, unit_price, unit_cost, quantity, line_total)
    values (v_order_id, v_var.product_id, r.variant_id, v_var.name_fr, v_var.label, v_var.sku, v_var.image, v_unit, v_var.cost, r.qty, v_unit * r.qty);

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

  update public.orders set
    subtotal = v_subtotal, discount_total = v_discount, delivery_fee = v_fee,
    total = v_subtotal - v_discount + v_fee,
    promotion_id = v_promo.id, promo_code = v_promo.code
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

  return jsonb_build_object('order_id', v_order_id, 'reference', v_ref, 'total', v_subtotal - v_discount + v_fee);
end $$;
grant execute on function public.create_order(text, text, text, text, text, text, jsonb, text, boolean) to anon, authenticated;

-- ---------- promo preview (no side effects) ----------
create or replace function public.check_promo(_code text, _subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.promotions; v_discount numeric(12,3);
begin
  select * into v from public.promotions
   where code = upper(trim(_code)) and is_active
     and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
     and (max_uses is null or used_count < max_uses);
  if not found then return jsonb_build_object('valid', false, 'error', 'invalid_promo'); end if;
  if _subtotal < v.min_order_amount then return jsonb_build_object('valid', false, 'error', 'promo_min_not_met', 'min', v.min_order_amount); end if;
  v_discount := case when v.type = 'percent' then round(_subtotal * v.value / 100, 3) else least(v.value, _subtotal) end;
  return jsonb_build_object('valid', true, 'code', v.code, 'discount', v_discount);
end $$;
grant execute on function public.check_promo(text, numeric) to anon, authenticated;

-- ---------- internal: apply order status ----------
create or replace function public._apply_order_status(_order_id uuid, _status public.order_status, _note text, _actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_allowed boolean;
  r record;
  v_cogs numeric(12,3);
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

  -- stock leaves the warehouse
  if _status in ('shipped','delivered') and v_order.stock_state = 'reserved' then
    for r in select variant_id, sum(quantity)::int q from public.order_items where order_id = _order_id group by variant_id order by variant_id loop
      perform public._move_stock(r.variant_id, 'reserved', null, r.q, 'shipment', 'Expédition ' || v_order.reference, _order_id, null, _actor);
    end loop;
    update public.orders set stock_state = 'consumed' where id = _order_id;
    v_order.stock_state := 'consumed';
  end if;

  -- cancellation: release exactly once
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

  -- delivered: book the sale once
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

create or replace function public.update_order_status(_order_id uuid, _status public.order_status, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  perform public._apply_order_status(_order_id, _status, _note, auth.uid());
end $$;
revoke execute on function public.update_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.update_order_status(uuid, public.order_status, text) to authenticated;

create or replace function public.cancel_my_order(_order_id uuid, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v from public.orders where id = _order_id;
  if not found or v.user_id is distinct from auth.uid() then raise exception 'order_not_found'; end if;
  if v.status <> 'pending' then raise exception 'cannot_cancel'; end if;
  perform public._apply_order_status(_order_id, 'cancelled', coalesce('Annulée par le client. ' || _reason, 'Annulée par le client'), auth.uid());
end $$;
revoke execute on function public.cancel_my_order(uuid, text) from public, anon;
grant execute on function public.cancel_my_order(uuid, text) to authenticated;

-- ---------- CASH COLLECTION ----------
create or replace function public.collect_cod_payment(_order_id uuid, _amount numeric, _collected_by text, _collected_at timestamptz default now(), _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if _amount is null or _amount < 0 then raise exception 'invalid_amount'; end if;
  if coalesce(length(trim(_collected_by)), 0) < 2 then raise exception 'collector_required'; end if;
  select * into v from public.orders where id = _order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v.status <> 'delivered' then raise exception 'order_not_delivered'; end if;
  if v.payment_status <> 'unpaid' then raise exception 'already_collected'; end if;

  insert into public.cash_collections(order_id, amount_expected, amount_collected, collected_at, collected_by_name, recorded_by, note)
  values (_order_id, v.total, _amount, coalesce(_collected_at, now()), trim(_collected_by), auth.uid(), nullif(trim(coalesce(_note, '')), ''));

  update public.orders set payment_status = 'paid' where id = _order_id;

  insert into public.finance_entries(entry_type, amount, order_id, dedupe_key, created_by, note)
  values ('cash_collected', _amount, _order_id, 'cash:' || _order_id, auth.uid(), 'Encaissé par ' || trim(_collected_by))
  on conflict (dedupe_key) do nothing;

  insert into public.order_status_history(order_id, from_status, to_status, note, changed_by)
  values (_order_id, v.status, v.status, 'Paiement encaissé : ' || _amount::text || ' TND (' || trim(_collected_by) || ')', auth.uid());
end $$;
revoke execute on function public.collect_cod_payment(uuid, numeric, text, timestamptz, text) from public, anon;
grant execute on function public.collect_cod_payment(uuid, numeric, text, timestamptz, text) to authenticated;

-- ---------- INVENTORY ADJUSTMENTS ----------
create or replace function public.adjust_inventory(_variant_id uuid, _action text, _quantity int, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric(12,3); v_mid uuid;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if coalesce(length(trim(_reason)), 0) < 2 then raise exception 'reason_required'; end if;
  if _quantity is null or _quantity <= 0 or _quantity > 100000 then raise exception 'invalid_quantity'; end if;

  case _action
    when 'restock'          then perform public._move_stock(_variant_id, null, 'available', _quantity, 'restock', _reason, null, null, auth.uid());
    when 'initial'          then perform public._move_stock(_variant_id, null, 'available', _quantity, 'initial', _reason, null, null, auth.uid());
    when 'remove'           then perform public._move_stock(_variant_id, 'available', null, _quantity, 'removal', _reason, null, null, auth.uid());
    when 'damage'           then perform public._move_stock(_variant_id, 'available', 'damaged', _quantity, 'damage', _reason, null, null, auth.uid());
    when 'repair_damaged'   then perform public._move_stock(_variant_id, 'damaged', 'available', _quantity, 'damage_repaired', _reason, null, null, auth.uid());
    when 'writeoff_damaged' then perform public._move_stock(_variant_id, 'damaged', null, _quantity, 'damage_writeoff', _reason, null, null, auth.uid());
    when 'incoming'         then perform public._move_stock(_variant_id, null, 'incoming', _quantity, 'incoming', _reason, null, null, auth.uid());
    when 'receive_incoming' then perform public._move_stock(_variant_id, 'incoming', 'available', _quantity, 'incoming_received', _reason, null, null, auth.uid());
    else raise exception 'invalid_action';
  end case;

  if _action = 'damage' then
    select cost into v_cost from public.variant_costs where variant_id = _variant_id;
    select id into v_mid from public.inventory_movements where variant_id = _variant_id order by created_at desc limit 1;
    insert into public.finance_entries(entry_type, amount, variant_id, dedupe_key, created_by, note)
    values ('damage_loss', coalesce(v_cost, 0) * _quantity, _variant_id, 'damage:' || v_mid, auth.uid(), left(_reason, 300))
    on conflict (dedupe_key) do nothing;
  end if;
end $$;
revoke execute on function public.adjust_inventory(uuid, text, int, text) from public, anon;
grant execute on function public.adjust_inventory(uuid, text, int, text) to authenticated;

create or replace function public.set_low_stock_threshold(_variant_id uuid, _threshold int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if _threshold is null or _threshold < 0 or _threshold > 100000 then raise exception 'invalid_threshold'; end if;
  update public.inventory set low_stock_threshold = _threshold, updated_at = now() where variant_id = _variant_id;
end $$;
revoke execute on function public.set_low_stock_threshold(uuid, int) from public, anon;
grant execute on function public.set_low_stock_threshold(uuid, int) to authenticated;

-- ---------- RETURNS ----------
create or replace function public.request_return(_order_id uuid, _items jsonb, _reason text, _description text default null, _photos text[] default array[]::text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_window int;
  v_return_id uuid;
  v_ref text;
  r record;
  v_oi public.order_items;
  v_already int;
  v_count int := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(length(trim(_reason)), 0) < 2 or length(_reason) > 200 then raise exception 'invalid_reason'; end if;
  if length(coalesce(_description, '')) > 2000 then raise exception 'invalid_description'; end if;
  if coalesce(array_length(_photos, 1), 0) > 6 then raise exception 'too_many_photos'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'invalid_items'; end if;

  select * into v_order from public.orders where id = _order_id for update;
  if not found or v_order.user_id is distinct from auth.uid() then raise exception 'order_not_found'; end if;
  if v_order.status <> 'delivered' then raise exception 'order_not_delivered'; end if;
  select return_window_days into v_window from public.store_settings where id;
  if v_order.delivered_at < now() - make_interval(days => v_window) then raise exception 'return_window_expired'; end if;

  v_ref := 'RT' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.return_ref_seq')::text, 5, '0');
  insert into public.returns(reference, order_id, user_id, reason, description, photos)
  values (v_ref, _order_id, auth.uid(), trim(_reason), nullif(trim(coalesce(_description, '')), ''), coalesce(_photos, array[]::text[]))
  returning id into v_return_id;

  for r in select (e->>'order_item_id')::uuid as oid, (e->>'quantity')::int as qty from jsonb_array_elements(_items) e loop
    if r.qty is null or r.qty <= 0 then continue; end if;
    select * into v_oi from public.order_items where id = r.oid and order_id = _order_id;
    if not found then raise exception 'invalid_item'; end if;
    select coalesce(sum(ri.quantity), 0) into v_already
      from public.return_items ri join public.returns rt on rt.id = ri.return_id
     where ri.order_item_id = r.oid and rt.status <> 'rejected';
    if v_already + r.qty > v_oi.quantity then raise exception 'quantity_exceeds_order'; end if;
    insert into public.return_items(return_id, order_item_id, variant_id, quantity) values (v_return_id, r.oid, v_oi.variant_id, r.qty);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'invalid_items'; end if;

  insert into public.return_status_history(return_id, from_status, to_status, note, changed_by)
  values (v_return_id, null, 'requested', 'Demande de retour', auth.uid());

  return jsonb_build_object('return_id', v_return_id, 'reference', v_ref);
end $$;
revoke execute on function public.request_return(uuid, jsonb, text, text, text[]) from public, anon;
grant execute on function public.request_return(uuid, jsonb, text, text, text[]) to authenticated;

create or replace function public.update_return_status(_return_id uuid, _status public.return_status, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.returns; v_ok boolean;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into v from public.returns where id = _return_id for update;
  if not found then raise exception 'return_not_found'; end if;
  v_ok := case v.status
    when 'requested' then _status in ('approved','rejected')
    when 'approved' then _status in ('received','rejected')
    else false end;
  if not v_ok then raise exception 'invalid_transition'; end if;
  update public.returns set status = _status, admin_note = coalesce(nullif(trim(coalesce(_note, '')), ''), admin_note) where id = _return_id;
  insert into public.return_status_history(return_id, from_status, to_status, note, changed_by)
  values (_return_id, v.status, _status, nullif(left(trim(coalesce(_note, '')), 500), ''), auth.uid());
  insert into public.notifications(user_id, title, body, link)
  values (v.user_id, 'Retour ' || v.reference, 'Statut : ' || _status::text, '/my-returns');
end $$;
revoke execute on function public.update_return_status(uuid, public.return_status, text) from public, anon;
grant execute on function public.update_return_status(uuid, public.return_status, text) to authenticated;

-- _items: [{ "return_item_id": uuid, "condition": "resalable"|"damaged"|"unsellable" }]
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
  v_ordered int; v_returned int;
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
      insert into public.finance_entries(entry_type, amount, order_id, return_id, variant_id, dedupe_key, created_by)
      values ('return_loss', v_oi.unit_cost * v_ri.quantity, v_ret.order_id, _return_id, v_ri.variant_id, 'return_loss:' || v_ri.id, auth.uid())
      on conflict (dedupe_key) do nothing;
      v_loss := v_loss + v_oi.unit_cost * v_ri.quantity;
    end if;

    insert into public.finance_entries(entry_type, amount, order_id, return_id, variant_id, dedupe_key, created_by)
    values ('return_revenue_reversal', v_oi.unit_price * v_ri.quantity, v_ret.order_id, _return_id, v_ri.variant_id, 'return_rev:' || v_ri.id, auth.uid()),
           ('return_cogs_reversal', v_oi.unit_cost * v_ri.quantity, v_ret.order_id, _return_id, v_ri.variant_id, 'return_cogs:' || v_ri.id, auth.uid())
    on conflict (dedupe_key) do nothing;

    v_refund := v_refund + v_oi.unit_price * v_ri.quantity;
  end loop;

  if exists (select 1 from public.return_items where return_id = _return_id and processed_at is null) then
    raise exception 'all_items_required';
  end if;

  update public.returns set status = 'processed', refund_amount = v_refund, processed_at = now(), processed_by = auth.uid(),
         admin_note = coalesce(nullif(trim(coalesce(_note, '')), ''), admin_note)
   where id = _return_id;
  insert into public.return_status_history(return_id, from_status, to_status, note, changed_by)
  values (_return_id, v_ret.status, 'processed', nullif(left(trim(coalesce(_note, '')), 500), ''), auth.uid());

  if v_order.payment_status = 'paid' and v_refund > 0 then
    insert into public.finance_entries(entry_type, amount, order_id, return_id, dedupe_key, created_by)
    values ('refund', v_refund, v_order.id, _return_id, 'refund:' || _return_id, auth.uid())
    on conflict (dedupe_key) do nothing;
  end if;

  -- whole order returned?
  select coalesce(sum(quantity), 0) into v_ordered from public.order_items where order_id = v_order.id;
  select coalesce(sum(ri.quantity), 0) into v_returned from public.return_items ri join public.returns rt on rt.id = ri.return_id
   where rt.order_id = v_order.id and rt.status = 'processed';
  if v_returned >= v_ordered and v_order.status = 'delivered' then
    perform public._apply_order_status(v_order.id, 'returned', 'Retour complet ' || v_ret.reference, auth.uid());
    if v_order.payment_status = 'paid' then
      update public.orders set payment_status = 'refunded' where id = v_order.id;
    end if;
  end if;

  insert into public.notifications(user_id, title, body, link)
  values (v_ret.user_id, 'Retour ' || v_ret.reference, 'Votre retour a été traité', '/my-returns');

  return jsonb_build_object('refund', v_refund, 'loss', v_loss);
end $$;
revoke execute on function public.process_return(uuid, jsonb, text) from public, anon;
grant execute on function public.process_return(uuid, jsonb, text) to authenticated;

-- ---------- GUEST TRACKING ----------
create or replace function public.track_order(_reference text, _phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.orders; v_phone text := public.normalize_phone(_phone);
begin
  if v_phone is null or coalesce(length(trim(_reference)), 0) < 4 then return null; end if;
  select * into v from public.orders where reference = upper(trim(_reference)) and phone = v_phone;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v.id, 'reference', v.reference, 'status', v.status, 'payment_status', v.payment_status,
    'created_at', v.created_at, 'customer_name', v.customer_name, 'city', v.city, 'address', v.address,
    'subtotal', v.subtotal, 'discount_total', v.discount_total, 'delivery_fee', v.delivery_fee, 'total', v.total,
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_name', product_name, 'variant_label', variant_label,
                'quantity', quantity, 'unit_price', unit_price, 'line_total', line_total, 'image_url', image_url))
              from public.order_items where order_id = v.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('to_status', to_status, 'created_at', created_at) order by created_at)
              from public.order_status_history where order_id = v.id and from_status is distinct from to_status), '[]'::jsonb)
  );
end $$;
grant execute on function public.track_order(text, text) to anon, authenticated;

-- ---------- ADMIN: role management ----------
create or replace function public.set_user_role(_user_id uuid, _role public.app_role, _grant boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if _grant then
    insert into public.user_roles(user_id, role) values (_user_id, _role) on conflict do nothing;
  else
    if _user_id = auth.uid() and _role = 'admin' then raise exception 'cannot_remove_self'; end if;
    delete from public.user_roles where user_id = _user_id and role = _role;
  end if;
end $$;
revoke execute on function public.set_user_role(uuid, public.app_role, boolean) from public, anon;
grant execute on function public.set_user_role(uuid, public.app_role, boolean) to authenticated;

-- internal helpers shouldn't be callable directly by clients
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_variant() from public, anon, authenticated;
revoke execute on function public.refresh_variant_combination() from public, anon, authenticated;
revoke execute on function public.refresh_product_rating() from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.guard_review() from public, anon, authenticated;
