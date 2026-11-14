#!/usr/bin/env bash
# Money-path SQL tests: 20261114090000_money_hardening.sql and 20261114100000_notification_wording.sql.
#
# Run them against a SCHEMA-ONLY copy of the live database, never against live itself:
#   supabase db dump --linked -f /tmp/live_schema.sql          # structure only, no rows
#   docker run -d --name echocore-schema -e POSTGRES_PASSWORD=postgres \
#     public.ecr.aws/supabase/postgres:17.6.1.143
#   # (match live grants: revoke the image's default function grants before loading)
#   docker exec -i echocore-schema psql -U supabase_admin -d postgres -c \
#     "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;"
#   docker exec -i echocore-schema psql -U supabase_admin -d postgres -q < /tmp/live_schema.sql
#   PSQL_CONTAINER=echocore-schema scripts/test-money-sql.sh
# or with a connection string to a throwaway database: DATABASE_URL=postgres://… scripts/test-money-sql.sh
#
# Each phase runs inside one transaction that is rolled back: the database is left unchanged.
set -euo pipefail

cd "$(dirname "$0")/.."
FIX=supabase/migrations/20261114080000_fix_manual_order_waiting_trigger.sql
FIX_TEST=scripts/sql/manual_order_waiting_fix.test.sql
MIG=supabase/migrations/20261114090000_money_hardening.sql
REV=supabase/migrations/revert/20261114090000_revert_money_hardening.sql
TESTS=scripts/sql/money_hardening.test.sql
MIG2=supabase/migrations/20261114100000_notification_wording.sql
REV2=supabase/migrations/revert/20261114100000_revert_notification_wording.sql
TESTS2=scripts/sql/notification_wording.test.sql

run_sql() {
  if [ -n "${PSQL_CONTAINER:-}" ]; then
    docker exec -i "$PSQL_CONTAINER" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
  elif [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"
  else
    echo "Set PSQL_CONTAINER or DATABASE_URL (a throwaway schema-only copy, never live)." >&2
    exit 2
  fi
}

echo "== 0/2 the order-completion fix on its own (rolled back)"
{ echo 'BEGIN;'; cat "$FIX" "$FIX_TEST"; echo 'ROLLBACK;'; } | run_sql

echo "== 1/2 all migrations + tests (rolled back)"
{ echo 'BEGIN;'; cat "$FIX" "$MIG" "$MIG2" "$TESTS" "$TESTS2"; echo 'ROLLBACK;'; } | run_sql

echo "== 2/2 migrations + reverts restore the old functions (rolled back)"
{
  echo 'BEGIN;'
  cat <<'SQL'
CREATE TEMP TABLE money_pre AS
SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS def, coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(p.proacl) a), '') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('credit_user_balance', 'telegram_refund_failed_order',
  'notify_user', 'notify_admin_telegram', 'on_recharge_status_telegram_dm', 'notify_linked_user_telegram',
  'on_order_completed_notify_admins', 'on_order_paid_telegram_alert');
SQL
  cat "$FIX" "$MIG" "$MIG2"
  sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' "$REV2"
  sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' "$REV"
  cat <<'SQL'
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pre.proname, pre.def = md5(pg_get_functiondef(p.oid)) AS same_def,
           pre.acl = coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(p.proacl) a), '') AS same_acl
    FROM money_pre pre
    JOIN pg_proc p ON p.proname = pre.proname
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  LOOP
    IF NOT r.same_def OR NOT r.same_acl THEN
      RAISE EXCEPTION 'FAIL revert: % not restored (definition %, grants %)', r.proname, r.same_def, r.same_acl;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('zz_profiles_balance_via_rpc_only', 'orders_reverse_commission_on_refund'))
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('admin_refund_failed_order', 'refund_failed_order_internal',
                                                         'run_balance_ledger_check', 'guard_direct_balance_write',
                                                         'admin_record_ledger_correction', 'telegram_alert_text',
                                                         'notif_money', 'notif_ltr', 'notif_method_label'))
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'balance-ledger-daily') THEN
    RAISE EXCEPTION 'FAIL revert: something the migration added is still there';
  END IF;
END $$;
SELECT 'revert: old functions and grants restored' AS result;
SQL
  echo 'ROLLBACK;'
} | run_sql

echo "== money SQL tests passed"
