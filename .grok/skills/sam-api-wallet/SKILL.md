---
name: sam-api-wallet
description: >
  Sam API (sam-api.pro) wallet + invoice integration for ECHOCORE Store.
  Use when implementing ShamCash/Syriatel payments, wallet API, invoice webhooks,
  manual vs API payment mode toggle, recharge automation, or checkout payment flows.
  Triggers on: Sam API, sam-api.pro, shamcash api, syriatel cash, wallet integration,
  invoice webhook, payment mode manual api, recharge automation.
---

# Sam API Wallet — ECHOCORE Integration Skill

Read `references/api-docs.md` for the full endpoint reference (static copy of https://sam-api.pro/api-docs).

## Product goal

Integrate **Sam API** while **keeping manual ShamCash mode** exactly as it works today. Admin chooses in dashboard:

| Mode | Customer experience | Admin work |
|------|---------------------|------------|
| **Manual** (current) | QR + pay code → user pays in app → marks sent → admin approves | Review `recharge_requests` / orders |
| **API** (new) | Sam invoice (`paymentUrl`) + optional ref verify → webhook auto-confirms | Monitor failures, re-link wallet if `WALLET_SESSION_EXPIRED` |

Both modes can coexist as a **toggle** — not a replacement.

---

## ECHOCORE context (existing code)

| Area | Path | Notes |
|------|------|-------|
| Manual recharge UI | `src/views/RechargeView.jsx` | QR, pay code, `createRechargeRequest` |
| Payment methods | `src/lib/paymentMethods.js` | Gates ShamCash on `shamcashManualReady` |
| Admin payments | `src/components/admin/AdminPaymentsSettings.jsx` | Manual QR section + legacy ShamCash API block |
| Store settings | `src/lib/storeSettings.js` | `store_settings` row `id=1` |
| Public payment config | RPC `get_payment_methods()` in `supabase_echocore_full.sql` | Never expose API keys |
| Legacy ShamCash helper | `src/lib/shamcashApi.js` | **Different API** — do not confuse with Sam API |
| Edge functions pattern | `supabase/functions/g2bulk/` | Mirror for `sam-api` |

**i18n:** all new UI strings → `src/data/translations.js` (AR + EN). Follow `echocore-standards` skill.

---

## Architecture rules

### Security architecture (mandatory)

#### Layer 1 — Secret storage

| Secret | Where | Never in |
|--------|-------|----------|
| `sk_...` Sam API key | `store_settings.sam_api_key` (admin RLS) **or** Edge secret `SAM_API_KEY` | React, `VITE_*`, `get_payment_methods()`, logs, toasts |
| Webhook token | `store_settings.sam_webhook_secret` (auto-generated) | Public RPCs; expose only masked + full URL to **admins** |

Env `SAM_API_KEY` overrides DB (same pattern as G2Bulk). Edge function resolves key server-side only.

#### Layer 2 — Edge function gate (`sam-api`)

| Route | Auth required |
|-------|---------------|
| `getSettings`, `saveSettings`, `listWallets`, `getBalance` | Valid JWT + `profiles.role = 'admin'` |
| `createInvoice`, `verifyInvoice` (PR 3) | Valid JWT + user owns `entity_id` **or** admin |
| `webhook` | Query `?token=<sam_webhook_secret>` **must** match DB; no JWT |

Reject: missing JWT on admin actions, non-admin, wrong webhook token, cron/service impersonation (not used here).

#### Layer 3 — Webhook hardening

1. **Token in URL** — `webhookUrl` includes `?token=` so random callers cannot POST.
2. **DB match** — `invoiceId` must exist in `sam_invoices` with `status = 'pending'`.
3. **Field match** — `amount`, `currency`, `method` must equal stored row (prevent swap attacks).
4. **Idempotent** — duplicate `invoice.paid` → HTTP 200, no double credit.
5. **Service role only** — balance credit via `SECURITY DEFINER` RPC, not client update.

#### Layer 4 — Database

- `store_settings` Sam columns: admin RLS only (existing policy).
- `sam_invoices`: users read own rows; admins read all; inserts/updates via Edge + RPC only.
- `get_payment_methods()` exposes **flags only** (`walletMode`, `samApiReady`) — never keys.

#### Layer 5 — Client

- `src/lib/samApi.js` → `supabase.functions.invoke('sam-api')` only.
- Admin UI loads settings via `getSettings` (masked key).
- Save sends new key only when field changed; empty = keep existing.
- Customer views never call Sam endpoints directly.

#### Layer 6 — Operational

- Rotate API key: admin saves new `sk_` in dashboard.
- Rotate webhook: `regenerateWebhookSecret` admin action → update Sam invoice config.
- Log webhook events to `sam_invoices.webhook_received_at` (no PII in client logs).
- HTTPS only for `webhookUrl` (Supabase functions URL).

#### Threat model (out of scope / accepted)

- Sam API platform compromise (trust upstream).
- Admin account takeover (mitigate: strong auth, few admins).
- No HMAC on Sam webhooks in their docs — mitigated by URL token + DB validation.

### Dual-mode config (proposed `store_settings` columns)

```sql
sam_api_key              text          -- admin only, never public
sam_wallet_mode          text          -- 'manual' | 'api'  (default 'manual')
sam_invoice_method       text          -- 'shamcash' | 'syriatel'
sam_wallet_identifier    text          -- receiving wallet id/phone/address
sam_invoice_currency     text          -- 'USD' | 'SYP' | 'EUR'
sam_api_enabled          boolean       -- master switch for API path
```

Extend `get_payment_methods()` to expose **flags only**:

```json
{
  "walletMode": "manual",
  "samApiReady": false,
  "samInvoiceMethod": "shamcash",
  "samInvoiceCurrency": "USD"
}
```

`paymentMethods.js` logic:

- `walletMode === 'manual'` → require `shamcashManualReady` (unchanged)
- `walletMode === 'api'` → require `samApiReady` (key + identifier configured)
- If both configured, dashboard picks active mode; optional future: per-flow override

---

## Recommended flows

### A. Manual mode (keep as-is)

No Sam API calls. Flow unchanged:

1. `RechargeView` → `create_recharge_request` RPC
2. Show QR + `shamcashPayCode`
3. User → `mark_recharge_payment_sent`
4. Admin approves → `credit_user_balance`

### B. API mode — balance recharge

```
Customer                ECHOCORE                 Sam API
   |                        |                        |
   |-- start recharge ----->|                        |
   |                        |-- POST /v1/invoices -->|
   |<-- paymentUrl ---------|<-- invoiceId ----------|
   |-- pays in wallet app ->|                        |
   |-- enters txn ref ----->|-- POST /pay/.../verify>|
   |                        |<-- webhook paid -------|
   |                        |-- credit balance       |
```

Implementation steps:

1. New table `sam_invoices` (or extend `recharge_requests`):
   - `sam_invoice_id`, `payment_url`, `expires_at`, `status`, `transaction_ref`, `webhook_received_at`
2. Edge function action `createInvoice` → calls Sam `POST /v1/invoices`
   - `webhookUrl`: `https://<project>.supabase.co/functions/v1/sam-api/webhook`
3. `RechargeView` API branch:
   - Show amount + link/open `paymentUrl` (iframe or new tab)
   - Input for `transactionRef` → edge `verifyInvoice`
   - Poll invoice status OR wait for webhook
4. Webhook handler:
   - `invoice.paid` → idempotent credit (match `invoiceId` to pending recharge)
   - `invoice.expired` → mark request cancelled

### C. API mode — store orders (ShamCash checkout)

Same invoice pattern tied to `orders` instead of `recharge_requests`. Reuse `sam_invoices` with `entity_type` + `entity_id`.

### D. Admin dashboard

Extend `AdminPaymentsSettings.jsx`:

1. **Section 1 — Manual ShamCash** (existing QR block) — always visible
2. **Section 2 — Sam API**
   - API key (password field)
   - Mode toggle: `Manual cash` / `Sam API invoices`
   - Test connection → `GET /v1/wallets` via edge function
   - Wallet picker dropdown from wallets list
   - Method: ShamCash / Syriatel
   - Currency: USD / SYP / EUR
   - Save → `saveStoreSettings` + new admin RPC if needed

---

## Edge function sketch (`supabase/functions/sam-api/index.ts`)

Actions (JSON body `{ action, ... }`):

| action | Sam endpoint | Auth |
|--------|--------------|------|
| `listWallets` | `GET /v1/wallets` | Bearer |
| `getBalance` | `GET /v1/wallets/{provider}/{id}/balance` | Bearer |
| `createInvoice` | `POST /v1/invoices` | Bearer |
| `getInvoice` | `GET /pay/{invoiceId}` | none |
| `verifyInvoice` | `POST /pay/{invoiceId}/verify` | none |
| `webhook` | inbound POST | validate payload |

CORS headers: copy pattern from `g2bulk/index.ts`.

Client wrapper: `src/lib/samApi.js`

```js
import { supabase } from './supabase';
export async function invokeSamApi(body) {
  const { data, error } = await supabase.functions.invoke('sam-api', { body });
  if (error) throw error;
  return data;
}
```

---

## Implementation phases (PR plan)

### PR 1 — Knowledge + schema (no UX change)
- This skill + `references/api-docs.md` ✓
- SQL migration block in `supabase_echocore_full.sql`: new columns + `sam_invoices` table
- Update `get_payment_methods()` with mode flags

### PR 2 — Edge function + admin
- `supabase/functions/sam-api/index.ts`
- `src/lib/samApi.js`
- Admin UI: mode toggle, test wallets, save settings
- i18n keys

### PR 3 — API recharge flow
- `RechargeView` branches on `paymentConfig.walletMode`
- Manual path untouched
- API path: create invoice, verify UI, webhook credit

### PR 4 — Orders + polish
- Checkout ShamCash API path
- Error mapping (`EXPIRED`, `INVALID_IDENTIFIER`, `WALLET_SESSION_EXPIRED`)
- Admin invoice log / retry

---

## Currency & amount mapping

| Store context | Sam API |
|---------------|---------|
| Recharge USD balance | `currency: "USD"`, `amount` string |
| SYP top-up (future) | `currency: "SYP"` |
| ShamCash transfer | `currencyId`: 1=USD, 2=SYP, 3=EUR |

Recharge limits today: $5–$500 (`create_recharge_request`). Keep same validation before creating Sam invoice.

---

## Error handling (user-facing)

Map Sam codes to `t.*` keys:

| Code | Admin message | Customer message |
|------|---------------|------------------|
| `INVALID_API_KEY` | Re-enter API key | Payment unavailable |
| `WALLET_SESSION_EXPIRED` | Re-link wallet in Sam dashboard | Try again later |
| `EXPIRED` | — | Invoice expired, start again |
| `VALIDATION_ERROR` | Check identifier/currency | Invalid payment request |
| `PROVIDER_ERROR` | Show provider message | Payment failed |

---

## Do NOT

- Remove manual QR / pay code flow
- Call Sam API directly from browser
- Expose `sk_` keys in network tab from storefront
- Mix up `shamcashApi.js` (old merchant API) with Sam API (`sam-api.pro`)
- Add inline bilingual strings

---

## Quick checklist before shipping API mode

- [ ] Edge function deployed with `SAM_API_KEY` or DB-backed key
- [ ] Webhook URL reachable from sam-api.pro (public HTTPS)
- [ ] Idempotent webhook handler (duplicate `invoice.paid` safe)
- [ ] Manual mode still works with only QR + pay code
- [ ] `npm run build` passes
- [ ] AR + EN strings in `translations.js`