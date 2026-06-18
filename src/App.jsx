import { useState, useEffect, useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase, getUserProfile } from './lib/supabase';
import { translations } from './data/translations';
import { Routes, Route, useNavigate, useParams, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import HomeView from './components/HomeView';
import ProductView from './components/ProductView';
import LoginView from './components/LoginView';
import CartView from './components/CartView';
import CheckoutView from './components/CheckoutView';
import AdminView from './components/AdminView';
import Footer from './components/Footer';
import AllGamesView from './components/AllGamesView';
import SaleOffersView from './components/SaleOffersView';
import FAQView from './components/FAQView';
import HowItWorksView from './components/HowItWorksView';
import ContactView from './components/ContactView';
import RechargeView from './components/RechargeView';
import BuyView from './components/BuyView';

// Standalone route page components (receive data via props)
function GameDetail({ games, offers, t = {}, lang, navigate, addToCart }) {
  const { slug } = useParams();
  const game = games.find((g) => (g.slug || g.id) === slug) || games.find((g) => g.id === slug);

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
      <button onClick={() => navigate('/')} className="mb-4 sm:mb-6 btn btn-secondary text-sm sm:text-base">
        ← Back to Home
      </button>

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
              className="card p-4 sm:p-5 cursor-pointer group hover:border-[var(--accent)]/70 hover:shadow-[0_20px_45px_-10px_rgb(0,0,0)] active:scale-[0.985] transition-all flex flex-col"
            >
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
    </div>
  );
}

function OfferDetail({ games, offers, t = {}, lang, navigate, addToCart }) {
  const { id } = useParams();
  const offer = offers.find((o) => String(o.id) === String(id));
  const game = offer ? games.find((g) => g.id === offer.game_id) : null;

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
      <button
        onClick={() => (game ? navigate(`/game/${game.slug || game.id}`) : navigate('/'))}
        className="mb-4 sm:mb-6 btn btn-secondary text-sm sm:text-base"
      >
        ← Back to {game ? (lang === 'ar' ? game.name_ar : game.name_en) : 'Game'}
      </button>

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
            <h3 className="font-bold text-xl mb-4">{t.description}</h3>
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
  const [notification, setNotification] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [flyingItems, setFlyingItems] = useState([]);

  const t = translations[lang];

  const toggleLanguage = () => {
    const newLang = lang === 'ar' ? 'en' : 'ar';
    setLang(newLang);
    localStorage.setItem('echocore-lang', newLang);
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
        setGames(data || []);
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

    const { error } = await supabase
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
      })
      .eq('id', id);

    if (error) {
      console.error('Update game error:', error);
      throw new Error(`Failed to update game: ${error.message}`);
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

          // Clean the ugly token from the URL
          window.history.replaceState(null, document.title, window.location.pathname);

          // For confirmation links we can safely navigate to home
          navigate('/');

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

  // Load games, offers and orders
  useEffect(() => {
    fetchGames();
    fetchOffers();
    fetchOrders();
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
      className={`min-h-screen font-sans text-[var(--text-primary)] selection:bg-cyan-500/30 ${lang === 'ar' ? 'dir-rtl' : 'dir-ltr'}`} 
      style={{ backgroundColor: 'var(--bg-primary)' }}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <Header
        t={t}
        lang={lang}
        onLangToggle={toggleLanguage}
        user={user}
        cartLength={cart.length}
        onLogout={handleLogout}
        navigate={navigate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRecharge={() => navigate('/recharge')}
        cartRef={cartIconRef}
      />

      <main className="container mx-auto px-4 pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${location.pathname}-${lang}`}
            initial={{ opacity: 0, y: 32, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
              type: 'spring',
              stiffness: 260,
              damping: 18,
              mass: 0.9
            }}
          >
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
                    onSelectGame={(game) => navigate(`/game/${game.slug || game.id}`)}
                    onSelectOffer={(offer) => navigate(`/offer/${offer.id}`)}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
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
                onSelectGame={(game) => navigate(`/game/${game.slug || game.id}`)}
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

      {notification && (
        <div className="fixed bottom-8 right-8 left-8 sm:left-auto sm:w-80 toast text-white px-6 py-4 rounded-2xl flex items-center gap-3 z-50 animate-bounce">
          <CheckCircle className="text-[var(--accent)] w-6 h-6" /> <span className="font-bold">{notification}</span>
        </div>
      )}

      {/* Font import only — theme lives in src/index.css */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800;900&display=swap');

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
      ` }} />
    </div>
  );
}
