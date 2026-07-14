export function applyMarkup(cost: number, markupPercent: number) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return 0.01;
  const marked = base * (1 + markupPercent / 100);
  return Math.ceil(marked * 100) / 100;
}

export function priceFromCost(cost: number, markupPercent: number) {
  return applyMarkup(cost, markupPercent);
}