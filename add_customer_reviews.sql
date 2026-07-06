-- =====================================================
-- ECHOCORE STORE — Customer reviews (full reset)
-- Run in Supabase SQL Editor
--
-- WARNING: This script DELETES all existing customer reviews
-- and recreates the table, policies, RPC, and seed data.
-- Safe to re-run any time you want a clean slate.
-- =====================================================

-- 1) Tear down previous objects
DROP FUNCTION IF EXISTS public.get_approved_customer_reviews();

DROP POLICY IF EXISTS "Public read approved reviews" ON public.customer_reviews;
DROP POLICY IF EXISTS "Users submit pending reviews" ON public.customer_reviews;
DROP POLICY IF EXISTS "Admins manage reviews" ON public.customer_reviews;

DROP TABLE IF EXISTS public.customer_reviews;

-- 2) Table — single content field (no bilingual columns)
CREATE TABLE public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  content text NOT NULL,
  rating smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_seed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_reviews_status_idx
  ON public.customer_reviews (status);

CREATE INDEX customer_reviews_sort_idx
  ON public.customer_reviews (sort_order, created_at DESC);

-- 3) Row Level Security
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read approved reviews"
  ON public.customer_reviews
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

CREATE POLICY "Users submit pending reviews"
  ON public.customer_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND is_seed = false
  );

CREATE POLICY "Admins manage reviews"
  ON public.customer_reviews
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 4) Public RPC — approved reviews for storefront
CREATE OR REPLACE FUNCTION public.get_approved_customer_reviews()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id', id,
        'author_name', author_name,
        'content', content,
        'rating', rating,
        'sort_order', sort_order,
        'created_at', created_at
      )
      ORDER BY sort_order ASC, created_at DESC
    ),
    '[]'::json
  )
  FROM public.customer_reviews
  WHERE status = 'approved';
$$;

GRANT EXECUTE ON FUNCTION public.get_approved_customer_reviews() TO anon, authenticated;

-- 5) Seed starter reviews
INSERT INTO public.customer_reviews (
  author_name,
  content,
  rating,
  status,
  is_seed,
  sort_order
) VALUES
  (
    'Khaled M.',
    'توصيل سريع وأسعار ممتازة. شحنت VP لفالورانت خلال أقل من دقيقة.',
    5,
    'approved',
    true,
    1
  ),
  (
    'Sara A.',
    'واجهة المتجر جميلة والدفع سلس. ShamCash اشتغل بدون أي مشكلة.',
    5,
    'approved',
    true,
    2
  ),
  (
    'Omar H.',
    'أفضل أسعار لقيتها لشحن الألعاب. الدعم رد بسرعة على الديسكورد.',
    5,
    'approved',
    true,
    3
  ),
  (
    'Layla R.',
    'موثوق كل مرة. أستخدم ECHOCORE لشراء RP في لول أسبوعياً.',
    5,
    'approved',
    true,
    4
  );