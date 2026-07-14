import { getOfferCatalogOptionLabel, getOfferDiscount } from './offerDisplay';

export { getOfferDiscount };

export function isValidSaleOffer(offer) {
  if (!offer?.is_sale || offer.active === false) return false;
  const discount = getOfferDiscount(offer);
  return discount != null && discount > 0;
}

export function getSaleOffers(offers = []) {
  return offers
    .filter(isValidSaleOffer)
    .sort((a, b) => Number.parseFloat(a.price) - Number.parseFloat(b.price));
}

export function validateSaleDiscountInputs(salePrice, originalPrice) {
  const sale = Number.parseFloat(salePrice);
  const original = Number.parseFloat(originalPrice);

  if (!Number.isFinite(sale) || sale <= 0) {
    return { valid: false, errorKey: 'adminSaleDiscountInvalidSalePrice' };
  }
  if (!Number.isFinite(original) || original <= 0) {
    return { valid: false, errorKey: 'adminSaleDiscountInvalidOriginalPrice' };
  }
  if (sale >= original) {
    return { valid: false, errorKey: 'adminSaleDiscountSaleMustBeLower' };
  }

  return { valid: true, sale, original };
}

export function buildSaleDiscountPayload(offer, { salePrice, originalPrice, saleImageUrl }) {
  const validation = validateSaleDiscountInputs(salePrice, originalPrice);
  if (!validation.valid) {
    throw new Error('Invalid sale discount values');
  }
  const { sale, original } = validation;

  return {
    id: offer.id,
    name_en: offer.name_en,
    name_ar: offer.name_ar,
    price: sale,
    region: offer.region || null,
    description_en: offer.description_en || '',
    description_ar: offer.description_ar || '',
    sale_image_url: saleImageUrl !== undefined ? (saleImageUrl || null) : (offer.sale_image_url || null),
    is_sale: true,
    original_price: original,
    g2bulk_type: offer.g2bulk_type || null,
    g2bulk_catalogue_name: offer.g2bulk_catalogue_name || null,
    g2bulk_product_id: offer.g2bulk_product_id ?? null,
    g2bulk_cost_usd: offer.g2bulk_cost_usd ?? null,
  };
}

export function buildRemoveSalePayload(offer) {
  const restored = Number.parseFloat(offer.original_price) || Number.parseFloat(offer.price) || 0;

  return {
    id: offer.id,
    name_en: offer.name_en,
    name_ar: offer.name_ar,
    price: restored,
    region: offer.region || null,
    description_en: offer.description_en || '',
    description_ar: offer.description_ar || '',
    sale_image_url: null,
    is_sale: false,
    original_price: null,
    g2bulk_type: offer.g2bulk_type || null,
    g2bulk_catalogue_name: offer.g2bulk_catalogue_name || null,
    g2bulk_product_id: offer.g2bulk_product_id ?? null,
    g2bulk_cost_usd: offer.g2bulk_cost_usd ?? null,
  };
}

/** Catalog selling price (cost + markup) — used as default “old” price for discounts. */
export function getCatalogBasePrice(offer) {
  if (!offer) return null;
  if (!offer.is_sale) {
    const price = Number.parseFloat(offer.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  const original = Number.parseFloat(offer.original_price);
  return Number.isFinite(original) && original > 0 ? original : null;
}

export function formatCatalogBasePrice(offer) {
  const base = getCatalogBasePrice(offer);
  return base != null ? base.toFixed(2) : '';
}

export function formatOfferPickerLabel(offer, games, lang, offers) {
  const label = getOfferCatalogOptionLabel(offer, games, lang, offers);
  const price = Number.parseFloat(offer.price);
  const priceLabel = Number.isFinite(price) ? ` — $${price.toFixed(2)}` : '';
  return `${label}${priceLabel}`;
}