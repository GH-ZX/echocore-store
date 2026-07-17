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
    const m = Number(existing?.pricing_margin_percent);
    const pct = Number.isFinite(m) ? m : storeMarkupPercent;
    return { price: priceFromCost(cost, pct), preservePrice: false };
  }

  return { price: priceFromCost(cost, storeMarkupPercent), preservePrice: false };
}
