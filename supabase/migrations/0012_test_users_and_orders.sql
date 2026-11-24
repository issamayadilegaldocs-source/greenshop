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
