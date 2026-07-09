# G2Bulk API — Implementation Reference

> **Source:** https://api.g2bulk.com/  
> **Fetched:** 2026-07-09  
> **Purpose:** Quick reference for integrating G2Bulk into EchoCore Store (catalog sync, fulfillment, top-ups).

## EchoCore setup (do once)

1. Run `supabase_echocore_full.sql` in Supabase SQL Editor (includes G2Bulk schema).
2. Deploy edge function:
   ```bash
   supabase secrets set G2BULK_API_KEY=your_key_here
   supabase functions deploy g2bulk
   ```
3. Admin → **G2Bulk** tab: enable auto-fulfillment, paste API key, **Test connection**, **Save**.
4. Per game: set `g2bulk_game_code` (e.g. `pubgm`, `mlbb`).
5. Per offer: set `catalogue_name` (top-ups) or `product_id` (vouchers).

**Security:** API key lives in `.env` (local, gitignored), Supabase secrets, and/or `store_settings` (admin-only). Never `VITE_` prefix.

---

## Quick facts

| Item | Value |
|------|-------|
| Main API base | `https://api.g2bulk.com/v1/` |
| SMM Panel base | `https://api.g2bulk.com/api/v2` |
| Auth (main API) | Header `X-API-Key: <key>` |
| Auth (SMM API) | Body field `key: <key>` |
| API key source | Telegram bot `@G2BULKBOT` (wallet-funded) |
| Format | JSON over HTTPS |
| Rate limit | 1000 requests / 10 seconds per key |
| Idempotency window | 30 minutes (UUID header) |
| Auth failure policy | Repeated 401s → **permanent IP ban** |

**Never expose the API key in client-side code.** Use a Supabase Edge Function, serverless proxy, or admin-only backend.

---

## Authentication

### Main API (`/v1/*`)

```http
X-API-Key: your_api_key_here
```

Optional idempotency (purchase + game order):

```http
X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

- Must be exactly **36-character UUID**
- Same key within 30 min returns original response (no double charge)
- Omit header to skip idempotency

### SMM Panel (`/api/v2`)

Key goes in the **request body**, not a header:

```bash
curl https://api.g2bulk.com/api/v2 \
  -d key=your_api_key_here \
  -d action=balance
```

---

## Main API — Endpoints

### User

#### `GET /v1/getMe` (auth)

Verify key + read wallet balance.

**Response 200:**

```json
{
  "success": true,
  "user_id": 123456789,
  "username": "johndoe",
  "first_name": "John Doe",
  "balance": 8.74
}
```

---

### Catalog (public — no key)

#### `GET /v1/category`

List all categories.

#### `GET /v1/category/:id`

Products inside one category.

**Response 200:**

```json
{
  "success": true,
  "categories": [
    {
      "id": 1,
      "title": "PUBG Mobile UC Vouchers",
      "description": "",
      "image_url": "https://example.com/pubg.png",
      "product_count": 11
    }
  ]
}
```

#### `GET /v1/products`

All products with live pricing + stock.

#### `GET /v1/products/:id`

Single product — **fetch before purchase** (prices move with exchange rates).

**Response 200:**

```json
{
  "success": true,
  "products": [
    {
      "id": 1,
      "title": "60 UC Voucher",
      "description": "",
      "category_id": 1,
      "category_title": "PUBG Mobile UC Vouchers",
      "unit_price": 0.84,
      "face_value": 1,
      "image_url": null,
      "stock": 1006
    }
  ]
}
```

| Field | Notes |
|-------|-------|
| `unit_price` | Your cost in USD — always re-read before charging customer |
| `face_value` | Denomination on voucher; `null` if not set |
| `stock` | Live inventory |

---

### Voucher / code purchases (auth)

#### `POST /v1/products/:id/purchase`

| Body field | Type | Required | Description |
|------------|------|----------|-------------|
| `quantity` | integer | yes | Units to buy |

**Completed 200:**

```json
{
  "success": true,
  "order_id": 123,
  "transaction_id": 456,
  "product_id": 1,
  "product_title": "60 UC Voucher",
  "status": "COMPLETED",
  "delivery_items": ["KEY1", "KEY2", "KEY3"]
}
```

**Pending 200:**

```json
{
  "success": true,
  "order_id": 124,
  "transaction_id": 457,
  "product_id": 2,
  "product_title": "PSN $20 Gift Card",
  "status": "PENDING",
  "delivery_items": null,
  "poll_url": "/v1/orders/124/delivery"
}
```

#### `GET /v1/orders` (auth)

Paginated order history.

| Query | Type | Default | Max |
|-------|------|---------|-----|
| `page` | int | 1 | — |
| `limit` | int | 50 | 100 |
| `search` | string | — | optional filter |

#### `GET /v1/orders/:id` (auth)

Single order.

**Order object fields:** `id`, `user_id`, `product_id`, `product_title`, `quantity`, `total_price`, `status`, `description`, `created_at`

#### `GET /v1/orders/:id/delivery` (auth)

Poll PENDING voucher orders every **2–5 seconds**.

| HTTP | Meaning |
|------|---------|
| 200 | Codes ready in `delivery_items` |
| 202 | Still `PROCESSING` — poll again |
| 410 | Terminal failure — auto-refunded |
| 404 | Not found / not yours |

**Ready 200:**

```json
{
  "success": true,
  "order_id": 124,
  "product_id": 2,
  "product_title": "PSN $20 Gift Card",
  "quantity": 1,
  "status": "COMPLETED",
  "delivery_items": ["XXXX-XXXX-XXXX"]
}
```

**Processing 202:**

```json
{
  "success": true,
  "order_id": 124,
  "status": "PROCESSING",
  "message": "Order is still being fulfilled. Try again shortly."
}
```

**Refunded 410:**

```json
{
  "success": false,
  "order_id": 124,
  "status": "REFUNDED",
  "refunded": true,
  "message": "Order failed and was refunded automatically."
}
```

> Delivery items available **30 days** after `created_at` — persist codes in Supabase immediately.

#### `GET /v1/transactions` (auth)

Wallet ledger (paginated, optional `search`).

| `transaction_type` | Meaning |
|--------------------|---------|
| `add_balance` | Top-up or refund |
| `charge_balance` | Purchase deduction |

---

### Game top-up — direct to player (auth where noted)

#### `GET /v1/games` (public)

Supported games list.

```json
{
  "success": true,
  "games": [
    {
      "id": 1,
      "code": "pubg_mobile",
      "name": "PUBG Mobile",
      "image_url": "/images/pubg_mobile.png"
    }
  ]
}
```

#### `POST /v1/games/fields` (public)

Required input fields per game.

| Body | Type | Required |
|------|------|----------|
| `game` | string | yes — e.g. `mlbb` |

```json
{
  "code": "200",
  "info": {
    "fields": ["userid", "serverid"],
    "notes": "Not available for Indonesia users"
  }
}
```

#### `POST /v1/games/servers` (public)

Server list for games that need it. **403 = no server required** (not an error).

```json
{
  "code": "200",
  "servers": {
    "SouthEast Asia": "SouthEast Asia",
    "America": "America",
    "Europe": "Europe"
  }
}
```

#### `POST /v1/games/checkPlayerId` (public)

Validate player before charging.

| Body | Type | Required |
|------|------|----------|
| `game` | string | yes |
| `user_id` | string | yes |
| `server_id` | string | if game requires |
| `charname` | string | if game requires |

```json
// request
{ "game": "mlbb", "user_id": "123456789", "server_id": "2001", "charname": "charname" }

// valid 200
{ "valid": "valid", "name": "John Doe", "openid": "41581795132966184" }
```

#### `GET /v1/games/:code/catalogue` (public)

Denominations + live `amount` (your cost).

```json
{
  "success": true,
  "game": { "code": "pubgm", "name": "PUBG Mobile", "image_url": "/images/pubgm.png" },
  "catalogues": [
    { "id": 1, "name": "60 UC",  "amount": 0.88 },
    { "id": 2, "name": "120 UC", "amount": 1.75 }
  ]
}
```

#### `POST /v1/games/eta` (public)

Estimated fulfillment time.

| ETA label | Range |
|-----------|-------|
| `instant` | < 30s |
| `less_than_1_minute` | 30s – 1 min |
| `less_than_2_minutes` | 1 – 2 min |
| `less_than_5_minutes` | 2 – 5 min |
| `less_than_10_minutes` | 5 – 10 min |
| `less_than_30_minutes` | 10 – 30 min |
| `more_than_30_minutes` | > 30 min |
| `no_data` | insufficient data |

```json
{
  "success": true,
  "estimated_time": {
    "label": "less_than_5_minutes",
    "display": "Less than 5 minutes",
    "median_seconds": 187
  }
}
```

#### `POST /v1/games/:code/order` (auth)

Place direct top-up order.

| Body | Type | Required |
|------|------|----------|
| `catalogue_name` | string | yes — e.g. `"60 UC"` |
| `player_id` | string | yes |
| `server_id` | string | if applicable |
| `charname` | string | if applicable |
| `remark` | string | optional — your order note |
| `callback_url` | string | optional — webhook URL |

**Status values:** `PENDING` → `PROCESSING` → `COMPLETED` | `FAILED` (refunded)

```json
// request
{
  "catalogue_name": "60 UC",
  "player_id": "12345678",
  "server_id": "2001",
  "charname": "charname",
  "remark": "echocore-order-abc123",
  "callback_url": "https://your-domain.com/api/g2bulk/webhook"
}

// response 200
{
  "success": true,
  "message": "Order created successfully. We are processing your order.",
  "order": {
    "order_id": 42,
    "game": "PUBG Mobile",
    "catalogue": "60 UC",
    "player_id": "12345678",
    "player_name": "PlayerName",
    "price": 0.88,
    "status": "PENDING",
    "callback_url": "https://your-domain.com/api/g2bulk/webhook"
  }
}
```

#### `POST /v1/games/order/status` (auth)

Poll game top-up order status (alternative to webhook).

#### `GET /v1/games/orders` (auth)

Paginated game top-up order history.

---

### Webhooks (game top-up)

Set `callback_url` on order creation. G2Bulk POSTs JSON when order reaches terminal state (`COMPLETED` or `FAILED`).

| Property | Value |
|----------|-------|
| Method | POST JSON |
| Timeout | 10 seconds |
| Retry | Once on failure |
| Your response | 2xx within 10s |

**Callback payload:**

```json
{
  "order_id": 42,
  "game_code": "pubgm",
  "game_name": "PUBG Mobile",
  "player_id": "12345678",
  "player_name": "PlayerName",
  "server_id": "2001",
  "denom_id": "60 UC",
  "price": 0.88,
  "status": "COMPLETED",
  "message": "Order completed successfully",
  "remark": "your order remark",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

> Handler must be **idempotent** (duplicate notifications possible after retry).

---

## SMM Panel API (`/api/v2`)

Same fulfillment, SMM-panel-style interface. All actions are `POST` with `action` in body.

### Actions

| action | Description |
|--------|-------------|
| `services` | List services + rates |
| `add` | Place order |
| `status` | Poll order status |
| `balance` | Wallet balance |

### `action=services`

| Body | Required |
|------|----------|
| `key` | yes |
| `action` | `"services"` |
| `category` | optional — filter by game |

```json
[
  {
    "service": 1,
    "name": "PUBG Mobile 60 UC",
    "type": "Package",
    "category": "PUBG Mobile",
    "rate": "0.88",
    "min": "1",
    "max": "1",
    "refill": false,
    "cancel": false
  }
]
```

### `action=add`

| Body | Required | Notes |
|------|----------|-------|
| `key` | yes | |
| `action` | `"add"` | |
| `service` | yes | From `services` |
| `link` | yes | Player ID, or `PlayerID\|ServerID\|Charname` |
| `quantity` | yes | Always `1` for game top-ups |

```json
{ "order": 12345 }
// or
{ "error": "Insufficient balance" }
```

### `action=status`

| Body | Required |
|------|----------|
| `order` | single ID **or** |
| `orders` | comma-separated, max 100 |

```json
{
  "charge": "0.88",
  "start_count": "0",
  "status": "Completed",
  "remains": "0",
  "currency": "USD"
}
```

SMM status values: `Pending`, `In progress`, `Completed`, `Partial`, `Canceled`

> SMM errors return **HTTP 200** with `{ "error": "..." }` — always check `error` field.

### `action=balance`

```json
{ "balance": "150.5000", "currency": "USD" }
```

### Common SMM errors

```
"Invalid API key"
"Invalid action"
"Service ID is required"
"Link (Player ID) is required"
"Service not found or inactive"
"Game is currently unavailable"
"Insufficient balance"
"Order not found"
```

---

## HTTP status codes (main API)

| Code | Meaning |
|------|---------|
| 200 | OK |
| 202 | Accepted — still processing, poll again |
| 400 | Bad request |
| 401 | Unauthorized — **do not retry in a loop** |
| 404 | Not found |
| 410 | Gone — failed/refunded (terminal) |
| 429 | Rate limited — exponential backoff |
| 500 | Server error — exponential backoff |

**Error shape:**

```json
{ "success": false, "message": "Human-readable error" }
```

**No servers (403):**

```json
{
  "detail": {
    "code": "403",
    "message": "Game does not requires any servers"
  }
}
```

---

## EchoCore Store — suggested integration map

When you provide the API key, implementation can follow this plan:

### 1. Config (admin settings)

Store in Supabase `store_settings` or env (server-only):

- `g2bulk_api_key` — never in frontend
- `g2bulk_markup_percent` — margin over `unit_price` / `amount`
- `g2bulk_webhook_secret` — optional verify callback origin
- `g2bulk_enabled` — toggle

### 2. Product types → G2Bulk endpoints

| Store offer type | G2Bulk flow |
|------------------|-------------|
| Game top-up (UID + server) | `checkPlayerId` → `games/:code/order` or SMM `add` |
| Voucher / gift card (codes) | `products/:id/purchase` → poll `/delivery` |
| Catalog sync (admin) | `GET /games`, `GET /games/:code/catalogue`, `GET /products` |

### 3. DB fields to add on orders

```
g2bulk_order_id       — their order_id
g2bulk_product_id     — product or catalogue id
g2bulk_status         — PENDING | PROCESSING | COMPLETED | FAILED | REFUNDED
g2bulk_delivery_items — jsonb array of codes (vouchers)
g2bulk_cost_usd       — what G2Bulk charged
g2bulk_idempotency_key — uuid we sent
g2bulk_remark         — links to our order id
```

### 4. Fulfillment flow (after ShamCash payment approved)

```
Admin approves payment
  → Edge function calls G2Bulk with X-Idempotency-Key = our order UUID
  → If COMPLETED: save delivery_items, notify user
  → If PENDING: poll delivery OR register webhook
  → On FAILED/410: mark order failed, alert admin
```

### 5. Player validation (BuyView)

Before checkout, proxy `POST /v1/games/checkPlayerId` so buyer sees in-game name confirmation (matches existing UID flow).

### 6. Pricing sync (optional cron)

Periodic job: fetch catalogue/products, apply markup, update offer prices in Supabase.

---

## cURL cheat sheet

```bash
# Verify key + balance
curl -H "X-API-Key: $KEY" https://api.g2bulk.com/v1/getMe

# List games (public)
curl https://api.g2bulk.com/v1/games

# Game catalogue (public)
curl https://api.g2bulk.com/v1/games/pubgm/catalogue

# Validate player (public)
curl -X POST https://api.g2bulk.com/v1/games/checkPlayerId \
  -H "Content-Type: application/json" \
  -d '{"game":"mlbb","user_id":"123456789","server_id":"2001"}'

# Buy voucher
curl -X POST https://api.g2bulk.com/v1/products/1/purchase \
  -H "X-API-Key: $KEY" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"quantity":1}'

# Poll delivery
curl -H "X-API-Key: $KEY" https://api.g2bulk.com/v1/orders/124/delivery

# Place top-up
curl -X POST https://api.g2bulk.com/v1/games/pubgm/order \
  -H "X-API-Key: $KEY" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"catalogue_name":"60 UC","player_id":"12345678","remark":"echocore-001"}'

# SMM balance
curl https://api.g2bulk.com/api/v2 -d key=$KEY -d action=balance
```

---

## Implementation files (planned)

When ready to implement, likely touch:

| File | Purpose |
|------|---------|
| `src/lib/g2bulkApi.js` | Typed client wrapper (server/proxy only) |
| `supabase/functions/g2bulk-*/` | Edge functions for purchase, webhook, validate |
| `supabase_echocore_full.sql` §07–§13 | G2Bulk schema + settings |
| `src/components/admin/AdminG2BulkSettings.jsx` | Key + markup config |
| `BuyView.jsx` | Player validation via proxy |

---

## Links

- Docs UI: https://api.g2bulk.com/
- Main API: `https://api.g2bulk.com/v1/`
- SMM API: `https://api.g2bulk.com/api/v2`
- API key / wallet: Telegram `@G2BULKBOT`