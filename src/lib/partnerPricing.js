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
    return publicPrice;
  }

  const partner = priceFromCost(cost, markup);
  if (!Number.isFinite(partner) || partner <= 0) return publicPrice;
  return Math.min(partner, publicPrice);
}

/**
 * Influencer buyer price: cost * (1 + buyerMarkup%), never above public, never below cost.
 * Example: cost $1, public $1.12, buyerMarkup 10 → $1.10
 */
export function resolveInfluencerUnitPrice(offer, buyerMarkupPercent) {
  const publicPrice = Number(offer?.price);
  const cost = Number(offer?.g2bulk_cost_usd);
  const pct = Number(buyerMarkupPercent);

  if (!Number.isFinite(publicPrice) || publicPrice <= 0) return 0;
  if (!Number.isFinite(cost) || cost <= 0) return publicPrice;
  if (!Number.isFinite(pct) || pct < 0) return publicPrice;

  let price = Math.ceil(cost * (1 + pct / 100) * 100) / 100;
  if (price < cost) price = Math.ceil(cost * 100) / 100;
  if (price > publicPrice) price = publicPrice;
  if (price < 0.01) price = 0.01;
  return price;
}

/** Influencer commission on one unit: % of margin (public − cost), capped by (buyer − cost). */
export function resolveInfluencerCommissionPerUnit(offer, buyerPrice, influencerMarginPercent) {
  const publicPrice = Number(offer?.price);
  const cost = Number(offer?.g2bulk_cost_usd);
  const paid = Number(buyerPrice);
  const pct = Number(influencerMarginPercent);

  if (!Number.isFinite(publicPrice) || !Number.isFinite(cost) || cost <= 0) return 0;
  if (publicPrice <= cost || !Number.isFinite(pct) || pct <= 0) return 0;

  const margin = publicPrice - cost;
  let comm = Math.round(margin * (pct / 100) * 100) / 100;
  const room = Math.max(0, (Number.isFinite(paid) ? paid : publicPrice) - cost);
  if (comm > room) comm = room;
  if (comm < 0.01) return 0;
  return comm;
}

/** Display price for any shopper (partner > influencer > public). */
export function resolveCustomerUnitPrice(offer, {
  partnerMarkupPercent = null,
  influencerBuyerMarkupPercent = null,
} = {}) {
  if (partnerMarkupPercent != null && Number.isFinite(Number(partnerMarkupPercent))) {
    return resolvePartnerUnitPrice(offer, partnerMarkupPercent);
  }
  if (influencerBuyerMarkupPercent != null && Number.isFinite(Number(influencerBuyerMarkupPercent))) {
    return resolveInfluencerUnitPrice(offer, influencerBuyerMarkupPercent);
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

export function applyInfluencerPriceToOffer(offer, buyerMarkupPercent, influencerMarginPercent = null) {
  if (!offer) return offer;
  const publicPrice = Number(offer.price);
  const discounted = resolveInfluencerUnitPrice(offer, buyerMarkupPercent);
  if (discounted >= publicPrice - 0.0001) {
    return { ...offer, price: publicPrice, _partnerPriced: false, _influencerPriced: false };
  }
  const commission = resolveInfluencerCommissionPerUnit(
    offer,
    discounted,
    influencerMarginPercent,
  );
  return {
    ...offer,
    price: discounted,
    _publicPrice: publicPrice,
    _partnerPriced: false,
    _influencerPriced: true,
    _influencerBuyerMarkupPercent: Number(buyerMarkupPercent),
    _influencerMarginPercent: influencerMarginPercent != null
      ? Number(influencerMarginPercent)
      : null,
    _influencerCommission: commission,
  };
}

export function mapOffersForCustomer(
  offers = [],
  partnerMarkupPercent = null,
  influencerCoupon = null,
) {
  if (partnerMarkupPercent != null && Number.isFinite(Number(partnerMarkupPercent))) {
    return (offers || []).map((o) => applyPartnerPriceToOffer(o, partnerMarkupPercent));
  }
  const buyerMarkup = influencerCoupon?.buyerMarkupPercent;
  if (buyerMarkup != null && Number.isFinite(Number(buyerMarkup))) {
    return (offers || []).map((o) => applyInfluencerPriceToOffer(
      o,
      buyerMarkup,
      influencerCoupon?.influencerMarginPercent,
    ));
  }
  return offers;
}
