/**
 * Single source of truth for lazily-loaded route views.
 *
 * AppRoutes.jsx wraps each factory with `lazyRetry()` to build the lazy
 * component; App.jsx uses the raw factories to preload chunks on idle so the
 * first navigation after load is instant instead of paying a fetch+parse.
 *
 * HomeView stays eager (it is the first paint); InvoiceView is intentionally
 * NOT prefetched for visitors because it pulls the ~600KB PDF/image export
 * vendor chunk — it only loads when someone actually opens an invoice.
 */
export const routeChunkFactories = {
  LoginView: () => import('../views/auth/LoginView'),
  CartView: () => import('../views/CartView'),
  CheckoutView: () => import('../views/CheckoutView'),
  SaleOffersView: () => import('../views/SaleOffersView'),
  SuggestedOffersView: () => import('../views/SuggestedOffersView'),
  FAQView: () => import('../views/FAQView'),
  HowItWorksView: () => import('../views/HowItWorksView'),
  ContactView: () => import('../views/ContactView'),
  LinksView: () => import('../views/LinksView'),
  DeveloperCreditsView: () => import('../views/DeveloperCreditsView'),
  RechargeView: () => import('../views/RechargeView'),
  ProfileView: () => import('../views/profile/ProfileView'),
  NotificationsView: () => import('../views/NotificationsView'),
  BannedView: () => import('../views/BannedView'),
  AdminView: () => import('../views/admin/AdminView'),
  AdminGiftView: () => import('../views/admin/AdminGiftView'),
  SuccessView: () => import('../views/SuccessView'),
  PartnerJoinView: () => import('../views/PartnerJoinView'),
  InvoiceView: () => import('../views/InvoiceView'),
  NotFoundView: () => import('../views/NotFoundView'),
  PrivacyView: () => import('../views/PrivacyView'),
  TermsView: () => import('../views/TermsView'),
  AllGamesView: () => import('../views/AllGamesView'),
  SearchView: () => import('../views/SearchView'),
  GiftCardsView: () => import('../views/GiftCardsView'),
  GamingAccountsView: () => import('../views/GamingAccountsView'),
  GameDetail: () => import('../views/GameDetail'),
  OfferDetail: () => import('../views/OfferDetail'),
  BuyView: () => import('../views/BuyView'),
};
