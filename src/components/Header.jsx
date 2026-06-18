import { ShoppingCart, User, LogOut, Globe, ShieldCheck, Search, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EchoLogo from './EchoLogo';

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
  cartRef = null
}) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto focus when opening
  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleSearchToggle = () => {
    const next = !isSearchOpen;
    setIsSearchOpen(next);
    if (!next && searchQuery) {
      // Keep the query when closing, just hide the field
    }
  };

  const handleClear = () => {
    onSearchChange('');
    setIsSearchOpen(false);
  };
  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-header)] backdrop-blur-xl border-b border-[var(--border)]" dir="ltr">
      <div className="container mx-auto px-4 h-16 md:h-20 flex items-center justify-between">
        {/* Logo */}
        <div 
          className="flex items-center gap-3 cursor-pointer group flex-shrink-0" 
          onClick={() => navigate('/')}
        >
          <EchoLogo className="w-9 h-9 md:w-12 md:h-12 transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <span className="text-xl md:text-2xl font-black tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-blue-400">
              {t.storeName}
            </span>
            <span className="text-[9px] md:text-[10px] text-[var(--accent)]/70 tracking-[3px] font-semibold -mt-1">STORE</span>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0" dir="ltr">
          {/* Search Button / Expanded Field */}
          <div ref={searchRef} className="relative flex items-center">
            <AnimatePresence mode="wait">
              {!isSearchOpen ? (
                <motion.button
                  key="search-button"
                  onClick={handleSearchToggle}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.88 }}
                  className="p-2.5 text-[var(--text-sec)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] rounded-xl border border-transparent hover:border-[var(--border)] transition-all"
                  aria-label="Search for a game"
                >
                  <Search className="w-5 h-5" />
                </motion.button>
              ) : (
                <motion.div
                  key="search-field"
                  initial={{ width: 0, opacity: 0, scale: 0.8 }}
                  animate={{ width: 'auto', opacity: 1, scale: 1 }}
                  exit={{ width: 0, opacity: 0, scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18, mass: 0.9 }}
                  className="flex items-center bg-[var(--bg-surface)] border border-[var(--accent)]/70 rounded-2xl overflow-hidden shadow-md"
                  style={{ minWidth: '170px' }}
                >
                  <div className="pl-3 text-[var(--accent)]">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={lang === 'ar' ? 'ابحث عن لعبة...' : 'Search games...'}
                    className="flex-1 bg-transparent outline-none text-sm px-2 py-2 placeholder:text-[var(--text-muted)] w-[120px] sm:w-[160px] md:w-[200px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setIsSearchOpen(false);
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={handleClear}
                      className="px-2.5 text-[var(--text-muted)] hover:text-white transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsSearchOpen(false)}
                    className="px-2.5 text-[var(--text-muted)] hover:text-white border-l border-[var(--border)] transition-colors"
                    aria-label="Close search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Language Toggle - Icon only, always LTR */}
          <motion.button 
            onClick={onLangToggle} 
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.88 }}
            className="p-2.5 text-[var(--text-sec)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] rounded-xl border border-transparent hover:border-[var(--border)] transition-all"
            aria-label={lang === 'ar' ? 'Switch to English' : 'Switch to Arabic'}
          >
            <motion.div
              key={lang}
              initial={{ rotate: -180, scale: 0.5, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16, mass: 1 }}
            >
              <Globe className="w-5 h-5" />
            </motion.div>
          </motion.button>

          {/* Admin */}
          {user?.role === 'admin' && (
            <button 
              onClick={() => navigate('/dashboard')} 
              className="flex items-center gap-1.5 text-[var(--accent)] hover:text-white bg-[var(--accent)]/10 px-3 py-1.5 rounded-xl border border-[var(--accent)]/30 text-sm font-semibold transition-all hover:bg-[var(--accent)]/20"
            >
              <ShieldCheck className="w-4 h-4" /> 
              <span className="hidden sm:inline">{t.adminDash}</span>
            </button>
          )}

          {/* Cart */}
          <button 
            ref={cartRef}
            onClick={() => navigate('/cart')} 
            className="relative p-2.5 text-[var(--text-sec)] hover:text-[var(--accent)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/30 transition-all"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartLength > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-[var(--accent)] text-[#040812] text-[10px] font-black rounded-full">
                {cartLength}
              </span>
            )}
          </button>

          {/* Recharge (balance top-up) */}
          {user && (
            <button
              onClick={onRecharge}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold bg-[var(--bg-surface)] hover:bg-[var(--accent)]/10 border border-[var(--border)] hover:border-[var(--accent)]/40 rounded-xl transition-all text-[var(--text-sec)] hover:text-[var(--accent)]"
              title={t.recharge || 'Recharge Balance'}
            >
              <span className="font-mono text-[var(--accent)] text-xs sm:text-sm">${(user.balance || 0).toFixed(2)}</span>
              <span className="hidden md:inline text-[10px]">{t.recharge || 'Recharge'}</span>
            </button>
          )}

          {/* User / Login */}
          {user ? (
            <div className="flex items-center gap-1.5">
              <div className="hidden md:block text-right leading-tight mr-1">
                <div className="text-xs text-[var(--text-muted)]">{t.hello || (lang === 'ar' ? 'مرحباً' : 'Hello')}</div>
                <div className="text-sm font-bold text-[var(--accent)] -mt-0.5 truncate max-w-[90px]">{user.name}</div>
              </div>
              <button 
                onClick={onLogout} 
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl border border-red-500/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => navigate('/login')} 
              className="btn btn-primary px-4 py-1.5 text-sm flex items-center gap-1.5 min-w-[9rem] justify-center"
            >
              <User className="w-4 h-4" /> {t.login}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
