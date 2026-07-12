import { Loader2, RefreshCw, Wallet, AlertCircle, Smartphone } from 'lucide-react';
import { formatSamCurrencyAmount } from '../../lib/samWalletFormat';

function BalanceGrid({ balances, lang, compact = false }) {
  if (!balances?.length) return null;

  if (compact) {
    return (
      <span className="sam-wallet-compact-amounts font-mono" dir="ltr">
        {balances.map((row, index) => (
          <span key={row.currency} className="sam-wallet-compact-amount">
            {index > 0 && <span className="sam-wallet-compact-sep">·</span>}
            <span className="sam-wallet-compact-currency">{row.currency}</span>
            {' '}
            {formatSamCurrencyAmount(row.currency, row.amount, lang)}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className="sam-wallet-balance-grid">
      {balances.map((row) => (
        <div key={row.currency} className="sam-wallet-balance-cell">
          <div className="sam-wallet-balance-currency">{row.currency}</div>
          <div className="sam-wallet-balance-amount font-mono" dir="ltr">
            {formatSamCurrencyAmount(row.currency, row.amount, lang)}
          </div>
        </div>
      ))}
    </div>
  );
}

function WalletBlock({ wallet, lang, compact }) {
  const providerLabel = wallet.providerDisplayName || wallet.provider;

  if (compact) {
    return (
      <div className="sam-wallet-compact-block">
        <span className="sam-wallet-compact-provider">{providerLabel}</span>
        {wallet.error ? (
          <span className="text-xs text-amber-400">—</span>
        ) : (
          <BalanceGrid balances={wallet.balances} lang={lang} compact />
        )}
      </div>
    );
  }

  return (
    <div className="sam-wallet-provider-block">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-sm text-[var(--text-primary)] truncate">{providerLabel}</p>
          {wallet.label && (
            <p className="text-xs text-[var(--text-muted)] truncate">{wallet.label}</p>
          )}
        </div>
        {wallet.identifier && (
          <span className="text-[10px] font-mono text-[var(--text-muted)] truncate max-w-[40%]" dir="ltr">
            {String(wallet.identifier).slice(0, 14)}
          </span>
        )}
      </div>
      {wallet.error ? (
        <p className="text-xs text-amber-300/90">{wallet.error}</p>
      ) : (
        <BalanceGrid balances={wallet.balances} lang={lang} />
      )}
    </div>
  );
}

export default function SamWalletBalancesCard({
  wallets = [],
  loading = false,
  error = null,
  notConfigured = false,
  lang = 'ar',
  compact = false,
  onRefresh,
  onManage,
  manageLabel,
  t = {},
}) {
  const hasWallets = wallets.length > 0;

  if (compact) {
    if (loading) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          Sam…
        </span>
      );
    }
    if (notConfigured) {
      return <span className="text-xs text-[var(--text-muted)]">Sam —</span>;
    }
    if (error) {
      return (
        <span className="text-xs text-amber-400" title={error}>
          Sam —
        </span>
      );
    }
    if (!hasWallets) {
      return <span className="text-xs text-[var(--text-muted)]">Sam —</span>;
    }
    return (
      <div className="sam-wallet-compact-stack">
        {wallets.map((wallet) => (
          <WalletBlock key={String(wallet.id || wallet.identifier || wallet.provider)} wallet={wallet} lang={lang} compact />
        ))}
      </div>
    );
  }

  return (
    <div className="sam-wallet-card rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-[var(--bg-surface)] to-[var(--bg-primary)] p-5 sm:p-6 w-full sm:min-w-[280px]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-300">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              {t.samWalletTitle}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {t.samWalletHelp}
            </p>
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
            aria-label={t.samWalletRefresh}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-6 text-[var(--text-sec)]">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-300" />
          <span className="text-sm">{t.samWalletLoading}</span>
        </div>
      ) : notConfigured ? (
        <div className="text-sm text-[var(--text-sec)] bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-3">
          {t.samWalletNotConfigured}
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t.samWalletLoadFailed}</p>
            <p className="text-xs opacity-90 mt-0.5">{error}</p>
          </div>
        </div>
      ) : !hasWallets ? (
        <div className="text-sm text-[var(--text-sec)] bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-3">
          {t.samWalletEmpty}
        </div>
      ) : (
        <div className="space-y-4">
          {wallets.map((wallet) => (
            <WalletBlock key={String(wallet.id || wallet.identifier || wallet.provider)} wallet={wallet} lang={lang} />
          ))}
        </div>
      )}

      {onManage && !loading && (
        <button
          type="button"
          onClick={onManage}
          className="action-chip btn btn-primary !h-11 !min-h-11 !border-0 gap-2 px-5 w-full sm:w-auto mt-4"
        >
          <Wallet className="w-4 h-4" />
          {manageLabel || t.samWalletManage}
        </button>
      )}
    </div>
  );
}