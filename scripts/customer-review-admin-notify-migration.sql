-- Customer reviews: optional order link + notify admins on new pending review.
-- Run in Supabase SQL Editor (admin).

-- 1) Optional order_id for post-purchase reviews
ALTER TABLE public.customer_reviews
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_reviews_order_id_idx
  ON public.customer_reviews (order_id)
  WHERE order_id IS NOT NULL;

-- 2) Notify all admins when a customer submits a pending review
CREATE OR REPLACE FUNCTION public.on_customer_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.is_seed IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_all_admins(
    'admin_customer_review',
    jsonb_build_object(
      'reviewId', NEW.id,
      'authorName', NEW.author_name,
      'userName', NEW.author_name,
      'rating', NEW.rating,
      'message', left(coalesce(NEW.content, ''), 200),
      'orderId', NEW.order_id
    ),
    '/dashboard/reviews'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_review_notify_admins ON public.customer_reviews;
CREATE TRIGGER customer_review_notify_admins
  AFTER INSERT ON public.customer_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.on_customer_review_insert();

COMMENT ON FUNCTION public.on_customer_review_insert() IS
  'Notifies admins of new pending customer reviews for homepage moderation.';

-- 3) Remove seed/mock reviews (real storefront should start empty)
DELETE FROM public.customer_reviews WHERE is_seed = true;
