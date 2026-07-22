import { getMaxCartLines } from './purchaseLock';

const CART_STORAGE_KEY = 'echocore-cart';
const CART_STORAGE_VERSION = 1;

const CART_SNAPSHOT_FIELDS = [
  'id',
  'game_id',
  'name_ar',
  'name_en',
  'price',
  'color',
  'is_sale',
  'original_price',
  'sale_image_url',
  'g2bulk_type',
  'active',
];

export { getMaxCartLines };

/** True when cart is at the multi-buy line limit. */
export function isCartFull(cart = []) {
  return (cart?.length || 0) >= getMaxCartLines();
}

function createCartLineId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Slim offer snapshot for cart storage (avoids stale nested data). */
export function pickCartSnapshot(offer, existingLineId) {
  const snapshot = CART_SNAPSHOT_FIELDS.reduce((acc, key) => {
    if (offer[key] !== undefined) acc[key] = offer[key];
    return acc;
  }, {});

  snapshot._cartLineId = existingLineId || createCartLineId();
  return snapshot;
}

/**
 * Load cart from localStorage.
 * Cart is browser-local (not DB) so it survives refresh on the same device.
 */
export function loadCartFromStorage() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Support legacy bare array and versioned envelope
    const list = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.items) ? parsed.items : []);
    return list
      .filter((item) => item && item.id != null)
      .map((item) => ({
        ...item,
        _cartLineId: item._cartLineId || createCartLineId(),
      }));
  } catch {
    return [];
  }
}

/** Persist cart. Never write until after first hydrate (caller responsibility). */
export function saveCartToStorage(cart = []) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        v: CART_STORAGE_VERSION,
        items: Array.isArray(cart) ? cart : [],
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * Reconcile cart with catalog.
 * - Missing from catalog: keep snapshot (avoid wiping cart while catalog is partial/loading)
 * - Found + active=false: remove
 * - Found + active: refresh price/name snapshot
 */
export function syncCartWithOffers(cart, offers = []) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return { items: [], removedCount: 0, priceUpdated: false };
  }

  // Catalog not ready — do not purge lines
  if (!Array.isArray(offers) || offers.length === 0) {
    return { items: cart, removedCount: 0, priceUpdated: false };
  }

  const offerMap = new Map(offers.map((offer) => [String(offer.id), offer]));
  let removedCount = 0;
  let priceUpdated = false;

  const items = cart
    .map((item) => {
      const fresh = offerMap.get(String(item.id));
      if (!fresh) {
        // Keep last known snapshot so refresh does not empty the cart
        return item;
      }
      if (fresh.active === false) {
        removedCount += 1;
        return null;
      }

      const nextPrice = parseFloat(fresh.price);
      const prevPrice = parseFloat(item.price);
      if (!Number.isNaN(nextPrice) && !Number.isNaN(prevPrice) && nextPrice !== prevPrice) {
        priceUpdated = true;
      }

      return pickCartSnapshot(fresh, item._cartLineId);
    })
    .filter(Boolean);

  return { items, removedCount, priceUpdated };
}

export function getCartLineKey(item) {
  return item._cartLineId || String(item.id);
}

export function cartsAreEquivalent(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      String(item.id) === String(other.id)
      && item._cartLineId === other._cartLineId
      && parseFloat(item.price) === parseFloat(other.price)
      && item.name_en === other.name_en
      && item.name_ar === other.name_ar
    );
  });
}
