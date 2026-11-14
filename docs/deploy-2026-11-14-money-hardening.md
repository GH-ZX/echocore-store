# Deploy: money path hardening (2026-11-14)

Nothing here is deployed yet. Money-path rule: tests, a backup from the last 30 hours that you
restored once, your OK, and the rollback below. Deploy Sunday to Wednesday only.

**Needs the ECHOCORE owner's agreement first:** admins can no longer change a balance by
editing the profile row; every balance change goes through *Adjust balance*
(`admin_adjust_user_balance`), which the dashboard already uses. Tell them before shipping.

## What changes

| # | Change | Where |
|---|--------|-------|
| 1 | `fulfillOrder` re-reads the order after taking the per-order lock and decides only on that copy | `supabase/functions/g2bulk/index.ts`, `orderGate.ts` |
| 2 | A refund takes the influencer commission for that order back (ledger row, may go below 0) | migration, trigger on `orders` |
| 3 | `ensureCatalogItems` is admin-only (customers buy synced packs; live-only packs show a clear message) | `g2bulk/index.ts`, `src/lib/catalogPurchase.js` |
| 4 | Direct `UPDATE profiles.balance` from the API is refused (admins, service role included); `credit_user_balance` goes through `admin_adjust_user_balance` | migration |
| 5 | Daily 03:15 UTC check that each wallet equals its ledger: `balance_ledger_checks`, admin notification + Telegram when it changes, reminder every 7 days; `admin_record_ledger_correction` to close a gap after looking into it | migration |
| 6 | Dashboard → Orders → failed order → **Refund to balance**, same guards as the Telegram refund | migration, `AdminOrdersManager.jsx` |

The live store was in **sync** catalog mode on 2026-11-14, so item 3 does not change checkout there.
Expect the first ledger check to alert: a few wallets don't match their history today (counts in the
owner's notes, not here: this repo is public).

## Steps (in this order)

1. Backup: take a fresh encrypted dump of the ECHOCORE database and restore it once on a throwaway
   Postgres (not live). Note the time.
2. Tests on a schema-only copy of live (see the header of `scripts/test-money-sql.sh`):
   `PSQL_CONTAINER=<copy> scripts/test-money-sql.sh` → "money SQL tests passed". `npm test`.
3. Apply the migration: SQL editor → paste `supabase/migrations/20261114090000_money_hardening.sql`
   → run (one transaction; it snapshots the two functions it replaces first).
4. Check: `select public.run_balance_ledger_check();` (as postgres in the SQL editor) and read the result;
   `select jobname, schedule from cron.job where jobname = 'balance-ledger-daily';`.
5. Edge Function: `supabase functions deploy g2bulk` (one function). Keep the current version number
   (Dashboard → Edge Functions → g2bulk) to roll back to.
6. Site: merge to `main` (GitHub Pages deploys it). Open the dashboard, a failed order shows the button.

## Rollback

- Database: SQL editor → run `supabase/migrations/revert/20261114090000_revert_money_hardening.sql`
  (restores the old `credit_user_balance` / `telegram_refund_failed_order` from
  `echocore_backup.function_snapshots`, drops the triggers, functions and the cron job). Money already
  moved stays moved: those are real ledger rows.
- Edge Function: redeploy the previous `g2bulk` version (`git checkout <previous commit> --
  supabase/functions/g2bulk && supabase functions deploy g2bulk`).
- Site: revert the merge commit on `main`.
