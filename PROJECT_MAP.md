# ECHOCORE Store — Project Map

> **Read this first** before vibecoding. Designed to give full context in ~2 min without re-reading the codebase.

## What it is

Bilingual (AR primary / EN) **digital game top-up store**. React SPA backed by **Supabase** (auth, games, offers, orders, balance, admin settings). Deployed to GitHub Pages.

**Live:** https://gh-zx.github.io/echocore-store/

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + Vite 8 |
| Routing | react-router-dom v7 |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"` in `src/index.css`) |
| DB/Auth | Supabase (`@supabase/supabase-js`) |
| Motion | framer-motion |
| Carousel | embla-carousel-react |
| Nav dropdowns | @radix-ui/react-navigation-menu |
| Background FX | Aurora (WebGL via `ogl`) |
| Card FX | BorderGlow (cursor-reactive borders) |
| Icons | lucide-react |
| Font | Cairo (Google Fonts) |

**Env vars** (`.env` from `.env.example`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Commands:** `npm run dev` · `npm run build` · `npm run lint` · `npm run preview`

---

## Architecture (single-page app)

```
main.jsx          → applyCachedTheme(), BrowserRouter, mounts App
App.jsx           → ALL global state, Supabase data fetching, routes, Header/Footer shell
index.css         → CSS variables (theme), utility classes (.card, .btn, .header-btn, .site-nav-*)
lib/theme.js      → Theme presets, applyTheme(), fetchSiteTheme() RPC
lib/supabase.js   → Client + getUserProfile()
data/translations.js → ar/en UI strings (t.key pattern)
```

**State lives in `App.jsx`:** `user`, `games`, `offers`, `orders`, `cart`, `lang`, `searchQuery`, `homeLayout`, `paymentConfig`, modals.

**Lazy-loaded views:** Login, Cart, Checkout, Admin, AllGames, SaleOffers, FAQ, HowItWorks, Contact, Recharge, Buy, Profile, admin modals.

---

## Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/` | HomeView | Configurable sections via `homeLayout` |
| `/games` | AllGamesView | Full game grid + search |
| `/sale` | SaleOffersView | Discount offers |
| `/game/:slug` | GameDetail (in App.jsx) | Offers for one game |
| `/offer/:id` | OfferDetail (in App.jsx) | Single offer detail |
| `/buy/:offerId` | BuyView | Instant buy + UID/server entry |
| `/cart` | CartView | localStorage-persisted cart |
| `/checkout` | CheckoutView | Multi-item checkout |
| `/success?orderId=` | SuccessView (in App.jsx) | Post-purchase |
| `/login` | LoginView | Supabase auth |
| `/profile` | ProfileView | Auth required |
| `/recharge` | RechargeView | Balance top-up |
| `/dashboard` | AdminView | Admin only |
| `/faq` `/how` `/contact` | Static info pages | |
| `*` | Redirect → `/` | No custom 404 yet |

---

## Key components

| File | Role |
|------|------|
| `Header.jsx` | Sticky header: logo, desktop SiteNav, search, lang, cart, profile dropdown, mobile drawer |
| `SiteNav.jsx` | Desktop nav (Radix): Games, Offers, More dropdown. Exports `NAV_ITEMS` |
| `Aurora.jsx` | Full-screen WebGL aurora background (theme-aware) |
| `BorderGlow.jsx` | Interactive glow on offer cards |
| `HomeView.jsx` | Home sections: carousel, sale offers, games grid (layout-driven) |
| `ProductCarousel.jsx` | Hero carousel with Ken Burns + focus points |
| `ProductCard.jsx` / `HomeGameCard.jsx` / `SaleOfferCard.jsx` | Card variants |
| `AdminView.jsx` | Orders, products, theme, payments, home layout tabs |
| `AdminThemeSettings.jsx` | Theme presets + aurora toggles |
| `AdminHomeLayoutSettings.jsx` | Drag/reorder home sections |
| `Footer.jsx` | Links + socials |

---

## Theme system

**Single source:** CSS variables in `:root` (`src/index.css`) + runtime overrides via `lib/theme.js`.

**Flow:**
1. `main.jsx` → `applyCachedTheme()` (localStorage `echocore-theme`)
2. `App.jsx` mount → `fetchSiteTheme()` Supabase RPC `get_site_theme`
3. Admin saves → `applyTheme(overrides)` + dispatches `themechange` event

**Key vars:** `--bg-primary`, `--accent`, `--text-*`, `--sale-*`, `--games-*`, `--aurora-*`

**Presets:** cyber (default), purple, emerald, rose, amber, ocean, cherry, gold, frost, lava, mint

**Aurora vars:** `--aurora-enabled`, `--aurora-amplitude`, `--aurora-speed`, `--aurora-blend`, `--aurora-responsive`

---

## Supabase tables & RPCs

| Table / RPC | Purpose |
|-------------|---------|
| `games` | Game catalog (slug, images, carousel_order, servers, redemption_method) |
| `offers` | Per-game offers (price, sale, region, descriptions) |
| `profiles` | User role, name, balance |
| `orders` + `order_items` | Purchases (player_uid, player_server on items) |
| `transactions` | Balance recharge/purchase history |
| `store_settings` | Payment flags, theme JSON, home_layout JSON |
| `get_site_theme` | RPC — theme overrides |
| `get_payment_methods` | RPC — enabled payment methods |
| `create_order_atomic` | RPC — atomic order + balance deduct (**run `atomic_order_rpc.sql`**) |

**SQL migration files** (run in Supabase SQL Editor as needed):

```
schema.sql / schema_games_offers.sql   → base schema
add_balance_transactions.sql           → balance + transactions
add_carousel_order.sql / add_carousel_focus.sql
add_player_info.sql / add_game_servers.sql
setup_store_settings.sql               → store_settings table
add_theme_settings.sql / add_payment_settings.sql / add_home_layout.sql
atomic_order_rpc.sql                   → secure checkout RPC
fix_sale_upload_rls.sql
```

---

## Home layout system

`lib/homeLayout.js` — sections: `carousel`, `sale_offers`, `games`, `game_picks`, `offer_picks`

Default: carousel → sale offers (limit 4) → all games grid.

Admin can reorder/add sections via `AdminHomeLayoutSettings` → stored in `store_settings.home_layout`.

---

## i18n

- Default lang: **Arabic** (`localStorage: echocore-lang`)
- UI strings: `translations[lang]` → use `t.key` in components
- Game/offer names: DB fields `name_ar` / `name_en`
- RTL: `dir={lang === 'ar' ? 'rtl' : 'ltr'}` on root; header/nav forced LTR for layout stability

---

## Payment methods

Configured in admin → `store_settings` via `lib/storeSettings.js` + `lib/paymentMethods.js`.

- **Balance** — deduct from `profiles.balance`
- **ShamCash** — `lib/shamcashApi.js` (API integration scaffold)
- **Binance / Mastercard** — toggles (simulated in RechargeView)

---

## Recent uncommitted changes (as of Jul 2026)

These are local edits not yet committed — **merge carefully**:

| Area | Files |
|------|-------|
| **Aurora background** | `Aurora.jsx`, `Aurora.css`, `theme.js` (aurora vars) |
| **Header / navbar** | `Header.jsx`, `SiteNav.jsx`, `index.css` (`.site-nav-*`, `.header-btn-*`) |
| **Border glow cards** | `BorderGlow.jsx`, `BorderGlow.css` |
| **Theme admin** | `AdminThemeSettings.jsx` |
| **App shell** | `App.jsx` (Aurora wrapper, z-index layering) |
| **Atomic orders** | `atomic_order_rpc.sql` |
| **Deps** | `package.json` — added `ogl`, `@radix-ui/react-navigation-menu` |

---

## Common edit locations

| Task | Where to look |
|------|---------------|
| Change colors globally | `src/index.css` `:root` + `src/lib/theme.js` |
| Nav links / structure | `src/components/SiteNav.jsx` → `NAV_ITEMS` |
| Header buttons / mobile menu | `src/components/Header.jsx` |
| Add UI text | `src/data/translations.js` (ar + en) |
| New page/route | `App.jsx` Routes + new `*View.jsx` |
| Home section order | `lib/homeLayout.js` defaults or admin settings |
| Carousel behavior | `ProductCarousel.jsx`, `lib/carouselUtils.js` |
| Checkout logic | `App.jsx` → `submitOrder`, `submitPurchase` |
| Admin features | `AdminView.jsx` + `Admin*Settings.jsx` / modals |

---

## CSS class cheat sheet

```
.card / .btn-primary / .btn-secondary / .btn-ghost / .input / .badge / .toast
.header-btn / .header-btn--accent / .header-btn--danger / .header-profile-dropdown
.site-nav-trigger / .site-nav-dropdown / .site-nav-item-glow
.action-chip / .header-balance (monospace)
.sale-offers-section / .games-section (theme section colors)
.echo-logo (accent-tinted filter)
```

---

## Pre-flight checklist (before shipping changes)

- [ ] `npm run build` passes
- [ ] Theme still applies (cached + Supabase RPC)
- [ ] Aurora renders / can be disabled via admin
- [ ] Desktop nav dropdowns work (Radix)
- [ ] Mobile menu has nav links + search + account actions
- [ ] RTL (AR) layout not broken on content pages
- [ ] Cart persists in localStorage (`echocore-cart`)
- [ ] Login/logout doesn't spam toast on tab focus
- [ ] Admin dashboard requires `profiles.role = 'admin'`
- [ ] If touching checkout: `create_order_atomic` RPC deployed
- [ ] Env vars set for deploy target

---

## Known gaps / TODOs

- No dedicated 404 page (catch-all → home)
- Privacy/Terms footer links point to `/` (placeholder)
- `mockProducts.js` legacy — products come from Supabase now
- README partially outdated (still mentions mockProducts for adding products)

---

## File tree (source only)

```
src/
├── App.jsx                 # God component: state, routes, auth, orders
├── main.jsx
├── index.css               # Theme vars + global styles
├── assets/                 # Game logos/images
├── components/
│   ├── Header.jsx, SiteNav.jsx, Footer.jsx, EchoLogo.jsx
│   ├── Aurora.jsx, BorderGlow.jsx
│   ├── HomeView.jsx, ProductCarousel.jsx
│   ├── *View.jsx           # Page views
│   └── Admin*.jsx          # Admin modals/settings
├── data/
│   ├── translations.js
│   └── mockProducts.js     # Legacy
└── lib/
    ├── supabase.js, theme.js, homeLayout.js, storeSettings.js
    ├── paymentMethods.js, shamcashApi.js
    ├── carouselUtils.js, uploadImage.js, gameImageSearch.js
```

---

*Last updated: Jul 2026 — regenerate sections if major refactors land.*