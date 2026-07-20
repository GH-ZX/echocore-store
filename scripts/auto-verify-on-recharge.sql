-- Auto-verify (موثق) a customer when their wallet recharge succeeds.
-- Safe: only sets verified_at when currently NULL — never un-verifies or overwrites.
-- Apply: supabase db query --linked -f scripts/auto-verify-on-recharge.sql

CREATE OR REPLACE FUNCTION public.mark_user_verified_after_recharge(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Only promote role=user customers; leave admins alone.
  UPDATE public.profiles
  SET verified_at = now()
  WHERE id = p_user_id
    AND role = 'user'
    AND verified_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_user_verified_after_recharge(uuid) FROM public;

-- 1) Recharge request reaches approved (manual admin approve, Sam API, manual credit linked to request)
CREATE OR REPLACE FUNCTION public.on_recharge_success_auto_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  PERFORM public.mark_user_verified_after_recharge(NEW.user_id);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block the recharge if verify fails
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recharge_success_auto_verify ON public.recharge_requests;
CREATE TRIGGER recharge_success_auto_verify
  AFTER INSERT OR UPDATE OF status ON public.recharge_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.on_recharge_success_auto_verify();

REVOKE EXECUTE ON FUNCTION public.on_recharge_success_auto_verify() FROM public;

-- 2) Direct balance credit as type=recharge (credit_user_balance / Sam insert path)
CREATE OR REPLACE FUNCTION public.on_recharge_transaction_auto_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IS DISTINCT FROM 'recharge' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, 'completed') IS DISTINCT FROM 'completed'
     AND COALESCE(NEW.status, '') <> '' THEN
    -- Allow NULL/completed; skip failed statuses if ever used
    IF lower(NEW.status) IN ('failed', 'cancelled', 'pending') THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.mark_user_verified_after_recharge(NEW.user_id);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_recharge_auto_verify ON public.transactions;
CREATE TRIGGER transactions_recharge_auto_verify
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.on_recharge_transaction_auto_verify();

REVOKE EXECUTE ON FUNCTION public.on_recharge_transaction_auto_verify() FROM public;
