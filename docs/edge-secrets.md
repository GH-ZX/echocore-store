# Edge secrets checklist (G2Bulk / Sam / IGDB)

**Goal:** long-lived API keys never show up in the browser (Network tab / admin `select *`).

## Preferred storage

| Secret | Where to set | Client sees |
|--------|----------------|-------------|
| `G2BULK_API_KEY` | Supabase → Edge Functions → Secrets | only `g2bulk_api_key_set` / masked via admin RPC |
| `SAM_API_KEY` | Edge Secrets | only `sam_api_key_set` / masked |
| `SAM_WEBHOOK_SECRET` | Edge Secrets | never |
| `G2BULK_CRON_SECRET` | Edge Secrets + Vault for cron | never |
| IGDB client id/secret | Admin → Products (edge) or Edge Secrets | masked only |

DB columns may still exist for legacy paste-in-admin flows. Edge env **wins** when both are set (see `g2bulk` / `sam-api` functions).

## Client rules (code)

- Never `.select('*')` on `store_settings` without filtering secrets.
- Use `STORE_SETTINGS_CLIENT_SELECT` + `stripStoreSecrets()` from `src/lib/storeSecrets.js`.
- Admin G2Bulk / Sam panels load settings via **masked** edge/RPC responses, not raw keys.
- Offer wholesale cost: admin RPC `admin_get_offer_wholesale` only (do **not** `REVOKE SELECT` on `offers` — breaks the store).

## Quick verify

1. Logged out → Network → `store_settings` or offers: no full API keys.
2. Admin G2Bulk: shows “key set” / masked, not the full key after save.
3. Supabase Dashboard → Edge Functions → Secrets: `G2BULK_API_KEY`, `SAM_API_KEY` present if you use those providers.

## After rotating a key

1. Update Edge secret.
2. Optionally clear the DB column in SQL (admin) so only edge holds it.
3. Test connection from Admin → G2Bulk / Payments.
