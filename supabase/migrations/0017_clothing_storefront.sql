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
