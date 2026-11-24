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
