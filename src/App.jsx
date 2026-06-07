import React, { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { mockProductsDB } from './data/mockProducts';
import { translations } from './data/translations';
import Header from './components/Header';
import HomeView from './components/HomeView';
import ProductView from './components/ProductView';
import LoginView from './components/LoginView';
import CartView from './components/CartView';
import CheckoutView from './components/CheckoutView';
import AdminView from './components/AdminView';

export default function App() {
  const [lang, setLang] = useState('ar');
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [notification, setNotification] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const t = translations[lang];

  const fetchProducts = async () => {
    setProducts(mockProductsDB);
  };

  const handleAuthLogin = async (email, password) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (email === 'admin@ex.com' && password === 'admin') {
          resolve({ role: 'admin', name: 'مدير النظام' });
        } else if (email.includes('@') && password.length >= 3) {
          resolve({ role: 'user', name: email.split('@')[0] });
        } else {
          reject(new Error(t.authError));
        }
      }, 500);
    });
  };

  const submitOrder = async (cartItems, paymentMethod) => {
    return new Promise((resolve) => setTimeout(resolve, 800));
  };

  const createProduct = async (productData) => {
    const newProd = { ...productData, id: Date.now(), price: parseFloat(productData.price) };
    setProducts([newProd, ...products]);
  };

  const deleteProduct = async (productId) => {
    setProducts(products.filter((p) => p.id !== productId));
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const addToCart = (product) => {
    if (!user) {
      setCurrentView('login');
      return;
    }
    setCart([...cart, product]);
    showNotification(t.addMsg);
  };

  const getCartTotal = () => cart.reduce((total, item) => total + parseFloat(item.price), 0).toFixed(2);

  const removeCartItem = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setCurrentView('home');
    showNotification(t.loginSuccess);
  };

  const handleCheckoutComplete = () => {
    setCart([]);
    setCurrentView('home');
    showNotification(t.successMsg);
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('home');
  };

  return (
    <div className={`min-h-screen bg-[#040812] font-sans text-slate-200 selection:bg-cyan-500/30 ${lang === 'ar' ? 'dir-rtl' : 'dir-ltr'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Header
        t={t}
        lang={lang}
        onLangToggle={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        user={user}
        cartLength={cart.length}
        onLogout={handleLogout}
        onNavigate={(view) => setCurrentView(view)}
      />

      <main className="container mx-auto px-4 pb-24">
        {currentView === 'home' && (
          <HomeView
            t={t}
            lang={lang}
            products={products}
            searchQuery={searchQuery}
            selectedCategory={selectedCategory}
            setSearchQuery={setSearchQuery}
            setSelectedCategory={setSelectedCategory}
            onSelectProduct={(product) => {
              setSelectedProduct(product);
              setCurrentView('product');
            }}
            addToCart={addToCart}
          />
        )}
        {currentView === 'product' && (
          <ProductView
            t={t}
            lang={lang}
            selectedProduct={selectedProduct}
            onBack={() => setCurrentView('home')}
            addToCart={addToCart}
          />
        )}
        {currentView === 'login' && <LoginView t={t} handleAuthLogin={handleAuthLogin} onLoginSuccess={handleLoginSuccess} />}
        {currentView === 'cart' && <CartView t={t} lang={lang} cart={cart} getCartTotal={getCartTotal} onRemoveItem={removeCartItem} onCheckout={() => setCurrentView('checkout')} />}
        {currentView === 'checkout' && <CheckoutView t={t} cart={cart} submitOrder={submitOrder} onComplete={handleCheckoutComplete} />}
        {currentView === 'admin' && user?.role === 'admin' && <AdminView t={t} lang={lang} products={products} createProduct={createProduct} deleteProduct={deleteProduct} />}
      </main>

      <footer className="border-t border-slate-800 bg-[#060b19] py-8 text-center text-slate-500">
        <div className="w-8 h-8 mx-auto opacity-50 grayscale mb-4"></div>
        <p>© 2026 ECHOCORE Store. All rights reserved.</p>
      </footer>

      {notification && (
        <div className="fixed bottom-8 right-8 left-8 sm:left-auto sm:w-80 bg-[#0a1329] border border-cyan-500 shadow-[0_0_20px_rgba(34,211,238,0.3)] text-white px-6 py-4 rounded-2xl flex items-center gap-3 z-50 animate-bounce">
          <CheckCircle className="text-cyan-400 w-6 h-6" /> <span className="font-bold">{notification}</span>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800;900&display=swap');
        .dir-rtl { font-family: 'Cairo', sans-serif; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-pulse-slow { animation: pulseSlow 3s infinite alternate; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseSlow { from { filter: drop-shadow(0px 0px 5px rgba(34, 211, 238, 0.4)); transform: scale(1); } to { filter: drop-shadow(0px 0px 20px rgba(34, 211, 238, 0.8)); transform: scale(1.02); } }
        ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: #040812; } ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; } ::-webkit-scrollbar-thumb:hover { background: #0891b2; }
      ` }} />
    </div>
  );
}
