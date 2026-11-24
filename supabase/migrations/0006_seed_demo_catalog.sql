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