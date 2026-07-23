import { describe, expect, it } from 'vitest';
import {
  applyUnitPriceMap,
  mergeWholesaleIntoOffers,
  stripOfferSecrets,
  stripOffersSecrets,
} from './offerWholesale';

describe('stripOfferSecrets', () => {
  it('removes cost and margin from offer objects', () => {
    const out = stripOfferSecrets({
      id: 'a',
      price: 1.5,
      g2bulk_cost_usd: 1,
      pricing_margin_percent: 12,
      name_en: 'Pack',
    });
    expect(out.g2bulk_cost_usd).toBeUndefined();
    expect(out.pricing_margin_percent).toBeUndefined();
    expect(out.price).toBe(1.5);
    expect(out.name_en).toBe('Pack');
  });

  it('maps over arrays', () => {
    const out = stripOffersSecrets([{ id: 1, g2bulk_cost_usd: 2 }]);
    expect(out[0].g2bulk_cost_usd).toBeUndefined();
  });
});

describe('mergeWholesaleIntoOffers', () => {
  it('attaches cost for matching ids', () => {
    const offers = [{ id: 'x', price: 2 }];
    const map = {
      x: { g2bulk_cost_usd: 1.1, pricing_mode: 'auto', pricing_margin_percent: 15 },
    };
    const out = mergeWholesaleIntoOffers(offers, map);
    expect(out[0].g2bulk_cost_usd).toBe(1.1);
    expect(out[0].pricing_margin_percent).toBe(15);
    expect(out[0].pricing_mode).toBe('auto');
  });
});

describe('applyUnitPriceMap', () => {
  it('applies partner unit price without needing cost on the offer', () => {
    const offers = [{ id: 'o1', price: 1.2, name_en: 'UC' }];
    const map = {
      o1: {
        unitPrice: 1.08,
        publicPrice: 1.2,
        partnerPriced: true,
        influencerPriced: false,
      },
    };
    const out = applyUnitPriceMap(offers, map);
    expect(out[0].price).toBe(1.08);
    expect(out[0]._publicPrice).toBe(1.2);
    expect(out[0]._partnerPriced).toBe(true);
    expect(out[0].g2bulk_cost_usd).toBeUndefined();
  });
});
