import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import StoreBackground from './components/backgrounds/StoreBackground';
import { getCarouselGames, sortGamesByCarousel } from './lib/carouselUtils';
import { Loader2, Globe } from 'lucide-react';
import AppToast from './components/ui/AppToast';
import { supabase, resolveUserData } from './lib/supabase';
import { createOrderAtomic, confirmOrderPayment, rejectOrderPayment } from './lib/orders';
import { syncCartWithOffers, pickCartSnapshot, cartsAreEquivalent, getCartLineKey } from './lib/cartUtils';
import ProtectedRoute from './components/routing/ProtectedRoute';
import ScrollToTop from './components/routing/ScrollToTop';
import LegacyOfferRedirect from './components/routing/LegacyOfferRedirect';
import { getGameOfferBuyPath, getGameOfferPath } from './lib/offerRoutes';
import AllGamesView from './views/AllGamesView';
import GameDetail from './views/GameDetail';
import OfferDetail from './views/OfferDetail';
import BuyView from './views/BuyView';
import { fetchPaymentMethods } from './lib/storeSettings';
import { applyTheme, fetchSiteTheme, normalizeThemeOverrides } from './lib/theme';
import { DEFAULT_HOME_LAYOUT, fetchHomeLayout, normalizeHomeLayout } from './lib/homeLayout';
import { fetchApprovedReviews } from './lib/customerReviews';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
} from './lib/notifications';
import { translations } from './data/translations';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from './components/layout/Header';
import HomeView from './views/home/HomeView';
import Footer from './components/layout/Footer';

const LoginView = lazy(() => import('./views/auth/LoginView'));
const CartView = lazy(() => import('./views/CartView'));
const CheckoutView = lazy(() => import('./views/CheckoutView'));
const SaleOffersView = lazy(() => import('./views/SaleOffersView'));
const FAQView = lazy(() => import('./views/FAQView'));
const HowItWorksView = lazy(() => import('./views/HowItWorksView'));
const ContactView = lazy(() => import('./views/ContactView'));
const RechargeView = lazy(() => import('./views/RechargeView'));
const ProfileView = lazy(() => import('./views/profile/ProfileView'));

import AdminOfferEditModal from './components/admin/AdminOfferEditModal';
import AdminGameEditModal from './components/admin/AdminGameEditModal';
const AdminView = lazy(() => import('./views/admin/AdminView'));
const AdminCarouselManager = lazy(() => import('./components/admin/AdminCarouselManager'));

const SuccessView = lazy(() => import('./views/SuccessView'));
const NotFoundView = lazy(() => import('./views/NotFoundView'));
const PrivacyView = lazy(() => import('./views/PrivacyView'));
const TermsView = lazy(() => import('./views/TermsView'));

function PageLoader({ lang = 'ar' }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[var(--text-sec)] animate-pulse">
        {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
      </div>
    </div>
  );
}



const LANG_SWITCH_FADE_OUT_MS = 120;
const LANG_SWITCH_LOADING_MS = 180;
const LANG_SWITCH_FADE_IN_MS = 120;

function LangSwitchOverlay({ lang, active }) {
  const isAr = lang === 'ar';
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="lang-switch-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-[var(--bg-primary)]/96 backdrop-blur-md px-6"
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.04, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-[var(--accent)]/20 blur-xl scale-150" />
              <div className="relative w-16 h-16 rounded-2xl border border-[var(--accent)]/30 bg-[var(--bg-surface)] flex items-center justify-center">
                <Globe className="w-8 h-8 text-[var(--accent)]" />
              </div>
            </div>
            <Loader2 className="w-9 h-9 text-[var(--accent)] animate-spin mb-4" />
            <p className="text-lg font-bold text-white mb-1">
              {isAr ? 'جاري تبديل اللغة...' : 'Switching language...'}
            </p>
            <p className="text-sm text-[var(--text-sec)]">
              {isAr ? 'يتم إعادة تحميل الصفحة' : 'Reloading the page'}
            </p>
            <div className="lang-switch-progress mt-8 h-1 w-48 rounded-full overflow-hidden bg-[var(--border)]">
              <div className="lang-switch-progress-bar h-full rounded-full bg-[var(--accent)]" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Extracted route page components (GameDetail, OfferDetail, SuccessView) have been moved to src/views/

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasShownLoginToast = useRef(false);
  const lastSyncedUserIdRef = useRef(null);

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

  const [games, setGames] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [cart, setCart] = useState([]);
  const [cartPriceUpdated, setCartPriceUpdated] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState({
    shamcash: true,
    binance: false,
    mastercard: false,
    shamcashMerchantName: 'ECHOCORE Store',
    shamcashConfigured: false,
  });
  const [homeLayout, setHomeLayout] = useState(DEFAULT_HOME_LAYOUT);
  const [reviews, setReviews] = useState([]);
  const [notification, setNotification] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const toastTimerRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [flyingItems, setFlyingItems] = useState([]);
  const [adminEditOffer, setAdminEditOffer] = useState(null);
  const [adminEditGame, setAdminEditGame] = useState(null);
  const [adminCarouselOpen, setAdminCarouselOpen] = useState(false);
  const [langSwitching, setLangSwitching] = useState(false);
  const [overlayLang, setOverlayLang] = useState(() => {
    const saved = localStorage.getItem('echocore-lang');
    return saved === 'en' || saved === 'ar' ? saved : 'ar';
  });
  const isAdmin = user?.role === 'admin';

  const showToast = useCallback((message, type = 'success') => {
    if (!message) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setNotification({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setNotification(null);
      toastTimerRef.current = null;
    }, type === 'error' ? 4500 : 3200);
  }, []);

  const showNotification = useCallback((msg) => showToast(msg, 'success'), [showToast]);

  const refreshNotifications = useCallback(async (userId = user?.id) => {
    if (!userId) return;
    setNotificationsLoading(true);
    try {
      const [items, count] = await Promise.all([
        fetchNotifications(30),
        fetchUnreadCount(),
      ]);
      setNotifications(items);
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setNotificationsLoading(false);
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

  const handleNotificationNavigate = useCallback((dest) => {
    if (dest?.state) {
      navigate(dest.path, { state: dest.state });
      return;
    }
    navigate(dest?.path || '/profile');
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

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const t = translations[lang];

  const openGame = (game) => {
    if (!game) return;
    navigate(`/game/${game.slug || game.id}`);
  };

  const openOffer = useCallback((offer) => {
    if (!offer) return;
    const game = games.find((g) => g.id === offer.game_id);
    navigate(getGameOfferPath(offer, game));
  }, [games, navigate]);

  const openBuyOffer = useCallback((offer) => {
    if (!offer) return;
    const game = games.find((g) => g.id === offer.game_id);
    navigate(getGameOfferBuyPath(offer, game));
  }, [games, navigate]);

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
  const fetchGames = async ({ background = false } = {}) => {
    if (!background) setLoadingGames(true);
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to load games:', error);
        setGames([]);
      } else {
        setGames(sortGamesByCarousel(data || []));
      }
    } catch (err) {
      console.error('Error fetching games:', err);
      setGames([]);
    } finally {
      setLoadingGames(false);
    }
  };

  const fetchOffers = async () => {
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to load offers:', error);
        setOffers([]);
      } else {
        setOffers(data || []);
      }
    } catch (err) {
      console.error('Error fetching offers:', err);
      setOffers([]);
    }
  };

  const fetchOrders = async () => {
    // Client guard — server RLS must also restrict orders/profiles to admins in production.
    if (user?.role !== 'admin') {
      setOrders([]);
      return;
    }

    setLoadingOrders(true);
    try {
      // Fetch orders + items (without profile join to avoid RLS/relation issues)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Failed to load orders:', ordersError);
        setOrders([]);
        return;
      }

      // Fetch user profiles for the orders (reliable separate query)
      let ordersWithUsers = ordersData || [];
      if (ordersWithUsers.length > 0) {
        const userIds = [...new Set(ordersWithUsers.map(o => o.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', userIds);

          if (profilesData) {
            const profileMap = Object.fromEntries(profilesData.map(p => [p.id, p]));
            ordersWithUsers = ordersWithUsers.map(order => ({
              ...order,
              profiles: profileMap[order.user_id] || null
            }));
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
  };

  const refreshDataAfterAuth = (role) => {
    // Catalog is public — already loaded on mount; refetching on login caused loading flashes and auth deadlocks.
    if (role === 'admin') fetchOrders();
  };

  // ============================================
  // REAL AUTH WITH SUPABASE
  // ============================================
  const handleAuthLogin = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(t.authError || 'Invalid credentials');
    }

    const authUser = data?.user;
    if (!authUser) {
      throw new Error('Login succeeded but failed to retrieve user session');
    }

    const userData = await resolveUserData(authUser, { createIfMissing: true });
    if (!userData) {
      throw new Error('Failed to load user profile');
    }

    return userData;
  };

  // Signup helper (used by LoginView)
  const handleAuthSignup = async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });
    if (error) throw error;

    // Create profile immediately (trigger may or may not have run)
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        role: 'user',
        name: name || email.split('@')[0],
        balance: 0
      }, { onConflict: 'id' });

      // If Supabase gave us a session immediately (email confirmation disabled in project settings),
      // log the user in right away
      if (data.session) {
        const userData = await resolveUserData(data.user, { createIfMissing: true });
        return { success: true, autoLogin: true, userData };
      }
    }

    return { success: true, message: 'Check your email to confirm your account (if required by your Supabase settings).' };
  };

  // ============================================
  // REAL ORDER — saves to Supabase
  // Supports paying with external methods or 'balance'
  // Uses atomic RPC (create_order_atomic) for server-side
  // balance deduction and price verification.
  // ============================================
  const submitOrder = async (currentCart, paymentMethod) => {
    if (!user?.id) throw new Error('Not logged in');

    const { items: syncedCart, removedCount } = syncCartWithOffers(currentCart, offers);
    if (syncedCart.length === 0) {
      throw new Error(lang === 'ar' ? 'السلة فارغة أو العروض لم تعد متاحة' : 'Cart is empty or offers are no longer available');
    }
    if (removedCount > 0) {
      setCart(syncedCart);
      throw new Error(lang === 'ar' ? 'تمت إزالة عروض غير متاحة من السلة' : 'Unavailable offers were removed from your cart');
    }
    setCart(syncedCart);

    const total = syncedCart.reduce((sum, item) => sum + parseFloat(item.price), 0);

    const items = syncedCart.map((item) => ({
      offer_id: item.id,
      name_snapshot: lang === 'ar' ? item.name_ar : item.name_en,
      price: parseFloat(item.price),
      quantity: 1
    }));

    const data = await createOrderAtomic({
      userId: user.id,
      total,
      paymentMethod,
      items,
    });

    if (paymentMethod === 'balance' && data?.newBalance != null) {
      setUser(prev => prev ? { ...prev, balance: data.newBalance } : prev);
    }

    if (data.status === 'pending_payment' || data.status === 'payment_sent') {
      return {
        orderId: data.orderId,
        status: data.status,
        reference: data.reference || null,
      };
    }

    return { orderId: data.orderId, status: data.status || 'completed' };
  };

  const handleRechargeApproved = (result) => {
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
    if (!offer) throw new Error('No offer');

    const amount = parseFloat(offer.price);
    const { player_uid = null, player_server = null } = playerInfo;

    const items = [{
      offer_id: offer.id,
      name_snapshot: lang === 'ar' ? offer.name_ar : offer.name_en,
      price: amount,
      quantity: 1,
      player_uid: player_uid || null,
      player_server: player_server || null
    }];

    const data = await createOrderAtomic({
      userId: user.id,
      total: amount,
      paymentMethod,
      items,
    });

    if (paymentMethod === 'balance' && data?.newBalance != null) {
      setUser(prev => prev ? { ...prev, balance: data.newBalance } : prev);
    }

    if (data.status === 'pending_payment' || data.status === 'payment_sent') {
      return {
        orderId: data.orderId,
        status: data.status,
        reference: data.reference || null,
      };
    }

    return { orderId: data.orderId, status: data.status || 'completed' };
  };

  const handleApproveOrder = async (orderId) => {
    const result = await confirmOrderPayment(orderId);
    await fetchOrders();
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
    const payload = {
      game_id: productData.game_id,
      name_en: productData.name_en,
      name_ar: productData.name_ar || productData.name_en,
      price: parseFloat(productData.price),
      region: productData.region || null,
      description_en: productData.description_en || '',
      description_ar: productData.description_ar || '',
      sale_image_url: productData.sale_image_url || null,
      is_sale: !!productData.is_sale,
      original_price: productData.is_sale ? (parseFloat(productData.original_price) || null) : null
      // No amount, no main image_url for offers
    };

    const { data, error } = await supabase
      .from('offers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Create offer error:', error);
      throw new Error(`Failed to add offer: ${error.message || JSON.stringify(error)}. Make sure your profile has role='admin' and RLS policies allow inserts for admins on 'offers' table.`);
    }

    setOffers(prev => [data, ...prev]);
    showNotification(t.offerAddedSuccess || 'Offer added successfully');
    return data;
  };

  const deleteProduct = async (productId) => {
    const { error } = await supabase
      .from('offers')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error(error);
      showToast(t.failedToDelete || 'Delete failed. Are you admin?', 'error');
      return;
    }
    setOffers(prev => prev.filter(p => p.id !== productId));
  };

  const updateProduct = async (productData) => {
    const { id, ...payload } = productData;

    const { data, error } = await supabase
      .from('offers')
      .update({
        name_en: payload.name_en,
        name_ar: payload.name_ar || payload.name_en,
        price: parseFloat(payload.price),
        region: payload.region || null,
        description_en: payload.description_en || '',
        description_ar: payload.description_ar || '',
        sale_image_url: payload.sale_image_url || null,
        is_sale: !!payload.is_sale,
        original_price: payload.is_sale ? (parseFloat(payload.original_price) || null) : null
        // amount and main image_url intentionally omitted
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update offer error:', error);
      throw new Error('Failed to update offer. Check if you are admin and RLS policies are set correctly.');
    }

    setOffers(prev => prev.map(p => p.id === id ? data : p));
  };

  const createGame = async (gameData) => {
    const { id: _omitId, show_in_carousel, ...payload } = gameData;

    const { data, error } = await supabase
      .from('games')
      .insert({
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
        show_in_carousel: !!show_in_carousel,
        carousel_order: show_in_carousel ? getCarouselGames(games).length : games.length,
        active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Create game error:', error);
      throw new Error(`Failed to add game: ${error.message}`);
    }

    setGames((prev) => sortGamesByCarousel([...prev, data]));
    showNotification(t.gameAddedSuccess || 'Game added successfully');
    return data;
  };

  const saveGame = async (gameData) => {
    if (!gameData?.id) return createGame(gameData);
    return updateGame(gameData);
  };

  const saveProduct = async (productData) => {
    if (!productData?.id) return createProduct(productData);
    return updateProduct(productData);
  };

  const updateGame = async (gameData) => {
    const { id, ...payload } = gameData;

    const { data, error } = await supabase
      .from('games')
      .update({
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
      })
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

    setGames((prev) => {
      const updated = prev.map((g) => {
        const u = updates.find((x) => x.id === g.id);
        return u ? { ...g, carousel_order: u.carousel_order, show_in_carousel: u.show_in_carousel } : g;
      });
      return sortGamesByCarousel(updated);
    });
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
          if (userData.role === 'admin') fetchOrders();
        } catch (err) {
          console.error('Failed to sync user session:', err);
        }
      }, 0);
    };

    // IMPORTANT: Handle Supabase email confirmation / signup redirect tokens
    // They come as #access_token=...&type=signup in the URL hash
    const handleAuthHash = async () => {
      const hash = window.location.hash;
      if (!hash.includes('access_token')) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const userData = await resolveUserData(session.user, { createIfMissing: true });
      if (!userData) return;

      lastSyncedUserIdRef.current = userData.id;
      setUser(userData);
      navigateRef.current('/', { replace: true });

      if (!hasShownLoginToast.current) {
        hasShownLoginToast.current = true;
        const loginLang = localStorage.getItem('echocore-lang') === 'en' ? 'en' : 'ar';
        showNotification(translations[loginLang].loginSuccess || 'Welcome back!');
      }

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
          if (userData.role === 'admin') fetchOrders();
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
    if (theme) {
      applyTheme(normalizeThemeOverrides(theme), { replace: true });
    }
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

  // Load storefront data in parallel — orders only for admins (dashboard)
  useEffect(() => {
    Promise.allSettled([
      fetchGames(),
      fetchOffers(),
      refreshPaymentConfig(),
      refreshSiteTheme(),
      refreshHomeLayout(),
      refreshReviews(),
    ]);
  }, []);

  // Persist cart (simple universal localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('echocore-cart');
      if (saved) setCart(JSON.parse(saved));
    } catch {
      // corrupted localStorage — start with empty cart
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('echocore-cart', JSON.stringify(cart));
  }, [cart]);

  // Load orders when the admin dashboard becomes visible (as admin)
  useEffect(() => {
    if (location.pathname === '/dashboard' && user?.role === 'admin') {
      fetchOrders();
    }
  }, [location.pathname, user?.role]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    refreshNotifications(user.id);

    const unsubscribe = subscribeToNotifications(user.id, (newItem) => {
      setNotifications((prev) => [newItem, ...prev].slice(0, 30));
      setUnreadCount((count) => count + 1);
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
  }, [user?.id, refreshNotifications]);

  // Keep cart prices in sync when offers load or admin prices change
  useEffect(() => {
    if (!offers.length || cart.length === 0) return;

    const { items, removedCount, priceUpdated } = syncCartWithOffers(cart, offers);
    if (!cartsAreEquivalent(cart, items)) {
      setCart(items);
      if (removedCount > 0) {
        showNotification(
          t.cartItemsRemoved
            || (lang === 'ar' ? 'تمت إزالة عروض غير متاحة من السلة' : 'Unavailable offers were removed from your cart'),
        );
      }
    }
    if (priceUpdated) setCartPriceUpdated(true);
  }, [offers, cart, lang, t.cartItemsRemoved, showNotification]);

  const addToCart = (product, e = null) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setCart((prev) => [...prev, pickCartSnapshot(product)]);
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
  const handleLoginSuccess = (userData, redirectTo = '/') => {
    lastSyncedUserIdRef.current = userData.id;
    setUser(userData);
    const destination = typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/';
    navigate(destination);
    // Only show login toast once per actual login action
    if (!hasShownLoginToast.current) {
      hasShownLoginToast.current = true;
      showNotification(t.loginSuccess);
    }
    refreshDataAfterAuth(userData.role);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    lastSyncedUserIdRef.current = null;
    setUser(null);
    navigate('/');
  };

  const updateUserName = async (newName) => {
    if (!user?.id) throw new Error('Not logged in');
    const { error } = await supabase
      .from('profiles')
      .update({ name: newName })
      .eq('id', user.id);
    if (error) throw new Error(error.message || 'Failed to update name');
    setUser((prev) => (prev ? { ...prev, name: newName } : prev));
  };

  const handleCheckoutComplete = async (orderResult) => {
    setCart([]);
    if (orderResult?.orderId) {
      navigate(`/success?orderId=${orderResult.orderId}`);
    } else {
      navigate('/');
    }
    const msg = orderResult?.orderId 
      ? `${t.successMsg} #${orderResult.orderId.slice(0, 8)}` 
      : t.successMsg;
    showNotification(msg);
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
        {lang === 'ar' ? 'تخطي إلى المحتوى' : 'Skip to content'}
      </a>
      <LangSwitchOverlay lang={overlayLang} active={langSwitching} />
      <ScrollToTop />
      <Header
        t={t}
        lang={lang}
        onLangToggle={toggleLanguage}
        langSwitching={langSwitching}
        user={user}
        cartLength={cart.length}
        onLogout={handleLogout}
        navigate={navigate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRecharge={() => navigate('/recharge')}
        cartRef={cartIconRef}
        notifications={notifications}
        unreadCount={unreadCount}
        notificationsLoading={notificationsLoading}
        notificationsOpen={notificationsOpen}
        onNotificationsToggle={handleNotificationsToggle}
        onNotificationsClose={handleNotificationsClose}
        onNotificationMarkRead={handleNotificationMarkRead}
        onNotificationsMarkAllRead={handleNotificationsMarkAllRead}
        onNotificationNavigate={handleNotificationNavigate}
      />

      <motion.div
        animate={{
          opacity: langSwitching ? 0 : 1,
          filter: langSwitching ? 'blur(6px)' : 'blur(0px)',
          scale: langSwitching ? 0.985 : 1,
        }}
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        className={langSwitching ? 'pointer-events-none select-none' : ''}
      >
      <main id="main-content" className="container mx-auto px-3 sm:px-4 pb-20 sm:pb-24 max-w-7xl">
        <Suspense fallback={<PageLoader lang={lang} />}>
        <Routes>
              <Route
                path="/"
                element={
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
                    onEditOffer={isAdmin ? setAdminEditOffer : undefined}
                    onEditGame={isAdmin ? setAdminEditGame : undefined}
                    onAddGame={isAdmin ? (options = {}) => setAdminEditGame({ id: null, show_in_carousel: !!options.showInCarousel }) : undefined}
                    onAddOffer={isAdmin ? (options = {}) => setAdminEditOffer({ id: null, is_sale: !!options.isSale }) : undefined}
                    onManageCarousel={isAdmin ? () => setAdminCarouselOpen(true) : undefined}
                    onMoveCarouselGame={isAdmin ? moveCarouselGame : undefined}
                    isAdmin={isAdmin}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    homeLayout={homeLayout}
                    reviews={reviews}
                    user={user}
                    onReviewSubmitted={refreshReviews}
                  />
                }
              />

          {/* All Games page */}
          <Route
            path="/games"
            element={
              <AllGamesView
                games={games}
                t={t}
                lang={lang}
                loading={loadingGames}
                onSelectGame={openGame}
                onEditGame={isAdmin ? setAdminEditGame : undefined}
                isAdmin={isAdmin}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            }
          />

          {/* Sale Offers page */}
          <Route
            path="/sale"
            element={
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
            }
          />

          {/* FAQ page */}
          <Route
            path="/faq"
            element={
              <FAQView t={t} lang={lang} />
            }
          />

          {/* How it Works page */}
          <Route
            path="/how"
            element={
              <HowItWorksView t={t} lang={lang} />
            }
          />

          {/* Contact Us page */}
          <Route
            path="/contact"
            element={
              <ContactView t={t} lang={lang} user={user} />
            }
          />

          {/* Offer buy — nested under game for clean URLs */}
          <Route
            path="/game/:gameSlug/:offerSlug/buy"
            element={
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
                  paymentConfig={paymentConfig}
                  onNotify={showToast}
                />
              </ProtectedRoute>
            }
          />

          {/* Offer detail — /game/mobile-legends/86-diamonds-6d2dea31 */}
          <Route
            path="/game/:gameSlug/:offerSlug"
            element={
              <OfferDetail
                games={games}
                offers={offers}
                t={t}
                lang={lang}
                navigate={navigate}
                addToCart={addToCart}
                user={user}
                updateProduct={updateProduct}
                updateGame={updateGame}
                loadingCatalog={loadingGames}
                onBuyNow={openBuyOffer}
              />
            }
          />

          {/* Dynamic Game page */}
          <Route
            path="/game/:slug"
            element={
              <GameDetail
                games={games}
                offers={offers}
                t={t}
                lang={lang}
                navigate={navigate}
                addToCart={addToCart}
                user={user}
                updateProduct={updateProduct}
                updateGame={updateGame}
                loadingGames={loadingGames}
                onSelectOffer={openOffer}
                onBuyNow={openBuyOffer}
              />
            }
          />

          {/* Legacy UUID routes → canonical game/offer paths */}
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
            element={
              <LoginView
                t={t}
                lang={lang}
                handleAuthLogin={handleAuthLogin}
                handleAuthSignup={handleAuthSignup}
                onLoginSuccess={handleLoginSuccess}
              />
            }
          />

          <Route
            path="/cart"
            element={
              <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
                <CartView
                  t={t}
                  lang={lang}
                  cart={cart}
                  getCartTotal={getCartTotal}
                  onRemoveItem={removeCartItem}
                  onCheckout={() => navigate('/checkout')}
                  priceUpdated={cartPriceUpdated}
                />
              </ProtectedRoute>
            }
          />

          <Route
            path="/checkout"
            element={
              <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
                <CheckoutView
                  t={t}
                  lang={lang}
                  cart={cart}
                  submitOrder={submitOrder}
                  onComplete={handleCheckoutComplete}
                  currentBalance={user?.balance || 0}
                  paymentConfig={paymentConfig}
                  onNotify={showToast}
                />
              </ProtectedRoute>
            }
          />

          {/* Post-Payment Success Page */}
          <Route
            path="/success"
            element={
              <SuccessView 
                navigate={navigate} 
                games={games} 
                t={t} 
                lang={lang} 
              />
            }
          />

          {/* User Profile */}
          <Route
            path="/profile"
            element={
              loadingAuth ? (
                <PageLoader lang={lang} />
              ) : user ? (
                <ProfileView
                  t={t}
                  lang={lang}
                  user={user}
                  navigate={navigate}
                  onLogout={handleLogout}
                  onRecharge={() => navigate('/recharge')}
                  onUpdateName={updateUserName}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* Recharge Balance Page */}
          <Route
            path="/recharge"
            element={
              <ProtectedRoute user={user} loadingAuth={loadingAuth} lang={lang}>
                <RechargeView
                  t={t}
                  lang={lang}
                  navigate={navigate}
                  user={user}
                  currentBalance={user?.balance || 0}
                  paymentConfig={paymentConfig}
                  onNotify={showToast}
                />
              </ProtectedRoute>
            }
          />

          <Route path="/privacy" element={<PrivacyView lang={lang} />} />
          <Route path="/terms" element={<TermsView lang={lang} />} />

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
            path="/dashboard"
            element={
              loadingAuth ? (
                <div className="flex items-center justify-center min-h-[50vh]">
                  <div className="text-[var(--text-sec)] animate-pulse">Loading...</div>
                </div>
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
                  updateGame={updateGame}
                  refreshProducts={fetchGames}
                  refreshOffers={fetchOffers}
                  refreshOrders={fetchOrders}
                  onPaymentSettingsSaved={refreshPaymentConfig}
                  onThemeSaved={refreshSiteTheme}
                  onHomeLayoutSaved={refreshHomeLayout}
                  reviews={reviews}
                  onReviewsChanged={refreshReviews}
                  onNotify={showToast}
                  onRechargeApproved={handleRechargeApproved}
                  onApproveOrder={handleApproveOrder}
                  onRejectOrder={handleRejectOrder}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          {/* Legacy product route fallback */}
          <Route
            path="/product"
            element={<Navigate to="/" replace />}
          />

          <Route
            path="*"
            element={<NotFoundView t={t} lang={lang} navigate={navigate} />}
          />
        </Routes>
        </Suspense>
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
          lang={lang}
          t={t}
          onClose={() => setAdminEditOffer(null)}
          onSave={saveProduct}
        />
      )}

      {isAdmin && adminEditGame && (
        <AdminGameEditModal
          game={adminEditGame}
          lang={lang}
          t={t}
          onClose={() => setAdminEditGame(null)}
          onSave={saveGame}
        />
      )}

      {isAdmin && adminCarouselOpen && (
        <Suspense fallback={null}>
          <AdminCarouselManager
            games={games}
            lang={lang}
            t={t}
            onClose={() => setAdminCarouselOpen(false)}
            onSave={reorderCarouselGames}
            onEditGame={(game) => {
              setAdminCarouselOpen(false);
              setAdminEditGame(game);
            }}
          />
        </Suspense>
      )}

      {notification && (
        <AppToast message={notification.message} type={notification.type} />
      )}
    </div>
      </div>
  );
}
