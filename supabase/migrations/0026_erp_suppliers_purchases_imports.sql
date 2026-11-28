-- Lot 2: Enterprise ERP — Warehouses, Historical Exchange Rates, China/Local Suppliers,
-- Multi-Currency Purchase Orders, Import Shipments, Import Expenses, Landed Cost Allocations,
-- Stock Batches, and Transactional Receiving / Landed Cost RPCs.

-- =====================================================================
-- 1. Warehouses (single central warehouse by default, multi-warehouse ready)
-- =====================================================================
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_fr text not null,
  name_ar text not null,
  city text not null default 'Tunis',
  address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.warehouses (code, name_fr, name_ar, city, address, is_default, is_active)
values ('CENTRAL', 'Entrepôt Central Tunis', 'المستودع المركزي تونس', 'Tunis', 'Zone Industrielle Charguia II', true, true)
on conflict (code) do nothing;

-- =====================================================================
-- 2. Historical Multi-Currency Exchange Rates (never overwrite past rows)
-- =====================================================================
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency_code text not null check (currency_code in ('TND', 'CNY', 'USD', 'EUR')),
  rate_to_tnd numeric(14,4) not null check (rate_to_tnd > 0),
  effective_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_exchange_rates_curr_date on public.exchange_rates(currency_code, effective_date desc, created_at desc);

insert into public.exchange_rates (currency_code, rate_to_tnd, effective_date, notes)
select v.code, v.rate, current_date, v.note
from (values
  ('TND', 1.0000::numeric, 'Devise de référence'),
  ('CNY', 0.4350::numeric, 'Yuan chinois (Import Chine)'),
  ('USD', 3.1200::numeric, 'Dollar américain'),
  ('EUR', 3.3600::numeric, 'Euro')
) as v(code, rate, note)
where not exists (select 1 from public.exchange_rates er where er.currency_code = v.code);

-- =====================================================================
-- 3. Suppliers (China & Local) + Supplier Payments
-- =====================================================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  country text not null default 'China',
  contact_person text,
  email text,
  phone text,
  address text,
  website text,
  payment_terms text default '30% acompte / 70% avant expédition',
  currency text not null default 'CNY' check (currency in ('TND', 'CNY', 'USD', 'EUR')),
  lead_time_days integer not null default 25 check (lead_time_days >= 0),
  rating numeric(2,1) not null default 4.5 check (rating >= 0 and rating <= 5),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.suppliers (name, company_name, country, contact_person, email, phone, payment_terms, currency, lead_time_days, rating, notes)
select v.name, v.company, v.country, v.contact, v.email, v.phone, v.terms, v.curr, v.lead, v.rating, v.notes
from (values
  ('Shenzhen Aura Acoustics', 'Shenzhen Aura Acoustics Co., Ltd.', 'China', 'Li Wei', 'export@aura-sz.cn', '+86 755 8801 4420', '30% TT / 70% avant B/L', 'CNY', 22, 4.8::numeric, 'Fournisseur principal audio & accessoires électroniques'),
  ('Guangzhou Noura Home', 'Guangzhou Home & Textile Imp/Exp Ltd.', 'China', 'Chen Mei', 'sales@gz-nourahome.cn', '+86 20 8321 9012', 'T/T 30/70', 'USD', 30, 4.6::numeric, 'Petit électroménager, céramique et textile')
) as v(name, company, country, contact, email, phone, terms, curr, lead, rating, notes)
where not exists (select 1 from public.suppliers s where s.name = v.name);

-- =====================================================================
-- 4. Multi-Currency Purchase Orders & Line Items
-- =====================================================================
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED')),
  currency text not null default 'CNY' check (currency in ('TND', 'CNY', 'USD', 'EUR')),
  exchange_rate numeric(14,4) not null check (exchange_rate > 0),
  discount_foreign numeric(14,4) not null default 0,
  subtotal_foreign numeric(14,4) not null default 0,
  total_foreign numeric(14,4) not null default 0,
  total_tnd numeric(12,3) not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  expected_at date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_po_supplier on public.purchase_orders(supplier_id);
create index if not exists idx_po_status on public.purchase_orders(status);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  sku text not null,
  product_name text not null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost_foreign numeric(14,4) not null check (unit_cost_foreign >= 0),
  unit_weight_grams integer not null default 0 check (unit_weight_grams >= 0),
  unit_volume_cm3 numeric(12,2) not null default 0 check (unit_volume_cm3 >= 0),
  landed_unit_cost_tnd numeric(12,3),
  created_at timestamptz not null default now()
);

create index if not exists idx_po_items_po on public.purchase_order_items(purchase_order_id);
create index if not exists idx_po_items_variant on public.purchase_order_items(variant_id);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  amount_foreign numeric(14,4) not null check (amount_foreign > 0),
  currency text not null default 'CNY' check (currency in ('TND', 'CNY', 'USD', 'EUR')),
  exchange_rate numeric(14,4) not null check (exchange_rate > 0),
  amount_tnd numeric(12,3) not null check (amount_tnd > 0),
  payment_method text not null default 'wire_transfer',
  reference text,
  paid_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_supplier_payments_supplier on public.supplier_payments(supplier_id);

-- =====================================================================
-- 5. Import Shipments, Import Expenses & Landed Cost Allocations
-- =====================================================================
create table if not exists public.import_shipments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  shipping_company text,
  origin_country text not null default 'China',
  destination_city text not null default 'Tunis',
  transport_method text not null default 'sea' check (transport_method in ('sea', 'air', 'express', 'land')),
  tracking_number text,
  status text not null default 'PREPARING' check (status in ('PREPARING', 'SHIPPED', 'IN_TRANSIT', 'CUSTOMS_CLEARANCE', 'ARRIVED', 'COMPLETED')),
  shipped_at date,
  estimated_arrival date,
  actual_arrival date,
  allocation_method text not null default 'value' check (allocation_method in ('quantity', 'weight', 'volume', 'value', 'manual')),
  total_expenses_tnd numeric(12,3) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_shipments_po on public.import_shipments(purchase_order_id);

create table if not exists public.import_expenses (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.import_shipments(id) on delete cascade,
  expense_type text not null check (expense_type in ('shipping', 'customs', 'insurance', 'taxes', 'handling', 'other')),
  label text not null,
  amount_foreign numeric(14,4) not null check (amount_foreign >= 0),
  currency text not null default 'TND' check (currency in ('TND', 'CNY', 'USD', 'EUR')),
  exchange_rate numeric(14,4) not null default 1 check (exchange_rate > 0),
  amount_tnd numeric(12,3) not null check (amount_tnd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_import_expenses_shipment on public.import_expenses(shipment_id);

create table if not exists public.landed_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.import_shipments(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  allocation_method text not null,
  quantity integer not null check (quantity > 0),
  base_purchase_tnd numeric(12,3) not null,
  allocated_expenses_tnd numeric(12,3) not null,
  total_landed_tnd numeric(12,3) not null,
  unit_landed_cost_tnd numeric(12,3) not null,
  calculated_at timestamptz not null default now()
);

create index if not exists idx_landed_alloc_shipment on public.landed_cost_allocations(shipment_id);

-- =====================================================================
-- 6. Stock Batches (traceability per import/PO lot)
-- =====================================================================
create table if not exists public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  shipment_id uuid references public.import_shipments(id) on delete set null,
  quantity_initial integer not null check (quantity_initial > 0),
  quantity_remaining integer not null check (quantity_remaining >= 0),
  unit_landed_cost_tnd numeric(12,3) not null check (unit_landed_cost_tnd >= 0),
  received_at timestamptz not null default now()
);

create index if not exists idx_stock_batches_variant on public.stock_batches(variant_id);

-- =====================================================================
-- 7. Transactional RPCs: Apply Landed Cost & Receive PO Into Stock
-- =====================================================================
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

    insert into public.variant_costs (variant_id, cost_price)
    values (v_var_id, v_unit)
    on conflict (variant_id) do update
      set cost_price = excluded.cost_price, updated_at = now();

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

revoke all on function public.apply_shipment_landed_cost(uuid, text, jsonb) from public;
grant execute on function public.apply_shipment_landed_cost(uuid, text, jsonb) to authenticated;

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

  -- Update PO line received quantity
  update public.purchase_order_items
  set quantity_received = quantity_received + _qty
  where id = _po_item_id;

  -- Record traceable stock batch
  insert into public.stock_batches (
    batch_code, variant_id, product_id, warehouse_id,
    purchase_order_id, shipment_id, quantity_initial, quantity_remaining, unit_landed_cost_tnd
  )
  values (
    v_batch_code, v_item.variant_id, v_item.product_id, v_wh_id,
    v_po.id, _shipment_id, _qty, _qty, v_unit_tnd
  );

  -- Increment physical/available inventory atomically
  insert into public.inventory (variant_id, available, reserved, low_stock_threshold)
  values (v_item.variant_id, _qty, 0, 5)
  on conflict (variant_id) do update
    set available = public.inventory.available + _qty,
        updated_at = now();

  -- Record stock movement for full traceability
  insert into public.stock_movements (
    variant_id, movement_type, quantity_delta, bucket, reason, created_by
  )
  values (
    v_item.variant_id, 'incoming_received', _qty, 'available',
    'Réception ' || v_po.po_number || ' (lot ' || v_batch_code || ' · ' || v_unit_tnd || ' DT)',
    auth.uid()
  );

  -- Update landed cost snapshot on product & variant
  update public.products set landed_cost = v_unit_tnd, updated_at = now() where id = v_item.product_id;
  insert into public.variant_costs (variant_id, cost_price)
  values (v_item.variant_id, v_unit_tnd)
  on conflict (variant_id) do update
    set cost_price = excluded.cost_price, updated_at = now();

  -- Transition PO status cleanly
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

revoke all on function public.receive_purchase_order_item(uuid, integer, uuid) from public;
grant execute on function public.receive_purchase_order_item(uuid, integer, uuid) to authenticated;

-- =====================================================================
-- 8. RLS + Explicit Table GRANTs (zero 403s!)
-- =====================================================================
alter table public.warehouses enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.import_shipments enable row level security;
alter table public.import_expenses enable row level security;
alter table public.landed_cost_allocations enable row level security;
alter table public.stock_batches enable row level security;

grant select, insert, update, delete on table public.warehouses to authenticated;
grant select, insert, update, delete on table public.exchange_rates to authenticated;
grant select, insert, update, delete on table public.suppliers to authenticated;
grant select, insert, update, delete on table public.supplier_payments to authenticated;
grant select, insert, update, delete on table public.purchase_orders to authenticated;
grant select, insert, update, delete on table public.purchase_order_items to authenticated;
grant select, insert, update, delete on table public.import_shipments to authenticated;
grant select, insert, update, delete on table public.import_expenses to authenticated;
grant select, insert, update, delete on table public.landed_cost_allocations to authenticated;
grant select, insert, update, delete on table public.stock_batches to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='warehouses' and policyname='warehouses_staff_all') then
    create policy "warehouses_staff_all" on public.warehouses for all to authenticated using (public.is_staff()) with check (public.has_permission('inventory.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exchange_rates' and policyname='exchange_rates_staff_all') then
    create policy "exchange_rates_staff_all" on public.exchange_rates for all to authenticated using (public.is_staff()) with check (public.has_permission('imports.manage') or public.has_permission('purchases.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='suppliers' and policyname='suppliers_staff_all') then
    create policy "suppliers_staff_all" on public.suppliers for all to authenticated using (public.is_staff()) with check (public.has_permission('suppliers.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='supplier_payments' and policyname='supplier_payments_staff_all') then
    create policy "supplier_payments_staff_all" on public.supplier_payments for all to authenticated using (public.has_permission('suppliers.manage') or public.has_permission('finances.view') or public.is_admin()) with check (public.has_permission('suppliers.manage') or public.has_permission('finances.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='purchase_orders_staff_all') then
    create policy "purchase_orders_staff_all" on public.purchase_orders for all to authenticated using (public.is_staff()) with check (public.has_permission('purchases.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='purchase_order_items' and policyname='purchase_order_items_staff_all') then
    create policy "purchase_order_items_staff_all" on public.purchase_order_items for all to authenticated using (public.is_staff()) with check (public.has_permission('purchases.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='import_shipments' and policyname='import_shipments_staff_all') then
    create policy "import_shipments_staff_all" on public.import_shipments for all to authenticated using (public.is_staff()) with check (public.has_permission('imports.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='import_expenses' and policyname='import_expenses_staff_all') then
    create policy "import_expenses_staff_all" on public.import_expenses for all to authenticated using (public.is_staff()) with check (public.has_permission('imports.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='landed_cost_allocations' and policyname='landed_cost_allocations_staff_all') then
    create policy "landed_cost_allocations_staff_all" on public.landed_cost_allocations for all to authenticated using (public.is_staff()) with check (public.has_permission('imports.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stock_batches' and policyname='stock_batches_staff_all') then
    create policy "stock_batches_staff_all" on public.stock_batches for all to authenticated using (public.is_staff()) with check (public.has_permission('inventory.manage') or public.has_permission('purchases.manage') or public.is_admin());
  end if;
end $$;
