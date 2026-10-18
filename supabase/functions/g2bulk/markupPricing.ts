/** Allowed store-wide rounding steps (0 = cents only). Mirrors the DB check. */
export const PRICE_ROUND_STEPS = [0, 0.05, 0.1, 0.25, 0.5, 1];

export function normalizeRoundStep(step: unknown): number {
  const n = Number(step);
  return PRICE_ROUND_STEPS.find((s) => Math.abs(s - n) < 1e-9) ?? 0;
}

/** Round a price UP to the next multiple of `step` (e.g. 0.05: 1.08 → 1.10). */
export function roundUpToStep(price: number, step: unknown) {
  const stepCents = Math.round(normalizeRoundStep(step) * 100);
  const cents = Math.round(Number(price) * 100);
  if (!stepCents || !Number.isFinite(cents)) return cents / 100;
  return (Math.ceil(cents / stepCents) * stepCents) / 100;
}

export function applyMarkup(cost: number, markupPercent: number, roundStep: unknown = 0) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return 0.01;
  // cost × (100 + markup) is the price in cents. Trim float noise before the
  // ceil so 1.00 at 10% is 1.10, not 1.11.
  const cents = Math.ceil(Number((base * (100 + Number(markupPercent))).toFixed(6)));
  return roundUpToStep(cents / 100, roundStep);
}

export function priceFromCost(cost: number, markupPercent: number, roundStep: unknown = 0) {
  return applyMarkup(cost, markupPercent, roundStep);
}

export type PricingMode = 'auto' | 'margin' | 'fixed';

export function normalizePricingMode(mode: unknown): PricingMode {
  const m = String(mode || 'auto').toLowerCase();
  if (m === 'fixed' || m === 'margin') return m;
  return 'auto';
}

/** Customer price for sync: respect per-offer mode / sale lock. */
export function resolveSyncedPrice(
  existing: {
    is_sale?: boolean | null;
    pricing_mode?: string | null;
    pricing_margin_percent?: number | null;
    price?: number | null;
  } | null | undefined,
  cost: number,
  storeMarkupPercent: number,
  roundStep: unknown = 0,
): { price: number; preservePrice: boolean } {
  const mode = normalizePricingMode(existing?.pricing_mode);
  const sale = !!existing?.is_sale;

  if (sale || mode === 'fixed') {
    const locked = Number(existing?.price);
    const costCeil = Math.ceil(cost * 100) / 100;
    // Hard rule: fixed/sale price must never fall below wholesale supplier cost
    const safePrice = Number.isFinite(locked) && locked >= costCeil
      ? locked
      : priceFromCost(cost, storeMarkupPercent, roundStep);
    return {
      price: safePrice,
      preservePrice: safePrice === locked,
    };
  }

  if (mode === 'margin') {
    const raw = existing?.pricing_margin_percent;
    // Number(null) === 0 would wipe store markup — only use explicit numbers
    const m = raw == null || raw === '' ? NaN : Number(raw);
    const pct = Number.isFinite(m) && m >= 0 ? m : storeMarkupPercent;
    return { price: priceFromCost(cost, pct, roundStep), preservePrice: false };
  }

  const store = Number(storeMarkupPercent);
  const safeStore = Number.isFinite(store) && store >= 0 ? store : 12;
  return { price: priceFromCost(cost, safeStore, roundStep), preservePrice: false };
}
