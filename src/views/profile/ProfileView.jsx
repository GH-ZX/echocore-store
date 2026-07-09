import { useState, useEffect, useMemo } from 'react';
import {
  User,
  Wallet,
  ShoppingBag,
  Receipt,
  Pencil,
  Check,
  X,
  LogOut,
  ShieldCheck,
  Gamepad2,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Mail,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

function getInitials(name, email) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatDate(dateStr, lang) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr, lang) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(lang === 'ar' ? 'ar' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfileView({
  t = {},
  lang = 'ar',
  user,
  navigate,
  onLogout,
  onRecharge,
  onUpdateName,
}) {
  const isAr = lang === 'ar';
  const [profileMeta, setProfileMeta] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    setNameDraft(user?.name || '');
  }, [user?.name]);

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, ordersRes, txRes] = await Promise.all([
          supabase.from('profiles').select('name, role, balance, created_at').eq('id', user.id).single(),
          supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(15),
        ]);

        if (profileRes.data) setProfileMeta(profileRes.data);
        setUserOrders(ordersRes.data || []);
        setTransactions(txRes.data || []);
      } catch (err) {
        console.error('Profile load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  const balance = profileMeta?.balance ?? user?.balance ?? 0;
  const totalSpent = useMemo(
    () => userOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0),
    [userOrders]
  );
  const totalRecharges = useMemo(
    () => transactions.filter((tx) => tx.type === 'recharge').reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0),
    [transactions]
  );

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError(isAr ? 'الاسم مطلوب' : 'Name is required');
      return;
    }
    setSavingName(true);
    setNameError('');
    try {
      await onUpdateName(trimmed);
      setEditingName(false);
    } catch (err) {
      setNameError(err.message || (isAr ? 'فشل الحفظ' : 'Failed to save'));
    } finally {
      setSavingName(false);
    }
  };

  const txLabel = (type) => {
    const map = {
      recharge: isAr ? 'شحن رصيد' : 'Recharge',
      purchase: isAr ? 'شراء' : 'Purchase',
      refund: isAr ? 'استرداد' : 'Refund',
      adjustment: isAr ? 'تعديل' : 'Adjustment',
    };
    return map[type] || type;
  };

  const paymentLabel = (method) => {
    if (method === 'balance') return t.payFromBalance || (isAr ? 'الرصيد' : 'Balance');
    if (method === 'binance') return t.binance || 'Binance';
    if (method === 'ShamCash') return t.shamCash || 'ShamCash';
    if (method === 'mastercard') return t.mastercard || 'Card';
    return method || '—';
  };

  if (!user) return null;

  const initials = getInitials(user.name, user.email);
  const memberSince = formatDate(profileMeta?.created_at, lang);

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-4">
      {/* Hero */}
      <div className="card overflow-hidden relative">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 20% 0%, rgba(34,211,238,0.25) 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(59,130,246,0.15) 0%, transparent 50%)',
          }}
        />
        <div className="relative p-5 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-black text-[#040812] flex-shrink-0 shadow-[0_0_30px_rgba(34,211,238,0.35)]"
              style={{ background: 'linear-gradient(135deg, var(--accent), #3b82f6)' }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="flex-1 min-w-[140px] bg-[var(--bg-primary)] border border-[var(--accent)]/50 rounded-xl px-3 py-2 text-base font-bold outline-none"
                    maxLength={40}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={saveName}
                    disabled={savingName}
                    className="p-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                  >
                    {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingName(false); setNameDraft(user.name); setNameError(''); }}
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-black truncate">{user.name}</h1>
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors flex-shrink-0"
                    aria-label={t.editName || 'Edit name'}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-[var(--text-sec)]">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0 text-[var(--accent)]/70" />
                  <span className="truncate">{user.email}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[var(--accent)]/70" />
                  {t.memberSince || (isAr ? 'عضو منذ' : 'Member since')} {memberSince}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {user.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    <ShieldCheck className="w-3 h-3" />
                    {t.adminDash || 'Admin'}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Sparkles className="w-3 h-3" />
                  {t.verifiedGamer || (isAr ? 'عضو موثّق' : 'Verified Member')}
                </span>
              </div>
            </div>
          </div>

          <div className="sm:ml-auto flex flex-col sm:items-end gap-2">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{t.currentBalance || (isAr ? 'رصيدك' : 'Your Balance')}</p>
            <p className="text-3xl sm:text-4xl font-black font-mono text-[var(--accent)]">${balance.toFixed(2)}</p>
            <button
              type="button"
              onClick={onRecharge}
              className="action-chip btn btn-primary !h-11 !min-h-11 !border-0 gap-2 px-5"
            >
              <Wallet className="w-4 h-4" />
              {t.recharge || 'Recharge'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: ShoppingBag, label: t.totalOrders || (isAr ? 'الطلبات' : 'Orders'), value: userOrders.length, color: 'text-blue-400' },
          { icon: Receipt, label: t.totalSpent || (isAr ? 'إجمالي الإنفاق' : 'Total Spent'), value: `$${totalSpent.toFixed(2)}`, color: 'text-[var(--accent)]' },
          { icon: ArrowUpRight, label: t.totalRecharged || (isAr ? 'إجمالي الشحن' : 'Total Recharged'), value: `$${totalRecharges.toFixed(2)}`, color: 'text-emerald-400' },
          { icon: User, label: t.accountType || (isAr ? 'نوع الحساب' : 'Account'), value: user.role === 'admin' ? (isAr ? 'مدير' : 'Admin') : (isAr ? 'لاعب' : 'Gamer'), color: 'text-violet-400' },
        ].map((stat) => (
          <div key={stat.label} className="card p-4 sm:p-5">
            <stat.icon className={`w-5 h-5 mb-2 ${stat.color}`} />
            <p className="text-[10px] sm:text-xs text-[var(--text-muted)] uppercase tracking-wide">{stat.label}</p>
            <p className="text-lg sm:text-xl font-black mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { icon: Gamepad2, label: t.allGames || (isAr ? 'تصفح الألعاب' : 'Browse Games'), path: '/games' },
          { icon: ShoppingCart, label: t.cart || (isAr ? 'السلة' : 'Cart'), path: '/cart' },
          { icon: Wallet, label: t.recharge || (isAr ? 'شحن الرصيد' : 'Recharge'), action: onRecharge },
          ...(user.role === 'admin' ? [{ icon: ShieldCheck, label: t.adminDash, path: '/dashboard' }] : []),
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => (action.action ? action.action() : navigate(action.path))}
            className="action-chip w-full"
          >
            <action.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-12 text-center text-[var(--text-sec)]">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--accent)]" />
          {t.loadingProfile || (isAr ? 'جاري تحميل الملف الشخصي...' : 'Loading profile...')}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Orders */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[var(--accent)]" />
                {t.myOrders || (isAr ? 'طلباتي' : 'My Orders')}
              </h2>
              <span className="text-xs text-[var(--text-muted)] font-mono">{userOrders.length}</span>
            </div>
            {userOrders.length === 0 ? (
              <div className="text-center py-10 text-[var(--text-sec)]">
                <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t.noOrdersYet || (isAr ? 'لا توجد طلبات بعد' : 'No orders yet')}</p>
                <button type="button" onClick={() => navigate('/games')} className="action-chip btn btn-secondary mt-4 !h-11">
                  {t.shopNow || (isAr ? 'تسوق الآن' : 'Shop Now')}
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {userOrders.map((order) => {
                  const items = order.order_items || [];
                  const preview = items.map((i) => i.name_snapshot).join(', ') || '—';
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => navigate(`/success?orderId=${order.id}`)}
                      className="w-full text-left p-3 sm:p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] hover:border-[var(--accent)]/40 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-[var(--text-muted)]">#{order.id.slice(0, 8)}</p>
                          <p className="text-sm font-semibold mt-0.5 truncate group-hover:text-[var(--accent)] transition-colors">{preview}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">{formatDateTime(order.created_at, lang)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-[var(--accent)]">${parseFloat(order.total).toFixed(2)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{paymentLabel(order.payment_method)}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transactions */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[var(--accent)]" />
                {t.transactionHistory || (isAr ? 'سجل المعاملات' : 'Transaction History')}
              </h2>
            </div>
            {transactions.length === 0 ? (
              <div className="text-center py-10 text-[var(--text-sec)]">
                <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t.noTransactions || (isAr ? 'لا توجد معاملات بعد' : 'No transactions yet')}</p>
                <button type="button" onClick={onRecharge} className="action-chip btn btn-secondary mt-4 !h-11">
                  {t.rechargeNow || (isAr ? 'شحن الرصيد' : 'Recharge Now')}
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {transactions.map((tx) => {
                  const amount = parseFloat(tx.amount || 0);
                  const isCredit = amount > 0;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {isCredit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{txLabel(tx.type)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">{paymentLabel(tx.payment_method)} · {formatDateTime(tx.created_at, lang)}</p>
                        </div>
                      </div>
                      <p className={`font-mono font-bold flex-shrink-0 ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isCredit ? '+' : ''}{amount.toFixed(2)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={onLogout}
          className="action-chip h-11 min-h-11 px-6 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300"
        >
          <LogOut className="w-4 h-4" />
          {t.logout}
        </button>
      </div>
    </div>
  );
}