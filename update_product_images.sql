-- =====================================================
-- 1. ADD logo_url COLUMN (run once if you don't have it yet)
-- =====================================================
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS logo_url text;

-- =====================================================
-- 2. UPDATE PRODUCT IMAGES (covers + logos)
-- Run this AFTER uploading files to the "product-images" bucket
-- =====================================================

-- Base Storage URL
-- https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/

-- Covers (main images)
UPDATE public.products
SET image_url = 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/valorant.png'
WHERE name_en = 'Valorant';

UPDATE public.products
SET image_url = 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/lol.png'
WHERE name_en = 'League of Legends';

UPDATE public.products
SET image_url = 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/xboxpass.png'
WHERE name_en = 'Xbox PC Game Pass 1 Month';

-- Logos (for the carousel thumbnail strip)
UPDATE public.products
SET logo_url = 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/valorant-logo.png'
WHERE name_en = 'Valorant';

UPDATE public.products
SET logo_url = 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/lol-logo.png'
WHERE name_en = 'League of Legends';

UPDATE public.products
SET logo_url = 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/xbox-logo.png'
WHERE name_en = 'Xbox PC Game Pass 1 Month';

-- Optional: You can also add images for other products later
-- Example for Steam (if you upload more files):
-- UPDATE public.products
-- SET image_url = 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/steam-cover.png'
-- WHERE name_en = 'Steam Wallet $20';

-- After running this, refresh your website.
-- The main product cards and carousel should now show the real images.

-- To verify, you can run this query:
-- SELECT name_en, image_url FROM public.products WHERE image_url IS NOT NULL;
