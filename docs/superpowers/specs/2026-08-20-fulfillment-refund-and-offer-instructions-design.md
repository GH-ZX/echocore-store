# Design: Fulfillment refund race fix + per-offer instructions + auto-refund toggle

Date: 2026-08-20
Status: Approved (owner)

## 1. Problem

### 1a. "Refunded but delivered" bug (confirmed with DB evidence)

Order `EC-100580` (`a7124cb7-116b-43b7-a969-0c2fbefc9915`):
- 12:24:31.828 purchase `-29.87` charged (balance 30 -> 0.13).
- 12:24:33.289 G2Bulk voucher purchase placed (supplier order `385876`), wallet drained `~$31.45 -> $1.88`.
- 12:24:33.481 a **concurrent** `fulfillOrder` call (read the order before the supplier id was persisted) ran the pre-purchase wallet guard, saw `wallet 1.88 < required 29.57`, marked the order `failed` and auto-refunded `+29.87` (balance back to 30).
- A later poll-only resume found supplier order `385876 = COMPLETED`, wrote the code `G2B-YQ2X-NLXB-4PN8` + `fulfilled`.

Net result: customer kept the product **and** got a full refund (free voucher; store ate the supplier cost). Root cause is a TOCTOU race between multiple `fulfillOrder` invocations for the same order (buy-flow call + success-page auto-fulfill + background poll).

The price/balance theory was incorrect: `$29.87` is the partner price (`29.57 x 1.01`); `create_order_atomic` verifies balance and prices server-side before creating the order.

## 2. Fix: serialize per-order fulfillment + never refund a placed purchase

All changes in `supabase/functions/g2bulk/index.ts` (`fulfillOrder` action).

### 2a. In-flight serialization
- Acquire an in-flight stamp before any fulfillment work: atomic
  `UPDATE orders SET g2bulk_metadata = g2bulk_metadata || <in_flight> WHERE id = :id AND (no active in_flight OR in_flight_since older than 120s) RETURNING id`.
- If the row is not returned, another invocation is working on this order -> immediately return `{ pending: true, fulfillmentStatus: 'fulfilling' }` (client already polls/retries).
- Release the stamp in `finally`.
- Stale expiry (120s) covers crashed/timeout invocations (edge poll window ~40s).

### 2b. Defense-in-depth: wallet guard must not refund a placed purchase
- In the pre-purchase wallet guard, before applying `failed` + refund, re-read the order row for a supplier id / `g2bulk_metadata.placed_at`.
- If a supplier order was placed concurrently -> do NOT fail/refund; switch to poll-only resume (fetch codes for that supplier order) and mark `fulfilled`.

## 3. Feature: auto-refund toggle (dashboard)

Owner wants the ability to **disable auto-refund entirely** on fulfillment failure.

- New `store_settings.g2bulk_auto_refund_on_fail` boolean, default `true`.
- `apply_g2bulk_fulfillment` (SQL) reads the setting; when `false`, the failed transition does **not** refund and does **not** set `balance_refunded`; it only notifies `fulfillment_failed`. Order stays `failed` for admin manual handling (top up wallet + re-fulfill, or manual refund).
- Toggle in Admin dashboard: `AdminG2BulkSettings.jsx`, next to the existing wallet-low toggle.
- Plumbed through: `src/lib/g2bulk.js` (`fetchG2bulkSettings`/`saveG2bulkSettings`), edge `loadStoreSettingsRow`, `buildSettingsEnvelope`, `saveSettings`/`getSettings` actions, `AdminG2BulkSettings` form.
- `get_g2bulk_settings` RPC fallback also returns the column.

## 4. Feature: per-offer instructions (EN/AR)

Replaces the "show redeem URL" request: G2Bulk has no generic redeem URL, so the owner manually types the info (e.g. Telegram: "Redeem at https://redeem.g2bulk.com/redeem/telegram with your username, then enter the code.").

- `offers` gets `instructions_en` + `instructions_ar` (nullable text).
- Admin: `AdminOfferEditModal` two textareas ("How it works" EN/AR); included in offer create/update payloads (`buildOfferPayload` in `App.jsx`).
- Display (UI labels via `translations.js`, content is DB per-lang text):
  - `OfferDetail` (product page).
  - `BuyView` (buy page).
  - `SuccessView` (next to delivered codes; pass `offers` prop, match via `order_items.offer_id`).
- `instructions_*` are public content columns (not secrets) and flow through the existing offers queries.

## 5. Out of scope / notes
- Deleting the Telegram voucher game (`cards-144-telegram-redeem-codes`) and its offers is the owner's manual action.
- The already-refunded order `EC-100580` stays as-is unless the owner asks to re-charge it.

## 6. Verification
- Unit tests: in-flight lock behavior, settings envelope includes `g2bulk_auto_refund_on_fail`, offer payload includes instructions, instructions render on OfferDetail/BuyView/SuccessView.
- Manual: run the store, place a balance purchase, confirm single fulfill path; toggle auto-refund off and simulate a failure to confirm no refund.