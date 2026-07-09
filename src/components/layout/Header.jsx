import {
  ShoppingCart, User, LogOut, Globe, ShieldCheck, Search, X, Menu,
  Loader2, Wallet, ChevronDown,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import EchoLogo from '../ui/EchoLogo';
import SiteNav, { MobileNavLinks } from './SiteNav';
import NotificationBell from './NotificationBell';

const iconBtn = (extra = '') => `header-btn header-btn-icon ${extra}`.trim();

function useIsMobile() {
  const query = '(max-width: 767px)';
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(query).matches
  ));

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (event) => setIsMobile(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

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
  notifications = [],
  unreadCount = 0,
  notificationsLoading = false,
  notificationsOpen = false,
  onNotificationsToggle = () => {},
  onNotificationsClose = () => {},
  onNotificationMarkRead = () => {},
  onNotificationsMarkAllRead = () => {},
  onNotificationNavigate = () => {},
}) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const profileRef = useRef(null);
  const menuRef = useRef(null);

  const closeAll = useCallback(() => {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
    setProfileOpen(false);
    onNotificationsClose();
  }, [onNotificationsClose]);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
    setProfileOpen(false);
    onNotificationsClose();
    // Only close overlays on route change — not when parent callbacks are recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeAll();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeAll]);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleClearSearch = () => {
    onSearchChange('');
    setIsSearchOpen(false);
  };

  const handleNav = (path) => {
    navigate(path);
    closeAll();
  };

  const handleBellNavigate = useCallback((dest) => {
    onNotificationsClose();
    setIsMenuOpen(false);
    onNotificationNavigate(dest);
  }, [onNotificationsClose, onNotificationNavigate]);

  const notificationBell = user ? (
    <NotificationBell
      t={t}
      lang={lang}
      user={user}
      notifications={notifications}
      unreadCount={unreadCount}
      loading={notificationsLoading}
      open={notificationsOpen}
      onToggle={() => {
        setProfileOpen(false);
        setIsMenuOpen(false);
        onNotificationsToggle();
      }}
      onClose={onNotificationsClose}
      onMarkRead={onNotificationMarkRead}
      onMarkAllRead={onNotificationsMarkAllRead}
      onNavigate={handleBellNavigate}
    />
  ) : null;

  const getInitials = (name, email) => {
    const source = (name || email || '?').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  };

  const cartButton = (extraClass = '') => (
    <button
      ref={cartRef}
      type="button"
      onClick={() => navigate('/cart')}
      className={`header-btn header-btn-icon relative ${extraClass}`}
      aria-label={t.cart || 'Cart'}
    >
      <ShoppingCart strokeWidth={2} />
      {cartLength > 0 && (
        <span className="header-cart-badge" aria-hidden="true">{cartLength}</span>
      )}
    </button>
  );

  const profileDropdown = user ? (
    <div ref={profileRef} className="relative">
      <button
        type="button"
        onClick={() => setProfileOpen((prev) => !prev)}
        className={`header-btn header-profile-trigger ${profileOpen ? 'header-btn--accent' : ''}`}
        aria-label={t.myProfile || 'Profile'}
        aria-expanded={profileOpen}
        aria-haspopup="menu"
      >
        <div className="header-avatar" aria-hidden="true">
          {getInitials(user.name, user.email)}
        </div>
        <span className="hidden lg:inline text-sm font-bold text-[var(--text-primary)] max-w-[88px] truncate">
          {user.name}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {profileOpen && (
          <motion.div
            key="profile-dropdown"
            role="menu"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="header-profile-dropdown"
          >
            <div className="px-3.5 pt-3 pb-2">
              <div className="flex items-center gap-2.5">
                <div className="header-avatar w-9 h-9 text-sm" aria-hidden="true">
                  {getInitials(user.name, user.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[var(--text-primary)] truncate">{user.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</div>
                </div>
              </div>
            </div>

            <div className="header-profile-dd-divider" />

            <button
              type="button"
              role="menuitem"
              onClick={() => { onRecharge(); setProfileOpen(false); }}
              className="header-profile-dd-item justify-between"
            >
              <span className="flex items-center gap-2.5">
                <Wallet className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
                {t.recharge || 'Balance'}
              </span>
              <span className="header-balance">${(user.balance || 0).toFixed(2)}</span>
            </button>

            {user?.role === 'admin' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleNav('/dashboard')}
                className="header-profile-dd-item header-profile-dd-item--accent"
              >
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                {t.adminDash}
              </button>
            )}

            <div className="header-profile-dd-divider" />

            <button
              type="button"
              role="menuitem"
              onClick={() => handleNav('/profile')}
              className="header-profile-dd-item"
            >
              <User className="w-4 h-4" strokeWidth={2} />
              {t.myProfile || 'My Profile'}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => { closeAll(); onLogout(); }}
              className="header-profile-dd-item header-profile-dd-item--danger"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} />
              {t.logout || 'Sign Out'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ) : null;

  const desktopToolbar = (
    <div className="header-actions">
      <div ref={searchRef} className="header-toolbar">
        <AnimatePresence mode="wait">
          {!isSearchOpen ? (
            <motion.button
              key="search-button"
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className={iconBtn()}
              aria-label={lang === 'ar' ? 'بحث عن لعبة' : 'Search games'}
            >
              <Search strokeWidth={2} />
            </motion.button>
          ) : (
            <motion.div
              key="search-field"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 22, mass: 0.85 }}
              className="header-search-field"
            >
              <div className="pl-2.5 text-[var(--accent)]" aria-hidden="true">
                <Search className="w-4 h-4" strokeWidth={2} />
              </div>
              <input
                ref={inputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={lang === 'ar' ? 'ابحث عن لعبة...' : 'Search games...'}
                className="header-search-input"
                onKeyDown={(e) => { if (e.key === 'Escape') setIsSearchOpen(false); }}
                aria-label={lang === 'ar' ? 'بحث عن لعبة' : 'Search games'}
              />
              {searchQuery && (
                <button type="button" onClick={handleClearSearch} className="header-search-btn" aria-label="Clear search">
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="header-search-btn border-l border-[var(--border)]"
                aria-label="Close search"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!isSearchOpen && <span className="header-toolbar-divider" aria-hidden="true" />}

        <button
          type="button"
          onClick={onLangToggle}
          disabled={langSwitching}
          className={iconBtn()}
          aria-label={lang === 'ar' ? 'Switch to English' : 'Switch to Arabic'}
          aria-busy={langSwitching}
        >
          {langSwitching ? (
            <Loader2 className="animate-spin text-[var(--accent)]" strokeWidth={2} />
          ) : (
            <Globe strokeWidth={2} />
          )}
        </button>
      </div>

      {cartButton()}

      {user ? (
        <div className="header-account-group">
          {!isMobile && notificationBell}
          {profileDropdown}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="header-btn header-btn--accent gap-1.5 px-3.5 lg:px-4"
        >
          <User className="w-4 h-4" strokeWidth={2} />
          <span className="text-sm font-bold">{t.login}</span>
        </button>
      )}
    </div>
  );

  return (
    <header className="header-shell sticky top-0" dir="ltr">
      <div className="header-inner">
        {/* Logo */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="header-brand flex-shrink-0 min-w-0 group"
          aria-label={lang === 'ar' ? 'الصفحة الرئيسية' : 'Home'}
        >
          <span className="header-brand-mark">
            <EchoLogo className="header-brand-logo" />
          </span>
          <span className="header-brand-text flex flex-col min-w-0 text-left">
            <span className="header-brand-name truncate">{t.storeName}</span>
            <span className="header-brand-tag">STORE</span>
          </span>
        </button>

        {/* Desktop nav — centered */}
        <SiteNav
          t={t}
          lang={lang}
          navigate={navigate}
          className="header-site-nav"
        />

        {/* Desktop utilities */}
        <div className="hidden md:flex flex-shrink-0 min-w-0">
          {desktopToolbar}
        </div>

        {/* Mobile utilities */}
        <div className="flex md:hidden items-center gap-1.5 flex-shrink-0">
          {isMobile && notificationBell}
          {cartButton()}
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className={iconBtn(isMenuOpen ? 'header-btn--accent' : '')}
            aria-label={isMenuOpen ? (lang === 'ar' ? 'إغلاق القائمة' : 'Close menu') : (lang === 'ar' ? 'فتح القائمة' : 'Open menu')}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-drawer"
          >
            {isMenuOpen ? <X strokeWidth={2} /> : <Menu strokeWidth={2} />}
          </button>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isMenuOpen && (
            <>
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="header-mobile-backdrop md:hidden"
                onClick={() => setIsMenuOpen(false)}
                aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
              />
              <motion.div
                ref={menuRef}
                id="mobile-nav-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={lang === 'ar' ? 'قائمة التنقل' : 'Navigation menu'}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                className="header-mobile-drawer md:hidden"
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
              >
                <div className="header-mobile-drawer-inner">
                  <label className="header-mobile-search">
                    <Search className="w-4 h-4 text-[var(--accent)] flex-shrink-0" strokeWidth={2} />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder={lang === 'ar' ? 'ابحث عن لعبة...' : 'Search games...'}
                      aria-label={lang === 'ar' ? 'بحث عن لعبة' : 'Search games'}
                    />
                    {searchQuery && (
                      <button type="button" onClick={handleClearSearch} className="header-mobile-search-clear" aria-label="Clear">
                        <X className="w-4 h-4" strokeWidth={2} />
                      </button>
                    )}
                  </label>

                  <nav aria-label={lang === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
                    <MobileNavLinks
                      t={t}
                      lang={lang}
                      location={location}
                      onNavigate={handleNav}
                    />
                  </nav>

                  <div className="header-mobile-divider" />

                  <div className="header-mobile-actions">
                    <button
                      type="button"
                      onClick={() => { onLangToggle(); }}
                      disabled={langSwitching}
                      className="header-mobile-action"
                    >
                      <Globe className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
                      <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
                      <span className="header-mobile-action-meta">{lang === 'ar' ? 'EN' : 'AR'}</span>
                    </button>

                    {user?.role === 'admin' && (
                      <button type="button" onClick={() => handleNav('/dashboard')} className="header-mobile-action header-mobile-action--accent">
                        <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                        <span>{t.adminDash}</span>
                      </button>
                    )}
                  </div>

                  <div className="header-mobile-divider" />

                  {user ? (
                    <div className="header-mobile-account">
                      <button
                        type="button"
                        onClick={() => { onRecharge(); setIsMenuOpen(false); }}
                        className="header-mobile-action"
                      >
                        <Wallet className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
                        <span>{t.recharge || 'Recharge'}</span>
                        <span className="header-balance">${(user.balance || 0).toFixed(2)}</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleNav('/profile')}
                          className="header-mobile-action flex-1 min-w-0"
                        >
                          <div className="header-avatar w-7 h-7 text-[10px] flex-shrink-0">
                            {getInitials(user.name, user.email)}
                          </div>
                          <div className="min-w-0 text-left">
                            <div className="text-[10px] text-[var(--text-muted)] leading-tight">{t.myProfile || 'Profile'}</div>
                            <div className="text-sm font-bold text-[var(--accent)] truncate">{user.name}</div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => { closeAll(); onLogout(); }}
                          className="header-btn header-btn--danger header-btn-icon !w-11 h-11 flex-shrink-0"
                          aria-label={t.logout || 'Sign out'}
                        >
                          <LogOut className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleNav('/login')}
                      className="header-btn header-btn--accent w-full h-11 text-sm font-bold justify-center gap-2"
                    >
                      <User className="w-4 h-4" strokeWidth={2} />
                      {t.login}
                    </button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </header>
  );
}