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

**Commands:** `npm run dev` · `npm run build` · `npm run lint` · `npm run preview`

---

## Architecture

```
main.jsx              → BrowserRouter (basename), theme cache
App.jsx               → Global state, Supabase ops, Header/Footer, modals
components/routing/
  AppRoutes.jsx       → All <Routes> (lazy views)
  ProtectedRoute.jsx  → Auth guard; PageLoader uses t.loading
  PageLoader.jsx      → Suspense fallback
  SiteGate.jsx        → Site status gate
data/
  translations.js     → UI strings (ar/en); spreads pageContent
  pageContent.js      → FAQ, legal, footer, redeem step arrays
lib/
  i18n.js             → getT(), formatMessage()
  gameDescriptions.js → Game marketing copy + {game}/{currency} fallback
  offerDescriptions.js→ Offer copy + {gameName}/{offerName}/{region} fallback
  redeemInstructions.js → Reads per-slug steps from pageContent
  invoiceBuilder.js   → Build order/recharge invoice payloads
  invoices.js         → Fetch invoice data + access control
  invoiceDownload.js  → PNG + visual PDF (html capture → jsPDF)
components/invoices/
  InvoiceDocument.jsx → Receipt layout (single card)
  InvoiceDownloadActions.jsx
views/
  OfferDetail.jsx     → Pack detail + purchase panel
  InvoiceView.jsx     → /invoice/:kind/:id
  TestViewReceipt.jsx → Dev-only UI preview (mock data)
```

**State in `App.jsx`:** `user`, `games`, `offers`, `orders`, `cart`, `lang`, `homeLayout`, `paymentConfig`, admin modals.

**Standards:** `.grok/skills/echocore-standards/` — no inline `isAr ?` copy; use `t.key` + `formatMessage()` only.

**Customer copy:** `lib/branding.js` → `brandUserText()` strips supplier name from user-facing strings. G2Bulk wording stays in admin/supplier UI only.

**Pricing (G2Bulk):** `g2bulk_cost_usd` = supplier cost · `offer.price` = customer price (markup + optional charm `.49`/`.89`/`.99`). Admin sees cost via `AdminOfferCostBadge`.

---

## i18n & default copy

| Layer | Use for |
|-------|---------|
| `translations.js` | Buttons, labels, toasts, admin tabs, invoice strings |
| `pageContent.js` | FAQ, legal, footer, **redeemSteps** / **topupInvoiceSteps** per game slug |
| `formatMessage(t.key, { gameName, offerName, region })` | Placeholders in templates |

**Game description fallback:** `gameDescriptionFallback` — `{game}`, `{currency}` via `getGameMarketingDescription()`.

**Offer description fallback:** `offerDescriptionFallback` (+ UID/code variants) via `getOfferDescription()`. Empty or synced-duplicate DB text triggers the template. Admins can write `{gameName}` / `{offerName}` / `{region}` in custom offer descriptions.

**Terminology (customer-facing):** use **top-up code / كود شحن**, not financial “refund” wording for redeem flows.

---

## Routes (see `AppRoutes.jsx`)

| Path | View | Notes |
|------|------|-------|
| `/` | HomeView | `home_layout` sections, carousel |
| `/games` | AllGamesView | PC / top-up catalog |
| `/gift-cards` | GiftCardsView | Vouchers & platform cards |
| `/accounts` | GamingAccountsView | Legacy lane → gift-cards |
| `/search` | SearchView | Unified search |
| `/sale` | SaleOffersView | Discount offers |
| `/game/:slug` | GameDetail | Game + pack grid |
| `/game/:gameSlug/:offerSlug` | OfferDetail | Pack detail |
| `/game/:gameSlug/:offerSlug/buy` | BuyView | Protected checkout |
| `/cart` `/checkout` | Protected | |
| `/recharge` | RechargeView | Protected; admins → `/dashboard/payments` |
| `/success` | SuccessView | Order receipt / codes |
| `/invoice/:kind/:id` | InvoiceView | Protected · `kind` = `order` \| `recharge` |
| `/profile` | ProfileView | Orders, stats, settings |
| `/notifications` | NotificationsView | Inbox incl. invoice links |
| `/login` | LoginView | |
| `/dashboard/*` | AdminView | Admin only |
| `/dashboard/gift` | AdminGiftView | Admin gift orders |
| `/faq` `/how` `/contact` `/privacy` `/terms` | Static | |
| `/links` | LinksView | Social link tree |
| `/developer` | DeveloperCreditsView | |
| `/banned` | BannedView | |
| `/offer/:id` `/buy/:offerId` | LegacyOfferRedirect | Old URLs |
| `/dev/receipt-preview` | TestViewReceipt | **DEV only** — invoice UI mock |

---

## Invoices

- **Order invoice:** redeem codes, UID delivery fields, per-game top-up steps.
- **Recharge invoice:** ShamCash / balance credit — amount + balance after (no fake line items).
- **Access:** owner or admin; links from success page, profile orders, notifications, admin orders/recharge.
- **Export:** PNG + PDF (screenshot embedded in A4 — matches on-screen Arabic layout).
- **Date format:** `YYYY/MM/DD` via `formatInvoiceDate()`.

---

## Database

**Database setup:** [supabase_echocore_full.sql](./supabase_echocore_full.sql) (single file, ~2,800 lines)

Setup guide: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) · [SUPABASE_SETUP.ar.md](./SUPABASE_SETUP.ar.md)

---

## Admin dashboard (`/dashboard/*`)

| Tab | Focus |
|-----|--------|
| Overview | Stats, recent orders |
| **Offers** (`gamesAndOffers`) | Games list + offer CRUD via modals |
| Orders | Search, filter, fulfill, invoice link |
| Recharges | Approve / invoice |
| Payments | ShamCash, Sam API, manual vs API mode |
| Theme | Site presets |
| Home layout | Section order & visibility |
| Reviews | Moderation |
| G2Bulk | Catalog sync, markup, charm pricing, pull selection |
| Dev tools | Test fulfillment, balance credit |

Game/offer CRUD: `AdminGameEditModal` / `AdminOfferEditModal` only (no inline forms in `AdminView`).

---

## Deploy checklist

- [ ] GitHub secrets: Supabase URL/key, `VITE_SITE_DOMAIN=www.echocore412.com`, `VITE_BASE_PATH=/`
- [ ] Supabase Auth redirect URLs match production domain
- [ ] SQL full file applied on Supabase project
- [ ] Edge: `supabase functions deploy g2bulk` (+ `g2bulk-sync-cron`, `sam-api` as used)
- [ ] Admin `role` set in `profiles`
- [ ] G2Bulk: API key, markup %, optional charm pricing + **Apply charm prices**

---

## Local dev shortcuts

| URL | Purpose |
|-----|---------|
| http://localhost:5173 | Store |
| http://localhost:5173/dev/receipt-preview | Invoice layout preview (no Supabase) |

Arabic map: [PROJECT_MAP.ar.md](./PROJECT_MAP.ar.md)