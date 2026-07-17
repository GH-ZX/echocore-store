import { formatMessage } from '../../lib/i18n';
import { formatOfferWholesaleCost, hasOfferWholesaleCost } from '../../lib/offerCost';
import { normalizePricingMode, pricingModeLabel } from '../../lib/offerPricing';

export default function AdminOfferCostBadge({
  offer,
  t = {},
  className = '',
  size = 'sm',
}) {
  if (!offer) return null;

  const hasCost = hasOfferWholesaleCost(offer);
  const mode = normalizePricingMode(offer.pricing_mode);
  const showMode = mode === 'fixed' || mode === 'margin' || offer.is_sale;
  if (!hasCost && !showMode) return null;

  const cost = hasCost ? formatOfferWholesaleCost(offer) : null;
  const modeText = offer.is_sale
    ? (t.sale || 'Sale')
    : mode === 'fixed'
      ? (t.pricingModeFixed || 'Fixed')
      : mode === 'margin'
        ? `${pricingModeLabel(mode, t)}${offer.pricing_margin_percent != null ? ` ${offer.pricing_margin_percent}%` : ''}`
        : null;

  return (
    <span
      className={`admin-offer-cost admin-offer-cost--${size} ${className}`.trim()}
      dir="ltr"
      title={t.adminOfferCostHint}
    >
      {cost != null && formatMessage(t.adminOfferCost, { cost: `$${cost}` })}
      {cost != null && modeText && ' · '}
      {modeText}
    </span>
  );
}