import React from 'react';
import { ShoppingCart, User, LogOut, Globe, ShieldCheck } from 'lucide-react';
import EchoLogo from './EchoLogo';

export default function Header({
  t,
  lang,
  onLangToggle,
  user,
  cartLength,
  onLogout,
  onNavigate
}) {
  return (
    <header className="sticky top-0 z-50 bg-[#060b19]/90 backdrop-blur-md border-b border-cyan-900/30 shadow-[0_4px_30px_rgba(34,211,238,0.05)]">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onNavigate('home')}>
          <EchoLogo className="w-10 h-10 md:w-12 md:h-12 transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <span className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">{t.storeName}</span>
            <span className="text-[10px] text-cyan-500/70 tracking-[0.2em] font-semibold -mt-1">STORE</span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <button onClick={onLangToggle} className="text-slate-400 hover:text-cyan-400 font-semibold flex items-center gap-1 transition-colors">
            <Globe className="w-5 h-5" /> <span className="hidden md:inline">{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </button>

          {user?.role === 'admin' && (
            <button onClick={() => onNavigate('admin')} className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 bg-cyan-950/30 px-3 py-1.5 rounded-lg border border-cyan-800/50">
              <ShieldCheck className="w-5 h-5" /> <span className="hidden sm:inline">{t.adminDash}</span>
            </button>
          )}

          <button onClick={() => onNavigate('cart')} className="relative p-2 text-slate-300 hover:text-cyan-400 bg-[#0a1329] rounded-xl border border-slate-800 transition-colors">
            <ShoppingCart className="w-6 h-6" />
            {cartLength > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-500 text-slate-900 text-xs font-bold rounded-full flex items-center justify-center">{cartLength}</span>}
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs text-slate-400">{lang === 'ar' ? 'مرحباً' : 'Hello'},</span>
                <span className="text-sm font-bold text-cyan-400">{user.name}</span>
              </div>
              <button onClick={onLogout} className="bg-red-500/10 hover:bg-red-500/20 px-4 py-2 rounded-xl text-red-400 border border-red-500/20 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => onNavigate('login')} className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 px-6 py-2.5 rounded-xl text-white font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all">
              <User className="w-4 h-4" /> <span>{t.login}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
