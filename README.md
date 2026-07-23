# ECHOCORE Store — Real Digital Gaming Store

**Live:** https://www.echocore412.com  
**Version:** 0.5.0

Bilingual (Arabic / English) game top-up and digital cards storefront.  
React + Supabase + GitHub Pages.

**License:** Proprietary — all rights reserved. Source is public for transparency only; not licensed for reuse. See [LICENSE](./LICENSE).

**النسخة العربية:** [README.ar.md](./README.ar.md)

---

## Docs (keep it simple)

👉 **[docs/README.md](./docs/README.md)** — one page that points to everything else  

Owner (plain language): [docs/for-owners.md](./docs/for-owners.md) · [تقرير المالك](./تقرير-تطوير-الموقع-للمالك.txt)

---

## Features

- Supabase database (games, offers, orders, auth, balance)
- Admin dashboard (`/dashboard`) — catalog, payments, theme, home layout, G2Bulk
- G2Bulk catalog sync + auto-fulfillment; charm pricing
- ShamCash / Sam API recharge + checkout
- Order & recharge invoices (PNG/PDF)
- Centralized i18n (AR/EN)
- Custom domain on GitHub Pages

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

### Database (new project)

In Supabase **SQL Editor**, run **only**:

👉 [supabase_echocore_full.sql](./supabase_echocore_full.sql)

Then set your `profiles.role` to `admin`.

All schema lives in that single SQL file (migrations were merged in).

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build + GitHub Pages helpers |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

---

## Deploy

Push to `main` → GitHub Actions: lint, build, deploy to Pages.

**Secrets:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_DOMAIN` (`www.echocore412.com`), `VITE_BASE_PATH` (`/`).

---

## Project layout (short)

```
src/                      Website (React)
supabase/functions/       Server edge functions (G2Bulk, Sam, …)
supabase_echocore_full.sql  Full database bootstrap
scripts/                  Extra SQL patches + build tools  → scripts/README.md
docs/                     Human guides                  → docs/README.md
```

---

## Credits

[CREDITS.md](./CREDITS.md) · Developer: [Ahmed Ghawi](https://github.com/GH-ZX)

© 2026 ECHOCORE Store. All rights reserved.
