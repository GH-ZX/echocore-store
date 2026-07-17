---
name: g2bulk-api
description: >
  STRICT G2Bulk API compliance for EchoCore Store and any supplier integration work.
  ALWAYS read docs/g2bulk-api.md first (sole source of truth — do not fetch api.g2bulk.com).
  Use for catalog sync, voucher purchase, delivery polling, game top-up orders,
  webhooks, wallet/getMe, transactions, pricing sync.
  Triggers on: g2bulk, G2Bulk, g2bulk api, api.g2bulk.com, catalog sync, top-up,
  voucher, delivery polling, checkPlayerId, fulfilment, fulfillment, webhook, getMe,
  products/purchase, games/order, g2bulk_game_code, g2bulk_catalogue_name.
---

# G2Bulk API — STRICT compliance skill

## Rule zero (read first, every time)

Before **any** G2Bulk-related code change, review, doc edit, or answer:

1. **Source of truth:** [docs/g2bulk-api.md](../../../docs/g2bulk-api.md) — read this only; do **not** open https://api.g2bulk.com/
2. **Contract checklist:** [references/official-contract.md](references/official-contract.md)

**`docs/g2bulk-api.md` is the contract.** EchoCore code implements that file — not the other way around.

| If you find… | Do this |
|--------------|---------|
| Code ≠ `docs/g2bulk-api.md` | Fix code to match the MD |
| MD outdated (human maintainer) | User updates `docs/g2bulk-api.md` in-repo — agents do not scrape the live docs page |
| Unclear behavior | Do not guess — cite the MD section or ask the user |

**Never invent** endpoints, fields, status values, poll intervals, or auth rules.

---

## Mandatory behaviors

### Security

- `X-API-Key` **only** in Supabase Edge / server — never React, never `VITE_*`
- All customer-facing flows go through `supabase/functions/g2bulk/`
- Repeated 401 → permanent IP ban — validate key once, no retry loops

### Idempotency

- `X-Idempotency-Key` = **36-character UUID** on `POST /products/:id/purchase` and `POST /games/:code/order`
- 30-minute dedupe window; omit header to skip

### Pricing

- Re-fetch `unit_price` / `amount` **immediately before** purchase or sync pricing
- EchoCore retail (`offers.price`) is local; G2Bulk only sees `catalogue_name` / `product_id` + quantity

### Fulfillment

| Type | Official flow |
|------|----------------|
| Voucher | `POST /products/:id/purchase` → `COMPLETED` or poll `/orders/:id/delivery` (2–5 s) |
| Top-up | `checkPlayerId` → `POST /games/:code/order` → status poll or `callback_url` webhook |

Stop polling on delivery **200** (ready) or **410** (refunded). Persist codes within 30-day delivery window.

### Public vs auth

Do not require API key on public catalog/player-validation endpoints listed in `official-contract.md`.

---

## EchoCore implementation map

| Concern | Path |
|---------|------|
| Edge function (only trusted caller) | `supabase/functions/g2bulk/index.ts` |
| Markup + per-offer pricing modes | `supabase/functions/g2bulk/markupPricing.ts` · `src/lib/offerPricing.js` |
| Client invoke wrapper | `src/lib/g2bulk.js` |
| Admin sync/settings | `src/components/admin/AdminG2BulkSettings.jsx` |
| Player validation at checkout | `src/views/BuyView.jsx` via edge proxy |
| Supplier cost badge | `src/components/admin/AdminOfferCostBadge.jsx` |
| DB fields | `g2bulk_game_code`, `g2bulk_catalogue_name`, `g2bulk_product_id`, `g2bulk_cost_usd`, order fulfillment columns |

**i18n:** new UI strings → `src/data/translations.js` (AR + EN). Follow `echocore-standards` skill.

---

## Review checklist (use on every G2Bulk diff)

- [ ] Endpoint path + method match `docs/g2bulk-api.md`
- [ ] Request body fields match docs (no extra/missing required fields)
- [ ] Auth: key only server-side; public routes unauthenticated
- [ ] Idempotency UUID when retryable purchase/order
- [ ] PENDING handled with correct poll URL / delivery endpoint
- [ ] HTTP 202 / 410 / 404 semantics respected
- [ ] Customer price not sent to G2Bulk
- [ ] `docs/g2bulk-api.md` updated if API surface changed

---

## Quick endpoint index

See [docs/g2bulk-api.md](../../../docs/g2bulk-api.md) for full cURL + JSON examples.

| Area | Endpoints |
|------|-----------|
| Wallet | `GET /v1/getMe` |
| Catalog (public) | `/category`, `/products`, `/games`, `/games/:code/catalogue` |
| Voucher (auth) | `POST /products/:id/purchase`, `GET /orders`, `GET /orders/:id/delivery`, `GET /transactions` |
| Top-up | `/games/fields`, `/games/servers`, `/games/checkPlayerId`, `/games/eta`, `POST /games/:code/order`, `GET /games/orders` |
| Webhook | `callback_url` on game order — idempotent handler |

---

## When user says "follow G2Bulk docs strictly"

1. Load this skill + `docs/g2bulk-api.md`
2. Quote or paraphrase the relevant MD section before implementing
3. Implement only what the MD documents
4. If the API changed upstream, the user updates `docs/g2bulk-api.md` — then align code to the new MD