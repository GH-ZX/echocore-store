import { AlertCircle, Coins, Loader2, Pencil, RefreshCw, Smartphone, Wallet, Zap } from 'lucide-react';
import { SUPPLIER_BRAND } from '../../lib/branding';
import { getG2bulkBalanceLines } from '../../lib/g2bulkWalletFormat';
import { formatSypExchangeRate } from '../../lib/rechargeCurrency';
import {
  formatSamCurrencyAmount,
  getSamAccountLabel,
  getSamSupplierBalanceLines,
} from '../../lib/samWalletFormat';
import AdminDashGoTo from '../admin/AdminDashGoTo';

function isPanelVariant(variant) {
  return variant === 'dropdown' || variant === 'compact';
}

function BalanceStack({ loading, idle, lines = [], variant = 'card', keepVisibleWhileLoading = false }) {
  const panel = isPanelVariant(variant);
  const hasLines = Array.isArray(lines) && lines.length > 0;

  // Prefer last amounts while refreshing; only full-replace with spinner when nothing to show.
  if (loading && !(keepVisibleWhileLoading && hasLines)) {
    return (
      <span className={`supplier-wallets-value supplier-wallets-value--loading${panel ? ' supplier-wallets-value--panel' : ''}`}>
        <Loader2 className={`${panel ? 'w-4 h-4' : 'w-3.5 h-3.5'} animate-spin`} />
      </span>
    );
  }
  if (idle && !hasLines) {
    return (
      <span className={`supplier-wallets-value supplier-wallets-value--empty${panel ? ' supplier-wallets-value--panel' : ''}`}>
        —
      </span>
    );
  }
  if (!hasLines) {
    return (
      <span className={`supplier-wallets-value supplier-wallets-value--empty${panel ? ' supplier-wallets-value--panel' : ''}`}>
        —
      </span>
    );
  }

  return (
    <span
      className={`supplier-wallets-values${panel ? ' supplier-wallets-values--panel' : ''}`}
      dir="ltr"
    >
      {lines.map((line) => (
        <span key={line.currency} className="supplier-wallets-value font-mono">
          {formatSamCurrencyAmount(line.currency, line.amount)}
        </span>
      ))}
      {loading ? (
        <Loader2 className={`${panel ? 'w-3.5 h-3.5' : 'w-3 h-3'} animate-spin opacity-60 shrink-0`} />
      ) : null}
    </span>
  );
}

function WalletRow({
  icon: Icon,
  label,
  hint,
  loading,
  idle,
  lines,
  variant = 'card',
  onClick,
  keepVisibleWhileLoading = false,
}) {
  const Tag = onClick ? 'button' : 'div';
  const rowMod = variant === 'dropdown'
    ? ' supplier-wallets-row--dropdown'
    : (variant === 'compact' ? ' supplier-wallets-row--compact' : '');
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`supplier-wallets-row${rowMod}${onClick ? ' supplier-wallets-row--clickable' : ''}`}
    >
      <span className="supplier-wallets-row__lead">
        <span className="supplier-wallets-row__icon" aria-hidden="true">
          <Icon strokeWidth={2} />
        </span>
        <span className="supplier-wallets-row__copy">
          <span className="supplier-wallets-row__label">{label}</span>
          {hint ? <span className="supplier-wallets-row__hint">{hint}</span> : null}
        </span>
      </span>
      <BalanceStack
        loading={loading}
        idle={idle}
        lines={lines}
        variant={variant}
        keepVisibleWhileLoading={keepVisibleWhileLoading}
      />
    </Tag>
  );
}

export default function AdminSupplierWalletsCard({
  t = {},
  lang = 'ar',
  variant = 'card',
  /** null = unknown (do not invent $0); 0 is a valid balance */
  g2bulkBalance = null,
  g2bulkUsername = '',
  g2bulkError = null,
  g2bulkFetched = false,
  samWallets = [],
  samError = null,
  samNotConfigured = false,
  samFetched = false,
  loading = false,
  idle = false,
  idleHint = '',
  onRefresh,
  onOpenDashboard,
  onOpenPayments,
  onOpenExchangeRate,
  /** Same style as other overview section “go to page” buttons */
  goToLabel = '',
  onGoToPage,
  sypPerUsd: sypPerUsdProp,
}) {
  const rowNav = variant === 'dropdown' || variant === 'compact';
  const sypPerUsd = sypPerUsdProp ?? null;
  const sypRateLabel = sypPerUsd != null ? formatSypExchangeRate(sypPerUsd) : '—';
  const samLabel = isPanelVariant(variant)
    ? (t.samWalletShort || 'Sam API')
    : getSamAccountLabel(samWallets, t.samWalletTitle);
  const g2bulkLines = g2bulkBalance == null
    ? []
    : getG2bulkBalanceLines({ balance: g2bulkBalance });
  const samLines = getSamSupplierBalanceLines(samWallets);
  const showActions = variant === 'card' && (onOpenDashboard || onOpenPayments);
  const showHeader = variant !== 'dropdown';
  const showIdleHint = idle && idleHint && variant === 'card';
  const statusMessage = g2bulkError || samError || (samNotConfigured ? t.samWalletNotConfigured : '');
  const showGoTo = variant === 'card' && goToLabel && typeof onGoToPage === 'function';

  return (
    <div className={`supplier-wallets-card supplier-wallets-card--${variant}`}>
      {showHeader && (
        <div className="supplier-wallets-card__header">
          <div className="supplier-wallets-card__title-block">
            <span className="supplier-wallets-card__badge" aria-hidden="true">
              <Wallet strokeWidth={2} />
            </span>
            <div>
              <p className="supplier-wallets-card__title">{t.supplierWalletsTitle}</p>
              <p className="supplier-wallets-card__subtitle">{t.supplierWalletsHelp}</p>
            </div>
          </div>
          <div className="supplier-wallets-card__header-actions">
            {onRefresh && (
              <button
                type="button"
                onClick={() => onRefresh()}
                disabled={loading}
                className="supplier-wallets-card__refresh"
                aria-label={t.supplierWalletsRefresh}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
              </button>
            )}
            {showGoTo ? (
              <AdminDashGoTo
                label={goToLabel}
                onClick={onGoToPage}
                lang={lang}
              />
            ) : null}
          </div>
        </div>
      )}

      <div className={`supplier-wallets-card__rows${variant !== 'card' ? ' supplier-wallets-card__rows--compact' : ''}`}>
        <WalletRow
          icon={Zap}
          label={SUPPLIER_BRAND}
          hint={variant === 'card' && g2bulkUsername ? g2bulkUsername : null}
          loading={loading}
          idle={!g2bulkFetched}
          lines={g2bulkLines}
          variant={variant}
          onClick={rowNav ? onOpenDashboard : undefined}
          keepVisibleWhileLoading
        />
        <WalletRow
          icon={Smartphone}
          label={samLabel}
          hint={null}
          loading={loading}
          idle={!samFetched}
          lines={samLines}
          variant={variant}
          onClick={rowNav ? onOpenPayments : undefined}
          keepVisibleWhileLoading
        />
      </div>

      {onOpenExchangeRate && (
        <div className={`supplier-wallets-exchange supplier-wallets-exchange--${variant}`}>
          {variant === 'card' ? (
            <div className="supplier-wallets-exchange__card">
              <div className="supplier-wallets-exchange__meta">
                <span className="supplier-wallets-exchange__icon" aria-hidden="true">
                  <Coins strokeWidth={2} />
                </span>
                <div>
                  <p className="supplier-wallets-exchange__title">{t.adminSypRateTitle}</p>
                  <p className="supplier-wallets-exchange__value" dir="ltr">{sypRateLabel}</p>
                  {t.adminSypRateHelp ? (
                    <p className="supplier-wallets-exchange__hint">{t.adminSypRateHelp}</p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenExchangeRate}
                className="supplier-wallets-card__action supplier-wallets-card__action--secondary supplier-wallets-exchange__btn"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
                {t.adminSypRateEdit}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenExchangeRate}
              className="supplier-wallets-exchange__row"
            >
              <span className="supplier-wallets-exchange__row-lead">
                <span className="supplier-wallets-exchange__icon" aria-hidden="true">
                  <Coins strokeWidth={2} />
                </span>
                <span className="supplier-wallets-exchange__row-copy">
                  <span className="supplier-wallets-exchange__row-label">{t.adminSypRateTitle}</span>
                  <span className="supplier-wallets-exchange__row-value" dir="ltr">{sypRateLabel}</span>
                </span>
              </span>
              <span className="supplier-wallets-exchange__row-action">{t.adminSypRateEdit}</span>
            </button>
          )}
        </div>
      )}

      {showIdleHint && (
        <p className="supplier-wallets-card__idle-hint">{idleHint}</p>
      )}

      {variant === 'card' && statusMessage && !idle && (
        <div className={`supplier-wallets-card__alert${samNotConfigured && !g2bulkError && !samError ? ' supplier-wallets-card__alert--muted' : ''}`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {showActions && (
        <div className="supplier-wallets-card__actions">
          {onOpenDashboard && (
            <button type="button" onClick={onOpenDashboard} className="supplier-wallets-card__action">
              {t.g2bulkDashboard}
            </button>
          )}
          {onOpenPayments && (
            <button type="button" onClick={onOpenPayments} className="supplier-wallets-card__action supplier-wallets-card__action--secondary">
              {t.samWalletManage}
            </button>
          )}
        </div>
      )}
    </div>
  );
}