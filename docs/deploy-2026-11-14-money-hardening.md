# Deploy: money path hardening (2026-11-14)

Nothing here is deployed yet. Money-path rule: tests, a backup from the last 30 hours that you
restored once, your OK, and the rollback below. Deploy Sunday to Wednesday only.

**Needs the ECHOCORE owner's agreement first:** admins can no longer change a balance by
editing the profile row; every balance change goes through *Adjust balance*
(`admin_adjust_user_balance`), which the dashboard already uses. Tell them before shipping.

## First, on its own: paid orders that waited for payment

`supabase/migrations/20261114080000_fix_manual_order_waiting_trigger.sql` fixes a live bug: any order
that goes from "awaiting payment" to "paid" fails in the database (admin approval of a manual
ShamCash order, Sam API paid orders). Wallet orders are not affected; no such order was waiting on
2026-11-14. It changes one trigger function, needs nothing else, and can be applied before the rest
(SQL editor → paste → run). Check: approve one test order payment. Rollback: none needed (the old
body is the broken one; it is in `20261107090000_manual_products_and_categories.sql`).

## What changes

| # | Change | Where |
|---|--------|-------|
| 1 | `fulfillOrder` re-reads the order after taking the per-order lock and decides only on that copy | `supabase/functions/g2bulk/index.ts`, `orderGate.ts` |
| 2 | A refund takes the influencer commission for that order back (ledger row, may go below 0) | migration, trigger on `orders` |
| 3 | `ensureCatalogItems` is admin-only (customers buy synced packs; live-only packs show a clear message) | `g2bulk/index.ts`, `src/lib/catalogPurchase.js` |
| 4 | Direct `UPDATE profiles.balance` from the API is refused (admins, service role included); the browser can no longer call `credit_user_balance` ("approve recharge" still uses it inside the database) | migration |
| 5 | Daily 03:15 UTC check that each wallet equals its ledger: `balance_ledger_checks`, admin notification + Telegram when it changes, reminder every 7 days; `admin_record_ledger_correction` to close a gap after looking into it | migration |
| 6 | Dashboard → Orders → failed order → **Refund to balance**, same guards as the Telegram refund | migration, `AdminOrdersManager.jsx` |
| 7 | Recharge and purchase notifications reworded (Arabic MSA + English) and fixed: order number and items in every message, admin Telegram alerts in the chat's language, right amounts and methods. Needs the owner's OK on the texts (approval page linked in the PR). Findings: `docs/notifications-2026-11-14.md` | `20261114100000_notification_wording.sql`, `notifications.js`, translations |

The live store was in **sync** catalog mode on 2026-11-14, so item 3 does not change checkout there.
Expect the first ledger check to alert: a few wallets don't match their history today (counts in the
owner's notes, not here: this repo is public).

## Steps (in this order)

1. Backup: take a fresh encrypted dump of the ECHOCORE database and restore it once on a throwaway
   Postgres (not live). Note the time.
2. Tests on a schema-only copy of live (see the header of `scripts/test-money-sql.sh`):
   `PSQL_CONTAINER=<copy> scripts/test-money-sql.sh` → "money SQL tests passed". `npm test`.
3. Apply the migrations in order (SQL editor → paste → run; each is one transaction and snapshots
   what it replaces first): `20261114080000` (if not applied already), `20261114090000_money_hardening.sql`,
   then `20261114100000_notification_wording.sql` once the owner approved the texts.
4. Check: `select public.run_balance_ledger_check();` (as postgres in the SQL editor) and read the result;
   `select jobname, schedule from cron.job where jobname = 'balance-ledger-daily';`.
5. Edge Function: `supabase functions deploy g2bulk` (one function). Keep the current version number
   (Dashboard → Edge Functions → g2bulk) to roll back to.
6. Site: merge to `main` (GitHub Pages deploys it). Open the dashboard, a failed order shows the button.

## Rollback

- Notifications: SQL editor → `supabase/migrations/revert/20261114100000_revert_notification_wording.sql`
  (old texts back; run it before the money revert if both are reverted).
- Database: SQL editor → run `supabase/migrations/revert/20261114090000_revert_money_hardening.sql`
  (restores the old `credit_user_balance` / `telegram_refund_failed_order` from
  `echocore_backup.function_snapshots`, drops the triggers, functions and the cron job). Money already
  moved stays moved: those are real ledger rows.
- Edge Function: redeploy the previous `g2bulk` version (`git checkout <previous commit> --
  supabase/functions/g2bulk && supabase functions deploy g2bulk`).
- Site: revert the merge commit on `main`.
