/** Gentle charm endings — .49 / .89 / .99 tiers within each dollar. */
const CHARM_SUFFIXES = [0.49, 0.89, 0.99];

function charmSuffixForFraction(frac) {
  if (frac < 0.5) return 0.49;
  if (frac < 0.85) return 0.89;
  return 0.99;
}

export function applyCharmPricing(price) {
  const p = Math.round(Number(price) * 100) / 100;
  if (!Number.isFinite(p) || p <= 0) return 0.49;

  const floor = Math.floor(p);
  const frac = Math.round((p - floor) * 100) / 100;

  if (CHARM_SUFFIXES.includes(frac)) return p;

  const suffix = charmSuffixForFraction(frac);
  return Math.round((floor + suffix) * 100) / 100;
}

export function applyMarkup(cost, markupPercent) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return 0.01;
  const marked = base * (1 + Number(markupPercent) / 100);
  return Math.ceil(marked * 100) / 100;
}

export function priceFromCost(cost, markupPercent, charmPricing = false) {
  const marked = applyMarkup(cost, markupPercent);
  return charmPricing ? applyCharmPricing(marked) : marked;
}