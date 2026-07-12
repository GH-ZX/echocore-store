import { AlertCircle, Loader2, RefreshCw, Smartphone, Wallet, Zap } from 'lucide-react';
import { SUPPLIER_BRAND } from '../../lib/branding';
import {
  formatSamCurrencyAmount,
  getSamAccountLabel,
  getSamSupplierBalanceLines,
} from '../../lib/samWalletFormat';

function isPanelVariant(variant) {
  return variant === 'dropdown' || variant === 'compact';
}

function BalanceStack({ loading, idle, lines = [], variant = 'card' }) {
  const panel = isPanelVariant(variant);

  if (loading) {
    return (
      <span className={`supplier-wallets-value supplier-wallets-value--loading${panel ? ' supplier-wallets-value--panel' : ''}`}>
        <Loader2 className={`${panel ? 'w-4 h-4' : 'w-3.5 h-3.5'} animate-spin`} />
      </span>
    );
  }
  if (idle) {
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
      />
    </Tag>
  );
}

export default function AdminSupplierWalletsCard({
  t = {},
  variant = 'card',
  g2bulkBalance = 0,
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
}) {
  const rowNav = variant === 'dropdown' || variant === 'compact';
  const samLabel = isPanelVariant(variant)
    ? (t.samWalletShort || 'Sam API')
    : getSamAccountLabel(samWallets, t.samWalletTitle);
  const g2bulkLines = [{ currency: 'USD', amount: g2bulkBalance }];
  const samLines = getSamSupplierBalanceLines(samWallets);
  const showActions = variant === 'card' && (onOpenDashboard || onOpenPayments);
  const showHeader = variant !== 'dropdown';
  const showIdleHint = idle && idleHint && variant === 'card';
  const statusMessage = g2bulkError || samError || (samNotConfigured ? t.samWalletNotConfigured : '');

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
        />
      </div>

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