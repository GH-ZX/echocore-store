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

/** True when the sale price is below G2Bulk supplier cost (would lose money). */
export function getSalePriceLossInfo(offer, salePrice) {
  const cost = getOfferWholesaleCost(offer);
  const sale = Number.parseFloat(salePrice);
  if (cost == null || !Number.isFinite(sale) || sale <= 0) {
    return { isLoss: false, cost, sale: Number.isFinite(sale) ? sale : null };
  }
  return { isLoss: sale < cost, cost, sale };
}