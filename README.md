# ECHOCORE Store — Real Digital Gaming Store

**Live:** https://www.echocore412.com  
**Version:** 0.5.0

Bilingual (Arabic / English) game top-up and digital cards storefront. React + Supabase + GitHub Pages.

النسخة العربية: [README.ar.md](./README.ar.md)

---

## Features

- Supabase database (games, offers, orders, auth, balance)
- Admin dashboard (`/dashboard`) — catalog, payments, theme, home layout, G2Bulk
- ShamCash manual recharge + checkout (admin approval)
- Centralized i18n (`translations.js` / `pageContent.js`)
- Custom domain on GitHub Pages

**Full database setup:** [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) · [عربي](./SUPABASE_SETUP.ar.md)

---

## Quick start

```bash
git clone https://github.com/GH-ZX/echocore-store.git
cd echocore-store
npm install
cp .env.example .env   # Supabase keys
npm run dev
```

Open http://localhost:5173

### Supabase (one SQL file)

In Supabase **SQL Editor**, run:

👉 [supabase_echocore_full.sql](./supabase_echocore_full.sql)

Then set your `profiles.role` to `admin`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build + GitHub Pages SPA helpers |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

---

## Deploy

Push to `main` → GitHub Actions runs lint, build, deploy to Pages.

**Required secrets:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_DOMAIN` (`www.echocore412.com`), `VITE_BASE_PATH` (`/`).

Details: [RUNNING.md](./RUNNING.md) · [PROJECT_MAP.md](./PROJECT_MAP.md)

---

## Project layout

```
src/
├── App.jsx                 # State, handlers, shell
├── components/routing/     # AppRoutes, loaders, guards
├── views/                  # Page components
├── data/                   # translations, pageContent
└── lib/                    # Supabase, cart, payments, theme
supabase_echocore_full.sql  # Complete DB setup (run this)
```

---

## Docs

| File | Language |
|------|----------|
| [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) | EN |
| [SUPABASE_SETUP.ar.md](./SUPABASE_SETUP.ar.md) | AR |
| [PROJECT_MAP.md](./PROJECT_MAP.md) | EN |
| [PROJECT_MAP.ar.md](./PROJECT_MAP.ar.md) | AR |
| [RUNNING.md](./RUNNING.md) | AR |
| [CREDITS.md](./CREDITS.md) | EN |

---

© 2026 ECHOCORE Store · Developer: [Ahmed Ghawi](https://github.com/GH-ZX)