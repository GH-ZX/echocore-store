import { ShoppingCart, User, LogOut, Globe, ShieldCheck, Search, X, Menu, Home, Gamepad2, Flame, HelpCircle, BookOpen, Mail, Loader2, Wallet } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import EchoLogo from './EchoLogo';

const NAV_ITEMS = [
  { path: '/', icon: Home, labelKey: 'home', fallbackEn: 'Home', fallbackAr: 'الرئيسية' },
  { path: '/games', icon: Gamepad2, labelKey: 'allGames', fallbackEn: 'All Games', fallbackAr: 'جميع الألعاب' },
  { path: '/sale', icon: Flame, labelKey: 'saleOffers', fallbackEn: 'Sale Offers', fallbackAr: 'عروض الخصم' },
  { path: '/how', icon: BookOpen, labelKey: 'howItWorks', fallbackEn: 'How it Works', fallbackAr: 'كيف يعمل' },
  { path: '/faq', icon: HelpCircle, labelKey: 'faq', fallbackEn: 'FAQ', fallbackAr: 'الأسئلة الشائعة' },
  { path: '/contact', icon: Mail, labelKey: 'contact', fallbackEn: 'Contact', fallbackAr: 'اتصل بنا' },
];

const iconBtn = (extra = '') => `header-control header-control-icon ${extra}`.trim();

export default function Header({
  t,
  lang,
  onLangToggle,
  user,
  cartLength,
  onLogout,
  navigate,
  searchQuery = '',
  onSearchChange = () => {},
  onRecharge = () => {},
  cartRef = null,
  langSwitching = false,
}) {
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);

  const getNavLabel = (item) => {
    if (t[item.labelKey]) return t[item.labelKey];
    return lang === 'ar' ? item.fallbackAr : item.fallbackEn;
  };

  useEffect(() => {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleSearchToggle = () => {
    setIsSearchOpen((prev) => !prev);
  };

  const handleClear = () => {
    onSearchChange('');
    setIsSearchOpen(false);
  };

  const handleNav = (path) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  const handleLogoutClick = () => {
    setIsMenuOpen(false);
    onLogout();
  };

  const getInitials = (name, email) => {
    const source = (name || email || '?').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  };

  const cartButton = (extraClass = '') => (
    <button
      ref={cartRef}
      onClick={() => navigate('/cart')}
      className={iconBtn(`relative ${extraClass}`)}
      aria-label="Cart"
    >
      <ShoppingCart />
      {cartLength > 0 && (
        <span className="header-cart-badge">{cartLength}</span>
      )}
    </button>
  );

  const profileButton = (compact = false) => (
    <button
      type="button"
      onClick={() => { navigate('/profile'); setIsMenuOpen(false); }}
      className={`header-control header-control-pill group ${
        compact ? 'flex-1 min-w-0 !h-12 !min-h-12 !px-3' : 'pl-1.5 pr-3'
      }`}
      aria-label={t.myProfile || (lang === 'ar' ? 'ملفي الشخصي' : 'My Profile')}
    >
      <div className="header-avatar">
        {getInitials(user.name, user.email)}
      </div>
      <div className={`text-left leading-tight min-w-0 ${compact ? 'flex-1' : 'hidden lg:block'}`}>
        <div className="text-[10px] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
          {t.myProfile || (lang === 'ar' ? 'ملفي' : 'Profile')}
        </div>
        <div className="text-sm font-bold text-[var(--accent)] truncate max-w-[100px]">{user.name}</div>
      </div>
    </button>
  );

  const desktopActions = (
    <div className="header-actions">
      <div ref={searchRef} className="header-toolbar">
        <AnimatePresence mode="wait">
          {!isSearchOpen ? (
            <motion.button
              key="search-button"
              onClick={handleSearchToggle}
              className={iconBtn()}
              aria-label="Search for a game"
            >
              <Search />
            </motion.button>
          ) : (
            <motion.div
              key="search-field"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 22, mass: 0.85 }}
              className="header-search-field"
              style={{ minWidth: '170px' }}
            >
              <div className="pl-2.5 text-[var(--accent)]">
                <Search className="w-4 h-4" strokeWidth={2} />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={lang === 'ar' ? 'ابحث عن لعبة...' : 'Search games...'}
                className="w-[150px] md:w-[190px]"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsSearchOpen(false);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="header-search-btn"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="header-search-btn border-l border-[var(--border)] mr-0.5"
                aria-label="Close search"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!isSearchOpen && <span className="header-toolbar-divider" aria-hidden="true" />}

        <button
          onClick={onLangToggle}
          disabled={langSwitching}
          className={iconBtn()}
          aria-label={lang === 'ar' ? 'Switch to English' : 'Switch to Arabic'}
          aria-busy={langSwitching}
        >
          {langSwitching ? (
            <Loader2 className="animate-spin text-[var(--accent)]" />
          ) : (
            <motion.div
              key={lang}
              initial={{ rotate: -120, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            >
              <Globe />
            </motion.div>
          )}
        </button>

        {cartButton()}
      </div>

      {user?.role === 'admin' && (
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="header-control header-control-pill header-control--accent"
        >
          <ShieldCheck />
          <span className="hidden sm:inline">{t.adminDash}</span>
        </button>
      )}

      {user ? (
        <div className="header-toolbar">
          <button
            type="button"
            onClick={onRecharge}
            className="header-control header-control-pill"
            title={t.recharge || 'Recharge Balance'}
            aria-label={`${t.recharge || 'Recharge'}: $${(user.balance || 0).toFixed(2)}`}
          >
            <Wallet />
            <span className="header-balance">${(user.balance || 0).toFixed(2)}</span>
          </button>
          <span className="header-toolbar-divider" aria-hidden="true" />
          {profileButton()}
          <span className="header-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            onClick={onLogout}
            className={iconBtn('header-control--danger')}
            aria-label="Logout"
          >
            <LogOut />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="header-control header-control-pill btn btn-primary px-4 text-sm gap-1.5 !py-0 !border-0 shadow-[var(--shadow-glow)]"
        >
          <User /> {t.login}
        </button>
      )}
    </div>
  );

  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-header)] backdrop-blur-xl border-b border-[var(--border)] shadow-[0_8px_30px_rgba(0,0,0,0.18)]" dir="ltr">
      <div className="container mx-auto px-3 sm:px-4 h-14 md:h-20 flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group flex-shrink-0 min-w-0"
          onClick={() => navigate('/')}
        >
          <EchoLogo className="w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 transition-transform group-hover:scale-105 flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-base sm:text-xl md:text-2xl font-black tracking-[1px] sm:tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-blue-400 truncate">
              {t.storeName}
            </span>
            <span className="hidden sm:block text-[9px] md:text-[10px] text-[var(--accent)]/70 tracking-[3px] font-semibold -mt-1">STORE</span>
          </div>
        </div>

        <div className="hidden md:flex flex-shrink-0" dir="ltr">
          {desktopActions}
        </div>

        <div className="flex md:hidden items-center gap-1.5 flex-shrink-0" dir="ltr">
          <div className="header-toolbar">
            {cartButton()}
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className={iconBtn(isMenuOpen ? 'header-control--accent' : '')}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 top-14 bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.nav
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="fixed left-0 right-0 top-14 z-50 md:hidden bg-[var(--bg-header)] border-b border-[var(--border)] max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain"
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
            >
              <div className="container mx-auto px-4 py-4 space-y-4">
                <div className="flex items-center bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-[var(--accent)]/70 rounded-xl overflow-hidden shadow-sm">
                  <div className="pl-3 text-[var(--accent)]">
                    <Search className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={lang === 'ar' ? 'ابحث عن لعبة...' : 'Search games...'}
                    className="flex-1 bg-transparent outline-none text-base px-3 py-3 placeholder:text-[var(--text-muted)] min-w-0"
                  />
                  {searchQuery && (
                    <button
                      onClick={handleClear}
                      className="px-3 text-[var(--text-muted)] hover:text-white transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNav(item.path)}
                        className={`flex items-center gap-2.5 px-3 h-11 min-h-11 rounded-xl border text-sm font-semibold transition-all ${
                          isActive
                            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/30'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                        <span className="truncate">{getNavLabel(item)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2 pt-1 border-t border-[var(--border)]">
                  <button
                    onClick={() => { onLangToggle(); }}
                    disabled={langSwitching}
                    className={`w-full flex items-center justify-between px-4 h-11 min-h-11 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-sm font-semibold text-[var(--text-sec)] hover:border-[var(--accent)]/30 transition-all ${langSwitching ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Globe className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
                      {lang === 'ar' ? 'English' : 'العربية'}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{lang === 'ar' ? 'AR' : 'EN'}</span>
                  </button>

                  {user?.role === 'admin' && (
                    <button
                      onClick={() => handleNav('/dashboard')}
                      className="w-full flex items-center gap-2.5 px-4 h-11 min-h-11 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-sm font-semibold text-[var(--accent)]"
                    >
                      <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                      {t.adminDash}
                    </button>
                  )}

                  {user && (
                    <button
                      onClick={() => { onRecharge(); setIsMenuOpen(false); }}
                      className="w-full flex items-center justify-between px-4 h-11 min-h-11 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-sm font-semibold"
                    >
                      <span className="flex items-center gap-2 text-[var(--text-sec)]">
                        <Wallet className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
                        {t.recharge || 'Recharge'}
                      </span>
                      <span className="font-mono text-[var(--accent)]">${(user.balance || 0).toFixed(2)}</span>
                    </button>
                  )}

                  {user ? (
                    <div className="flex items-center gap-2">
                      {profileButton(true)}
                      <button
                        onClick={handleLogoutClick}
                        className={iconBtn('header-control--danger !h-12 !min-h-12 !w-12')}
                        aria-label="Logout"
                      >
                        <LogOut />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleNav('/login')}
                      className="w-full btn btn-primary h-11 min-h-11 text-sm flex items-center justify-center gap-2"
                    >
                      <User className="w-4 h-4" strokeWidth={2} /> {t.login}
                    </button>
                  )}
                </div>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}