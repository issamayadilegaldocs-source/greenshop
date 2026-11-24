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
