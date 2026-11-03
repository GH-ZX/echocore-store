-- Security (2026-11-03 audit): a Sam invoice can never pay out more than it is
-- for. sam-api used to store whatever paidAmount a webhook body carried, and
-- complete_recharge_from_sam_invoice credited it uncapped, so a forged or leaked
-- webhook could mint any balance. The Binance RPC already caps; this matches it.

-- 1. A recharge credits at most the invoice amount.
CREATE OR REPLACE FUNCTION public.complete_recharge_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_ref text;
  v_paid numeric(12,2);
  v_credit numeric(10,2);
  v_rate numeric(12,2);
BEGIN
  SELECT * INTO v_inv FROM public.sam_invoices WHERE sam_invoice_id = p_sam_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'Invoice is not paid'; END IF;
  IF v_inv.entity_type IS DISTINCT FROM 'recharge' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row FROM public.recharge_requests WHERE id = v_inv.entity_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Recharge request not found'; END IF;

  IF v_row.status = 'approved' THEN
    SELECT balance INTO v_new_balance FROM public.profiles WHERE id = v_row.user_id;
    RETURN jsonb_build_object(
      'requestId', v_row.id, 'userId', v_row.user_id,
      'amount', COALESCE(v_row.credited_amount, v_row.amount),
      'requestedAmount', v_row.amount,
      'creditedAmount', COALESCE(v_row.credited_amount, v_row.amount),
      'newBalance', v_new_balance, 'status', 'approved', 'skipped', true);
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Recharge request is not awaiting payment confirmation';
  END IF;

  v_paid := round(COALESCE(v_inv.paid_amount, v_inv.amount)::numeric, 2);
  IF v_paid IS NULL OR v_paid <= 0 THEN RAISE EXCEPTION 'Paid amount is missing or invalid'; END IF;
  -- Never more than the invoice asked for, whatever was reported as paid.
  v_paid := LEAST(v_paid, round(v_inv.amount::numeric, 2));

  IF v_inv.currency = 'SYP' THEN
    v_rate := COALESCE(v_inv.syp_per_usd_snapshot, v_row.syp_per_usd_snapshot,
      (SELECT sam_syp_per_usd FROM store_settings WHERE id = 1));
    IF v_rate IS NULL OR v_rate <= 0 THEN RAISE EXCEPTION 'SYP exchange rate is not configured'; END IF;
    v_credit := round(v_paid / v_rate, 2);
  ELSE
    v_credit := round(v_paid, 2);
  END IF;
  -- And never more than the recharge the customer asked for.
  v_credit := LEAST(v_credit, COALESCE(v_inv.requested_usd_amount, v_row.amount));
  IF v_credit < 0.01 THEN RAISE EXCEPTION 'Paid amount too small to credit'; END IF;

  v_ref := COALESCE(nullif(trim(v_inv.transaction_ref), ''), nullif(trim(v_row.reference), ''), v_inv.sam_invoice_id);

  UPDATE public.profiles SET balance = COALESCE(balance, 0) + v_credit
  WHERE id = v_row.user_id RETURNING balance INTO v_new_balance;
  IF v_new_balance IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_credit, v_new_balance, v_row.payment_method, v_ref, 'completed');

  UPDATE public.recharge_requests
  SET status = 'approved', credited_amount = v_credit, reviewed_at = now(), updated_at = now()
  WHERE id = v_row.id;

  PERFORM public.notify_user(v_row.user_id, 'recharge_approved',
    jsonb_build_object('requestId', v_row.id, 'amount', v_credit, 'requestedAmount', v_row.amount,
      'creditedAmount', v_credit, 'paidAmount', v_paid, 'payCurrency', v_inv.currency,
      'newBalance', v_new_balance), '/profile');

  RETURN jsonb_build_object('requestId', v_row.id, 'userId', v_row.user_id, 'amount', v_credit,
    'requestedAmount', v_row.amount, 'creditedAmount', v_credit, 'paidAmount', v_paid,
    'payCurrency', v_inv.currency, 'newBalance', v_new_balance, 'status', 'approved');
END;
$function$;

-- 2. An order is completed only by a USD invoice that covers its total.
CREATE OR REPLACE FUNCTION public.complete_order_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_ref text;
  v_user_name text;
BEGIN
  SELECT * INTO v_inv FROM public.sam_invoices WHERE sam_invoice_id = p_sam_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'Invoice is not paid'; END IF;
  IF v_inv.entity_type IS DISTINCT FROM 'order' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_an_order');
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_inv.entity_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object('orderId', v_order.id, 'status', 'completed', 'skipped', true);
  END IF;
  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;
  IF v_inv.currency IS DISTINCT FROM 'USD'
     OR v_inv.amount + 0.001 < v_order.total
     OR COALESCE(v_inv.paid_amount, v_inv.amount) + 0.001 < v_order.total THEN
    RAISE EXCEPTION 'Invoice % does not cover order total %', p_sam_invoice_id, v_order.total;
  END IF;
  v_ref := COALESCE(nullif(trim(v_inv.transaction_ref), ''), nullif(trim(v_order.payment_reference), ''), v_inv.sam_invoice_id);
  UPDATE public.orders SET status = 'completed', payment_reference = COALESCE(nullif(trim(payment_reference), ''), v_ref) WHERE id = v_order.id;
  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  SELECT v_order.user_id, 'purchase', -v_order.total, p.balance, v_order.payment_method, v_ref, 'completed'
  FROM public.profiles p WHERE p.id = v_order.user_id;
  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM public.profiles WHERE id = v_order.user_id;
  PERFORM public.notify_user(v_order.user_id, 'order_completed',
    jsonb_build_object('orderId', v_order.id, 'total', v_order.total), '/success?orderId=' || v_order.id::text);
  PERFORM public.append_site_log('order', 'sam_paid', 'success', NULL, v_order.user_id,
    jsonb_build_object('orderId', v_order.id, 'total', v_order.total, 'reference', v_ref,
      'paymentMethod', v_order.payment_method, 'samInvoiceId', p_sam_invoice_id, 'userName', v_user_name));
  RETURN jsonb_build_object('orderId', v_order.id, 'status', 'completed');
END;
$function$;

-- Both stay service-role only (as set in 20261018090000).
REVOKE ALL ON FUNCTION public.complete_recharge_from_sam_invoice(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_order_from_sam_invoice(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_recharge_from_sam_invoice(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_from_sam_invoice(text) TO service_role;

-- 3. One wallet transfer pays one invoice.
CREATE UNIQUE INDEX IF NOT EXISTS sam_invoices_paid_transaction_ref_unique
  ON public.sam_invoices (lower(trim(transaction_ref)))
  WHERE status = 'paid' AND transaction_ref IS NOT NULL AND trim(transaction_ref) <> '';
