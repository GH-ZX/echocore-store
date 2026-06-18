import { ShoppingCart, User, LogOut, Globe, ShieldCheck } from 'lucide-react';
import EchoLogo from './EchoLogo';

export default function Header({
  t,
  lang,
  onLangToggle,
  user,
  cartLength,
  onLogout,
  navigate
}) {
  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-header)] backdrop-blur-xl border-b border-[var(--border)]">
      <div className="container mx-auto px-4 h-16 md:h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/')}>
          <EchoLogo className="w-9 h-9 md:w-12 md:h-12 transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <span className="text-xl md:text-2xl font-black tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-blue-400">{t.storeName}</span>
            <span className="text-[9px] md:text-[10px] text-[var(--accent)]/70 tracking-[3px] font-semibold -mt-1">STORE</span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <button onClick={onLangToggle} className="text-[var(--text-sec)] hover:text-[var(--accent)] font-semibold flex items-center gap-1.5 text-sm transition-colors">
            <Globe className="w-4 h-4" /> <span className="hidden md:inline">{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </button>

          {user?.role === 'admin' && (
            <button 
              onClick={() => navigate('/dashboard')} 
              className="flex items-center gap-1.5 text-[var(--accent)] hover:text-white bg-[var(--accent)]/10 px-3.5 py-1.5 rounded-xl border border-[var(--accent)]/30 text-sm font-semibold"
            >
              <ShieldCheck className="w-4 h-4" /> <span className="hidden sm:inline">{t.adminDash}</span>
            </button>
          )}

          <button 
            onClick={() => navigate('/cart')} 
            className="relative p-2.5 text-[var(--text-sec)] hover:text-[var(--accent)] bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartLength > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-[var(--accent)] text-[#040812] text-[10px] font-black rounded-full">
                {cartLength}
              </span>
            )}
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:block text-right leading-tight">
                <div className="text-xs text-[var(--text-muted)]">{lang === 'ar' ? 'مرحباً' : 'Hello'}</div>
                <div className="text-sm font-bold text-[var(--accent)] -mt-0.5 truncate max-w-[120px]">{user.name}</div>
              </div>
              <button onClick={onLogout} className="p-2.5 text-red-400 hover:bg-red-500/10 rounded-xl border border-red-500/20">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => navigate('/login')} 
              className="btn btn-primary px-6 py-2 text-sm"
            >
              <User className="w-4 h-4" /> {t.login}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
