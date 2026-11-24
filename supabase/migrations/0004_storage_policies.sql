-- =========================================================
-- Storage: private buckets + object policies
-- =========================================================
-- Both buckets are private. The app uploads files and stores long-lived signed
-- URLs on catalog rows (see src/lib/storage.ts), so anonymous shoppers can still
-- render images without a public bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog', 'catalog', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('return-photos', 'return-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

-- Catalog images: anyone can read (signed links), only admins write
create policy "Catalog images readable" on storage.objects for select to anon, authenticated
  using (bucket_id = 'catalog');
create policy "Admins upload catalog images" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and public.is_admin());
create policy "Admins update catalog images" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and public.is_admin());
create policy "Admins delete catalog images" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and public.is_admin());

-- Return photos: customers write into their own folder; owner + staff read
create policy "Customers upload own return photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'return-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owner or staff read return photos" on storage.objects for select to authenticated
  using (bucket_id = 'return-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
create policy "Owner deletes own return photos" on storage.objects for delete to authenticated
  using (bucket_id = 'return-photos' and (storage.foldername(name))[1] = auth.uid()::text);
