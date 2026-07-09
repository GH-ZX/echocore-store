# ECHOCORE Store — Project Map

> Read this first for full context in ~2 minutes.

## What it is

Bilingual (AR primary / EN) **digital game top-up store**. React SPA backed by **Supabase** (auth, games, offers, orders, balance, admin). Static frontend on **GitHub Pages** with custom domain.

**Live:** https://www.echocore412.com

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + Vite 8 |
| Routing | react-router-dom v7 (`AppRoutes.jsx`) |
| Styling | Tailwind CSS v4 |
| DB/Auth | Supabase |
| i18n | `translations.js` + `pageContent.js` + `lib/i18n.js` |
| Motion | framer-motion |
| Deploy | GitHub Actions → GitHub Pages (`www.echocore412.com`) |

**Env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_DOMAIN`, `VITE_BASE_PATH`

**Commands:** `npm run dev` · `npm run build` · `npm run lint`

---

## Architecture

```
main.jsx              → BrowserRouter (basename), theme cache
App.jsx               → Global state, Supabase ops, Header/Footer, modals
components/routing/
  AppRoutes.jsx       → All <Routes> (lazy views)
  PageLoader.jsx      → Suspense fallback (t.loadingAdminTab)
  LangSwitchOverlay.jsx
  ProtectedRoute.jsx
data/translations.js  → UI strings (ar/en)
data/pageContent.js   → Page blocks (FAQ, legal, footer)
lib/i18n.js           → getT(), formatMessage()
```

**State in `App.jsx`:** `user`, `games`, `offers`, `orders`, `cart`, `lang`, `homeLayout`, `paymentConfig`, admin modals.

**Standards:** `.grok/skills/echocore-standards/` — no inline `isAr ?` copy; use `t.key` only.

---

## Routes (see `AppRoutes.jsx`)

| Path | View | Notes |
|------|------|-------|
| `/` | HomeView | `home_layout` sections |
| `/games` `/gift-cards` `/accounts` `/search` `/sale` | Catalog views | |
| `/game/:slug` | GameDetail | |
| `/game/:gameSlug/:offerSlug` | OfferDetail | |
| `/game/.../buy` | BuyView | Protected |
| `/cart` `/checkout` `/recharge` | Protected | |
| `/dashboard/*` | AdminView | Admin only |
| `/links` | Linktree-style social | |
| `/developer` | Developer credits | |
| `/faq` `/how` `/contact` `/privacy` `/terms` | Static content | |

---

## Database

**Database setup:** [supabase_echocore_full.sql](./supabase_echocore_full.sql) (single file, ~2,800 lines)

Setup guide: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) · [SUPABASE_SETUP.ar.md](./SUPABASE_SETUP.ar.md)

---

## Admin tabs

Overview · Games · Orders · Recharges · Payments · Theme · Home layout · Reviews · G2Bulk · Dev tools

Game CRUD: `AdminGameEditModal` only (no inline form in `AdminView`).

---

## Deploy checklist

- [ ] GitHub secrets: Supabase URL/key, `VITE_SITE_DOMAIN=www.echocore412.com`, `VITE_BASE_PATH=/`
- [ ] Supabase Auth redirect URLs match production domain
- [ ] SQL full file applied on Supabase project
- [ ] Admin `role` set in `profiles`

Arabic map: [PROJECT_MAP.ar.md](./PROJECT_MAP.ar.md)