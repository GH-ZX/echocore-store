import { useEffect, useState } from 'react';
import { formatOfferWholesaleCost, hasOfferWholesaleCost } from '../../lib/offerCost';
import { normalizePricingMode } from '../../lib/offerPricing';
import {
  ensureStoreMarkupPercent,
  getCachedStoreMarkupPercent,
} from '../../lib/storeMarkupCache';

/**
 * Admin-only pack cost line, e.g. `$1 + 12%`
 * (sell price is already shown above — do not repeat it)
 */
export default function AdminOfferCostBadge({
  offer,
  t = {},
  storeMarkupPercent = null,
  className = '',
  size = 'sm',
}) {
  const [storeMarkup, setStoreMarkup] = useState(() => {
    if (storeMarkupPercent != null && Number.isFinite(Number(storeMarkupPercent))) {
      return Number(storeMarkupPercent);
    }
    return getCachedStoreMarkupPercent();
  });

  useEffect(() => {
    if (storeMarkupPercent != null && Number.isFinite(Number(storeMarkupPercent))) {
      setStoreMarkup(Number(storeMarkupPercent));
      return undefined;
    }
    let cancelled = false;
    ensureStoreMarkupPercent().then((n) => {
      if (!cancelled) setStoreMarkup(n);
    });
    return () => { cancelled = true; };
  }, [storeMarkupPercent]);

  if (!offer) return null;

  const hasCost = hasOfferWholesaleCost(offer);
  const mode = normalizePricingMode(offer.pricing_mode);
  const costLabel = hasCost ? formatOfferWholesaleCost(offer) : null;

  let line = null;

  if (offer.is_sale && hasCost) {
    line = `$${costLabel} · ${t.sale || 'Sale'}`;
  } else if (mode === 'fixed' && hasCost) {
    line = `$${costLabel} · ${t.pricingModeFixed || 'Fixed price'}`;
  } else if (hasCost) {
    // auto / missing custom → store default. Never Number(null) → 0.
    const rawCustom = offer.pricing_margin_percent;
    const customOk = mode === 'margin'
      && rawCustom != null
      && rawCustom !== ''
      && Number.isFinite(Number(rawCustom));
    const storeOk = storeMarkup != null && Number.isFinite(Number(storeMarkup));
    const marginPct = customOk
      ? Number(rawCustom)
      : (storeOk ? Number(storeMarkup) : null);
    line = marginPct != null ? `$${costLabel} + ${marginPct}%` : `$${costLabel}`;
  }

  if (!line) return null;

  return (
    <span
      className={`admin-offer-cost admin-offer-cost--${size} ${className}`.trim()}
      dir="ltr"
      title={t.adminOfferCostHint}
    >
      {line}
    </span>
  );
}
