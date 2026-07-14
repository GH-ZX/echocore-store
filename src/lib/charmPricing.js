export function applyMarkup(cost, markupPercent) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return 0.01;
  const marked = base * (1 + Number(markupPercent) / 100);
  return Math.ceil(marked * 100) / 100;
}

export function priceFromCost(cost, markupPercent) {
  return applyMarkup(cost, markupPercent);
}