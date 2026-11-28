-- Lot 1: 10-role RBAC, enhanced immutable Audit Logs, Brands, Wishlist, Newsletter,
-- configurable Homepage CMS sections, and extended Product ERP/SEO fields.

-- =====================================================================
-- 1. RBAC: 10 Roles + Granular Permissions + Role-Permission Matrix
-- =====================================================================
create table if not exists public.rbac_roles (
  code text primary key,
  name_fr text not null,
  name_ar text not null,
  description_fr text not null,
  description_ar text not null,
  is_system boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.rbac_permissions (
  code text primary key,
  module text not null,
  label_fr text not null,
  label_ar text not null,
  display_order integer not null default 0
);

create table if not exists public.rbac_role_permissions (
  role_code text not null references public.rbac_roles(code) on delete cascade,
  permission_code text not null references public.rbac_permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table if not exists public.user_rbac_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null references public.rbac_roles(code) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

create index if not exists idx_user_rbac_roles_user on public.user_rbac_roles(user_id);

-- Seed 10 PRD roles
insert into public.rbac_roles (code, name_fr, name_ar, description_fr, description_ar, display_order) values
  ('super_admin', 'Super Administrateur', 'المشرف العام', 'Accès complet au système, rôles et sécurité', 'صلاحية كاملة للنظام والأدوار والأمان', 1),
  ('admin', 'Administrateur', 'مسؤول', 'Gestion générale de l''entreprise', 'الإدارة العامة للشركة', 2),
  ('product_manager', 'Responsable Produits', 'مسؤول المنتجات', 'Produits, catégories, marques et prix', 'المنتجات والأقسام والعلامات والأسعار', 3),
  ('purchasing_manager', 'Responsable Achats & Import', 'مسؤول المشتريات والاستيراد', 'Fournisseurs, achats Chine, imports et coût de revient', 'الموردون وطلبات الشراء والاستيراد وتكلفة الهبوط', 4),
  ('warehouse_manager', 'Responsable Entrepôt', 'مسؤول المستودع', 'Stock, mouvements, transferts et inventaires', 'المخزون والحركات والتحويلات والجرد', 5),
  ('order_manager', 'Responsable Commandes', 'مسؤول الطلبات', 'Commandes, confirmations, préparation et livraison', 'الطلبات والتأكيد والتجهيز والتوصيل', 6),
  ('accountant', 'Comptable', 'محاسب', 'Transactions financières, COD, P&L et rapports', 'المعاملات المالية والتحصيل والأرباح والتقارير', 7),
  ('marketing_manager', 'Responsable Marketing', 'مسؤول التسويق', 'Campagnes, CRM, Meta et automatisations', 'الحملات وإدارة الحرفاء وMeta والأتمتة', 8),
  ('customer_support', 'Service Client', 'خدمة الحرفاء', 'Clients, réclamations, avis et retours', 'الحرفاء والشكاوى والتقييمات والإرجاع', 9),
  ('analyst', 'Analyste BI', 'محلل بيانات', 'Lecture seule sur les tableaux de bord et rapports', 'قراءة فقط للوحات القيادة والتقارير', 10)
on conflict (code) do nothing;

-- Seed granular permissions across modules
insert into public.rbac_permissions (code, module, label_fr, label_ar, display_order) values
  ('dashboard.view', 'dashboard', 'Voir le tableau de bord', 'عرض لوحة القيادة', 1),
  ('products.view', 'products', 'Voir les produits', 'عرض المنتجات', 10),
  ('products.manage', 'products', 'Créer / modifier les produits & prix', 'إنشاء وتعديل المنتجات والأسعار', 11),
  ('categories.manage', 'categories', 'Gérer catégories & marques', 'إدارة الأقسام والعلامات', 12),
  ('suppliers.manage', 'erp', 'Gérer les fournisseurs', 'إدارة الموردين', 20),
  ('purchases.manage', 'erp', 'Gérer les bons de commande (PO)', 'إدارة أوامر الشراء', 21),
  ('imports.manage', 'erp', 'Gérer les imports & coût de revient', 'إدارة الشحنات وتكلفة الهبوط', 22),
  ('inventory.view', 'inventory', 'Consulter le stock', 'عرض المخزون', 30),
  ('inventory.manage', 'inventory', 'Mouvements & ajustements de stock', 'حركات وتعديلات المخزون', 31),
  ('orders.view', 'orders', 'Consulter les commandes', 'عرض الطلبات', 40),
  ('orders.manage', 'orders', 'Confirmer, préparer & expédier les commandes', 'تأكيد وتجهيز وشحن الطلبات', 41),
  ('delivery.manage', 'delivery', 'Gérer les transporteurs & expéditions', 'إدارة شركات التوصيل والشحنات', 42),
  ('customers.view', 'crm', 'Consulter les clients & CRM', 'عرض الحرفاء وCRM', 50),
  ('customers.manage', 'crm', 'Gérer segments & notes clients', 'إدارة الشرائح وملاحظات الحرفاء', 51),
  ('returns.manage', 'returns', 'Traiter les retours & avis', 'معالجة الإرجاع والتقييمات', 52),
  ('marketing.manage', 'marketing', 'Campagnes, Meta & studio social', 'الحملات وMeta واستوديو الإعلانات', 60),
  ('ai.use', 'ai', 'Utiliser les outils IA', 'استخدام أدوات الذكاء الاصطناعي', 70),
  ('ai.approve', 'ai', 'Valider les propositions IA sensibles', 'اعتماد مقترحات الذكاء الاصطناعي', 71),
  ('automations.manage', 'automations', 'Créer / gérer les automatisations', 'إدارة الأتمتة وسير العمل', 80),
  ('finances.view', 'finances', 'Consulter les finances & marges', 'عرض المالية والهوامش', 90),
  ('finances.manage', 'finances', 'Encaissements COD, charges & comptabilité', 'التحصيل والمصاريف والمحاسبة', 91),
  ('analytics.view', 'analytics', 'Tableaux de bord BI & exports', 'لوحات التحليل والتقارير', 100),
  ('settings.manage', 'settings', 'Paramètres boutique & CMS', 'إعدادات المتجر والواجهة', 110),
  ('rbac.manage', 'security', 'Gérer les rôles et permissions', 'إدارة الأدوار والصلاحيات', 111),
  ('audit.view', 'security', 'Consulter le journal d''audit', 'عرض سجل التدقيق', 112)
on conflict (code) do nothing;

insert into public.rbac_role_permissions (role_code, permission_code)
select 'super_admin', code from public.rbac_permissions
on conflict do nothing;

insert into public.rbac_role_permissions (role_code, permission_code)
select 'admin', code from public.rbac_permissions
on conflict do nothing;

insert into public.rbac_role_permissions (role_code, permission_code) values
  ('product_manager', 'dashboard.view'),
  ('product_manager', 'products.view'),
  ('product_manager', 'products.manage'),
  ('product_manager', 'categories.manage'),
  ('product_manager', 'inventory.view'),
  ('product_manager', 'ai.use'),
  ('purchasing_manager', 'dashboard.view'),
  ('purchasing_manager', 'products.view'),
  ('purchasing_manager', 'suppliers.manage'),
  ('purchasing_manager', 'purchases.manage'),
  ('purchasing_manager', 'imports.manage'),
  ('purchasing_manager', 'inventory.view'),
  ('purchasing_manager', 'analytics.view'),
  ('warehouse_manager', 'dashboard.view'),
  ('warehouse_manager', 'products.view'),
  ('warehouse_manager', 'inventory.view'),
  ('warehouse_manager', 'inventory.manage'),
  ('warehouse_manager', 'orders.view'),
  ('warehouse_manager', 'delivery.manage'),
  ('order_manager', 'dashboard.view'),
  ('order_manager', 'orders.view'),
  ('order_manager', 'orders.manage'),
  ('order_manager', 'delivery.manage'),
  ('order_manager', 'customers.view'),
  ('order_manager', 'returns.manage'),
  ('order_manager', 'inventory.view'),
  ('accountant', 'dashboard.view'),
  ('accountant', 'orders.view'),
  ('accountant', 'finances.view'),
  ('accountant', 'finances.manage'),
  ('accountant', 'analytics.view'),
  ('accountant', 'audit.view'),
  ('marketing_manager', 'dashboard.view'),
  ('marketing_manager', 'products.view'),
  ('marketing_manager', 'customers.view'),
  ('marketing_manager', 'customers.manage'),
  ('marketing_manager', 'marketing.manage'),
  ('marketing_manager', 'ai.use'),
  ('marketing_manager', 'automations.manage'),
  ('marketing_manager', 'analytics.view'),
  ('customer_support', 'dashboard.view'),
  ('customer_support', 'orders.view'),
  ('customer_support', 'customers.view'),
  ('customer_support', 'customers.manage'),
  ('customer_support', 'returns.manage'),
  ('analyst', 'dashboard.view'),
  ('analyst', 'products.view'),
  ('analyst', 'inventory.view'),
  ('analyst', 'orders.view'),
  ('analyst', 'customers.view'),
  ('analyst', 'finances.view'),
  ('analyst', 'analytics.view')
on conflict do nothing;

insert into public.user_rbac_roles (user_id, role_code)
select user_id, 'super_admin' from public.user_roles where role = 'admin'
on conflict do nothing;

insert into public.user_rbac_roles (user_id, role_code)
select user_id, 'order_manager' from public.user_roles where role = 'staff'
on conflict do nothing;

insert into public.user_rbac_roles (user_id, role_code)
select user_id, 'warehouse_manager' from public.user_roles where role = 'staff'
on conflict do nothing;

-- =====================================================================
-- 2. Enhance existing Audit Logs table (preserving original columns)
-- =====================================================================
alter table public.audit_logs
  add column if not exists actor_email text,
  add column if not exists module text,
  add column if not exists summary text;

create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_module on public.audit_logs(module);

-- =====================================================================
-- 3. Permission & Audit RPCs
-- =====================================================================
create or replace function public.has_permission(_perm text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.user_rbac_roles ur
      join public.rbac_role_permissions rp on rp.role_code = ur.role_code
      where ur.user_id = auth.uid()
        and (ur.role_code = 'super_admin' or rp.permission_code = _perm)
    );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.log_audit_event(
  _module text,
  _action text,
  _summary text,
  _entity_type text default null,
  _entity_id text default null,
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.audit_logs (
    actor_id,
    actor_email,
    module,
    action,
    entity,
    entity_id,
    summary,
    details
  )
  values (
    auth.uid(),
    v_email,
    _module,
    _action,
    coalesce(_entity_type, _module),
    _entity_id,
    _summary,
    coalesce(_metadata, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_audit_event(text, text, text, text, text, jsonb) from public;
grant execute on function public.log_audit_event(text, text, text, text, text, jsonb) to authenticated;

create or replace function public.get_my_rbac_profile()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_roles text[];
  v_perms text[];
begin
  if auth.uid() is null then
    return jsonb_build_object('roles', '[]'::jsonb, 'permissions', '[]'::jsonb);
  end if;

  select coalesce(array_agg(distinct role_code), array[]::text[])
  into v_roles
  from public.user_rbac_roles
  where user_id = auth.uid();

  if array_length(v_roles, 1) is null and public.is_admin() then
    v_roles := array['super_admin'];
  end if;

  if 'super_admin' = any(v_roles) or public.is_admin() then
    select coalesce(array_agg(code order by display_order), array[]::text[])
    into v_perms
    from public.rbac_permissions;
  else
    select coalesce(array_agg(distinct rp.permission_code), array[]::text[])
    into v_perms
    from public.user_rbac_roles ur
    join public.rbac_role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'roles', to_jsonb(coalesce(v_roles, array[]::text[])),
    'permissions', to_jsonb(coalesce(v_perms, array[]::text[]))
  );
end;
$$;

revoke all on function public.get_my_rbac_profile() from public;
grant execute on function public.get_my_rbac_profile() to authenticated;

create or replace function public.admin_assign_rbac_role(
  _user_id uuid,
  _role_code text,
  _grant boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_any_role boolean;
  v_is_admin_role boolean;
begin
  if not public.has_permission('rbac.manage') then
    raise exception 'forbidden';
  end if;

  if _user_id = auth.uid() and _role_code in ('super_admin', 'admin') and not _grant then
    raise exception 'Vous ne pouvez pas retirer votre propre rôle administrateur.';
  end if;

  if _grant then
    insert into public.user_rbac_roles (user_id, role_code, assigned_by)
    values (_user_id, _role_code, auth.uid())
    on conflict (user_id, role_code) do nothing;
  else
    delete from public.user_rbac_roles
    where user_id = _user_id and role_code = _role_code;
  end if;

  select exists(select 1 from public.user_rbac_roles where user_id = _user_id and role_code in ('super_admin', 'admin'))
  into v_is_admin_role;
  select exists(select 1 from public.user_rbac_roles where user_id = _user_id)
  into v_has_any_role;

  if v_is_admin_role then
    insert into public.user_roles (user_id, role) values (_user_id, 'admin') on conflict do nothing;
  else
    delete from public.user_roles where user_id = _user_id and role = 'admin';
  end if;

  if v_has_any_role and not v_is_admin_role then
    insert into public.user_roles (user_id, role) values (_user_id, 'staff') on conflict do nothing;
  elsif not v_has_any_role then
    delete from public.user_roles where user_id = _user_id and role = 'staff';
  end if;

  perform public.log_audit_event(
    'security',
    case when _grant then 'rbac.role_granted' else 'rbac.role_revoked' end,
    case when _grant then 'Rôle ' || _role_code || ' attribué' else 'Rôle ' || _role_code || ' retiré' end,
    'user',
    _user_id::text,
    jsonb_build_object('role_code', _role_code, 'grant', _grant)
  );
end;
$$;

revoke all on function public.admin_assign_rbac_role(uuid, text, boolean) from public;
grant execute on function public.admin_assign_rbac_role(uuid, text, boolean) to authenticated;

create or replace function public.admin_set_role_permission(
  _role_code text,
  _permission_code text,
  _grant boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rbac.manage') then
    raise exception 'forbidden';
  end if;

  if _role_code = 'super_admin' and not _grant then
    raise exception 'Les permissions du Super Administrateur ne peuvent pas être révoquées.';
  end if;

  if _grant then
    insert into public.rbac_role_permissions (role_code, permission_code)
    values (_role_code, _permission_code)
    on conflict do nothing;
  else
    delete from public.rbac_role_permissions
    where role_code = _role_code and permission_code = _permission_code;
  end if;

  perform public.log_audit_event(
    'security',
    case when _grant then 'rbac.permission_granted' else 'rbac.permission_revoked' end,
    'Permission ' || _permission_code || ' ' || case when _grant then 'activée' else 'désactivée' end || ' pour ' || _role_code,
    'role',
    _role_code,
    jsonb_build_object('permission_code', _permission_code, 'grant', _grant)
  );
end;
$$;

revoke all on function public.admin_set_role_permission(text, text, boolean) from public;
grant execute on function public.admin_set_role_permission(text, text, boolean) to authenticated;

-- RLS policies (idempotent creation without destructive DROP)
alter table public.rbac_roles enable row level security;
alter table public.rbac_permissions enable row level security;
alter table public.rbac_role_permissions enable row level security;
alter table public.user_rbac_roles enable row level security;
alter table public.audit_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rbac_roles' and policyname = 'rbac_roles_read') then
    create policy "rbac_roles_read" on public.rbac_roles for select to authenticated using (public.is_staff() or public.has_permission('rbac.manage'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rbac_permissions' and policyname = 'rbac_permissions_read') then
    create policy "rbac_permissions_read" on public.rbac_permissions for select to authenticated using (public.is_staff() or public.has_permission('rbac.manage'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rbac_role_permissions' and policyname = 'rbac_role_permissions_read') then
    create policy "rbac_role_permissions_read" on public.rbac_role_permissions for select to authenticated using (public.is_staff() or public.has_permission('rbac.manage'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_rbac_roles' and policyname = 'user_rbac_roles_read') then
    create policy "user_rbac_roles_read" on public.user_rbac_roles for select to authenticated using (user_id = auth.uid() or public.has_permission('rbac.manage') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_rbac_read') then
    create policy "audit_logs_rbac_read" on public.audit_logs for select to authenticated using (public.has_permission('audit.view') or public.is_admin());
  end if;
end $$;

-- =====================================================================
-- 4. Storefront Plus: Brands, Wishlists, Newsletter, Homepage CMS
-- =====================================================================
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  logo_url text,
  description_fr text,
  description_ar text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.brands (name, slug, description_fr, description_ar, display_order) values
  ('Maison Noura', 'maison-noura', 'Sélection signature de la maison', 'التشكيلة المميزة لدار نورة', 1),
  ('Aura Audio', 'aura-audio', 'Audio sans fil et acoustique nomade', 'صوتيات لاسلكية وعالية الجودة', 2),
  ('Atelier Home', 'atelier-home', 'Petit électroménager et arts de la table', 'أجهزة منزلية وفنون المائدة', 3)
on conflict (slug) do nothing;

alter table public.brands enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'brands' and policyname = 'brands_public_read') then
    create policy "brands_public_read" on public.brands for select using (is_active = true or public.has_permission('categories.manage'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'brands' and policyname = 'brands_admin_write') then
    create policy "brands_admin_write" on public.brands for all to authenticated using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));
  end if;
end $$;

alter table public.products
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists barcode text,
  add column if not exists weight_grams integer,
  add column if not exists dimensions_cm text,
  add column if not exists video_url text,
  add column if not exists seo_title_fr text,
  add column if not exists seo_title_ar text,
  add column if not exists seo_description_fr text,
  add column if not exists seo_description_ar text,
  add column if not exists landed_cost numeric(12,3);

create index if not exists idx_products_brand_id on public.products(brand_id);
create index if not exists idx_products_barcode on public.products(barcode) where barcode is not null;

create table if not exists public.wishlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists idx_wishlists_user on public.wishlists(user_id);
alter table public.wishlists enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishlists' and policyname = 'wishlists_own_all') then
    create policy "wishlists_own_all" on public.wishlists
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  locale text not null default 'fr' check (locale in ('fr', 'ar')),
  is_subscribed boolean not null default true,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

alter table public.newsletter_subscribers enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'newsletter_subscribers' and policyname = 'newsletter_staff_read') then
    create policy "newsletter_staff_read" on public.newsletter_subscribers
      for select to authenticated
      using (public.has_permission('marketing.manage') or public.is_admin());
  end if;
end $$;

create or replace function public.subscribe_newsletter(_email text, _locale text default 'fr')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text := lower(btrim(coalesce(_email, '')));
  v_loc text := case when _locale = 'ar' then 'ar' else 'fr' end;
begin
  if v_clean = '' or v_clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;
  insert into public.newsletter_subscribers (email, locale, is_subscribed, subscribed_at, unsubscribed_at)
  values (v_clean, v_loc, true, now(), null)
  on conflict (email) do update
    set is_subscribed = true, locale = excluded.locale, unsubscribed_at = null;
  return true;
end;
$$;

revoke all on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;

create table if not exists public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  title_fr text not null,
  title_ar text not null,
  subtitle_fr text,
  subtitle_ar text,
  is_enabled boolean not null default true,
  display_order integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.homepage_sections (section_key, title_fr, title_ar, subtitle_fr, subtitle_ar, is_enabled, display_order) values
  ('hero_banner', 'L''essentiel pour la maison et le quotidien', 'أساسيات الأناقة والمنزل لكل يوم', 'Mode, audio, électroménager et déco livrés dans les 24 gouvernorats', 'أزياء، صوتيات، أجهزة منزلية وديكور بتوصيل إلى 24 ولاية', true, 1),
  ('featured_categories', 'Nos catégories', 'أقسامنا', 'Explorez nos univers sélectionnés', 'اكتشف عالم منتجاتنا المختارة', true, 2),
  ('best_sellers', 'Sélection phare', 'الأكثر مبيعاً', 'Les pièces préférées de nos clients', 'المنتجات المفضلة لدى حرفائنا', true, 3),
  ('special_offers', 'Offres spéciales', 'عروض خاصة', 'Profitez de nos remises du moment', 'استفد من تخفيضاتنا الحالية', true, 4),
  ('new_arrivals', 'Nouveautés', 'وصل حديثاً', 'Derniers arrivages prêts à expédier', 'أحدث المنتجات الجاهزة للشحن', true, 5),
  ('recently_viewed', 'Récemment consultés', 'شاهدتها مؤخراً', 'Reprenez là où vous vous êtes arrêté', 'تابع التصفح من حيث توقفت', true, 6),
  ('testimonials', 'Avis de nos clients', 'آراء حرفائنا', 'Paiement à la livraison dans toute la Tunisie', 'الدفع عند الاستلام في كافة أنحاء تونس', true, 7),
  ('newsletter', 'Restez informé de nos arrivages', 'اشترك في نشرتنا البريدية', 'Recevez nos offres privées et nouveaux produits en avant-première', 'احصل على عروضنا الخاصة وأحدث المنتجات أولاً', true, 8)
on conflict (section_key) do nothing;

alter table public.homepage_sections enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'homepage_sections' and policyname = 'homepage_sections_public_read') then
    create policy "homepage_sections_public_read" on public.homepage_sections for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'homepage_sections' and policyname = 'homepage_sections_admin_write') then
    create policy "homepage_sections_admin_write" on public.homepage_sections
      for all to authenticated
      using (public.has_permission('settings.manage') or public.is_admin())
      with check (public.has_permission('settings.manage') or public.is_admin());
  end if;
end $$;

create or replace function public.admin_bulk_adjust_product_prices(
  _product_ids uuid[],
  _mode text,
  _delta numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if not public.has_permission('products.manage') then
    raise exception 'forbidden';
  end if;
  if _mode not in ('percent', 'fixed') then
    raise exception 'Mode invalide (percent ou fixed)';
  end if;
  if _product_ids is null or array_length(_product_ids, 1) is null then
    return 0;
  end if;

  if _mode = 'percent' then
    update public.products
    set price = greatest(1, round(price * (1 + _delta / 100.0), 3)),
        updated_at = now()
    where id = any(_product_ids);
    get diagnostics v_count = row_count;

    update public.product_variants
    set price = greatest(1, round(price * (1 + _delta / 100.0), 3)),
        updated_at = now()
    where product_id = any(_product_ids);
  else
    update public.products
    set price = greatest(1, round(price + _delta, 3)),
        updated_at = now()
    where id = any(_product_ids);
    get diagnostics v_count = row_count;

    update public.product_variants
    set price = greatest(1, round(price + _delta, 3)),
        updated_at = now()
    where product_id = any(_product_ids);
  end if;

  perform public.log_audit_event(
    'products',
    'products.bulk_price_update',
    'Mise à jour prix en masse sur ' || v_count || ' produit(s) (' || _mode || ': ' || _delta || ')',
    'products',
    null,
    jsonb_build_object('count', v_count, 'mode', _mode, 'delta', _delta)
  );

  return v_count;
end;
$$;

revoke all on function public.admin_bulk_adjust_product_prices(uuid[], text, numeric) from public;
grant execute on function public.admin_bulk_adjust_product_prices(uuid[], text, numeric) to authenticated;

-- Direct RLS write policies for RBAC management + atomic product duplication RPC
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rbac_role_permissions' and policyname = 'rbac_role_permissions_admin_write') then
    create policy "rbac_role_permissions_admin_write" on public.rbac_role_permissions
      for all to authenticated
      using (public.has_permission('rbac.manage'))
      with check (public.has_permission('rbac.manage'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_rbac_roles' and policyname = 'user_rbac_roles_admin_write') then
    create policy "user_rbac_roles_admin_write" on public.user_rbac_roles
      for all to authenticated
      using (public.has_permission('rbac.manage'))
      with check (public.has_permission('rbac.manage'));
  end if;
end $$;

create or replace function public.admin_duplicate_product(_source_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.products%rowtype;
  v_new_id uuid;
  v_suffix text := substr(md5(random()::text || clock_timestamp()::text), 1, 5);
  v_var record;
  v_new_var_id uuid;
begin
  if not public.has_permission('products.manage') then
    raise exception 'forbidden';
  end if;

  select * into v_src from public.products where id = _source_id;
  if not found then
    raise exception 'Produit source introuvable.';
  end if;

  insert into public.products (
    category_id, name_fr, name_ar, slug, sku, brand, brand_id, model, warranty,
    description_fr, description_ar, price, promo_price, status, is_featured,
    has_variants, barcode, weight_grams, dimensions_cm, video_url,
    seo_title_fr, seo_title_ar, seo_description_fr, seo_description_ar, landed_cost
  )
  values (
    v_src.category_id,
    v_src.name_fr || ' (Copie)',
    case when v_src.name_ar is not null then v_src.name_ar || ' (نسخة)' else null end,
    left(v_src.slug, 90) || '-' || v_suffix,
    left(v_src.sku, 48) || '-' || upper(v_suffix),
    v_src.brand,
    v_src.brand_id,
    v_src.model,
    v_src.warranty,
    v_src.description_fr,
    v_src.description_ar,
    v_src.price,
    v_src.promo_price,
    'draft',
    false,
    false,
    null,
    v_src.weight_grams,
    v_src.dimensions_cm,
    v_src.video_url,
    v_src.seo_title_fr,
    v_src.seo_title_ar,
    v_src.seo_description_fr,
    v_src.seo_description_ar,
    v_src.landed_cost
  )
  returning id into v_new_id;

  insert into public.product_images (product_id, url, storage_path, position)
  select v_new_id, url, storage_path, position
  from public.product_images
  where product_id = _source_id;

  select * into v_var
  from public.product_variants
  where product_id = _source_id and is_active = true
  order by created_at asc
  limit 1;

  insert into public.product_variants (product_id, sku, price, promo_price, is_active)
  values (
    v_new_id,
    left(v_src.sku, 48) || '-' || upper(v_suffix),
    coalesce(v_var.price, v_src.price),
    coalesce(v_var.promo_price, v_src.promo_price),
    true
  )
  returning id into v_new_var_id;

  insert into public.inventory (variant_id, available, reserved, low_stock_threshold)
  values (v_new_var_id, 0, 0, 5)
  on conflict (variant_id) do nothing;

  perform public.log_audit_event(
    'products',
    'products.duplicated',
    'Produit dupliqué : ' || v_src.name_fr,
    'product',
    v_new_id::text,
    jsonb_build_object('source_id', _source_id)
  );

  return v_new_id;
end;
$$;

revoke all on function public.admin_duplicate_product(uuid) from public;
grant execute on function public.admin_duplicate_product(uuid) to authenticated;
