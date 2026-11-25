-- =========================================================
-- Maison Noura database bootstrap (clean reset + full schema)
-- =========================================================
-- GENERATED FILE — do not edit by hand. Source of truth: supabase/migrations/.
-- Regenerate with: npm run db:bundle
--
-- Apply to a Supabase project (empties old public objects, storage policies,
-- auth triggers, and auth users before recreating the full schema & seed data):
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run
-- or with the CLI (on an empty project): npm run db:push
--
-- Note: To also delete old files/buckets from Storage, empty/delete them in
-- Supabase Dashboard -> Storage (Supabase blocks raw SQL DELETE on storage.*).
--
-- Files included (in order):
--   0001_core_schema.sql
--   0002_transactional_functions.sql
--   0003_description_templates.sql
--   0004_storage_policies.sql
--   0005_catalog_rpcs.sql
--   0006_seed_demo_catalog.sql
--   0007_marketplace_enums.sql
--   0008_marketplace_schema.sql
--   0009_seller_functions.sql
--   0010_marketplace_orders.sql
--   0011_search_and_policies.sql
--   0012_test_users_and_orders.sql
--   0013_marketplace_admin.sql
--   0014_tokens_and_product_boosts.sql
--   0015_marketplace_demo_data.sql
--   0016_more_categories.sql
--   0017_clothing_storefront.sql
--   0018_maison_noura_catalog.sql
--   0019_fix_description_newlines.sql
--   0020_expand_catalog_categories.sql
--   0021_fix_returns_rls_recursion.sql
--   0022_ai_provider_settings.sql
-- =========================================================

-- ===== 0000_clean_old_supabase =====
-- Clean all user-created objects from an existing Supabase project while
-- keeping Supabase-managed schemas, extensions, and default public grants.
begin;

do $$
declare
  r record;
begin
  -- 1. Drop custom (non-internal) triggers on auth.users and storage tables
  for r in
    select n.nspname as table_schema, c.relname as table_name, t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace fn on fn.oid = p.pronamespace
    where not t.tgisinternal
      and (
        (n.nspname = 'auth' and c.relname = 'users')
        or (n.nspname = 'storage' and c.relname in ('objects', 'buckets'))
      )
      and fn.nspname not in (
        'auth', 'storage', 'realtime', 'supabase_functions',
        'pg_catalog', 'information_schema', 'extensions'
      )
  loop
    execute format('drop trigger if exists %I on %I.%I cascade', r.trigger_name, r.table_schema, r.table_name);
  end loop;

  -- 2. Drop all RLS policies on storage.objects and storage.buckets
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename in ('objects', 'buckets')
  loop
    execute format('drop policy if exists %I on storage.%I', r.policyname, r.tablename);
  end loop;

  -- 3. Drop all non-extension views and materialized views in public
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'drop %s if exists public.%I cascade',
      case when r.relkind = 'm' then 'materialized view' else 'view' end,
      r.relname
    );
  end loop;

  -- 4. Drop all non-extension tables (regular, partitioned, foreign) in public
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'f')
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'drop %s if exists public.%I cascade',
      case when r.relkind = 'f' then 'foreign table' else 'table' end,
      r.relname
    );
  end loop;

  -- 5. Drop any remaining non-extension sequences in public
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format('drop sequence if exists public.%I cascade', r.relname);
  end loop;

  -- 6. Drop all non-extension functions, procedures, and aggregates in public
  for r in
    select
      p.proname,
      p.prokind,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'drop %s if exists public.%I(%s) cascade',
      case r.prokind
        when 'p' then 'procedure'
        when 'a' then 'aggregate'
        else 'function'
      end,
      r.proname,
      r.args
    );
  end loop;

  -- 7. Drop all non-extension custom types and domains in public
  for r in
    select t.typname, t.typtype
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'c', 'd', 'r', 'm')
      and (t.typtype <> 'c' or t.typrelid = 0)
      and not exists (
        select 1 from pg_depend d
        where d.objid = t.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'drop %s if exists public.%I cascade',
      case when r.typtype = 'd' then 'domain' else 'type' end,
      r.typname
    );
  end loop;

  -- 8. Remove existing auth users from the old project (cascades identities/sessions)
  delete from auth.users;

  -- 9. Clear old Supabase CLI migration history if present
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      truncate table supabase_migrations.schema_migrations;
    exception when insufficient_privilege then
      null;
    end;
  end if;
end $$;

commit;

begin;

-- ===== 0001_core_schema.sql =====
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

-- ===== 0002_transactional_functions.sql =====
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

-- ===== 0003_description_templates.sql =====
CREATE TABLE public.description_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 200),
  instructions text NOT NULL CHECK (char_length(btrim(instructions)) BETWEEN 10 AND 3000),
  target_length text NOT NULL DEFAULT 'medium' CHECK (target_length IN ('short','medium','long')),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.description_templates TO authenticated;
GRANT ALL ON public.description_templates TO service_role;

ALTER TABLE public.description_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read description templates" ON public.description_templates
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins insert description templates" ON public.description_templates
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update description templates" ON public.description_templates
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete description templates" ON public.description_templates
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER description_templates_updated_at BEFORE UPDATE ON public.description_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER description_templates_audit AFTER INSERT OR UPDATE OR DELETE ON public.description_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();


-- Seed rows for description_templates live in 0006_seed_demo_catalog.sql.

-- ===== 0004_storage_policies.sql =====
-- =========================================================
-- Storage: private buckets + object policies
-- =========================================================
-- Both buckets are private. The app uploads files and stores long-lived signed
-- URLs on catalog rows (see src/lib/storage.ts), so anonymous shoppers can still
-- render images without a public bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog', 'catalog', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('return-photos', 'return-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

-- Catalog images: anyone can read (signed links), only admins write
create policy "Catalog images readable" on storage.objects for select to anon, authenticated
  using (bucket_id = 'catalog');
create policy "Admins upload catalog images" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and public.is_admin());
create policy "Admins update catalog images" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and public.is_admin());
create policy "Admins delete catalog images" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and public.is_admin());

-- Return photos: customers write into their own folder; owner + staff read
create policy "Customers upload own return photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'return-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owner or staff read return photos" on storage.objects for select to authenticated
  using (bucket_id = 'return-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
create policy "Owner deletes own return photos" on storage.objects for delete to authenticated
  using (bucket_id = 'return-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 0005_catalog_rpcs.sql =====
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

-- ===== 0006_seed_demo_catalog.sql =====
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO public.profiles (id, full_name, email)
SELECT u.id, left(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), 120), u.email FROM auth.users u
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.store_settings (id, delivery_fee, free_delivery_threshold, delivery_cities, announcement_fr, announcement_ar)
VALUES (true, 7, 150, ARRAY['Tunis','Ariana','Ben Arous','Manouba','Nabeul','Zaghouan','Bizerte','Béja','Jendouba','Le Kef','Siliana','Sousse','Monastir','Mahdia','Sfax','Kairouan','Kasserine','Sidi Bouzid','Gabès','Médenine','Tataouine','Gafsa','Tozeur','Kébili']::text[],
  'Livraison offerte dès 150 DT — paiement à la livraison', 'توصيل مجاني ابتداءً من 150 د.ت — الدفع عند الاستلام')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.description_templates (id, name, summary, instructions, target_length, display_order) VALUES
(md5('tpl-fiche')::uuid, 'Fiche complète', 'Accroche, paragraphe de présentation, points forts et conseils d''utilisation.', 'Commence par une phrase d''accroche qui donne envie. Enchaîne avec un paragraphe qui présente le produit et son usage. Ajoute une liste de 4 à 6 points forts concrets tirés des caractéristiques. Termine par une courte phrase rassurante (livraison partout en Tunisie, paiement à la livraison). Ton chaleureux et professionnel.', 'long', 1),
(md5('tpl-courte')::uuid, 'Courte & percutante', 'Deux ou trois phrases efficaces, idéales pour mobile.', 'Rédige 2 à 3 phrases maximum, directes et dynamiques. Mets en avant le bénéfice principal et une ou deux caractéristiques clés. Pas de liste à puces.', 'short', 2),
(md5('tpl-seo')::uuid, 'Optimisée SEO', 'Texte structuré qui reprend naturellement les mots-clés du produit.', 'Reprends naturellement le nom du produit, la marque, la catégorie et les caractéristiques importantes comme mots-clés, sans bourrage. Utilise un paragraphe d''introduction, puis une liste de points forts, puis un court paragraphe de conclusion. Phrases claires et lisibles.', 'medium', 3),
(md5('tpl-tech')::uuid, 'Technique à puces', 'Une phrase d''introduction puis les caractéristiques en liste.', 'Écris une seule phrase d''introduction, puis présente les caractéristiques techniques sous forme de liste à puces claire (nom de la caractéristique : valeur avec unité). Ton neutre et précis, sans superlatifs.', 'medium', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (id, parent_id, name_fr, name_ar, slug, description_fr, description_ar, image_url, display_order, is_active) VALUES
(md5('cat-mode')::uuid, NULL, 'Mode & Vêtements', 'موضة وأزياء', 'mode', 'Vêtements du quotidien, confortables et faciles à porter.', 'ملابس يومية مريحة وسهلة الارتداء.', '/demo/robe-ete-fleurie.jpg', 1, true),
(md5('cat-electronique')::uuid, NULL, 'Électronique & High-Tech', 'إلكترونيات وتكنولوجيا', 'electronique', 'Audio, montres et accessoires pour votre téléphone.', 'سماعات، ساعات وإكسسوارات لهاتفك.', '/demo/ecouteurs-sans-fil.jpg', 2, true),
(md5('cat-maison-cuisine')::uuid, NULL, 'Maison & Cuisine', 'المنزل والمطبخ', 'maison-cuisine', 'Artisanat tunisien et rangement malin pour la maison.', 'حرف تونسية وحلول تخزين ذكية للمنزل.', '/demo/theiere-ceramique.jpg', 3, true),
(md5('cat-beaute')::uuid, NULL, 'Beauté & Bien-être', 'الجمال والعناية', 'beaute', 'Soins naturels inspirés des traditions méditerranéennes.', 'منتجات عناية طبيعية مستوحاة من التقاليد المتوسطية.', '/demo/huile-argan.jpg', 4, true),
(md5('cat-artisanat-terroir')::uuid, NULL, 'Artisanat & Terroir', 'صناعات تقليدية ومنتجات محلية', 'artisanat-terroir', 'Le savoir-faire authentique des artisans tunisiens : poterie, tissage et terroir.', 'أصالة الصناعة التقليدية التونسية: فخار نابل، مرقوم القيروان ومنتجات التراث.', '/demo/theiere-ceramique.jpg', 5, true),
(md5('cat-sport')::uuid, NULL, 'Sport & Fitness', 'رياضة ولياقة بدنية', 'sport-fitness', 'Matériel d''entraînement, tenues sportives et accessoires outdoor.', 'معدات التمارين الرياضية، ملابس رياضية مريحة ومستلزمات اللياقة.', '/demo/montre-connectee.jpg', 6, true),
(md5('cat-bebe-enfants')::uuid, NULL, 'Bébés & Enfants', 'أطفال ورضع', 'bebes-enfants', 'Vêtements doux pour bébés, puériculture et jeux d''éveil.', 'ملابس قطنية ناعمة للمواليد، ألعاب ذكاء وتنمية المهارات ومستلزمات الأطفال.', '/demo/robe-ete-fleurie.jpg', 7, true),
(md5('cat-livres-culture')::uuid, NULL, 'Livres & Papeterie', 'كتب وقرطاسية', 'livres-papeterie', 'Romans passionnants, livres, carnets et stylos de calligraphie.', 'روايات أدبية، كتب تطوير الذات، دفاتر ملاحظات فاخرة وأدوات خط عربي.', '/demo/theiere-ceramique.jpg', 8, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (id, parent_id, name_fr, name_ar, slug, image_url, display_order, is_active) VALUES
(md5('cat-t-shirts-sweats')::uuid, md5('cat-mode')::uuid, 'T-shirts & Sweats', 'تي شيرت وسويت شيرت', 't-shirts-sweats', '/demo/tshirt-coton-bio.jpg', 1, true),
(md5('cat-chemises')::uuid, md5('cat-mode')::uuid, 'Chemises & Hauts', 'قمصان وبلوزات', 'chemises', '/demo/chemise-lin.jpg', 2, true),
(md5('cat-robes')::uuid, md5('cat-mode')::uuid, 'Robes & Jupes', 'فساتين وتنانير', 'robes', '/demo/robe-ete-fleurie.jpg', 3, true),
(md5('cat-pantalons')::uuid, md5('cat-mode')::uuid, 'Pantalons & Jeans', 'سراويل وجينز', 'pantalons-jeans', '/demo/sweat-capuche.jpg', 4, true),
(md5('cat-chaussures')::uuid, md5('cat-mode')::uuid, 'Chaussures & Baskets', 'أحذية وأحذية رياضية', 'chaussures', '/demo/tshirt-coton-bio.jpg', 5, true),
(md5('cat-maroquinerie')::uuid, md5('cat-mode')::uuid, 'Sacs & Maroquinerie', 'حقائب ومصنوعات جلدية', 'sacs-maroquinerie', '/demo/robe-ete-fleurie.jpg', 6, true),

(md5('cat-audio')::uuid, md5('cat-electronique')::uuid, 'Audio & Écouteurs', 'صوتيات وسماعات', 'audio', '/demo/enceinte-bluetooth.jpg', 1, true),
(md5('cat-montres-accessoires')::uuid, md5('cat-electronique')::uuid, 'Montres Connectées', 'ساعات ذكية', 'montres-accessoires', '/demo/montre-connectee.jpg', 2, true),
(md5('cat-telephones-tablettes')::uuid, md5('cat-electronique')::uuid, 'Smartphones & Tablettes', 'هواتف وأجهزة لوحية', 'smartphones-tablettes', '/demo/chargeur-rapide.jpg', 3, true),
(md5('cat-accessoires-charge')::uuid, md5('cat-electronique')::uuid, 'Chargeurs & Câbles', 'شواحن وكابلات', 'chargeurs-cables', '/demo/chargeur-rapide.jpg', 4, true),
(md5('cat-gaming')::uuid, md5('cat-electronique')::uuid, 'Gaming & Jeux vidéo', 'ألعاب الفيديو وملحقاتها', 'gaming', '/demo/enceinte-bluetooth.jpg', 5, true),

(md5('cat-cuisine')::uuid, md5('cat-maison-cuisine')::uuid, 'Cuisine & Arts de la table', 'أدوات المطبخ ومائدة الطعام', 'cuisine', '/demo/theiere-ceramique.jpg', 1, true),
(md5('cat-rangement')::uuid, md5('cat-maison-cuisine')::uuid, 'Rangement & Organisation', 'تنظيم وترتيب المنزل', 'rangement', '/demo/bocaux-verre.jpg', 2, true),
(md5('cat-decoration')::uuid, md5('cat-maison-cuisine')::uuid, 'Décoration d''intérieur', 'ديكور المنزل والتحف', 'decoration-interieur', '/demo/theiere-ceramique.jpg', 3, true),
(md5('cat-linge-maison')::uuid, md5('cat-maison-cuisine')::uuid, 'Linge de lit & Bain', 'مفروشات ومناشف', 'linge-maison', '/demo/chemise-lin.jpg', 4, true),

(md5('cat-soins-visage')::uuid, md5('cat-beaute')::uuid, 'Soins du Visage', 'العناية بالوجه', 'soins-visage', '/demo/huile-argan.jpg', 1, true),
(md5('cat-soins')::uuid, md5('cat-beaute')::uuid, 'Soins du Corps & Bain', 'العناية بالجسم والاستحمام', 'soins-corps', '/demo/savon-naturel.jpg', 2, true),
(md5('cat-cheveux')::uuid, md5('cat-beaute')::uuid, 'Soins Capillaires', 'العناية بالشعر', 'soins-capillaires', '/demo/huile-argan.jpg', 3, true),
(md5('cat-parfums')::uuid, md5('cat-beaute')::uuid, 'Parfums & Brumes', 'عطور ومعطرات', 'parfums', '/demo/savon-naturel.jpg', 4, true),

(md5('cat-poterie-nabeul')::uuid, md5('cat-artisanat-terroir')::uuid, 'Poterie & Céramique de Nabeul', 'خزف وفخار نابل', 'poterie-ceramique', '/demo/theiere-ceramique.jpg', 1, true),
(md5('cat-bois-olivier')::uuid, md5('cat-artisanat-terroir')::uuid, 'Bois d''Olivier sculpté', 'خشب الزيتون المنحوت', 'bois-olivier', '/demo/bocaux-verre.jpg', 2, true),
(md5('cat-tapis-margoum')::uuid, md5('cat-artisanat-terroir')::uuid, 'Tapis & Margoum de Kairouan', 'زرابي ومرقوم القيروان', 'tapis-margoum', '/demo/chemise-lin.jpg', 3, true),
(md5('cat-terroir-tunisien')::uuid, md5('cat-artisanat-terroir')::uuid, 'Produits du Terroir & Huile d''Olive', 'زيت زيتون ومؤونة تونسية', 'produits-terroir', '/demo/huile-argan.jpg', 4, true),

(md5('cat-fitness-equipement')::uuid, md5('cat-sport')::uuid, 'Équipements de Musculation', 'معدات وأوزان رياضية', 'musculation-fitness', '/demo/montre-connectee.jpg', 1, true),
(md5('cat-sport-textile')::uuid, md5('cat-sport')::uuid, 'Vêtements & Baskets de Sport', 'أزياء رياضية وأحذية تمرين', 'textile-sport', '/demo/tshirt-coton-bio.jpg', 2, true),
(md5('cat-camping-outdoor')::uuid, md5('cat-sport')::uuid, 'Camping & Randonnée', 'تخييم ورحلات برية', 'camping-randonnee', '/demo/enceinte-bluetooth.jpg', 3, true),

(md5('cat-mode-bebe')::uuid, md5('cat-bebe-enfants')::uuid, 'Vêtements Bébé & Enfant', 'ملابس الرضع والأطفال', 'mode-bebe-enfant', '/demo/tshirt-coton-bio.jpg', 1, true),
(md5('cat-jouets-eveil')::uuid, md5('cat-bebe-enfants')::uuid, 'Jeux & Jouets d''éveil', 'ألعاب تعليمية وترفيهية', 'jouets-eveil', '/demo/bocaux-verre.jpg', 2, true),

(md5('cat-litterature')::uuid, md5('cat-livres-culture')::uuid, 'Romans & Littérature', 'روايات وأدب', 'romans-litterature', '/demo/theiere-ceramique.jpg', 1, true),
(md5('cat-papeterie')::uuid, md5('cat-livres-culture')::uuid, 'Carnets & Fournitures de Bureau', 'أجندات ومستلزمات مكتبية', 'papeterie-bureau', '/demo/bocaux-verre.jpg', 2, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.category_attributes (id, category_id, code, name_fr, name_ar, type, unit, is_required, is_filterable, is_searchable, is_variant, display_order) VALUES
(md5('att-mode.taille')::uuid, md5('cat-mode')::uuid, 'taille', 'Taille', 'المقاس', 'dropdown', NULL, false, true, false, true, 1),
(md5('att-mode.couleur')::uuid, md5('cat-mode')::uuid, 'couleur', 'Couleur', 'اللون', 'color', NULL, false, true, true, true, 2),
(md5('att-mode.matiere')::uuid, md5('cat-mode')::uuid, 'matiere', 'Matière', 'الخامة', 'text', NULL, true, false, true, false, 3),
(md5('att-mode.entretien')::uuid, md5('cat-mode')::uuid, 'entretien', 'Entretien', 'العناية', 'text', NULL, false, false, false, false, 4),
(md5('att-elec.couleur')::uuid, md5('cat-electronique')::uuid, 'couleur', 'Couleur', 'اللون', 'color', NULL, false, true, true, true, 1),
(md5('att-elec.autonomie')::uuid, md5('cat-electronique')::uuid, 'autonomie', 'Autonomie', 'عمر البطارية', 'measurement', 'h', false, false, false, false, 2),
(md5('att-audio.connectivite')::uuid, md5('cat-audio')::uuid, 'connectivite', 'Connectivité', 'الاتصال', 'dropdown', NULL, false, true, true, false, 1),
(md5('att-audio.etanche')::uuid, md5('cat-audio')::uuid, 'etanche', 'Résistant à l''eau', 'مقاوم للماء', 'boolean', NULL, false, false, false, false, 2),
(md5('att-acc.puissance')::uuid, md5('cat-montres-accessoires')::uuid, 'puissance', 'Puissance', 'القوة', 'measurement', 'W', false, false, false, false, 1),
(md5('att-maison.matiere')::uuid, md5('cat-maison-cuisine')::uuid, 'matiere', 'Matière', 'الخامة', 'dropdown', NULL, false, true, true, false, 1),
(md5('att-maison.capacite')::uuid, md5('cat-maison-cuisine')::uuid, 'capacite', 'Capacité', 'السعة', 'measurement', 'L', false, false, false, false, 2),
(md5('att-maison.faitmain')::uuid, md5('cat-maison-cuisine')::uuid, 'fait_main', 'Fait main', 'صنع يدوي', 'boolean', NULL, false, false, false, false, 3),
(md5('att-beaute.contenance')::uuid, md5('cat-beaute')::uuid, 'contenance', 'Contenance', 'الحجم', 'dropdown', NULL, false, true, false, true, 1),
(md5('att-beaute.peau')::uuid, md5('cat-beaute')::uuid, 'type_peau', 'Type de peau', 'نوع البشرة', 'multi_select', NULL, false, true, true, false, 2),
(md5('att-beaute.bio')::uuid, md5('cat-beaute')::uuid, 'bio', 'Certifié bio', 'عضوي معتمد', 'boolean', NULL, false, false, false, false, 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.category_attribute_options (id, attribute_id, value, label_fr, label_ar, color_hex, display_order)
SELECT md5('opt-' || o.att || '-' || o.val)::uuid, md5('att-' || o.att)::uuid, o.val, o.fr, o.ar, o.hex, o.ord
FROM (VALUES
  ('mode.taille','S','S','S',NULL,1), ('mode.taille','M','M','M',NULL,2), ('mode.taille','L','L','L',NULL,3), ('mode.taille','XL','XL','XL',NULL,4),
  ('mode.couleur','blanc','Blanc','أبيض','#FFFFFF',1), ('mode.couleur','noir','Noir','أسود','#1F2937',2), ('mode.couleur','gris','Gris chiné','رمادي','#9CA3AF',3),
  ('mode.couleur','vert-sauge','Vert sauge','أخضر مريمي','#9CAF88',4), ('mode.couleur','beige','Beige','بيج','#D6C7A1',5), ('mode.couleur','bleu-ciel','Bleu ciel','أزرق سماوي','#9CC9E8',6),
  ('elec.couleur','blanc','Blanc','أبيض','#FFFFFF',1), ('elec.couleur','noir','Noir','أسود','#1F2937',2), ('elec.couleur','bleu-canard','Bleu canard','أزرق بترولي','#0F5257',3),
  ('audio.connectivite','bt53','Bluetooth 5.3','بلوتوث 5.3',NULL,1), ('audio.connectivite','bt50','Bluetooth 5.0','بلوتوث 5.0',NULL,2),
  ('maison.matiere','ceramique','Céramique','خزف',NULL,1), ('maison.matiere','verre','Verre','زجاج',NULL,2), ('maison.matiere','bambou','Bambou','خيزران',NULL,3),
  ('beaute.contenance','50ml','50 ml','50 مل',NULL,1), ('beaute.contenance','100ml','100 ml','100 مل',NULL,2),
  ('beaute.peau','tous','Tous types','كل الأنواع',NULL,1), ('beaute.peau','seche','Peau sèche','بشرة جافة',NULL,2), ('beaute.peau','sensible','Peau sensible','بشرة حساسة',NULL,3)
) AS o(att, val, fr, ar, hex, ord)
ON CONFLICT (id) DO NOTHING;

DO $seed$
DECLARE
  d jsonb := $json$[
{"slug":"tshirt-coton-bio","sku":"WS-TS-001","cat":"t-shirts-sweats","fr":"T-shirt col rond coton bio","ar":"تي شيرت بياقة دائرية من القطن العضوي","brand":"Medina Wear","model":"MW-100","price":39.9,"cost":18,"featured":true,"days":2,"img":"tshirt-coton-bio",
 "dfr":"Le basique qu'on porte tous les jours. Coupe régulière, col rond côtelé et coton bio doux au toucher.\n\n• 100 % coton bio, 180 g/m²\n• Ne rétrécit pas au lavage\n• Coutures renforcées aux épaules",
 "dar":"القطعة الأساسية التي تلبسها كل يوم. قصة عادية، ياقة دائرية وقطن عضوي ناعم.\n\n• قطن عضوي 100٪، 180 غ/م²\n• لا ينكمش عند الغسيل\n• خياطة مقواة عند الكتفين",
 "attrs":[{"a":"mode.matiere","text":"100 % coton bio"},{"a":"mode.entretien","text":"Lavage en machine à 30 °C"}],
 "axes":[["mode.taille",["S","M","L","XL"]],["mode.couleur",["blanc","noir"]]]},
{"slug":"sweat-capuche-molleton","sku":"WS-SW-002","cat":"t-shirts-sweats","fr":"Sweat à capuche molleton","ar":"سويت شيرت بقبعة مبطن","brand":"Medina Wear","model":"MW-220","price":79,"promo":65,"cost":35,"featured":false,"days":6,"img":"sweat-capuche",
 "dfr":"Chaud sans être lourd, ce sweat à capuche molletonné accompagne vos soirées fraîches.\n\n• Intérieur molletonné doux\n• Capuche doublée avec cordon\n• Bords côtelés aux poignets et à la taille",
 "dar":"دافئ دون أن يكون ثقيلاً، يرافقك في الأمسيات الباردة.\n\n• بطانة داخلية ناعمة\n• قبعة مبطنة بحبل\n• حواف مضلعة عند المعصمين والخصر",
 "attrs":[{"a":"mode.matiere","text":"80 % coton, 20 % polyester"},{"a":"mode.entretien","text":"Lavage à 30 °C, sur l'envers"}],
 "axes":[["mode.taille",["M","L","XL"]],["mode.couleur",["gris","vert-sauge"]]]},
{"slug":"chemise-lin","sku":"WS-CH-003","cat":"chemises","fr":"Chemise en lin","ar":"قميص من الكتان","brand":"Sidi Bou","model":"SB-LIN","price":89,"cost":40,"featured":false,"days":10,"img":"chemise-lin",
 "dfr":"Légère et respirante, la chemise en lin idéale pour l'été tunisien.\n\n• 100 % lin lavé\n• Poche poitrine\n• Boutons nacrés",
 "dar":"خفيف ويسمح بمرور الهواء، القميص المثالي لصيف تونس.\n\n• كتان مغسول 100٪\n• جيب على الصدر\n• أزرار صدفية",
 "attrs":[{"a":"mode.matiere","text":"100 % lin"}],
 "axes":[["mode.taille",["S","M","L","XL"]],["mode.couleur",["beige","bleu-ciel"]]]},
{"slug":"robe-ete-fleurie","sku":"WS-RB-004","cat":"robes","fr":"Robe d'été fleurie","ar":"فستان صيفي مزهر","brand":"Jasmin","model":"JS-24","price":99,"promo":79,"cost":38,"featured":true,"days":1,"img":"robe-ete-fleurie",
 "dfr":"Une robe midi fluide aux motifs floraux terracotta et vert canard, avec manches ballon.\n\n• Viscose légère\n• Taille ajustée, jupe à volants\n• Longueur mi-mollet",
 "dar":"فستان متوسط الطول بنقوش زهور بلون التيراكوتا والأخضر، بأكمام منفوخة.\n\n• فسكوز خفيف\n• خصر محدد وتنورة بكشكش\n• طول إلى منتصف الساق",
 "attrs":[{"a":"mode.matiere","text":"100 % viscose"},{"a":"mode.entretien","text":"Lavage délicat à 30 °C"}],
 "axes":[["mode.taille",["S","M","L"]]]},
{"slug":"ecouteurs-sans-fil","sku":"WS-EC-005","cat":"audio","fr":"Écouteurs sans fil","ar":"سماعات أذن لاسلكية","brand":"SonicTN","model":"Buds Pro","warranty":"1 an","price":129,"promo":99,"cost":55,"featured":true,"days":3,"img":"ecouteurs-sans-fil",
 "dfr":"Un son clair et jusqu'à 24 heures d'écoute avec le boîtier de charge.\n\n• Bluetooth 5.3, connexion instantanée\n• Embouts en silicone en 3 tailles\n• Résistants aux éclaboussures",
 "dar":"صوت نقي وحتى 24 ساعة استماع مع علبة الشحن.\n\n• بلوتوث 5.3 واتصال فوري\n• سدادات سيليكون بثلاثة مقاسات\n• مقاومة للرذاذ",
 "attrs":[{"a":"elec.autonomie","num":24},{"a":"audio.connectivite","option":"bt53"},{"a":"audio.etanche","bool":true}],
 "axes":[["elec.couleur",["blanc","noir"]]]},
{"slug":"enceinte-bluetooth-portable","sku":"WS-EN-006","cat":"audio","fr":"Enceinte Bluetooth portable","ar":"مكبر صوت بلوتوث محمول","brand":"SonicTN","model":"Go Mini","warranty":"1 an","price":149,"cost":70,"featured":false,"days":12,"img":"enceinte-bluetooth",
 "dfr":"Compacte, avec sa dragonne, elle vous suit à la plage comme en terrasse.\n\n• 12 heures d'autonomie\n• Tissu résistant à l'eau\n• Commandes sur le dessus",
 "dar":"صغيرة الحجم مع حزام للحمل، ترافقك إلى الشاطئ أو الشرفة.\n\n• 12 ساعة تشغيل\n• قماش مقاوم للماء\n• أزرار تحكم في الأعلى",
 "attrs":[{"a":"elec.autonomie","num":12},{"a":"audio.connectivite","option":"bt50"},{"a":"audio.etanche","bool":true}],"axes":[]},
{"slug":"montre-connectee","sku":"WS-MT-007","cat":"montres-accessoires","fr":"Montre connectée","ar":"ساعة ذكية","brand":"SonicTN","model":"Fit 2","warranty":"1 an","price":199,"promo":169,"cost":95,"featured":true,"days":4,"img":"montre-connectee",
 "dfr":"Suivez vos pas, votre sommeil et vos notifications d'un coup d'œil.\n\n• Écran tactile lumineux\n• Bracelet silicone confortable\n• Jusqu'à 7 jours d'autonomie",
 "dar":"تابع خطواتك ونومك وإشعاراتك بنظرة واحدة.\n\n• شاشة لمس مضيئة\n• سوار سيليكون مريح\n• حتى 7 أيام من البطارية",
 "attrs":[{"a":"elec.autonomie","num":168}],"axes":[]},
{"slug":"chargeur-rapide-usb-c-20w","sku":"WS-CR-008","cat":"montres-accessoires","fr":"Chargeur rapide USB-C 20 W","ar":"شاحن سريع USB-C بقوة 20 واط","brand":"SonicTN","model":"PD20","warranty":"6 mois","price":35,"cost":14,"featured":false,"days":15,"img":"chargeur-rapide",
 "dfr":"Rechargez votre téléphone rapidement grâce à la charge 20 W. Câble USB-C inclus.\n\n• Charge rapide 20 W\n• Câble USB-C vers USB-C de 1 m\n• Format compact",
 "dar":"اشحن هاتفك بسرعة بفضل الشحن بقوة 20 واط. الكابل مرفق.\n\n• شحن سريع 20 واط\n• كابل USB-C إلى USB-C بطول 1 م\n• حجم صغير",
 "attrs":[{"a":"acc.puissance","num":20}],"axes":[]},
{"slug":"theiere-ceramique-peinte-main","sku":"WS-TH-009","cat":"cuisine","fr":"Théière en céramique peinte main","ar":"إبريق شاي خزفي مرسوم يدوياً","brand":"Nabeul Artisanat","price":59,"cost":25,"featured":true,"days":5,"img":"theiere-ceramique",
 "dfr":"Façonnée et peinte à la main à Nabeul, cette théière apporte une touche artisanale à votre table.\n\n• Céramique émaillée\n• Contenance 1 litre\n• Motifs uniques : chaque pièce est différente",
 "dar":"مصنوع ومرسوم يدوياً في نابل، يضيف لمسة حرفية إلى طاولتك.\n\n• خزف مطلي\n• سعة لتر واحد\n• نقوش فريدة، كل قطعة مختلفة",
 "attrs":[{"a":"maison.matiere","option":"ceramique"},{"a":"maison.capacite","num":1},{"a":"maison.faitmain","bool":true}],"axes":[]},
{"slug":"lot-3-bocaux-verre-bambou","sku":"WS-BC-010","cat":"rangement","fr":"Lot de 3 bocaux en verre et bambou","ar":"طقم 3 برطمانات من الزجاج والخيزران","brand":"Dar Home","price":45,"promo":39,"cost":18,"featured":false,"days":8,"img":"bocaux-verre",
 "dfr":"Rangez épices, café ou céréales avec style. Trois tailles, couvercles en bambou.\n\n• Verre borosilicate\n• Couvercles bambou avec joint\n• Capacité totale 1,5 litre",
 "dar":"رتّب التوابل أو القهوة أو الحبوب بأناقة. ثلاثة أحجام بأغطية من الخيزران.\n\n• زجاج بوروسيليكات\n• أغطية خيزران بحلقة عازلة\n• سعة إجمالية 1.5 لتر",
 "attrs":[{"a":"maison.matiere","option":"verre"},{"a":"maison.capacite","num":1.5},{"a":"maison.faitmain","bool":false}],"axes":[]},
{"slug":"huile-argan-bio","sku":"WS-HA-011","cat":"soins","fr":"Huile d'argan bio","ar":"زيت الأرغان العضوي","brand":"Zitouna","price":39,"cost":15,"featured":true,"days":7,"img":"huile-argan",
 "dfr":"Pressée à froid, l'huile d'argan nourrit la peau, les cheveux et les ongles.\n\n• 100 % pure, pressée à froid\n• Flacon en verre ambré avec pipette\n• Convient à tous les types de peau",
 "dar":"معصور على البارد، يغذي البشرة والشعر والأظافر.\n\n• نقي 100٪ ومعصور على البارد\n• قارورة زجاج كهرماني مع قطارة\n• مناسب لكل أنواع البشرة",
 "attrs":[{"a":"beaute.peau","options":["tous","seche"]},{"a":"beaute.bio","bool":true}],
 "axes":[["beaute.contenance",["50ml","100ml"]]],"vprice":{"50ml":[39,null,15],"100ml":[65,59,26]}},
{"slug":"savons-naturels-lot-3","sku":"WS-SV-012","cat":"soins","fr":"Savons naturels (lot de 3)","ar":"صابون طبيعي (3 قطع)","brand":"Zitouna","price":24,"cost":9,"featured":false,"days":9,"img":"savon-naturel",
 "dfr":"Trois savons saponifiés à froid : lait d'amande, olive & sauge, lavande.\n\n• Ingrédients d'origine naturelle\n• Sans parfum de synthèse\n• Environ 100 g par savon",
 "dar":"ثلاث قطع صابون مصنوعة على البارد: حليب اللوز، الزيتون والمريمية، الخزامى.\n\n• مكونات طبيعية\n• بدون عطور صناعية\n• حوالي 100 غ للقطعة",
 "attrs":[{"a":"beaute.peau","options":["tous","sensible"]},{"a":"beaute.bio","bool":false}],"axes":[]}
]$json$::jsonb;
  stocks int[] := ARRAY[14, 22, 9, 3, 18, 0, 12, 25, 7, 16, 11, 5];
  p jsonb; pa jsonb; t text; a1 text; a2 text; v1 text; v2 text; vk text; vp jsonb;
  pid uuid; vid uuid; pos int; si int := 0; vprice numeric; vpromo numeric; vcost numeric; st int;
BEGIN
  FOR p IN SELECT * FROM jsonb_array_elements(d) LOOP
    pid := md5('prod-' || (p->>'slug'))::uuid;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.products WHERE id = pid OR slug = p->>'slug' OR sku = p->>'sku');
    INSERT INTO public.products (id, category_id, name_fr, name_ar, slug, sku, description_fr, description_ar, brand, model, price, promo_price,
                                 warranty, status, has_variants, is_featured, published_at)
    VALUES (pid, md5('cat-' || (p->>'cat'))::uuid, p->>'fr', p->>'ar', p->>'slug', p->>'sku', p->>'dfr', p->>'dar', p->>'brand', p->>'model',
            (p->>'price')::numeric, (p->>'promo')::numeric, p->>'warranty', 'published',
            jsonb_array_length(p->'axes') > 0, (p->>'featured')::boolean, now() - make_interval(days => (p->>'days')::int));
    INSERT INTO public.product_private (product_id, purchase_price) VALUES (pid, (p->>'cost')::numeric) ON CONFLICT (product_id) DO NOTHING;
    INSERT INTO public.product_images (product_id, url, alt, position) VALUES (pid, '/demo/' || (p->>'img') || '.jpg', p->>'fr', 0);

    FOR pa IN SELECT * FROM jsonb_array_elements(p->'attrs') LOOP
      IF pa ? 'options' THEN
        FOR t IN SELECT * FROM jsonb_array_elements_text(pa->'options') LOOP
          INSERT INTO public.product_attribute_values (product_id, attribute_id, option_id)
          VALUES (pid, md5('att-' || (pa->>'a'))::uuid, md5('opt-' || (pa->>'a') || '-' || t)::uuid);
        END LOOP;
      ELSE
        INSERT INTO public.product_attribute_values (product_id, attribute_id, option_id, value_text, value_number, value_boolean)
        VALUES (pid, md5('att-' || (pa->>'a'))::uuid,
                CASE WHEN pa ? 'option' THEN md5('opt-' || (pa->>'a') || '-' || (pa->>'option'))::uuid END,
                pa->>'text', (pa->>'num')::numeric, (pa->>'bool')::boolean);
      END IF;
    END LOOP;

    a1 := p->'axes'->0->>0;
    a2 := p->'axes'->1->>0;
    pos := 0;
    FOR v1 IN SELECT x FROM jsonb_array_elements_text(coalesce(p->'axes'->0->1, '[""]'::jsonb)) x LOOP
      FOR v2 IN SELECT x FROM jsonb_array_elements_text(coalesce(p->'axes'->1->1, '[""]'::jsonb)) x LOOP
        pos := pos + 1;
        si := si + 1;
        vk := (p->>'slug') || '|' || v1 || '|' || v2;
        vid := md5('var-' || vk)::uuid;
        vp := p->'vprice'->v1;
        vprice := coalesce((vp->>0)::numeric, (p->>'price')::numeric);
        vpromo := CASE WHEN vp IS NOT NULL THEN (vp->>1)::numeric ELSE (p->>'promo')::numeric END;
        vcost := coalesce((vp->>2)::numeric, (p->>'cost')::numeric);
        INSERT INTO public.product_variants (id, product_id, sku, price, promo_price, is_active, is_default, position)
        VALUES (vid, pid,
                (p->>'sku') || CASE WHEN v1 <> '' THEN '-' || upper(replace(v1, '-', '')) ELSE '' END || CASE WHEN v2 <> '' THEN '-' || upper(replace(v2, '-', '')) ELSE '' END,
                vprice, vpromo, true, a1 IS NULL, pos);
        IF a1 IS NOT NULL THEN
          INSERT INTO public.variant_attribute_values (variant_id, attribute_id, option_id) VALUES (vid, md5('att-' || a1)::uuid, md5('opt-' || a1 || '-' || v1)::uuid);
        END IF;
        IF a2 IS NOT NULL THEN
          INSERT INTO public.variant_attribute_values (variant_id, attribute_id, option_id) VALUES (vid, md5('att-' || a2)::uuid, md5('opt-' || a2 || '-' || v2)::uuid);
        END IF;
        UPDATE public.variant_costs SET cost = vcost WHERE variant_id = vid;
        st := stocks[((si - 1) % array_length(stocks, 1)) + 1];
        IF st > 0 THEN
          PERFORM public._move_stock(vid, NULL, 'available', st, 'initial', 'Stock initial (catalogue de démonstration)', NULL, NULL, NULL);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $seed$;

-- ===== 0007_marketplace_enums.sql =====
-- =========================================================
-- weshop marketplace — enums
-- New values must land in their own migration so the following
-- migrations can safely use them in functions and policies.
-- =========================================================

-- Seller-owned listings need their own editorial lifecycle on top of
-- the existing admin catalogue lifecycle.
alter type public.product_status add value if not exists 'pending';
alter type public.product_status add value if not exists 'rejected';
alter type public.product_status add value if not exists 'paused';

-- Marketplace money movements: platform commission and its reversal.
alter type public.finance_entry_type add value if not exists 'commission';
alter type public.finance_entry_type add value if not exists 'commission_reversal';
alter type public.finance_entry_type add value if not exists 'seller_settlement';

do $$ begin
  create type public.seller_status as enum ('pending', 'approved', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.settlement_status as enum ('pending', 'partial', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

-- Second-hand condition. Categories opt in; the administrator controls the
-- allowed labels in store_settings.condition_options.
do $$ begin
  create type public.listing_condition as enum ('new', 'like_new', 'good', 'acceptable', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_action as enum (
    'submitted', 'approved', 'rejected', 'paused', 'reactivated', 'archived', 'updated'
  );
exception when duplicate_object then null; end $$;

commit;

begin;

-- ===== 0008_marketplace_schema.sql =====
-- =========================================================
-- weshop marketplace — schema
-- Seller profiles, listing ownership, seller order groups,
-- commission snapshots, settlements and moderation history.
-- =========================================================

-- ---------- STORE SETTINGS: marketplace configuration ----------
alter table public.store_settings
  add column if not exists default_commission_pct numeric(5,2) not null default 0
    check (default_commission_pct between 0 and 100),
  add column if not exists commission_fixed_fee numeric(12,3) not null default 0
    check (commission_fixed_fee >= 0),
  add column if not exists reapprove_seller_edits boolean not null default true,
  add column if not exists condition_options text[] not null
    default array['new', 'like_new', 'good', 'acceptable', 'other'],
  add column if not exists seller_terms_fr text,
  add column if not exists seller_terms_ar text;

-- Categories opt in to the second-hand condition field (furniture may, new
-- phones may not). The label list itself is global and admin-editable.
alter table public.categories
  add column if not exists allows_condition boolean not null default false;

-- ---------- SELLER PROFILES ----------
create table if not exists public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  shop_name text not null check (length(trim(shop_name)) between 2 and 80),
  shop_slug text not null unique check (shop_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  phone text not null check (length(phone) between 8 and 20),
  email text check (email is null or length(email) <= 200),
  city text not null check (length(trim(city)) between 2 and 80),
  address text check (address is null or length(address) <= 500),
  description_fr text check (description_fr is null or length(description_fr) <= 2000),
  description_ar text check (description_ar is null or length(description_ar) <= 2000),
  logo_url text,
  status public.seller_status not null default 'pending',
  admin_note text check (admin_note is null or length(admin_note) <= 2000),
  extra jsonb not null default '{}'::jsonb,
  rating_avg numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count int not null default 0 check (rating_count >= 0),
  approved_at timestamptz,
  approved_by uuid,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_seller_profiles_status on public.seller_profiles(status);
create index if not exists idx_seller_profiles_user on public.seller_profiles(user_id);
create trigger trg_seller_profiles_updated before update on public.seller_profiles
  for each row execute function public.set_updated_at();
create trigger trg_audit_seller_profiles after insert or update or delete on public.seller_profiles
  for each row execute function public.audit_row();

create table if not exists public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_name text not null,
  shop_slug text not null,
  phone text not null,
  email text,
  city text not null,
  address text,
  description_fr text,
  description_ar text,
  logo_url text,
  extra jsonb not null default '{}'::jsonb,
  status public.seller_status not null default 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_seller_applications_user on public.seller_applications(user_id, created_at desc);
create index if not exists idx_seller_applications_status on public.seller_applications(status, created_at);
-- one open application per user
create unique index if not exists uq_seller_application_pending
  on public.seller_applications(user_id) where status = 'pending';

create table if not exists public.seller_status_history (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  from_status public.seller_status,
  to_status public.seller_status not null,
  note text check (note is null or length(note) <= 2000),
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_seller_status_history_seller
  on public.seller_status_history(seller_id, created_at desc);

-- ---------- COMMISSION SETTINGS ----------
-- One row per seller override plus exactly one default row (seller_id is null).
create table if not exists public.seller_commission_settings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.seller_profiles(id) on delete cascade,
  commission_pct numeric(5,2) not null check (commission_pct between 0 and 100),
  fixed_fee numeric(12,3) not null default 0 check (fixed_fee >= 0),
  note text check (note is null or length(note) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_commission_seller
  on public.seller_commission_settings(seller_id) where seller_id is not null;
create unique index if not exists uq_commission_default
  on public.seller_commission_settings((seller_id is null)) where seller_id is null;
create trigger trg_commission_updated before update on public.seller_commission_settings
  for each row execute function public.set_updated_at();

insert into public.seller_commission_settings (seller_id, commission_pct, fixed_fee, note)
select null, 0, 0, 'Taux par défaut — à configurer par l''administrateur'
where not exists (select 1 from public.seller_commission_settings where seller_id is null);

-- ---------- ADMIN-CONFIGURED SELLER APPLICATION QUESTIONS ----------
create table if not exists public.seller_application_fields (
  id uuid primary key default gen_random_uuid(),
  field_key text not null unique check (field_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  label_fr text not null check (length(trim(label_fr)) between 1 and 120),
  label_ar text check (label_ar is null or length(label_ar) <= 120),
  field_type text not null default 'text' check (field_type in ('text', 'number', 'boolean', 'select')),
  options text[] not null default array[]::text[],
  is_required boolean not null default false,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_seller_fields_updated before update on public.seller_application_fields
  for each row execute function public.set_updated_at();

alter table public.seller_application_fields enable row level security;

-- ---------- PRODUCT OWNERSHIP ----------
alter table public.products
  add column if not exists seller_id uuid references public.seller_profiles(id) on delete restrict,
  add column if not exists condition public.listing_condition,
  add column if not exists moderation_feedback text check (moderation_feedback is null or length(moderation_feedback) <= 2000),
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;
create index if not exists idx_products_seller on public.products(seller_id, status);
create index if not exists idx_products_status_seller on public.products(status) where seller_id is not null;

-- ---------- SELLER ORDER GROUPS ----------
-- One order stays one customer-facing order. Each seller portion gets a
-- group so sellers can fulfill independently without seeing other sellers.
create table if not exists public.seller_order_groups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(id) on delete restrict,
  status public.order_status not null default 'pending',
  subtotal numeric(12,3) not null default 0 check (subtotal >= 0),
  discount_total numeric(12,3) not null default 0 check (discount_total >= 0),
  refund_total numeric(12,3) not null default 0 check (refund_total >= 0),
  commission_rate numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  commission_fixed numeric(12,3) not null default 0 check (commission_fixed >= 0),
  commission_total numeric(12,3) not null default 0 check (commission_total >= 0),
  commission_reversed numeric(12,3) not null default 0 check (commission_reversed >= 0),
  net_amount numeric(12,3) not null default 0,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seller_id)
);
create index if not exists idx_seller_groups_seller on public.seller_order_groups(seller_id, created_at desc);
create index if not exists idx_seller_groups_order on public.seller_order_groups(order_id);
create index if not exists idx_seller_groups_status on public.seller_order_groups(seller_id, status);
create trigger trg_seller_groups_updated before update on public.seller_order_groups
  for each row execute function public.set_updated_at();

create table if not exists public.seller_order_status_history (
  id uuid primary key default gen_random_uuid(),
  seller_group_id uuid not null references public.seller_order_groups(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text check (note is null or length(note) <= 500),
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_seller_order_history_group
  on public.seller_order_status_history(seller_group_id, created_at);

alter table public.order_items
  add column if not exists seller_id uuid references public.seller_profiles(id) on delete set null,
  add column if not exists seller_group_id uuid references public.seller_order_groups(id) on delete set null,
  add column if not exists commission_rate numeric(5,2) not null default 0
    check (commission_rate between 0 and 100),
  add column if not exists commission_amount numeric(12,3) not null default 0
    check (commission_amount >= 0),
  add column if not exists discount_amount numeric(12,3) not null default 0
    check (discount_amount >= 0);
create index if not exists idx_order_items_seller on public.order_items(seller_id);
create index if not exists idx_order_items_seller_group on public.order_items(seller_group_id);

alter table public.orders
  add column if not exists has_seller_items boolean not null default false;

-- ---------- LISTING MODERATION ----------
create table if not exists public.listing_moderation_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  action public.moderation_action not null,
  note text check (note is null or length(note) <= 2000),
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_listing_moderation_product
  on public.listing_moderation_history(product_id, created_at desc);

-- ---------- SELLER SETTLEMENTS ----------
create table if not exists public.seller_settlements (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  seller_id uuid not null references public.seller_profiles(id) on delete restrict,
  period_start date,
  period_end date,
  gross_sales numeric(12,3) not null default 0 check (gross_sales >= 0),
  discounts numeric(12,3) not null default 0 check (discounts >= 0),
  refunds numeric(12,3) not null default 0 check (refunds >= 0),
  commission numeric(12,3) not null default 0 check (commission >= 0),
  fees numeric(12,3) not null default 0 check (fees >= 0),
  net_amount numeric(12,3) not null default 0,
  paid_amount numeric(12,3) not null default 0 check (paid_amount >= 0),
  status public.settlement_status not null default 'pending',
  note text check (note is null or length(note) <= 2000),
  settled_at timestamptz,
  settled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_settlements_seller on public.seller_settlements(seller_id, created_at desc);
create trigger trg_settlements_updated before update on public.seller_settlements
  for each row execute function public.set_updated_at();

create table if not exists public.seller_settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.seller_settlements(id) on delete cascade,
  seller_group_id uuid not null unique references public.seller_order_groups(id) on delete restrict,
  gross_amount numeric(12,3) not null default 0,
  commission_amount numeric(12,3) not null default 0,
  net_amount numeric(12,3) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_settlement_items_settlement on public.seller_settlement_items(settlement_id);

create table if not exists public.seller_settlement_payments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.seller_settlements(id) on delete cascade,
  amount numeric(12,3) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  recorded_by uuid,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists idx_settlement_payments_settlement on public.seller_settlement_payments(settlement_id);

-- ---------- SELLER RETURN NOTES ----------
create table if not exists public.seller_return_notes (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  note text not null check (length(trim(note)) between 1 and 2000),
  author_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_seller_return_notes_return on public.seller_return_notes(return_id, created_at);

-- ---------- REVIEWS: SELLER RATING ----------
alter table public.reviews
  add column if not exists seller_id uuid references public.seller_profiles(id) on delete set null;
create index if not exists idx_reviews_seller on public.reviews(seller_id, status);

create or replace function public.set_review_seller()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select p.seller_id into new.seller_id from public.products p where p.id = new.product_id;
  return new;
end $$;
drop trigger if exists trg_reviews_seller on public.reviews;
create trigger trg_reviews_seller before insert or update of product_id on public.reviews
  for each row execute function public.set_review_seller();

create or replace function public.refresh_seller_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seller uuid := coalesce(new.seller_id, old.seller_id);
begin
  if v_seller is null then return null; end if;
  update public.seller_profiles sp set
    rating_avg = coalesce((
      select round(avg(r.rating)::numeric, 2)
      from public.reviews r
      where r.seller_id = v_seller and r.status = 'published'
    ), 0),
    rating_count = (
      select count(*) from public.reviews r
      where r.seller_id = v_seller and r.status = 'published'
    )
  where sp.id = v_seller;
  return null;
end $$;
drop trigger if exists trg_reviews_seller_rating on public.reviews;
create trigger trg_reviews_seller_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_seller_rating();

-- ---------- FINANCE LEDGER SUB-LEDGER ----------
alter table public.finance_entries
  add column if not exists seller_id uuid references public.seller_profiles(id) on delete set null,
  add column if not exists seller_group_id uuid references public.seller_order_groups(id) on delete set null;
create index if not exists idx_finance_seller on public.finance_entries(seller_id, created_at desc);

-- ---------- PUBLIC SHOP DIRECTORY ----------
-- Security-definer view: only approved shops and only public-safe columns.
-- Private seller contact details, address and notes stay behind RLS.
create or replace view public.public_seller_shops
with (security_invoker = false) as
select
  id, shop_slug, shop_name, description_fr, description_ar, logo_url, city,
  rating_avg, rating_count, created_at
from public.seller_profiles
where status = 'approved';
grant select on public.public_seller_shops to anon, authenticated;

-- ---------- GRANTS + RLS ----------
alter table public.seller_profiles enable row level security;
alter table public.seller_applications enable row level security;
alter table public.seller_status_history enable row level security;
alter table public.seller_commission_settings enable row level security;
alter table public.seller_order_groups enable row level security;
alter table public.seller_order_status_history enable row level security;
alter table public.listing_moderation_history enable row level security;
alter table public.seller_settlements enable row level security;
alter table public.seller_settlement_items enable row level security;
alter table public.seller_settlement_payments enable row level security;
alter table public.seller_return_notes enable row level security;

grant select on public.seller_profiles to authenticated;
grant select on public.seller_applications to authenticated;
grant select on public.seller_status_history to authenticated;
grant select on public.seller_commission_settings to authenticated;
grant select on public.seller_order_groups to authenticated;
grant select on public.seller_order_status_history to authenticated;
grant select on public.listing_moderation_history to authenticated;
grant select on public.seller_settlements to authenticated;
grant select on public.seller_settlement_items to authenticated;
grant select on public.seller_settlement_payments to authenticated;
grant select on public.seller_return_notes to authenticated;
grant select, insert, update, delete on public.seller_application_fields to authenticated;

grant all on public.seller_profiles to service_role;
grant all on public.seller_applications to service_role;
grant all on public.seller_status_history to service_role;
grant all on public.seller_commission_settings to service_role;
grant all on public.seller_order_groups to service_role;
grant all on public.seller_order_status_history to service_role;
grant all on public.listing_moderation_history to service_role;
grant all on public.seller_settlements to service_role;
grant all on public.seller_settlement_items to service_role;
grant all on public.seller_settlement_payments to service_role;
grant all on public.seller_return_notes to service_role;
grant all on public.seller_application_fields to service_role;

-- ---------- REALTIME ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seller_order_groups'
    ) then
      alter publication supabase_realtime add table public.seller_order_groups;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seller_profiles'
    ) then
      alter publication supabase_realtime add table public.seller_profiles;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'returns'
    ) then
      alter publication supabase_realtime add table public.returns;
    end if;
  end if;
end $$;

-- ===== 0009_seller_functions.sql =====
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

-- ===== 0010_marketplace_orders.sql =====
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

-- ===== 0011_search_and_policies.sql =====
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

-- ===== 0012_test_users_and_orders.sql =====
-- =========================================================
-- weshop — demo accounts, shops, addresses and promotions
-- Apply after 0011_search_and_policies.sql.
--
-- Every account uses the password: Password123!
-- Orders, returns, reviews and settlements are seeded by
-- 0014_marketplace_demo_data.sql through the transactional RPCs.
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. AUTH USERS + IDENTITIES ----------
do $$
declare
  u record;
begin
  -- Delete any pre-existing unconfirmed signups with colliding emails
  delete from auth.users where email in (
    'admin@weshop.tn', 'staff@weshop.tn', 'client@weshop.tn', 'sarra@weshop.tn',
    'seller@weshop.tn', 'seller2@weshop.tn', 'seller3@weshop.tn', 'candidat@weshop.tn',
    'suspendu@weshop.tn', 'ines@weshop.tn', 'mehdi@weshop.tn', 'awa@weshop.tn', 'karim.b@weshop.tn'
  ) and id not in (
    'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000008',
    'a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000010',
    'a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000012',
    'a0000000-0000-0000-0000-000000000013'
  );

  for u in
    select *
    from (values
      ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin@weshop.tn',    'Emna Admin',       '+216 71 000 001', 'fr'),
      ('a0000000-0000-0000-0000-000000000002'::uuid, 'staff@weshop.tn',    'Karim Staff',      '+216 71 000 002', 'fr'),
      ('a0000000-0000-0000-0000-000000000003'::uuid, 'client@weshop.tn',   'Yassine Trabelsi', '+216 98 123 456', 'fr'),
      ('a0000000-0000-0000-0000-000000000004'::uuid, 'sarra@weshop.tn',    'Sarra Mansour',    '+216 22 789 012', 'ar'),
      ('a0000000-0000-0000-0000-000000000005'::uuid, 'seller@weshop.tn',   'Artisan Carthage', '+216 71 234 567', 'fr'),
      ('a0000000-0000-0000-0000-000000000006'::uuid, 'seller2@weshop.tn',  'Maison Nabeul',    '+216 72 345 678', 'fr'),
      ('a0000000-0000-0000-0000-000000000007'::uuid, 'seller3@weshop.tn',  'Atelier Kairouan', '+216 77 456 789', 'fr'),
      ('a0000000-0000-0000-0000-000000000008'::uuid, 'candidat@weshop.tn', 'Nour Ben Ali',     '+216 25 345 678', 'fr'),
      ('a0000000-0000-0000-0000-000000000009'::uuid, 'suspendu@weshop.tn', 'Ancien Atelier',   '+216 73 456 789', 'fr'),
      ('a0000000-0000-0000-0000-000000000010'::uuid, 'ines@weshop.tn',     'Ines Gharbi',      '+216 94 567 890', 'fr'),
      ('a0000000-0000-0000-0000-000000000011'::uuid, 'mehdi@weshop.tn',    'Mehdi Ayari',      '+216 97 678 901', 'ar'),
      ('a0000000-0000-0000-0000-000000000012'::uuid, 'awa@weshop.tn',      'Awa Diallo',       '+216 55 789 012', 'fr'),
      ('a0000000-0000-0000-0000-000000000013'::uuid, 'karim.b@weshop.tn',  'Karim Bouzid',     '+216 56 890 123', 'ar')
    ) as t(id, email, full_name, phone, locale)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      u.id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', u.email,
      extensions.crypt('Password123!', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u.full_name, 'name', u.full_name),
      false, now(), now(), u.phone, now(), '', '', '', ''
    )
    on conflict (id) do update set
      email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
      raw_user_meta_data = excluded.raw_user_meta_data,
      phone = excluded.phone,
      updated_at = now();

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      u.id, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', u.id::text, now(), now(), now()
    )
    on conflict (provider_id, provider) do update set
      identity_data = excluded.identity_data,
      updated_at = now();
  end loop;
end $$;

-- ---------- 2. PROFILES ----------
insert into public.profiles (id, full_name, email, phone, preferred_locale)
select u.id, u.full_name, u.email, u.phone, u.locale
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'Emna Admin',       'admin@weshop.tn',    '+216 71 000 001', 'fr'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'Karim Staff',      'staff@weshop.tn',    '+216 71 000 002', 'fr'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, 'Yassine Trabelsi', 'client@weshop.tn',   '+216 98 123 456', 'fr'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, 'Sarra Mansour',    'sarra@weshop.tn',    '+216 22 789 012', 'ar'),
  ('a0000000-0000-0000-0000-000000000005'::uuid, 'Artisan Carthage', 'seller@weshop.tn',   '+216 71 234 567', 'fr'),
  ('a0000000-0000-0000-0000-000000000006'::uuid, 'Maison Nabeul',    'seller2@weshop.tn',  '+216 72 345 678', 'fr'),
  ('a0000000-0000-0000-0000-000000000007'::uuid, 'Atelier Kairouan', 'seller3@weshop.tn',  '+216 77 456 789', 'fr'),
  ('a0000000-0000-0000-0000-000000000008'::uuid, 'Nour Ben Ali',     'candidat@weshop.tn', '+216 25 345 678', 'fr'),
  ('a0000000-0000-0000-0000-000000000009'::uuid, 'Ancien Atelier',   'suspendu@weshop.tn', '+216 73 456 789', 'fr'),
  ('a0000000-0000-0000-0000-000000000010'::uuid, 'Ines Gharbi',      'ines@weshop.tn',     '+216 94 567 890', 'fr'),
  ('a0000000-0000-0000-0000-000000000011'::uuid, 'Mehdi Ayari',      'mehdi@weshop.tn',    '+216 97 678 901', 'ar'),
  ('a0000000-0000-0000-0000-000000000012'::uuid, 'Awa Diallo',       'awa@weshop.tn',      '+216 55 789 012', 'fr'),
  ('a0000000-0000-0000-0000-000000000013'::uuid, 'Karim Bouzid',     'karim.b@weshop.tn',  '+216 56 890 123', 'ar')
) as u(id, full_name, email, phone, locale)
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  preferred_locale = excluded.preferred_locale;

-- ---------- 3. ROLES ----------
insert into public.user_roles (user_id, role)
values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'staff')
on conflict (user_id, role) do nothing;

-- ---------- 4. SELLER PROFILES ----------
insert into public.seller_profiles (
  id, user_id, shop_name, shop_slug, phone, email, city, address,
  description_fr, description_ar, logo_url, status, admin_note, rating_avg, rating_count,
  approved_at, approved_by
)
values
  (
    'c1000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000005'::uuid,
    'Artisanat Carthage', 'artisanat-carthage', '+216 71 234 567', 'seller@weshop.tn',
    'Tunis', '12 Rue de la Médina, Sidi Bou Saïd, Tunis',
    'Céramiques, tissages et objets façonnés à la main par des artisans de Carthage et de Nabeul.',
    'خزف ومنسوجات وقطع يدوية الصنع من حرفيي قرطاج ونابل.',
    '/demo/theiere-ceramique.jpg', 'approved', null, 4.8, 0, now() - interval '90 days',
    'a0000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'c1000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000006'::uuid,
    'Maison Nabeul', 'maison-nabeul', '+216 72 345 678', 'seller2@weshop.tn',
    'Nabeul', 'Route de Hammamet km 4, Nabeul',
    'Maison de céramique et de décoration : vaisselle, luminaires et textiles naturels.',
    'دار الخزف والديكور: أواني وإضاءة ومنسوجات طبيعية.',
    '/demo/bocaux-verre.jpg', 'approved', null, 4.7, 0, now() - interval '60 days',
    'a0000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'c1000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000007'::uuid,
    'Atelier Kairouan', 'atelier-kairouan', '+216 77 456 789', 'seller3@weshop.tn',
    'Kairouan', 'Avenue de la Grande Mosquée, Kairouan',
    'Tapis noués et tissages traditionnels de Kairouan, en laine naturelle.',
    'سجاد ومنسوجات تقليدية من القيروان، من الصوف الطبيعي.',
    '/demo/robe-ete-fleurie.jpg', 'approved', null, 4.9, 0, now() - interval '45 days',
    'a0000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'c1000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000008'::uuid,
    'Nour Bijoux', 'nour-bijoux', '+216 25 345 678', 'candidat@weshop.tn',
    'Sfax', 'Rue Hédi Chaker, Sfax',
    'Bijoux fantaisie faits main, perles et fil doré.',
    'مجوهرات يدوية من الخرز والخيط الذهبي.',
    null, 'pending', null, 0, 0, null, null
  ),
  (
    'c1000000-0000-0000-0000-000000000005'::uuid, 'a0000000-0000-0000-0000-000000000009'::uuid,
    'Ancien Atelier', 'ancien-atelier', '+216 73 456 789', 'suspendu@weshop.tn',
    'Sousse', 'Boulevard de la Corniche, Sousse',
    'Atelier de menuiserie suspendu pour non-respect des délais.',
    'ورشة نجارة موقوفة لعدم احترام الآجال.',
    null, 'suspended', 'Délais de livraison non respectés — boutique suspendue.',
    0, 0, now() - interval '120 days', 'a0000000-0000-0000-0000-000000000001'::uuid
  )
on conflict (user_id) do update set
  shop_name = excluded.shop_name,
  shop_slug = excluded.shop_slug,
  phone = excluded.phone,
  email = excluded.email,
  city = excluded.city,
  address = excluded.address,
  description_fr = excluded.description_fr,
  description_ar = excluded.description_ar,
  logo_url = excluded.logo_url,
  status = excluded.status,
  admin_note = excluded.admin_note,
  approved_at = excluded.approved_at,
  approved_by = excluded.approved_by,
  suspended_at = case when excluded.status = 'suspended' then now() - interval '10 days' else null end;

-- ---------- 5. SELLER APPLICATIONS + STATUS HISTORY ----------
insert into public.seller_applications (
  id, seller_id, user_id, shop_name, shop_slug, phone, email, city, address,
  description_fr, description_ar, logo_url, extra, status, admin_note, reviewed_by, reviewed_at
)
select
  md5('seller-app-' || sp.id)::uuid, sp.id, sp.user_id, sp.shop_name, sp.shop_slug,
  sp.phone, sp.email, sp.city, sp.address, sp.description_fr, sp.description_ar,
  sp.logo_url, '{}'::jsonb, sp.status,
  case when sp.status = 'pending' then null else sp.admin_note end,
  case when sp.status = 'pending' then null else sp.approved_by end,
  case when sp.status = 'pending' then null else coalesce(sp.approved_at, now() - interval '10 days') end
from public.seller_profiles sp
where sp.id in (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004',
  'c1000000-0000-0000-0000-000000000005'
)
on conflict (id) do update set
  status = excluded.status,
  admin_note = excluded.admin_note,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at;

insert into public.seller_status_history (seller_id, from_status, to_status, note, changed_by, created_at)
select h.seller_id, h.from_status, h.to_status, h.note, h.changed_by, h.created_at
from (values
  ('c1000000-0000-0000-0000-000000000001'::uuid, null::public.seller_status, 'approved'::public.seller_status, 'Boutique validée', 'a0000000-0000-0000-0000-000000000001'::uuid, now() - interval '90 days'),
  ('c1000000-0000-0000-0000-000000000002'::uuid, null, 'approved', 'Boutique validée', 'a0000000-0000-0000-0000-000000000001'::uuid, now() - interval '60 days'),
  ('c1000000-0000-0000-0000-000000000003'::uuid, null, 'approved', 'Boutique validée', 'a0000000-0000-0000-0000-000000000001'::uuid, now() - interval '45 days'),
  ('c1000000-0000-0000-0000-000000000004'::uuid, null, 'pending', 'Candidature envoyée', 'a0000000-0000-0000-0000-000000000008'::uuid, now() - interval '3 days'),
  ('c1000000-0000-0000-0000-000000000005'::uuid, 'approved', 'suspended', 'Délais non respectés', 'a0000000-0000-0000-0000-000000000001'::uuid, now() - interval '10 days')
) as h(seller_id, from_status, to_status, note, changed_by, created_at)
where not exists (
  select 1 from public.seller_status_history x
  where x.seller_id = h.seller_id and x.to_status = h.to_status
);

-- ---------- 6. COMMISSION + MARKETPLACE SETTINGS ----------
update public.store_settings
set default_commission_pct = 8,
    commission_fixed_fee = 0.5,
    reapprove_seller_edits = true,
    condition_options = array['new', 'like_new', 'good', 'acceptable', 'other'],
    seller_terms_fr = 'Commission de 8 % + 0,500 DT par commande. Les retours traités réduisent la commission. Le règlement est versé après la fenêtre de retour.',
    seller_terms_ar = 'عمولة 8٪ + 0.500 د.ت لكل طلب. تقل العمولة عند معالجة الإرجاع. تُدفع التسوية بعد انتهاء مدة الإرجاع.'
where id;

insert into public.seller_commission_settings (seller_id, commission_pct, fixed_fee, note, created_by)
values
  (null, 8, 0.5, 'Taux plateforme par défaut', 'a0000000-0000-0000-0000-000000000001'::uuid),
  ('c1000000-0000-0000-0000-000000000001'::uuid, 5, 0.5, 'Partenaire historique', 'a0000000-0000-0000-0000-000000000001'::uuid),
  ('c1000000-0000-0000-0000-000000000002'::uuid, 10, 0.5, 'Taux standard', 'a0000000-0000-0000-0000-000000000001'::uuid),
  ('c1000000-0000-0000-0000-000000000003'::uuid, 7, 0.5, 'Artisanat — taux réduit', 'a0000000-0000-0000-0000-000000000001'::uuid),
  ('c1000000-0000-0000-0000-000000000005'::uuid, 12, 1, 'Boutique suspendue', 'a0000000-0000-0000-0000-000000000001'::uuid)
on conflict do nothing;

update public.seller_commission_settings s
set commission_pct = v.pct, fixed_fee = v.fee, note = v.note
from (values
  (null::uuid, 8::numeric, 0.5::numeric, 'Taux plateforme par défaut'),
  ('c1000000-0000-0000-0000-000000000001'::uuid, 5, 0.5, 'Partenaire historique'),
  ('c1000000-0000-0000-0000-000000000002'::uuid, 10, 0.5, 'Taux standard'),
  ('c1000000-0000-0000-0000-000000000003'::uuid, 7, 0.5, 'Artisanat — taux réduit'),
  ('c1000000-0000-0000-0000-000000000005'::uuid, 12, 1, 'Boutique suspendue')
) as v(seller_id, pct, fee, note)
where s.seller_id is not distinct from v.seller_id;

insert into public.seller_application_fields (
  field_key, label_fr, label_ar, field_type, options, is_required, display_order, is_active
)
values
  ('matricule_fiscal', 'Matricule fiscal', 'المعرف الجبائي', 'text', array[]::text[], true, 1, true),
  ('type_activite', 'Type d''activité', 'نوع النشاط', 'select', array['Artisanat', 'Mode', 'Maison', 'Électronique', 'Beauté'], true, 2, true),
  ('annees_experience', 'Années d''expérience', 'سنوات الخبرة', 'number', array[]::text[], false, 3, true),
  ('site_web', 'Site web ou page Facebook', 'موقع ويب أو صفحة فيسبوك', 'text', array[]::text[], false, 4, true)
on conflict (field_key) do update set
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  field_type = excluded.field_type,
  options = excluded.options,
  is_required = excluded.is_required,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

-- ---------- 7. SAVED ADDRESSES ----------
insert into public.addresses (id, user_id, label, full_name, phone, city, address_line, instructions, is_default)
values
  ('b1000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid, 'Maison', 'Yassine Trabelsi', '+216 98 123 456', 'Tunis', '12 Avenue Habib Bourguiba, Résidence du Parc, Apt 4B', 'Sonner à l''interphone Trabelsi', true),
  ('b1000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid, 'Bureau', 'Yassine Trabelsi', '+216 98 123 456', 'Ariana', 'Pôle Technologique El Ghazala, Bloc B2', 'Appeler à l''arrivée', false),
  ('b1000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000004'::uuid, 'Domicile', 'Sarra Mansour', '+216 22 789 012', 'Sousse', '45 Boulevard du 14 Janvier, Khezama Est', 'Deuxième étage à gauche', true),
  ('b1000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000010'::uuid, 'Maison', 'Ines Gharbi', '+216 94 567 890', 'Monastir', '8 Rue du Ribat, Apt 2', null, true),
  ('b1000000-0000-0000-0000-000000000005'::uuid, 'a0000000-0000-0000-0000-000000000011'::uuid, 'Domicile', 'Mehdi Ayari', '+216 97 678 901', 'Gabès', 'Route de Médenine km 2, Maison Ayari', 'Appeler avant 18h', true),
  ('b1000000-0000-0000-0000-000000000006'::uuid, 'a0000000-0000-0000-0000-000000000012'::uuid, 'Maison', 'Awa Diallo', '+216 55 789 012', 'Djerba', 'Houmt Souk, Rue des Palmiers', null, true)
on conflict (id) do nothing;

-- ---------- 8. PROMOTIONS ----------
insert into public.promotions (id, code, description, type, value, min_order_amount, max_uses, used_count, is_active)
values
  ('c2000000-0000-0000-0000-000000000001'::uuid, 'BIENVENUE10', '10 % de réduction de bienvenue dès 50 DT d''achat', 'percent', 10, 50, 500, 18, true),
  ('c2000000-0000-0000-0000-000000000002'::uuid, 'RAMADAN20', '20 DT de réduction immédiate dès 100 DT d''achat', 'fixed', 20, 100, 200, 42, true),
  ('c2000000-0000-0000-0000-000000000003'::uuid, 'SOLDE15', '15 % de remise pour les soldes de mi-saison', 'percent', 15, 80, 1000, 95, true),
  ('c2000000-0000-0000-0000-000000000004'::uuid, 'ARTISAN5', '5 DT offerts sur l''artisanat tunisien dès 60 DT', 'fixed', 5, 60, 300, 7, true)
on conflict (code) do nothing;

-- ---------- 9. WELCOME NOTIFICATIONS ----------
insert into public.notifications (user_id, title, body, link, created_at)
select n.user_id, n.title, n.body, n.link, now() - n.age
from (values
  ('a0000000-0000-0000-0000-000000000005'::uuid, 'Boutique approuvée', 'Votre boutique Artisanat Carthage est en ligne.', '/seller/dashboard', interval '90 days'),
  ('a0000000-0000-0000-0000-000000000006'::uuid, 'Boutique approuvée', 'Votre boutique Maison Nabeul est en ligne.', '/seller/dashboard', interval '60 days'),
  ('a0000000-0000-0000-0000-000000000007'::uuid, 'Boutique approuvée', 'Votre boutique Atelier Kairouan est en ligne.', '/seller/dashboard', interval '45 days'),
  ('a0000000-0000-0000-0000-000000000008'::uuid, 'Candidature reçue', 'Votre candidature Nour Bijoux est en cours d''examen.', '/sell', interval '3 days'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, 'Bienvenue chez weshop', 'Votre compte client est prêt. Paiement à la livraison.', '/shop', interval '30 days')
) as n(user_id, title, body, link, age)
where not exists (
  select 1 from public.notifications x where x.user_id = n.user_id and x.title = n.title
);

-- ===== 0013_marketplace_admin.sql =====
-- =========================================================
-- weshop marketplace — admin commission controls & seller views
-- =========================================================

-- ---------- ADMIN: COMMISSION SETTINGS ----------
-- _seller_id = null updates the platform-wide default row.
create or replace function public.admin_set_seller_commission(
  _seller_id uuid,
  _commission_pct numeric,
  _fixed_fee numeric default 0,
  _note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_note text := nullif(left(btrim(coalesce(_note, '')), 500), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if _commission_pct is null or _commission_pct < 0 or _commission_pct > 100 then
    raise exception 'invalid_commission';
  end if;
  if _fixed_fee is null or _fixed_fee < 0 then
    raise exception 'invalid_fixed_fee';
  end if;
  if _seller_id is not null and not exists (
    select 1 from public.seller_profiles sp where sp.id = _seller_id
  ) then
    raise exception 'seller_not_found';
  end if;

  select id into v_id from public.seller_commission_settings
  where seller_id is not distinct from _seller_id
  limit 1;

  if v_id is null then
    insert into public.seller_commission_settings(seller_id, commission_pct, fixed_fee, note, created_by)
    values (_seller_id, round(_commission_pct, 2), round(_fixed_fee, 3), v_note, auth.uid());
  else
    update public.seller_commission_settings
    set commission_pct = round(_commission_pct, 2),
        fixed_fee = round(_fixed_fee, 3),
        note = v_note
    where id = v_id;
  end if;
end $$;
revoke execute on function public.admin_set_seller_commission(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.admin_set_seller_commission(uuid, numeric, numeric, text) to authenticated;

-- ---------- SELLER-SAFE RETURN PROJECTION ----------
-- A seller only sees returns that contain at least one of their lines.
-- all_mine tells the client whether the seller may act on the whole return.
create or replace view public.seller_returns_view
with (security_invoker = false) as
select
  rt.id,
  rt.reference,
  rt.order_id,
  o.reference as order_reference,
  rt.user_id,
  rt.status,
  rt.reason,
  rt.description,
  rt.photos,
  rt.admin_note,
  rt.refund_amount,
  rt.created_at,
  rt.processed_at,
  o.customer_name,
  o.phone,
  o.city,
  o.address,
  (select count(*)
     from public.return_items ri
     join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = rt.id
      and oi.seller_id = public.current_seller_id()) as my_item_count,
  (select count(*) from public.return_items ri where ri.return_id = rt.id) as total_item_count,
  (select coalesce(sum(round((oi.line_total - oi.discount_amount) * ri.quantity / greatest(oi.quantity, 1), 3)), 0)
     from public.return_items ri
     join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = rt.id
      and oi.seller_id = public.current_seller_id()) as my_refund_estimate,
  (select coalesce(bool_and(oi.seller_id = public.current_seller_id()), false)
     from public.return_items ri
     join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = rt.id) as all_mine
from public.returns rt
join public.orders o on o.id = rt.order_id
where exists (
  select 1
  from public.return_items ri
  join public.order_items oi on oi.id = ri.order_item_id
  where ri.return_id = rt.id
    and oi.seller_id = public.current_seller_id()
);

grant select on public.seller_returns_view to authenticated;

-- ---------- SELLER: RETURN NOTES (append-only) ----------
drop policy if exists "Sellers add own return notes" on public.seller_return_notes;
create policy "Sellers add own return notes" on public.seller_return_notes
  for insert to authenticated with check (
    seller_id = public.current_seller_id()
    and author_id = auth.uid()
    and exists (
      select 1 from public.seller_returns_view v where v.id = return_id
    )
  );

-- ---------- SELLER: MODERATION FEEDBACK ----------
create or replace function public.seller_listing_detail(_product_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object(
    'moderation_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', h.action, 'note', h.note, 'created_at', h.created_at
      ) order by h.created_at desc)
      from public.listing_moderation_history h
      where h.product_id = p.id
    ), '[]'::jsonb)
  )
  from public.products p
  where p.id = _product_id and p.seller_id = public.current_seller_id()
$$;
revoke execute on function public.seller_listing_detail(uuid) from public, anon;
grant execute on function public.seller_listing_detail(uuid) to authenticated;

-- ===== 0014_tokens_and_product_boosts.sql =====
-- =========================================================
-- weshop: Tokens economy & Product Boosts
-- 0013_tokens_and_product_boosts.sql
-- =========================================================

-- 1. Alter products table with boost columns
alter table public.products
  add column if not exists is_boosted boolean not null default false,
  add column if not exists boost_tier text check (boost_tier in ('spotlight', 'category', 'search', 'flash')),
  add column if not exists boosted_at timestamptz,
  add column if not exists boosted_until timestamptz,
  add column if not exists boost_score int not null default 0;

create index if not exists idx_products_boosted on public.products(is_boosted, boost_tier, boosted_until);

-- 2. Token Balances
create table if not exists public.token_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance int not null default 100 check (balance >= 0),
  total_earned int not null default 100 check (total_earned >= 0),
  total_spent int not null default 0 check (total_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_token_balances_user on public.token_balances(user_id);

-- 3. Token Transactions Ledger
create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null,
  balance_after int not null,
  reason text not null check (reason in ('welcome_bonus', 'admin_grant', 'admin_deduct', 'purchase', 'product_boost', 'boost_refund')),
  product_id uuid references public.products(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_token_transactions_user on public.token_transactions(user_id, created_at desc);

-- 4. Enable Row Level Security
alter table public.token_balances enable row level security;
alter table public.token_transactions enable row level security;

create policy "Users can view own token balance"
  on public.token_balances for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Users can view own token transactions"
  on public.token_transactions for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- 5. Helper Function: Get or Create Token Balance
create or replace function public.get_or_create_token_balance(_user_id uuid default null)
returns table (
  user_id uuid,
  balance int,
  total_earned int,
  total_spent int
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(_user_id, auth.uid());
  v_bal public.token_balances;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_bal from public.token_balances where token_balances.user_id = v_uid;
  if not found then
    insert into public.token_balances (user_id, balance, total_earned, total_spent)
    values (v_uid, 100, 100, 0)
    returning * into v_bal;

    insert into public.token_transactions (user_id, amount, balance_after, reason, note)
    values (v_uid, 100, 100, 'welcome_bonus', 'Cadeau de bienvenue : 100 tokens offerts pour booster vos premiers produits !');
  end if;

  return query select v_bal.user_id, v_bal.balance, v_bal.total_earned, v_bal.total_spent;
end $$;

-- 6. SECURITY DEFINER: Boost Product Function
create or replace function public.boost_product(
  _product_id uuid,
  _tier text,
  _days int default 7
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cost int;
  v_balance int;
  v_new_balance int;
  v_product public.products;
  v_until timestamptz;
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_is_admin := public.has_role(v_uid, 'admin');

  -- Verify product exists
  select * into v_product from public.products where id = _product_id;
  if not found then
    raise exception 'Product not found';
  end if;

  -- Verify ownership unless admin
  if not v_is_admin and v_product.seller_id is not null then
    if not exists (select 1 from public.seller_profiles where id = v_product.seller_id and user_id = v_uid) then
      raise exception 'Unauthorized: you do not own this product';
    end if;
  end if;

  -- Determine cost
  case _tier
    when 'spotlight' then v_cost := 50;
    when 'category' then v_cost := 25;
    when 'flash' then v_cost := 15;
    when 'search' then v_cost := 10;
    else raise exception 'Invalid boost tier: %', _tier;
  end case;

  -- Adjust cost by duration multiplier (7 days is baseline)
  if _days > 7 then
    v_cost := v_cost * ceil(_days::numeric / 7);
  end if;

  -- Check token balance
  perform public.get_or_create_token_balance(v_uid);
  select balance into v_balance from public.token_balances where user_id = v_uid for update;

  if v_balance < v_cost then
    raise exception 'Solde insuffisant : il vous faut % tokens (solde actuel : %)', v_cost, v_balance;
  end if;

  -- Deduct tokens
  v_new_balance := v_balance - v_cost;
  update public.token_balances
  set
    balance = v_new_balance,
    total_spent = total_spent + v_cost,
    updated_at = now()
  where user_id = v_uid;

  -- Record transaction
  insert into public.token_transactions (
    user_id, amount, balance_after, reason, product_id, note
  ) values (
    v_uid, -v_cost, v_new_balance, 'product_boost', _product_id,
    format('Boost %s appliqué pour %s jours (-%s tokens)', _tier, _days, v_cost)
  );

  -- Apply boost on product
  v_until := now() + (_days || ' days')::interval;
  update public.products
  set
    is_boosted = true,
    boost_tier = _tier,
    boosted_at = now(),
    boosted_until = v_until,
    boost_score = v_cost,
    is_featured = case when _tier = 'spotlight' then true else is_featured end
  where id = _product_id;

  return jsonb_build_object(
    'success', true,
    'product_id', _product_id,
    'tier', _tier,
    'cost', v_cost,
    'new_balance', v_new_balance,
    'boosted_until', v_until
  );
end $$;

-- 7. SECURITY DEFINER: Admin Grant or Deduct Tokens
create or replace function public.admin_manage_tokens(
  _target_user_id uuid,
  _amount int,
  _note text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_current_bal int;
  v_new_bal int;
  v_reason text;
begin
  if not public.has_role(v_uid, 'admin') then
    raise exception 'Unauthorized: Admin privileges required';
  end if;

  perform public.get_or_create_token_balance(_target_user_id);
  select balance into v_current_bal from public.token_balances where user_id = _target_user_id for update;

  v_new_bal := v_current_bal + _amount;
  if v_new_bal < 0 then
    raise exception 'Cannot deduct more tokens than current balance (% tokens available)', v_current_bal;
  end if;

  v_reason := case when _amount >= 0 then 'admin_grant' else 'admin_deduct' end;

  update public.token_balances
  set
    balance = v_new_bal,
    total_earned = case when _amount > 0 then total_earned + _amount else total_earned end,
    total_spent = case when _amount < 0 then total_spent + abs(_amount) else total_spent end,
    updated_at = now()
  where user_id = _target_user_id;

  insert into public.token_transactions (
    user_id, amount, balance_after, reason, note
  ) values (
    _target_user_id, _amount, v_new_bal, v_reason,
    coalesce(_note, format('Ajustement manuel par l''administrateur (%s tokens)', _amount))
  );

  return jsonb_build_object(
    'success', true,
    'user_id', _target_user_id,
    'amount', _amount,
    'new_balance', v_new_bal
  );
end $$;

-- 8. Seed Initial Balances for Demo Accounts
insert into public.token_balances (user_id, balance, total_earned, total_spent)
values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 1000, 1000, 0), -- admin
  ('a0000000-0000-0000-0000-000000000002'::uuid, 500, 500, 0),   -- staff
  ('a0000000-0000-0000-0000-000000000003'::uuid, 150, 150, 0),   -- client
  ('a0000000-0000-0000-0000-000000000004'::uuid, 120, 120, 0),   -- sarra
  ('a0000000-0000-0000-0000-000000000005'::uuid, 350, 450, 100)  -- seller (Artisan Carthage)
on conflict (user_id) do update set
  balance = excluded.balance;

-- ===== 0015_marketplace_demo_data.sql =====
-- =========================================================
-- weshop — rich marketplace demo data
-- Run after 0013_marketplace_admin.sql.
--
-- Seeds seller listings, then drives the real transactional
-- functions (create_order, collect_cod_payment, request_return,
-- process_return, settlements) so stock, commissions, finance,
-- returns and seller balances stay consistent.
-- =========================================================

-- ---------- 1. CATEGORY CONFIGURATION ----------
update public.categories
set allows_condition = true
where slug in ('mode', 'maison-cuisine', 'beaute');

update public.categories
set allows_condition = false
where slug = 'electronique';

insert into public.categories (
  id, parent_id, name_fr, name_ar, slug, description_fr, description_ar,
  image_url, display_order, is_active, allows_condition
)
values (
  md5('cat-decoration')::uuid, md5('cat-maison-cuisine')::uuid,
  'Décoration', 'ديكور', 'decoration',
  'Objets décoratifs, luminaires et textiles pour la maison.',
  'قطع ديكور وإضاءة ومنسوجات للمنزل.',
  '/demo/theiere-ceramique.jpg', 3, true, true
)
on conflict (id) do update set
  allows_condition = excluded.allows_condition,
  is_active = excluded.is_active;

-- ---------- 2. SELLER LISTINGS ----------
do $seed$
declare
  d jsonb := $json$[
{"slug":"plat-ceramique-nabeul","sku":"ART-CER-001","seller":"artisanat-carthage","cat":"cuisine","fr":"Plat en céramique de Nabeul","ar":"طبق خزفي من نابل","brand":"Artisanat Carthage","price":45,"cost":18,"condition":"new","status":"published","days":35,"img":"theiere-ceramique","stock":12,
 "dfr":"Plat de service émaillé et peint à la main, motif jasmin. Chaque pièce est unique.\n\n• Diamètre 32 cm\n• Céramique émaillée\n• Compatible lave-vaisselle",
 "dar":"طبق تقديم مطلي ومرسوم يدوياً بنقشة الياسمين. كل قطعة فريدة.\n\n• القطر 32 سم\n• خزف مطلي\n• مناسب لغسالة الأطباق"},
{"slug":"tapis-kairouan-laine","sku":"ART-TAP-002","seller":"artisanat-carthage","cat":"decoration","fr":"Tapis Kairouan en laine","ar":"سجادة القيروان من الصوف","brand":"Artisanat Carthage","price":189,"cost":92,"condition":"new","status":"published","days":28,"img":"robe-ete-fleurie","stock":4,
 "dfr":"Tapis noué main en laine naturelle, motifs géométriques traditionnels de Kairouan.\n\n• 100 % laine\n• 120 × 180 cm\n• Noué à la main",
 "dar":"سجادة مصنوعة يدوياً من الصوف الطبيعي بنقوش هندسية تقليدية من القيروان.\n\n• صوف 100٪\n• 120 × 180 سم\n• مصنوعة يدوياً"},
{"slug":"miroir-bois-olivier","sku":"ART-MIR-003","seller":"artisanat-carthage","cat":"decoration","fr":"Miroir en bois d'olivier","ar":"مرآة من خشب الزيتون","brand":"Artisanat Carthage","price":129,"cost":58,"condition":"like_new","status":"published","days":21,"img":"bocaux-verre","stock":3,
 "dfr":"Miroir arrondi dans un cadre en bois d'olivier massif, finition huilée.\n\n• Diamètre 50 cm\n• Bois d'olivier local\n• Fixation murale incluse",
 "dar":"مرآة دائرية بإطار من خشب الزيتون الصلب بلمسة زيتية.\n\n• القطر 50 سم\n• خشب زيتون محلي\n• تثبيت حائطي مرفق"},
{"slug":"coussin-brode-main","sku":"ART-COU-004","seller":"artisanat-carthage","cat":"decoration","fr":"Coussin brodé main","ar":"وسادة مطرزة يدوياً","brand":"Artisanat Carthage","price":39,"cost":15,"condition":"good","status":"pending","days":2,"img":"savon-naturel","stock":8,
 "dfr":"Coussin en coton avec broderie florale faite main.\n\n• 45 × 45 cm\n• Housse déhoussable\n• Broderie artisanale",
 "dar":"وسادة قطنية بتطريز زهري يدوي.\n\n• 45 × 45 سم\n• غلاف قابل للنزع\n• تطريز حرفي"},
{"slug":"vase-terracotta","sku":"ART-VAS-005","seller":"artisanat-carthage","cat":"decoration","fr":"Vase en terracotta","ar":"مزهرية من الفخار","brand":"Artisanat Carthage","price":55,"cost":20,"condition":"acceptable","status":"rejected","days":4,"img":"theiere-ceramique","stock":0,
 "dfr":"Vase en terre cuite tourné main, idéal pour branches séchées.\n\n• Hauteur 28 cm\n• Terre cuite naturelle\n• Pièce unique",
 "dar":"مزهرية من الطين المشوي يدوياً، مناسبة للأغصان الجافة.\n\n• الارتفاع 28 سم\n• طين طبيعي\n• قطعة فريدة"},
{"slug":"set-6-verres-the","sku":"ART-VER-006","seller":"artisanat-carthage","cat":"cuisine","fr":"Set de 6 verres à thé","ar":"طقم 6 كؤوس شاي","brand":"Artisanat Carthage","price":49,"cost":22,"condition":"new","status":"published","days":18,"img":"bocaux-verre","stock":20,
 "dfr":"Six verres à thé gravés à la main, parfaits pour le thé à la menthe.\n\n• 6 pièces\n• Verre épais\n• Motifs gravés",
 "dar":"ستة كؤوس شاي محفورة يدوياً، مثالية لشاي بالنعناع.\n\n• 6 قطع\n• زجاج سميك\n• نقوش محفورة"},
{"slug":"tableau-mosaique-tunis","sku":"NAB-MOS-001","seller":"maison-nabeul","cat":"decoration","fr":"Tableau en mosaïque de Tunis","ar":"لوحة فسيفساء تونسية","brand":"Maison Nabeul","price":149,"cost":70,"condition":"new","status":"published","days":25,"img":"robe-ete-fleurie","stock":5,
 "dfr":"Tableau mural en mosaïque artisanale, inspiré des zelliges de la Médina.\n\n• 40 × 30 cm\n• Mosaïque émaillée\n• Accroche incluse",
 "dar":"لوحة جدارية من الفسيفساء الحرفية مستوحاة من زليج المدينة.\n\n• 40 × 30 سم\n• فسيفساء مطلي\n• تعليق مرفق"},
{"slug":"lanterne-cuivre","sku":"NAB-LAN-002","seller":"maison-nabeul","cat":"decoration","fr":"Lanterne en cuivre","ar":"فانوس نحاسي","brand":"Maison Nabeul","price":89,"cost":38,"condition":"new","status":"published","days":17,"img":"theiere-ceramique","stock":7,
 "dfr":"Lanterne en cuivre martelé avec verre dépoli, lumière chaude garantie.\n\n• Hauteur 35 cm\n• Cuivre martelé main\n• Verre dépoli",
 "dar":"فانوس من النحاس المطرق بزجاج مصنفر، لإضاءة دافئة.\n\n• الارتفاع 35 سم\n• نحاس مطروق يدوياً\n• زجاج مصنفر"},
{"slug":"panier-osier","sku":"NAB-PAN-003","seller":"maison-nabeul","cat":"decoration","fr":"Panier en osier tressé","ar":"سلة من الخيزران","brand":"Maison Nabeul","price":59,"cost":24,"condition":"good","status":"paused","days":14,"img":"bocaux-verre","stock":9,
 "dfr":"Grand panier en osier tressé main, pour rangements ou sorties au marché.\n\n• 45 × 35 cm\n• Osier naturel\n• Anses renforcées",
 "dar":"سلة كبيرة من الخيزران المنسوج يدوياً للتخزين أو السوق.\n\n• 45 × 35 سم\n• خيزران طبيعي\n• مقابض مقواة"},
{"slug":"assiette-faience","sku":"NAB-ASS-004","seller":"maison-nabeul","cat":"cuisine","fr":"Assiette en faïence peinte","ar":"طبق فخاري مرسوم","brand":"Maison Nabeul","price":35,"cost":14,"condition":"like_new","status":"published","days":12,"img":"savon-naturel","stock":15,
 "dfr":"Assiette en faïence au motif bleu traditionnel, parfaite pour le service.\n\n• Diamètre 26 cm\n• Faïence émaillée\n• Motif peint main",
 "dar":"طبق فخاري بنقشة زرقاء تقليدية، مثالي للتقديم.\n\n• القطر 26 سم\n• فخار مطلي\n• نقشة مرسومة يدوياً"},
{"slug":"boite-bois-sculpte","sku":"NAB-BOI-005","seller":"maison-nabeul","cat":"decoration","fr":"Boîte en bois sculpté","ar":"صندوق خشبي منقوش","brand":"Maison Nabeul","price":75,"cost":30,"condition":"new","status":"draft","days":1,"img":"chemise-lin","stock":0,
 "dfr":"Boîte de rangement en bois d'olivier sculptée à la main.\n\n• 20 × 15 cm\n• Bois massif\n• Fermeture aimantée",
 "dar":"صندوق تخزين من خشب الزيتون المنقوش يدوياً.\n\n• 20 × 15 سم\n• خشب صلب\n• إغلاق مغناطيسي"},
{"slug":"tapis-berbere-rouge","sku":"KAI-TAP-001","seller":"atelier-kairouan","cat":"decoration","fr":"Tapis berbère rouge","ar":"سجادة أمازيغية حمراء","brand":"Atelier Kairouan","price":249,"cost":120,"condition":"new","status":"published","days":30,"img":"robe-ete-fleurie","stock":3,
 "dfr":"Tapis berbère noué main aux teintes rouges et indigo, pièce unique.\n\n• 100 % laine\n• 150 × 200 cm\n• Teintures naturelles",
 "dar":"سجادة أمازيغية مصنوعة يدوياً بألوان حمراء ونيلية، قطعة فريدة.\n\n• صوف 100٪\n• 150 × 200 سم\n• أصباغ طبيعية"},
{"slug":"couverture-laine-kairouan","sku":"KAI-COU-002","seller":"atelier-kairouan","cat":"decoration","fr":"Couverture en laine de Kairouan","ar":"بطانية صوف من القيروان","brand":"Atelier Kairouan","price":159,"cost":72,"condition":"good","status":"published","days":22,"img":"sweat-capuche","stock":6,
 "dfr":"Couverture chaude en laine tissée, parfaite pour les soirées d'hiver.\n\n• 130 × 190 cm\n• Laine locale\n• Tissage traditionnel",
 "dar":"بطانية دافئة من الصوف المنسوج، مثالية لأمسيات الشتاء.\n\n• 130 × 190 سم\n• صوف محلي\n• نسج تقليدي"},
{"slug":"coussin-tissage-raye","sku":"KAI-CUS-003","seller":"atelier-kairouan","cat":"decoration","fr":"Coussin en tissage rayé","ar":"وسادة بنسيج مخطط","brand":"Atelier Kairouan","price":45,"cost":18,"condition":"like_new","status":"published","days":11,"img":"savon-naturel","stock":11,
 "dfr":"Coussin tissé main aux rayures terracotta et crème.\n\n• 45 × 45 cm\n• Laine et coton\n• Fermeture zippée",
 "dar":"وسادة منسوجة يدوياً بخطوط تيراكوتا وكريمية.\n\n• 45 × 45 سم\n• صوف وقطن\n• سحاب"},
{"slug":"tapis-couloir-raye","sku":"KAI-TAP-004","seller":"atelier-kairouan","cat":"decoration","fr":"Tapis de couloir rayé","ar":"سجادة ممر مخططة","brand":"Atelier Kairouan","price":119,"cost":50,"condition":"acceptable","status":"archived","days":40,"img":"robe-ete-fleurie","stock":2,
 "dfr":"Tapis de couloir étroit, rayures multicolores et franges nouées.\n\n• 80 × 200 cm\n• Laine mélangée\n• Franges nouées main",
 "dar":"سجادة ممر ضيقة بخطوط متعددة الألوان وأهداب معقودة.\n\n• 80 × 200 سم\n• صوف مخلوط\n• أهداب معقودة يدوياً"}
]$json$::jsonb;
  p jsonb;
  v_seller public.seller_profiles;
  v_seller_user uuid;
  v_pid uuid;
  v_vid uuid;
  v_stock int;
  v_mod public.moderation_action;
begin
  for p in select * from jsonb_array_elements(d) loop
    select * into v_seller from public.seller_profiles where shop_slug = p->>'seller';
    if not found then raise exception 'seed: seller % not found', p->>'seller'; end if;
    select user_id into v_seller_user from public.seller_profiles where id = v_seller.id;

    v_pid := md5('seller-prod-' || (p->>'slug'))::uuid;
    continue when exists (select 1 from public.products where id = v_pid or slug = p->>'slug' or sku = p->>'sku');

    insert into public.products (
      id, category_id, name_fr, name_ar, slug, sku, description_fr, description_ar,
      brand, price, status, has_variants, is_featured, seller_id, condition,
      submitted_at, approved_at, approved_by, moderation_feedback, published_at,
      created_at, updated_at
    ) values (
      v_pid, md5('cat-' || (p->>'cat'))::uuid, p->>'fr', p->>'ar', p->>'slug', p->>'sku',
      p->>'dfr', p->>'dar', p->>'brand', (p->>'price')::numeric,
      (p->>'status')::public.product_status, false, false, v_seller.id,
      nullif(p->>'condition', '')::public.listing_condition,
      now() - make_interval(days => (p->>'days')::int),
      case when p->>'status' in ('published', 'paused', 'archived')
           then now() - make_interval(days => (p->>'days')::int) end,
      case when p->>'status' in ('published', 'paused', 'archived')
           then 'a0000000-0000-0000-0000-000000000001'::uuid end,
      case when p->>'status' = 'rejected'
           then 'Photos trop sombres et description incomplète. Merci de rajouter des dimensions précises.' end,
      case when p->>'status' in ('published', 'paused', 'archived')
           then now() - make_interval(days => (p->>'days')::int) end,
      now() - make_interval(days => (p->>'days')::int),
      now()
    );

    insert into public.product_private (product_id, purchase_price, internal_notes)
    values (v_pid, (p->>'cost')::numeric, 'Coût vendeur (démo)');

    insert into public.product_images (product_id, url, alt, position)
    values (v_pid, '/demo/' || (p->>'img') || '.jpg', p->>'fr', 0);

    v_vid := md5('seller-var-' || (p->>'sku'))::uuid;
    insert into public.product_variants (
      id, product_id, sku, price, is_active, is_default, position,
      combination_key
    ) values (
      v_vid, v_pid, p->>'sku', (p->>'price')::numeric,
      p->>'status' = 'published', true, 0, 'v:' || v_vid::text
    );

    v_stock := coalesce((p->>'stock')::int, 0);
    if v_stock > 0 then
      perform public._move_stock(
        v_vid, null, 'available', v_stock, 'initial',
        'Stock initial vendeur (démo)', null, null, v_seller_user
      );
    end if;

    insert into public.listing_moderation_history (product_id, action, note, actor_id, created_at)
    values (v_pid, 'submitted', 'Annonce soumise', v_seller_user,
            now() - make_interval(days => (p->>'days')::int));

    if p->>'status' in ('published', 'paused', 'archived') then
      insert into public.listing_moderation_history (product_id, action, note, actor_id, created_at)
      values (v_pid, 'approved', 'Annonce validée', 'a0000000-0000-0000-0000-000000000001',
              now() - make_interval(days => (p->>'days')::int) + interval '2 hours');
    elsif p->>'status' = 'rejected' then
      insert into public.listing_moderation_history (product_id, action, note, actor_id, created_at)
      values (v_pid, 'rejected', 'Photos trop sombres et description incomplète.',
              'a0000000-0000-0000-0000-000000000001',
              now() - make_interval(days => (p->>'days')::int) + interval '2 hours');
    end if;

    if p->>'status' = 'paused' then
      insert into public.listing_moderation_history (product_id, action, note, actor_id, created_at)
      values (v_pid, 'paused', 'Mise en pause vendeur', v_seller_user, now() - interval '2 days');
    elsif p->>'status' = 'archived' then
      insert into public.listing_moderation_history (product_id, action, note, actor_id, created_at)
      values (v_pid, 'archived', 'Annonce archivée', v_seller_user, now() - interval '5 days');
    end if;
  end loop;
end $seed$;

-- ---------- 4. ORDERS — CREATED THROUGH THE REAL RPC ----------
create temp table if not exists seed_order_specs (
  sort_order int primary key,
  key text not null unique,
  user_id uuid,
  full_name text not null,
  email text,
  phone text not null,
  city text not null,
  address text not null,
  items jsonb not null,
  target public.order_status not null,
  paid boolean not null,
  days_ago int not null
) on commit drop;
truncate seed_order_specs;

insert into seed_order_specs
  (sort_order, key, user_id, full_name, email, phone, city, address, items, target, paid, days_ago)
values
  (1, 'o1', 'a0000000-0000-0000-0000-000000000003', 'Yassine Trabelsi', 'client@weshop.tn', '+216 98 123 456', 'Tunis', '12 Avenue Habib Bourguiba, Apt 4B',
   '[{"sku":"ART-CER-001","qty":1},{"sku":"ART-TAP-002","qty":1},{"sku":"WS-TS-001-M-NOIR","qty":2}]', 'delivered', true, 20),
  (2, 'o2', 'a0000000-0000-0000-0000-000000000003', 'Yassine Trabelsi', 'client@weshop.tn', '+216 98 123 456', 'Ariana', 'Pôle Technologique El Ghazala, Bloc B2',
   '[{"sku":"NAB-ASS-004","qty":2}]', 'shipped', false, 2),
  (3, 'o3', 'a0000000-0000-0000-0000-000000000003', 'Yassine Trabelsi', 'client@weshop.tn', '+216 98 123 456', 'Tunis', '12 Avenue Habib Bourguiba, Apt 4B',
   '[{"sku":"KAI-COU-002","qty":1},{"sku":"ART-VER-006","qty":1}]', 'confirmed', false, 1),
  (4, 'o4', 'a0000000-0000-0000-0000-000000000003', 'Yassine Trabelsi', 'client@weshop.tn', '+216 98 123 456', 'Tunis', '12 Avenue Habib Bourguiba, Apt 4B',
   '[{"sku":"ART-MIR-003","qty":1}]', 'cancelled', false, 6),
  (5, 'o5', 'a0000000-0000-0000-0000-000000000004', 'Sarra Mansour', 'sarra@weshop.tn', '+216 22 789 012', 'Sousse', '45 Boulevard du 14 Janvier, Khezama Est',
   '[{"sku":"NAB-LAN-002","qty":1},{"sku":"WS-RB-004-M","qty":1}]', 'delivered', true, 6),
  (6, 'o6', 'a0000000-0000-0000-0000-000000000004', 'Sarra Mansour', 'sarra@weshop.tn', '+216 22 789 012', 'Sousse', '45 Boulevard du 14 Janvier, Khezama Est',
   '[{"sku":"ART-TAP-002","qty":1}]', 'pending', false, 0),
  (7, 'o7', 'a0000000-0000-0000-0000-000000000004', 'Sarra Mansour', 'sarra@weshop.tn', '+216 22 789 012', 'Sousse', '45 Boulevard du 14 Janvier, Khezama Est',
   '[{"sku":"KAI-CUS-003","qty":2}]', 'out_for_delivery', false, 1),
  (8, 'o8', null, 'Anis Ben Salah', 'anis@gmail.com', '+216 55 432 109', 'Sfax', 'Route de Téniour km 3',
   '[{"sku":"NAB-MOS-001","qty":1},{"sku":"ART-MIR-003","qty":1}]', 'delivered', true, 30),
  (9, 'o9', 'a0000000-0000-0000-0000-000000000010', 'Ines Gharbi', 'ines@weshop.tn', '+216 94 567 890', 'Monastir', '8 Rue du Ribat, Apt 2',
   '[{"sku":"KAI-TAP-001","qty":1},{"sku":"ART-CER-001","qty":1}]', 'delivered', false, 3),
  (10, 'o10', 'a0000000-0000-0000-0000-000000000010', 'Ines Gharbi', 'ines@weshop.tn', '+216 94 567 890', 'Monastir', '8 Rue du Ribat, Apt 2',
   '[{"sku":"NAB-ASS-004","qty":1}]', 'pending', false, 0),
  (11, 'o11', 'a0000000-0000-0000-0000-000000000011', 'Mehdi Ayari', 'mehdi@weshop.tn', '+216 97 678 901', 'Gabès', 'Route de Médenine km 2, Maison Ayari',
   '[{"sku":"ART-VER-006","qty":2},{"sku":"NAB-LAN-002","qty":1}]', 'delivered', true, 4),
  (12, 'o12', 'a0000000-0000-0000-0000-000000000011', 'Mehdi Ayari', 'mehdi@weshop.tn', '+216 97 678 901', 'Gabès', 'Route de Médenine km 2, Maison Ayari',
   '[{"sku":"KAI-COU-002","qty":1}]', 'preparing', false, 1),
  (13, 'o13', 'a0000000-0000-0000-0000-000000000012', 'Awa Diallo', 'awa@weshop.tn', '+216 55 789 012', 'Djerba', 'Houmt Souk, Rue des Palmiers',
   '[{"sku":"NAB-MOS-001","qty":1}]', 'delivered', false, 3),
  (14, 'o14', 'a0000000-0000-0000-0000-000000000012', 'Awa Diallo', 'awa@weshop.tn', '+216 55 789 012', 'Djerba', 'Houmt Souk, Rue des Palmiers',
   '[{"sku":"KAI-TAP-001","qty":1}]', 'delivered', true, 20),
  (15, 'o15', 'a0000000-0000-0000-0000-000000000013', 'Karim Bouzid', 'karim.b@weshop.tn', '+216 56 890 123', 'Bizerte', '18 Rue de la Plage, Bizerte',
   '[{"sku":"ART-CER-001","qty":2},{"sku":"ART-VER-006","qty":1}]', 'delivered', true, 10),
  (16, 'o16', 'a0000000-0000-0000-0000-000000000013', 'Karim Bouzid', 'karim.b@weshop.tn', '+216 56 890 123', 'Bizerte', '18 Rue de la Plage, Bizerte',
   '[{"sku":"NAB-ASS-004","qty":1},{"sku":"KAI-CUS-003","qty":1}]', 'pending', false, 0);

create temp table if not exists seed_orders (
  key text primary key,
  order_id uuid not null,
  target public.order_status not null,
  paid boolean not null,
  days_ago int not null
) on commit drop;
truncate seed_orders;

-- act as a given user inside this migration transaction
create or replace function pg_temp.seed_act_as(_uid uuid)
returns void language plpgsql as $$
begin
  if _uid is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', _uid::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
  end if;
end $$;

do $$
declare
  s record;
  v_items jsonb;
  v_res jsonb;
  v_missing int;
begin
  for s in select * from seed_order_specs order by sort_order loop
    perform pg_temp.seed_act_as(s.user_id);

    select jsonb_agg(jsonb_build_object('variant_id', v.id, 'quantity', i.qty) order by v.id),
           count(*) filter (where v.id is null)
      into v_items, v_missing
    from jsonb_to_recordset(s.items) as i(sku text, qty int)
    left join public.product_variants v on v.sku = i.sku;

    if v_items is null or v_missing > 0 then
      raise exception 'seed: order % has an unknown SKU', s.key;
    end if;

    v_res := public.create_order(
      s.full_name, s.phone, s.city, s.address, null, s.email, v_items, null, false
    );

    insert into seed_orders(key, order_id, target, paid, days_ago)
    values (s.key, (v_res->>'order_id')::uuid, s.target, s.paid, s.days_ago);
  end loop;
end $$;

-- progress orders exactly like the admin/seller UI does
do $$
declare
  o record;
  v_total numeric;
  v_admin uuid := 'a0000000-0000-0000-0000-000000000001';
begin
  perform pg_temp.seed_act_as(v_admin);
  for o in select * from seed_orders order by days_ago desc, key loop
    if o.target = 'cancelled' then
      perform public._apply_order_status(o.order_id, 'cancelled', 'Annulation démo', v_admin);
    elsif o.target = 'confirmed' then
      perform public._apply_order_status(o.order_id, 'confirmed', 'Commande confirmée', v_admin);
    elsif o.target = 'preparing' then
      perform public._apply_order_status(o.order_id, 'confirmed', 'Commande confirmée', v_admin);
      perform public._apply_order_status(o.order_id, 'preparing', 'Préparation en cours', v_admin);
    elsif o.target = 'shipped' then
      perform public._apply_order_status(o.order_id, 'confirmed', 'Commande confirmée', v_admin);
      perform public._apply_order_status(o.order_id, 'preparing', 'Préparation en cours', v_admin);
      perform public._apply_order_status(o.order_id, 'shipped', 'Colis remis au livreur', v_admin);
    elsif o.target = 'out_for_delivery' then
      perform public._apply_order_status(o.order_id, 'confirmed', 'Commande confirmée', v_admin);
      perform public._apply_order_status(o.order_id, 'preparing', 'Préparation en cours', v_admin);
      perform public._apply_order_status(o.order_id, 'shipped', 'Colis remis au livreur', v_admin);
      perform public._apply_order_status(o.order_id, 'out_for_delivery', 'En cours de livraison', v_admin);
    elsif o.target = 'delivered' then
      perform public._apply_order_status(o.order_id, 'confirmed', 'Commande confirmée', v_admin);
      perform public._apply_order_status(o.order_id, 'preparing', 'Préparation en cours', v_admin);
      perform public._apply_order_status(o.order_id, 'shipped', 'Colis remis au livreur', v_admin);
      perform public._apply_order_status(o.order_id, 'delivered', 'Livraison effectuée', v_admin);
    end if;

    if o.paid and o.target = 'delivered' then
      select total into v_total from public.orders where id = o.order_id;
      perform public.collect_cod_payment(
        o.order_id, v_total, 'Livreur Express ' || o.key,
        now() - make_interval(days => o.days_ago) + interval '2 days 3 hours',
        'Encaissement démo'
      );
    end if;
  end loop;
end $$;

-- backdate the generated records so charts and settlement windows look real
do $$
declare
  o record;
  v_created timestamptz;
begin
  for o in select * from seed_orders loop
    v_created := now() - make_interval(days => o.days_ago);

    update public.orders set
      created_at = v_created,
      confirmed_at = case when target in ('confirmed','preparing','shipped','out_for_delivery','delivered','cancelled')
                          then v_created + interval '2 hours' end,
      shipped_at = case when target in ('shipped','out_for_delivery','delivered')
                        then v_created + interval '1 day' end,
      delivered_at = case when target = 'delivered' then v_created + interval '2 days' end,
      cancelled_at = case when target = 'cancelled' then v_created + interval '3 hours' end,
      updated_at = v_created + interval '2 days'
    from seed_orders s
    where orders.id = s.order_id;

    update public.seller_order_groups set
      created_at = v_created,
      delivered_at = case when status = 'delivered' then v_created + interval '2 days' end,
      updated_at = v_created + interval '2 days'
    where order_id = o.order_id;

    with ranked as (
      select id, row_number() over (order by created_at, id) as rn
      from public.order_status_history
      where order_id = o.order_id
    )
    update public.order_status_history h
    set created_at = v_created + (r.rn - 1) * interval '6 hours'
    from ranked r
    where h.id = r.id;

    with ranked as (
      select h.id, row_number() over (order by h.created_at, h.id) as rn
      from public.seller_order_status_history h
      join public.seller_order_groups g on g.id = h.seller_group_id
      where g.order_id = o.order_id
    )
    update public.seller_order_status_history h
    set created_at = v_created + (r.rn - 1) * interval '6 hours'
    from ranked r
    where h.id = r.id;

    update public.cash_collections set
      collected_at = v_created + interval '2 days 3 hours',
      created_at = v_created + interval '2 days 3 hours'
    where order_id = o.order_id;

    update public.finance_entries set created_at = v_created + interval '2 days'
    where order_id = o.order_id;

    update public.notifications n set created_at = v_created + interval '2 days'
    from public.orders ord
    where ord.id = o.order_id
      and n.user_id = ord.user_id
      and n.title = 'Commande ' || ord.reference;
  end loop;
end $$;

-- ---------- 5. PRODUCT REVIEWS ----------
-- Inserted after the orders so `has_purchased()` marks them as verified.
do $$
declare
  r record;
  v_product uuid;
begin
  for r in
    select * from (values
      ('a0000000-0000-0000-0000-000000000003'::uuid, 'ART-CER-001', 5, 'Le plat est encore plus beau en vrai. Emballage impeccable, livraison rapide à Tunis.', 8),
      ('a0000000-0000-0000-0000-000000000003'::uuid, 'ART-TAP-002', 5, 'Tapis magnifique, couleurs profondes et tissage très soigné. Un vrai coup de cœur.', 7),
      ('a0000000-0000-0000-0000-000000000003'::uuid, 'WS-TS-001-M-NOIR', 4, 'T-shirt confortable et coton agréable. Taille un peu grande, prenez votre taille habituelle.', 6),
      ('a0000000-0000-0000-0000-000000000004'::uuid, 'NAB-LAN-002', 5, 'La lanterne donne une lumière superbe sur la terrasse. Très bien emballée.', 5),
      ('a0000000-0000-0000-0000-000000000004'::uuid, 'WS-RB-004-M', 5, 'Robe légère et coupe parfaite pour l''été. Livraison à Sousse en 2 jours.', 5),
      ('a0000000-0000-0000-0000-000000000010'::uuid, 'KAI-TAP-001', 4, 'Tapis authentique et chaleureux. Les franges sont bien finies. Il perd un peu de laine au début.', 2),
      ('a0000000-0000-0000-0000-000000000011'::uuid, 'ART-VER-006', 5, 'Verres solides et jolis, parfaits pour le thé. Je recommande ce vendeur.', 3),
      ('a0000000-0000-0000-0000-000000000011'::uuid, 'NAB-LAN-002', 4, 'Belle finition, un peu plus petite que sur la photo mais très jolie.', 3),
      ('a0000000-0000-0000-0000-000000000012'::uuid, 'NAB-MOS-001', 5, 'Le tableau est superbe dans mon salon. Travail artisanal remarquable.', 1),
      ('a0000000-0000-0000-0000-000000000012'::uuid, 'KAI-TAP-001', 5, 'Deuxième achat chez cet atelier, qualité toujours au rendez-vous.', 18),
      ('a0000000-0000-0000-0000-000000000013'::uuid, 'ART-CER-001', 4, 'Très joli plat, un petit éclat sur le bord mais le vendeur a proposé un geste commercial.', 9),
      ('a0000000-0000-0000-0000-000000000013'::uuid, 'ART-VER-006', 5, 'Exactement ce que je cherchais. Emballage soigné.', 8)
    ) as t(user_id, sku, rating, comment, days_ago)
  loop
    select product_id into v_product from public.product_variants where sku = r.sku limit 1;
    if v_product is null then continue; end if;

    perform pg_temp.seed_act_as(r.user_id);
    insert into public.reviews (product_id, user_id, rating, comment, is_verified, status, created_at)
    values (v_product, r.user_id, r.rating, r.comment, true, 'published', now() - make_interval(days => r.days_ago))
    on conflict (product_id, user_id) do nothing;
  end loop;
end $$;

-- ---------- 6. RETURNS AT EVERY STAGE ----------
create temp table if not exists seed_returns (
  key text primary key,
  order_key text not null,
  sku text not null,
  customer_id uuid not null,
  reason text not null,
  description text not null,
  processing text not null,
  condition public.return_condition
) on commit drop;
truncate seed_returns;

insert into seed_returns (key, order_key, sku, customer_id, reason, description, processing, condition)
values
  ('r1', 'o5', 'NAB-LAN-002', 'a0000000-0000-0000-0000-000000000004', 'Article différent', 'La lanterne est plus petite que prévu, je souhaite la retourner.', 'processed', 'resalable'),
  ('r2', 'o9', 'KAI-TAP-001', 'a0000000-0000-0000-0000-000000000010', 'Défaut', 'Une frange est décousue sur le côté. Photos envoyées.', 'requested', null),
  ('r3', 'o11', 'ART-VER-006', 'a0000000-0000-0000-0000-000000000011', 'Changement d''avis', 'Finalement je préfère un autre modèle, les verres sont intacts.', 'approved', null),
  ('r4', 'o13', 'NAB-MOS-001', 'a0000000-0000-0000-0000-000000000012', 'Ne correspond pas', 'Les couleurs sont plus foncées que sur les photos.', 'rejected', null),
  ('r5', 'o15', 'ART-CER-001', 'a0000000-0000-0000-0000-000000000013', 'Article endommagé', 'Un plat est arrivé avec un éclat sur le bord.', 'received', null);

create temp table if not exists seed_return_ids (
  key text primary key,
  return_id uuid not null
) on commit drop;
truncate seed_return_ids;

do $$
declare
  r record;
  o record;
  v_item_id uuid;
  v_res jsonb;
  v_ret uuid;
  v_ri record;
  v_seller_id uuid;
  v_seller_user uuid;
  v_admin uuid := 'a0000000-0000-0000-0000-000000000001';
begin
  for r in select * from seed_returns loop
    select * into o from seed_orders where key = r.order_key;

    select oi.id into v_item_id
    from public.order_items oi
    where oi.order_id = o.order_id and oi.sku = r.sku
    limit 1;
    if v_item_id is null then raise exception 'seed: return % item % not found', r.key, r.sku; end if;

    perform pg_temp.seed_act_as(r.customer_id);
    v_res := public.request_return(
      o.order_id,
      jsonb_build_array(jsonb_build_object('order_item_id', v_item_id, 'quantity', 1)),
      r.reason, r.description, array[]::text[]
    );
    v_ret := (v_res->>'return_id')::uuid;
    insert into seed_return_ids(key, return_id) values (r.key, v_ret);

    perform pg_temp.seed_act_as(v_admin);
    if r.processing in ('approved', 'received', 'processed') then
      perform public.update_return_status(v_ret, 'approved', 'Retour accepté — merci de renvoyer l''article.');
    end if;
    if r.processing in ('received', 'processed') then
      perform public.update_return_status(v_ret, 'received', 'Colis reçu par l''atelier.');
    end if;
    if r.processing = 'processed' then
      select jsonb_agg(jsonb_build_object('return_item_id', ri.id, 'condition', r.condition))
        into v_res
      from public.return_items ri where ri.return_id = v_ret;
      perform public.process_return(v_ret, v_res, 'Retour traité et article remis en stock.');
    elsif r.processing = 'rejected' then
      perform public.update_return_status(v_ret, 'rejected', 'Article non éligible : couleurs conformes aux photos.');
    end if;

    -- a seller note on returns that belong to a single shop
    select oi.seller_id into v_seller_id
    from public.return_items ri
    join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = v_ret
    limit 1;

    if v_seller_id is not null then
      select user_id into v_seller_user from public.seller_profiles where id = v_seller_id;
      perform pg_temp.seed_act_as(v_seller_user);
      insert into public.seller_return_notes (return_id, seller_id, note, author_id)
      values (v_ret, v_seller_id,
              case when r.processing = 'processed'
                   then 'Article contrôlé : remis en vente, aucune casse.'
                   else 'Bien reçu, nous revenons vers le client rapidement.' end,
              v_seller_user)
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- ---------- 6. SELLER SETTLEMENTS ----------
do $$
declare
  v_admin uuid := 'a0000000-0000-0000-0000-000000000001';
  v_res jsonb;
  v_id uuid;
  v_net numeric;
  v_seller uuid;
  s record;
begin
  perform pg_temp.seed_act_as(v_admin);

  for s in
    select * from (values
      ('c1000000-0000-0000-0000-000000000001'::uuid, 'paid'),
      ('c1000000-0000-0000-0000-000000000002'::uuid, 'partial'),
      ('c1000000-0000-0000-0000-000000000003'::uuid, 'pending')
    ) as t(seller_id, payment)
  loop
    v_seller := s.seller_id;
    v_res := public.admin_create_settlement(v_seller, null, null, 'Règlement de démonstration');
    v_id := (v_res->>'settlement_id')::uuid;
    v_net := (v_res->>'net_amount')::numeric;

    if s.payment = 'paid' and v_net > 0 then
      perform public.admin_record_settlement_payment(v_id, v_net, 'Virement bancaire — démo');
    elsif s.payment = 'partial' and v_net > 0 then
      perform public.admin_record_settlement_payment(v_id, round(v_net / 2, 3), 'Acompte — démo');
    end if;
  end loop;
end $$;

-- ---------- 7. SELLER INVENTORY OPERATIONS ----------
do $$
declare
  v_seller_user uuid := 'a0000000-0000-0000-0000-000000000005';
  v_variant uuid;
begin
  perform pg_temp.seed_act_as(v_seller_user);

  select id into v_variant from public.product_variants where sku = 'ART-CER-001';
  if v_variant is not null then
    perform public.seller_adjust_inventory(v_variant, 'damage', 1, 'Casse lors du transport');
  end if;

  select id into v_variant from public.product_variants where sku = 'ART-VER-006';
  if v_variant is not null then
    perform public.seller_adjust_inventory(v_variant, 'restock', 6, 'Réassort atelier');
  end if;
end $$;

-- ---------- 8. RESET AUTH CONTEXT ----------
select pg_temp.seed_act_as(null);
drop function if exists pg_temp.seed_act_as(uuid);

-- ===== 0016_more_categories.sql =====
-- =========================================================
-- weshop: Enriched Categories & Subcategories Taxonomy
-- 0016_more_categories.sql
-- =========================================================

-- 1. ROOT CATEGORIES (8 verticals)
insert into public.categories (id, parent_id, name_fr, name_ar, slug, description_fr, description_ar, image_url, display_order, is_active)
values
  (md5('cat-mode')::uuid, null, 'Mode & Vêtements', 'موضة وأزياء', 'mode',
   'Prêt-à-porter pour hommes, femmes et enfants. Styles tendances et confort quotidien.',
   'أحدث صيحات الموضة للرجال والنساء والأطفال. أزياء مريحة وأنيقة لكل يوم.',
   '/demo/robe-ete-fleurie.jpg', 1, true),

  (md5('cat-electronique')::uuid, null, 'Électronique & High-Tech', 'إلكترونيات وتكنولوجيا', 'electronique',
   'Gadgets connectés, audio haute fidélité et accessoires mobiles.',
   'أحدث الأجهزة الذكية، سماعات احترافية وإكسسوارات الهواتف.',
   '/demo/ecouteurs-sans-fil.jpg', 2, true),

  (md5('cat-maison-cuisine')::uuid, null, 'Maison & Cuisine', 'المنزل والمطبخ', 'maison-cuisine',
   'Artisanat d''intérieur, vaisselle, rangements pratiques et petit électroménager.',
   'ديكورات داخلية أنيقة، أدوات مطبخ عصرية وحلول تخزين ذكية.',
   '/demo/theiere-ceramique.jpg', 3, true),

  (md5('cat-beaute')::uuid, null, 'Beauté & Bien-être', 'الجمال والعناية', 'beaute',
   'Soins naturels du visage, du corps et huiles précieuses de Méditerranée.',
   'منتجات عناية طبيعية بالبشرة والشعر، وزيوت نباتية نقية 100٪.',
   '/demo/huile-argan.jpg', 4, true),

  (md5('cat-artisanat-terroir')::uuid, null, 'Artisanat & Terroir', 'صناعات تقليدية ومنتجات محلية', 'artisanat-terroir',
   'Le savoir-faire authentique des artisans tunisiens : poterie, tissage et terroir.',
   'أصالة الصناعة التقليدية التونسية: فخار نابل، مرقوم القيروان ومنتجات التراث.',
   '/demo/theiere-ceramique.jpg', 5, true),

  (md5('cat-sport')::uuid, null, 'Sport & Fitness', 'رياضة ولياقة بدنية', 'sport-fitness',
   'Matériel d''entraînement, tenues sportives et accessoires outdoor.',
   'معدات التمارين الرياضية، ملابس رياضية مريحة ومستلزمات اللياقة.',
   '/demo/montre-connectee.jpg', 6, true),

  (md5('cat-bebe-enfants')::uuid, null, 'Bébés & Enfants', 'أطفال ورضع', 'bebes-enfants',
   'Vêtements doux pour bébés, puériculture et jeux d''éveil.',
   'ملابس قطنية ناعمة للمواليد، ألعاب ذكاء وتنمية المهارات ومستلزمات الأطفال.',
   '/demo/robe-ete-fleurie.jpg', 7, true),

  (md5('cat-livres-culture')::uuid, null, 'Livres & Papeterie', 'كتب وقرطاسية', 'livres-papeterie',
   'Romans passionnants, livres, carnets et stylos de calligraphie.',
   'روايات أدبية، كتب تطوير الذات، دفاتر ملاحظات فاخرة وأدوات خط عربي.',
   '/demo/theiere-ceramique.jpg', 8, true)
on conflict (id) do update set
  name_fr = excluded.name_fr,
  name_ar = excluded.name_ar,
  description_fr = excluded.description_fr,
  description_ar = excluded.description_ar,
  display_order = excluded.display_order;

-- 2. SUBCATEGORIES (34 subcategories)
insert into public.categories (id, parent_id, name_fr, name_ar, slug, description_fr, description_ar, image_url, display_order, is_active)
values
  -- Mode
  (md5('cat-t-shirts-sweats')::uuid, md5('cat-mode')::uuid, 'T-shirts & Sweats', 'تي شيرت وسويت شيرت', 't-shirts-sweats',
   'T-shirts en coton bio et sweats à capuche.', 'تي شيرت من القطن العضوي وسويت شيرت مريح.', '/demo/tshirt-coton-bio.jpg', 1, true),
  (md5('cat-chemises')::uuid, md5('cat-mode')::uuid, 'Chemises & Hauts', 'قمصان وبلوزات', 'chemises',
   'Chemises en lin léger et coupes modernes.', 'قمصان من الكتان الخفيف وقصات عصرية.', '/demo/chemise-lin.jpg', 2, true),
  (md5('cat-robes')::uuid, md5('cat-mode')::uuid, 'Robes & Jupes', 'فساتين وتنانير', 'robes',
   'Robes d''été fleuries et jupes élégantes.', 'فساتين صيفية مزهرة وتنانير مريحة.', '/demo/robe-ete-fleurie.jpg', 3, true),
  (md5('cat-pantalons')::uuid, md5('cat-mode')::uuid, 'Pantalons & Jeans', 'سراويل وجينز', 'pantalons-jeans',
   'Jeans en denim et pantalons chino.', 'سراويل جينز وبناطيل كاجوال.', '/demo/sweat-capuche.jpg', 4, true),
  (md5('cat-chaussures')::uuid, md5('cat-mode')::uuid, 'Chaussures & Baskets', 'أحذية وأحذية رياضية', 'chaussures',
   'Sneakers et chaussures en cuir.', 'أحذية رياضية وأحذية كلاسيكية.', '/demo/tshirt-coton-bio.jpg', 5, true),
  (md5('cat-maroquinerie')::uuid, md5('cat-mode')::uuid, 'Sacs & Maroquinerie', 'حقائب ومصنوعات جلدية', 'sacs-maroquinerie',
   'Sacs à main et maroquinerie en cuir véritable.', 'حقائب يد ومحافظ جلدية أصلية.', '/demo/robe-ete-fleurie.jpg', 6, true),

  -- Électronique
  (md5('cat-audio')::uuid, md5('cat-electronique')::uuid, 'Audio & Écouteurs', 'صوتيات وسماعات', 'audio',
   'Écouteurs sans fil et enceintes Bluetooth.', 'سماعات أذن لاسلكية ومكبرات صوت.', '/demo/ecouteurs-sans-fil.jpg', 1, true),
  (md5('cat-montres-accessoires')::uuid, md5('cat-electronique')::uuid, 'Montres Connectées', 'ساعات ذكية', 'montres-accessoires',
   'Montres connectées étanches et bracelets sport.', 'ساعات ذكية مقاومة للماء وأساور لياقة.', '/demo/montre-connectee.jpg', 2, true),
  (md5('cat-telephones-tablettes')::uuid, md5('cat-electronique')::uuid, 'Smartphones & Tablettes', 'هواتف وأجهزة لوحية', 'smartphones-tablettes',
   'Smartphones et tablettes multimédias.', 'هواتف ذكية وأجهزة لوحية.', '/demo/chargeur-rapide.jpg', 3, true),
  (md5('cat-accessoires-charge')::uuid, md5('cat-electronique')::uuid, 'Chargeurs & Câbles', 'شواحن وكابلات', 'chargeurs-cables',
   'Chargeurs ultra-rapides 30W et câbles renforcés.', 'شواحن سريعة وكابلات متينة.', '/demo/chargeur-rapide.jpg', 4, true),
  (md5('cat-gaming')::uuid, md5('cat-electronique')::uuid, 'Gaming & Jeux vidéo', 'ألعاب الفيديو وملحقاتها', 'gaming',
   'Accessoires gaming, manettes et claviers mécaniques.', 'إكسسوارات ألعاب ولوحات مفاتيح ميكانيكية.', '/demo/enceinte-bluetooth.jpg', 5, true),

  -- Maison & Cuisine
  (md5('cat-cuisine')::uuid, md5('cat-maison-cuisine')::uuid, 'Cuisine & Arts de la table', 'أدوات المطبخ ومائدة الطعام', 'cuisine',
   'Ustensiles de chef, théières et vaisselle.', 'أواني طبخ وأباريق شاي فاخرة.', '/demo/theiere-ceramique.jpg', 1, true),
  (md5('cat-rangement')::uuid, md5('cat-maison-cuisine')::uuid, 'Rangement & Organisation', 'تنظيم وترتيب المنزل', 'rangement',
   'Bocaux hermétiques et boîtes de rangement.', 'برطمانات زجاجية ومنظمات للمطبخ.', '/demo/bocaux-verre.jpg', 2, true),
  (md5('cat-decoration')::uuid, md5('cat-maison-cuisine')::uuid, 'Décoration d''intérieur', 'ديكور المنزل والتحف', 'decoration-interieur',
   'Vases, tableaux et bougies parfumées.', 'تحف زينة، لوحات وشموع معطرة.', '/demo/theiere-ceramique.jpg', 3, true),
  (md5('cat-linge-maison')::uuid, md5('cat-maison-cuisine')::uuid, 'Linge de lit & Bain', 'مفروشات ومناشف', 'linge-maison',
   'Parures de lit en coton et serviettes de bain.', 'مفروشات قطنية ومناشف فاخرة.', '/demo/chemise-lin.jpg', 4, true),

  -- Beauté
  (md5('cat-soins-visage')::uuid, md5('cat-beaute')::uuid, 'Soins du Visage', 'العناية بالوجه', 'soins-visage',
   'Sérums hydratants et nettoyants naturels.', 'سيرومات ترطيب ومستحضرات تنظيف الوجه.', '/demo/huile-argan.jpg', 1, true),
  (md5('cat-soins')::uuid, md5('cat-beaute')::uuid, 'Soins du Corps & Bain', 'العناية بالجسم والاستحمام', 'soins-corps',
   'Savons noirs, gommages et huiles nourrissantes.', 'صابون أسود تقليدي ومقشرات طبيعية للجسم.', '/demo/savon-naturel.jpg', 2, true),
  (md5('cat-cheveux')::uuid, md5('cat-beaute')::uuid, 'Soins Capillaires', 'العناية بالشعر', 'soins-capillaires',
   'Shampoings doux et huiles végétales pures.', 'شامبو طبيعي وزيوت لتغذية الشعر.', '/demo/huile-argan.jpg', 3, true),
  (md5('cat-parfums')::uuid, md5('cat-beaute')::uuid, 'Parfums & Brumes', 'عطور ومعطرات', 'parfums',
   'Eaux de parfum et brumes corporelles.', 'عطور فواحة ومعطرات جسم خفيفة.', '/demo/savon-naturel.jpg', 4, true),

  -- Artisanat & Terroir
  (md5('cat-poterie-nabeul')::uuid, md5('cat-artisanat-terroir')::uuid, 'Poterie & Céramique de Nabeul', 'خزف وفخار نابل', 'poterie-ceramique',
   'Plats en terre cuite et céramiques peintes à la main.', 'فخار أصيل وأواني خزفية مرسومة يدوياً.', '/demo/theiere-ceramique.jpg', 1, true),
  (md5('cat-bois-olivier')::uuid, md5('cat-artisanat-terroir')::uuid, 'Bois d''Olivier sculpté', 'خشب الزيتون المنحوت', 'bois-olivier',
   'Ustensiles artisanaux en bois d''olivier tunisien.', 'تحف وأواني منحوتة من خشب الزيتون.', '/demo/bocaux-verre.jpg', 2, true),
  (md5('cat-tapis-margoum')::uuid, md5('cat-artisanat-terroir')::uuid, 'Tapis & Margoum de Kairouan', 'زرابي ومرقوم القيروان', 'tapis-margoum',
   'Tapis berbères et margoums traditionnels.', 'زرابي من الصوف الطبيعي ومرقوم يدوي.', '/demo/chemise-lin.jpg', 3, true),
  (md5('cat-terroir-tunisien')::uuid, md5('cat-artisanat-terroir')::uuid, 'Produits du Terroir & Huile d''Olive', 'زيت زيتون ومؤونة تونسية', 'produits-terroir',
   'Huile d''olive extra vierge et miel naturel.', 'زيت زيتون بكر ممتاز وعسل طبيعي.', '/demo/huile-argan.jpg', 4, true),

  -- Sport
  (md5('cat-fitness-equipement')::uuid, md5('cat-sport')::uuid, 'Équipements de Musculation', 'معدات وأوزان رياضية', 'musculation-fitness',
   'Haltères, élastiques et tapis de sol.', 'أثقال وأحبال مقاومة للتمارين الرياضية.', '/demo/montre-connectee.jpg', 1, true),
  (md5('cat-sport-textile')::uuid, md5('cat-sport')::uuid, 'Vêtements & Baskets de Sport', 'أزياء رياضية وأحذية تمرين', 'textile-sport',
   'Tenues respirantes et baskets de fitness.', 'ملابس رياضية خفيفة وأحذية تدريب مريحة.', '/demo/tshirt-coton-bio.jpg', 2, true),
  (md5('cat-camping-outdoor')::uuid, md5('cat-sport')::uuid, 'Camping & Randonnée', 'تخييم ورحلات برية', 'camping-randonnee',
   'Sacs de couchage, tentes et gourdes isothermes.', 'معدات تخييم، خيام وقوارير حافظة للحرارة.', '/demo/enceinte-bluetooth.jpg', 3, true),

  -- Bébés & Enfants
  (md5('cat-mode-bebe')::uuid, md5('cat-bebe-enfants')::uuid, 'Vêtements Bébé & Enfant', 'ملابس الرضع والأطفال', 'mode-bebe-enfant',
   'Bodys en coton doux et pyjamas confortables.', 'ملابس قطنية مريحة للمواليد والأطفال.', '/demo/tshirt-coton-bio.jpg', 1, true),
  (md5('cat-jouets-eveil')::uuid, md5('cat-bebe-enfants')::uuid, 'Jeux & Jouets d''éveil', 'ألعاب تعليمية وترفيهية', 'jouets-eveil',
   'Jeux éducatifs, peluches et puzzles en bois.', 'ألعاب مونتيسوري تنمي مهارات الطفل.', '/demo/bocaux-verre.jpg', 2, true),

  -- Livres & Culture
  (md5('cat-litterature')::uuid, md5('cat-livres-culture')::uuid, 'Romans & Littérature', 'روايات وأدب', 'romans-litterature',
   'Romans contemporains et classiques littéraires.', 'أشهر الروايات والكتب الأدبية العربية والعالمية.', '/demo/theiere-ceramique.jpg', 1, true),
  (md5('cat-papeterie')::uuid, md5('cat-livres-culture')::uuid, 'Carnets & Fournitures de Bureau', 'أجندات ومستلزمات مكتبية', 'papeterie-bureau',
   'Agendas annuels, carnets et stylos de calligraphie.', 'أجندات سنوية راقية ودفاتر ملاحظات ممتازة.', '/demo/bocaux-verre.jpg', 2, true)
on conflict (id) do update set
  name_fr = excluded.name_fr,
  name_ar = excluded.name_ar,
  description_fr = excluded.description_fr,
  description_ar = excluded.description_ar,
  display_order = excluded.display_order;

-- ===== 0017_clothing_storefront.sql =====
-- Narrow the public storefront to its clothing collection.
update public.categories
set is_active = slug in ('mode', 't-shirts-sweats', 'chemises', 'robes')
where is_active is distinct from (slug in ('mode', 't-shirts-sweats', 'chemises', 'robes'));

update public.categories
set
  name_fr = 'Mode & Vêtements',
  name_ar = 'الملابس والأزياء',
  description_fr = 'Des essentiels bien coupés et des pièces faciles à porter, sélectionnés pour votre quotidien.',
  description_ar = 'قطع أساسية بتصاميم أنيقة وملابس مريحة تناسب يومك.',
  image_url = '/demo/robe-ete-fleurie.jpg'
where slug = 'mode';

update public.categories
set
  name_fr = 'T-shirts & Sweats',
  name_ar = 'تي شيرت وسويت شيرت',
  description_fr = 'Des essentiels en coton doux et des sweats confortables.',
  description_ar = 'قطع قطنية أساسية وسويت شيرت مريح.'
where slug = 't-shirts-sweats';

update public.categories
set
  name_fr = 'Chemises',
  name_ar = 'قمصان',
  description_fr = 'Chemises légères et hauts faciles à associer.',
  description_ar = 'قمصان خفيفة وقطع علوية سهلة التنسيق.',
  image_url = '/demo/chemise-lin.jpg'
where slug = 'chemises';

update public.categories
set
  name_fr = 'Robes & Jupes',
  name_ar = 'فساتين وتنانير',
  description_fr = 'Des silhouettes fluides pour les beaux jours et les sorties.',
  description_ar = 'إطلالات مريحة وأنيقة للأيام الجميلة والمناسبات.',
  image_url = '/demo/robe-ete-fleurie.jpg'
where slug = 'robes';

update public.products
set status = 'archived', updated_at = now()
where status = 'published'
  and category_id not in (
    select id
    from public.categories
    where slug in ('mode', 't-shirts-sweats', 'chemises', 'robes')
  );

-- ===== 0018_maison_noura_catalog.sql =====
-- Replace legacy marketplace demo content with the Maison Noura clothing catalog.

create or replace function public.reset_storefront_for_clothing()
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  delete from public.cash_collections;
  delete from public.return_items;
  delete from public.return_status_history;
  delete from public.seller_return_notes;
  delete from public.returns;
  delete from public.seller_settlement_items;
  delete from public.seller_settlement_payments;
  delete from public.seller_settlements;
  delete from public.seller_order_status_history;
  delete from public.seller_order_groups;
  delete from public.finance_entries;
  delete from public.order_items;
  delete from public.order_status_history;
  delete from public.order_notes;
  delete from public.orders;
  delete from public.reviews;
  delete from public.notifications;
  delete from public.addresses;
  delete from public.inventory_movements;
  delete from public.listing_moderation_history;
  delete from public.token_transactions;
  delete from public.token_balances;
  delete from public.seller_applications;
  delete from public.seller_status_history;
  delete from public.seller_application_fields;
  delete from public.seller_commission_settings where seller_id is not null;
  delete from public.product_attribute_values;
  delete from public.variant_attribute_values;
  delete from public.product_private;
  delete from public.product_images;
  delete from public.products;
  delete from public.seller_profiles;
  delete from public.promotions;
  delete from public.description_templates;
  update public.categories set parent_id = null where parent_id is not null;
  delete from public.categories;
  delete from public.profiles p
  where not exists (
    select 1
    from public.user_roles r
    where r.user_id = p.id and r.role in ('admin', 'staff')
  );
  delete from auth.users u
  where not exists (
    select 1
    from public.user_roles r
    where r.user_id = u.id and r.role in ('admin', 'staff')
  );
  delete from public.audit_logs;

  insert into public.store_settings (
    id, store_name, currency, delivery_fee, free_delivery_threshold,
    support_phone, support_email, default_low_stock_threshold, return_window_days,
    delivery_cities, announcement_fr, announcement_ar,
    default_commission_pct, commission_fixed_fee, reapprove_seller_edits,
    condition_options, seller_terms_fr, seller_terms_ar
  ) values (
    true, 'Maison Noura', 'TND', 8, 220,
    '+216 70 000 021', 'bonjour@maisonnoura.tn', 5, 14,
    array['Tunis','Ariana','Ben Arous','Manouba','Nabeul','Zaghouan','Bizerte','Béja','Jendouba','Le Kef','Siliana','Sousse','Monastir','Mahdia','Sfax','Kairouan','Kasserine','Sidi Bouzid','Gabès','Médenine','Tataouine','Gafsa','Tozeur','Kébili'],
    'Livraison offerte dès 220 DT — paiement à la livraison',
    'توصيل مجاني ابتداءً من 220 د.ت — الدفع عند الاستلام',
    0, 0, true, array['new'],
    'Une sélection de vêtements neufs, pensés pour durer.',
    'ملابس جديدة مختارة بعناية لتدوم طويلاً.'
  )
  on conflict (id) do update set
    store_name = excluded.store_name,
    currency = excluded.currency,
    delivery_fee = excluded.delivery_fee,
    free_delivery_threshold = excluded.free_delivery_threshold,
    support_phone = excluded.support_phone,
    support_email = excluded.support_email,
    default_low_stock_threshold = excluded.default_low_stock_threshold,
    return_window_days = excluded.return_window_days,
    delivery_cities = excluded.delivery_cities,
    announcement_fr = excluded.announcement_fr,
    announcement_ar = excluded.announcement_ar,
    default_commission_pct = excluded.default_commission_pct,
    commission_fixed_fee = excluded.commission_fixed_fee,
    reapprove_seller_edits = excluded.reapprove_seller_edits,
    condition_options = excluded.condition_options,
    seller_terms_fr = excluded.seller_terms_fr,
    seller_terms_ar = excluded.seller_terms_ar;

  update public.seller_commission_settings
  set commission_pct = 0, fixed_fee = 0, note = 'Configuration Maison Noura', created_by = null
  where seller_id is null;
  insert into public.seller_commission_settings (seller_id, commission_pct, fixed_fee, note)
  select null, 0, 0, 'Configuration Maison Noura'
  where not exists (
    select 1 from public.seller_commission_settings where seller_id is null
  );
end
$$;

revoke all on function public.reset_storefront_for_clothing() from public, anon, authenticated;
select public.reset_storefront_for_clothing();
drop function public.reset_storefront_for_clothing();
alter sequence public.order_ref_seq restart with 1001;
alter sequence public.return_ref_seq restart with 101;

insert into public.categories (
  id, parent_id, name_fr, name_ar, slug, description_fr, description_ar,
  image_url, display_order, is_active, allows_condition
) values
  (md5('cat-femme')::uuid, null, 'Femme', 'المرأة', 'femme',
   'Des silhouettes lumineuses, des matières naturelles et des coupes faciles à vivre.',
   'إطلالات مشرقة وخامات طبيعية وقصات مريحة لكل يوم.',
   '/demo/robe-ete-fleurie.jpg', 1, true, false),
  (md5('cat-homme')::uuid, null, 'Homme', 'الرجل', 'homme',
   'Des essentiels bien coupés pour une allure simple et affirmée.',
   'قطع أساسية بقصات متقنة وأناقة بسيطة وواثقة.',
   '/demo/chemise-lin.jpg', 2, true, false),
  (md5('cat-essentiels')::uuid, null, 'Essentiels', 'الأساسيات', 'essentiels',
   'Les pièces indispensables du vestiaire, choisies pour leur confort et leur tenue.',
   'قطع لا غنى عنها في خزانة الملابس، مختارة لراحتها وجودتها.',
   '/demo/tshirt-coton-bio.jpg', 3, true, false),
  (md5('cat-robes')::uuid, md5('cat-femme')::uuid, 'Robes', 'فساتين', 'robes',
   'Robes fluides et féminines, pensées pour les journées ensoleillées.',
   'فساتين انسيابية وأنثوية لأيام مشمسة.',
   '/demo/robe-ete-fleurie.jpg', 1, true, false),
  (md5('cat-chemises-femme')::uuid, md5('cat-femme')::uuid, 'Chemises & blouses', 'قمصان وبلوزات', 'chemises-femme',
   'Des chemises légères et des blouses aux détails délicats.',
   'قمصان خفيفة وبلوزات بتفاصيل أنيقة.',
   '/demo/chemise-lin.jpg', 2, true, false),
  (md5('cat-manteaux-femme')::uuid, md5('cat-femme')::uuid, 'Vestes & superpositions', 'سترات وقطع متعددة الطبقات', 'vestes-femme',
   'Des couches faciles à porter du matin au soir.',
   'قطع عملية يمكن ارتداؤها طوال اليوم.',
   '/demo/sweat-capuche.jpg', 3, true, false),
  (md5('cat-chemises-homme')::uuid, md5('cat-homme')::uuid, 'Chemises', 'قمصان', 'chemises-homme',
   'Des chemises respirantes aux lignes épurées.',
   'قمصان خفيفة بتصاميم أنيقة.',
   '/demo/chemise-lin.jpg', 1, true, false),
  (md5('cat-manteaux-homme')::uuid, md5('cat-homme')::uuid, 'Vestes & molleton', 'سترات وملابس قطنية', 'vestes-homme',
   'Des pièces confortables pour les journées plus fraîches.',
   'قطع مريحة للأيام الباردة.',
   '/demo/sweat-capuche.jpg', 2, true, false),
  (md5('cat-t-shirts-sweats')::uuid, md5('cat-essentiels')::uuid, 'T-shirts & sweats', 'تي شيرت وسويت شيرت', 't-shirts-sweats',
   'Des essentiels en coton doux et des sweats confortables.',
   'قطع قطنية أساسية وسويت شيرت مريح.',
   '/demo/tshirt-coton-bio.jpg', 1, true, false)
on conflict (id) do update set
  parent_id = excluded.parent_id,
  name_fr = excluded.name_fr,
  name_ar = excluded.name_ar,
  slug = excluded.slug,
  description_fr = excluded.description_fr,
  description_ar = excluded.description_ar,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  allows_condition = excluded.allows_condition;

insert into public.category_attributes (
  id, category_id, code, name_fr, name_ar, type, unit, is_required,
  is_filterable, is_searchable, is_variant, display_order
) values
  (md5('att-femme-taille')::uuid, md5('cat-femme')::uuid, 'taille', 'Taille', 'المقاس', 'dropdown', null, false, true, false, true, 1),
  (md5('att-femme-couleur')::uuid, md5('cat-femme')::uuid, 'couleur', 'Couleur', 'اللون', 'color', null, false, true, true, true, 2),
  (md5('att-femme-matiere')::uuid, md5('cat-femme')::uuid, 'matiere', 'Matière', 'الخامة', 'text', null, false, false, true, false, 3),
  (md5('att-femme-entretien')::uuid, md5('cat-femme')::uuid, 'entretien', 'Entretien', 'العناية', 'text', null, false, false, false, false, 4),
  (md5('att-homme-taille')::uuid, md5('cat-homme')::uuid, 'taille', 'Taille', 'المقاس', 'dropdown', null, false, true, false, true, 1),
  (md5('att-homme-couleur')::uuid, md5('cat-homme')::uuid, 'couleur', 'Couleur', 'اللون', 'color', null, false, true, true, true, 2),
  (md5('att-homme-matiere')::uuid, md5('cat-homme')::uuid, 'matiere', 'Matière', 'الخامة', 'text', null, false, false, true, false, 3),
  (md5('att-homme-entretien')::uuid, md5('cat-homme')::uuid, 'entretien', 'Entretien', 'العناية', 'text', null, false, false, false, false, 4),
  (md5('att-essentiels-taille')::uuid, md5('cat-essentiels')::uuid, 'taille', 'Taille', 'المقاس', 'dropdown', null, false, true, false, true, 1),
  (md5('att-essentiels-couleur')::uuid, md5('cat-essentiels')::uuid, 'couleur', 'Couleur', 'اللون', 'color', null, false, true, true, true, 2),
  (md5('att-essentiels-matiere')::uuid, md5('cat-essentiels')::uuid, 'matiere', 'Matière', 'الخامة', 'text', null, false, false, true, false, 3),
  (md5('att-essentiels-entretien')::uuid, md5('cat-essentiels')::uuid, 'entretien', 'Entretien', 'العناية', 'text', null, false, false, false, false, 4);

insert into public.category_attribute_options (
  id, attribute_id, value, label_fr, label_ar, color_hex, display_order
)
select
  md5('opt-' || roots.slug || '-taille-' || sizes.value)::uuid,
  md5('att-' || roots.slug || '-taille')::uuid,
  sizes.value, sizes.value, sizes.value, null, sizes.position
from (values ('femme'), ('homme'), ('essentiels')) as roots(slug)
cross join (values ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5)) as sizes(value, position)
union all
select
  md5('opt-' || roots.slug || '-couleur-' || colors.value)::uuid,
  md5('att-' || roots.slug || '-couleur')::uuid,
  colors.value, colors.label_fr, colors.label_ar, colors.color_hex, colors.position
from (values ('femme'), ('homme'), ('essentiels')) as roots(slug)
cross join (values
  ('ecru', 'Écru', 'عاجي', '#E9E0D2', 1),
  ('noir', 'Noir', 'أسود', '#252321', 2),
  ('sauge', 'Vert sauge', 'أخضر مريمي', '#9BA58D', 3),
  ('sable', 'Sable', 'رملي', '#C9B89F', 4),
  ('bleu-ciel', 'Bleu ciel', 'أزرق سماوي', '#A9C6D8', 5),
  ('terracotta', 'Terracotta', 'طوبي', '#B66B54', 6),
  ('olive', 'Olive', 'زيتوني', '#737A55', 7)
) as colors(value, label_fr, label_ar, color_hex, position);

insert into public.products (
  id, category_id, name_fr, name_ar, slug, sku, description_fr, description_ar,
  brand, model, price, promo_price, status, has_variants, is_featured, published_at
) values
  (
    md5('product-tshirt-coton-bio')::uuid, md5('cat-t-shirts-sweats')::uuid,
    'T-shirt signature en coton peigné', 'تي شيرت أساسي من القطن الممشط',
    'tshirt-coton-bio', 'MN-TEE-001',
    'La pièce essentielle du quotidien. Une coupe nette, un coton peigné doux et une tenue pensée pour durer.\n\n• 100 % coton peigné\n• Jersey doux de 180 g/m²\n• Fabriqué en Tunisie',
    'قطعة أساسية لكل يوم. قصة أنيقة وقطن ممشط ناعم وجودة تدوم طويلاً.\n\n• قطن ممشط 100٪\n• جيرسي ناعم بوزن 180 غ/م²\n• صنع في تونس',
    'Maison Noura', 'Essentiel 01', 49.900, null, 'published', true, true, now()
  ),
  (
    md5('product-sweat-capuche-molleton')::uuid, md5('cat-manteaux-homme')::uuid,
    'Sweat à capuche en molleton', 'سويت شيرت بقبعة من القطن المبطن',
    'sweat-capuche-molleton', 'MN-SWT-002',
    'Un molleton dense et doux pour les matins frais. Sa coupe légèrement ample se porte facilement en superposition.\n\n• 80 % coton, 20 % polyester recyclé\n• Intérieur brossé\n• Poche kangourou et capuche doublée',
    'قطن مبطن ناعم للأيام الباردة. قصة مريحة يسهل تنسيقها مع طبقات أخرى.\n\n• 80٪ قطن و20٪ بوليستر معاد تدويره\n• بطانة داخلية ناعمة\n• جيب أمامي وقبعة مبطنة',
    'Maison Noura', 'Molleton 02', 98.000, null, 'published', true, true, now()
  ),
  (
    md5('product-chemise-lin')::uuid, md5('cat-chemises-homme')::uuid,
    'Chemise droite en lin lavé', 'قميص بقصة مستقيمة من الكتان المغسول',
    'chemise-lin', 'MN-LIN-003',
    'Une chemise aérée au tombé naturel, confectionnée dans un lin lavé agréable sur la peau.\n\n• 100 % lin\n• Coupe droite et poche poitrine\n• Boutons effet nacre',
    'قميص خفيف بانسدال طبيعي، مصنوع من كتان مغسول ومريح على البشرة.\n\n• كتان 100٪\n• قصة مستقيمة وجيب على الصدر\n• أزرار بلمعة لؤلؤية',
    'Maison Noura', 'Lin 03', 129.000, null, 'published', true, true, now()
  ),
  (
    md5('product-robe-ete-fleurie')::uuid, md5('cat-robes')::uuid,
    'Robe midi Jardin d’été', 'فستان جاردان ميدي للصيف',
    'robe-ete-fleurie', 'MN-ROB-004',
    'Une robe midi fluide aux notes végétales, avec une taille souple et une jupe qui accompagne le mouvement.\n\n• Viscose légère certifiée\n• Manches courtes et taille ajustable\n• Longueur midi',
    'فستان ميدي انسيابي بنقوش نباتية، خصر مريح وتنورة تتحرك بنعومة.\n\n• فسكوز خفيف معتمد\n• أكمام قصيرة وخصر قابل للتعديل\n• طول ميدي',
    'Maison Noura', 'Jardin 04', 149.000, 129.000, 'published', true, true, now()
  );

insert into public.product_private (product_id, purchase_price, internal_notes)
values
  (md5('product-tshirt-coton-bio')::uuid, 18.000, 'Coût de production Maison Noura'),
  (md5('product-sweat-capuche-molleton')::uuid, 42.000, 'Coût de production Maison Noura'),
  (md5('product-chemise-lin')::uuid, 55.000, 'Coût de production Maison Noura'),
  (md5('product-robe-ete-fleurie')::uuid, 64.000, 'Coût de production Maison Noura');

insert into public.product_images (product_id, url, alt, position)
values
  (md5('product-tshirt-coton-bio')::uuid, '/demo/tshirt-coton-bio.jpg', 'T-shirt signature Maison Noura', 0),
  (md5('product-sweat-capuche-molleton')::uuid, '/demo/sweat-capuche.jpg', 'Sweat à capuche Maison Noura', 0),
  (md5('product-chemise-lin')::uuid, '/demo/chemise-lin.jpg', 'Chemise en lin Maison Noura', 0),
  (md5('product-robe-ete-fleurie')::uuid, '/demo/robe-ete-fleurie.jpg', 'Robe midi Maison Noura', 0);

insert into public.product_attribute_values (product_id, attribute_id, value_text)
values
  (md5('product-tshirt-coton-bio')::uuid, md5('att-essentiels-matiere')::uuid, '100 % coton peigné'),
  (md5('product-tshirt-coton-bio')::uuid, md5('att-essentiels-entretien')::uuid, 'Lavage en machine à 30 °C'),
  (md5('product-sweat-capuche-molleton')::uuid, md5('att-homme-matiere')::uuid, '80 % coton, 20 % polyester recyclé'),
  (md5('product-sweat-capuche-molleton')::uuid, md5('att-homme-entretien')::uuid, 'Lavage en machine à 30 °C, sur l’envers'),
  (md5('product-chemise-lin')::uuid, md5('att-homme-matiere')::uuid, '100 % lin lavé'),
  (md5('product-chemise-lin')::uuid, md5('att-homme-entretien')::uuid, 'Lavage délicat à 30 °C'),
  (md5('product-robe-ete-fleurie')::uuid, md5('att-femme-matiere')::uuid, '100 % viscose'),
  (md5('product-robe-ete-fleurie')::uuid, md5('att-femme-entretien')::uuid, 'Lavage délicat à 30 °C');

do $seed$
declare
  p record;
  v_size text;
  v_color text;
  v_size_attribute uuid;
  v_color_attribute uuid;
  v_size_option uuid;
  v_color_option uuid;
  v_variant_id uuid;
  v_sku text;
  v_default boolean;
  v_position int;
begin
  for p in
    select * from (values
      ('tshirt-coton-bio', 'essentiels', array['S','M','L','XL']::text[], array['ecru','noir']::text[], 14),
      ('sweat-capuche-molleton', 'homme', array['M','L','XL']::text[], array['sauge','noir']::text[], 8),
      ('chemise-lin', 'homme', array['S','M','L','XL']::text[], array['sable','bleu-ciel']::text[], 10),
      ('robe-ete-fleurie', 'femme', array['XS','S','M','L']::text[], array['terracotta','olive']::text[], 7)
    ) as specs(slug, root_slug, sizes, colors, stock)
  loop
    v_size_attribute := md5('att-' || p.root_slug || '-taille')::uuid;
    v_color_attribute := md5('att-' || p.root_slug || '-couleur')::uuid;
    v_default := true;
    v_position := 1;

    foreach v_size in array p.sizes loop
      select id into v_size_option
      from public.category_attribute_options
      where attribute_id = v_size_attribute and value = v_size;

      foreach v_color in array p.colors loop
        select id into v_color_option
        from public.category_attribute_options
        where attribute_id = v_color_attribute and value = v_color;

        v_variant_id := md5('variant-' || p.slug || '-' || v_size || '-' || v_color)::uuid;
        v_sku := 'MN-' || upper(regexp_replace(p.slug, '-', '', 'g')) || '-' || v_size || '-' || upper(v_color);

        insert into public.product_variants (
          id, product_id, sku, price, promo_price, is_active, is_default, position
        )
        select
          v_variant_id, id, v_sku, price, promo_price, true, v_default, v_position
        from public.products
        where slug = p.slug;

        insert into public.variant_attribute_values (variant_id, attribute_id, option_id)
        values
          (v_variant_id, v_size_attribute, v_size_option),
          (v_variant_id, v_color_attribute, v_color_option);

        perform public._move_stock(
          v_variant_id, null, 'available', p.stock, 'initial',
          'Stock initial — Maison Noura', null, null, null
        );
        v_default := false;
        v_position := v_position + 1;
      end loop;
    end loop;
  end loop;
end
$seed$;

insert into public.description_templates (id, name, summary, instructions, target_length, display_order)
values
  (
    md5('template-maison-noura-fiche')::uuid,
    'Fiche mode Maison Noura',
    'Une présentation élégante, précise et bilingue des pièces du vestiaire.',
    'Rédige une fiche produit mode élégante et factuelle. Décris uniquement la matière, la coupe, les détails et l’entretien fournis. N’invente aucune certification ni promesse. Termine par une phrase concise sur la livraison en Tunisie.',
    'medium', 1
  ),
  (
    md5('template-maison-noura-courte')::uuid,
    'Description courte',
    'Deux phrases utiles pour les cartes et petits écrans.',
    'Rédige deux phrases courtes en français, avec le nom du vêtement, sa matière et son usage. Garde un ton éditorial sobre et n’ajoute aucune caractéristique qui ne figure pas dans les données.',
    'short', 2
  );

-- ===== 0019_fix_description_newlines.sql =====
-- 0018 stored descriptions with literal backslash-n sequences; turn them into real newlines.
update public.products
set description_fr = replace(description_fr, '\n', E'\n'),
    description_ar = replace(description_ar, '\n', E'\n')
where description_fr like '%\n%' or description_ar like '%\n%';

-- ===== 0020_expand_catalog_categories.sql =====
-- =========================================================
-- Expand Maison Noura beyond clothing:
--   Audio & Son, Électroménager, Maison & Déco
-- Idempotent: safe to run on top of an existing DB or in bootstrap.sql.
-- =========================================================

-- ---------- 1. NEW CATEGORIES & SUBCATEGORIES ----------
insert into public.categories (
  id, parent_id, name_fr, name_ar, slug, description_fr, description_ar,
  image_url, display_order, is_active, allows_condition
) values
  -- Root categories (display_order 4..6 after Femme, Homme, Essentiels)
  (md5('cat-audio-son')::uuid, null, 'Audio & Son', 'الصوت والسماعات', 'audio-son',
   'Casques sans fil, écouteurs et enceintes nomades au son pur et au design épuré.',
   'سماعات رأس وأذن ومكبرات صوت لاسلكية بصوت نقي وتصميم أنيق.',
   '/demo/casque-audio.jpg', 4, true, false),
  (md5('cat-electromenager')::uuid, null, 'Électroménager', 'الأجهزة المنزلية', 'electromenager',
   'Petit électroménager de cuisine et café, pensé pour allier performance et esthétique.',
   'أجهزة مطبخ وقهوة صغيرة تجمع بين الأداء العالي والتصميم الهادئ.',
   '/demo/machine-espresso.jpg', 5, true, false),
  (md5('cat-maison-deco')::uuid, null, 'Maison & Déco', 'المنزل والديكور', 'maison-deco',
   'Luminaires sans fil et arts de la table aux teintes douces pour un intérieur apaisant.',
   'إضاءة لاسلكية وأدوات مائدة بألوان هادئة لمنزل مريح وأنيق.',
   '/demo/lampe-table.jpg', 6, true, false),

  -- Audio & Son subcategories
  (md5('cat-casques-ecouteurs')::uuid, md5('cat-audio-son')::uuid, 'Casques & Écouteurs', 'سماعات الرأس والأذن', 'casques-ecouteurs',
   'Réduction de bruit active, confort longue durée et autonomie étendue.',
   'عزل نشط للضوضاء وراحة طوال اليوم وبطارية تدوم طويلاً.',
   '/demo/casque-audio.jpg', 1, true, false),
  (md5('cat-enceintes-sans-fil')::uuid, md5('cat-audio-son')::uuid, 'Enceintes sans fil', 'مكبرات صوت لاسلكية', 'enceintes-sans-fil',
   'Enceintes compactes en tissu acoustique pour la maison et vos déplacements.',
   'مكبرات صوت مدمجة بقماش صوتي أنيق للمنزل والتنقل.',
   '/demo/enceinte-bluetooth.jpg', 2, true, false),

  -- Électroménager subcategories
  (md5('cat-cafe-petit-dejeuner')::uuid, md5('cat-electromenager')::uuid, 'Café & Petit-déjeuner', 'القهوة والفطور', 'cafe-petit-dejeuner',
   'Machines espresso compactes et bouilloires de précision pour vos matins.',
   'آلات إسبريسو مدمجة وغلايات دقيقة لصباح مثالي.',
   '/demo/machine-espresso.jpg', 1, true, false),
  (md5('cat-cuisine-preparation')::uuid, md5('cat-electromenager')::uuid, 'Cuisine & Préparation', 'المطبخ والتحضير', 'cuisine-preparation',
   'Appareils malins et cuisson saine au quotidien.',
   'أجهزة ذكية لطهي صحي وسريع كل يوم.',
   '/demo/air-fryer.jpg', 2, true, false),

  -- Maison & Déco subcategories
  (md5('cat-luminaire-ambiance')::uuid, md5('cat-maison-deco')::uuid, 'Luminaire & Ambiance', 'الإضاءة والأجواء', 'luminaire-ambiance',
   'Lampes rechargeables à lumière chaude pour le salon ou la table de chevet.',
   'مصابيح قابلة للشحن بإضاءة دافئة لغرفة الجلوس أو النوم.',
   '/demo/lampe-table.jpg', 1, true, false),
  (md5('cat-arts-de-la-table')::uuid, md5('cat-maison-deco')::uuid, 'Arts de la table', 'أدوات المائدة', 'arts-de-la-table',
   'Céramiques et grès émaillés façonnés dans des teintes naturelles.',
   'أكواب وخزف بألوان طبيعية وملمس أنيق.',
   '/demo/mugs-ceramique.jpg', 2, true, false)
on conflict (id) do update set
  parent_id = excluded.parent_id,
  name_fr = excluded.name_fr,
  name_ar = excluded.name_ar,
  slug = excluded.slug,
  description_fr = excluded.description_fr,
  description_ar = excluded.description_ar,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  allows_condition = excluded.allows_condition;

-- ---------- 2. CATEGORY ATTRIBUTES ----------
insert into public.category_attributes (
  id, category_id, code, name_fr, name_ar, type, unit, is_required,
  is_filterable, is_searchable, is_variant, display_order
) values
  -- Audio & Son
  (md5('att-audio-son-couleur')::uuid, md5('cat-audio-son')::uuid, 'couleur', 'Couleur', 'اللون', 'color', null, false, true, true, true, 1),
  (md5('att-audio-son-autonomie')::uuid, md5('cat-audio-son')::uuid, 'autonomie', 'Autonomie', 'عمر البطارية', 'text', null, false, false, true, false, 2),
  (md5('att-audio-son-connectivite')::uuid, md5('cat-audio-son')::uuid, 'connectivite', 'Connectivité', 'الاتصال', 'text', null, false, false, true, false, 3),
  (md5('att-audio-son-garantie')::uuid, md5('cat-audio-son')::uuid, 'garantie', 'Garantie', 'الضمان', 'text', null, false, false, false, false, 4),

  -- Électroménager
  (md5('att-electromenager-couleur')::uuid, md5('cat-electromenager')::uuid, 'couleur', 'Couleur', 'اللون', 'color', null, false, true, true, true, 1),
  (md5('att-electromenager-puissance')::uuid, md5('cat-electromenager')::uuid, 'puissance', 'Puissance', 'القدرة', 'text', null, false, false, true, false, 2),
  (md5('att-electromenager-capacite')::uuid, md5('cat-electromenager')::uuid, 'capacite', 'Capacité', 'السعة', 'text', null, false, false, true, false, 3),
  (md5('att-electromenager-garantie')::uuid, md5('cat-electromenager')::uuid, 'garantie', 'Garantie', 'الضمان', 'text', null, false, false, false, false, 4),

  -- Maison & Déco
  (md5('att-maison-deco-couleur')::uuid, md5('cat-maison-deco')::uuid, 'couleur', 'Couleur', 'اللون', 'color', null, false, true, true, true, 1),
  (md5('att-maison-deco-matiere')::uuid, md5('cat-maison-deco')::uuid, 'matiere', 'Matière', 'الخامة', 'text', null, false, false, true, false, 2),
  (md5('att-maison-deco-dimensions')::uuid, md5('cat-maison-deco')::uuid, 'dimensions', 'Dimensions', 'الأبعاد', 'text', null, false, false, false, false, 3)
on conflict (id) do update set
  name_fr = excluded.name_fr,
  name_ar = excluded.name_ar,
  type = excluded.type,
  is_filterable = excluded.is_filterable,
  is_searchable = excluded.is_searchable,
  is_variant = excluded.is_variant,
  display_order = excluded.display_order;

-- ---------- 3. COLOR OPTIONS FOR NEW CATEGORIES ----------
insert into public.category_attribute_options (
  id, attribute_id, value, label_fr, label_ar, color_hex, display_order
)
select
  md5('opt-' || roots.slug || '-couleur-' || colors.value)::uuid,
  md5('att-' || roots.slug || '-couleur')::uuid,
  colors.value, colors.label_fr, colors.label_ar, colors.color_hex, colors.position
from (values ('audio-son'), ('electromenager'), ('maison-deco')) as roots(slug)
cross join (values
  ('sauge', 'Vert sauge', 'أخضر مريمي', '#9BA58D', 1),
  ('ecru', 'Écru', 'عاجي', '#E9E0D2', 2),
  ('noir', 'Noir mat', 'أسود مطفي', '#252321', 3),
  ('sable', 'Sable', 'رملي', '#C9B89F', 4),
  ('terracotta', 'Terracotta', 'طوبي', '#B66B54', 5)
) as colors(value, label_fr, label_ar, color_hex, position)
on conflict (id) do update set
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  color_hex = excluded.color_hex,
  display_order = excluded.display_order;

-- ---------- 4. PRODUCTS ----------
insert into public.products (
  id, category_id, name_fr, name_ar, slug, sku, description_fr, description_ar,
  brand, model, price, promo_price, warranty, status, has_variants, is_featured, published_at
) values
  -- Audio & Son
  (
    md5('product-casque-aura-anc')::uuid, md5('cat-casques-ecouteurs')::uuid,
    'Casque sans fil Aura ANC', 'سماعة رأس لاسلكية أورا ANC',
    'casque-aura-anc', 'MN-AUD-001',
    E'Un casque circum-auriculaire à réduction de bruit active, habillé d’une finition mate douce et de coussinets mémoire de forme.\n\n• Réduction de bruit active (ANC) hybride\n• Autonomie jusqu’à 40 heures + charge rapide USB-C\n• Bluetooth 5.3 multipoint et mode filaire jack 3,5 mm',
    E'سماعة رأس لاسلكية بعزل نشط للضوضاء وتصميم مطفي أنيق مع وسائد مريحة للأذنين.\n\n• عزل نشط وهجين للضوضاء\n• بطارية تدوم حتى 40 ساعة مع شحن سريع USB-C\n• بلوتوث 5.3 مع دعم الاتصال بأكثر من جهاز',
    'Maison Noura Audio', 'Aura ANC', 249.000, 219.000, '2 ans', 'published', true, true, now()
  ),
  (
    md5('product-ecouteurs-nuage-buds')::uuid, md5('cat-casques-ecouteurs')::uuid,
    'Écouteurs sans fil Nuage Buds', 'سماعات أذن لاسلكية نواج بودز',
    'ecouteurs-nuage-buds', 'MN-AUD-002',
    E'Des écouteurs intra-auriculaires légers dans un boîtier galet au toucher doux, pensés pour la musique et les appels clairs au quotidien.\n\n• 30 heures d’autonomie totale avec boîtier USB-C\n• Micros antibruit ENC pour des appels nets\n• Résistance aux éclaboussures IPX4',
    E'سماعات أذن خفيفة بعلبة شحن مدمجة وملمس ناعم، مثالية للموسيقى والمكالمات اليومية.\n\n• حتى 30 ساعة تشغيل مع علبة الشحن USB-C\n• ميكروفونات واضحة لعزل الضجيج أثناء المكالمات\n• مقاومة لرذاذ الماء IPX4',
    'Maison Noura Audio', 'Nuage Buds', 139.000, null, '2 ans', 'published', true, true, now()
  ),
  (
    md5('product-enceinte-brise-mini')::uuid, md5('cat-enceintes-sans-fil')::uuid,
    'Enceinte nomade Brise Mini', 'مكبر صوت لاسلكي بريز ميني',
    'enceinte-brise-mini', 'MN-AUD-003',
    E'Une enceinte Bluetooth 360° habillée de tissu acoustique tressé et munie d’une dragonne en cuir souple pour vous accompagner partout.\n\n• Son équilibré 15 W à diffusion 360°\n• Autonomie de 18 heures sur une seule charge\n• Résistance eau et poussière IP67',
    E'مكبر صوت بلوتوث بزاوية 360 درجة مغلف بقماش صوتي أنيق وحزام حمل جلدي.\n\n• صوت متوازن بقوة 15 واط بزاوية 360 درجة\n• بطارية تدوم حتى 18 ساعة\n• مقاوم للماء والغبار بمعيار IP67',
    'Maison Noura Audio', 'Brise Mini', 169.000, null, '2 ans', 'published', true, false, now()
  ),

  -- Électroménager
  (
    md5('product-machine-espresso-barista')::uuid, md5('cat-cafe-petit-dejeuner')::uuid,
    'Machine espresso Barista Compact', 'آلة قهوة إسبريسو باريستا المدمجة',
    'machine-espresso-barista', 'MN-ELM-001',
    E'Une machine espresso 15 bars au format compact, mêlant acier brossé, finition mate écru et porte-filtre à manche en bois de chêne.\n\n• Pression 15 bars avec manomètre intégré\n• Buse vapeur orientable pour cappuccino et latte\n• Réservoir d’eau amovible 1,5 L et chauffe rapide Thermoblock',
    E'آلة إسبريسو مدمجة بقوة ضغط 15 بار، تجمع بين الفولاذ المصقول واللمسة العاجية ومقبض خشبي أنيق.\n\n• ضغط 15 بار مع مقياس حرارة وضغط مدمج\n• فوهة بخار لتحضير الكابتشينو واللاتيه\n• خزان ماء قابل للإزالة بسعة 1.5 لتر وتسخين سريع',
    'Maison Noura Cuisine', 'Barista 15', 489.000, 449.000, '2 ans', 'published', true, true, now()
  ),
  (
    md5('product-bouilloire-atelier')::uuid, md5('cat-cafe-petit-dejeuner')::uuid,
    'Bouilloire col de cygne Atelier', 'غلاية كهربائية بعنق منحني أتيليه',
    'bouilloire-atelier', 'MN-ELM-002',
    E'Une bouilloire électrique en acier inoxydable mat avec bec col de cygne pour un versement précis du café filtre et des infusions.\n\n• Puissance 1200 W à ébullition rapide\n• Poignée ergonomique en bois clair et base pivotante 360°\n• Arrêt automatique et protection anti-chauffe à sec',
    E'غلاية كهربائية من الفولاذ المطفي بفوهة دقيقة مثالية للقهوة المختصة والشاي.\n\n• قدرة 1200 واط للغليان السريع\n• مقبض خشبي مريح وقاعدة دوارة 360 درجة\n• إيقاف تلقائي وحماية من التشغيل الجاف',
    'Maison Noura Cuisine', 'Atelier 0.9L', 145.000, null, '2 ans', 'published', true, false, now()
  ),
  (
    md5('product-friteuse-airpure')::uuid, md5('cat-cuisine-preparation')::uuid,
    'Friteuse sans huile AirPure 4,5 L', 'قلاية هوائية بدون زيت إير بيور 4.5 لتر',
    'friteuse-airpure', 'MN-ELM-003',
    E'Une friteuse à air chaud silencieuse et minimaliste pour cuisiner croustillant avec jusqu’à 85 % de matières grasses en moins.\n\n• Cuve familiale 4,5 L antiadhésive compatible lave-vaisselle\n• Thermostat réglable de 80 °C à 200 °C et minuterie 60 min\n• Puissance 1500 W à circulation d’air rapide',
    E'قلاية هوائية بتصميم هادئ لطهي مقرمش وصحي بدهون أقل حتى 85٪.\n\n• سلة عائلية بسعة 4.5 لتر مانعة للالتصاق وسهلة التنظيف\n• تحكم بالحرارة من 80 إلى 200 درجة ومؤقت 60 دقيقة\n• قدرة 1500 واط لتوزيع سريع ومتساوٍ للحرارة',
    'Maison Noura Cuisine', 'AirPure 4.5', 299.000, 269.000, '2 ans', 'published', true, true, now()
  ),

  -- Maison & Déco
  (
    md5('product-lampe-table-halo')::uuid, md5('cat-luminaire-ambiance')::uuid,
    'Lampe de table Halo sans fil', 'مصباح طاولة لاسلكي هالو',
    'lampe-table-halo', 'MN-DEC-001',
    E'Une lampe dôme rechargeable en métal mat qui diffuse une lumière chaude tamisée sur trois niveaux d’intensité.\n\n• Variateur tactile 3 intensités (lumière chaude 2700 K)\n• Jusqu’à 24 heures d’éclairage sans fil — recharge USB-C\n• Corps en aluminium thermolaqué vert sauge ou écru',
    E'مصباح طاولة لاسلكي قابل للشحن من المعدن المطفي بإضاءة دافئة ومريحة بثلاث درجات.\n\n• تحكم باللمس بـ3 مستويات إضاءة دافئة\n• حتى 24 ساعة إضاءة لاسلكية وشحن USB-C\n• هيكل ألمنيوم مطلي بألوان هادئة',
    'Maison Noura Maison', 'Halo LED', 119.000, null, '1 an', 'published', true, true, now()
  ),
  (
    md5('product-duo-mugs-gres')::uuid, md5('cat-arts-de-la-table')::uuid,
    'Duo de mugs en grès mat', 'طقم كوبين من الخزف المطفي',
    'duo-mugs-gres', 'MN-DEC-002',
    E'Un duo de tasses en grès épais à base brute non émaillée, pensé pour le café du matin comme pour les thés d’après-midi.\n\n• Contenance 320 ml par mug (lot de 2)\n• Grès haute température résistant au lave-vaisselle et micro-ondes\n• Émail mat moucheté ou uni aux teintes douces',
    E'طقم من كوبين مصنوعين من الخزف المتين بقاعدة طينية طبيعية، مثالي للقهوة والشاي.\n\n• سعة 320 مل لكل كوب (طقم من قطعتين)\n• آمن لغسالة الصحون والميكروويف\n• طلاء مطفي بألوان طبيعية دافئة',
    'Maison Noura Maison', 'Grès Duo', 54.000, null, null, 'published', true, false, now()
  )
on conflict (id) do update set
  category_id = excluded.category_id,
  name_fr = excluded.name_fr,
  name_ar = excluded.name_ar,
  slug = excluded.slug,
  sku = excluded.sku,
  description_fr = excluded.description_fr,
  description_ar = excluded.description_ar,
  brand = excluded.brand,
  model = excluded.model,
  price = excluded.price,
  promo_price = excluded.promo_price,
  warranty = excluded.warranty,
  status = excluded.status,
  has_variants = excluded.has_variants,
  is_featured = excluded.is_featured;

-- ---------- 5. PURCHASE COSTS (ADMIN-ONLY) ----------
insert into public.product_private (product_id, purchase_price, internal_notes)
values
  (md5('product-casque-aura-anc')::uuid, 125.000, 'Approvisionnement Maison Noura Audio'),
  (md5('product-ecouteurs-nuage-buds')::uuid, 62.000, 'Approvisionnement Maison Noura Audio'),
  (md5('product-enceinte-brise-mini')::uuid, 78.000, 'Approvisionnement Maison Noura Audio'),
  (md5('product-machine-espresso-barista')::uuid, 265.000, 'Approvisionnement Maison Noura Cuisine'),
  (md5('product-bouilloire-atelier')::uuid, 68.000, 'Approvisionnement Maison Noura Cuisine'),
  (md5('product-friteuse-airpure')::uuid, 152.000, 'Approvisionnement Maison Noura Cuisine'),
  (md5('product-lampe-table-halo')::uuid, 52.000, 'Approvisionnement Maison Noura Maison'),
  (md5('product-duo-mugs-gres')::uuid, 22.000, 'Approvisionnement Maison Noura Maison')
on conflict (product_id) do update set
  purchase_price = excluded.purchase_price,
  internal_notes = excluded.internal_notes;

-- ---------- 6. PRODUCT IMAGES ----------
insert into public.product_images (id, product_id, url, alt, position)
values
  (md5('img-casque-aura-anc')::uuid, md5('product-casque-aura-anc')::uuid, '/demo/casque-audio.jpg', 'Casque sans fil Aura ANC Maison Noura', 0),
  (md5('img-ecouteurs-nuage-buds')::uuid, md5('product-ecouteurs-nuage-buds')::uuid, '/demo/ecouteurs-sans-fil.jpg', 'Écouteurs sans fil Nuage Buds Maison Noura', 0),
  (md5('img-enceinte-brise-mini')::uuid, md5('product-enceinte-brise-mini')::uuid, '/demo/enceinte-bluetooth.jpg', 'Enceinte nomade Brise Mini Maison Noura', 0),
  (md5('img-machine-espresso-barista')::uuid, md5('product-machine-espresso-barista')::uuid, '/demo/machine-espresso.jpg', 'Machine espresso Barista Compact Maison Noura', 0),
  (md5('img-bouilloire-atelier')::uuid, md5('product-bouilloire-atelier')::uuid, '/demo/bouilloire-electrique.jpg', 'Bouilloire col de cygne Atelier Maison Noura', 0),
  (md5('img-friteuse-airpure')::uuid, md5('product-friteuse-airpure')::uuid, '/demo/air-fryer.jpg', 'Friteuse sans huile AirPure Maison Noura', 0),
  (md5('img-lampe-table-halo')::uuid, md5('product-lampe-table-halo')::uuid, '/demo/lampe-table.jpg', 'Lampe de table Halo sans fil Maison Noura', 0),
  (md5('img-duo-mugs-gres')::uuid, md5('product-duo-mugs-gres')::uuid, '/demo/mugs-ceramique.jpg', 'Duo de mugs en grès mat Maison Noura', 0)
on conflict (id) do update set
  url = excluded.url,
  alt = excluded.alt,
  position = excluded.position;

-- ---------- 7. PRODUCT ATTRIBUTE VALUES (SPECS) ----------
insert into public.product_attribute_values (id, product_id, attribute_id, value_text)
values
  -- Audio & Son
  (md5('pav-casque-aura-anc-autonomie')::uuid, md5('product-casque-aura-anc')::uuid, md5('att-audio-son-autonomie')::uuid, 'Jusqu’à 40 h (ANC actif : 30 h)'),
  (md5('pav-casque-aura-anc-connectivite')::uuid, md5('product-casque-aura-anc')::uuid, md5('att-audio-son-connectivite')::uuid, 'Bluetooth 5.3, USB-C, Jack 3,5 mm'),
  (md5('pav-casque-aura-anc-garantie')::uuid, md5('product-casque-aura-anc')::uuid, md5('att-audio-son-garantie')::uuid, '2 ans'),

  (md5('pav-ecouteurs-nuage-buds-autonomie')::uuid, md5('product-ecouteurs-nuage-buds')::uuid, md5('att-audio-son-autonomie')::uuid, '7 h + 23 h via boîtier (30 h total)'),
  (md5('pav-ecouteurs-nuage-buds-connectivite')::uuid, md5('product-ecouteurs-nuage-buds')::uuid, md5('att-audio-son-connectivite')::uuid, 'Bluetooth 5.3 & USB-C'),
  (md5('pav-ecouteurs-nuage-buds-garantie')::uuid, md5('product-ecouteurs-nuage-buds')::uuid, md5('att-audio-son-garantie')::uuid, '2 ans'),

  (md5('pav-enceinte-brise-mini-autonomie')::uuid, md5('product-enceinte-brise-mini')::uuid, md5('att-audio-son-autonomie')::uuid, '18 heures'),
  (md5('pav-enceinte-brise-mini-connectivite')::uuid, md5('product-enceinte-brise-mini')::uuid, md5('att-audio-son-connectivite')::uuid, 'Bluetooth 5.3, appairage stéréo TWS'),
  (md5('pav-enceinte-brise-mini-garantie')::uuid, md5('product-enceinte-brise-mini')::uuid, md5('att-audio-son-garantie')::uuid, '2 ans'),

  -- Électroménager
  (md5('pav-machine-espresso-barista-puissance')::uuid, md5('product-machine-espresso-barista')::uuid, md5('att-electromenager-puissance')::uuid, '1350 W — Pression 15 bars'),
  (md5('pav-machine-espresso-barista-capacite')::uuid, md5('product-machine-espresso-barista')::uuid, md5('att-electromenager-capacite')::uuid, 'Réservoir amovible 1,5 L'),
  (md5('pav-machine-espresso-barista-garantie')::uuid, md5('product-machine-espresso-barista')::uuid, md5('att-electromenager-garantie')::uuid, '2 ans'),

  (md5('pav-bouilloire-atelier-puissance')::uuid, md5('product-bouilloire-atelier')::uuid, md5('att-electromenager-puissance')::uuid, '1200 W'),
  (md5('pav-bouilloire-atelier-capacite')::uuid, md5('product-bouilloire-atelier')::uuid, md5('att-electromenager-capacite')::uuid, '0,9 L — Bec col de cygne'),
  (md5('pav-bouilloire-atelier-garantie')::uuid, md5('product-bouilloire-atelier')::uuid, md5('att-electromenager-garantie')::uuid, '2 ans'),

  (md5('pav-friteuse-airpure-puissance')::uuid, md5('product-friteuse-airpure')::uuid, md5('att-electromenager-puissance')::uuid, '1500 W (80 °C à 200 °C)'),
  (md5('pav-friteuse-airpure-capacite')::uuid, md5('product-friteuse-airpure')::uuid, md5('att-electromenager-capacite')::uuid, '4,5 L (3 à 5 personnes)'),
  (md5('pav-friteuse-airpure-garantie')::uuid, md5('product-friteuse-airpure')::uuid, md5('att-electromenager-garantie')::uuid, '2 ans'),

  -- Maison & Déco
  (md5('pav-lampe-table-halo-matiere')::uuid, md5('product-lampe-table-halo')::uuid, md5('att-maison-deco-matiere')::uuid, 'Aluminium thermolaqué mat'),
  (md5('pav-lampe-table-halo-dimensions')::uuid, md5('product-lampe-table-halo')::uuid, md5('att-maison-deco-dimensions')::uuid, 'Ø 16 × H 28 cm — Autonomie 24 h'),

  (md5('pav-duo-mugs-gres-matiere')::uuid, md5('product-duo-mugs-gres')::uuid, md5('att-maison-deco-matiere')::uuid, 'Grès émaillé mat, base argile brute'),
  (md5('pav-duo-mugs-gres-dimensions')::uuid, md5('product-duo-mugs-gres')::uuid, md5('att-maison-deco-dimensions')::uuid, 'Lot de 2 × 320 ml (Ø 8,5 × H 9 cm)')
on conflict (id) do update set
  value_text = excluded.value_text;

-- ---------- 8. VARIANTS & INITIAL STOCK ----------
do $seed_new$
declare
  p record;
  v_color text;
  v_color_attribute uuid;
  v_color_option uuid;
  v_variant_id uuid;
  v_sku text;
  v_default boolean;
  v_position int;
begin
  for p in
    select * from (values
      ('casque-aura-anc', 'audio-son', array['sauge','ecru','noir']::text[], 12),
      ('ecouteurs-nuage-buds', 'audio-son', array['ecru','sauge','noir']::text[], 18),
      ('enceinte-brise-mini', 'audio-son', array['sauge','sable']::text[], 10),
      ('machine-espresso-barista', 'electromenager', array['ecru','sauge','noir']::text[], 6),
      ('bouilloire-atelier', 'electromenager', array['ecru','noir','sauge']::text[], 11),
      ('friteuse-airpure', 'electromenager', array['sauge','ecru','noir']::text[], 9),
      ('lampe-table-halo', 'maison-deco', array['sauge','ecru','sable']::text[], 14),
      ('duo-mugs-gres', 'maison-deco', array['sauge','ecru','terracotta']::text[], 20)
    ) as specs(slug, root_slug, colors, stock)
  loop
    v_color_attribute := md5('att-' || p.root_slug || '-couleur')::uuid;
    v_default := true;
    v_position := 1;

    foreach v_color in array p.colors loop
      select id into v_color_option
      from public.category_attribute_options
      where attribute_id = v_color_attribute and value = v_color;

      v_variant_id := md5('variant-' || p.slug || '-' || v_color)::uuid;
      v_sku := 'MN-' || upper(regexp_replace(p.slug, '-', '', 'g')) || '-' || upper(v_color);

      insert into public.product_variants (
        id, product_id, sku, price, promo_price, is_active, is_default, position
      )
      select
        v_variant_id, id, v_sku, price, promo_price, true, v_default, v_position
      from public.products
      where slug = p.slug
      on conflict (id) do update set
        price = excluded.price,
        promo_price = excluded.promo_price,
        is_active = excluded.is_active,
        is_default = excluded.is_default,
        position = excluded.position;

      insert into public.variant_attribute_values (variant_id, attribute_id, option_id)
      values (v_variant_id, v_color_attribute, v_color_option)
      on conflict (variant_id, attribute_id) do update set
        option_id = excluded.option_id;

      if not exists (
        select 1 from public.inventory_movements
        where variant_id = v_variant_id and movement_type = 'initial'
      ) then
        perform public._move_stock(
          v_variant_id, null, 'available', p.stock, 'initial',
          'Stock initial — Maison Noura', null, null, null
        );
      end if;

      v_default := false;
      v_position := v_position + 1;
    end loop;
  end loop;
end
$seed_new$;

-- ---------- 9. STORE SETTINGS & AI TEMPLATE ----------
update public.store_settings
set
  seller_terms_fr = 'Mode, audio, petit électroménager et maison — une sélection choisie pour durer.',
  seller_terms_ar = 'أزياء، صوتيات، أجهزة منزلية صغيرة وديكور — تشكيلة مختارة بعناية لتدوم.'
where id = true;

insert into public.description_templates (id, name, summary, instructions, target_length, display_order)
values (
  md5('template-maison-noura-tech-maison')::uuid,
  'Fiche Audio, Électroménager & Maison',
  'Présentation claire, rassurante et structurée pour les appareils et objets du quotidien.',
  'Rédige une fiche produit claire et élégante en français. Mets en valeur l’usage quotidien, le design épuré et uniquement les caractéristiques techniques fournies (puissance, autonomie, capacité, matériaux, garantie). N’invente aucune donnée technique. Termine par une phrase concise sur la livraison en Tunisie avec paiement à la réception.',
  'medium', 3
)
on conflict (id) do update set
  name = excluded.name,
  summary = excluded.summary,
  instructions = excluded.instructions,
  target_length = excluded.target_length,
  display_order = excluded.display_order;

-- ===== 0021_fix_returns_rls_recursion.sql =====
-- =========================================================
-- Fix infinite RLS recursion (42P17) between public.returns
-- and public.return_items, and fix return_status_history
-- self-comparison typo (ri.return_id = ri.return_id).
-- =========================================================

create or replace function public.seller_owns_return(_return_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.return_items ri
    join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = _return_id
      and oi.seller_id = public.current_seller_id()
  )
$$;

revoke all on function public.seller_owns_return(uuid) from public;
grant execute on function public.seller_owns_return(uuid) to authenticated;

drop policy if exists "Sellers read returns with own items" on public.returns;
create policy "Sellers read returns with own items" on public.returns
  for select to authenticated
  using (public.seller_owns_return(id));

drop policy if exists "Sellers read own return history" on public.return_status_history;
create policy "Sellers read own return history" on public.return_status_history
  for select to authenticated
  using (public.seller_owns_return(return_id));

-- ===== 0022_ai_provider_settings.sql =====
-- Configurable AI provider settings (OpenAI, Fal, Replicate) stored securely
-- in a singleton table inaccessible directly from anon/authenticated clients.

create table if not exists public.ai_provider_settings (
  id boolean primary key default true check (id),
  openai_api_key text,
  ai_model text not null default 'gpt-4o-mini',
  image_model text not null default 'gpt-image-1',
  fal_api_key text,
  replicate_api_token text,
  assistant_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.ai_provider_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.ai_provider_settings enable row level security;

-- Lock down direct PostgREST access: only service_role and controlled SECURITY DEFINER RPCs access secrets.
revoke all on table public.ai_provider_settings from anon, authenticated;

create or replace function public.mask_secret_hint(_val text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := nullif(btrim(coalesce(_val, '')), '');
begin
  if v is null then
    return null;
  end if;
  if length(v) <= 8 then
    return '••••' || right(v, 2);
  end if;
  return left(v, 4) || '••••' || right(v, 4);
end;
$$;

revoke all on function public.mask_secret_hint(text) from public;

-- Admin-only masked status view (never returns raw API keys to the browser).
create or replace function public.admin_get_ai_settings_status()
returns table (
  has_openai_key boolean,
  openai_key_hint text,
  ai_model text,
  image_model text,
  has_fal_key boolean,
  fal_key_hint text,
  has_replicate_token boolean,
  replicate_token_hint text,
  assistant_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    nullif(btrim(coalesce(s.openai_api_key, '')), '') is not null,
    public.mask_secret_hint(s.openai_api_key),
    s.ai_model,
    s.image_model,
    nullif(btrim(coalesce(s.fal_api_key, '')), '') is not null,
    public.mask_secret_hint(s.fal_api_key),
    nullif(btrim(coalesce(s.replicate_api_token, '')), '') is not null,
    public.mask_secret_hint(s.replicate_api_token),
    s.assistant_enabled,
    s.updated_at
  from public.ai_provider_settings s
  where s.id = true;
end;
$$;

revoke all on function public.admin_get_ai_settings_status() from public;
grant execute on function public.admin_get_ai_settings_status() to authenticated;

-- Admin-only save function: keeps existing secrets untouched if blank unless explicitly cleared.
create or replace function public.admin_save_ai_settings(
  _openai_api_key text default null,
  _clear_openai_key boolean default false,
  _ai_model text default null,
  _image_model text default null,
  _fal_api_key text default null,
  _clear_fal_key boolean default false,
  _replicate_api_token text default null,
  _clear_replicate_token boolean default false,
  _assistant_enabled boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  insert into public.ai_provider_settings (id)
  values (true)
  on conflict (id) do nothing;

  update public.ai_provider_settings
  set
    openai_api_key = case
      when coalesce(_clear_openai_key, false) then null
      when nullif(btrim(coalesce(_openai_api_key, '')), '') is not null then btrim(_openai_api_key)
      else openai_api_key
    end,
    ai_model = coalesce(nullif(btrim(coalesce(_ai_model, '')), ''), ai_model),
    image_model = coalesce(nullif(btrim(coalesce(_image_model, '')), ''), image_model),
    fal_api_key = case
      when coalesce(_clear_fal_key, false) then null
      when nullif(btrim(coalesce(_fal_api_key, '')), '') is not null then btrim(_fal_api_key)
      else fal_api_key
    end,
    replicate_api_token = case
      when coalesce(_clear_replicate_token, false) then null
      when nullif(btrim(coalesce(_replicate_api_token, '')), '') is not null then btrim(_replicate_api_token)
      else replicate_api_token
    end,
    assistant_enabled = coalesce(_assistant_enabled, assistant_enabled),
    updated_at = now(),
    updated_by = auth.uid()
  where id = true;
end;
$$;

revoke all on function public.admin_save_ai_settings(text, boolean, text, text, text, boolean, text, boolean, boolean) from public;
grant execute on function public.admin_save_ai_settings(text, boolean, text, text, text, boolean, text, boolean, boolean) to authenticated;

-- Server-side runtime config lookup for authenticated staff/admin server functions.
create or replace function public.staff_get_ai_runtime_config()
returns table (
  openai_api_key text,
  ai_model text,
  image_model text,
  fal_api_key text,
  replicate_api_token text,
  assistant_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden';
  end if;

  return query
  select
    s.openai_api_key,
    s.ai_model,
    s.image_model,
    s.fal_api_key,
    s.replicate_api_token,
    s.assistant_enabled
  from public.ai_provider_settings s
  where s.id = true;
end;
$$;

revoke all on function public.staff_get_ai_runtime_config() from public;
grant execute on function public.staff_get_ai_runtime_config() to authenticated;

-- Public safe flag: tells storefront whether the AI shopping assistant widget is enabled (no secrets).
create or replace function public.get_assistant_public_status()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select assistant_enabled from public.ai_provider_settings where id = true), true);
$$;

revoke all on function public.get_assistant_public_status() from public;
grant execute on function public.get_assistant_public_status() to anon, authenticated;

commit;

-- Refresh PostgREST schema cache so the Data API picks up all new tables/RPCs immediately.
notify pgrst, 'reload schema';
