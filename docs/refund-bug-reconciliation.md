# Fulfillment Refund Bug — Reconciliation Report (verified)

**Date:** 2026-08-19/20
**Bug:** TOCTOU race — concurrent `fulfillOrder` calls caused the wallet guard to refund a concurrently-placed purchase even when the product was delivered. Fixed + deployed (per-order in-flight lock + wallet-guard re-read).
**Verification:** every refund transaction was cross-checked against its order — **87/87 matched, 0 amount mismatches**.

## Summary

| Metric | Amount |
|--------|--------|
| Refunded orders with a G2Bulk supplier order | 82 |
| ...delivered anyway (`fulfilled`) → **bug exposure** | 33 → **$468.20** |
| ...not delivered (`failed` / `fulfilling`) | 49 (refunds were legitimate — no product) |
| Internal accounts (owner + programmer) | $128.04 — reversed, not a loss |
| Real-customer exposure | **$340.16** |
| Recovered in real cash (money that was actually in wallets) | ~**$131.37** |
| Outstanding today (negative balances) | **$208.79** |

## Internal accounts — reversed (not a loss)

| Account | Free product | Refunds | Status |
|---------|-------------|---------|--------|
| SYR412 YT (owner admin) | $68.30 (3 orders) | 3 | Clawback removed, balance restored to $0.49 |
| أحمد (programmer) | **$59.74 (2 orders)** — two refunds of $29.87 each (confirmed on ledger) | 2 | Clawback removed, balance restored to $30.00 |

> Note: the programmer's refund was **$59.74**, not $30. His balance happens to be $30.00, which is why it looked like $30.

## Real customers — every bug order clawed back (exposure == clawback, diff $0)

| Customer | Free product | Balance now |
|----------|-------------|-------------|
| Mohammad | $191.98 | −$79.64 |
| 5Y2 | $60.56 | −$59.83 |
| بشير جاسم | $35.28 | −$33.48 |
| AHMED ALHAG ABDO | $12.38 | −$12.13 |
| Bsher Al jasem | $9.97 | −$9.77 |
| Nobody | $6.00 | −$5.98 |
| Ahmad 1 | $4.99 | −$4.97 |
| Mohamad Shihan | $2.00 | −$2.00 |
| Isaac Isaac | $0.85 | −$0.76 |
| Taher Almasry | $0.27 | −$0.23 |
| **Total** | **$340.16** | **−$208.79** |

## Owner's loss

- **Total product given away free:** $468.20
- **Internal (no real loss, reversed):** $128.04
- **Real customers:** $340.16 — all 33 delivered orders were clawed back, exactly.
- **Recovered in real cash:** ~$131.37 (money physically in wallets at clawback time, mainly Mohammad's balance).
- **Outstanding today:** **$208.79** in negative balances across 10 customers. Self-recovers as they recharge (negative balance blocks purchases until cleared); permanent loss only if they never return.
- The 49 `failed` refunds ($151.08) + 5 other failed-order refunds ($4.44, no supplier order) were legitimate — money returned for products never delivered, not a loss.

## Ledger notes

- Standing clawbacks: 23 `RECLAIM-FULFILL-*` rows (−$324.28) + 5 `DEBIT-*` recovery rows (−$15.88) = **$340.16**, matching real-customer exposure exactly.
- The owner also made **other** manual `DEBIT-*` adjustments unrelated to this bug (5Y2 +$74.78, 70a72a9b $59.10, e92e1e34 $6.00, a95fc534 $3.83, b2a7eb72 $4.00, 791d82de +$1.90) — separate admin deductions, **not** counted as bug loss.
- Removed for internal accounts: `RECLAIM-FULFILL-C435F665`, `1B5CCF6D`, `4BD9FBC2` (SYR412 YT), `A7124CB7`, `4456F209` (أحمد).

## Follow-up

- Monitor whether negative-balance users recharge (recovers the $208.79).
- The deployed fix (order lock + wallet-guard re-read) prevents new occurrences; `g2bulk_auto_refund_on_fail` toggle lets refunds be skipped on failure if desired.
- Wallets admin page now has a **الديون (In debt)** filter to track the debtors.