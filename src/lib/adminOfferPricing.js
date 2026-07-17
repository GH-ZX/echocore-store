import { supabase } from './supabase';
import { normalizePricingMode, priceFromCost, resolveOfferPrice } from './offerPricing';
import { fetchG2bulkSettings } from './g2bulk';

const PRICING_COLUMNS_HINT =
  'Database missing pricing columns. Run scripts/offer-pricing-modes-migration.sql in Supabase SQL Editor, then retry.';

function mapPricingDbError(error) {
  const msg = error?.message || String(error || 'Database error');
  if (/pricing_mode|pricing_margin|column .* does not exist|schema cache/i.test(msg)) {
    return new Error(PRICING_COLUMNS_HINT);
  }
  return error instanceof Error ? error : new Error(msg);
}

export async function fetchStoreMarkupPercent() {
  try {
    const settings = await fetchG2bulkSettings();
    const n = Number(settings?.g2bulk_markup_percent);
    // Prefer real store value; 0 is valid; only default when missing/invalid
    if (Number.isFinite(n) && n >= 0) return n;
    return 15;
  } catch {
    return 15;
  }
}

/**
 * Persist per-offer pricing policy + customer price to Supabase.
 * Used for top-up and redeem packs (same offers table).
 */
export async function persistOfferPricing(offerId, {
  pricing_mode = 'auto',
  pricing_margin_percent = null,
  price = null,
  is_sale = false,
} = {}) {
  if (!offerId) throw new Error('offerId required');

  const mode = is_sale ? 'fixed' : normalizePricingMode(pricing_mode);
  const patch = {
    pricing_mode: mode,
    pricing_margin_percent: mode === 'margin'
      ? (Number.isFinite(Number(pricing_margin_percent)) ? Number(pricing_margin_percent) : null)
      : null,
  };

  if (price != null && price !== '') {
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p <= 0) {
      throw new Error('Invalid price');
    }
    patch.price = p;
  }

  if (mode === 'margin' && (patch.pricing_margin_percent == null || patch.pricing_margin_percent < 0)) {
    throw new Error('margin_required');
  }

  const { data, error } = await supabase
    .from('offers')
    .update(patch)
    .eq('id', offerId)
    .select('id, price, pricing_mode, pricing_margin_percent, g2bulk_cost_usd, is_sale, game_id, name_en, name_ar')
    .single();

  if (error) throw mapPricingDbError(error);
  if (!data) throw new Error('Offer not found or update blocked (RLS).');
  return data;
}

/**
 * Apply pricing policy to every offer under a game (top-up + redeem packs).
 * Writes pricing_mode / pricing_margin_percent / price into the database.
 * @param {'auto'|'margin'|'fixed_current'} action
 */
export async function applyGameOffersPricing(gameId, action, {
  marginPercent = null,
  storeMarkupPercent = 15,
} = {}) {
  if (!gameId) throw new Error('gameId required');

  const { data: rows, error } = await supabase
    .from('offers')
    .select('id, price, g2bulk_cost_usd, pricing_mode, pricing_margin_percent, is_sale')
    .eq('game_id', gameId);

  if (error) throw mapPricingDbError(error);
  const offers = rows || [];
  if (offers.length === 0) return { updated: 0, offers: [] };

  const updatedRows = [];
  for (const offer of offers) {
    // Sale packs keep sale workflow; skip bulk policy overwrite
    if (offer.is_sale) continue;

    let patch;
    if (action === 'auto') {
      const cost = Number(offer.g2bulk_cost_usd);
      patch = {
        pricing_mode: 'auto',
        pricing_margin_percent: null,
        price: Number.isFinite(cost) && cost > 0
          ? priceFromCost(cost, storeMarkupPercent)
          : Number(offer.price) || 0.01,
      };
    } else if (action === 'margin') {
      const m = Number(marginPercent);
      if (!Number.isFinite(m) || m < 0) throw new Error('Invalid margin percent');
      const cost = Number(offer.g2bulk_cost_usd);
      patch = {
        pricing_mode: 'margin',
        pricing_margin_percent: m,
        price: Number.isFinite(cost) && cost > 0
          ? priceFromCost(cost, m)
          : Number(offer.price) || 0.01,
      };
    } else if (action === 'fixed_current') {
      patch = {
        pricing_mode: 'fixed',
        // keep current price as locked value
        price: Number(offer.price) || 0.01,
      };
    } else {
      throw new Error('Unknown pricing action');
    }

    const { data: saved, error: upErr } = await supabase
      .from('offers')
      .update(patch)
      .eq('id', offer.id)
      .select('id, price, pricing_mode, pricing_margin_percent, g2bulk_cost_usd, is_sale, game_id')
      .single();

    if (upErr) throw mapPricingDbError(upErr);
    if (saved) updatedRows.push(saved);
  }

  return { updated: updatedRows.length, offers: updatedRows };
}

export function buildOfferPricingPayload(form, { previousPrice } = {}) {
  const mode = normalizePricingMode(form.pricing_mode);
  const price = parseFloat(form.price);
  const margin = form.pricing_margin_percent === '' || form.pricing_margin_percent == null
    ? null
    : parseFloat(form.pricing_margin_percent);
  const cost = form.g2bulk_cost_usd === '' || form.g2bulk_cost_usd == null
    ? null
    : parseFloat(form.g2bulk_cost_usd);

  if (mode === 'margin' && (!Number.isFinite(margin) || margin < 0)) {
    throw new Error('margin_required');
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('price_required');
  }

  return {
    pricing_mode: mode,
    pricing_margin_percent: mode === 'margin' ? margin : null,
    price,
    g2bulk_cost_usd: Number.isFinite(cost) ? cost : null,
    // Detect silent lock: admin changed price while leaving auto
    _priceChangedFromAuto:
      mode === 'auto'
      && previousPrice != null
      && Number(previousPrice) !== price,
  };
}

export function effectiveSavePricingMode(payload) {
  if (payload._priceChangedFromAuto) {
    return {
      ...payload,
      pricing_mode: 'fixed',
    };
  }
  return payload;
}

export { resolveOfferPrice, priceFromCost, normalizePricingMode };
