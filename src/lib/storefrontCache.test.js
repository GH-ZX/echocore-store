import { beforeEach, describe, expect, it } from 'vitest';
import {
  catalogConfigKey,
  clearStorefrontCache,
  readStorefrontCache,
  sameRows,
  writeStorefrontCache,
} from './storefrontCache';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  // Object.keys(localStorage) is used by clearStorefrontCache()
  Object.defineProperty(globalThis.localStorage, 'keys', { value: () => [...store.keys()] });
  return store;
}

describe('storefront cache', () => {
  let store;
  beforeEach(() => {
    store = installLocalStorage();
  });

  it('round-trips data', () => {
    expect(writeStorefrontCache('a', { x: 1 })).toBe(true);
    expect(readStorefrontCache('a')).toEqual({ x: 1 });
  });

  it('ignores expired entries', () => {
    writeStorefrontCache('a', { x: 1 }, { now: 1000 });
    expect(readStorefrontCache('a', { maxAgeMs: 500, now: 2000 })).toBeNull();
    expect(readStorefrontCache('a', { maxAgeMs: 5000, now: 2000 })).toEqual({ x: 1 });
  });

  it('ignores corrupt or wrong-version entries', () => {
    store.set('echocore-sf:bad', '{not json');
    store.set('echocore-sf:old', JSON.stringify({ v: 0, t: Date.now(), d: { x: 1 } }));
    expect(readStorefrontCache('bad')).toBeNull();
    expect(readStorefrontCache('old')).toBeNull();
  });

  it('refuses oversized entries instead of filling the quota', () => {
    expect(writeStorefrontCache('big', 'x'.repeat(2_000_000))).toBe(false);
    expect(readStorefrontCache('big')).toBeNull();
  });

  it('survives a throwing storage (private mode / quota)', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(readStorefrontCache('a')).toBeNull();
    expect(writeStorefrontCache('a', { x: 1 })).toBe(false);
  });

  it('works without any localStorage', () => {
    delete globalThis.localStorage;
    expect(readStorefrontCache('a')).toBeNull();
    expect(writeStorefrontCache('a', 1)).toBe(false);
    clearStorefrontCache();
  });
});

describe('catalogConfigKey', () => {
  it('distinguishes catalog mode, supplier filter and pull selection', () => {
    const base = catalogConfigKey({ g2bulkCatalogMode: 'sync', g2bulkCatalogOnly: true });
    expect(catalogConfigKey({ g2bulkCatalogMode: 'live', g2bulkCatalogOnly: true })).not.toBe(base);
    expect(catalogConfigKey({ g2bulkCatalogMode: 'sync', g2bulkCatalogOnly: false })).not.toBe(base);
    expect(catalogConfigKey({ g2bulkCatalogMode: 'sync', g2bulkCatalogOnly: true, g2bulkPullSelection: { a: 1 } })).not.toBe(base);
    expect(catalogConfigKey({ g2bulkCatalogMode: 'sync', g2bulkCatalogOnly: true })).toBe(base);
  });
});

describe('sameRows', () => {
  it('detects identical and changed lists', () => {
    expect(sameRows([{ id: 1 }], [{ id: 1 }])).toBe(true);
    expect(sameRows([{ id: 1 }], [{ id: 2 }])).toBe(false);
    expect(sameRows([{ id: 1 }], [{ id: 1 }, { id: 2 }])).toBe(false);
  });
});
