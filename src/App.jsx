import { useState, useEffect, useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase, getUserProfile } from './lib/supabase';
import { translations } from './data/translations';
import { Routes, Route, useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import HomeView from './components/HomeView';
import ProductView from './components/ProductView';
import LoginView from './components/LoginView';
import CartView from './components/CartView';
import CheckoutView from './components/CheckoutView';
import AdminView from './components/AdminView';

// Standalone route page components (receive data via props)
function GameDetail({ games, offers, lang, navigate, addToCart }) {
  const { slug } = useParams();
  const game = games.find((g) => (g.slug || g.id) === slug) || games.find((g) => g.id === slug);

  if (!game) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">Game not found.</p>
        <button onClick={() => navigate('/')} className="btn btn-secondary mt-4">Back to Home</button>
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
          </div>
        </div>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Available Offers</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {gameOffers.length > 0 ? (
          gameOffers.map((offer) => (
            <div
              key={offer.id}
              onClick={() => navigate(`/offer/${offer.id}`)}
              className="card p-4 sm:p-5 cursor-pointer group hover:shadow-[0_25px_50px_-12px_rgb(0,0,0)] active:scale-[0.985] transition-all"
            >
              <div className="font-bold text-base sm:text-lg mb-1">
                {lang === 'ar' ? offer.name_ar : offer.name_en}
              </div>
              {offer.region && <div className="text-xs text-[var(--text-sec)] mb-3">Region: {offer.region}</div>}
              {offer.is_sale && offer.original_price ? (
                <div className="mt-auto">
                  <div className="text-sm line-through text-[var(--text-sec)]">${parseFloat(offer.original_price).toFixed(2)}</div>
                  <div className="text-2xl sm:text-3xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
                  <div className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded mt-1 inline-block">SALE</div>
                </div>
              ) : (
                <div className="text-2xl sm:text-3xl font-black text-[var(--accent)] mt-auto">
                  ${parseFloat(offer.price).toFixed(2)}
                </div>
              )}
              <div className="mt-4 text-sm text-[var(--text-sec)]">Click for details &amp; how to apply</div>
            </div>
          ))
        ) : (
          <div className="text-[var(--text-sec)] col-span-full">No offers yet for this game.</div>
        )}
      </div>
    </div>
  );
}

function OfferDetail({ games, offers, lang, navigate, addToCart }) {
  const { id } = useParams();
  const offer = offers.find((o) => String(o.id) === String(id));
  const game = offer ? games.find((g) => g.id === offer.game_id) : null;

  if (!offer) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">Offer not found.</p>
        <button onClick={() => navigate('/')} className="btn btn-secondary mt-4">Back to Home</button>
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
            <div className="text-[var(--text-sec)] text-sm">Price</div>
            {offer.is_sale && offer.original_price ? (
              <>
                <div className="text-sm line-through text-[var(--text-sec)]">${parseFloat(offer.original_price).toFixed(2)}</div>
                <div className="text-4xl sm:text-5xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
              </>
            ) : (
              <div className="text-4xl sm:text-5xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
            )}
            {offer.is_sale && <div className="text-[10px] mt-1 px-2 py-0.5 bg-red-500/10 text-red-400 rounded inline-block">SALE</div>}
          </div>

          {offer.amount && (
            <div className="mt-6">
              <div className="text-[var(--text-sec)] text-sm">You Receive</div>
              <div className="text-2xl font-bold">{offer.amount} {game?.points_name || ''}</div>
            </div>
          )}

          {offer.region && (
            <div className="mt-6">
              <div className="text-[var(--text-sec)] text-sm">Region</div>
              <div className="font-medium">{offer.region}</div>
            </div>
          )}

          <button
            onClick={() => addToCart(offer)}
            className="btn btn-primary w-full mt-6 sm:mt-8 py-3.5 sm:py-4 text-base sm:text-lg"
          >
            Add to Cart
          </button>
        </div>

        {/* Description + How to Apply */}
        <div className="md:col-span-2 space-y-8">
          <div className="card p-6">
            <h3 className="font-bold text-xl mb-4">Description</h3>
            <p className="text-[var(--text-sec)] leading-relaxed">
              {lang === 'ar' ? offer.description_ar : offer.description_en || 'High quality top-up delivered instantly after purchase.'}
            </p>
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-xl mb-4">How to Apply / Redeem</h3>
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
                <div>Use the code or UID we send you after purchase in the in-game store.</div>
              )}
              <div className="pt-2 text-sm text-[var(--text-muted)]">Instant delivery. Code is sent to your email and shown in your account after successful payment.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasShownLoginToast = useRef(false);

  const [lang, setLang] = useState('ar');
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

  const t = translations[lang];

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
          name: authUser.email.split('@')[0]
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
        name: name || email.split('@')[0]
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
        };
        return { success: true, autoLogin: true, userData };
      }
    }

    return { success: true, message: 'Check your email to confirm your account (if required by your Supabase settings).' };
  };

  // ============================================
  // REAL ORDER — saves to Supabase
  // ============================================
  const submitOrder = async (currentCart, paymentMethod) => {
    if (!user?.id) throw new Error('Not logged in');

    const total = currentCart.reduce((sum, item) => sum + parseFloat(item.price), 0);

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
            role: profile?.role || 'user'
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
          role: profile?.role || 'user'
        };
        setUser(userData);
        // Fetch orders now that we have a proper authenticated session (RLS protected)
        fetchOrders();
      }
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
          role: profile?.role || 'user'
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

  const addToCart = (product) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setCart(prev => [...prev, product]);
    showNotification(t.addMsg);
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
    navigate('/');
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
        onLangToggle={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        user={user}
        cartLength={cart.length}
        onLogout={handleLogout}
        navigate={navigate}
      />

      <main className="container mx-auto px-4 pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.15, 
              ease: [0.22, 1.0, 0.36, 1] 
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
                cart={cart}
                submitOrder={submitOrder}
                onComplete={handleCheckoutComplete}
              />
            }
          />

          <Route
            path="/dashboard"
            element={
              user?.role === 'admin' ? (
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

      <footer className="border-t border-[var(--border)] bg-[var(--bg-elevated)] py-8 text-center text-[var(--text-muted)]">
        <div className="w-8 h-8 mx-auto opacity-50 grayscale mb-4"></div>
        <p>© 2026 ECHOCORE Store. All rights reserved.</p>
      </footer>

      {notification && (
        <div className="fixed bottom-8 right-8 left-8 sm:left-auto sm:w-80 toast text-white px-6 py-4 rounded-2xl flex items-center gap-3 z-50 animate-bounce">
          <CheckCircle className="text-[var(--accent)] w-6 h-6" /> <span className="font-bold">{notification}</span>
        </div>
      )}

      {/* Font import only — theme lives in src/index.css */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800;900&display=swap');
      ` }} />
    </div>
  );
}
