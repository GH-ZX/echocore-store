import {
  ShoppingCart, User, LogOut, Globe, ShieldCheck, Search, X, Menu,
  Loader2, Wallet, ChevronDown, ChevronRight, ArrowRight,
  Inbox,
} from 'lucide-react';
import {
  formatProfileUsername,
  getProfileUsername,
} from '../../lib/username';
import AdminSupplierWalletsCard from '../ui/AdminSupplierWalletsCard';
import { useAdminSupplierWallets } from '../../hooks/useAdminSupplierWallets';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import EchoLogo from '../ui/EchoLogo';
import SiteNav, { MobileNavLinks } from './SiteNav';
import NotificationBell from './NotificationBell';
import ProfileAvatar from '../profile/ProfileAvatar';
import { useHeaderDropdownPosition } from '../../hooks/useHeaderDropdownPosition';

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
  onNotificationsClearAll = () => {},
  onNotificationDismiss = () => {},
  onNotificationNavigate = () => {},
  onOpenNotificationsInbox = () => {},
  hasSaleOffers = true,
}) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const desktopSearchRef = useRef(null);
  const mobileSearchRef = useRef(null);
  const inputRef = useRef(null);
  const mobileSearchInputRef = useRef(null);
  const profileTriggerRef = useRef(null);
  const profilePanelRef = useRef(null);
  const menuRef = useRef(null);
  const isAdmin = user?.role === 'admin';
  const { coords: profileCoords, updatePosition: updateProfilePosition } = useHeaderDropdownPosition(
    profileTriggerRef,
    profileOpen,
    { align: 'end', width: isAdmin ? 332 : 300 },
  );
  const {
    g2bulkWallet,
    g2bulkError,
    g2bulkFetched,
    samWallets,
    samError,
    samNotConfigured,
    samFetched,
    loading: supplierWalletsLoading,
    idle: supplierWalletsIdle,
  } = useAdminSupplierWallets(isAdmin, { fetchOnMount: true, pollIntervalMs: 0 });
  const profileUsername = getProfileUsername(user);
  const profileUsernameLabel = profileUsername ? formatProfileUsername(profileUsername) : '';

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
    if (location.pathname === '/search') {
      const nextQuery = new URLSearchParams(location.search).get('q') || '';
      setSearchDraft(nextQuery);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const inSearch = desktopSearchRef.current?.contains(event.target)
        || mobileSearchRef.current?.contains(event.target);
      if (!inSearch) {
        setIsSearchOpen(false);
      }
      if (
        !profileTriggerRef.current?.contains(event.target)
        && !profilePanelRef.current?.contains(event.target)
      ) {
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
    if (!isSearchOpen) return;
    const target = isMobile ? mobileSearchInputRef.current : inputRef.current;
    target?.focus();
  }, [isSearchOpen, isMobile]);

  const submitSearch = useCallback((rawValue = searchDraft) => {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    setIsSearchOpen(false);
    setIsMenuOpen(false);
    onNotificationsClose();
    setProfileOpen(false);
  }, [navigate, onNotificationsClose, searchDraft]);

  const handleClearSearch = () => {
    setSearchDraft('');
    inputRef.current?.focus();
    mobileSearchInputRef.current?.focus();
  };

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
    setIsMenuOpen(false);
    setProfileOpen(false);
    onNotificationsClose();
  }, [onNotificationsClose]);

  const renderSearchControl = (variant = 'desktop') => {
    const isMobileVariant = variant === 'mobile';
    const activeInputRef = isMobileVariant ? mobileSearchInputRef : inputRef;

    return (
      <AnimatePresence mode="wait">
        {!isSearchOpen ? (
          <motion.button
            key={`search-button-${variant}`}
            type="button"
            onClick={openSearch}
            className={iconBtn()}
            aria-label={t.headerSearchGames}
          >
            <Search strokeWidth={2} />
          </motion.button>
        ) : (
          <motion.form
            key={`search-field-${variant}`}
            initial={{ width: 0, opacity: 0, scale: 0.96 }}
            animate={{ width: 'auto', opacity: 1, scale: 1 }}
            exit={{ width: 0, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 22, mass: 0.85 }}
            className={`header-search-field ${isMobileVariant ? 'header-search-field--mobile' : ''}`}
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <div className="pl-2.5 text-[var(--accent)]" aria-hidden="true">
              <Search className="w-4 h-4" strokeWidth={2} />
            </div>
            <input
              ref={activeInputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t.searchPlaceholderShort}
              className="header-search-input"
              onKeyDown={(e) => { if (e.key === 'Escape') setIsSearchOpen(false); }}
              aria-label={t.headerSearchGames}
            />
            <AnimatePresence>
              {searchDraft && (
                <motion.button
                  key="search-clear"
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  onClick={handleClearSearch}
                  className="header-search-btn"
                  aria-label={t.clearSearch}
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="header-search-submit"
              aria-label={t.searchAction}
              disabled={!searchDraft.trim()}
            >
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    );
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
      onClearAll={onNotificationsClearAll}
      onDismiss={onNotificationDismiss}
      onNavigate={handleBellNavigate}
      onViewAllInbox={onOpenNotificationsInbox}
    />
  ) : null;

  const cartButton = (extraClass = '') => (
    <button
      ref={cartRef}
      type="button"
      onClick={() => navigate('/cart')}
      className={`header-btn header-btn-icon relative ${extraClass}`}
      aria-label={t.cart}
    >
      <ShoppingCart strokeWidth={2} />
      {cartLength > 0 && (
        <span className="header-cart-badge" aria-hidden="true">{cartLength}</span>
      )}
    </button>
  );

  const profileDropdownPanel = user && typeof document !== 'undefined'
    ? createPortal(
      <AnimatePresence>
        {profileOpen && (
        <motion.div
          ref={profilePanelRef}
          key="profile-dropdown"
          role="menu"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="header-profile-dropdown header-glass-dropdown glass-surface"
          style={{
            position: 'fixed',
            top: profileCoords.top,
            left: profileCoords.left,
            width: profileCoords.width,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleNav('/profile')}
            className="header-profile-dd-head"
          >
            <ProfileAvatar
              name={user.name}
              email={user.email}
              avatarUrl={user.avatar_url}
              size="sm"
              className="header-avatar header-avatar--lg"
            />
            <div className="header-profile-dd-head-text">
              <span className="header-profile-dd-head-name">{user.name}</span>
              {profileUsernameLabel ? (
                <span className="header-profile-dd-head-username">{profileUsernameLabel}</span>
              ) : null}
              <span className="header-profile-dd-head-email">{user.email}</span>
            </div>
            <ChevronRight className="header-profile-dd-head-arrow" strokeWidth={2} aria-hidden="true" />
          </button>

          <div className="header-profile-dd-body">
            {isAdmin ? (
              <div className="header-profile-dd-supplier" role="presentation">
                <AdminSupplierWalletsCard
                  t={t}
                  variant="dropdown"
                  g2bulkBalance={g2bulkWallet?.balance ?? 0}
                  g2bulkError={g2bulkError}
                  g2bulkFetched={g2bulkFetched}
                  samWallets={samWallets}
                  samError={samError}
                  samNotConfigured={samNotConfigured}
                  samFetched={samFetched}
                  loading={supplierWalletsLoading}
                  idle={supplierWalletsIdle}
                  onOpenDashboard={() => handleNav('/dashboard')}
                  onOpenPayments={() => handleNav('/dashboard/payments')}
                />
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => { onRecharge(); setProfileOpen(false); }}
                className="header-profile-dd-balance"
              >
                <span className="header-profile-dd-balance-icon" aria-hidden="true">
                  <Wallet strokeWidth={2} />
                </span>
                <span className="header-profile-dd-balance-copy">
                  <span className="header-profile-dd-balance-label">
                    {t.recharge}
                  </span>
                  <span className="header-profile-dd-balance-hint">
                    {t.topUpWallet}
                  </span>
                </span>
                <span className="header-balance">${(user.balance || 0).toFixed(2)}</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeAll();
                onOpenNotificationsInbox();
              }}
              className="header-profile-dd-item"
            >
              <Inbox className="w-4 h-4" strokeWidth={2} />
              {t.siteInboxTitle}
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
          </div>

          <div className="header-profile-dd-footer">
            <button
              type="button"
              role="menuitem"
              onClick={() => { closeAll(); onLogout(); }}
              className="header-profile-dd-item header-profile-dd-item--danger"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} />
              {t.logout}
            </button>
          </div>
        </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )
    : null;

  const profileDropdown = user ? (
    <div className="relative">
      <button
        ref={profileTriggerRef}
        type="button"
        onClick={() => {
          updateProfilePosition();
          setProfileOpen((prev) => !prev);
        }}
        className={`header-btn header-profile-trigger ${profileOpen ? 'header-btn--accent' : ''}`}
        aria-label={t.accountMenu}
        aria-expanded={profileOpen}
        aria-haspopup="menu"
      >
        <ProfileAvatar
          name={user.name}
          email={user.email}
          avatarUrl={user.avatar_url}
          size="sm"
          className="header-avatar"
        />
        <span className="header-profile-name hidden lg:inline">
          {user.name}
        </span>
        <ChevronDown
          className={`header-profile-chevron ${profileOpen ? 'header-profile-chevron--open' : ''}`}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </button>
      {profileDropdownPanel}
    </div>
  ) : null;

  const desktopToolbar = (
    <div className="header-actions">
      <div ref={desktopSearchRef} className="header-toolbar">
        {renderSearchControl('desktop')}

        {!isSearchOpen && <span className="header-toolbar-divider" aria-hidden="true" />}

        <button
          type="button"
          onClick={onLangToggle}
          disabled={langSwitching}
          className={iconBtn()}
          aria-label={lang === 'ar' ? t.switchToEnglish : t.switchToArabic}
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
          aria-label={t.homeAria}
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
          hasSaleOffers={hasSaleOffers}
        />

        {/* Desktop utilities */}
        <div className="hidden md:flex flex-shrink-0 min-w-0">
          {desktopToolbar}
        </div>

        {/* Mobile utilities */}
        <div className="flex md:hidden items-center gap-1.5 flex-shrink-0 min-w-0">
          {isMobile && notificationBell}
          <div ref={mobileSearchRef} className="header-mobile-search-slot">
            {renderSearchControl('mobile')}
          </div>
          {cartButton()}
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen((prev) => {
                if (!prev) setIsSearchOpen(false);
                return !prev;
              });
            }}
            className={iconBtn(isMenuOpen ? 'header-btn--accent' : '')}
            aria-label={isMenuOpen ? t.closeMenu : t.openMenu}
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
                aria-label={t.closeMenu}
              />
              <motion.div
                ref={menuRef}
                id="mobile-nav-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={t.navigationMenu}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                className="header-mobile-drawer md:hidden"
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
              >
                <div className="header-mobile-drawer-inner">
                  <nav aria-label={t.mainNavigation}>
                    <MobileNavLinks
                      t={t}
                      lang={lang}
                      location={location}
                      onNavigate={handleNav}
                      hasSaleOffers={hasSaleOffers}
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
                      <span>{lang === 'ar' ? t.langEnglish : t.langArabic}</span>
                      <span className="header-mobile-action-meta">{lang === 'ar' ? t.langCodeEn : t.langCodeAr}</span>
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
                      {isAdmin ? (
                        <div className="header-mobile-supplier">
                          <AdminSupplierWalletsCard
                            t={t}
                            variant="compact"
                            g2bulkBalance={g2bulkWallet?.balance ?? 0}
                            g2bulkError={g2bulkError}
                            g2bulkFetched={g2bulkFetched}
                            samWallets={samWallets}
                            samError={samError}
                            samNotConfigured={samNotConfigured}
                            samFetched={samFetched}
                            loading={supplierWalletsLoading}
                            idle={supplierWalletsIdle}
                            onOpenDashboard={() => handleNav('/dashboard')}
                            onOpenPayments={() => handleNav('/dashboard/payments')}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { onRecharge(); setIsMenuOpen(false); }}
                          className="header-mobile-action"
                        >
                          <Wallet className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
                          <span>{t.recharge}</span>
                          <span className="header-balance">${(user.balance || 0).toFixed(2)}</span>
                        </button>
                      )}

                      <div className="header-mobile-profile-row">
                        <button
                          type="button"
                          onClick={() => handleNav('/profile')}
                          className="header-mobile-profile-card"
                        >
                          <ProfileAvatar
                            name={user.name}
                            email={user.email}
                            avatarUrl={user.avatar_url}
                            size="sm"
                            className="header-avatar header-avatar--md flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1 text-left">
                            <div className="text-sm font-bold text-[var(--text-primary)] truncate">{user.name}</div>
                            <div className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { closeAll(); onLogout(); }}
                          className="header-btn header-btn--danger header-btn-icon header-mobile-logout-btn"
                          aria-label={t.logout}
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