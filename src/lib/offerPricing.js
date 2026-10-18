/** Store-wide rounding steps (0 = cents only). Mirrors the DB check + edge fn. */
export const PRICE_ROUND_STEPS = [0, 0.05, 0.1, 0.25, 0.5, 1];

export function normalizeRoundStep(step) {
  const n = Number(step);
  return PRICE_ROUND_STEPS.find((s) => Math.abs(s - n) < 1e-9) ?? 0;
}

/** Round a price UP to the next multiple of `step` (e.g. 0.05: 1.08 → 1.10). */
export function roundUpToStep(price, step) {
  const stepCents = Math.round(normalizeRoundStep(step) * 100);
  const cents = Math.round(Number(price) * 100);
  if (!stepCents || !Number.isFinite(cents)) return cents / 100;
  return (Math.ceil(cents / stepCents) * stepCents) / 100;
}

/** Customer price from supplier cost + markup percent (ceil to cents, then step). */
export function applyMarkup(cost, markupPercent, roundStep = 0) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return 0.01;
  // cost × (100 + markup) is the price in cents; trim float noise before the
  // ceil so 1.00 at 10% is 1.10, not 1.11.
  const cents = Math.ceil(Number((base * (100 + Number(markupPercent))).toFixed(6)));
  return roundUpToStep(cents / 100, roundStep);
}

export function priceFromCost(cost, markupPercent, roundStep = 0) {
  return applyMarkup(cost, markupPercent, roundStep);
}

export const PRICING_MODES = ['auto', 'margin', 'fixed'];

export function normalizePricingMode(mode) {
  const m = String(mode || 'auto').toLowerCase();
  return PRICING_MODES.includes(m) ? m : 'auto';
}

/**
 * Resolve public storefront price for an offer given supplier cost + store default markup.
 * Does not mutate the offer. Partners use partnerPricing.resolvePartnerUnitPrice (plan B).
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
