# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**ECHOCORE Store** – a bilingual (Arabic/English) digital game top‑up storefront built with:
- **React 19** + **Vite 8** (SPA)
- **Tailwind CSS v4** for styling
- **Supabase** (PostgreSQL, Auth, Edge Functions, Storage) for backend services
- Deployed as a static site on **GitHub Pages** with a custom domain.

The codebase is open‑source for transparency but not licensed for reuse.

---

## Core Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Starts the Vite development server (hot‑reload). |
| `npm run build` | Produces a production build in `dist/` and runs the GitHub‑Pages helper (`scripts/gh-pages-spa.mjs`). |
| `npm run lint` | Runs ESLint across the repo. |
| `npm run preview` | Serves the production build locally (`vite preview`). |
| `npm run upload:game-logos` | Uploads game logo assets to Supabase storage (used by admin UI). |

**Running a single test** – this project does not ship a test harness out of the box. If Jest/Mocha is added later, use `npm test -- <test‑file>`.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key for client‑side SDK |
| `VITE_SITE_DOMAIN` | Domain used for redirects (e.g., `www.echocore412.com`) |
| `VITE_BASE_PATH` | Base path for GitHub Pages (normally `/`) |

All variables are read from the `.env` file (copy `.env.example` first). They are required for local development and CI deployments.

---

## High‑Level Architecture

```
src/
├─ App.jsx                 # Global state (user, games, offers, cart, language, theme)
├─ components/
│   ├─ routing/            # AppRoutes.jsx (react‑router‑dom v7), ProtectedRoute, PageLoader
│   └─ ...                 # UI components (Header, Footer, modals, Admin panels)
├─ lib/                    # Supabase client wrappers, cart logic, payments, i18n helpers
│   ├─ supabase.js         # Single Supabase client instance
│   ├─ cart.js             # Cart CRUD, price calculations, charm pricing rules
│   ├─ payments.js         # Integration with G2Bulk & Sam‑API wallets
│   ├─ i18n.js             # `getT()`/`formatMessage()` for AR/EN strings
│   ├─ gameDescriptions.js / offerDescriptions.js  # Default copy with placeholders
│   ├─ redeemInstructions.js  # Per-slug steps from pageContent
│   └─ invoice*.js         # Invoice build, fetch, PNG/PDF download
├─ components/invoices/    # InvoiceDocument, InvoiceDownloadActions
├─ data/                   # `translations.js` (key/value strings) and `pageContent.js`
├─ views/                  # Route‑level page components (Home, Catalog, Dashboard, Checkout)
└─ assets/                 # Static assets (icons, images that are not uploaded)
```

**Routing** – defined in `src/components/routing/AppRoutes.jsx`. All routes are lazy‑loaded via `React.lazy` and wrapped with `ProtectedRoute` where authentication is required.

**State Management** – simple React state in `App.jsx`; no external store. The state is hydrated from Supabase on app mount.

**Supabase Edge Functions** – located in `supabase/functions/` (e.g., `g2bulk-sync-cron`, `sam-api`). They are deployed with `supabase functions deploy <name>` and called from the client via the Supabase JS SDK.

**Admin Dashboard** – under `/dashboard/*`. Only users with the `admin` role (set in the `profiles` table) can access. UI follows a tabbed layout; each admin tab has its dedicated modal component for CRUD operations.

---

## Important Conventions

- **Internationalisation** – All UI strings must be accessed through the translation helper `t.key` (see `src/data/translations.js`). Direct conditional Arabic/English literals (`isAr ? …`) are disallowed; the standard is enforced by `.grok/skills/echocore-standards/`.
- **Pricing Logic** – `g2bulk_cost_usd` (supplier cost) is stored in the database. The customer price is calculated as `offer.price = supplierCost * (1 + markup) + optionalCharm`. Admin view shows the raw cost via `AdminOfferCostBadge`.
- **Asset Uploads** – Game logos are stored in Supabase storage bucket `product-images`. Use the `npm run upload:game-logos` script to sync local assets.
- **GitHub Actions Deploy** – `/.github/workflows/deploy.yml` runs on pushes to `main`: it lints, builds, and publishes `dist/` to GitHub Pages.

---

## Skills & Super‑powers

The repository ships a set of **Grok‑powered skills** that Claude Code can invoke:

- `.grok/skills/echocore-standards/SKILL.md` – enforces the i18n and pricing conventions described above.
- `.grok/skills/g2bulk-api/SKILL.md` – wraps the G2Bulk bulk‑pricing API (pricing rules, charm handling).
- `.grok/skills/sam-api-wallet/SKILL.md` – wraps the Sam‑API wallet recharge flow.

These skills expose structured output schemas that downstream agents can consume.

---

## Cursor Rules

Relevant rules are defined in `.cursor/rules/echocore-standards.mdc`. They primarily guard against:
- Direct string interpolation of Arabic/English branches.
- Modifying `g2bulk_cost_usd` on the client side.
- Committing generated `.env` secrets.

Claude Code will automatically honour these rules when editing files.

---

## .grokignore

The default Grok ignore list is appropriate for this Node/TypeScript project (see `.grokignore`). It excludes:
- `node_modules/`, `dist/`, `build/`, coverage folders, and any generated media.
- Sensitive environment files (`.env`).

---

## Quick Reference for Claude Code

- **Do not re-scan the whole repo.** Use `AGENTS.md` (always-on) + `/echocore-orientation` playmap at `.grok/skills/echocore-orientation/references/playmap.md` — open only the task’s files.
- Use **`/run`** (or the `run` skill) to start the dev server when you need to verify UI changes.
- Invoke **`/code-review`** with `--fix` to let Claude automatically apply lint-level fixes.
- When you need to bulk-upload assets, call the `upload:game-logos` NPM script.
- For any Supabase Edge Function work, reference the `supabase/functions/` directory and use the `supabase` CLI.

---

## Resources

- **AGENTS.md** – always-on agent orientation (no full-repo scan).
- **`.grok/skills/echocore-orientation/`** – task → files playmap skill.
- **README.md** – high-level feature list and quick-start steps.
- **PROJECT_MAP.md** – detailed layer diagram, routes, and admin tab description.
- **SUPABASE_SETUP.md** – full database schema (single SQL file) and initialization steps.
- **RUNNING.md** – local run instructions (Arabic version included).

---

*This CLAUDE.md is intended for Claude Code agents only; it is **not** a user‑facing README.*