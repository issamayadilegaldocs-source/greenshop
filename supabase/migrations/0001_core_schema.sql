-- =========================================================
-- weshop core schema
-- =========================================================

-- ---------- ENUMS ----------
create type public.app_role as enum ('admin','staff');
create type public.attribute_type as enum ('text','number','boolean','dropdown','multi_select','color','date','measurement');
create type public.product_status as enum ('draft','published','archived');
create type public.order_status as enum ('pending','confirmed','preparing','shipped','out_for_delivery','delivered','cancelled','returned');
create type public.payment_status as enum ('unpaid','paid','refunded');
create type public.stock_state as enum ('reserved','consumed','released');
create type public.movement_type as enum ('initial','restock','removal','reservation','reservation_release','shipment','delivery_return','return_restock','return_damaged','damage','damage_writeoff','damage_repaired','incoming','incoming_received');
create type public.return_status as enum ('requested','approved','rejected','received','processed');
create type public.return_condition as enum ('resalable','damaged','unsellable');
create type public.review_status as enum ('published','hidden');
create type public.promotion_type as enum ('percent','fixed');
create type public.finance_entry_type as enum ('revenue','cogs','discount','delivery_income','cash_collected','refund','return_revenue_reversal','return_cogs_reversal','return_loss','damage_loss');

create sequence public.order_ref_seq start 1001;
create sequence public.return_ref_seq start 101;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- PROFILES ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or length(full_name) <= 120),
  phone text check (phone is null or length(phone) <= 20),
  email text,
  preferred_locale text not null default 'fr' check (preferred_locale in ('fr','ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- ---------- ROLES ----------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin','staff'))
$$;

create policy "Users read own roles; admins read all" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "Admins grant roles" on public.user_roles
  for insert to authenticated with check (public.is_admin());
create policy "Admins revoke roles" on public.user_roles
  for delete to authenticated using (public.is_admin() and user_id <> auth.uid());

create policy "Read own profile; staff read all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "Insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "Update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id,
          left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), 120),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- AUDIT LOGS ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_entity on public.audit_logs(entity, entity_id);
create index idx_audit_logs_created on public.audit_logs(created_at desc);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "Admins read audit logs" on public.audit_logs for select to authenticated using (public.is_admin());

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
          case when tg_op = 'DELETE' then jsonb_build_object('old', to_jsonb(old))
               when tg_op = 'UPDATE' then jsonb_build_object('new', to_jsonb(new))
               else jsonb_build_object('new', to_jsonb(new)) end);
  return coalesce(new, old);
end $$;

create trigger trg_audit_user_roles after insert or delete on public.user_roles
  for each row execute function public.audit_row();

-- first admin setup
create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;

create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(7710001);
  if exists (select 1 from public.user_roles where role = 'admin') then
    return false;
  end if;
  insert into public.user_roles(user_id, role) values (auth.uid(), 'admin');
  return true;
end $$;
revoke execute on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;

-- ---------- STORE SETTINGS (singleton) ----------
create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'weshop',
  currency text not null default 'TND',
  delivery_fee numeric(12,3) not null default 7 check (delivery_fee >= 0),
  free_delivery_threshold numeric(12,3) check (free_delivery_threshold is null or free_delivery_threshold >= 0),
  support_phone text,
  support_email text,
  default_low_stock_threshold int not null default 5 check (default_low_stock_threshold >= 0),
  return_window_days int not null default 14 check (return_window_days between 0 and 365),
  delivery_cities text[] not null default array[]::text[],
  announcement_fr text,
  announcement_ar text,
  updated_at timestamptz not null default now()
);
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;
grant all on public.store_settings to service_role;
alter table public.store_settings enable row level security;
create policy "Anyone reads store settings" on public.store_settings for select to anon, authenticated using (true);
create policy "Admins update store settings" on public.store_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger trg_settings_updated before update on public.store_settings for each row execute function public.set_updated_at();
create trigger trg_audit_settings after update on public.store_settings for each row execute function public.audit_row();

insert into public.store_settings (id, delivery_fee, free_delivery_threshold, delivery_cities, announcement_fr, announcement_ar)
values (true, 7, 150,
  array['Tunis','Ariana','Ben Arous','Manouba','Nabeul','Zaghouan','Bizerte','Béja','Jendouba','Le Kef','Siliana','Sousse','Monastir','Mahdia','Sfax','Kairouan','Kasserine','Sidi Bouzid','Gabès','Médenine','Tataouine','Gafsa','Tozeur','Kébili'],
  'Paiement à la livraison partout en Tunisie',
  'الدفع عند الاستلام في كامل تراب الجمهورية');

-- ---------- CATEGORIES ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name_fr text not null check (length(trim(name_fr)) between 1 and 120),
  name_ar text check (name_ar is null or length(name_ar) <= 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description_fr text check (description_fr is null or length(description_fr) <= 2000),
  description_ar text check (description_ar is null or length(description_ar) <= 2000),
  image_url text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_categories_parent on public.categories(parent_id);
grant select on public.categories to anon;
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "Public reads active categories" on public.categories for select to anon, authenticated using (is_active or public.is_staff());
create policy "Admins insert categories" on public.categories for insert to authenticated with check (public.is_admin());
create policy "Admins update categories" on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete categories" on public.categories for delete to authenticated using (public.is_admin());
create trigger trg_categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger trg_audit_categories after insert or update or delete on public.categories for each row execute function public.audit_row();

create or replace function public.prevent_category_cycle()
returns trigger language plpgsql set search_path = public as $$
declare v_parent uuid := new.parent_id; v_depth int := 0;
begin
  while v_parent is not null loop
    if v_parent = new.id then raise exception 'category_cycle'; end if;
    select parent_id into v_parent from public.categories where id = v_parent;
    v_depth := v_depth + 1;
    if v_depth > 20 then raise exception 'category_too_deep'; end if;
  end loop;
  return new;
end $$;
create trigger trg_categories_cycle before insert or update of parent_id on public.categories
  for each row execute function public.prevent_category_cycle();

-- ---------- CATEGORY ATTRIBUTES ----------
create table public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name_fr text not null check (length(trim(name_fr)) between 1 and 80),
  name_ar text check (name_ar is null or length(name_ar) <= 80),
  type public.attribute_type not null default 'text',
  unit text check (unit is null or length(unit) <= 20),
  is_required boolean not null default false,
  is_filterable boolean not null default false,
  is_searchable boolean not null default false,
  is_variant boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, code),
  check (not is_variant or type in ('dropdown','color'))
);
create index idx_cat_attr_category on public.category_attributes(category_id);
grant select on public.category_attributes to anon;
grant select, insert, update, delete on public.category_attributes to authenticated;
grant all on public.category_attributes to service_role;
alter table public.category_attributes enable row level security;
create policy "Public reads attributes" on public.category_attributes for select to anon, authenticated using (true);
create policy "Admins insert attributes" on public.category_attributes for insert to authenticated with check (public.is_admin());
create policy "Admins update attributes" on public.category_attributes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete attributes" on public.category_attributes for delete to authenticated using (public.is_admin());
create trigger trg_audit_cat_attr after insert or update or delete on public.category_attributes for each row execute function public.audit_row();

create table public.category_attribute_options (
  id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references public.category_attributes(id) on delete cascade,
  value text not null check (length(trim(value)) between 1 and 80),
  label_fr text check (label_fr is null or length(label_fr) <= 80),
  label_ar text check (label_ar is null or length(label_ar) <= 80),
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$'),
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (attribute_id, value)
);
create index idx_attr_opts_attr on public.category_attribute_options(attribute_id);
grant select on public.category_attribute_options to anon;
grant select, insert, update, delete on public.category_attribute_options to authenticated;
grant all on public.category_attribute_options to service_role;
alter table public.category_attribute_options enable row level security;
create policy "Public reads options" on public.category_attribute_options for select to anon, authenticated using (true);
create policy "Admins insert options" on public.category_attribute_options for insert to authenticated with check (public.is_admin());
create policy "Admins update options" on public.category_attribute_options for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete options" on public.category_attribute_options for delete to authenticated using (public.is_admin());

-- attributes inherited from ancestor categories (root first)
create or replace function public.get_category_attributes(_category_id uuid)
returns table (
  id uuid, category_id uuid, code text, name_fr text, name_ar text, type public.attribute_type,
  unit text, is_required boolean, is_filterable boolean, is_searchable boolean, is_variant boolean,
  display_order int, depth int, inherited boolean
) language sql stable set search_path = public as $$
  with recursive chain as (
    select c.id, c.parent_id, 0 as depth from public.categories c where c.id = _category_id
    union all
    select p.id, p.parent_id, chain.depth + 1 from public.categories p join chain on p.id = chain.parent_id
    where chain.depth < 20
  )
  select a.id, a.category_id, a.code, a.name_fr, a.name_ar, a.type, a.unit, a.is_required,
         a.is_filterable, a.is_searchable, a.is_variant, a.display_order, chain.depth, chain.depth > 0
  from chain join public.category_attributes a on a.category_id = chain.id
  order by chain.depth desc, a.display_order, a.name_fr
$$;

-- ---------- PRODUCTS ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name_fr text not null check (length(trim(name_fr)) between 1 and 200),
  name_ar text check (name_ar is null or length(name_ar) <= 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sku text not null unique check (length(trim(sku)) between 1 and 64),
  description_fr text check (description_fr is null or length(description_fr) <= 10000),
  description_ar text check (description_ar is null or length(description_ar) <= 10000),
  brand text check (brand is null or length(brand) <= 80),
  model text check (model is null or length(model) <= 80),
  price numeric(12,3) not null check (price >= 0),
  promo_price numeric(12,3) check (promo_price is null or (promo_price >= 0 and promo_price < price)),
  warranty text check (warranty is null or length(warranty) <= 200),
  status public.product_status not null default 'draft',
  has_variants boolean not null default false,
  is_featured boolean not null default false,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category on public.products(category_id);
create index idx_products_status on public.products(status);
create index idx_products_created on public.products(created_at desc);
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "Public reads published products" on public.products for select to anon, authenticated using (status = 'published' or public.is_staff());
create policy "Admins insert products" on public.products for insert to authenticated with check (public.is_admin());
create policy "Admins update products" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete products" on public.products for delete to authenticated using (public.is_admin());
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();
create trigger trg_audit_products after insert or update or delete on public.products for each row execute function public.audit_row();

create or replace function public.set_published_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end $$;
create trigger trg_products_published before insert or update of status on public.products for each row execute function public.set_published_at();

-- admin-only product cost info
create table public.product_private (
  product_id uuid primary key references public.products(id) on delete cascade,
  purchase_price numeric(12,3) not null default 0 check (purchase_price >= 0),
  internal_notes text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.product_private to authenticated;
grant all on public.product_private to service_role;
alter table public.product_private enable row level security;
create policy "Admins manage product costs" on public.product_private for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  attribute_id uuid not null references public.category_attributes(id) on delete cascade,
  option_id uuid references public.category_attribute_options(id) on delete cascade,
  value_text text check (value_text is null or length(value_text) <= 1000),
  value_number numeric,
  value_boolean boolean,
  value_date date
);
create unique index uq_product_attr_value on public.product_attribute_values(product_id, attribute_id, coalesce(option_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index idx_pav_attr_option on public.product_attribute_values(attribute_id, option_id);
grant select on public.product_attribute_values to anon;
grant select, insert, update, delete on public.product_attribute_values to authenticated;
grant all on public.product_attribute_values to service_role;
alter table public.product_attribute_values enable row level security;
create policy "Public reads values of published products" on public.product_attribute_values for select to anon, authenticated
  using (public.is_staff() or exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy "Admins manage attribute values" on public.product_attribute_values for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text,
  url text not null,
  alt text check (alt is null or length(alt) <= 200),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_product_images_product on public.product_images(product_id, position);
grant select on public.product_images to anon;
grant select, insert, update, delete on public.product_images to authenticated;
grant all on public.product_images to service_role;
alter table public.product_images enable row level security;
create policy "Public reads images of published products" on public.product_images for select to anon, authenticated
  using (public.is_staff() or exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy "Admins manage images" on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- VARIANTS ----------
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique check (length(trim(sku)) between 1 and 64),
  combination_key text not null default ('v:' || gen_random_uuid()::text),
  price numeric(12,3) not null check (price >= 0),
  promo_price numeric(12,3) check (promo_price is null or (promo_price >= 0 and promo_price < price)),
  barcode text check (barcode is null or length(barcode) <= 64),
  is_active boolean not null default true,
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_variant_combination unique (product_id, combination_key) deferrable initially deferred
);
create index idx_variants_product on public.product_variants(product_id);
grant select on public.product_variants to anon;
grant select, insert, update, delete on public.product_variants to authenticated;
grant all on public.product_variants to service_role;
alter table public.product_variants enable row level security;
create policy "Public reads variants of published products" on public.product_variants for select to anon, authenticated
  using (public.is_staff() or exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy "Admins insert variants" on public.product_variants for insert to authenticated with check (public.is_admin());
create policy "Admins update variants" on public.product_variants for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete variants" on public.product_variants for delete to authenticated using (public.is_admin());
create trigger trg_variants_updated before update on public.product_variants for each row execute function public.set_updated_at();
create trigger trg_audit_variants after insert or update or delete on public.product_variants for each row execute function public.audit_row();

create table public.variant_costs (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  cost numeric(12,3) not null default 0 check (cost >= 0),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.variant_costs to authenticated;
grant all on public.variant_costs to service_role;
alter table public.variant_costs enable row level security;
create policy "Admins manage variant costs" on public.variant_costs for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.variant_attribute_values (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  attribute_id uuid not null references public.category_attributes(id) on delete cascade,
  option_id uuid not null references public.category_attribute_options(id) on delete cascade,
  primary key (variant_id, attribute_id)
);
create index idx_vav_option on public.variant_attribute_values(option_id);
grant select on public.variant_attribute_values to anon;
grant select, insert, update, delete on public.variant_attribute_values to authenticated;
grant all on public.variant_attribute_values to service_role;
alter table public.variant_attribute_values enable row level security;
create policy "Public reads variant values" on public.variant_attribute_values for select to anon, authenticated
  using (public.is_staff() or exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id where v.id = variant_id and p.status = 'published'));
create policy "Admins manage variant values" on public.variant_attribute_values for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.refresh_variant_combination()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.variant_id, old.variant_id);
begin
  update public.product_variants
     set combination_key = coalesce(
       (select string_agg(attribute_id::text || ':' || option_id::text, '|' order by attribute_id)
          from public.variant_attribute_values where variant_id = v_id),
       'v:' || v_id::text)
   where id = v_id;
  return null;
end $$;
create trigger trg_vav_combination after insert or update or delete on public.variant_attribute_values
  for each row execute function public.refresh_variant_combination();

-- ---------- INVENTORY ----------
create table public.inventory (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  available int not null default 0 check (available >= 0),
  reserved int not null default 0 check (reserved >= 0),
  damaged int not null default 0 check (damaged >= 0),
  incoming int not null default 0 check (incoming >= 0),
  low_stock_threshold int not null default 5 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);
grant select on public.inventory to authenticated;
grant all on public.inventory to service_role;
alter table public.inventory enable row level security;
create policy "Staff read inventory" on public.inventory for select to authenticated using (public.is_staff());

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references public.product_variants(id) on delete set null,
  sku text,
  from_bucket text check (from_bucket in ('available','reserved','damaged','incoming')),
  to_bucket text check (to_bucket in ('available','reserved','damaged','incoming')),
  quantity int not null check (quantity > 0),
  movement_type public.movement_type not null,
  reason text check (reason is null or length(reason) <= 500),
  order_id uuid,
  return_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (from_bucket is not null or to_bucket is not null)
);
create index idx_movements_variant on public.inventory_movements(variant_id, created_at desc);
create index idx_movements_created on public.inventory_movements(created_at desc);
grant select on public.inventory_movements to authenticated;
grant all on public.inventory_movements to service_role;
alter table public.inventory_movements enable row level security;
create policy "Staff read movements" on public.inventory_movements for select to authenticated using (public.is_staff());

create or replace function public.handle_new_variant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory(variant_id, low_stock_threshold)
  values (new.id, coalesce((select default_low_stock_threshold from public.store_settings where id), 5))
  on conflict do nothing;
  insert into public.variant_costs(variant_id, cost)
  values (new.id, coalesce((select purchase_price from public.product_private where product_id = new.product_id), 0))
  on conflict do nothing;
  return new;
end $$;
create trigger trg_variant_created after insert on public.product_variants for each row execute function public.handle_new_variant();

-- ---------- ADDRESSES ----------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  label text check (label is null or length(label) <= 60),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  phone text not null check (length(phone) between 8 and 20),
  city text not null check (length(trim(city)) between 2 and 80),
  address_line text not null check (length(trim(address_line)) between 5 and 500),
  instructions text check (instructions is null or length(instructions) <= 500),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_addresses_user on public.addresses(user_id);
grant select, insert, update, delete on public.addresses to authenticated;
grant all on public.addresses to service_role;
alter table public.addresses enable row level security;
create policy "Users manage own addresses" on public.addresses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Staff read addresses" on public.addresses for select to authenticated using (public.is_staff());

-- ---------- PROMOTIONS ----------
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text check (description is null or length(description) <= 300),
  type public.promotion_type not null default 'percent',
  value numeric(12,3) not null check (value > 0),
  min_order_amount numeric(12,3) not null default 0 check (min_order_amount >= 0),
  max_uses int check (max_uses is null or max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (type <> 'percent' or value <= 100)
);
grant select, insert, update, delete on public.promotions to authenticated;
grant all on public.promotions to service_role;
alter table public.promotions enable row level security;
create policy "Admins manage promotions" on public.promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger trg_audit_promotions after insert or update or delete on public.promotions for each row execute function public.audit_row();

-- ---------- ORDERS ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid,
  customer_name text not null,
  phone text not null,
  email text,
  city text not null,
  address text not null,
  instructions text,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  payment_method text not null default 'cod' check (payment_method = 'cod'),
  subtotal numeric(12,3) not null default 0,
  discount_total numeric(12,3) not null default 0,
  delivery_fee numeric(12,3) not null default 0,
  total numeric(12,3) not null default 0,
  promotion_id uuid references public.promotions(id) on delete set null,
  promo_code text,
  stock_state public.stock_state not null default 'reserved',
  confirmed_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_user on public.orders(user_id, created_at desc);
create index idx_orders_status on public.orders(status);
create index idx_orders_created on public.orders(created_at desc);
create index idx_orders_phone on public.orders(phone);
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "Customers read own orders; staff read all" on public.orders for select to authenticated using (user_id = auth.uid() or public.is_staff());
create trigger trg_orders_updated before update on public.orders for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_name text not null,
  variant_label text,
  sku text not null,
  image_url text,
  unit_price numeric(12,3) not null check (unit_price >= 0),
  unit_cost numeric(12,3) not null default 0 check (unit_cost >= 0),
  quantity int not null check (quantity > 0),
  line_total numeric(12,3) not null
);
create index idx_order_items_order on public.order_items(order_id);
create index idx_order_items_variant on public.order_items(variant_id);
create index idx_order_items_product on public.order_items(product_id);
grant select on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy "Read items of own orders; staff all" on public.order_items for select to authenticated
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index idx_osh_order on public.order_status_history(order_id, created_at);
grant select on public.order_status_history to authenticated;
grant all on public.order_status_history to service_role;
alter table public.order_status_history enable row level security;
create policy "Read history of own orders; staff all" on public.order_status_history for select to authenticated
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  note text not null check (length(trim(note)) between 1 and 2000),
  author_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_order_notes_order on public.order_notes(order_id);
grant select, insert on public.order_notes to authenticated;
grant all on public.order_notes to service_role;
alter table public.order_notes enable row level security;
create policy "Staff read order notes" on public.order_notes for select to authenticated using (public.is_staff());
create policy "Staff add order notes" on public.order_notes for insert to authenticated with check (public.is_staff() and author_id = auth.uid());

create table public.cash_collections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  amount_expected numeric(12,3) not null,
  amount_collected numeric(12,3) not null check (amount_collected >= 0),
  collected_at timestamptz not null,
  collected_by_name text not null,
  recorded_by uuid,
  note text,
  created_at timestamptz not null default now()
);
grant select on public.cash_collections to authenticated;
grant all on public.cash_collections to service_role;
alter table public.cash_collections enable row level security;
create policy "Staff read cash collections" on public.cash_collections for select to authenticated using (public.is_staff());

-- ---------- RETURNS ----------
create table public.returns (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null,
  status public.return_status not null default 'requested',
  reason text not null check (length(trim(reason)) between 2 and 200),
  description text check (description is null or length(description) <= 2000),
  photos text[] not null default array[]::text[],
  admin_note text,
  refund_amount numeric(12,3) not null default 0,
  processed_at timestamptz,
  processed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_returns_order on public.returns(order_id);
create index idx_returns_user on public.returns(user_id);
grant select on public.returns to authenticated;
grant all on public.returns to service_role;
alter table public.returns enable row level security;
create policy "Customers read own returns; staff all" on public.returns for select to authenticated using (user_id = auth.uid() or public.is_staff());
create trigger trg_returns_updated before update on public.returns for each row execute function public.set_updated_at();

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  variant_id uuid not null,
  quantity int not null check (quantity > 0),
  condition public.return_condition,
  processed_at timestamptz,
  loss_amount numeric(12,3) not null default 0
);
create index idx_return_items_return on public.return_items(return_id);
create index idx_return_items_order_item on public.return_items(order_item_id);
grant select on public.return_items to authenticated;
grant all on public.return_items to service_role;
alter table public.return_items enable row level security;
create policy "Read items of own returns; staff all" on public.return_items for select to authenticated
  using (public.is_staff() or exists (select 1 from public.returns r where r.id = return_id and r.user_id = auth.uid()));

create table public.return_status_history (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete cascade,
  from_status public.return_status,
  to_status public.return_status not null,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index idx_rsh_return on public.return_status_history(return_id, created_at);
grant select on public.return_status_history to authenticated;
grant all on public.return_status_history to service_role;
alter table public.return_status_history enable row level security;
create policy "Read history of own returns; staff all" on public.return_status_history for select to authenticated
  using (public.is_staff() or exists (select 1 from public.returns r where r.id = return_id and r.user_id = auth.uid()));

-- ---------- REVIEWS ----------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  author_name text check (author_name is null or length(author_name) <= 80),
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 2000),
  is_verified boolean not null default false,
  status public.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index idx_reviews_product on public.reviews(product_id, status);
grant select on public.reviews to anon;
grant select, insert, update, delete on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;

create or replace function public.has_purchased(_product_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.product_id = _product_id and o.user_id = auth.uid() and o.status in ('delivered','returned')
  )
$$;

create policy "Public reads published reviews" on public.reviews for select to anon, authenticated
  using (status = 'published' or user_id = auth.uid() or public.is_staff());
create policy "Purchasers write reviews" on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and public.has_purchased(product_id));
create policy "Authors edit own reviews; staff moderate" on public.reviews for update to authenticated
  using (user_id = auth.uid() or public.is_staff()) with check (user_id = auth.uid() or public.is_staff());
create policy "Authors or admins delete reviews" on public.reviews for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.guard_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.is_verified := public.has_purchased(new.product_id);
    new.status := 'published';
    if new.author_name is null then
      select left(split_part(coalesce(full_name, ''), ' ', 1), 80) into new.author_name from public.profiles where id = new.user_id;
    end if;
  elsif not public.is_staff() then
    new.status := old.status;
    new.is_verified := old.is_verified;
    new.user_id := old.user_id;
    new.product_id := old.product_id;
  end if;
  return new;
end $$;
create trigger trg_reviews_guard before insert or update on public.reviews for each row execute function public.guard_review();
create trigger trg_reviews_updated before update on public.reviews for each row execute function public.set_updated_at();

create or replace function public.refresh_product_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where product_id = v_pid and status = 'published'), 0),
    rating_count = (select count(*) from public.reviews where product_id = v_pid and status = 'published')
  where p.id = v_pid;
  return null;
end $$;
create trigger trg_reviews_rating after insert or update or delete on public.reviews for each row execute function public.refresh_product_rating();

-- ---------- NOTIFICATIONS ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on public.notifications(user_id, created_at desc);
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "Users read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "Users mark own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------- FINANCE LEDGER ----------
create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type public.finance_entry_type not null,
  amount numeric(12,3) not null check (amount >= 0),
  order_id uuid references public.orders(id) on delete set null,
  return_id uuid references public.returns(id) on delete set null,
  variant_id uuid,
  dedupe_key text not null unique,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index idx_finance_type_date on public.finance_entries(entry_type, created_at);
grant select on public.finance_entries to authenticated;
grant all on public.finance_entries to service_role;
alter table public.finance_entries enable row level security;
create policy "Admins read finance" on public.finance_entries for select to authenticated using (public.is_admin());

-- ---------- REALTIME ----------
-- New Supabase projects ship with the supabase_realtime publication, but guard it
-- so the migration is safe on projects where it was dropped.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_status_history'
    ) then
      alter publication supabase_realtime add table public.order_status_history;
    end if;
  end if;
end $$;
