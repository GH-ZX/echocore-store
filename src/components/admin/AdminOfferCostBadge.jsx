import { formatMessage } from '../../lib/i18n';
import { formatOfferWholesaleCost, hasOfferWholesaleCost } from '../../lib/offerCost';

export default function AdminOfferCostBadge({
  offer,
  t = {},
  className = '',
  size = 'sm',
}) {
  if (!offer || !hasOfferWholesaleCost(offer)) return null;

  const cost = formatOfferWholesaleCost(offer);

  return (
    <span
      className={`admin-offer-cost admin-offer-cost--${size} ${className}`.trim()}
      dir="ltr"
      title={t.adminOfferCostHint}
    >
      {formatMessage(t.adminOfferCost, { cost: `$${cost}` })}
    </span>
  );
}