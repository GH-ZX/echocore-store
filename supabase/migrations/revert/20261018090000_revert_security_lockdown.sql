-- REVERT for 20261018090000_security_lockdown_service_only_rpcs.sql
-- Run manually (SQL editor) ONLY if the lockdown broke something.
-- WARNING: this re-opens the free-order / balance-minting hole. Prefer fixing forward.
--
-- Restores the exact pre-change function bodies and EXECUTE grants from
-- echocore_backup.function_snapshots (label '2026-10-18-security-lockdown').

DO $$
DECLARE
  s record;
  sig regprocedure;
BEGIN
  FOR s IN
    SELECT DISTINCT ON (proname, args) proname, args, definition, authenticated_exec, anon_exec
    FROM echocore_backup.function_snapshots
    WHERE label = '2026-10-18-security-lockdown'
      AND proname IN (
        'complete_order_from_sam_invoice','complete_recharge_from_sam_invoice',
        'cancel_order_from_sam_invoice','cancel_recharge_from_sam_invoice',
        'complete_recharge_from_binance_pay_order','apply_g2bulk_fulfillment',
        'acquire_order_fulfillment_lock','release_order_fulfillment_lock',
        'notify_user','notify_all_users','notify_all_admins','notify_admin_telegram',
        'list_admin_recharge_history_rows','list_admin_recharge_history',
        'upsert_profile_game_player_uid','purge_old_site_logs',
        'mark_user_verified_after_recharge','pay_influencer_commission_for_order',
        'append_site_log','try_append_site_log','check_fulfillment_invariants',
        'deduct_user_balance','protect_profile_sensitive_fields','expire_stale_pending_orders'
      )
    ORDER BY proname, args, taken_at
  LOOP
    EXECUTE s.definition;
    sig := format('public.%I(%s)', s.proname, s.args)::regprocedure;
    IF s.authenticated_exec THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    END IF;
    IF s.anon_exec THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', sig);
    END IF;
  END LOOP;
END $$;
