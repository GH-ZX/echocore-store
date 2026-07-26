import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cartsAreEquivalent,
  getCartItemImageUrl,
  getCartLineKey,
  getMaxCartLines,
  isCartFull,
  loadCartFromStorage,
  pickCartSnapshot,
  saveCartToStorage,
  syncCartWithOffers,
} from './cartUtils';

function makeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

describe('isCartFull', () => {
  it('is false below the line limit and true at it', () => {
    expect(isCartFull([])).toBe(false);
    expect(isCartFull(undefined)).toBe(false);
    const full = Array.from({ length: getMaxCartLines() }, (_, i) => ({ id: i }));
    expect(isCartFull(full)).toBe(true);
  });
});

describe('pickCartSnapshot', () => {
  it('keeps only snapshot fields and assigns a line id', () => {
    const offer = {
      id: 1,
      name_en: 'Offer',
      price: 5,
      secret_code: 'XYZ',
      g2bulk_cost_usd: 3,
    };
    const snap = pickCartSnapshot(offer);
    expect(snap.id).toBe(1);
    expect(snap.name_en).toBe('Offer');
    expect(snap.secret_code).toBeUndefined();
    expect(snap.g2bulk_cost_usd).toBeUndefined();
    expect(snap._cartLineId).toBeTruthy();
  });

  it('preserves an existing line id', () => {
    const snap = pickCartSnapshot({ id: 1 }, 'line-abc');
    expect(snap._cartLineId).toBe('line-abc');
  });
});

describe('cart storage', () => {
  beforeEach(() => {
    globalThis.localStorage = makeStorage();
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it('round-trips a saved cart', () => {
    const cart = [{ id: 1, price: 5, _cartLineId: 'line-1' }];
    saveCartToStorage(cart);
    expect(loadCartFromStorage()).toEqual(cart);
  });

  it('supports the legacy bare-array format', () => {
    localStorage.setItem('echocore-cart', JSON.stringify([{ id: 2, price: 3 }]));
    const loaded = loadCartFromStorage();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(2);
    expect(loaded[0]._cartLineId).toBeTruthy();
  });

  it('drops malformed entries and survives corrupt JSON', () => {
    localStorage.setItem(
      'echocore-cart',
      JSON.stringify({ v: 1, items: [{ id: 1 }, null, { name_en: 'no id' }] }),
    );
    expect(loadCartFromStorage()).toHaveLength(1);

    localStorage.setItem('echocore-cart', '{broken');
    expect(loadCartFromStorage()).toEqual([]);
  });

  it('returns empty when localStorage is unavailable', () => {
    delete globalThis.localStorage;
    expect(loadCartFromStorage()).toEqual([]);
    expect(() => saveCartToStorage([{ id: 1 }])).not.toThrow();
  });
});

describe('syncCartWithOffers', () => {
  const line = (id, price, extra = {}) => ({
    id,
    price,
    _cartLineId: `line-${id}`,
    ...extra,
  });

  it('returns empty result for an empty cart', () => {
    expect(syncCartWithOffers([], [{ id: 1 }])).toEqual({
      items: [],
      removedCount: 0,
      priceUpdated: false,
    });
  });

  it('keeps the cart untouched while the catalog is empty/loading', () => {
    const cart = [line(1, 5)];
    const result = syncCartWithOffers(cart, []);
    expect(result.items).toBe(cart);
    expect(result.removedCount).toBe(0);
  });

  it('removes lines whose offer became inactive', () => {
    const cart = [line(1, 5), line(2, 7)];
    const offers = [
      { id: 1, price: 5, active: false },
      { id: 2, price: 7, active: true },
    ];
    const result = syncCartWithOffers(cart, offers);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(2);
    expect(result.removedCount).toBe(1);
  });

  it('refreshes price and flags the update', () => {
    const cart = [line(1, 5)];
    const offers = [{ id: 1, price: 6, active: true }];
    const result = syncCartWithOffers(cart, offers);
    expect(result.items[0].price).toBe(6);
    expect(result.items[0]._cartLineId).toBe('line-1');
    expect(result.priceUpdated).toBe(true);
  });

  it('keeps the last snapshot for lines missing from the catalog', () => {
    const cart = [line(9, 4, { name_en: 'Ghost' })];
    const offers = [{ id: 1, price: 6, active: true }];
    const result = syncCartWithOffers(cart, offers);
    expect(result.items[0]).toEqual(cart[0]);
    expect(result.removedCount).toBe(0);
  });
});

describe('getCartLineKey', () => {
  it('prefers the cart line id and falls back to offer id', () => {
    expect(getCartLineKey({ id: 1, _cartLineId: 'line-x' })).toBe('line-x');
    expect(getCartLineKey({ id: 1 })).toBe('1');
  });
});

describe('getCartItemImageUrl', () => {
  const games = [{ id: 10, logo_url: 'logo.png', image_url: 'cover.png' }];

  it('follows sale image → offer image → game logo priority', () => {
    const offers = [{ id: 1, sale_image_url: 'sale.png', image_url: 'offer.png', game_id: 10 }];
    expect(getCartItemImageUrl({ id: 1 }, games, offers)).toBe('sale.png');

    const noSale = [{ id: 1, image_url: 'offer.png', game_id: 10 }];
    expect(getCartItemImageUrl({ id: 1 }, games, noSale)).toBe('offer.png');

    expect(getCartItemImageUrl({ id: 1, game_id: 10 }, games, [])).toBe('logo.png');
  });

  it('returns null for unknown items', () => {
    expect(getCartItemImageUrl(null, games, [])).toBeNull();
    expect(getCartItemImageUrl({ id: 99 }, [], [])).toBeNull();
  });
});

describe('cartsAreEquivalent', () => {
  const item = { id: 1, _cartLineId: 'a', price: '5', name_en: 'X', name_ar: 'س' };

  it('true for identical carts (string/number price equal)', () => {
    expect(cartsAreEquivalent([item], [{ ...item, price: 5 }])).toBe(true);
  });

  it('false on length, price, or name differences', () => {
    expect(cartsAreEquivalent([item], [])).toBe(false);
    expect(cartsAreEquivalent([item], [{ ...item, price: 6 }])).toBe(false);
    expect(cartsAreEquivalent([item], [{ ...item, name_en: 'Y' }])).toBe(false);
  });
});
