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

/**
 * Influencer code: % off public shelf price.
 * Never below supplier cost; never above public.
 */
export function resolveInfluencerUnitPrice(offer, discountPercent) {
  const publicPrice = Number(offer?.price);
  const cost = Number(offer?.g2bulk_cost_usd);
  const pct = Number(discountPercent);

  if (!Number.isFinite(publicPrice) || publicPrice <= 0) return 0;
  if (!Number.isFinite(pct) || pct <= 0) return publicPrice;

  let price = Math.ceil(publicPrice * (1 - pct / 100) * 100) / 100;
  if (Number.isFinite(cost) && cost > 0 && price < cost) {
    price = Math.ceil(cost * 100) / 100;
  }
  if (price > publicPrice) price = publicPrice;
  if (price < 0.01) price = 0.01;
  return price;
}

/** Display price for any shopper (partner > influencer > public). */
export function resolveCustomerUnitPrice(offer, {
  partnerMarkupPercent = null,
  influencerDiscountPercent = null,
} = {}) {
  if (partnerMarkupPercent != null && Number.isFinite(Number(partnerMarkupPercent))) {
    return resolvePartnerUnitPrice(offer, partnerMarkupPercent);
  }
  if (influencerDiscountPercent != null && Number.isFinite(Number(influencerDiscountPercent))) {
    return resolveInfluencerUnitPrice(offer, influencerDiscountPercent);
  }
  const p = Number(offer?.price);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

export function applyPartnerPriceToOffer(offer, partnerMarkupPercent) {
  if (!offer) return offer;
  const publicPrice = Number(offer.price);
  const partnerPrice = resolvePartnerUnitPrice(offer, partnerMarkupPercent);
  if (partnerPrice >= publicPrice - 0.0001) {
    return { ...offer, price: publicPrice, _partnerPriced: false, _influencerPriced: false };
  }
  return {
    ...offer,
    price: partnerPrice,
    _publicPrice: publicPrice,
    _partnerPriced: true,
    _influencerPriced: false,
  };
}

export function applyInfluencerPriceToOffer(offer, discountPercent) {
  if (!offer) return offer;
  const publicPrice = Number(offer.price);
  const discounted = resolveInfluencerUnitPrice(offer, discountPercent);
  if (discounted >= publicPrice - 0.0001) {
    return { ...offer, price: publicPrice, _partnerPriced: false, _influencerPriced: false };
  }
  return {
    ...offer,
    price: discounted,
    _publicPrice: publicPrice,
    _partnerPriced: false,
    _influencerPriced: true,
    _influencerDiscountPercent: Number(discountPercent),
  };
}

export function mapOffersForCustomer(
  offers = [],
  partnerMarkupPercent = null,
  influencerDiscountPercent = null,
) {
  if (partnerMarkupPercent != null && Number.isFinite(Number(partnerMarkupPercent))) {
    return (offers || []).map((o) => applyPartnerPriceToOffer(o, partnerMarkupPercent));
  }
  if (influencerDiscountPercent != null && Number.isFinite(Number(influencerDiscountPercent))) {
    return (offers || []).map((o) => applyInfluencerPriceToOffer(o, influencerDiscountPercent));
  }
  return offers;
}
