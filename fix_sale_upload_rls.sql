-- =====================================================
-- FIX: Image upload failed (new row violates row-level security)
-- + Ensure sale columns exist on offers
-- Run this entire block in Supabase SQL Editor (one time)
-- =====================================================

-- 1. Ensure sale columns exist on offers (if missing)
ALTER TABLE public.offers 
  ADD COLUMN IF NOT EXISTS sale_image_url text,
  ADD COLUMN IF NOT EXISTS is_sale boolean default false,
  ADD COLUMN IF NOT EXISTS original_price numeric(10,2);

-- 2. STORAGE POLICIES for the "product-images" bucket
-- These are required for admin uploads of game photos, logos, and sale photos.

-- Public reads (images load for visitors)
drop policy if exists "Public read product-images" on storage.objects;
create policy "Public read product-images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Admins (via profiles.role) can upload
drop policy if exists "Admins can upload to product-images" on storage.objects;
create policy "Admins can upload to product-images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images' 
    and exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Admins can update images
drop policy if exists "Admins can update product-images" on storage.objects;
create policy "Admins can update product-images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images' 
    and exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Admins can delete (cleanup)
drop policy if exists "Admins can delete from product-images" on storage.objects;
create policy "Admins can delete from product-images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images' 
    and exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- =====================================================
-- FINAL CHECKS / TROUBLESHOOTING
-- =====================================================
-- A. Go to Storage > Buckets > "product-images" > make sure it is PUBLIC (toggle on)
-- B. Table Editor > profiles > find your row > set role = 'admin'
-- C. Log out + log back in (or hard refresh) in the localhost app
-- D. Try adding a sale offer WITH a sale photo file again.
--
-- If still fails:
-- - Confirm you are logged in as the admin user in the app
-- - Check browser console for the exact error
-- - Re-run this script
-- - Verify policies exist: SELECT * FROM pg_policies WHERE tablename = 'objects';
--
-- Note: The upload uses supabase.storage.from('product-images').upload(...)
-- Public URLs will look like: .../storage/v1/object/public/product-images/xxx.jpg
-- =====================================================