import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import StoreBackground from './components/backgrounds/StoreBackground';
import { getCarouselGames, getCarouselManageableGames, sortGamesByCarousel } from './lib/carouselUtils';
import AppToast from './components/ui/AppToast';
import {
  isPasswordRecoveryPending,
  isPasswordRecoveryUrl,
  markPasswordRecoveryPending,
  consumeOAuthIntent,
  isLikelyExistingAuthUser,
  classifyAuthError,
  getAuthRedirectUrl,
} from './lib/auth';
import { supabase, resolveUserData } from './lib/supabase';
import { fetchAdminProfileSummaries } from './lib/adminModeration';
import {
  createOrderAtomic,
  confirmOrderPayment,
  rejectOrderPayment,
  expireStalePendingOrders,
} from './lib/orders';
import {
  tryAcquirePurchaseLock,
  releasePurchaseLock,
  createCheckoutToken,
  getMaxCartLines,
} from './lib/purchaseLock';
import { markOrderFulfillAllowed } from './lib/orderAccess';
import { adminGiftOrder, pollOrderFulfillment } from './lib/adminGifts';
import { mergeGamePlayerUidIntoProfile } from './lib/gamePlayerUid';
import { fulfillOrderG2bulk, syncPullSelectionCarouselFromGames } from './lib/g2bulk';
import {
  assertBalanceFulfillmentAvailable,
  assertNoOpenDuplicateTopup,
} from './lib/fulfillmentAvailability';
import { createOrderInvoice } from './lib/samApi';
import { isApiWalletMode, isManualWalletMethod } from './lib/paymentMethods';
import {
  fetchLiveCatalogForSelection,
  mergeCatalogRows,
} from './lib/liveCatalog';
import { refreshGameRegionOffers } from './lib/catalogOffers';
import { resolveOffersForCheckout } from './lib/catalogPurchase';
import {
  syncCartWithOffers,
  pickCartSnapshot,
  cartsAreEquivalent,
  getCartLineKey,
  isCartFull,
  loadCartFromStorage,
  saveCartToStorage,
} from './lib/cartUtils';
import { fetchMyPartnerTier } from './lib/partners';
import { fetchMyInfluencerStatus } from './lib/coupons';
import { mapOffersForCustomer, resolveCustomerUnitPrice } from './lib/partnerPricing';
import ScrollToTop from './components/routing/ScrollToTop';
import AppRoutes from './components/routing/AppRoutes';
import LangSwitchOverlay from './components/routing/LangSwitchOverlay';
import {
  ADMIN_SALE_DISCOUNTS_FOCUS_STATE,
  getAdminGiftPath,
  getAdminSaleDiscountsPath,
  navigateTo,
} from './lib/adminRoutes';
import { getOfferOrderNameSnapshot } from './lib/offerDisplay';
import { getGameOfferBuyPath, getGameOfferPath } from './lib/offerRoutes';
import { resolveStorefrontGame } from './lib/gameRegions';
import { cartRequiresPlayerUid, isCartEligibleOffer } from './lib/catalogUtils';
import { fetchAllSupabaseRows } from './lib/supabaseQuery';
import { fetchPaymentMethods } from './lib/storeSettings';
import { fetchSiteStatus, isLoginBlockedDuringMaintenance } from './lib/siteStatus';
import MaintenanceBanner from './components/layout/MaintenanceBanner';
import { isUserBanned } from './lib/userBan';
import {
  refreshSupplierWallets,
  resetSupplierWalletsStore,
} from './lib/adminSupplierWalletsStore';
import { logAuthEvent, logClientError } from './lib/siteLogs';
import {
  filterGamesByPullSelection,
  filterOffersByPullSelection,
  filterLiveCatalog,
  normalizePullSelection,
} from './lib/pullCatalogUtils';
import { applyTheme, fetchSiteTheme, normalizeThemeOverrides } from './lib/theme';
import { DEFAULT_HOME_LAYOUT, fetchHomeLayout, normalizeHomeLayout } from './lib/homeLayout';
import { fetchApprovedReviews } from './lib/customerReviews';
import {
  fetchNotifications,
  INBOX_FETCH_LIMIT,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications,
  dismissNotification,
  subscribeToNotifications,
  formatNotification,
  getNotificationDestination,
  shouldShowLiveToast,
} from './lib/notifications';

import { translations } from './data/translations';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';

import AdminOfferEditModal from './components/admin/AdminOfferEditModal';
import AdminGameEditModal from './components/admin/AdminGameEditModal';
const AdminCarouselManager = lazy(() => import('./components/admin/AdminCarouselManager'));
const CarouselAddPicker = lazy(() => import('./components/admin/CarouselAddPicker'));

const LANG_SWITCH_FADE_OUT_MS = 120;
const LANG_SWITCH_LOADING_MS = 180;
const LANG_SWITCH_FADE_IN_MS = 120;

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasShownLoginToast = useRef(false);
  const lastSyncedUserIdRef = useRef(null);
  const loginLogDedupeRef = useRef({ key: '', at: 0 });

  const cartIconRef = useRef(null);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('echocore-lang');
    return saved === 'en' || saved === 'ar' ? saved : 'ar';
  });
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [user, setUser] = useState(null);           // { id, role, name, email? }
  const purchaseInFlightRef = useRef(false);

  const [games, setGames] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  // Hydrate cart immediately so the first save effect cannot wipe localStorage with []
  const [cart, setCart] = useState(() => loadCartFromStorage());
  const [cartPriceUpdated, setCartPriceUpdated] = useState(false);
  /** Partner tier for current user (reseller / super / custom markup) */
  const [partnerTier, setPartnerTier] = useState(null);
  /** True when user owns an active influencer referral code */
  const [isInfluencer, setIsInfluencer] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState({
    shamcash: true,
    binance: false,
    mastercard: false,
    shamcashMerchantName: 'ECHOCORE Store',
    shamcashConfigured: false,
    g2bulkCatalogOnly: true,
    g2bulkCatalogMode: 'sync',
  });
  const [homeLayout, setHomeLayout] = useState(DEFAULT_HOME_LAYOUT);
  const [reviews, setReviews] = useState([]);
  const [notification, setNotification] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [siteStatus, setSiteStatus] = useState({
    maintenanceEnabled: false,
    maintenanceMessageAr: '',
    maintenanceMessageEn: '',
    maintenanceAllowAdmins: true,
    requireVerifiedAccounts: false,
  });
  const [maintenanceBannerDismissed, setMaintenanceBannerDismissed] = useState(false);
  const toastTimerRef = useRef(null);
  const notificationsFetchGenRef = useRef(0);
  const [flyingItems, setFlyingItems] = useState([]);
  const [adminEditOffer, setAdminEditOffer] = useState(null);
  const [adminEditGame, setAdminEditGame] = useState(null);
  const [adminCarouselOpen, setAdminCarouselOpen] = useState(false);
  const [adminCarouselPickerOpen, setAdminCarouselPickerOpen] = useState(false);
  const [langSwitching, setLangSwitching] = useState(false);
  const [overlayLang, setOverlayLang] = useState(() => {
    const saved = localStorage.getItem('echocore-lang');
    return saved === 'en' || saved === 'ar' ? saved : 'ar';
  });
  const isAdmin = user?.role === 'admin';
  const partnerMarkup = partnerTier?.markupPercent != null
    ? Number(partnerTier.markupPercent)
    : null;
  /** Offers: partner plan-B pricing; influencer codes apply only on buy page */
  const storefrontOffers = useMemo(
    () => (isAdmin ? offers : mapOffersForCustomer(offers, partnerMarkup, null)),
    [offers, partnerMarkup, isAdmin],
  );
  const [homePreviewAsUser, setHomePreviewAsUser] = useState(false);
  const homeShowsAdminChrome = isAdmin && !homePreviewAsUser;
  const hasSaleOffers = offers.some((offer) => {
    if (!offer?.is_sale || offer.active === false) return false;
    const original = Number.parseFloat(offer.original_price);
    const price = Number.parseFloat(offer.price);
    return Number.isFinite(original) && Number.isFinite(price) && original > price;
  });

  const showToast = useCallback((message, type = 'success', options = {}) => {
    const title = options.title || null;
    const body = options.body || null;
    const onClick = typeof options.onClick === 'function' ? options.onClick : null;
    const text = message || body || title;
    if (!text) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const duration = Number.isFinite(options.duration)
      ? options.duration
      : (type === 'error' ? 4500 : 3200);
    setNotification({
      message: text,
      title,
      body: body || (title ? message : null),
      type,
      onClick,
      hint: onClick ? (options.hint || null) : null,
    });
    toastTimerRef.current = setTimeout(() => {
      setNotification(null);
      toastTimerRef.current = null;
    }, duration);
  }, []);

  const showNotification = useCallback((msg) => showToast(msg, 'success'), [showToast]);

  const refreshPartnerTier = useCallback(async (userId = user?.id) => {
    if (!userId) {
      setPartnerTier(null);
      return null;
    }
    try {
      const tier = await fetchMyPartnerTier();
      setPartnerTier(tier);
      return tier;
    } catch {
      setPartnerTier(null);
      return null;
    }
  }, [user?.id]);

  const refreshInfluencerStatus = useCallback(async (userId = user?.id) => {
    if (!userId) {
      setIsInfluencer(false);
      return false;
    }
    try {
      const status = await fetchMyInfluencerStatus();
      const next = !!status?.isInfluencer;
      setIsInfluencer(next);
      return next;
    } catch {
      setIsInfluencer(false);
      return false;
    }
  }, [user?.id]);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setNotification(null);
  }, []);

  const refreshNotifications = useCallback(async (userId = user?.id, limit = 30) => {
    if (!userId) return;
    const fetchGen = notificationsFetchGenRef.current + 1;
    notificationsFetchGenRef.current = fetchGen;
    setNotificationsLoading(true);
    try {
      const [items, count] = await Promise.all([
        fetchNotifications(limit),
        fetchUnreadCount(),
      ]);
      if (notificationsFetchGenRef.current !== fetchGen) return;
      setNotifications(items);
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      if (notificationsFetchGenRef.current === fetchGen) {
        setNotificationsLoading(false);
      }
    }
  }, [user?.id]);

  const handleNotificationMarkRead = useCallback(async (notificationId) => {
    try {
      await markNotificationRead(notificationId);
      setNotifications((prev) => prev.map((item) => (
        item.id === notificationId
          ? { ...item, read_at: item.read_at || new Date().toISOString() }
          : item
      )));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }, []);

  const handleNotificationsMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((item) => (
        item.read_at ? item : { ...item, read_at: now }
      )));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  }, []);

  const handleNotificationsClearAll = useCallback(async () => {
    try {
      await clearAllNotifications();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((item) => (
        item.bell_hidden_at
          ? item
          : { ...item, bell_hidden_at: now, read_at: item.read_at || now }
      )));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to clear bell notifications:', err);
      showToast(
        translations[lang].clearNotificationsFailed,
        'error',
      );
    }
  }, [lang, showToast]);

  const handleNotificationDismiss = useCallback(async (notificationId) => {
    const item = notifications.find((entry) => entry.id === notificationId);
    try {
      const hidden = await dismissNotification(notificationId);
      if (!hidden) return;
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((entry) => (
        entry.id === notificationId
          ? {
            ...entry,
            bell_hidden_at: entry.bell_hidden_at || now,
            read_at: entry.read_at || now,
          }
          : entry
      )));
      if (item && !item.read_at) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    } catch (err) {
      console.error('Failed to hide bell notification:', err);
      showToast(
        translations[lang].dismissNotificationFailed,
        'error',
      );
    }
  }, [lang, notifications, showToast]);

  const handleNotificationNavigate = useCallback((dest) => {
    // Support string | { path } | { pathname, search, state } (see navigateTo)
    if (!dest) {
      navigate('/profile');
      return;
    }
    navigateTo(navigate, dest);
  }, [navigate]);

  const handleNotificationsClose = useCallback(() => {
    setNotificationsOpen(false);
  }, []);

  const handleNotificationsToggle = useCallback(() => {
    setNotificationsOpen((open) => {
      const next = !open;
      if (next) refreshNotifications();
      return next;
    });
  }, [refreshNotifications]);

  const handleRefreshInbox = useCallback(() => {
    refreshNotifications(user?.id, INBOX_FETCH_LIMIT);
  }, [refreshNotifications, user?.id]);

  const handleOpenNotificationsInbox = useCallback(async () => {
    if (user?.role === 'admin') {
      navigate('/dashboard/inbox');
      return;
    }
    if (unreadCount > 0) {
      await handleNotificationsMarkAllRead();
    }
    navigate('/notifications');
  }, [navigate, unreadCount, handleNotificationsMarkAllRead, user?.role]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const t = translations[lang];

  useEffect(() => {
    if (location.pathname !== '/') {
      setHomePreviewAsUser(false);
      return;
    }
    setHomePreviewAsUser(searchParams.get('preview') === 'user');
  }, [location.pathname, searchParams]);

  const handleToggleHomePreview = useCallback((asUser) => {
    const next = !!asUser;
    setHomePreviewAsUser(next);
    if (location.pathname !== '/') {
      navigate(next ? '/?preview=user' : '/');
      return;
    }
    if (next) {
      setSearchParams({ preview: 'user' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [location.pathname, navigate, setSearchParams]);

  const handlePreviewHomepage = useCallback(() => {
    navigate('/?preview=user');
  }, [navigate]);

  const handleNavigateToSaleDiscounts = useCallback(() => {
    navigate(getAdminSaleDiscountsPath(), { state: ADMIN_SALE_DISCOUNTS_FOCUS_STATE });
  }, [navigate]);

  const openGame = (game) => {
    if (!game) return;
    const storefront = resolveStorefrontGame(games, game) || game;
    navigate(`/game/${storefront.slug || storefront.id}`);
  };

  const openOffer = useCallback((offer) => {
    if (!offer) return;
    navigate(getGameOfferPath(offer, games));
  }, [games, navigate]);

  const openBuyOffer = useCallback((offer) => {
    if (!offer) return;
    if (user?.role === 'admin') {
      const game = games.find((g) => g.id === offer.game_id);
      if (game) {
        navigate(getAdminGiftPath({
          offerId: offer.id,
          returnTo: getGameOfferPath(offer, games),
        }));
      } else {
        showToast(t.adminCannotPurchase, 'error');
      }
      return;
    }
    navigate(getGameOfferBuyPath(offer, games));
  }, [games, navigate, user?.role, showToast, t.adminCannotPurchase]);

  const toggleLanguage = async () => {
    if (langSwitching) return;

    const newLang = lang === 'ar' ? 'en' : 'ar';
    setLangSwitching(true);

    await new Promise((resolve) => setTimeout(resolve, LANG_SWITCH_FADE_OUT_MS));

    setLang(newLang);
    setOverlayLang(newLang);
    localStorage.setItem('echocore-lang', newLang);
    window.scrollTo({ top: 0, behavior: 'auto' });

    await new Promise((resolve) => setTimeout(resolve, LANG_SWITCH_LOADING_MS));

    setLangSwitching(false);
    await new Promise((resolve) => setTimeout(resolve, LANG_SWITCH_FADE_IN_MS));
  };



  // ============================================
  // LOAD PRODUCTS FROM SUPABASE (REAL DB)
  // ============================================
  const fetchGames = async ({ background = false, catalogOnly = paymentConfig.g2bulkCatalogOnly } = {}) => {
    if (!background) setLoadingGames(true);
    try {
      const data = await fetchAllSupabaseRows(
        () => {
          let pageQuery = supabase
            .from('games')
            .select('*')
            .eq('active', true);
          if (catalogOnly) {
            pageQuery = pageQuery.eq('catalog_source', 'g2bulk');
          }
          return pageQuery.order('created_at', { ascending: true });
        },
      );

      setGames(sortGamesByCarousel(data || []));
    } catch (err) {
      console.error('Failed to load games:', err);
      setGames([]);
    } finally {
      setLoadingGames(false);
    }
  };

  const fetchOffers = async ({ catalogOnly = paymentConfig.g2bulkCatalogOnly } = {}) => {
    try {
      const data = await fetchAllSupabaseRows(
        () => {
          let pageQuery = supabase
            .from('offers')
            .select('*')
            .eq('active', true);
          if (catalogOnly) {
            pageQuery = pageQuery.eq('catalog_source', 'g2bulk');
          }
          return pageQuery.order('created_at', { ascending: true });
        },
      );

      setOffers(data || []);
    } catch (err) {
      console.error('Error fetching offers:', err);
      setOffers([]);
    }
  };

  const fetchOrders = useCallback(async () => {
    // Client guard — server RLS must also restrict orders/profiles to admins in production.
    if (user?.role !== 'admin') {
      setOrders([]);
      return;
    }

    setLoadingOrders(true);
    try {
      // Close abandoned checkouts / stuck fulfillments before listing.
      try {
        await expireStalePendingOrders(15);
      } catch (expireErr) {
        console.warn('expire_stale_pending_orders:', expireErr);
      }

      // Paginate past PostgREST 1000-row default so profits/orders stay complete.
      let ordersData = [];
      try {
        ordersData = await fetchAllSupabaseRows(() => (
          supabase
            .from('orders')
            .select('*, order_items(*, offers(id, name_en, name_ar, game_id, g2bulk_catalogue_name, games(id, name_en, name_ar, slug, g2bulk_game_code)))')
            .order('created_at', { ascending: false })
        ));
      } catch (richErr) {
        console.warn('Rich order fetch failed, falling back to plain items:', richErr);
        try {
          ordersData = await fetchAllSupabaseRows(() => (
            supabase
              .from('orders')
              .select('*, order_items(*)')
              .order('created_at', { ascending: false })
          ));
        } catch (plainErr) {
          console.error('Failed to load orders:', plainErr);
          setOrders([]);
          return;
        }
      }

      let ordersWithUsers = ordersData || [];
      if (ordersWithUsers.length > 0) {
        const userIds = [...new Set(ordersWithUsers.map((o) => o.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          try {
            // RPC may also cap large id lists — chunk to stay under PostgREST limits.
            const CHUNK = 200;
            const profilesData = [];
            for (let i = 0; i < userIds.length; i += CHUNK) {
              const chunk = userIds.slice(i, i + CHUNK);
              const part = await fetchAdminProfileSummaries(chunk);
              profilesData.push(...(part || []));
            }
            const profileMap = Object.fromEntries(profilesData.map((p) => [p.id, p]));
            ordersWithUsers = ordersWithUsers.map((order) => ({
              ...order,
              profiles: profileMap[order.user_id] || null,
            }));
          } catch (profileErr) {
            console.error('Failed to load order customer profiles:', profileErr);
            try {
              const CHUNK = 200;
              const profilesData = [];
              for (let i = 0; i < userIds.length; i += CHUNK) {
                const chunk = userIds.slice(i, i + CHUNK);
                const part = await fetchAllSupabaseRows(() => (
                  supabase
                    .from('profiles')
                    .select('id, username, name')
                    .in('id', chunk)
                ));
                profilesData.push(...(part || []));
              }
              const profileMap = Object.fromEntries(profilesData.map((p) => [p.id, p]));
              ordersWithUsers = ordersWithUsers.map((order) => ({
                ...order,
                profiles: profileMap[order.user_id] || null,
              }));
            } catch {
              /* leave profiles null */
            }
          }
        }
      }

      setOrders(ordersWithUsers);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [user?.role]);

  const refreshDataAfterAuth = (role) => {
    // Catalog is public — already loaded on mount; refetching on login caused loading flashes and auth deadlocks.
    if (role === 'admin') {
      fetchOrders();
      // Force supplier wallet balances on every admin login (G2Bulk + Sam, independent).
      refreshSupplierWallets({ silent: false }).catch(() => {});
    }
  };

  // ============================================
  // REAL AUTH WITH SUPABASE
  // ============================================
  const rejectMaintenanceLogin = useCallback(async (userData) => {
    if (isLoginBlockedDuringMaintenance(siteStatus, userData)) {
      await supabase.auth.signOut();
      throw new Error(t.maintenanceLoginBlocked);
    }
    return userData;
  }, [siteStatus, t.maintenanceLoginBlocked]);

  const recordLoginSuccess = useCallback(async (email, userId = null, userName = null) => {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const dedupeKey = userId || normalizedEmail;
    if (!dedupeKey) return;

    const now = Date.now();
    if (
      loginLogDedupeRef.current.key === dedupeKey
      && now - loginLogDedupeRef.current.at < 5000
    ) {
      return;
    }
    loginLogDedupeRef.current = { key: dedupeKey, at: now };

    await logAuthEvent('login_success', {
      email: normalizedEmail || email || null,
      userId: userId || null,
      userName: userName || null,
    });
  }, []);

  const recordLoginSuccessRef = useRef(recordLoginSuccess);
  useEffect(() => {
    recordLoginSuccessRef.current = recordLoginSuccess;
  }, [recordLoginSuccess]);

  const handleAuthLogin = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      await logAuthEvent('login_failed', { email });
      const code = classifyAuthError(error);
      if (code === 'email_not_confirmed') {
        const err = new Error(t.emailNotConfirmed);
        err.code = 'email_not_confirmed';
        err.email = email;
        throw err;
      }
      throw new Error(t.authError || 'Invalid credentials');
    }

    const authUser = data?.user;
    if (!authUser) {
      await logAuthEvent('login_failed', { email });
      throw new Error('Login succeeded but failed to retrieve user session');
    }

    const userData = await resolveUserData(authUser, { createIfMissing: true });
    if (!userData) {
      await logAuthEvent('login_failed', { email });
      throw new Error('Failed to load user profile');
    }

    return rejectMaintenanceLogin(userData);
  };

  // Signup helper (used by LoginView). Extra profile fields optional.
  // Username uniqueness is enforced in DB (handle_new_user + unique index).
  const handleAuthSignup = async (email, password, profile = {}) => {
    if (siteStatus?.maintenanceEnabled) {
      throw new Error(t.maintenanceSignupBlocked);
    }

    const name = typeof profile === 'string'
      ? profile
      : String(profile?.name || '').trim();
    const username = typeof profile === 'object' && profile
      ? String(profile.username || '').trim().replace(/^@+/, '').toLowerCase()
      : '';
    const gender = typeof profile === 'object' && profile
      ? String(profile.gender || '').trim().toLowerCase()
      : '';
    const dateOfBirth = typeof profile === 'object' && profile
      ? String(profile.dateOfBirth || profile.date_of_birth || '').trim()
      : '';

    const meta = {};
    if (name) meta.name = name;
    if (username) meta.username = username;
    if (gender === 'male' || gender === 'female') meta.gender = gender;
    if (dateOfBirth) meta.date_of_birth = dateOfBirth;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        // Confirmation / magic link must land back on our site (Dashboard → Redirect URLs).
        emailRedirectTo: getAuthRedirectUrl('/login'),
      },
    });
    if (error) {
      await logAuthEvent('signup_failed', { email });
      const msg = String(error.message || '');
      if (/username_taken/i.test(msg)) throw new Error(t.usernameTaken || 'username_taken');
      if (/username_invalid/i.test(msg)) throw new Error(t.usernameInvalid || 'username_invalid');
      if (/already\s*registered|already\s*exists|user already/i.test(msg)) {
        throw new Error(t.emailAlreadyRegistered);
      }
      throw error;
    }

    // Supabase may return a user with empty identities when the email is already taken
    // (email enumeration protection) instead of a hard error.
    if (
      data?.user
      && Array.isArray(data.user.identities)
      && data.user.identities.length === 0
    ) {
      await logAuthEvent('signup_failed', { email });
      throw new Error(t.emailAlreadyRegistered);
    }

    // Patch non-username fields if session exists (username set by handle_new_user trigger)
    if (data.user) {
      const patch = {
        id: data.user.id,
        role: 'user',
        name: name || email.split('@')[0],
        balance: 0,
      };
      if (gender === 'male' || gender === 'female') patch.gender = gender;
      if (dateOfBirth) patch.date_of_birth = dateOfBirth;

      // Only patch when we already have a session (RLS allows own profile).
      // Unconfirmed users often have no JWT — skip client upsert; trigger handles profile.
      if (data.session) {
        const upsertRes = await supabase.from('profiles').upsert(patch, { onConflict: 'id' });
        if (upsertRes.error && /gender|date_of_birth|column/i.test(upsertRes.error.message || '')) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            role: 'user',
            name: name || email.split('@')[0],
            balance: 0,
          }, { onConflict: 'id' });
        }
      }

      // Email confirmation disabled → session now → log in immediately
      if (data.session) {
        const userData = await resolveUserData(data.user, { createIfMissing: true });
        if (!userData) {
          throw new Error(t.profileLoadFailed);
        }
        await logAuthEvent('signup_success', {
          email,
          userId: data.user.id,
          userName: name || userData.name || username || null,
        });
        await rejectMaintenanceLogin(userData);
        return { success: true, autoLogin: true, userData };
      }

      // Email confirmation required — stay on confirm screen (code and/or link)
      await logAuthEvent('signup_success', {
        email,
        userId: data.user.id,
        userName: name || username || email.split('@')[0],
      });
      return {
        success: true,
        needsEmailConfirm: true,
        email,
        message: t.confirmEmailSent,
      };
    }

    await logAuthEvent('signup_success', { email, userName: name || username || null });
    return {
      success: true,
      needsEmailConfirm: true,
      email,
      message: t.confirmEmailSent,
    };
  };

  const runWithPurchaseGuard = async (userId, fn) => {
    // Unique token per attempt — bots/double-clicks get blocked; same token may retry
    const checkoutToken = createCheckoutToken();
    if (purchaseInFlightRef.current) {
      throw new Error(t.purchaseInProgress);
    }
    if (!tryAcquirePurchaseLock(userId, checkoutToken)) {
      throw new Error(t.purchaseInProgress);
    }
    purchaseInFlightRef.current = true;
    try {
      return await fn(checkoutToken);
    } finally {
      purchaseInFlightRef.current = false;
      releasePurchaseLock(userId);
    }
  };

  // ============================================
  // REAL ORDER — saves to Supabase
  // Supports paying with external methods or 'balance'
  // Uses atomic RPC (create_order_atomic) for server-side
  // balance deduction and price verification.
  // ============================================
  const submitOrder = async (currentCart, paymentMethod) => {
    if (!user?.id) throw new Error('Not logged in');
    if (user?.role === 'admin') throw new Error(t.adminCannotPurchase);

    try {
    return await runWithPurchaseGuard(user.id, async (checkoutToken) => {

    const preparedCart = await resolveCheckoutOffers(currentCart);
    const { items: syncedCart, removedCount } = syncCartWithOffers(preparedCart, offers.length ? offers : preparedCart);
    if (syncedCart.length === 0) {
      throw new Error(t.cartEmptyOrUnavailable);
    }
    if (removedCount > 0) {
      setCart(syncedCart);
      throw new Error(t.cartItemsRemoved);
    }
    // Cart multi-buy: vouchers / redeem codes only (UID packs need Buy Now)
    if (cartRequiresPlayerUid(syncedCart, games)
      || syncedCart.some((line) => !isCartEligibleOffer(line, games))) {
      throw new Error(t.cartUidCheckoutBlocked);
    }
    if (syncedCart.length > getMaxCartLines()) {
      throw new Error(t.cartMaxItems || t.cartEmptyOrUnavailable);
    }
    setCart(syncedCart);

    const items = syncedCart.map((item) => {
      const unit = resolveCustomerUnitPrice(item, {
        partnerMarkupPercent: partnerMarkup,
      });
      return {
        offer_id: item.id,
        name_snapshot: getOfferOrderNameSnapshot(item, lang, games, offers),
        price: unit,
        quantity: 1,
      };
    });
    const total = items.reduce((sum, row) => sum + row.price * row.quantity, 0);
    if (!Number.isFinite(total) || total <= 0) {
      throw new Error(t.cartEmptyOrUnavailable);
    }

    if (paymentMethod === 'balance') {
      await assertNoOpenDuplicateTopup(user.id, items, t);
      await assertBalanceFulfillmentAvailable(items, t);
    }

    const data = await createOrderAtomic({
      userId: user.id,
      total,
      paymentMethod,
      items,
      idempotencyKey: checkoutToken,
      t,
    });

    if (paymentMethod === 'balance' && data?.newBalance != null) {
      setUser(prev => prev ? { ...prev, balance: data.newBalance } : prev);
    }

    // Clear cart only after successful order create (balance paid or pending wallet)
    if (data?.orderId) {
      setCart([]);
    }

    if (data.status === 'pending_payment' || data.status === 'payment_sent') {
      const pending = {
        orderId: data.orderId,
        status: data.status,
        reference: data.reference || null,
      };

      if (
        isManualWalletMethod(paymentMethod)
        && isApiWalletMode(paymentConfig)
        && data.status === 'pending_payment'
      ) {
        const invoice = await createOrderInvoice({
          orderId: data.orderId,
          paymentMethod,
        });
        return { ...pending, invoice };
      }

      return pending;
    }

    if (data.status === 'completed' && data.orderId) {
      tryFulfillOrder(data.orderId);
    }

    return { orderId: data.orderId, status: data.status || 'completed' };
    });
    } catch (err) {
      // Critical purchase failures → admin Dev Logs (expand for full console dump)
      const msg = err?.message || String(err || '');
      const soft = /in progress|قيد التنفيذ|cart empty|empty or unavailable|UID|uid/i.test(msg);
      if (!soft) {
        logClientError('purchase_failed', {
          severity: 'danger',
          error: err,
          metadata: {
            paymentMethod,
            userId: user?.id,
            userName: user?.name || user?.username || null,
          },
        });
      }
      throw err;
    }
  };

  const handleRechargeApproved = (result) => {
    if (result?.userId === user?.id && result?.newBalance != null) {
      setUser((prev) => (prev ? { ...prev, balance: result.newBalance } : prev));
    }
  };

  const handleAdminGiftOrder = async (params) => {
    const result = await adminGiftOrder(params);
    if (!result?.orderId) return result;

    let fulfillmentError = null;
    try {
      await fulfillOrderG2bulk(result.orderId);
    } catch (err) {
      fulfillmentError = err;
    }

    const polled = await pollOrderFulfillment(result.orderId);
    if (user?.role === 'admin') fetchOrders();

    return {
      ...result,
      fulfillment: {
        status: polled.status,
        codes: polled.codes,
        timedOut: polled.timedOut,
        error: fulfillmentError?.message
          || polled.order?.g2bulk_metadata?.last_error
          || null,
      },
    };
  };

  const handleDevBalanceCredited = (result) => {
    if (result?.userId === user?.id && result?.newBalance != null) {
      setUser((prev) => (prev ? { ...prev, balance: result.newBalance } : prev));
    }
  };

  // ============================================
  // INSTANT PURCHASE (Buy Now) — with player UID info
  // Uses atomic RPC for server-side balance + price verification.
  // ============================================
  const submitPurchase = async (offer, paymentMethod, playerInfo = {}) => {
    if (!user?.id) throw new Error('Not logged in');
    if (user?.role === 'admin') throw new Error(t.adminCannotPurchase);
    if (!offer) throw new Error('No offer');

    return runWithPurchaseGuard(user.id, async (checkoutToken) => {

    const [resolvedOffer] = await resolveCheckoutOffers([offer]);
    offer = resolvedOffer || offer;

    const influencerCode = playerInfo?.influencer_code || null;
    const influencerBuyerMarkup = partnerMarkup == null
      && playerInfo?.influencer_buyer_markup != null
      ? Number(playerInfo.influencer_buyer_markup)
      : null;
    const amount = resolveCustomerUnitPrice(offer, {
      partnerMarkupPercent: partnerMarkup,
      influencerBuyerMarkupPercent: influencerBuyerMarkup,
    });
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(t.cartEmptyOrUnavailable || 'Invalid price');
    }
    const {
      player_uid = null,
      player_server = null,
      player_charname = null,
    } = playerInfo;

    const items = [{
      offer_id: offer.id,
      name_snapshot: getOfferOrderNameSnapshot(offer, lang, games, offers),
      price: amount,
      quantity: 1,
      player_uid: player_uid || null,
      player_server: player_server || null,
      player_charname: player_charname || null,
    }];

    if (paymentMethod === 'balance') {
      await assertNoOpenDuplicateTopup(user.id, items, t);
      await assertBalanceFulfillmentAvailable(items, t);
    }

    const data = await createOrderAtomic({
      userId: user.id,
      total: amount,
      paymentMethod,
      items,
      playerUid: player_uid || null,
      playerServer: player_server || null,
      idempotencyKey: checkoutToken,
      influencerCode: partnerMarkup == null ? influencerCode : null,
      t,
    });

    if (player_uid) {
      const purchaseGame = games.find((g) => g.id === offer.game_id);
      if (purchaseGame) {
        setUser((prev) => (prev
          ? mergeGamePlayerUidIntoProfile(prev, purchaseGame, playerInfo)
          : prev));
      }
    }

    if (paymentMethod === 'balance' && data?.newBalance != null) {
      setUser(prev => prev ? { ...prev, balance: data.newBalance } : prev);
    }

    if (data.status === 'pending_payment' || data.status === 'payment_sent') {
      const pending = {
        orderId: data.orderId,
        status: data.status,
        reference: data.reference || null,
      };

      if (
        isManualWalletMethod(paymentMethod)
        && isApiWalletMode(paymentConfig)
        && data.status === 'pending_payment'
      ) {
        const invoice = await createOrderInvoice({
          orderId: data.orderId,
          paymentMethod,
        });
        return { ...pending, invoice };
      }

      return pending;
    }

    if (data.status === 'completed' && data.orderId) {
      tryFulfillOrder(data.orderId);
    }

    return { orderId: data.orderId, status: data.status || 'completed' };
    });
  };

  const tryFulfillOrder = async (orderId) => {
    try {
      const first = await fulfillOrderG2bulk(orderId);
      // Supplier often needs >40s; soft-pending → quiet retries (no false "failed")
      if (first?.pending || first?.fulfillmentStatus === 'fulfilling') {
        for (const delayMs of [8_000, 20_000, 45_000]) {
          await new Promise((r) => setTimeout(r, delayMs));
          try {
            const next = await fulfillOrderG2bulk(orderId);
            if (next?.fulfillmentStatus === 'fulfilled' || next?.skipped) return;
            if (next?.fulfillmentStatus === 'failed') break;
          } catch {
            /* keep trying */
          }
        }
      }
    } catch (e) {
      console.error('G2Bulk fulfillment:', e);
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', user.id)
          .maybeSingle();
        if (profile?.balance != null) {
          setUser((prev) => (prev ? { ...prev, balance: parseFloat(profile.balance) || 0 } : prev));
        }
      }
      // Only toast hard failures — pending supplier work is not a failure
      const msg = e?.message || '';
      if (!/still processing|pending|in progress/i.test(msg)) {
        showToast(msg || t.fulfillmentSupplierUnreachable, 'error');
      }
    }
  };

  const handleApproveOrder = async (orderId) => {
    if (isApiWalletMode(paymentConfig)) {
      throw new Error(t.manualOrderApprovalDisabled);
    }
    const result = await confirmOrderPayment(orderId);
    await fetchOrders();
    if (result?.status === 'completed') {
      await tryFulfillOrder(orderId);
    }
    return result;
  };

  const handleRejectOrder = async (orderId) => {
    const result = await rejectOrderPayment(orderId);
    await fetchOrders();
    return result;
  };

  // ============================================
  // ADMIN — Real DB product management
  // ============================================
  const createProduct = async (productData) => {
    const pricingMode = productData.pricing_mode || (productData.is_sale ? 'fixed' : 'auto');
    const payload = {
      game_id: productData.game_id,
      name_en: productData.name_en,
      name_ar: productData.name_ar || productData.name_en,
      price: parseFloat(productData.price),
      pricing_mode: pricingMode,
      pricing_margin_percent: pricingMode === 'margin'
        ? (parseFloat(productData.pricing_margin_percent) || null)
        : null,
      region: productData.region || null,
      description_en: productData.description_en || '',
      description_ar: productData.description_ar || '',
      sale_image_url: productData.sale_image_url || null,
      is_sale: !!productData.is_sale,
      original_price: productData.is_sale ? (parseFloat(productData.original_price) || null) : null,
      g2bulk_type: productData.g2bulk_type || null,
      g2bulk_catalogue_name: productData.g2bulk_catalogue_name?.trim() || null,
      g2bulk_product_id: productData.g2bulk_product_id ? parseInt(productData.g2bulk_product_id, 10) : null,
      g2bulk_cost_usd: productData.g2bulk_cost_usd ? parseFloat(productData.g2bulk_cost_usd) : null,
    };

    const { data, error } = await supabase
      .from('offers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Create offer error:', error);
      const msg = error.message || JSON.stringify(error);
      if (/pricing_mode|pricing_margin|column .* does not exist|schema cache/i.test(msg)) {
        throw new Error(t.pricingDbMigrationRequired
          || 'Database missing pricing columns. Run scripts/offer-pricing-modes-migration.sql in Supabase, then retry.');
      }
      throw new Error(`Failed to add offer: ${msg}. Make sure your profile has role='admin' and RLS policies allow inserts for admins on 'offers' table.`);
    }

    setOffers((prev) => [data, ...prev]);
    showNotification(t.offerAddedSuccess || 'Offer added successfully');
    return data;
  };

  const deleteProduct = async (_productId) => {
    const message = t.g2bulkDeletionDisabled || 'Deleting products is disabled. Use the G2Bulk selection menu to deselect items from the store.';
    showToast(message, 'warning');
    throw new Error(message);
  };

  const deleteGame = async (_gameId) => {
    const message = t.g2bulkDeletionDisabled || 'Deleting games is disabled. Use the G2Bulk selection menu to deselect items from the store.';
    showToast(message, 'warning');
    throw new Error(message);
  };

  const updateProduct = async (productData) => {
    const { id, ...payload } = productData;
    if (!id) {
      return createProduct(productData);
    }
    const pricingMode = payload.pricing_mode || (payload.is_sale ? 'fixed' : 'auto');
    const marginRaw = payload.pricing_margin_percent;
    const margin = pricingMode === 'margin'
      ? (marginRaw === '' || marginRaw == null ? null : parseFloat(marginRaw))
      : null;

    if (pricingMode === 'margin' && (!Number.isFinite(margin) || margin < 0)) {
      throw new Error(t.pricingMarginRequired || 'Enter a margin percent for this pack.');
    }

    const updateRow = {
      name_en: payload.name_en,
      name_ar: payload.name_ar || payload.name_en,
      price: parseFloat(payload.price),
      pricing_mode: pricingMode,
      pricing_margin_percent: margin,
      region: payload.region || null,
      description_en: payload.description_en || '',
      description_ar: payload.description_ar || '',
      sale_image_url: payload.sale_image_url || null,
      sale_image_custom: !!payload.sale_image_url,
      is_sale: !!payload.is_sale,
      original_price: payload.is_sale ? (parseFloat(payload.original_price) || null) : null,
      g2bulk_type: payload.g2bulk_type || null,
      g2bulk_catalogue_name: payload.g2bulk_catalogue_name?.trim() || null,
      g2bulk_product_id: payload.g2bulk_product_id ? parseInt(payload.g2bulk_product_id, 10) : null,
      g2bulk_cost_usd: payload.g2bulk_cost_usd ? parseFloat(payload.g2bulk_cost_usd) : null,
    };

    const { data, error } = await supabase
      .from('offers')
      .update(updateRow)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update offer error:', error);
      const msg = error.message || '';
      if (/pricing_mode|pricing_margin|column .* does not exist|schema cache/i.test(msg)) {
        throw new Error(t.pricingDbMigrationRequired
          || 'Database missing pricing columns. Run scripts/offer-pricing-modes-migration.sql in Supabase, then retry.');
      }
      throw new Error(msg || t.failedToSaveOffer || 'Failed to update offer. Check admin RLS policies.');
    }

    if (!data) {
      throw new Error(t.failedToSaveOffer || 'Update returned no row — check admin permissions.');
    }

    // Merge so pricing fields are never dropped if select is partial
    setOffers((prev) => prev.map((p) => (
      p.id === id
        ? {
          ...p,
          ...data,
          pricing_mode: data.pricing_mode ?? updateRow.pricing_mode,
          pricing_margin_percent: data.pricing_margin_percent ?? updateRow.pricing_margin_percent,
          price: data.price ?? updateRow.price,
        }
        : p
    )));
    return data;
  };

  /** Merge a DB-saved offer row into local catalog state (pricing fields included). */
  const mergeOfferFromDb = useCallback((saved) => {
    if (!saved?.id) return;
    setOffers((prev) => prev.map((p) => (
      p.id === saved.id
        ? {
          ...p,
          ...saved,
          pricing_mode: saved.pricing_mode ?? p.pricing_mode,
          pricing_margin_percent: saved.pricing_margin_percent ?? p.pricing_margin_percent,
          price: saved.price ?? p.price,
        }
        : p
    )));
  }, []);

  const mergeOffersFromDb = useCallback((rows = []) => {
    if (!rows.length) return;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    setOffers((prev) => prev.map((p) => {
      const saved = byId[p.id];
      if (!saved) return p;
      return {
        ...p,
        ...saved,
        pricing_mode: saved.pricing_mode ?? p.pricing_mode,
        pricing_margin_percent: saved.pricing_margin_percent ?? p.pricing_margin_percent,
        price: saved.price ?? p.price,
      };
    }));
  }, []);

  const saveGame = async (gameData) => {
    // Manual game create is disabled — catalog comes from G2Bulk sync only
    if (!gameData?.id) {
      throw new Error(t.adminGamesFromG2bulkOnly || 'Games are added only via G2Bulk catalog sync.');
    }
    return updateGame(gameData);
  };

  const saveProduct = async (productData) => {
    // Always return the DB row so callers can merge pricing fields
    if (!productData?.id) return createProduct(productData);
    return updateProduct(productData);
  };

  const updateGame = async (gameData) => {
    const { id, ...payload } = gameData;

    // Admin-set cover/logo stay locked across G2Bulk catalog sync
    const patch = {
      name_en: payload.name_en,
      name_ar: payload.name_ar || payload.name_en,
      slug: payload.slug,
      points_name: payload.points_name || 'Points',
      logo_url: payload.logo_url || null,
      image_url: payload.image_url || null,
      redemption_method: payload.redemption_method || 'both',
      servers: payload.servers || [],
      description_en: payload.description_en || '',
      description_ar: payload.description_ar || '',
      carousel_focus_x: payload.carousel_focus_x ?? 50,
      carousel_focus_y: payload.carousel_focus_y ?? 50,
      g2bulk_game_code: payload.g2bulk_game_code?.trim() || null,
    };
    if (Object.prototype.hasOwnProperty.call(payload, 'image_url') || Object.prototype.hasOwnProperty.call(payload, 'image_custom')) {
      patch.image_custom = payload.image_custom !== false && !!payload.image_url;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'logo_url') || Object.prototype.hasOwnProperty.call(payload, 'logo_custom')) {
      patch.logo_custom = payload.logo_custom !== false && !!payload.logo_url;
    }

    const { data, error } = await supabase
      .from('games')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update game error:', error);
      throw new Error(`Failed to update game: ${error.message}`);
    }

    setGames(prev => sortGamesByCarousel(prev.map(g => g.id === id ? data : g)));
  };

  const reorderCarouselGames = async (updates) => {
    for (const item of updates) {
      const { error } = await supabase
        .from('games')
        .update({
          carousel_order: item.carousel_order,
          show_in_carousel: item.show_in_carousel,
        })
        .eq('id', item.id);

      if (error) {
        const msg = error.message || '';
        if (msg.includes('carousel_order') || msg.includes('show_in_carousel')) {
          throw new Error('Run add_carousel_order.sql in Supabase SQL Editor first.');
        }
        throw new Error(msg || 'Failed to update carousel order.');
      }
    }

    let nextGames = [];
    setGames((prev) => {
      const updated = prev.map((g) => {
        const u = updates.find((x) => x.id === g.id);
        return u ? { ...g, carousel_order: u.carousel_order, show_in_carousel: u.show_in_carousel } : g;
      });
      nextGames = sortGamesByCarousel(updated);
      return nextGames;
    });

    // Pair dashboard G2Bulk carousel ticks with homepage carousel (incl. redeem)
    try {
      await syncPullSelectionCarouselFromGames(nextGames);
    } catch (syncErr) {
      console.warn('carousel pull-selection sync:', syncErr);
    }
  };

  const addGameToCarousel = async (game) => {
    if (!game?.id) return;
    const carouselGames = getCarouselGames(games);
    if (carouselGames.some((g) => g.id === game.id)) return;

    const updates = [
      ...carouselGames.map((g, index) => ({
        id: g.id,
        carousel_order: index,
        show_in_carousel: true,
      })),
      {
        id: game.id,
        carousel_order: carouselGames.length,
        show_in_carousel: true,
      },
    ];

    try {
      await reorderCarouselGames(updates);
      setAdminCarouselPickerOpen(false);
      showNotification(t.carouselUpdated || 'Carousel updated');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const goToAddStoreGames = () => {
    setAdminCarouselPickerOpen(false);
    setAdminCarouselOpen(false);
    navigate('/dashboard/products');
  };

  const moveCarouselGame = async (gameId, direction) => {
    const carouselGames = getCarouselGames(games);
    const index = carouselGames.findIndex((g) => g.id === gameId);
    if (index < 0) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= carouselGames.length) return;

    const reordered = [...carouselGames];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];

    const updates = reordered.map((g, i) => ({
      id: g.id,
      carousel_order: i,
      show_in_carousel: true,
    }));

    games
      .filter((g) => g.show_in_carousel === false)
      .forEach((g, i) => {
        updates.push({
          id: g.id,
          carousel_order: reordered.length + i,
          show_in_carousel: false,
        });
      });

    try {
      await reorderCarouselGames(updates);
      showNotification(t.carouselUpdated || 'Carousel order saved');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ============================================
  // AUTH STATE LISTENER (real Supabase)
  // ============================================
  useEffect(() => {
    // Defer async Supabase calls out of onAuthStateChange to avoid auth deadlocks.
    // See: https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
    const scheduleUserSync = (session, { createIfMissing = false, force = false } = {}) => {
      if (!session?.user) return;
      if (!force && lastSyncedUserIdRef.current === session.user.id) return;

      setTimeout(async () => {
        try {
          const userData = await resolveUserData(session.user, { createIfMissing });
          if (!userData) return;
          lastSyncedUserIdRef.current = userData.id;
          setUser(userData);
          if (userData.role === 'admin') {
            fetchOrders();
            refreshSupplierWallets({ silent: true }).catch(() => {});
          }
        } catch (err) {
          console.error('Failed to sync user session:', err);
        }
      }, 0);
    };

    // After Google OAuth: if user started on signup with an existing Gmail, tell them.
    // Intent is set in LoginView before redirect (sessionStorage).
    const notifyOAuthLoginResult = (authUser) => {
      if (!authUser || hasShownLoginToast.current) return;
      const oauthIntent = consumeOAuthIntent();
      if (!oauthIntent) return; // password login / session restore — other paths show toasts

      hasShownLoginToast.current = true;
      const loginLang = localStorage.getItem('echocore-lang') === 'en' ? 'en' : 'ar';
      const tt = translations[loginLang] || {};
      if (oauthIntent === 'signup' && isLikelyExistingAuthUser(authUser)) {
        showToast(tt.googleAccountAlreadyRegistered || tt.loginSuccess, 'warning');
      } else {
        showNotification(tt.loginSuccess || 'Welcome back!');
      }
    };

    // IMPORTANT: Handle Supabase email confirmation / signup redirect tokens
    // They come as #access_token=...&type=signup in the URL hash
    const handleAuthHash = async () => {
      if (isPasswordRecoveryUrl() || isPasswordRecoveryPending()) {
        markPasswordRecoveryPending();
        navigateRef.current('/login?recovery=1', { replace: true });
        return;
      }

      const hash = window.location.hash;
      if (!hash.includes('access_token')) return;

      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
      const authType = hashParams.get('type');

      if (authType === 'recovery') {
        markPasswordRecoveryPending();
        navigateRef.current('/login?recovery=1', { replace: true });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      if (isPasswordRecoveryPending()) {
        navigateRef.current('/login?recovery=1', { replace: true });
        return;
      }

      const userData = await resolveUserData(session.user, { createIfMissing: true });
      if (!userData) return;

      lastSyncedUserIdRef.current = userData.id;
      setUser(userData);
      window.history.replaceState({}, '', '/login');
      navigateRef.current('/', { replace: true });

      notifyOAuthLoginResult(session.user);

      void recordLoginSuccessRef.current(userData.email, userData.id, userData.name);
      refreshDataAfterAuth(userData.role);
    };

    handleAuthHash();

    // Initial session check — completely silent (no toast, no forced navigation to home)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const userData = await resolveUserData(session.user);
        if (userData) {
          lastSyncedUserIdRef.current = userData.id;
          setUser(userData);
          if (userData.role === 'admin') {
            fetchOrders();
            refreshSupplierWallets({ silent: true }).catch(() => {});
          }
        }
      }
      setLoadingAuth(false);
    });

    // Listen for auth changes — sync user only; no navigate/toast on tab focus.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        lastSyncedUserIdRef.current = null;
        setUser(null);
        setNotifications([]);
        setUnreadCount(0);
        setNotificationsOpen(false);
        hasShownLoginToast.current = false;
        return;
      }
      if (event === 'SIGNED_IN' && session?.user) {
        const { email, id, user_metadata: meta } = session.user;
        const displayName = meta?.name || meta?.full_name || null;
        // Brief delay so profiles row exists (handle_new_user / resolveUserData)
        setTimeout(() => {
          void recordLoginSuccessRef.current(email, id, displayName);
        }, 150);
        // PKCE Google return often has no hash token — handle toast here
        notifyOAuthLoginResult(session.user);
      }
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryPending();
        navigateRef.current('/login?recovery=1', { replace: true });
      }
      if (!session?.user) return;
      scheduleUserSync(session, { force: event === 'USER_UPDATED' });
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshPaymentConfig = async () => {
    const config = await fetchPaymentMethods();
    setPaymentConfig(config);
  };

  const refreshSiteTheme = async (overrides) => {
    if (overrides) {
      applyTheme(normalizeThemeOverrides(overrides), { replace: true });
      return;
    }
    const theme = await fetchSiteTheme();
    if (theme == null) return;
    applyTheme(normalizeThemeOverrides(theme), { replace: true });
  };

  const refreshHomeLayout = async (layout) => {
    if (layout) {
      setHomeLayout(normalizeHomeLayout(layout));
      return;
    }
    const nextLayout = await fetchHomeLayout();
    if (nextLayout) {
      setHomeLayout(nextLayout);
    }
  };

  const refreshReviews = async () => {
    const nextReviews = await fetchApprovedReviews();
    setReviews(nextReviews);
  };

  const loadLiveCatalog = async (pullSelection = null) => {
    setLoadingGames(true);
    try {
      const catalog = await fetchLiveCatalogForSelection(pull);
      const pull = normalizePullSelection(pullSelection || {});
      const filtered = filterLiveCatalog(catalog, pull);
      setGames(filtered.games || []);
      setOffers(filtered.offers || []);
    } catch (err) {
      console.error('Live catalog load failed:', err);
      setGames([]);
      setOffers([]);
    } finally {
      setLoadingGames(false);
    }
  };

  const loadSyncedCatalog = async (catalogOnly, pullSelection = null) => {
    const pull = normalizePullSelection(pullSelection || {});
    const [gamesData, offersData] = await Promise.all([
      fetchAllSupabaseRows(() => {
        let pageQuery = supabase
          .from('games')
          .select('*')
          .eq('active', true);
        if (catalogOnly) {
          pageQuery = pageQuery.eq('catalog_source', 'g2bulk');
        }
        return pageQuery.order('created_at', { ascending: true });
      }),
      fetchAllSupabaseRows(() => {
        let pageQuery = supabase
          .from('offers')
          .select('*')
          .eq('active', true);
        if (catalogOnly) {
          pageQuery = pageQuery.eq('catalog_source', 'g2bulk');
        }
        return pageQuery.order('created_at', { ascending: true });
      }),
    ]);

    const filteredGames = filterGamesByPullSelection(gamesData || [], pull);
    const filteredOffers = filterOffersByPullSelection(offersData || [], filteredGames, pull);
    setGames(sortGamesByCarousel(filteredGames));
    setOffers(filteredOffers);
  };

  /*
  const loadHybridCatalog = async (config) => {
    setLoadingGames(true);
    try {
      const pull = normalizePullSelection(config.g2bulkPullSelection || {});
      const catalogOnly = config.g2bulkCatalogOnly;
      const [gamesData, offersData, liveCatalog] = await Promise.all([
        fetchAllSupabaseRows(() => {
          let pageQuery = supabase
            .from('games')
            .select('*')
            .eq('active', true);
          if (catalogOnly) {
            pageQuery = pageQuery.eq('catalog_source', 'g2bulk');
          }
          return pageQuery.order('created_at', { ascending: true });
        }),
        fetchAllSupabaseRows(() => {
          let pageQuery = supabase
            .from('offers')
            .select('*')
            .eq('active', true);
          if (catalogOnly) {
            pageQuery = pageQuery.eq('catalog_source', 'g2bulk');
          }
          return pageQuery.order('created_at', { ascending: true });
        }),
        fetchLiveCatalogForSelection(pull),
      ]);

      const syncedPull = syncedPullSelection(pull);
      const syncedGames = filterGamesByPullSelection(gamesData || [], syncedPull);
      const syncedOffers = filterOffersByPullSelection(offersData || [], syncedGames, syncedPull);
      const liveFiltered = filterLiveCatalog(liveCatalog, pull);

      setGames(sortGamesByCarousel(mergeCatalogRows(syncedGames, liveFiltered.games)));
      setOffers(mergeCatalogRows(syncedOffers, liveFiltered.offers));
    } catch (err) {
      console.error('Hybrid catalog load failed:', err);
      setGames([]);
      setOffers([]);
    } finally {
      setLoadingGames(false);
    }
  };
  */

  const handleLiveCatalogUpdate = useCallback(({ parent, games: variantGames = [], offers: groupOffers = [] }) => {
    setGames((prev) => mergeCatalogRows(prev, [parent, ...variantGames].filter(Boolean)));
    setOffers((prev) => mergeCatalogRows(prev, groupOffers));
  }, []);

  const handleRegionCatalogRefresh = useCallback(async (variant, storefrontGame) => {
    const result = await refreshGameRegionOffers({
      variant,
      storefrontGame,
      catalogMode: paymentConfig.g2bulkCatalogMode || 'sync',
    });
    if (!result) return;
    if (result.games) {
      setGames((prev) => mergeCatalogRows(prev, result.games));
    }
    if (result.offers) {
      setOffers((prev) => mergeCatalogRows(prev, result.offers));
    }
  }, [paymentConfig.g2bulkCatalogMode]);

  const resolveCheckoutOffers = async (items = []) => resolveOffersForCheckout(items, {
    onOffersMerged: (merge) => setOffers(merge),
  });

  const refreshCatalog = async (catalogOnly) => {
    const config = await fetchPaymentMethods();
    setPaymentConfig(config);
    const pull = config.g2bulkPullSelection || null;
    if (config.g2bulkCatalogMode === 'live') {
      await loadLiveCatalog(pull);
      return;
    }
    const onlyG2bulk = catalogOnly ?? config.g2bulkCatalogOnly;
    setLoadingGames(true);
    try {
      await loadSyncedCatalog(onlyG2bulk, pull);
    } finally {
      setLoadingGames(false);
    }
  };

  // Load storefront data — payment config first so G2Bulk catalog filter applies
  useEffect(() => {
    (async () => {
      const config = await fetchPaymentMethods();
      setPaymentConfig(config);
      await Promise.allSettled([
        config.g2bulkCatalogMode === 'live'
          ? loadLiveCatalog(config.g2bulkPullSelection)
          : (async () => {
              setLoadingGames(true);
              try {
                await loadSyncedCatalog(config.g2bulkCatalogOnly, config.g2bulkPullSelection);
              } finally {
                setLoadingGames(false);
              }
            })(),
        refreshSiteTheme(),
        refreshHomeLayout(),
        refreshReviews(),
        fetchSiteStatus().then(setSiteStatus).catch(() => {}),
      ]);
    })();
  }, []);

  useEffect(() => {
    const refreshStatus = () => {
      fetchSiteStatus()
        .then((status) => {
          setSiteStatus(status);
          if (!status?.maintenanceEnabled) {
            setMaintenanceBannerDismissed(false);
          }
        })
        .catch(() => {});
    };
    const intervalId = setInterval(refreshStatus, 60000);
    return () => clearInterval(intervalId);
  }, []);

  // Persist cart in localStorage (browser, not Supabase — survives refresh on this device)
  useEffect(() => {
    saveCartToStorage(cart);
  }, [cart]);

  // Load orders when the admin dashboard becomes visible (as admin)
  useEffect(() => {
    if (location.pathname.startsWith('/dashboard') && user?.role === 'admin') {
      fetchOrders();
    }
  }, [location.pathname, user?.role, fetchOrders]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    refreshNotifications(user.id);

    const unsubscribe = subscribeToNotifications(user.id, async (newItem) => {
      setNotifications((prev) => [newItem, ...prev].slice(0, 30));
      setUnreadCount((count) => count + 1);

      // On-site toast for purchase/delivery (click → receipt; auto-hide ~10s)
      if (shouldShowLiveToast(newItem?.type)) {
        const tLive = translations[lang] || translations.ar;
        const formatted = formatNotification(newItem, tLive, lang);
        const dest = getNotificationDestination(newItem, formatted, user.role);
        const toastType = (formatted.tone === 'danger' || formatted.tone === 'warning')
          ? 'error'
          : 'success';
        showToast(null, toastType, {
          title: formatted.title,
          body: formatted.body,
          duration: 10_000,
          hint: tLive.toastTapToView,
          onClick: () => {
            dismissToast();
            if (newItem?.id) {
              markNotificationRead(newItem.id)
                .then(() => {
                  setNotifications((prev) => prev.map((entry) => (
                    entry.id === newItem.id
                      ? { ...entry, read_at: entry.read_at || new Date().toISOString() }
                      : entry
                  )));
                  setUnreadCount((count) => Math.max(0, count - 1));
                })
                .catch(() => {});
            }
            navigateTo(navigate, dest);
          },
        });
      }

      if (newItem?.type === 'account_banned') {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const refreshed = await resolveUserData(authUser);
        if (refreshed) {
          setUser(refreshed);
          navigate('/banned');
        }
      }
    });

    const pollId = setInterval(() => {
      fetchUnreadCount()
        .then((count) => setUnreadCount(count))
        .catch(() => {});
    }, 60000);

    return () => {
      unsubscribe();
      clearInterval(pollId);
    };
  }, [user?.id, user?.role, refreshNotifications, navigate, lang, showToast, dismissToast]);

  useEffect(() => {
    if (!user?.id || user?.role === 'admin') {
      setPartnerTier(null);
      setIsInfluencer(false);
      return undefined;
    }
    refreshPartnerTier(user.id);
    refreshInfluencerStatus(user.id);
    return undefined;
  }, [user?.id, user?.role, refreshPartnerTier, refreshInfluencerStatus]);

  // Keep cart prices in sync when offers load — never purge unknown ids while catalog is loading
  useEffect(() => {
    if (loadingGames || !storefrontOffers.length || cart.length === 0) return;

    const { items, removedCount, priceUpdated } = syncCartWithOffers(cart, storefrontOffers);
    if (!cartsAreEquivalent(cart, items)) {
      setCart(items);
      if (removedCount > 0) {
        showNotification(t.cartItemsRemoved);
      }
    }
    if (priceUpdated) setCartPriceUpdated(true);
  }, [storefrontOffers, cart, loadingGames, lang, t.cartItemsRemoved, showNotification]);

  const addToCart = (product, e = null) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user?.role === 'admin') {
      showToast(t.adminCannotPurchase, 'error');
      return;
    }
    if (!isCartEligibleOffer(product, games)) {
      showToast(t.cartUidCheckoutBlocked, 'error');
      return;
    }
    if (isCartFull(cart)) {
      showToast(t.cartMaxItems || t.cartEmptyOrUnavailable, 'error');
      return;
    }
    setCart((prev) => {
      if (isCartFull(prev)) return prev;
      return [...prev, pickCartSnapshot(product)];
    });
    setCartPriceUpdated(false);
    showNotification(t.addMsg);

    // Cart icon bump animation
    if (cartIconRef.current) {
      cartIconRef.current.classList.add('cart-bump');
      setTimeout(() => {
        if (cartIconRef.current) {
          cartIconRef.current.classList.remove('cart-bump');
        }
      }, 450);
    }

    // Fly to cart animation
    if (e && e.currentTarget) {
      const startRect = e.currentTarget.getBoundingClientRect();
      const endRect = cartIconRef.current ? cartIconRef.current.getBoundingClientRect() : null;

      if (endRect) {
        const flyId = Date.now() + Math.random();
        setFlyingItems(prev => [...prev, {
          id: flyId,
          product,
          startRect,
          endRect
        }]);

        setTimeout(() => {
          setFlyingItems(prev => prev.filter(item => item.id !== flyId));
        }, 800);
      }
    }
  };

  const getCartTotal = () => cart.reduce((total, item) => total + parseFloat(item.price), 0).toFixed(2);

  const removeCartItem = (lineId) => {
    setCart((prev) => prev.filter((item) => getCartLineKey(item) !== lineId));
  };

  // Called by LoginView after successful Supabase auth
  const resolveUserAfterAuth = async (authUser) => {
    const userData = await resolveUserData(authUser, { createIfMissing: true });
    if (!userData) {
      throw new Error(t.profileLoadFailed);
    }
    return rejectMaintenanceLogin(userData);
  };

  const handleLoginSuccess = (userData, redirectTo = '/', options = {}) => {
    if (isLoginBlockedDuringMaintenance(siteStatus, userData)) {
      supabase.auth.signOut();
      showToast(t.maintenanceLoginBlocked, 'error');
      return;
    }
    void recordLoginSuccess(userData.email, userData.id, userData.name);
    lastSyncedUserIdRef.current = userData.id;
    setUser(userData);
    if (isUserBanned(userData)) {
      navigate('/banned');
      return;
    }
    const destination = typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/';
    navigate(destination);
    // Only show login toast once per actual login action
    if (!hasShownLoginToast.current) {
      hasShownLoginToast.current = true;
      if (options?.alreadyRegistered) {
        showToast(t.googleAccountAlreadyRegistered || t.loginSuccess, 'warning');
      } else {
        showNotification(t.loginSuccess);
      }
    }
    refreshDataAfterAuth(userData.role);
  };

  const handleLogout = async () => {
    await logAuthEvent('logout', {
      email: user?.email || null,
      userId: user?.id || null,
      userName: user?.name || null,
    });
    await supabase.auth.signOut();
    lastSyncedUserIdRef.current = null;
    resetSupplierWalletsStore();
    setUser(null);
    navigate('/');
  };

  const updateUserProfile = async (patch = {}) => {
    if (!user?.id) throw new Error('Not logged in');
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleCheckoutComplete = async (orderResult) => {
    setCart([]);
    if (!orderResult?.orderId) {
      navigate('/');
      return;
    }

    if (orderResult.status === 'completed') {
      markOrderFulfillAllowed(orderResult.orderId);
      await tryFulfillOrder(orderResult.orderId);
      navigate(`/success?orderId=${orderResult.orderId}`);
      showNotification(`${t.successMsg} #${orderResult.orderId.slice(0, 8)}`);
      return;
    }

    navigate('/profile');
  };

  return (
    <div 
      className={`min-h-screen overflow-x-hidden font-sans text-[var(--text-primary)] selection:bg-cyan-500/30 ${lang === 'ar' ? 'dir-rtl' : 'dir-ltr'}`}
      style={{ backgroundColor: 'var(--bg-primary)' }}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <StoreBackground />
      <div className="relative z-[1]">
      <a href="#main-content" className="skip-to-content">
        {t.skipToContent}
      </a>
      <LangSwitchOverlay t={translations[overlayLang] || t} active={langSwitching} />
      <ScrollToTop />
      <Header
        t={t}
        lang={lang}
        onLangToggle={toggleLanguage}
        langSwitching={langSwitching}
        user={user}
        partnerTier={partnerTier}
        isInfluencer={isInfluencer}
        cartLength={cart.length}
        onLogout={handleLogout}
        navigate={navigate}
        onRecharge={user?.role === 'admin' ? undefined : () => navigate('/recharge')}
        cartRef={cartIconRef}
        notifications={notifications}
        unreadCount={unreadCount}
        notificationsLoading={notificationsLoading}
        notificationsOpen={notificationsOpen}
        onNotificationsToggle={handleNotificationsToggle}
        onNotificationsClose={handleNotificationsClose}
        onNotificationMarkRead={handleNotificationMarkRead}
        onNotificationsMarkAllRead={handleNotificationsMarkAllRead}
        onNotificationsClearAll={handleNotificationsClearAll}
        onNotificationDismiss={handleNotificationDismiss}
        onNotificationNavigate={handleNotificationNavigate}
        onOpenNotificationsInbox={handleOpenNotificationsInbox}
        hasSaleOffers={hasSaleOffers}
        paymentConfig={paymentConfig}
      />

      <MaintenanceBanner
        t={t}
        lang={lang}
        siteStatus={siteStatus}
        user={user}
        dismissed={maintenanceBannerDismissed}
        onDismiss={() => setMaintenanceBannerDismissed(true)}
      />

      <motion.div
        animate={{ opacity: langSwitching ? 0 : 1 }}
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        className={langSwitching ? 'pointer-events-none select-none lang-switch-motion' : ''}
      >
      <main id="main-content" className="container mx-auto px-3 sm:px-4 pb-20 sm:pb-24 max-w-7xl">
        <AppRoutes
          t={t}
          lang={lang}
          navigate={navigate}
          user={user}
          loadingAuth={loadingAuth}
          games={games}
          offers={storefrontOffers}
          partnerTier={partnerTier}
          onPartnerJoined={async (tier) => {
            if (tier) {
              setPartnerTier({
                id: tier.id,
                slug: tier.slug,
                nameEn: tier.nameEn,
                nameAr: tier.nameAr,
                markupPercent: Number(tier.markupPercent),
              });
            } else {
              await refreshPartnerTier(user?.id);
            }
          }}
          isInfluencer={isInfluencer}
          orders={orders}
          loadingGames={loadingGames}
          loadingOrders={loadingOrders}
          cart={cart}
          cartPriceUpdated={cartPriceUpdated}
          getCartTotal={getCartTotal}
          removeCartItem={removeCartItem}
          addToCart={addToCart}
          openGame={openGame}
          openOffer={openOffer}
          openBuyOffer={openBuyOffer}
          homeShowsAdminChrome={homeShowsAdminChrome}
          isAdmin={isAdmin}
          homePreviewAsUser={homePreviewAsUser}
          handleToggleHomePreview={handleToggleHomePreview}
          homeLayout={homeLayout}
          reviews={reviews}
          refreshReviews={refreshReviews}
          paymentConfig={paymentConfig}
          submitPurchase={submitPurchase}
          submitOrder={submitOrder}
          onOrderPaid={tryFulfillOrder}
          onFulfillOrder={tryFulfillOrder}
          handleCheckoutComplete={handleCheckoutComplete}
          showToast={showToast}
          handleAuthLogin={handleAuthLogin}
          handleAuthSignup={handleAuthSignup}
          handleLoginSuccess={handleLoginSuccess}
          resolveUserAfterAuth={resolveUserAfterAuth}
          updateProduct={updateProduct}
          mergeOfferFromDb={mergeOfferFromDb}
          mergeOffersFromDb={mergeOffersFromDb}
          updateGame={updateGame}
          deleteGame={deleteGame}
          handleLiveCatalogUpdate={handleLiveCatalogUpdate}
          handleRegionCatalogRefresh={handleRegionCatalogRefresh}
          notifications={notifications}
          unreadCount={unreadCount}
          notificationsLoading={notificationsLoading}
          handleRefreshInbox={handleRefreshInbox}
          handleNotificationMarkRead={handleNotificationMarkRead}
          handleNotificationsMarkAllRead={handleNotificationsMarkAllRead}
          handleNotificationNavigate={handleNotificationNavigate}
          handleLogout={handleLogout}
          updateUserProfile={updateUserProfile}
          createProduct={createProduct}
          deleteProduct={deleteProduct}
          saveGame={saveGame}
          fetchGames={fetchGames}
          fetchOffers={fetchOffers}
          fetchOrders={fetchOrders}
          refreshPaymentConfig={refreshPaymentConfig}
          refreshCatalog={refreshCatalog}
          refreshSiteTheme={refreshSiteTheme}
          refreshHomeLayout={refreshHomeLayout}
          handleRechargeApproved={handleRechargeApproved}
          handleApproveOrder={handleApproveOrder}
          handleRejectOrder={handleRejectOrder}
          handleFulfillOrder={tryFulfillOrder}
          handleDevBalanceCredited={handleDevBalanceCredited}
          handlePreviewHomepage={handlePreviewHomepage}
          handleAdminGiftOrder={handleAdminGiftOrder}
          setAdminEditOffer={setAdminEditOffer}
          onNavigateToSaleDiscounts={handleNavigateToSaleDiscounts}
          setAdminEditGame={setAdminEditGame}
          setAdminCarouselOpen={setAdminCarouselOpen}
          setAdminCarouselPickerOpen={setAdminCarouselPickerOpen}
          moveCarouselGame={moveCarouselGame}
          siteStatus={siteStatus}
        />
      </main>


      {flyingItems.map((fly) => {
        const start = fly.startRect;
        const end = fly.endRect;
        const name = lang === 'ar' ? fly.product.name_ar : fly.product.name_en;
        const price = parseFloat(fly.product.price).toFixed(2);

        return (
          <motion.div
            key={fly.id}
            className="flying-item"
            initial={{
              left: start.left,
              top: start.top,
              width: start.width,
              height: start.height,
              opacity: 0.95,
              scale: 0.95
            }}
            animate={{
              left: end.left + (end.width / 2) - 50,
              top: end.top + (end.height / 2) - 12,
              width: 100,
              height: 26,
              opacity: 0,
              scale: 0.2
            }}
            transition={{
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1]
            }}
          >
            <div className="flex items-center gap-1.5 text-[var(--accent)] font-semibold text-[10px]">
              <span className="truncate max-w-[55px]">{name}</span>
              <span className="font-mono opacity-75">+${price}</span>
            </div>
          </motion.div>
        );
      })}

      <Footer lang={lang} t={t} />
      </motion.div>

      {isAdmin && adminEditOffer && (
        <AdminOfferEditModal
          offer={adminEditOffer}
          games={games}
          offers={offers}
          lang={lang}
          t={t}
          onClose={() => setAdminEditOffer(null)}
          onSave={saveProduct}
          onPricingSaved={mergeOfferFromDb}
        />
      )}

      {isAdmin && adminEditGame?.id && (
        <AdminGameEditModal
          game={adminEditGame}
          games={games}
          offers={offers}
          lang={lang}
          t={t}
          onClose={() => setAdminEditGame(null)}
          onSave={saveGame}
          onDelete={deleteGame}
          onOffersPricingApplied={async (result) => {
            if (result?.offers?.length) {
              mergeOffersFromDb(result.offers);
            } else {
              await fetchOffers({ catalogOnly: paymentConfig.g2bulkCatalogOnly });
            }
          }}
        />
      )}

      {isAdmin && adminCarouselPickerOpen && (
        <Suspense fallback={null}>
          <CarouselAddPicker
            games={games}
            lang={lang}
            t={t}
            onClose={() => setAdminCarouselPickerOpen(false)}
            onPick={addGameToCarousel}
            onGoToAddGames={goToAddStoreGames}
          />
        </Suspense>
      )}

      {isAdmin && adminCarouselOpen && (
        <Suspense fallback={null}>
          <AdminCarouselManager
            games={getCarouselManageableGames(games)}
            catalogGames={games}
            lang={lang}
            t={t}
            onClose={() => setAdminCarouselOpen(false)}
            onSave={reorderCarouselGames}
            onGoToAddGames={goToAddStoreGames}
            onEditGame={(game) => {
              setAdminCarouselOpen(false);
              setAdminEditGame(game);
            }}
          />
        </Suspense>
      )}

      {notification && (
        <AppToast
          message={notification.message}
          type={notification.type}
          title={notification.title}
          body={notification.body}
          hint={notification.hint}
          onClick={notification.onClick}
        />
      )}
    </div>
      </div>
  );
}
