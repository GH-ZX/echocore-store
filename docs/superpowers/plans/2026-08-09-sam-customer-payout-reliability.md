# Sam Customer Payout and History Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sam administration reliable, customer-aware, auditable, and resilient to stale production assets.

**Architecture:** Keep the browser-to-Supabase Edge Function boundary for all Sam operations. Store validated customer recipient identifiers in `profiles`, use `transactions` plus recharge/invoice records for customer wallet audit history, and keep external Sam wallet diagnostics separate. Let `AdminSamApiPanel` own settings hydration and make child tabs explicitly load only the data they display.

**Tech Stack:** React 19, Vite 8, Supabase/Postgres, Supabase Edge Functions/Deno, Vitest, existing Tailwind/CSS utility classes.

## Global Constraints

- All Sam API calls go through `supabase/functions/sam-api`; never call Sam directly from React.
- Payouts are admin-only, confirmation-gated, and recorded in `sam_transfers` on success and failure.
- Customer recipient fields are optional; never store Syriatel PINs.
- `transactions` is the authoritative store-wallet ledger; Sam external wallet activity is diagnostic only.
- Every new user-visible string must be added to Arabic and English in `src/data/translations.js`.
- Do not remove or change the existing manual recharge flow.
- Verify with `npm run lint`, `npm test`, and `npm run build`.

---

### Task 1: Add customer Sam recipient fields and admin-safe profile access

**Files:**
- Create: `supabase/migrations/20260809210000_customer_sam_recipients.sql`
- Modify: `supabase_echocore_full.sql` in the canonical profiles schema/RLS section
- Modify: `supabase/functions/sam-api/index.ts` only if the admin profile lookup needs recipient fields
- Modify: `src/lib/adminModeration.js` profile-summary/profile-detail selects or RPC parsing
- Test: `src/lib/adminModeration.test.js` if existing test seams cover normalization

**Interfaces:**
- Profile fields: `sam_shamcash_wallet_id: string | null`, `sam_syriatel_recipient: string | null`.
- Admin profile data returns both fields, never secrets or PINs.

- [ ] **Step 1: Add the migration**

Add nullable text columns and comments, then ensure the migration is safe to run once:

```sql
alter table public.profiles
  add column if not exists sam_shamcash_wallet_id text,
  add column if not exists sam_syriatel_recipient text;

comment on column public.profiles.sam_shamcash_wallet_id is 'Optional admin/customer Sam ShamCash recipient wallet id';
comment on column public.profiles.sam_syriatel_recipient is 'Optional admin/customer Sam Syriatel phone or cash code';
```

- [ ] **Step 2: Mirror the bootstrap schema**

Place the same `add column if not exists` statements in the canonical `supabase_echocore_full.sql` profiles section so new environments receive the fields.

- [ ] **Step 3: Expose fields through the existing admin profile path**

Extend the existing admin profile select/RPC result handling only. Do not create a second user lookup path. Preserve fallback behavior when an older deployment lacks the columns.

- [ ] **Step 4: Verify the data contract**

Run the focused admin moderation tests, then inspect the generated Supabase diff/migration before proceeding.

Run: `npm test -- src/lib/adminModeration.test.js`
Expected: all selected tests pass, or if no matching test file exists, Vitest reports no matching tests and the normal suite remains the verification source.

---

### Task 2: Centralize Sam settings and fix tab loading behavior

**Files:**
- Modify: `src/components/admin/AdminSamApiPanel.jsx`
- Modify: `src/components/admin/AdminSamTransfer.jsx`
- Modify: `src/components/admin/AdminSamWalletHistory.jsx`
- Modify: `src/components/admin/AdminSamApiHistory.jsx`
- Modify: `src/data/translations.js`

**Interfaces:**
- `AdminSamApiPanel` owns `samForm` and passes `samSettings` to child tabs.
- Child tabs expose explicit `load()` behavior and do not fetch settings themselves.

- [ ] **Step 1: Remove the duplicate settings request from transfers**

Change `AdminSamTransfer` to accept `samSettings` and derive source identifiers from it. Delete its local `settings`, `settingsLoading`, `loadSettings`, and settings effect. Keep one local loading state for transfer history only.

- [ ] **Step 2: Gate child data loading by active tab**

Render or mount the active Sam child only when selected, and let each child load its own displayed data once. Do not use a parent effect that reloads all tabs after every settings update.

- [ ] **Step 3: Add stale-request protection**

Use a request sequence ref in each async history loader. Only the latest request may update rows, totals, errors, or loading state. Keep explicit refresh buttons and refresh after successful transfer only.

- [ ] **Step 4: Use scoped loading labels**

Add and use separate translation keys such as `samSettingsLoading`, `samTransferHistoryLoading`, `samRechargeHistoryLoading`, and `samExternalWalletLoading` in both locales. Do not reuse `samWalletLoading` for every Sam operation.

- [ ] **Step 5: Verify no hidden Sam settings fetch remains**

Search for `fetchSamApiSettings` under `src/components/admin` and confirm the API panel/settings owner is the only expected caller for this tab flow.

Run: `Select-String -Path src\components\admin\*.jsx -Pattern 'fetchSamApiSettings'`
Expected: only the intended panel/settings paths remain.

---

### Task 3: Build reusable admin customer selector and Sam payout action

**Files:**
- Create: `src/components/admin/AdminSamCustomerPicker.jsx`
- Modify: `src/components/admin/AdminSamTransfer.jsx`
- Modify: `src/components/admin/AdminSamApiPanel.jsx`
- Modify: `src/components/admin/AdminUserDetail.jsx`
- Modify: `src/lib/samApi.js`
- Modify: `src/data/translations.js`

**Interfaces:**
- `AdminSamCustomerPicker({ customers, value, onChange, t })` emits the selected profile row or `null`.
- `AdminSamTransfer` accepts `initialCustomer`, `customerPicker`, `onTransferComplete`, and `samSettings` while retaining manual recipient entry for recipients not stored on a profile.
- `sendSamTransfer` sends `{ method, recipient, amount, currency, note, pinCode, customerId }`; the edge function ignores/records `customerId` only for audit linkage and never trusts it for authorization.

- [ ] **Step 1: Add the customer search data path**

Reuse the existing admin user listing helper with a debounced local search or its existing server-side search. Include `id`, display name, username, balance, and the two recipient fields. Limit results to a small page and show an explicit “recipient not configured” state.

- [ ] **Step 2: Add recipient editing on the customer page**

Add two controlled fields near the existing wallet section. Validate before saving, use the existing admin profile update path, and show masked/truncated identifiers in the selector while preserving copy support for admins.

- [ ] **Step 3: Add the reusable payout entry point**

Render `AdminSamTransfer` in the Sam transfer tab with the customer selector. When a customer is selected, set provider and recipient from the matching stored field. Keep manual recipient editing available with a visible warning when it differs from the stored profile value.

- [ ] **Step 4: Add the customer-page payout action**

Embed the same transfer form/modal in `AdminUserDetail`, passing the loaded profile as `initialCustomer`. On success, call the existing `loadProfile` callback and refresh only that customer’s ledger/profile, not the whole admin dashboard.

- [ ] **Step 5: Link payout audit rows to customers**

Add nullable `customer_id` to `sam_transfers` in the same migration family if absent, include it in edge inserts/list responses, and display customer name when available. Do not infer a customer from a recipient string after the fact.

- [ ] **Step 6: Verify payout safety**

Check that form confirmation is required, PIN state is cleared after submit, failures are inserted into the ledger, and no PIN appears in request payloads after the edge function receives it or in client logs.

---

### Task 4: Replace ambiguous Sam history with customer recharge audit history

**Files:**
- Modify: `supabase/functions/sam-api/index.ts`
- Modify: `src/lib/samApi.js`
- Create or modify: `src/components/admin/AdminSamRechargeHistory.jsx`
- Modify: `src/components/admin/AdminSamApiPanel.jsx`
- Modify: `src/data/translations.js`

**Interfaces:**
- Edge action `listRechargeHistory({ page, pageSize, search, status, method })` returns `{ rows, total, page, pageSize, stats }`.
- Each row includes customer identity, recharge/invoice/request IDs, requested/paid amount, currency, method, request status, credit status, and timestamps.

- [ ] **Step 1: Define the server-side audit query**

Join `sam_invoices` to `recharge_requests`, `profiles`, and relevant `transactions` using existing IDs. Include manual recharge requests through a union or a second query merged server-side. Enforce admin authorization and return no API keys or external wallet secrets.

- [ ] **Step 2: Add filters and stable pagination**

Support customer search, status, payment method, and page/page size. Order by newest event timestamp descending and return a stable total.

- [ ] **Step 3: Build the simplified admin history UI**

Show compact rows with customer, amount, method, recharge status, credit status, date, and “open customer” action. Keep invoice/reference details expandable and add direct refund/adjustment navigation without silently changing balances.

- [ ] **Step 4: Rename the external wallet tab**

Label `AdminSamWalletHistory` as provider diagnostics/external wallet activity and keep it out of the customer recharge audit path. It may remain available for reconciliation but must not be presented as site-user recharge history.

- [ ] **Step 5: Verify reconciliation visibility**

Confirm a paid Sam recharge appears with customer and credit status, a manual approved recharge appears, and a failed/pending record remains visible for investigation.

---

### Task 5: Add exact copy controls to site logs

**Files:**
- Modify: `src/components/admin/AdminSiteLogs.jsx`
- Modify: `src/lib/siteLogs.js`
- Modify: `src/data/translations.js`
- Test: `src/lib/siteLogs.test.js` or a new focused test file if no suitable file exists

**Interfaces:**
- `formatDevLogLine` output gains `copyText` containing the complete diagnostic payload.
- `copyTextToClipboard(value)` returns `Promise<void>` and is handled by the component.

- [ ] **Step 1: Add a pure copy payload formatter**

Build the payload from timestamp, severity, formatted body, fields, console output, URL, and component stack. Use newline-separated text and preserve the exact error message.

- [ ] **Step 2: Add per-row copy action**

Keep the row expandable, but add a sibling copy button inside the expanded detail. Stop propagation so copying does not collapse the row. Show the existing localized copied/copy-failed notifications.

- [ ] **Step 3: Add copy-all-visible-errors**

Add a button near the logs controls that copies visible error/critical rows only. Disable it when no matching rows exist.

- [ ] **Step 4: Add tests**

Test that the payload includes `Unable to preload CSS`, URL, and component stack, and that non-error rows are excluded from copy-all.

---

### Task 6: Handle stale CSS preload failures without reload loops

**Files:**
- Modify: `src/lib/lazyRetry.js`
- Modify: `src/components/ErrorBoundary.jsx`
- Modify: `src/main.jsx` only if boot guard behavior requires it
- Modify: `src/data/translations.js`
- Test: `src/lib/lazyRetry.test.js` or a new focused test file

**Interfaces:**
- `isDynamicImportError(error)` returns true for JS dynamic import and CSS preload failures.
- `reloadOnceForStaleChunk()` permits one guarded recovery attempt per session/time window.

- [ ] **Step 1: Add CSS preload patterns**

Match `Unable to preload CSS`, `stylesheet preload`, and equivalent Vite asset-load messages while preserving current JS chunk detection.

- [ ] **Step 2: Make retry/reload state explicit**

Record the attempted reload state and stop calling `window.location.reload()` after the guard is exhausted. Let `ErrorBoundary` render a manual reload button with a localized stale-asset message.

- [ ] **Step 3: Reduce fragile background CSS splitting**

Import shared `StoreBackgrounds.css` from the stable application stylesheet or another always-loaded entry so Aurora background switching does not depend on a second CSS preload asset. Keep background components lazy only if the CSS no longer creates an independent failure path.

- [ ] **Step 4: Add regression tests**

Test JS and CSS stale-asset messages, one reload per guard window, and no second reload when the guard is already set.

---

### Task 7: Verify the complete flow

**Files:**
- No source changes unless verification finds a defect.

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: zero errors and no new warnings.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all existing and new tests pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Vite build completes and writes the GitHub Pages SPA fallback files.

- [ ] **Step 4: Review the final diff**

Run: `git diff --check`
Expected: no whitespace errors. Confirm no secrets, PINs, API keys, or unrelated files are included.

- [ ] **Step 5: Perform manual smoke checks**

Verify Sam settings loads once, switching tabs does not create repeated wallet loading messages, a customer can be selected and paid from both entry points, customer recharge history shows site-user records, log errors copy exactly, and a stale CSS asset presents one recovery reload followed by a manual action instead of a loop.
