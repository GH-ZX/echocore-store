# Sam Customer Payout and History Reliability

## Goal

Make Sam API administration safe and predictable: admins can select a customer and send money through Sam, customer recharge history is distinct from external provider wallet diagnostics, Sam tabs do not produce unexplained repeated loading states, production stale CSS assets recover cleanly, and site logs can be copied exactly for debugging.

## Scope

- Add optional validated Sam recipient identifiers to customer profiles.
- Add customer selection and payout entry points in the Sam admin panel and customer detail page.
- Keep payouts admin-only, confirmation-gated, and recorded in `sam_transfers`.
- Use site wallet records for customer recharge/refund auditing.
- Share Sam settings within the admin panel and avoid unnecessary child-tab requests.
- Add copy controls to detailed site-log entries.
- Recognize CSS preload failures as stale deployment chunk errors and avoid reload loops.

## Data Model

Add nullable profile fields `sam_shamcash_wallet_id` and `sam_syriatel_recipient`. The ShamCash value must be a 32-character hexadecimal wallet ID. The Syriatel value accepts the existing supported phone/cash-code formats. Customer identifiers are optional and are never exposed through public payment configuration.

The existing `transactions` table remains the authoritative store-wallet ledger. Sam invoices and manual `recharge_requests` are displayed as recharge attempts/status records; `sam_transfers` remains the separate external payout ledger. A Sam payout never changes the customer's store balance automatically.

## Client and Edge Flow

The admin user selector loads profile summaries with recipient fields. Selecting a customer sets the provider and recipient in the payout form. The customer detail page uses the same payout component and refreshes only the selected profile after completion.

The browser invokes only the `sam-api` edge function. The edge function validates admin authorization, recipient format, amount, currency, provider-specific PIN requirements, and source wallet configuration. It records both successful and failed payout attempts without storing PINs.

`AdminSamApiPanel` owns the initial Sam settings request and passes the result to tabs that need it. Transfer history loads once when its tab is first activated, after a successful payout, or by explicit refresh. External wallet diagnostics remain separate and do not run as part of customer payout or recharge history.

## UI

- Simplify the payout form around customer, recipient, amount, currency, note, and provider-specific PIN.
- Show a clear recipient-not-configured state with an edit path on the customer page.
- Keep a compact payout ledger with status, customer/recipient, amount, date, and copy/send-again actions.
- Label customer recharge history separately from external Sam wallet transactions.
- Replace repeated generic wallet loading text with scoped loading labels.

## Error Handling

Site logs retain the full structured error. Each expanded log row has a copy button and the visible error list has a copy-all action. Copied content includes the formatted line, fields, console payload, URL, and component stack when present.

Dynamic-import recovery recognizes `Unable to preload CSS` and equivalent CSS asset failures. It retries once, performs at most one guarded reload, and then allows the error boundary to show a manual reload action rather than repeatedly reloading/logging the same stale asset failure.

## Verification

- Add focused tests for recipient validation, customer selection payloads, log-copy formatting, and stale CSS error detection where existing test seams permit.
- Run `npm run lint`, `npm test`, and `npm run build`.
- Manually verify: Sam tab initial load, tab switching, customer selection, customer-page payout, recharge history, log copy, and a stale hashed CSS asset recovery.
