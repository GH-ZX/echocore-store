# ECHOCORE Playmap — task → files

Open **only** the row that matches the request. Paths are relative to repo root.

---

## Meta / docs

| Task | Open | Notes |
|------|------|-------|
| Human overview | `PROJECT_MAP.md` | Routes, admin tabs, deploy checklist |
| Agent always-on rules | `AGENTS.md` | Do not re-scan protocol |
| Claude/agent architecture | `CLAUDE.md` | Commands, env, layout |
| DB setup guide | `SUPABASE_SETUP.md` | Schema bootstrap |
| Full SQL | `supabase_echocore_full.sql` | Large — grep first |
| Local run | `RUNNING.md` | |
| G2Bulk API contract | `docs/g2bulk-api.md` | Sole G2Bulk truth |
| IGDB | `docs/igdb-api.md` | Cover art API |

---

## App shell & routing

| Task | Open | Notes |
|------|------|-------|
| Global state, auth hydrate, cart, toasts | `src/App.jsx` | Large — grep symbols first |
| Route table | `src/components/routing/AppRoutes.jsx` | Lazy views |
| Auth guard | `src/components/routing/ProtectedRoute.jsx` | |
| Site open/closed/maintenance | `src/components/routing/SiteGate.jsx`, `src/lib/siteStatus.js`, `src/views/MaintenanceView.jsx` | |
| Entry / basename | `src/main.jsx`, `vite.config.js` | |
| Header / footer / layout chrome | `src/components/layout/` | |
| Page loader | `src/components/routing/PageLoader.jsx` | |

---

## i18n & marketing copy

| Task | Open | Skills |
|------|------|--------|
| UI strings (buttons, toasts, admin labels) | `src/data/translations.js` | `echocore-standards` |
| FAQ, legal, footer, redeem steps | `src/data/pageContent.js` | `echocore-standards` |
| `getT` / `formatMessage` | `src/lib/i18n.js` | |
| Game marketing fallbacks | `src/lib/gameDescriptions.js` | |
| Offer description fallbacks | `src/lib/offerDescriptions.js` | |
| Per-slug redeem/top-up steps | `src/lib/redeemInstructions.js` + `pageContent.js` | |
| Strip supplier brand from customer text | `src/lib/branding.js` | |

---

## Catalog (games, offers, search, sale)

| Task | Open | Notes |
|------|------|-------|
| Home | `src/views/home/HomeView.jsx`, `src/lib/homeLayout.js`, `src/components/home/` | Carousel + sections |
| All games / PC catalog | `src/views/AllGamesView.jsx`, `src/lib/catalogSegments.js` | |
| Gift cards | `src/views/GiftCardsView.jsx` | |
| Gaming accounts lane | `src/views/GamingAccountsView.jsx` | Often redirects gift-cards |
| Game detail | `src/views/GameDetail.jsx` | |
| Offer detail | `src/views/OfferDetail.jsx`, `src/components/catalog/OfferPurchasePanel.jsx` | |
| Buy flow | `src/views/BuyView.jsx` | Protected |
| Search | `src/views/SearchView.jsx`, `src/lib/searchUtils.js`, `src/lib/catalogSearch.js` | |
| Sale / discounts | `src/views/SaleOffersView.jsx`, `src/lib/saleOffers.js` | |
| Catalog shared UI | `src/components/catalog/` | Shell, cards, UID fields |
| Regions / servers / top-up fields | `src/lib/gameRegions.js`, `gameServers.js`, `gameTopupFields.js`, `gamePlayerUid.js` | |
| Live catalog merge | `src/lib/liveCatalog.js` | |
| Offer display / routes | `src/lib/offerDisplay.js`, `offerRoutes.js`, `catalogOffers.js`, `catalogUtils.js` | |
| Images / logos | `src/lib/gameImages.js`, `imageUtils.js`, `carouselLogos.js` | |

---

## Cart, checkout, orders, success

| Task | Open | Notes |
|------|------|-------|
| Cart UI | `src/views/CartView.jsx`, `src/lib/cartUtils.js` | Cart state often in `App.jsx` |
| Checkout | `src/views/CheckoutView.jsx` | |
| Purchase / submit | `src/lib/catalogPurchase.js`, `purchaseLock.js`, orders helpers | |
| Orders lib | `src/lib/orders.js`, `orderAccess.js`, `orderReceipt.js` | |
| Success / codes | `src/views/SuccessView.jsx` | |
| Fulfillment availability | `src/lib/fulfillmentAvailability.js` | |

---

## Invoices

| Task | Open |
|------|------|
| Invoice page | `src/views/InvoiceView.jsx` |
| Build payload | `src/lib/invoiceBuilder.js` |
| Fetch + ACL | `src/lib/invoices.js` |
| Format dates/money | `src/lib/invoiceFormat.js` |
| PNG/PDF download | `src/lib/invoiceDownload.js` |
| Document UI | `src/components/invoices/InvoiceDocument.jsx`, `InvoiceDownloadActions.jsx` |
| Dev preview | `src/views/TestViewReceipt.jsx`, `src/lib/invoicePreviewMocks.js` |

---

## Auth, profile, ban, username

| Task | Open |
|------|------|
| Login / signup | `src/views/auth/LoginView.jsx`, `src/lib/auth.js` |
| Profile | `src/views/profile/ProfileView.jsx`, `src/lib/profile.js` |
| Avatar | `src/components/profile/ProfileAvatar.jsx` |
| Username change | `src/lib/username.js`, `usernameChange.js` |
| Ban flow | `src/views/BannedView.jsx`, `src/lib/userBan.js` |

---

## Notifications / inbox

| Task | Open |
|------|------|
| Notifications page | `src/views/NotificationsView.jsx` |
| Lib | `src/lib/notifications.js`, `inboxList.js`, `inboxFilters.js`, `notificationTime.js` |
| UI pieces | `src/components/notifications/` |

---

## Recharge, payments, Sam API, ShamCash

| Task | Open | Skills |
|------|------|--------|
| Customer recharge UI | `src/views/RechargeView.jsx` | `sam-api-wallet` |
| Recharge lib | `src/lib/recharge.js`, `rechargeCurrency.js` | |
| Payment methods / API vs manual | `src/lib/paymentMethods.js` | |
| Sam client | `src/lib/samApi.js`, `samPaymentPopup.js`, `samWalletFormat.js` | `sam-api-wallet` |
| ShamCash | `src/lib/shamcashApi.js` | |
| Invoice pay panel | `src/components/SamInvoicePaymentPanel.jsx` | |
| Admin payments | `src/components/admin/AdminPaymentsSettings.jsx`, `AdminSamApiPanel.jsx`, `AdminSamApiSettings.jsx` | |
| Edge function | `supabase/functions/sam-api/index.ts` | |
| Skill refs | `.grok/skills/sam-api-wallet/` | |

---

## G2Bulk (supplier, catalog sync, fulfillment)

| Task | Open | Skills |
|------|------|--------|
| Client wrapper | `src/lib/g2bulk.js`, `g2bulkPullCatalogClient.js` | `g2bulk-api` |
| Pricing / markup / charm | `src/lib/offerPricing.js`, `offerCost.js`, `adminOfferPricing.js`, `storeMarkupCache.js` | |
| Admin G2Bulk UI | `src/components/admin/AdminG2BulkSettings.jsx`, `G2bulkPullPanel.jsx`, `AdminOfferCostBadge.jsx` | |
| Wallet hooks | `src/hooks/useAdminG2bulkWallet.js`, `src/lib/g2bulkWalletFormat.js` | |
| Edge | `supabase/functions/g2bulk/`, `g2bulk-sync-cron/` | |
| Contract | `docs/g2bulk-api.md` | **never** live-fetch API site |
| Skill refs | `.grok/skills/g2bulk-api/` | |

---

## Admin dashboard

| Task | Open | Notes |
|------|------|-------|
| Shell / tabs | `src/views/admin/AdminView.jsx` | Large — grep tab name |
| Admin routes helpers | `src/lib/adminRoutes.js`, `adminMobileNav.js` | |
| Games/offers CRUD modals | `AdminGameEditModal.jsx`, `AdminOfferEditModal.jsx` | No inline forms |
| Orders manager | `AdminOrdersManager.jsx`, `src/lib/adminOrderFilters.js` | |
| Recharges | `AdminRechargeManager.jsx`, `src/lib/adminRecharge.js` | |
| Users | `AdminUsersManager.jsx`, `AdminUserDetail.jsx`, `src/lib/adminUserAuth.js` | |
| Manual balance credit | `AdminManualBalanceCredit.jsx`, `AdminCustomerBalances.jsx`, `src/lib/adminBalanceCredit.js` | |
| Gift orders | `src/views/admin/AdminGiftView.jsx`, `AdminGiftForm.jsx`, `src/lib/adminGifts.js` | |
| Reviews | `AdminReviewsManager.jsx`, `src/lib/customerReviews.js` | |
| Theme | `AdminThemeSettings.jsx`, `src/lib/theme.js` | |
| Home layout | `AdminHomeLayoutSettings.jsx` | |
| Carousel | `AdminCarouselManager.jsx`, `CarouselAddPicker.jsx` | |
| Inbox (admin) | `AdminInboxManager.jsx` | |
| Contact messages | `AdminContactMessages.jsx`, `src/lib/contactMessages.js` | |
| Site logs | `AdminSiteLogs.jsx`, `src/lib/siteLogs.js` | |
| Dev tools | `AdminDevTools.jsx`, `src/lib/devTools.js` | |
| Profit / stats | `AdminProfit*.jsx`, `src/lib/adminProfitMetrics.js` | |
| APIs page | `AdminApisPage.jsx` | |
| IGDB settings | `AdminIgdbSettings.jsx`, `src/lib/igdb.js`, `supabase/functions/igdb/` | |
| Sale discounts admin | `AdminSaleDiscountsManager.jsx` | |
| Supplier wallets | `src/lib/adminSupplierWallets.js`, `useAdminSupplierWallets.js`, `useAdminSamWallets.js` | |

All admin components live under `src/components/admin/`.

---

## Static / content pages

| Task | Open |
|------|------|
| FAQ | `src/views/FAQView.jsx` + `pageContent.js` |
| How it works | `src/views/HowItWorksView.jsx` |
| Contact | `src/views/ContactView.jsx`, `src/lib/contact.js` |
| Support | `src/views/SupportView.jsx` |
| Privacy / terms | `src/views/PrivacyView.jsx`, `TermsView.jsx`, `LegalPageView.jsx` |
| Links tree | `src/views/LinksView.jsx`, `src/lib/socialLinks.js` |
| Developer credits | `src/views/DeveloperCreditsView.jsx`, `src/lib/buildInfo.js` |
| 404 | `src/views/NotFoundView.jsx` |

---

## UI kit, theme, backgrounds

| Task | Open |
|------|------|
| Shared UI | `src/components/ui/` |
| Theme engine | `src/lib/theme.js` |
| Store backgrounds | `src/components/backgrounds/` |
| Global CSS | `src/index.css` |
| Tailwind | `tailwind.config.js` |

---

## Supabase & edge

| Task | Open |
|------|------|
| Browser client | `src/lib/supabase.js`, `supabaseQuery.js` |
| Project config | `supabase/config.toml` |
| G2Bulk edge | `supabase/functions/g2bulk/` |
| G2Bulk cron | `supabase/functions/g2bulk-sync-cron/` |
| Sam API edge | `supabase/functions/sam-api/` |
| Admin user auth edge | `supabase/functions/admin-user-auth/` |
| IGDB edge | `supabase/functions/igdb/` |
| Email notify | `supabase/functions/send-notification-email/` |
| Incremental SQL | `scripts/*-migration.sql` | Prefer grep over reading all |
| Full schema | `supabase_echocore_full.sql` |

---

## Deploy & tooling

| Task | Open |
|------|------|
| CI / Pages deploy | `.github/workflows/deploy.yml` |
| SPA 404 helper | `scripts/gh-pages-spa.mjs` |
| Upload game logos | `scripts/upload-game-logos.mjs`, `scripts/game-logos.manifest.json` |
| Package scripts | `package.json` |
| Lint | `eslint.config.js` |

---

## Heuristic: still can't find it?

1. `grep` symbol or route path under `src/` only (not `node_modules` / `dist`).
2. If it's admin wording → `translations.js` admin keys + matching `Admin*.jsx`.
3. If it's customer-facing pricing → `offerPricing.js` + skill `g2bulk-api`.
4. If it's money in/out of wallet → `recharge.js` / `samApi.js` + skill `sam-api-wallet`.
5. If it's DB policy/RPC → `supabase_echocore_full.sql` or latest `scripts/*migration*.sql`.
6. Update **this playmap** with the missing row so the next session skips the hunt.
