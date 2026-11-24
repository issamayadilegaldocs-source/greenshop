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
