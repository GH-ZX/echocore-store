import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import AdminEditButton from './components/AdminEditButton';
import { getCarouselGames, sortGamesByCarousel } from './lib/carouselUtils';
import { CheckCircle, Loader2, Globe } from 'lucide-react';
import { supabase, getUserProfile } from './lib/supabase';
import { fetchPaymentMethods } from './lib/storeSettings';
import { applyTheme, fetchSiteTheme, normalizeThemeOverrides } from './lib/theme';
import { DEFAULT_HOME_LAYOUT, fetchHomeLayout, normalizeHomeLayout } from './lib/homeLayout';
import { translations } from './data/translations';
import { Routes, Route, useNavigate, useParams, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import HomeView from './components/HomeView';
import Footer from './components/Footer';

const LoginView = lazy(() => import('./components/LoginView'));
const CartView = lazy(() => import('./components/CartView'));
const CheckoutView = lazy(() => import('./components/CheckoutView'));
const AdminView = lazy(() => import('./components/AdminView'));
const AllGamesView = lazy(() => import('./components/AllGamesView'));
const SaleOffersView = lazy(() => import('./components/SaleOffersView'));
const FAQView = lazy(() => import('./components/FAQView'));
const HowItWorksView = lazy(() => import('./components/HowItWorksView'));
const ContactView = lazy(() => import('./components/ContactView'));
const RechargeView = lazy(() => import('./components/RechargeView'));
const BuyView = lazy(() => import('./components/BuyView'));
const ProfileView = lazy(() => import('./components/ProfileView'));
const AdminOfferEditModal = lazy(() => import('./components/AdminOfferEditModal'));
const AdminGameEditModal = lazy(() => import('./components/AdminGameEditModal'));
const AdminCarouselManager = lazy(() => import('./components/AdminCarouselManager'));

function PageLoader({ lang = 'ar' }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[var(--text-sec)] animate-pulse">
        {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
      </div>
    </div>
  );
}

const LANG_SWITCH_FADE_OUT_MS = 280;
const LANG_SWITCH_LOADING_MS = 380;
const LANG_SWITCH_FADE_IN_MS = 280;

function RouteNavigationIndicator({ active, message }) {
  return (
    <AnimatePresence>
      {active && (
        <>
          <motion.div
            key="route-nav-bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[240] h-1 bg-[var(--border)] overflow-hidden"
          >
            <motion.div
              className="h-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]"
              initial={{ width: '8%' }}
              animate={{ width: ['8%', '72%', '92%'] }}
              transition={{ duration: 1.1, ease: 'easeInOut', times: [0, 0.65, 1] }}
            />
          </motion.div>
          <motion.div
            key="route-nav-pill"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[240] flex items-center gap-2.5 px-4 py-2.5 rounded-full border border-[var(--accent)]/35 bg-[var(--bg-surface)]/95 backdrop-blur-md shadow-lg"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin flex-shrink-0" />
            <span className="text-sm font-semibold text-white whitespace-nowrap">{message}</span>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

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

// Standalone route page components (receive data via props)
function GameDetail({ games, offers, t = {}, lang, navigate, addToCart, user, updateProduct, updateGame, loadingGames = false }) {
  const { slug } = useParams();
  const game = games.find((g) => (g.slug || g.id) === slug) || games.find((g) => g.id === slug);
  const isAdmin = user?.role === 'admin';
  const [editingOffer, setEditingOffer] = useState(null);
  const [editingGame, setEditingGame] = useState(false);

  if (loadingGames || (!game && games.length === 0)) {
    return (
      <div className="max-w-4xl mx-auto py-16 sm:py-20">
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-9 h-9 text-[var(--accent)] animate-spin" />
          <p className="text-[var(--text-sec)]">
            {lang === 'ar' ? 'جاري تحميل اللعبة...' : 'Loading game...'}
          </p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">{t.gameNotFound}</p>
        <button onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.backToHome}</button>
      </div>
    );
  }

  const gameOffers = offers.filter((o) => o.game_id === game.id);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => navigate('/')} className="btn btn-secondary text-sm sm:text-base">
          ← Back to Home
        </button>
        {isAdmin && (
          <AdminEditButton
            label={t.editGame || 'Edit Game'}
            onClick={() => setEditingGame(true)}
          />
        )}
      </div>

      <div className="card overflow-hidden mb-8">
        <div className="relative h-72 md:h-96">
          {game.image_url && (
            <img
              src={game.image_url}
              alt={lang === 'ar' ? game.name_ar : game.name_en}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-0 p-6 md:p-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white">
              {lang === 'ar' ? game.name_ar : game.name_en}
            </h1>
            <p className="text-white/70 text-lg mt-1">{game.points_name} Top-ups</p>
            <p className="text-white/50 text-sm mt-1">Redemption: {game.redemption_method === 'uid' ? 'UID' : game.redemption_method === 'redeem_code' ? 'Redeem Code' : 'UID or Redeem Code'}</p>
            {Array.isArray(game.servers) && game.servers.length > 0 && (
              <p className="text-white/40 text-xs mt-0.5">Servers: {game.servers.join(' • ')}</p>
            )}
          </div>
        </div>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">{t.availableOffers}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {gameOffers.length > 0 ? (
          gameOffers.map((offer) => (
            <div
              key={offer.id}
              onClick={() => navigate(`/offer/${offer.id}`)}
              className="card p-4 sm:p-5 cursor-pointer group hover:border-[var(--accent)]/70 hover:shadow-[0_20px_45px_-10px_rgb(0,0,0)] active:scale-[0.985] transition-all flex flex-col relative"
            >
              {isAdmin && (
                <div className="absolute top-3 right-3 z-10">
                  <AdminEditButton
                    iconOnly
                    label={t.edit || 'Edit'}
                    onClick={() => setEditingOffer(offer)}
                  />
                </div>
              )}
              {/* Game logo + name header */}
              <div className="flex items-center gap-2.5 mb-2.5">
                {game.logo_url && (
                  <img 
                    src={game.logo_url} 
                    alt="" 
                    className="w-7 h-7 object-contain rounded-sm flex-shrink-0 ring-1 ring-white/10 group-hover:ring-[var(--accent)]/30 transition-all" 
                  />
                )}
                <div className="text-xs font-medium text-[var(--text-sec)] truncate">
                  {lang === 'ar' ? game.name_ar : game.name_en}
                </div>
              </div>

              {/* Offer name */}
              <div className="font-bold text-base sm:text-lg leading-tight mb-1 line-clamp-2 flex-1">
                {lang === 'ar' ? offer.name_ar : offer.name_en}
              </div>

              {/* Region */}
              {offer.region && (
                <div className="text-[10px] text-[var(--text-sec)] mb-2.5">
                  {t.region}: {offer.region}
                </div>
              )}

              {/* Price section */}
              <div className="mt-auto pt-2 border-t border-[var(--border)]">
                {offer.is_sale && offer.original_price ? (
                  <div>
                    <div className="text-xs line-through text-[var(--text-sec)]">${parseFloat(offer.original_price).toFixed(2)}</div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-2xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
                      <div className="text-[9px] px-1.5 py-px bg-red-500/15 text-red-400 rounded font-medium tracking-wide">SALE</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-2xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); navigate(`/buy/${offer.id}`); }}
                  className="flex-1 btn btn-primary text-xs py-2 font-semibold active:scale-[0.985]"
                >
                  {lang === 'ar' ? 'اشترِ الآن' : 'Buy Now'}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); navigate(`/offer/${offer.id}`); }}
                  className="flex-1 btn btn-secondary text-xs py-2"
                >
                  {t.details || (lang==='ar' ? 'تفاصيل' : 'Details')}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-[var(--text-sec)] col-span-full">{t.noOffers}</div>
        )}
      </div>

      {isAdmin && editingGame && (
        <Suspense fallback={null}>
          <AdminGameEditModal
            game={game}
            lang={lang}
            t={t}
            onClose={() => setEditingGame(false)}
            onSave={updateGame}
          />
        </Suspense>
      )}
      {isAdmin && editingOffer && (
        <Suspense fallback={null}>
          <AdminOfferEditModal
            offer={editingOffer}
            games={games}
            lang={lang}
            t={t}
            onClose={() => setEditingOffer(null)}
            onSave={updateProduct}
          />
        </Suspense>
      )}
    </div>
  );
}

function OfferDetail({ games, offers, t = {}, lang, navigate, addToCart, user, updateProduct, updateGame }) {
  const { id } = useParams();
  const offer = offers.find((o) => String(o.id) === String(id));
  const game = offer ? games.find((g) => g.id === offer.game_id) : null;
  const isAdmin = user?.role === 'admin';
  const [editingOffer, setEditingOffer] = useState(false);
  const [editingGame, setEditingGame] = useState(false);

  if (!offer) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">{t.offerNotFound}</p>
        <button onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.backToHome}</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => (game ? navigate(`/game/${game.slug || game.id}`) : navigate('/'))}
          className="btn btn-secondary text-sm sm:text-base"
        >
          ← Back to {game ? (lang === 'ar' ? game.name_ar : game.name_en) : 'Game'}
        </button>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <AdminEditButton label={t.editOffer || 'Edit Offer'} onClick={() => setEditingOffer(true)} />
            {game && (
              <AdminEditButton label={t.editGame || 'Edit Game'} onClick={() => setEditingGame(true)} />
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden mb-8">
        <div className="relative h-64 md:h-80">
          {(offer.sale_image_url || offer.image_url) ? (
            <img
              src={offer.sale_image_url || offer.image_url}
              alt={lang === 'ar' ? offer.name_ar : offer.name_en}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : game?.image_url && (
            <img
              src={game.image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
          <div className="absolute bottom-0 p-8 w-full">
            <div className="text-sm opacity-75 mb-1">
              {game ? (lang === 'ar' ? game.name_ar : game.name_en) : ''}
            </div>
            <h1 className="text-4xl font-black">
              {lang === 'ar' ? offer.name_ar : offer.name_en}
            </h1>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Details */}
        <div className="md:col-span-1 card p-6 h-fit">
          <div>
            <div className="text-[var(--text-sec)] text-sm">{t.price}</div>
            {offer.is_sale && offer.original_price ? (
              <>
                <div className="text-sm line-through text-[var(--text-sec)]">${parseFloat(offer.original_price).toFixed(2)}</div>
                <div className="text-4xl sm:text-5xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
              </>
            ) : (
              <div className="text-4xl sm:text-5xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
            )}
            {offer.is_sale && <div className="text-[10px] mt-1 px-2 py-0.5 bg-red-500/10 text-red-400 rounded inline-block">{t.sale}</div>}
          </div>

          {offer.amount && (
            <div className="mt-6">
              <div className="text-[var(--text-sec)] text-sm">{t.youReceive}</div>
              <div className="text-2xl font-bold">{offer.amount} {game?.points_name || ''}</div>
            </div>
          )}

          {offer.region && (
            <div className="mt-6">
              <div className="text-[var(--text-sec)] text-sm">{t.region}</div>
              <div className="font-medium">{offer.region}</div>
            </div>
          )}
          {Array.isArray(game?.servers) && game.servers.length > 0 && (
            <div className="mt-4">
              <div className="text-[var(--text-sec)] text-sm">{t.availableServers || 'Available Servers'}</div>
              <div className="text-sm">{game.servers.join(', ')}</div>
            </div>
          )}

          <div className="flex flex-col gap-3 mt-6 sm:mt-8">
            <button
              onClick={() => navigate(`/buy/${offer.id}`)}
              className="btn btn-primary w-full py-3.5 sm:py-4 text-base sm:text-lg font-black"
            >
              {lang === 'ar' ? 'اشترِ الآن' : 'Buy Now'}
            </button>
            <button
              onClick={(e) => addToCart(offer, e)}
              className="btn btn-secondary w-full py-3 text-sm"
            >
              {t.addToCart}
            </button>
          </div>
        </div>

        {/* Description + How to Apply */}
        <div className="md:col-span-2 space-y-8">
          <div className="card p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="font-bold text-xl">{t.description}</h3>
              {isAdmin && (
                <AdminEditButton
                  label={t.edit || 'Edit'}
                  onClick={() => setEditingOffer(true)}
                />
              )}
            </div>
            <p className="text-[var(--text-sec)] leading-relaxed">
              {lang === 'ar' ? offer.description_ar : offer.description_en || t.instantDeliveryNote}
            </p>
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-xl mb-4">{t.howToApply}</h3>
            <div className="space-y-3 text-[var(--text-sec)]">
              {game?.slug === 'valorant' && (
                <>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">1.</span> Go to the Valorant store in-game.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">2.</span> Click on the store currency (VP) purchase option.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">3.</span> Choose the matching amount and region.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">4.</span> Use the redeem code or UID we send you after purchase.</div>
                </>
              )}
              {game?.slug === 'league-of-legends' && (
                <>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">1.</span> Log into your Riot account on the official website.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">2.</span> Go to the RP purchase page.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">3.</span> Select the amount and enter the code we provide.</div>
                </>
              )}
              {game?.slug === 'pubg-mobile' && (
                <>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">1.</span> Open PUBG Mobile and go to the Store.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">2.</span> Tap on UC purchase.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">3.</span> Use the redeem code or link the UID we send.</div>
                </>
              )}
              {game?.slug === 'mobile-legends' && (
                <>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">1.</span> Open Mobile Legends: Bang Bang.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">2.</span> Tap your profile icon (top left).</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">3.</span> Go to "Redeem" or provide your User ID + Server ID.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">4.</span> Enter the code or use the top-up link we send after purchase.</div>
                </>
              )}
              {!['valorant', 'league-of-legends', 'pubg-mobile', 'mobile-legends'].includes(game?.slug) && (
                <div>{t.useCode || (lang === 'ar' ? 'استخدم الكود أو الـ UID الذي نرسله لك بعد الشراء في المتجر داخل اللعبة.' : 'Use the code or UID we send you after purchase in the in-game store.')}</div>
              )}
              <div className="pt-2 text-sm text-[var(--text-muted)]">{t.instantDeliveryNote}</div>
            </div>
          </div>
        </div>
      </div>

      {isAdmin && editingOffer && (
        <Suspense fallback={null}>
          <AdminOfferEditModal
            offer={offer}
            games={games}
            lang={lang}
            t={t}
            onClose={() => setEditingOffer(false)}
            onSave={updateProduct}
          />
        </Suspense>
      )}
      {isAdmin && editingGame && game && (
        <Suspense fallback={null}>
          <AdminGameEditModal
            game={game}
            lang={lang}
            t={t}
            onClose={() => setEditingGame(false)}
            onSave={updateGame}
          />
        </Suspense>
      )}
    </div>
  );
}

// Note: Run this in Supabase SQL if not already:
// ALTER TABLE public.games ADD COLUMN IF NOT EXISTS redemption_method text DEFAULT 'both';

function SuccessView({ navigate, games = [], t = {}, lang = 'ar' }) {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const { data: order } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        const { data: items } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);

        setOrderDetails(order);
        setOrderItems(items || []);
      } catch (err) {
        console.error('Fetch order error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <p className="text-[var(--text-sec)]">{lang === 'ar' ? 'جاري تحميل تفاصيل الطلب...' : 'Loading order details...'}</p>
      </div>
    );
  }

  if (!orderDetails) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <p className="text-xl text-[var(--text-sec)]">{t.orderNotFound || (lang === 'ar' ? 'الطلب غير موجود.' : 'Order not found.')}</p>
        <button onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.backToHome || 'Back to Home'}</button>
      </div>
    );
  }

  // Determine redemption type based on player_uid presence (from BuyView)
  const firstItem = orderItems[0] || {};
  const playerUid = firstItem.player_uid;
  const playerServer = firstItem.player_server;
  const hasUid = !!playerUid;

  const demoCode = hasUid ? null : `CODE-${orderId.slice(0, 8).toUpperCase()}`;
  const isArabic = lang === 'ar';

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-3xl font-black mb-2">
          {isArabic ? 'تمت عملية الشراء بنجاح!' : 'Purchase Successful!'}
        </h1>
        <p className="text-[var(--text-sec)]">
          {isArabic ? 'تم تسجيل طلبك بنجاح في قاعدة البيانات.' : 'Your order has been recorded successfully.'}
        </p>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-xl mb-4">{isArabic ? 'معلومات الطلب' : 'Order Information'}</h2>
        <div className="space-y-2 text-sm">
          <div><span className="text-[var(--text-muted)]">{isArabic ? 'رقم الطلب' : 'Order ID'}:</span> <span className="font-mono">{orderDetails.id}</span></div>
          <div><span className="text-[var(--text-muted)]">{isArabic ? 'الإجمالي' : 'Total'}:</span> ${parseFloat(orderDetails.total).toFixed(2)}</div>
          <div><span className="text-[var(--text-muted)]">{isArabic ? 'طريقة الدفع' : 'Payment Method'}:</span> {orderDetails.payment_method === 'balance' ? (t.payFromBalance || 'رصيد الحساب') : orderDetails.payment_method}</div>
          <div><span className="text-[var(--text-muted)]">{isArabic ? 'التاريخ' : 'Date'}:</span> {new Date(orderDetails.created_at).toLocaleString()}</div>
          <div><span className="text-[var(--text-muted)]">{isArabic ? 'الحالة' : 'Status'}:</span> <span className="capitalize text-emerald-400">{orderDetails.status || 'completed'}</span></div>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-xl mb-4">{isArabic ? 'العناصر المشتراة' : 'Items Purchased'}</h2>
        {orderItems.length > 0 ? (
          <div className="space-y-2">
            {orderItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-[var(--border)] last:border-0">
                <span>{item.name_snapshot}</span>
                <span className="font-mono">${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--text-sec)]">{isArabic ? 'لا توجد عناصر.' : 'No items.'}</p>
        )}

        {/* Player UID info - always show if present */}
        {hasUid && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="text-sm font-semibold mb-2 text-emerald-400">
              {isArabic ? 'تم الشحن إلى حسابك في اللعبة' : 'Top-up sent to your in-game account'}
            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{isArabic ? 'UID:' : 'UID:'}</span>{' '}
              <span className="font-mono text-[var(--accent)] text-lg">{playerUid}</span>
              {playerServer && (
                <>
                  {' • '}<span className="text-[var(--text-muted)]">{isArabic ? 'السيرفر' : 'Server'}:</span>{' '}
                  <span className="font-mono">{playerServer}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Redeem Code Section - ONLY for redeem_code purchases */}
      {!hasUid && demoCode && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-xl mb-4">
            {isArabic ? 'كود الشحن الخاص بك' : 'Your Redeem Code'}
          </h2>
          <div className="bg-[var(--bg-primary)] p-6 rounded-xl text-center mb-4">
            <div className="text-4xl font-mono tracking-widest text-[var(--accent)] mb-2">{demoCode}</div>
            <p className="text-xs text-[var(--text-muted)]">
              {isArabic ? '(كود تجريبي - في الإصدار الفعلي سيأتي من API الشراء)' : '(Demo code - will come from real purchase API in production)'}
            </p>
          </div>
          <p className="text-[var(--text-sec)] text-sm">
            {isArabic 
              ? 'استخدم هذا الكود في اللعبة. تعتمد خطوات الاسترداد الدقيقة على طريقة استرداد اللعبة.'
              : 'Use this code in the game. Exact top-up steps depend on the game.'}
          </p>
        </div>
      )}

      {/* UID Only Success - no redeem code shown */}
      {hasUid && (
        <div className="card p-6 mb-6 text-center">
          <h2 className="font-bold text-xl mb-3 text-emerald-400">
            {isArabic ? 'تم إرسال الشحن بنجاح!' : 'Top-up Sent Successfully!'}
          </h2>
          <p className="text-[var(--text-sec)]">
            {isArabic 
              ? 'تم إرسال العملات / النقاط إلى UID الخاص بك المذكور أعلاه.'
              : 'The game coins / points have been (or will be) sent to the UID above.'}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {isArabic ? 'عادةً يصل الشحن خلال ثوانٍ إلى دقائق.' : 'Usually arrives within seconds to minutes.'}
          </p>
        </div>
      )}

      <div className="text-center">
        <button onClick={() => navigate('/')} className="btn btn-primary px-8 py-3">
          {isArabic ? 'العودة إلى الرئيسية' : 'Back to Home'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasShownLoginToast = useRef(false);
  const cartIconRef = useRef(null);

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
  const [paymentConfig, setPaymentConfig] = useState({
    shamcash: true,
    binance: false,
    mastercard: false,
    shamcashMerchantName: 'ECHOCORE Store',
    shamcashConfigured: false,
  });
  const [homeLayout, setHomeLayout] = useState(DEFAULT_HOME_LAYOUT);
  const [notification, setNotification] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [flyingItems, setFlyingItems] = useState([]);
  const [adminEditOffer, setAdminEditOffer] = useState(null);
  const [adminEditGame, setAdminEditGame] = useState(null);
  const [adminCarouselOpen, setAdminCarouselOpen] = useState(false);
  const [langSwitching, setLangSwitching] = useState(false);
  const [overlayLang, setOverlayLang] = useState(() => {
    const saved = localStorage.getItem('echocore-lang');
    return saved === 'en' || saved === 'ar' ? saved : 'ar';
  });
  const [routeLoading, setRouteLoading] = useState(null);
  const routeLoadingStartedAt = useRef(0);
  const isAdmin = user?.role === 'admin';

  const t = translations[lang];

  const navigateWithFeedback = (path, message) => {
    routeLoadingStartedAt.current = Date.now();
    setRouteLoading({
      path,
      message: message || (lang === 'ar' ? 'جاري فتح الصفحة...' : 'Opening page...'),
    });
    navigate(path);
  };

  const openGame = (game) => {
    if (!game) return;
    const name = lang === 'ar' ? game.name_ar : game.name_en;
    navigateWithFeedback(
      `/game/${game.slug || game.id}`,
      lang === 'ar' ? `جاري فتح ${name}...` : `Opening ${name}...`,
    );
  };

  useEffect(() => {
    if (!routeLoading) return undefined;

    const targetPath = routeLoading.path.split('?')[0];
    if (location.pathname !== targetPath) return undefined;

    const elapsed = Date.now() - routeLoadingStartedAt.current;
    const remaining = Math.max(280, 520 - elapsed);
    const timer = window.setTimeout(() => setRouteLoading(null), remaining);
    return () => window.clearTimeout(timer);
  }, [location.pathname, routeLoading, loadingGames]);

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
  const fetchGames = async () => {
    setLoadingGames(true);
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

  // Helper to refresh data after auth (must be after fetch functions)
  const refreshDataAfterAuth = () => {
    fetchGames();
    fetchOffers();
    fetchOrders();
  };

  // ============================================
  // REAL AUTH WITH SUPABASE
  // ============================================
  const handleAuthLogin = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(t.authError || 'Invalid credentials');

    // Explicitly fetch fresh session after sign in to avoid timing issues with listeners
    const { data: { session } } = await supabase.auth.getSession();
    const authUser = session?.user;
    if (!authUser) throw new Error('Login succeeded but failed to retrieve user session');

    const profile = await getUserProfile(authUser.id);

    // If no profile exists (e.g. trigger didn't run), create one
    let finalProfile = profile;
    if (!profile) {
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          id: authUser.id,
          role: 'user',
          name: authUser.email.split('@')[0],
          balance: 0
        })
        .select()
        .single();
      finalProfile = newProfile;
    }

    const userData = {
      id: authUser.id,
      email: authUser.email,
      name: finalProfile?.name || authUser.email.split('@')[0],
      role: finalProfile?.role || 'user',
      balance: finalProfile?.balance || 0,
    };
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
        const profile = await getUserProfile(data.user.id);
        const userData = {
          id: data.user.id,
          email: data.user.email,
          name: profile?.name || data.user.email.split('@')[0],
          role: profile?.role || 'user',
          balance: profile?.balance || 0,
        };
        return { success: true, autoLogin: true, userData };
      }
    }

    return { success: true, message: 'Check your email to confirm your account (if required by your Supabase settings).' };
  };

  // ============================================
  // REAL ORDER — saves to Supabase
  // Supports paying with external methods or 'balance'
  // ============================================
  const submitOrder = async (currentCart, paymentMethod) => {
    if (!user?.id) throw new Error('Not logged in');

    const total = currentCart.reduce((sum, item) => sum + parseFloat(item.price), 0);

    // If paying with balance: deduct first (server-side ideally via RPC)
    if (paymentMethod === 'balance') {
      const currentBal = user.balance || 0;
      if (currentBal < total) {
        throw new Error(t.insufficientBalance || 'Insufficient balance');
      }

      // Deduct on profiles
      const newBal = (currentBal - total);
      const { error: balErr } = await supabase
        .from('profiles')
        .update({ balance: newBal })
        .eq('id', user.id);
      if (balErr) throw new Error('Failed to deduct balance');

      // Record transaction (negative amount)
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'purchase',
        amount: -total,
        balance_after: newBal,
        payment_method: 'balance',
        reference: null,
        status: 'completed'
      });

      // Update local user
      setUser(prev => prev ? { ...prev, balance: newBal } : prev);
    }

    // Create order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        total: total,
        payment_method: paymentMethod,
        status: 'completed'
      })
      .select()
      .single();

    if (orderErr) {
      console.error(orderErr);
      throw new Error('Failed to create order');
    }

    // Insert items
    const items = currentCart.map((item) => ({
      order_id: order.id,
      offer_id: item.id,
      name_snapshot: lang === 'ar' ? item.name_ar : item.name_en,
      price: parseFloat(item.price),
      quantity: 1
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(items);
    if (itemsErr) console.error('Order items error:', itemsErr);

    return { orderId: order.id };
  };

  // ============================================
  // BALANCE RECHARGE (simulated APIs — see comments)
  // ============================================
  const handleRecharge = async (amount, method, reference = null) => {
    if (!user?.id) throw new Error('Not logged in');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) throw new Error('Invalid amount');

    const currentBal = user.balance || 0;
    const newBal = currentBal + amt;

    // Update profile balance
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ balance: newBal })
      .eq('id', user.id);
    if (upErr) {
      console.error(upErr);
      throw new Error('Failed to credit balance');
    }

    // Insert transaction record (positive for recharge)
    const { error: txErr } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'recharge',
      amount: amt,
      balance_after: newBal,
      payment_method: method,
      reference: reference || null,
      status: 'completed'
    });
    if (txErr) console.error('Transaction insert error:', txErr);

    // Update local user state
    const updatedUser = { ...user, balance: newBal };
    setUser(updatedUser);

    showNotification(`${t.rechargeSuccess || 'Balance recharged!'} +$${amt.toFixed(2)}`);

    // Return new balance so RechargeView can react
    return { newBalance: newBal, reference };
  };

  // ============================================
  // INSTANT PURCHASE (Buy Now) — with player UID info
  // ============================================
  const submitPurchase = async (offer, paymentMethod, playerInfo = {}) => {
    if (!user?.id) throw new Error('Not logged in');
    if (!offer) throw new Error('No offer');

    const amount = parseFloat(offer.price);
    const { player_uid = null, player_server = null } = playerInfo;

    // Balance path
    if (paymentMethod === 'balance') {
      const currentBal = user.balance || 0;
      if (currentBal < amount) throw new Error(t.insufficientBalance || 'Insufficient balance');

      const newBal = currentBal - amount;

      const { error: balErr } = await supabase
        .from('profiles')
        .update({ balance: newBal })
        .eq('id', user.id);
      if (balErr) throw new Error('Failed to deduct balance');

      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'purchase',
        amount: -amount,
        balance_after: newBal,
        payment_method: 'balance',
        reference: null,
        status: 'completed'
      });

      setUser(prev => prev ? { ...prev, balance: newBal } : prev);
    }

    // Create order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        total: amount,
        payment_method: paymentMethod,
        status: 'completed'
      })
      .select()
      .single();

    if (orderErr) {
      console.error(orderErr);
      throw new Error('Failed to create order');
    }

    // Single order item + player redemption info
    const itemPayload = {
      order_id: order.id,
      offer_id: offer.id,
      name_snapshot: lang === 'ar' ? offer.name_ar : offer.name_en,
      price: amount,
      quantity: 1,
      player_uid: player_uid || null,
      player_server: player_server || null
    };

    const { error: itemErr } = await supabase.from('order_items').insert(itemPayload);
    if (itemErr) console.error('Item insert error:', itemErr);

    return { orderId: order.id };
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
  };

  const deleteProduct = async (productId) => {
    const { error } = await supabase
      .from('offers')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error(error);
      alert('Delete failed. Are you admin?');
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
      alert(err.message);
    }
  };

  // ============================================
  // AUTH STATE LISTENER (real Supabase)
  // ============================================
  useEffect(() => {
    // IMPORTANT: Handle Supabase email confirmation / signup redirect tokens
    // They come as #access_token=...&type=signup in the URL hash
    const handleAuthHash = async () => {
      const hash = window.location.hash;
      if (hash.includes('access_token')) {
        // Let Supabase client parse the tokens from hash into a session
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const profile = await getUserProfile(session.user.id);
          const userData = {
            id: session.user.id,
            email: session.user.email,
            name: profile?.name || session.user.email.split('@')[0],
            role: profile?.role || 'user',
            balance: profile?.balance || 0
          };
          setUser(userData);

          // For confirmation links we can safely navigate to home (respects router basename)
          navigate('/', { replace: true });

          // Only show the welcome toast once (for magic links / email confirm)
          if (!hasShownLoginToast.current) {
            hasShownLoginToast.current = true;
            showNotification(t.loginSuccess || 'Welcome back!');
          }

          // Refresh data
          refreshDataAfterAuth();
        }
      }
    };

    // Run hash handling first (special redirect case)
    handleAuthHash();

    // Initial session check — completely silent (no toast, no forced navigation to home)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await getUserProfile(session.user.id);
        const userData = {
          id: session.user.id,
          email: session.user.email,
          name: profile?.name || session.user.email.split('@')[0],
          role: profile?.role || 'user',
          balance: profile?.balance || 0
        };
        setUser(userData);
        // Fetch orders now that we have a proper authenticated session (RLS protected)
        fetchOrders();
      }
      setLoadingAuth(false);
    });

    // Listen for auth changes.
    // We ONLY sync the user here.
    // We do NOT navigate or show "تم تسجيل الدخول بنجاح" because
    // Supabase can emit SIGNED_IN / INITIAL_SESSION when you switch tabs/windows.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await getUserProfile(session.user.id);
        const userData = {
          id: session.user.id,
          email: session.user.email,
          name: profile?.name || session.user.email.split('@')[0],
          role: profile?.role || 'user',
          balance: profile?.balance || 0
        };
        setUser(userData);

        // Fetch protected data like orders (in case this is a session restore on tab focus etc.)
        fetchOrders();

        // IMPORTANT: removed navigate + showNotification from here
        // to prevent resetting to homepage + toast on tab focus/return.
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        hasShownLoginToast.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, [t]);

  const refreshPaymentConfig = async () => {
    const config = await fetchPaymentMethods();
    setPaymentConfig(config);
  };

  const refreshSiteTheme = async (overrides) => {
    if (overrides) {
      applyTheme(normalizeThemeOverrides(overrides));
      return;
    }
    const theme = await fetchSiteTheme();
    if (theme) {
      applyTheme(normalizeThemeOverrides(theme));
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

  // Load games, offers and orders
  useEffect(() => {
    fetchGames();
    fetchOffers();
    fetchOrders();
    refreshPaymentConfig();
    refreshSiteTheme();
    refreshHomeLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist cart (simple universal localStorage)
  useEffect(() => {
    const saved = localStorage.getItem('echocore-cart');
    if (saved) setCart(JSON.parse(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('echocore-cart', JSON.stringify(cart));
  }, [cart]);

  // Load orders when the admin dashboard becomes visible (as admin)
  useEffect(() => {
    if (location.pathname === '/dashboard' && user?.role === 'admin') {
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.role]);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3200);
  };

  const addToCart = (product, e = null) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setCart(prev => [...prev, product]);
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

  const removeCartItem = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // Called by LoginView after successful Supabase auth
  const handleLoginSuccess = (userData) => {
    setUser(userData);
    navigate('/');
    // Only show login toast once per actual login action
    if (!hasShownLoginToast.current) {
      hasShownLoginToast.current = true;
      showNotification(t.loginSuccess);
    }
    // Refresh data now that we're authenticated
    refreshDataAfterAuth();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
      <LangSwitchOverlay lang={overlayLang} active={langSwitching} />
      <RouteNavigationIndicator
        active={!!routeLoading && !langSwitching}
        message={routeLoading?.message}
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
      />

      <main className="container mx-auto px-3 sm:px-4 pb-20 sm:pb-24 max-w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${location.pathname}-${lang}`}
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.98 }}
            transition={{
              duration: langSwitching ? 0.34 : 0.38,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <Suspense fallback={<PageLoader lang={lang} />}>
            <Routes location={location}>
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
                    onSelectOffer={(offer) => navigate(`/offer/${offer.id}`)}
                    onBuyNow={(offer) => navigate(`/buy/${offer.id}`)}
                    onEditOffer={isAdmin ? setAdminEditOffer : undefined}
                    onEditGame={isAdmin ? setAdminEditGame : undefined}
                    onManageCarousel={isAdmin ? () => setAdminCarouselOpen(true) : undefined}
                    onMoveCarouselGame={isAdmin ? moveCarouselGame : undefined}
                    isAdmin={isAdmin}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    homeLayout={homeLayout}
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
                onSelectOffer={(offer) => navigate(`/offer/${offer.id}`)}
                onBuyNow={(offer) => navigate(`/buy/${offer.id}`)}
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
              <ContactView t={t} lang={lang} />
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
              />
            }
          />

          {/* Dynamic Offer page */}
          <Route
            path="/offer/:id"
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
              />
            }
          />

          <Route
            path="/login"
            element={
              <LoginView
                t={t}
                handleAuthLogin={handleAuthLogin}
                handleAuthSignup={handleAuthSignup}
                onLoginSuccess={handleLoginSuccess}
              />
            }
          />

          <Route
            path="/cart"
            element={
              <CartView
                t={t}
                lang={lang}
                cart={cart}
                getCartTotal={getCartTotal}
                onRemoveItem={removeCartItem}
                onCheckout={() => navigate('/checkout')}
              />
            }
          />

          <Route
            path="/checkout"
            element={
              <CheckoutView
                t={t}
                lang={lang}
                cart={cart}
                submitOrder={submitOrder}
                onComplete={handleCheckoutComplete}
                currentBalance={user?.balance || 0}
                paymentConfig={paymentConfig}
              />
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
              <RechargeView
                t={t}
                lang={lang}
                navigate={navigate}
                user={user}
                currentBalance={user?.balance || 0}
                onRechargeComplete={handleRecharge}
                paymentConfig={paymentConfig}
              />
            }
          />

          {/* Instant Buy + UID entry page */}
          <Route
            path="/buy/:offerId"
            element={
              <BuyView
                t={t}
                lang={lang}
                navigate={navigate}
                user={user}
                games={games}
                offers={offers}
                currentBalance={user?.balance || 0}
                onPurchase={submitPurchase}
                paymentConfig={paymentConfig}
              />
            }
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

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </motion.div>
        </AnimatePresence>
      </main>

      {/* Flying to cart animations */}
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
        <Suspense fallback={null}>
          <AdminOfferEditModal
            offer={adminEditOffer}
            games={games}
            lang={lang}
            t={t}
            onClose={() => setAdminEditOffer(null)}
            onSave={updateProduct}
          />
        </Suspense>
      )}

      {isAdmin && adminEditGame && (
        <Suspense fallback={null}>
          <AdminGameEditModal
            game={adminEditGame}
            lang={lang}
            t={t}
            onClose={() => setAdminEditGame(null)}
            onSave={updateGame}
          />
        </Suspense>
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
        <div className="fixed bottom-8 right-8 left-8 sm:left-auto sm:w-80 toast text-white px-6 py-4 rounded-2xl flex items-center gap-3 z-50 animate-bounce">
          <CheckCircle className="text-[var(--accent)] w-6 h-6" /> <span className="font-bold">{notification}</span>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .cart-bump {
          animation: cartPop 0.45s ease;
        }
        @keyframes cartPop {
          0% { transform: scale(1); }
          30% { transform: scale(1.35); }
          60% { transform: scale(0.9); }
          100% { transform: scale(1); }
        }

        .flying-item {
          position: fixed;
          z-index: 99999;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          font-size: 11px;
          padding: 4px 8px;
          white-space: nowrap;
          overflow: hidden;
        }

        .lang-switch-progress-bar {
          width: 35%;
          animation: langSwitchProgress 0.9s ease-in-out infinite;
        }

        @keyframes langSwitchProgress {
          0% { transform: translateX(-120%); }
          50% { transform: translateX(180%); }
          100% { transform: translateX(320%); }
        }
      ` }} />
    </div>
  );
}
