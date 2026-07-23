/**
 * Wholesale cost access: public catalog never carries g2bulk_cost_usd.
 * Admins load cost via RPC; partners/influencers get unit prices via RPC.
 */
import { supabase } from './supabase';

/** Fields that must never appear on storefront offer objects from PostgREST. */
export const OFFER_SECRET_FIELDS = Object.freeze([
  'g2bulk_cost_usd',
  'pricing_margin_percent',
]);

/** Strip supplier cost / margin from an offer (defense in depth). */
export function stripOfferSecrets(offer) {
  if (!offer || typeof offer !== 'object') return offer;
  const next = { ...offer };
  for (const key of OFFER_SECRET_FIELDS) {
    if (key in next) delete next[key];
  }
  return next;
}

export function stripOffersSecrets(offers = []) {
  return (offers || []).map(stripOfferSecrets);
}

/**
 * Merge admin wholesale RPC payload into offer rows.
 * @param {object[]} offers
 * @param {Record<string, { g2bulk_cost_usd?: number, pricing_mode?: string, pricing_margin_percent?: number }>} map
 */
export function mergeWholesaleIntoOffers(offers = [], map = {}) {
  if (!map || typeof map !== 'object') return offers || [];
  return (offers || []).map((offer) => {
    if (!offer?.id) return offer;
    const row = map[offer.id] || map[String(offer.id)];
    if (!row || typeof row !== 'object') return offer;
    return {
      ...offer,
      g2bulk_cost_usd: row.g2bulk_cost_usd ?? row.g2bulkCostUsd ?? null,
      pricing_mode: row.pricing_mode ?? row.pricingMode ?? offer.pricing_mode,
      pricing_margin_percent:
        row.pricing_margin_percent ?? row.pricingMarginPercent ?? null,
    };
  });
}

/**
 * Apply get_my_offer_unit_prices map onto offers (mutates price for checkout UI).
 */
export function applyUnitPriceMap(offers = [], priceMap = {}) {
  if (!priceMap || typeof priceMap !== 'object') return offers || [];
  return (offers || []).map((offer) => {
    if (!offer?.id) return offer;
    const row = priceMap[offer.id] || priceMap[String(offer.id)];
    if (!row || typeof row !== 'object') return offer;

    const publicPrice = Number(row.publicPrice ?? row.public_price ?? offer.price);
    const unitPrice = Number(row.unitPrice ?? row.unit_price ?? publicPrice);
    const partnerPriced = !!(row.partnerPriced ?? row.partner_priced);
    const influencerPriced = !!(row.influencerPriced ?? row.influencer_priced);

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return offer;

    if (partnerPriced || influencerPriced) {
      return {
        ...offer,
        price: unitPrice,
        _publicPrice: Number.isFinite(publicPrice) ? publicPrice : Number(offer.price),
        _partnerPriced: partnerPriced,
        _influencerPriced: influencerPriced,
      };
    }

    return {
      ...offer,
      price: Number.isFinite(publicPrice) ? publicPrice : offer.price,
      _partnerPriced: false,
      _influencerPriced: false,
    };
  });
}

function parseJsonMap(data) {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) || {};
    } catch {
      return {};
    }
  }
  if (typeof data === 'object') return data;
  return {};
}

/** Admin-only: id → wholesale fields. Returns {} if not admin / RPC missing. */
export async function fetchAdminOfferWholesale(offerIds = null) {
  const payload = {
    p_ids: Array.isArray(offerIds) && offerIds.length > 0 ? offerIds : null,
  };
  const { data, error } = await supabase.rpc('admin_get_offer_wholesale', payload);
  if (error) {
    // Pre-migration or non-admin — caller falls back silently
    if (/function|does not exist|Unauthorized|unauthorized/i.test(error.message || '')) {
      return {};
    }
    console.warn('admin_get_offer_wholesale:', error.message);
    return {};
  }
  return parseJsonMap(data);
}

/** Logged-in shopper unit prices (partner / influencer code). */
export async function fetchMyOfferUnitPrices(offerIds = null, influencerCode = null) {
  const payload = {
    p_ids: Array.isArray(offerIds) && offerIds.length > 0 ? offerIds : null,
    p_influencer_code: influencerCode ? String(influencerCode).trim() : null,
  };
  const { data, error } = await supabase.rpc('get_my_offer_unit_prices', payload);
  if (error) {
    if (/function|does not exist|Unauthorized|unauthorized/i.test(error.message || '')) {
      return {};
    }
    console.warn('get_my_offer_unit_prices:', error.message);
    return {};
  }
  return parseJsonMap(data);
}

/** Load offers then attach admin wholesale when caller is admin. */
export async function withAdminWholesale(offers = [], { isAdmin = false } = {}) {
  const cleaned = stripOffersSecrets(offers);
  if (!isAdmin || !cleaned.length) return cleaned;
  const ids = cleaned.map((o) => o.id).filter(Boolean);
  const map = await fetchAdminOfferWholesale(ids);
  if (!map || !Object.keys(map).length) return cleaned;
  return mergeWholesaleIntoOffers(cleaned, map);
}
