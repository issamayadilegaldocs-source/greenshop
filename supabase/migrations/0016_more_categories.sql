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
