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
