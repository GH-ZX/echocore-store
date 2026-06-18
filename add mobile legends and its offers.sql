-- =====================================================
-- Add Mobile Legends (MLBB) + Sample Offers
-- This script safely adds the missing logo_url column if needed
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add missing logo_url column (if your games table was created from an older schema)
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS logo_url text;

-- Add the game and its offers
DO $$
DECLARE
  ml_game_id uuid;
BEGIN
  -- Insert the game (idempotent)
  INSERT INTO public.games (name_en, name_ar, slug, points_name, image_url, logo_url, active)
  VALUES (
    'Mobile Legends', 
    'موبايل ليجيندز', 
    'mobile-legends', 
    'Diamonds', 
    'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/mobile-legends.png',
    'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/mobile-legends-logo.png',
    true
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO ml_game_id;

  -- Get existing game id if it already existed
  IF ml_game_id IS NULL THEN
    SELECT id INTO ml_game_id 
    FROM public.games 
    WHERE slug = 'mobile-legends' 
    LIMIT 1;
  END IF;

  -- Insert offers for Mobile Legends
  INSERT INTO public.offers (game_id, name_en, name_ar, price, region, description_en, description_ar, active)
  VALUES 
    (ml_game_id, '86 Diamonds', '86 ألماس', 1.99, 'Global',
     'Quick top-up to boost your hero progress.', 'شحن سريع لتطوير أبطالك.',
     true),
    (ml_game_id, '172 Diamonds', '172 ألماس', 3.99, 'Global',
     'Great value for new skins and emotes.', 'قيمة ممتازة للجلود والإيموجي الجديدة.',
     true),
    (ml_game_id, '257 Diamonds', '257 ألماس', 5.99, 'Global',
     'Mid-tier diamond pack for serious players.', 'حزمة ألماس متوسطة للاعبين الجادين.',
     true),
    (ml_game_id, '344 Diamonds', '344 ألماس', 7.99, 'Global',
     'Popular choice for battle passes.', 'الخيار الشائع لبطاقات المعارك.',
     true),
    (ml_game_id, 'Weekly Diamond Pass', 'بطاقة الألماس الأسبوعية', 4.99, 'Global',
     'Get daily diamonds and exclusive rewards for a week.', 'احصل على ألماس يومي ومكافآت حصرية لمدة أسبوع.',
     true),
    (ml_game_id, 'Starlight Member', 'عضوية ستارلايت', 9.99, 'Global',
     'Monthly pass with tons of diamonds, skins, and bonuses.', 'بطاقة شهرية مليئة بالألماس والجلود والمكافآت.',
     true);

END $$;