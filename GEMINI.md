# GEMINI.md

> **ECHOCORE Store** — Project-Specific Instructional Context & Developer Guide for Gemini CLI.
> **Date:** Monday, July 13, 2026
> **Version:** 0.5.0

---

## 1. Project Overview

**ECHOCORE Store** is a high-performance, bilingual (Arabic primary / English) digital game top‑up and digital vouchers storefront.
* **Frontend:** React 19 + Vite 8 (Single Page Application).
* **Styling:** Tailwind CSS v4 for modern, responsive, and RTL-optimized design.
* **State Management:** React state orchestrated in `App.jsx`, hydrated from Supabase on app mount. No external heavy stores.
* **Routing:** `react-router-dom` v7 with views lazy-loaded via `React.lazy` and protected by authentication guards.
* **Backend:** Supabase (PostgreSQL database, Gotrue Auth, Storage for product images, and Edge Functions).
* **Deployment:** Hosted statically on **GitHub Pages** (using a custom domain `www.echocore412.com`) via GitHub Actions.

---

## 2. Core Development Commands

All tasks are standard Node scripts. Ensure you have Node.js 18+ and npm installed.

| Command | Description |
|---------|-------------|
| `npm run dev` | Starts the Vite development server (hot‑reload) at `http://localhost:5173`. |
| `npm run build` | Builds a production-ready bundle in `dist/` and runs the GitHub-Pages SPA helper `scripts/gh-pages-spa.mjs`. |
| `npm run lint` | Runs ESLint across the codebase. Ensure this passes before staging any changes. |
| `npm run preview` | Serves the built production static site locally (`vite preview`). |
| `npm run upload:game-logos` | Uploads game logo assets from local storage to Supabase storage `product-images` bucket. |

---

## 3. Environment Variables

Create a local `.env` file based on `.env.example`. **NEVER** expose backend secrets (like G2Bulk API keys or Sam API keys) with the `VITE_` prefix, as they will get compiled into the client-side bundle.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project endpoint URL. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase public anon key for safe client-side SDK requests. |
| `VITE_SITE_DOMAIN` | No | Domain used for auth redirects (default: `www.echocore412.com` in production). |
| `VITE_BASE_PATH` | No | Base path for GitHub Pages routing (usually `/`). |

---

## 4. System Architecture & Directory Map

```
/
├── .github/workflows/deploy.yml   # Build and deploy pipeline to GitHub Pages
├── docs/                          # API documentation and schemas (e.g., g2bulk-api.md)
├── scripts/                       # Database migrations, seed scripts, and automation helpers
├── supabase/                      # Supabase configuration and Edge Functions
│   ├── config.toml                # Functions metadata (e.g., JWT verification disables)
│   └── functions/                 # Deno-based Supabase Edge Functions (g2bulk, sam-api)
├── src/                           # Frontend React application source
│   ├── main.jsx                   # Entry point (Router context, theme cache init)
│   ├── App.jsx                    # Orchestrator of global state, dialog toggles, and DB calls
│   ├── assets/                    # Static UI icons and localized layout images
│   ├── components/                # Modular UI components
│   │   ├── routing/               # AppRoutes.jsx (lazy routing definitions), ProtectedRoute
│   │   ├── admin/                 # Specialized admin dashboard panel components & settings modals
│   │   └── ui/                    # Generic UI components (buttons, badges, inputs, dropdowns)
│   ├── data/                      # Global translations (translations.js) and legal page content (pageContent.js)
│   ├── hooks/                     # Custom hooks (scroll lock, dropdown positions, admin wallet cache)
│   └── lib/                       # Business logic, state formatters, API clients, and theme managers
```

---

## 5. Non-Negotiable Coding Standards

### 5.1 Centrally Managed Internationalization (i18n)
Arabic (`ar`) is the primary language, with English (`en`) as the secondary. **Inline bilingual checks and strings are strictly forbidden.**

❌ **Avoid:**
```js
isAr ? 'نص عربي' : 'English text'
lang === 'ar' ? '...' : '...'
t.someKey || (isAr ? '...' : '...')
```

✔️ **Required:**
Add the keys and translations in `src/data/translations.js` or structural arrays in `src/data/pageContent.js` for both Arabic and English. Then reference them through the injected `t` object or `getT(lang)` helper:
```js
// Standard Component usage
{t.backToStore}

// Dynamic interpolation (using src/lib/i18n.js)
import { getT, formatMessage } from '../lib/i18n';
const t = getT(lang);
formatMessage(t.footerCopyright, { version: APP_VERSION })
```
* **Variables:** Use camelCase for translation keys (e.g., `checkoutWalletNote`). Placeholders are marked as `{variableName}` and resolved with `formatMessage(t.key, { variableName })`.
* **RTL:** Only use `lang` or `isAr` logic for purely directional or layout configurations (`dir="rtl"`, icon arrow directions).

### 5.2 Pricing Logic & Markup
EchoCore acts as a retail middleman for G2Bulk supplier catalog items.
* **Database Value:** `g2bulk_cost_usd` represents the raw supplier cost and must **NEVER** be modified from the client-side.
* **Customer Formula:** Calculated on-the-fly or saved as: `offer.price = supplierCost * (1 + markup) + optionalCharm`.
* **Charm Pricing Tiers:** Dynamic customer rounding offsets (e.g., rounding values to end in `.49`, `.89`, or `.99`) to maximize conversions.
* **Admin Badges:** Supplier costs are displayed exclusively to authenticated admins via `AdminOfferCostBadge` next to the customer retail prices.

### 5.3 Connected & Lean Code Architecture
* **Single Source of Truth for DB Mutations:** Do not run manual or raw database mutations (Supabase updates) directly in page views. All operations must be coordinated through centralized functions in `App.jsx` or specialized store managers under `src/lib/`.
* **Zero Form Duplication:** Keep views clean. Do not embed entity creation/updating forms directly inside dashboard views. For example, editing games should only use `AdminGameEditModal`, never a second inline edit form inside `AdminView.jsx`.
* **Verify Changes:** Always run `npm run lint` and `npm run build` locally before wrapping up a branch or pushing to production.

---

## 6. Critical Integrations

### 6.1 G2Bulk Integration (B2B Catalog & Fulfillment)
The official supplier API integration rules are fully detailed in `docs/g2bulk-api.md`.
* **Security Guardrail:** The G2Bulk API Key is treated as a highly sensitive secret. It is stored in Supabase secrets or backend database configs, and is called exclusively via the `g2bulk` Supabase Edge Function (`supabase/functions/g2bulk/`). **Never expose it to React/Vite frontend variables.**
* **IP Blocking Threat:** Repeated failed authentication (401) on `api.g2bulk.com` leads to a **permanent IP ban**. Always validate keys or config once; avoid aggressive loops or retries upon 401.
* **Top-Up Verification:** Before checking out, top-up items require UID player verification via the `checkPlayerId` edge proxy.
* **Idempotency:** Purchases must supply an `X-Idempotency-Key` (a 36-character UUID) to prevent double charges on retries.

### 6.2 Sam API Integration (Payment Gateway & Recharge)
The integration with `sam-api.pro` automates Syrian digital wallets (such as Syriatel Cash and ShamCash) while retaining manual recharge mechanisms.
* **Dual-Mode Config:** Admin can toggle `sam_wallet_mode` between `'manual'` and `'api'` inside the Admin Payments settings.
* **Webhook Hardening:** The invoice webhook URL contains a randomly generated token (`?token=<sam_webhook_secret>`). Edge function validates incoming payload parameters (`amount`, `currency`, `method`) against `sam_invoices` table to prevent price-tampering or replay attacks before crediting user balances.

---

## 7. Developer Tooling & Automation

The repository contains specialized tools and rules:
* **Cursor Rules (`.cursor/rules/echocore-standards.mdc`):** Actively checks and warns developers if hardcoded inline bilingual text blocks or unsafe raw price modifications are introduced.
* **Specialized Grok/Claude Skills (`.grok/skills/`):**
  * `echocore-standards/` — Enforces clean code architecture, i18n rules, and files/bloat limits.
  * `g2bulk-api/` — Standardizes client-server contracts for supplier purchases, polling, and catalog synchronization.
  * `sam-api-wallet/` — Standardizes سوریه digital cash payment invoice generation and verification flows.
* **PowerShell & Migration Scripts (`scripts/`):**
  * `run-fresh-start.ps1` — Completely purges order history and catalogs to clean test environments without deleting critical settings.
  * `recharge-min-1-migration.sql` — Migration script setting safety checks on minimal recharges.
  * `upload-game-logos.mjs` — Automated asset uploader using Node.

---

This `GEMINI.md` file serves as the definitive contextual compass for all your development actions inside the **ECHOCORE Store** repository. Adhere to these architectural standards rigorously on every task.
