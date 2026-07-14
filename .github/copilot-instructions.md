# Copilot Instructions for ECHOCORE Store

## Build, lint, and test commands

Use npm scripts from `package.json`:

- `npm run dev` — start Vite dev server
- `npm run build` — production build (`vite build`) + GitHub Pages SPA helper (`scripts/gh-pages-spa.mjs`)
- `npm run lint` — run ESLint
- `npm run preview` — preview built app locally
- `npm run upload:game-logos` — upload logo assets to Supabase Storage (`product-images`)

Testing status:

- There is currently no test runner/script configured in `package.json` (no `npm test` script).
- Single-test command is therefore not available yet in this repo. If a runner is added later, use that runner’s file-level command (for example, `npm test -- <test-file>` if a compatible test script is introduced).

## High-level architecture

- `src/main.jsx` mounts the SPA with `BrowserRouter` using Vite base path handling.
- `src/App.jsx` is the orchestration layer: global app state (auth/user, games/offers/orders/cart, language, theme/home layout, notifications), Supabase-backed operations, and route handler wiring.
- `src/components/routing/AppRoutes.jsx` defines route graph and lazy-load boundaries; protected screens are wrapped with `ProtectedRoute`, and global access gating uses `SiteGate`.
- `src/lib/*` holds business/service logic (Supabase client wrappers, catalog + cart logic, payments, invoices, route helpers). Keep page/view components thin and reuse these modules.
- Supabase Edge Functions are invoked from client wrappers (for example `src/lib/g2bulk.js` and `src/lib/samApi.js`) via `supabase.functions.invoke(...)`; frontend should not contain supplier/payment secrets.
- i18n is centralized through `src/data/translations.js` + `src/data/pageContent.js`, with helpers in `src/lib/i18n.js` (`getT`, `formatMessage`).
- Deployment behavior is defined in `.github/workflows/deploy.yml`: `npm ci` → `npm run lint` → `npm run build` → publish `dist/` to GitHub Pages on `main`.

## Key repository conventions

- **i18n is non-negotiable:** no inline bilingual branching for user-facing copy (no `isAr ? '...' : '...'` for text). Add both `ar` and `en` entries in `translations.js` or `pageContent.js`, then consume via `t.key` and `formatMessage(...)`.
- **Arabic-first defaults:** language defaults to `ar` (persisted in local storage); English is secondary.
- **Single mutation path:** avoid direct/duplicated Supabase CRUD in views. Put data mutations in shared `App.jsx` handlers or `src/lib/*` modules and reuse existing modals/flows.
- **Pricing boundary:** treat `g2bulk_cost_usd` as supplier cost data, not customer-facing price logic to be freely edited in random UI code. Admin-only supplier-cost display uses `AdminOfferCostBadge`.
- **Route consistency:** prefer existing route helpers (for example in `src/lib/adminRoutes.js` and `src/lib/offerRoutes.js`) over ad-hoc path strings.
- **Supplier/payment integrations:** for G2Bulk work, follow `docs/g2bulk-api.md` as the source of truth; for Sam API wallet/invoice behavior, follow existing `src/lib/samApi.js` and related edge-function flows.
- **Customer-facing supplier wording:** user-facing messages should be branded/sanitized (see `src/lib/branding.js`) rather than exposing raw supplier/internal wording.

## MCP tooling

- Playwright MCP is configured for workspace clients in `.vscode/mcp.json` as server name `playwright` (`npx @playwright/mcp@latest`).
