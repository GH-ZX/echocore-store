# Recharge and purchase notifications: what was found (2026-11-14)

Read from a schema-only copy of the live database and this repo, before any change.

## Where notifications come from

| Channel | Who | Source |
|---|---|---|
| In-site (bell, toast) | customers + admins | `notify_user` / `notify_all_admins` rows, text from `src/lib/notifications.js` + `src/data/translations.js` |
| Telegram DM | customer with a linked Telegram | triggers `on_recharge_status_telegram_dm` (recharge), `notify_linked_user_telegram` (delivered / failed), refund DM |
| Telegram alert | admin chats | `notify_admin_telegram` → `telegram_alert_message` (English only) |
| Telegram bot replies | whoever uses the bot | `supabase/functions/telegram-bot/i18n.ts` (already clear; not changed) |
| Email | — | **Not sent at all.** `notification_email_outbox` exists but nothing writes or sends it. Not built here (no new features). |
| Push | — | none |

## Problems

1. **Messages don't say what was bought or which order.** Purchase / delivery notifications carry
   only an amount ("Your $10.00 order is ready"); admin delivery notices don't carry the order number.
2. **Admin Telegram alerts are English only**, also for Arabic admin chats, and show raw codes
   (`Payment: balance`, `ShamCash`) and amounts like `$10.5`.
3. **Wrong amount in the Telegram "balance added" DM:** it shows the requested amount, not the amount
   credited (they differ when a ShamCash invoice in SYP pays less than requested).
4. **Wrong method in the admin "top-up waiting" notice:** the text always says "via ShamCash", also for
   Syriatel Cash or manual ShamCash.
5. **A manual credit by the admin is announced as "Recharge approved"** to the customer, though there
   was no recharge request.
6. **Admin gifts are announced as "New paid order"** (in-site + Telegram) though nobody paid.
7. **"Top-up request received" shows the customer's current balance**, which has nothing to do with
   the request and reads as if the money was already added.
8. **Wording:** mixed colloquial/odd phrasing ("تم إرسال الشحن إلى UID", "تم تسليم عرض {amount}",
   "تم الدفع — جاري التوريد", "فشل الشحن التلقائي"), no next step for the customer, and amounts / order
   numbers / codes that flip around inside Arabic text (no left-to-right isolation).
9. **Found while checking (fixed in the same PR):** the money-hardening change had routed
   `credit_user_balance` through `admin_adjust_user_balance`; "approve recharge" in the dashboard
   calls it, so approvals would have been booked as adjustments, capped at $500 and announced twice.
   Now `credit_user_balance` keeps its body and only the browser lost access to it.

Not changed, noted:
- A customer who submits "I paid" again for the same top-up (e.g. adds a receipt) creates a second
  in-site notice for them and the admins. Kept: the admin should see the new receipt.
- With automatic refunds on (off on live), the Telegram "order failed" DM is sent before the refund
  is recorded, so it says "our team is looking into it" instead of "refunded". The refund notice follows.

## Fixes

- `notify_user` adds the order number, the items (up to 3, "2× 100 Gems") and the payment method to
  every notification about an order, and the reference / method to every notification about a top-up,
  so every message can say what happened, how much, what and which order.
- New Arabic (Modern Standard, short) and English for every recharge / purchase notification, in-site
  and Telegram; amounts, order numbers, items and codes are isolated left-to-right inside Arabic.
- Admin Telegram alerts for paid order, failed delivery, top-up added and top-up waiting follow each
  admin chat's language (Arabic by default), with Arabic buttons.
- Items 3–7 above fixed. Old notifications already in the database still show (without order details).

The old and new texts side by side are in the owner's approval page (link in the PR).
