-- 0018 stored descriptions with literal backslash-n sequences; turn them into real newlines.
update public.products
set description_fr = replace(description_fr, '\n', E'\n'),
    description_ar = replace(description_ar, '\n', E'\n')
where description_fr like '%\n%' or description_ar like '%\n%';
