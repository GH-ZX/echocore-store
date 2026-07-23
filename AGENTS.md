# AGENTS.md - ECHOCORE Store (agent orientation)

**Always-on rules for every session.** Do not re-scan the whole repo.

## Orientation protocol (mandatory)

1. **Do not** start with recursive `list_dir` / full-tree exploration of `src/`, `supabase/`, or `scripts/`.
2. **Do** map the user request to a domain row in the playmap, then open **only** those files.
3. Full routing table: `.grok/skills/echocore-orientation/references/playmap.md`
4. Skill shortcut: `/echocore-orientation` (or auto-invoke when starting work here).
5. Narrative overview (if still lost): `PROJECT_MAP.md` (~2 min read). Architecture notes: `CLAUDE.md`.
6. Human docs: `docs/README.md`. Database: **only** `supabase_echocore_full.sql` (scripts/*.sql migrations were merged and removed).

## Stack (one line)

React 19 + Vite 8 SPA · Tailwind v4 · Supabase · AR/EN · GitHub Pages → `www.echocore412.com`

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run preview`

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_DOMAIN`, `VITE_BASE_PATH` (from `.env`)

## Non-negotiable conventions

| Topic | Rule | Where |
|-------|------|--------|
| i18n | No inline `isAr ? '…' : '…'`. Use `t.key` / `formatMessage` | `src/data/translations.js`, `pageContent.js`, `lib/i18n.js` · skill `echocore-standards` |
| Pricing | Customer price ≠ raw supplier cost; never client-mutate `g2bulk_cost_usd` | `lib/offerPricing.js`, `lib/offerCost.js` · skill `g2bulk-api` |
| G2Bulk | Sole API truth is `docs/g2bulk-api.md` — never fetch api.g2bulk.com | skill `g2bulk-api` |
| Sam / wallet | ShamCash recharge, invoice webhooks, manual vs API mode | skill `sam-api-wallet` |
| Customer copy | Strip supplier brand names via `brandUserText` | `lib/branding.js` |
| Admin CRUD | Game/offer forms only in modals, not inline in `AdminView` | `AdminGameEditModal`, `AdminOfferEditModal` |

## Where state and routes live

| Concern | File |
|---------|------|
| Global state + Supabase hydration | `src/App.jsx` |
| Route table (lazy views) | `src/components/routing/AppRoutes.jsx` |
| Auth/site gates | `ProtectedRoute.jsx`, `SiteGate.jsx` |
| Supabase client | `src/lib/supabase.js` |
| DB bootstrap SQL | `supabase_echocore_full.sql` |
| Edge functions | `supabase/functions/*` |

## Surgical search habits

- Prefer `grep` with path scoped to `src/lib`, `src/views`, `src/components/<area>`.
- Prefer `read_file` on playmap targets over listing directories.
- New UI string → both `ar` and `en` in `translations.js` or `pageContent.js`.
- New route → `AppRoutes.jsx` + pass `t`/`lang` from `App.jsx`.
- New admin tab → `AdminView.jsx` + dedicated manager under `src/components/admin/`.

## Domain skills (load when relevant)

- `echocore-orientation` — task → files playmap (this orientation layer)
- `echocore-standards` — i18n + lean architecture
- `g2bulk-api` — catalog, purchase, fulfillment
- `sam-api-wallet` — wallet / ShamCash / recharge automation

## Memory & hooks (session setup)

- **Memory** is enabled in `~/.grok/config.toml` (`[memory] enabled = true`). Use `/remember` for durable notes; `/flush` after important sessions.
- **Safety hooks** live in `.grok/hooks/` (shell deny-list). Not for orientation. Trust once with `/hooks-trust` if project hooks are skipped. Global copy also under `~/.grok/hooks/`.
