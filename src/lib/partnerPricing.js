import { priceFromCost } from './offerPricing';

/**
 * Plan B partner price: always cost + tier markup when cost is known.
 * Never higher than public shelf price (offer.price).
 */
export function resolvePartnerUnitPrice(offer, partnerMarkupPercent) {
  const publicPrice = Number(offer?.price);
  const cost = Number(offer?.g2bulk_cost_usd);
  const markup = Number(partnerMarkupPercent);

  if (!Number.isFinite(publicPrice) || publicPrice <= 0) return 0;

  if (!Number.isFinite(markup) || markup < 0) {
    return publicPrice;
  }

  if (!Number.isFinite(cost) || cost <= 0) {
    // No supplier cost → no partner discount (safe)
    return publicPrice;
  }

  const partner = priceFromCost(cost, markup);
  if (!Number.isFinite(partner) || partner <= 0) return publicPrice;
  // Cap at public price so partners never pay more than retail
  return Math.min(partner, publicPrice);
}

/** Display price for any shopper (partner or public). */
export function resolveCustomerUnitPrice(offer, { partnerMarkupPercent = null } = {}) {
  if (partnerMarkupPercent != null && Number.isFinite(Number(partnerMarkupPercent))) {
    return resolvePartnerUnitPrice(offer, partnerMarkupPercent);
  }
  const p = Number(offer?.price);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

export function applyPartnerPriceToOffer(offer, partnerMarkupPercent) {
  if (!offer) return offer;
  const publicPrice = Number(offer.price);
  const partnerPrice = resolvePartnerUnitPrice(offer, partnerMarkupPercent);
  if (partnerPrice >= publicPrice - 0.0001) {
    return { ...offer, price: publicPrice, _partnerPriced: false };
  }
  return {
    ...offer,
    price: partnerPrice,
    _publicPrice: publicPrice,
    _partnerPriced: true,
  };
}

export function mapOffersForCustomer(offers = [], partnerMarkupPercent = null) {
  if (partnerMarkupPercent == null || !Number.isFinite(Number(partnerMarkupPercent))) {
    return offers;
  }
  return (offers || []).map((o) => applyPartnerPriceToOffer(o, partnerMarkupPercent));
}
