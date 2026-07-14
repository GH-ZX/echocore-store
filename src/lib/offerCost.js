/** Raw G2Bulk supplier cost (USD) — unchanged by markup. */

export function getOfferWholesaleCost(offer) {
  const raw = offer?.g2bulk_cost_usd;
  if (raw == null || raw === '') return null;
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

export function hasOfferWholesaleCost(offer) {
  return getOfferWholesaleCost(offer) != null;
}

export function formatOfferWholesaleCost(offer) {
  const cost = getOfferWholesaleCost(offer);
  if (cost == null) return null;
  return cost.toFixed(4).replace(/\.?0+$/, '') || '0';
}