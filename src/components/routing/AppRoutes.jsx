import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { isApiWalletMode } from '../../lib/paymentMethods';
import ProtectedRoute from './ProtectedRoute';
import SiteGate from './SiteGate';
import LegacyOfferRedirect from './LegacyOfferRedirect';
import PageLoader from './PageLoader';
import AllGamesView from '../../views/AllGamesView';
import SearchView from '../../views/SearchView';
import GiftCardsView from '../../views/GiftCardsView';
import GamingAccountsView from '../../views/GamingAccountsView';
import GameDetail from '../../views/GameDetail';
import OfferDetail from '../../views/OfferDetail';
import BuyView from '../../views/BuyView';
import HomeView from '../../views/home/HomeView';

const LoginView = lazy(() => import('../../views/auth/LoginView'));
const CartView = lazy(() => import('../../views/CartView'));
const CheckoutView = lazy(() => import('../../views/CheckoutView'));
const SaleOffersView = lazy(() => import('../../views/SaleOffersView'));
const FAQView = lazy(() => import('../../views/FAQView'));
const HowItWorksView = lazy(() => import('../../views/HowItWorksView'));
const ContactView = lazy(() => import('../../views/ContactView'));
const SupportView = lazy(() => import('../../views/SupportView'));
const LinksView = lazy(() => import('../../views/LinksView'));
const DeveloperCreditsView = lazy(() => import('../../views/DeveloperCreditsView'));
const RechargeView = lazy(() => import('../../views/RechargeView'));
const ProfileView = lazy(() => import('../../views/profile/ProfileView'));
const NotificationsView = lazy(() => import('../../views/NotificationsView'));
const BannedView = lazy(() => import('../../views/BannedView'));
const AdminView = lazy(() => import('../../views/admin/AdminView'));
const AdminGiftView = lazy(() => import('../../views/admin/AdminGiftView'));
const SuccessView = lazy(() => import('../../views/SuccessView'));
const InvoiceView = lazy(() => import('../../views/InvoiceView'));
const TestViewReceipt = import.meta.env.DEV
  ? lazy(() => import('../../views/TestViewReceipt'))
  : null;
const NotFoundView = lazy(() => import('../../views/NotFoundView'));
const PrivacyView = lazy(() => import('../../views/PrivacyView'));
const TermsView = lazy(() => import('../../views/TermsView'));

export default function AppRoutes({
  t,
  lang,
  navigate,
  user,
  loadingAuth,
  games,
  offers,
  orders,
  loadingGames,
  loadingOrders,
  cart,
  cartPriceUpdated,
  getCartTotal,
  removeCartItem,
  addToCart,
  openGame,
  openOffer,
  openBuyOffer,
  homeShowsAdminChrome,
  isAdmin,
  homePreviewAsUser,
  handleToggleHomePreview,
  homeLayout,
  reviews,
  refreshReviews,
  paymentConfig,
  submitPurchase,
  submitOrder,
  onOrderPaid,
  onFulfillOrder,
  handleCheckoutComplete,
  showToast,
  handleAuthLogin,
  handleAuthSignup,
  handleLoginSuccess,
  resolveUserAfterAuth,
  updateProduct,
  mergeOfferFromDb,
  mergeOffersFromDb,
  updateGame,
  deleteGame,
  handleLiveCatalogUpdate,
  handleRegionCatalogRefresh,
  notifications,
  unreadCount,
  notificationsLoading,
  handleRefreshInbox,
  handleNotificationMarkRead,
  handleNotificationsMarkAllRead,
  handleNotificationNavigate,
  handleLogout,
  updateUserProfile,
  createProduct,
  deleteProduct,
  saveGame,
  fetchGames,
  fetchOffers,
  fetchOrders,
  refreshPaymentConfig,
  refreshCatalog,
  refreshSiteTheme,
  refreshHomeLayout,
  handleRechargeApproved,
  handleApproveOrder,
  handleRejectOrder,
  handleFulfillOrder,
  handleDevBalanceCredited,
  handlePreviewHomepage,
  handleAdminGiftOrder,
  setAdminEditOffer,
  onNavigateToSaleDiscounts,
  setAdminEditGame,
  setAdminCarouselOpen,
  setAdminCarouselPickerOpen,
  moveCarouselGame,
  siteStatus,
}) {
  return (
    <Suspense fallback={<PageLoader t={t} />}>
      <SiteGate user={user}>
      <Routes>
        <Route
          path="/"
          element={(
            <HomeView
              t={t}
              lang={lang}
              games={games}
              offers={offers}
              loading={loadingGames}
              addToCart={addToCart}
              onSelectGame={openGame}
              onSelectOffer={openOffer}
              onBuyNow={openBuyOffer}
              onEditOffer={homeShowsAdminChrome ? setAdminEditOffer : undefined}
              onEditGame={homeShowsAdminChrome ? setAdminEditGame : undefined}
              onAddGame={homeShowsAdminChrome ? (options = {}) => setAdminEditGame({ id: null, show_in_carousel: !!options.showInCarousel }) : undefined}
              onAddOffer={homeShowsAdminChrome ? (options = {}) => {
                if (options.isSale) {
                  onNavigateToSaleDiscounts?.();
                  return;
                }
                setAdminEditOffer({ id: null, is_sale: false });
              } : undefined}
              onManageCarousel={homeShowsAdminChrome ? () => setAdminCarouselOpen(true) : undefined}
              onPickCarouselGame={homeShowsAdminChrome ? () => setAdminCarouselPickerOpen(true) : undefined}
              onMoveCarouselGame={homeShowsAdminChrome ? moveCarouselGame : undefined}
              isAdmin={homeShowsAdminChrome}
              isAdminUser={isAdmin}
              homePreviewAsUser={homePreviewAsUser}
              onToggleHomePreview={handleToggleHomePreview}
              homeLayout={homeLayout}
              reviews={reviews}
              user={user}
              onReviewSubmitted={refreshReviews}
            />
          )}
        />

        <Route
          path="/games"
          element={(
            <AllGamesView
              games={games}
              offers={offers}
              t={t}
              lang={lang}
              loading={loadingGames}
              onSelectGame={openGame}
              onEditGame={isAdmin ? setAdminEditGame : undefined}
              isAdmin={isAdmin}
            />
          )}
        />

        <Route
          path="/gift-cards"
          element={(
            <GiftCardsView
              games={games}
              offers={offers}
              t={t}
              lang={lang}
              loading={loadingGames}
              onSelectGame={openGame}
              onEditGame={isAdmin ? setAdminEditGame : undefined}
              isAdmin={isAdmin}
            />
          )}
        />

        <Route
          path="/accounts"
          element={(
            <GamingAccountsView
              games={games}
              offers={offers}
              t={t}
              lang={lang}
              loading={loadingGames}
              onSelectGame={openGame}
              onEditGame={isAdmin ? setAdminEditGame : undefined}
              isAdmin={isAdmin}
            />
          )}
        />

        <Route
          path="/search"
          element={(
            <SearchView
              games={games}
              offers={offers}
              t={t}
              lang={lang}
              loading={loadingGames}
              onSelectGame={openGame}
              onSelectOffer={openOffer}
              onBuyNow={openBuyOffer}
            />
          )}
        />

        <Route
          path="/sale"
          element={(
            <SaleOffersView
              games={games}
              offers={offers}
              t={t}
              lang={lang}
              onSelectOffer={openOffer}
              onBuyNow={openBuyOffer}
              onEditOffer={isAdmin ? setAdminEditOffer : undefined}
              isAdmin={isAdmin}
              addToCart={addToCart}
            />
          )}
        />

        <Route path="/faq" element={<FAQView t={t} lang={lang} />} />

        <Route
          path="/links"
          element={(
            <Suspense fallback={null}>
              <LinksView t={t} lang={lang} />
            </Suspense>
          )}
        />

        <Route
          path="/developer"
          element={(
            <Suspense fallback={null}>
              <DeveloperCreditsView t={t} lang={lang} />
            </Suspense>
          )}
        />

        <Route path="/how" element={<HowItWorksView t={t} lang={lang} />} />

        <Route path="/contact" element={<ContactView t={t} lang={lang} user={user} />} />

        <Route
          path="/support"
          element={(
            <Suspense fallback={<PageLoader t={t} />}>
              <SupportView t={t} lang={lang} user={user} />
            </Suspense>
          )}
        />

        <Route
          path="/game/:gameSlug/:offerSlug/buy"
          element={(
            <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
              <BuyView
                t={t}
                lang={lang}
                navigate={navigate}
                user={user}
                games={games}
                offers={offers}
                loadingCatalog={loadingGames}
                currentBalance={user?.balance || 0}
                onPurchase={submitPurchase}
                onOrderPaid={onOrderPaid}
                paymentConfig={paymentConfig}
                onNotify={showToast}
              />
            </ProtectedRoute>
          )}
        />

        <Route
          path="/game/:gameSlug/:offerSlug"
          element={(
            <OfferDetail
              games={games}
              offers={offers}
              t={t}
              lang={lang}
              navigate={navigate}
              addToCart={addToCart}
              user={user}
              updateProduct={updateProduct}
              onPricingSaved={mergeOfferFromDb}
              onOffersPricingApplied={mergeOffersFromDb}
              updateGame={updateGame}
              deleteGame={deleteGame}
              loadingCatalog={loadingGames}
              onBuyNow={openBuyOffer}
              onNotify={showToast}
            />
          )}
        />

        <Route
          path="/game/:slug"
          element={(
            <GameDetail
              games={games}
              offers={offers}
              t={t}
              lang={lang}
              navigate={navigate}
              addToCart={addToCart}
              user={user}
              updateProduct={updateProduct}
              onPricingSaved={mergeOfferFromDb}
              onOffersPricingApplied={mergeOffersFromDb}
              updateGame={updateGame}
              deleteGame={deleteGame}
              loadingGames={loadingGames}
              catalogMode={paymentConfig.g2bulkCatalogMode || 'sync'}
              onLiveCatalogUpdate={handleLiveCatalogUpdate}
              onRegionCatalogRefresh={handleRegionCatalogRefresh}
              onSelectOffer={openOffer}
              onBuyNow={openBuyOffer}
              onNotify={showToast}
            />
          )}
        />

        <Route
          path="/offer/:id"
          element={(
            <LegacyOfferRedirect
              offers={offers}
              games={games}
              loading={loadingGames}
              lang={lang}
            />
          )}
        />

        <Route
          path="/login"
          element={(
            <LoginView
              t={t}
              lang={lang}
              user={user}
              loadingAuth={loadingAuth}
              navigate={navigate}
              siteStatus={siteStatus}
              handleAuthLogin={handleAuthLogin}
              handleAuthSignup={handleAuthSignup}
              onLoginSuccess={handleLoginSuccess}
              resolveUserAfterAuth={resolveUserAfterAuth}
            />
          )}
        />

        <Route
          path="/cart"
          element={(
            <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
              <CartView
                t={t}
                lang={lang}
                cart={cart}
                games={games}
                offers={offers}
                getCartTotal={getCartTotal}
                onRemoveItem={removeCartItem}
                onCheckout={() => navigate('/checkout')}
                priceUpdated={cartPriceUpdated}
              />
            </ProtectedRoute>
          )}
        />

        <Route
          path="/checkout"
          element={(
            <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
              <CheckoutView
                t={t}
                lang={lang}
                user={user}
                navigate={navigate}
                cart={cart}
                submitOrder={submitOrder}
                onOrderPaid={onOrderPaid}
                onComplete={handleCheckoutComplete}
                currentBalance={user?.balance || 0}
                paymentConfig={paymentConfig}
                onNotify={showToast}
              />
            </ProtectedRoute>
          )}
        />

        <Route
          path="/success"
          element={(
            <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
              <SuccessView
                navigate={navigate}
                t={t}
                lang={lang}
                user={user}
                onFulfillOrder={onFulfillOrder}
              />
            </ProtectedRoute>
          )}
        />

        <Route
          path="/invoice/:kind/:id"
          element={(
            <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
              <Suspense fallback={<PageLoader t={t} />}>
                <InvoiceView
                  navigate={navigate}
                  t={t}
                  lang={lang}
                  user={user}
                  games={games}
                  offers={offers}
                />
              </Suspense>
            </ProtectedRoute>
          )}
        />

        <Route
          path="/notifications"
          element={(
            <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
              <NotificationsView
                t={t}
                lang={lang}
                user={user}
                notifications={notifications}
                unreadCount={unreadCount}
                loading={notificationsLoading}
                onRefresh={handleRefreshInbox}
                onMarkRead={handleNotificationMarkRead}
                onMarkAllRead={handleNotificationsMarkAllRead}
                onNavigate={handleNotificationNavigate}
              />
            </ProtectedRoute>
          )}
        />

        <Route
          path="/profile"
          element={
            loadingAuth ? (
              <PageLoader t={t} />
            ) : user ? (
              <ProfileView
                t={t}
                lang={lang}
                user={user}
                navigate={navigate}
                onLogout={handleLogout}
                onRecharge={user?.role === 'admin' ? undefined : () => navigate('/recharge')}
                onUpdateProfile={updateUserProfile}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/recharge"
          element={(
            <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
              {user?.role === 'admin' ? (
                <Navigate to="/dashboard/payments" replace />
              ) : (
                <RechargeView
                  t={t}
                  lang={lang}
                  navigate={navigate}
                  user={user}
                  currentBalance={user?.balance || 0}
                  paymentConfig={paymentConfig}
                  onNotify={showToast}
                  onRechargePaid={handleRechargeApproved}
                />
              )}
            </ProtectedRoute>
          )}
        />

        <Route path="/privacy" element={<PrivacyView lang={lang} t={t} />} />
        <Route path="/terms" element={<TermsView lang={lang} t={t} />} />

        <Route
          path="/buy/:offerId"
          element={(
            <LegacyOfferRedirect
              offers={offers}
              games={games}
              loading={loadingGames}
              lang={lang}
              target="buy"
            />
          )}
        />

        <Route
          path="/dashboard/gift"
          element={
            loadingAuth ? (
              <PageLoader t={t} />
            ) : user?.role === 'admin' ? (
              <AdminGiftView
                t={t}
                lang={lang}
                offers={offers}
                games={games}
                onSubmit={handleAdminGiftOrder}
                onNotify={showToast}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/dashboard/*"
          element={
            loadingAuth ? (
              <PageLoader t={t} />
            ) : user?.role === 'admin' ? (
              <AdminView
                t={t}
                lang={lang}
                games={games}
                offers={offers}
                orders={orders}
                loadingOrders={loadingOrders}
                createProduct={createProduct}
                updateProduct={updateProduct}
                deleteProduct={deleteProduct}
                deleteGame={deleteGame}
                updateGame={updateGame}
                saveGame={saveGame}
                refreshProducts={fetchGames}
                refreshOffers={fetchOffers}
                refreshOrders={fetchOrders}
                onPaymentSettingsSaved={refreshPaymentConfig}
                onCatalogSynced={refreshCatalog}
                onThemeSaved={refreshSiteTheme}
                onHomeLayoutSaved={refreshHomeLayout}
                reviews={reviews}
                onReviewsChanged={refreshReviews}
                onNotify={showToast}
                onRechargeApproved={handleRechargeApproved}
                onApproveOrder={isApiWalletMode(paymentConfig) ? null : handleApproveOrder}
                onRejectOrder={handleRejectOrder}
                paymentConfig={paymentConfig}
                onFulfillOrder={handleFulfillOrder}
                onDevBalanceCredited={handleDevBalanceCredited}
                onPreviewHomepage={handlePreviewHomepage}
                notifications={notifications}
                unreadCount={unreadCount}
                notificationsLoading={notificationsLoading}
                onRefreshInbox={handleRefreshInbox}
                onNotificationMarkRead={handleNotificationMarkRead}
                onNotificationsMarkAllRead={handleNotificationsMarkAllRead}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/banned"
          element={(
            <BannedView
              t={t}
              lang={lang}
              user={user}
              onContactSupport={() => navigate('/contact')}
            />
          )}
        />

        <Route path="/product" element={<Navigate to="/" replace />} />

        {import.meta.env.DEV && TestViewReceipt && (
          <Route
            path="/dev/receipt-preview"
            element={(
              <Suspense fallback={<PageLoader t={t} />}>
                <TestViewReceipt t={t} lang={lang} navigate={navigate} />
              </Suspense>
            )}
          />
        )}

        <Route
          path="*"
          element={<NotFoundView t={t} lang={lang} navigate={navigate} />}
        />
      </Routes>
      </SiteGate>
    </Suspense>
  );
}