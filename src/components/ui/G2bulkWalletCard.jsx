import { Loader2, RefreshCw, Wallet, AlertCircle, Zap } from 'lucide-react';
import { SUPPLIER_BRAND } from '../../lib/branding';

function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function G2bulkWalletCard({
  balance = 0,
  username = '',
  loading = false,
  error = null,
  idle = false,
  idleHint = '',
  lang = 'ar',
  compact = false,
  onRefresh,
  onManage,
  manageLabel,
}) {
  const isAr = lang === 'ar';
  const lowBalance = !loading && !error && Number(balance) < 5;

  if (compact) {
    if (loading) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          {SUPPLIER_BRAND}…
        </span>
      );
    }
    if (error) {
      return (
        <span className="text-xs text-amber-400" title={error}>
          {SUPPLIER_BRAND} —
        </span>
      );
    }
    return (
      <span className="header-balance font-mono" title={isAr ? `رصيد ${SUPPLIER_BRAND}` : `${SUPPLIER_BRAND} wallet`}>
        {formatUsd(balance)}
      </span>
    );
  }

  return (
    <div className="g2bulk-wallet-card rounded-2xl border border-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent)]/10 via-[var(--bg-surface)] to-[var(--bg-primary)] p-5 sm:p-6 w-full sm:min-w-[280px]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              {SUPPLIER_BRAND}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {isAr ? 'رصيد المورد للتوريد' : 'Supplier wallet for fulfillment'}
            </p>
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
            aria-label={isAr ? 'تحديث الرصيد' : 'Refresh balance'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-6 text-[var(--text-sec)]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
          <span className="text-sm">{isAr ? 'جاري تحميل الرصيد…' : 'Loading wallet…'}</span>
        </div>
      ) : idle ? (
        <div className="py-6 text-center">
          <p className="text-3xl sm:text-4xl font-black font-mono text-[var(--text-muted)]">—</p>
          {idleHint ? (
            <p className="text-xs text-[var(--text-muted)] mt-3">{idleHint}</p>
          ) : null}
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{isAr ? 'تعذر قراءة الرصيد' : 'Could not load balance'}</p>
            <p className="text-xs opacity-90 mt-0.5">{error}</p>
          </div>
        </div>
      ) : (
        <>
          <p className="g2bulk-wallet-amount text-4xl sm:text-5xl font-black font-mono tracking-tight text-white">
            {formatUsd(balance)}
          </p>
          {username && (
            <p className="text-sm text-[var(--text-sec)] mt-2 truncate">
              {isAr ? 'الحساب:' : 'Account:'}{' '}
              <span className="text-[var(--text-primary)] font-medium">{username}</span>
            </p>
          )}
          {lowBalance && (
            <p className="text-xs text-amber-400 mt-3 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {isAr ? `الرصيد منخفض — عبّئ محفظة ${SUPPLIER_BRAND}` : `Low balance — top up your ${SUPPLIER_BRAND} wallet`}
            </p>
          )}
        </>
      )}

      {onManage && !loading && (
        <button
          type="button"
          onClick={onManage}
          className="action-chip btn btn-primary !h-11 !min-h-11 !border-0 gap-2 px-5 w-full sm:w-auto mt-4"
        >
          <Wallet className="w-4 h-4" />
          {manageLabel || (isAr ? `إعدادات ${SUPPLIER_BRAND}` : `${SUPPLIER_BRAND} settings`)}
        </button>
      )}
    </div>
  );
}