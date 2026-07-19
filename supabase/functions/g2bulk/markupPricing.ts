export function applyMarkup(cost: number, markupPercent: number) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return 0.01;
  const marked = base * (1 + markupPercent / 100);
  return Math.ceil(marked * 100) / 100;
}

export function priceFromCost(cost: number, markupPercent: number) {
  return applyMarkup(cost, markupPercent);
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
): { price: number; preservePrice: boolean } {
  const mode = normalizePricingMode(existing?.pricing_mode);
  const sale = !!existing?.is_sale;

  if (sale || mode === 'fixed') {
    const locked = Number(existing?.price);
    return {
      price: Number.isFinite(locked) && locked > 0
        ? locked
        : priceFromCost(cost, storeMarkupPercent),
      preservePrice: true,
    };
  }

  if (mode === 'margin') {
    const raw = existing?.pricing_margin_percent;
    // Number(null) === 0 would wipe store markup — only use explicit numbers
    const m = raw == null || raw === '' ? NaN : Number(raw);
    const pct = Number.isFinite(m) && m >= 0 ? m : storeMarkupPercent;
    return { price: priceFromCost(cost, pct), preservePrice: false };
  }

  const store = Number(storeMarkupPercent);
  const safeStore = Number.isFinite(store) && store >= 0 ? store : 12;
  return { price: priceFromCost(cost, safeStore), preservePrice: false };
}
