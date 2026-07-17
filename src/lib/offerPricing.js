/** Customer price from supplier cost + markup percent (ceil to cents). */
export function applyMarkup(cost, markupPercent) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return 0.01;
  const marked = base * (1 + Number(markupPercent) / 100);
  return Math.ceil(marked * 100) / 100;
}

export function priceFromCost(cost, markupPercent) {
  return applyMarkup(cost, markupPercent);
}

export const PRICING_MODES = ['auto', 'margin', 'fixed'];

export function normalizePricingMode(mode) {
  const m = String(mode || 'auto').toLowerCase();
  return PRICING_MODES.includes(m) ? m : 'auto';
}

/**
 * Resolve storefront price for an offer given supplier cost + store default markup.
 * Does not mutate the offer.
 */
export function resolveOfferPrice(offer, cost, storeMarkupPercent) {
  const mode = normalizePricingMode(offer?.pricing_mode);
  const c = Number(cost ?? offer?.g2bulk_cost_usd);

  if (mode === 'fixed' || offer?.is_sale) {
    const locked = Number(offer?.price);
    return Number.isFinite(locked) && locked > 0 ? locked : priceFromCost(c, storeMarkupPercent);
  }

  if (mode === 'margin') {
    const m = Number(offer?.pricing_margin_percent);
    const pct = Number.isFinite(m) ? m : Number(storeMarkupPercent) || 0;
    return priceFromCost(c, pct);
  }

  return priceFromCost(c, storeMarkupPercent);
}

export function pricingModeLabel(mode, t = {}) {
  const m = normalizePricingMode(mode);
  if (m === 'fixed') return t.pricingModeFixed || 'Fixed price';
  if (m === 'margin') return t.pricingModeMargin || 'Custom margin';
  return t.pricingModeAuto || 'Store default';
}
