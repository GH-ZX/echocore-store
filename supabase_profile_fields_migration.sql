-- Profile photo + bio fields and avatar upload policies
-- Run in Supabase SQL Editor after supabase_complete_schema.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS bio text;

-- Allow authenticated users to upload/update/delete only their own avatar files
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
  );