-- Fix ERP RPCs to match exact column names: variant_costs(cost) and inventory_movements(variant_id, sku, movement_type, quantity, to_bucket, reason, created_by).

create or replace function public.apply_shipment_landed_cost(
  _shipment_id uuid,
  _allocation_method text,
  _allocations jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_item_id uuid;
  v_prod_id uuid;
  v_var_id uuid;
  v_qty integer;
  v_base numeric(12,3);
  v_exp numeric(12,3);
  v_total numeric(12,3);
  v_unit numeric(12,3);
  v_count integer := 0;
  v_exp_sum numeric(12,3) := 0;
begin
  if not public.has_permission('imports.manage') then
    raise exception 'forbidden';
  end if;

  select coalesce(sum(amount_tnd), 0) into v_exp_sum
  from public.import_expenses
  where shipment_id = _shipment_id;

  update public.import_shipments
  set allocation_method = _allocation_method,
      total_expenses_tnd = v_exp_sum,
      updated_at = now()
  where id = _shipment_id;

  for v_row in select * from jsonb_array_elements(_allocations)
  loop
    v_item_id := (v_row->>'purchase_order_item_id')::uuid;
    v_prod_id := (v_row->>'product_id')::uuid;
    v_var_id := (v_row->>'variant_id')::uuid;
    v_qty := greatest(1, (v_row->>'quantity')::integer);
    v_base := round((v_row->>'base_purchase_tnd')::numeric, 3);
    v_exp := round((v_row->>'allocated_expenses_tnd')::numeric, 3);
    v_total := round((v_row->>'total_landed_tnd')::numeric, 3);
    v_unit := round((v_row->>'unit_landed_cost_tnd')::numeric, 3);

    insert into public.landed_cost_allocations (
      shipment_id, purchase_order_item_id, product_id, variant_id,
      allocation_method, quantity, base_purchase_tnd, allocated_expenses_tnd,
      total_landed_tnd, unit_landed_cost_tnd
    )
    values (
      _shipment_id, v_item_id, v_prod_id, v_var_id,
      _allocation_method, v_qty, v_base, v_exp, v_total, v_unit
    );

    update public.purchase_order_items
    set landed_unit_cost_tnd = v_unit
    where id = v_item_id;

    update public.products
    set landed_cost = v_unit, updated_at = now()
    where id = v_prod_id;

    insert into public.variant_costs (variant_id, cost)
    values (v_var_id, v_unit)
    on conflict (variant_id) do update
      set cost = excluded.cost, updated_at = now();

    v_count := v_count + 1;
  end loop;

  perform public.log_audit_event(
    'erp',
    'imports.landed_cost_applied',
    'Coût de revient (Landed Cost) calculé et appliqué sur ' || v_count || ' ligne(s) (' || _allocation_method || ')',
    'import_shipment',
    _shipment_id::text,
    jsonb_build_object('count', v_count, 'method', _allocation_method, 'total_expenses_tnd', v_exp_sum)
  );

  return v_count;
end;
$$;

create or replace function public.receive_purchase_order_item(
  _po_item_id uuid,
  _qty integer,
  _shipment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.purchase_order_items%rowtype;
  v_po public.purchase_orders%rowtype;
  v_remaining integer;
  v_unit_tnd numeric(12,3);
  v_batch_code text;
  v_all_received boolean;
  v_new_status text;
  v_wh_id uuid;
begin
  if not (public.has_permission('purchases.manage') or public.has_permission('inventory.manage')) then
    raise exception 'forbidden';
  end if;
  if _qty is null or _qty <= 0 then
    raise exception 'La quantité reçue doit être supérieure à 0.';
  end if;

  select * into v_item from public.purchase_order_items where id = _po_item_id for update;
  if not found then
    raise exception 'Ligne de commande fournisseur introuvable.';
  end if;

  select * into v_po from public.purchase_orders where id = v_item.purchase_order_id for update;
  if v_po.status in ('CANCELLED', 'CLOSED') then
    raise exception 'Impossible de réceptionner un bon de commande annulé ou clôturé.';
  end if;

  v_remaining := v_item.quantity_ordered - v_item.quantity_received;
  if _qty > v_remaining then
    raise exception 'Quantité reçue (%) supérieure au reliquat (%).', _qty, v_remaining;
  end if;

  v_unit_tnd := coalesce(v_item.landed_unit_cost_tnd, round(v_item.unit_cost_foreign * v_po.exchange_rate, 3));
  v_batch_code := v_po.po_number || '-' || to_char(now(), 'YYMMDD-HH24MI');

  select coalesce(v_po.warehouse_id, (select id from public.warehouses where is_default = true limit 1))
  into v_wh_id;

  update public.purchase_order_items
  set quantity_received = quantity_received + _qty
  where id = _po_item_id;

  insert into public.stock_batches (
    batch_code, variant_id, product_id, warehouse_id,
    purchase_order_id, shipment_id, quantity_initial, quantity_remaining, unit_landed_cost_tnd
  )
  values (
    v_batch_code, v_item.variant_id, v_item.product_id, v_wh_id,
    v_po.id, _shipment_id, _qty, _qty, v_unit_tnd
  );

  insert into public.inventory (variant_id, available, reserved, low_stock_threshold)
  values (v_item.variant_id, _qty, 0, 5)
  on conflict (variant_id) do update
    set available = public.inventory.available + _qty,
        updated_at = now();

  insert into public.inventory_movements (
    variant_id, sku, movement_type, quantity, to_bucket, reason, created_by
  )
  values (
    v_item.variant_id, v_item.sku, 'incoming_received', _qty, 'available',
    'Réception ' || v_po.po_number || ' (lot ' || v_batch_code || ' · ' || v_unit_tnd || ' DT)',
    auth.uid()
  );

  update public.products set landed_cost = v_unit_tnd, updated_at = now() where id = v_item.product_id;
  insert into public.variant_costs (variant_id, cost)
  values (v_item.variant_id, v_unit_tnd)
  on conflict (variant_id) do update
    set cost = excluded.cost, updated_at = now();

  select not exists (
    select 1 from public.purchase_order_items
    where purchase_order_id = v_po.id and quantity_received < quantity_ordered
  ) into v_all_received;

  v_new_status := case when v_all_received then 'RECEIVED' else 'PARTIALLY_RECEIVED' end;
  update public.purchase_orders set status = v_new_status, updated_at = now() where id = v_po.id;

  perform public.log_audit_event(
    'erp',
    'purchases.item_received',
    'Réception stock +' || _qty || ' × ' || v_item.sku || ' (' || v_po.po_number || ')',
    'purchase_order',
    v_po.id::text,
    jsonb_build_object('po_item_id', _po_item_id, 'qty', _qty, 'batch_code', v_batch_code, 'unit_landed_cost_tnd', v_unit_tnd)
  );

  return jsonb_build_object('status', v_new_status, 'batch_code', v_batch_code, 'unit_landed_cost_tnd', v_unit_tnd);
end;
$$;
