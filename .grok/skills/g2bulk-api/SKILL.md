---
name: g2bulk-api
description: >
  G2Bulk API integration for EchoCore Store.
  Use when implementing catalog sync, voucher/code fulfillment, game top-up orders,
  delivery polling, wallet verification, and webhook-driven order completion.
  Triggers on: g2bulk api, g2bulk topups, g2bulk vouchers, catalog sync,
  game top-up, delivery polling, webhook.
---

# G2Bulk API — EchoCore Integration Skill

Read [docs/g2bulk-api.md](../../docs/g2bulk-api.md) for the static reference copy of the upstream G2Bulk API documentation.

## Product goal

Integrate G2Bulk as the supplier layer for EchoCore Store while keeping the storefront safe, admin-friendly, and resilient to live pricing changes.

Primary use cases:

- Sync G2Bulk games and offers into EchoCore catalog
- Sell voucher/code products from G2Bulk
- Fulfill game top-ups for supported titles
- Reconcile wallet balance and transaction history
- Support idempotent purchases and delivery polling

---

## EchoCore context (existing code)

| Area | Path | Notes |
|------|------|-------|
| Edge function | `supabase/functions/g2bulk/index.ts` | Main G2Bulk proxy + catalog sync logic |
| Client helper | `src/lib/g2bulk.js` | Frontend wrapper around the edge function |
| Admin settings | `src/components/admin/AdminG2BulkSettings.jsx` | API key, sync settings, catalog mode |
| Storefront logic | `src/App.jsx` | Catalog loading, fulfillment triggers, G2Bulk data mapping |
| G2Bulk game image helper | `src/lib/carouselLogos.js` | Uses G2Bulk image base |

**i18n:** all new user-facing strings should go through the existing translations layer in `src/data/translations.js` and follow the same patterns as the rest of the project.

---

## Architecture rules

### Security architecture (mandatory)

#### Layer 1 — Secret storage

| Secret | Where | Never in |
|--------|-------|----------|
| `G2BULK_API_KEY` | Supabase Edge secret or admin-only DB column | React, Vite env, client logs, public RPCs |
| Webhook callback URL | Supabase function URL or admin-configured endpoint | Hardcoded secrets |

Never expose the API key in browser code. All G2Bulk calls should go through the edge function.

#### Layer 2 — Edge function gate

The G2Bulk edge function should be the single trusted call path for:

- wallet verification (`getMe`)
- catalog sync
- purchase / order initiation
- delivery polling
- transaction lookup
- game top-up order creation

#### Layer 3 — Idempotency

For purchase and order endpoints, use `X-Idempotency-Key` when the request might be retried.

Rules:

- Key must be a 36-character UUID
- Same key within 30 minutes returns the original response
- Omit header entirely to skip idempotency

#### Layer 4 — Price freshness

G2Bulk prices move with exchange rates. Always read the latest live price from:

- `GET /v1/products`
- `GET /v1/products/:id`
- `GET /v1/games/:code/catalogue`

before charging the store customer.

#### Layer 5 — Fulfillment handling

- Treat `COMPLETED` as immediate delivery
- Treat `PENDING` as a polling workflow
- Poll `GET /v1/orders/:id/delivery` every 2–5 seconds
- Stop on `200` or `410`

---

## Recommended data model mapping

| EchoCore field | G2Bulk concept |
|---------------|----------------|
| `g2bulk_enabled` | Admin switch for supplier integration |
| `g2bulk_api_key` | Secret key for G2Bulk auth |
| `g2bulk_markup_percent` | Margin added to supplier cost |
| `g2bulk_charm_pricing_enabled` | Optional charm/pricing adjustment |
| `g2bulk_catalog_only` | Use G2Bulk for catalog only, not fulfillment |
| `g2bulk_catalog_mode` | `sync`, `live`, or `hybrid` |
| `g2bulk_game_code` | G2Bulk game code (for top-ups) |
| `g2bulk_catalogue_name` | Catalogue denomination / voucher mapping |
| `g2bulk_product_id` | G2Bulk product id (voucher products) |
| `g2bulk_cost_usd` | Latest supplier cost for pricing |

---

## Core API flow

### A. Catalog sync

1. Call `GET /v1/category` and `GET /v1/products`
2. Normalize categories and offers into EchoCore catalog rows
3. Store or update `g2bulk_product_id`, `g2bulk_game_code`, and cost metadata
4. Keep local catalog entries in sync with live stock and price changes

### B. Voucher / code purchase

1. Resolve product and current price from `GET /v1/products/:id`
2. Charge the store customer using your local markup
3. Call `POST /v1/products/:id/purchase` through the edge function
4. If response is `PENDING`, poll delivery until ready
5. Save delivery items or mark the order failed/refunded

### C. Game top-up flow

1. Call `GET /v1/games` to discover supported titles
2. Call `POST /v1/games/fields` and `POST /v1/games/servers` to learn required inputs
3. Validate the player ID with `POST /v1/games/checkPlayerId`
4. Fetch live denominations with `GET /v1/games/:code/catalogue`
5. Submit `POST /v1/games/:code/order` with the validated player data
6. Track the order through `GET /v1/games/orders` or a webhook callback

---

## Endpoint reference (curated)

### Authentication

Header:

```http
X-API-Key: your_api_key_here
```

Optional idempotency for purchase/top-up orders:

```http
X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

### User / wallet

- `GET /v1/getMe` — verify credentials and read wallet balance

### Catalog (public; no key needed)

- `GET /v1/category`
- `GET /v1/category/:id`
- `GET /v1/products`
- `GET /v1/products/:id`

### Voucher / code purchases

- `POST /v1/products/:id/purchase`
- `GET /v1/orders`
- `GET /v1/orders/:id`
- `GET /v1/orders/:id/delivery`
- `GET /v1/transactions`

### Game top-ups

- `GET /v1/games`
- `POST /v1/games/fields`
- `POST /v1/games/servers`
- `POST /v1/games/checkPlayerId`
- `GET /v1/games/:code/catalogue`
- `POST /v1/games/eta`
- `POST /v1/games/:code/order`
- `GET /v1/games/orders`

### Webhooks

- Pass `callback_url` in order requests
- G2Bulk will POST a JSON body when the order reaches `COMPLETED` or `FAILED`
- Make the handler idempotent; duplicate delivery is possible

---

## Example request shapes

### Verify wallet

```bash
curl -X GET https://api.g2bulk.com/v1/getMe \
  -H "X-API-Key: your_api_key_here"
```

### Purchase a voucher product

```bash
curl -X POST https://api.g2bulk.com/v1/products/1/purchase \
  -H "X-API-Key: your_api_key_here" \
  -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'
```

### Place a game top-up order

```bash
curl -X POST https://api.g2bulk.com/v1/games/pubgm/order \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "catalogue_name": "60 UC",
    "player_id": "12345678",
    "server_id": "2001",
    "charname": "charname",
    "remark": "EchoCore order"
  }'
```

---

## Response handling rules

### Status values

| Status | Meaning |
|--------|---------|
| `COMPLETED` | Delivery ready; codes or top-up result attached |
| `PENDING` | Still processing; poll `poll_url` or delivery endpoint |
| `PROCESSING` | Fulfillment in progress |
| `FAILED` / `REFUNDED` | Terminal failure |

### HTTP semantics

| Code | Meaning |
|------|---------|
| `200` | OK |
| `202` | Accepted / still processing |
| `400` | Bad request |
| `401` | Unauthorized / bad key |
| `404` | Not found |
| `410` | Failed / refunded / cancelled |
| `429` | Rate limited |
| `500` | Server error |

Use exponential backoff for `429` and `5xx`.

---

## Implementation phases for EchoCore

### Phase 1 — Knowledge + secrets

- Add this skill and the static reference copy
- Store `G2BULK_API_KEY` in Supabase secrets or admin-only DB settings
- Ensure the edge function is the only client-facing integration point

### Phase 2 — Edge function + admin UI

- Expand `supabase/functions/g2bulk/index.ts` with actions for:
  - `getMe`
  - `syncCatalog`
  - `checkCatalog`
  - `purchaseProduct`
  - `getOrderDelivery`
  - `placeTopupOrder`
- Wire `src/lib/g2bulk.js` to the edge function
- Extend admin settings in `src/components/admin/AdminG2BulkSettings.jsx`

### Phase 3 — Catalog and storefront

- Merge G2Bulk products into the catalog
- Show live stock/price where appropriate
- Keep pricing rules local and margin-aware

### Phase 4 — Fulfillment and webhooks

- Fulfill voucher purchases
- Track game top-up orders
- Process webhook callbacks and update order status
- Reconcile transactions against wallet balance

---

## Notes for vibe-coding this site

- Prefer a server-first integration model: keep G2Bulk keys out of the browser
- Mirror the existing admin UX patterns already used for G2Bulk settings
- Keep the public catalog fast and resilient by using edge caching and batched syncs where possible
- Treat G2Bulk as a supplier system, not a frontend dependency
- When adding a new flow, start from the existing G2Bulk edge function and admin components before building any new UI
