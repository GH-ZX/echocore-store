import { describe, expect, it } from 'vitest';
import { getOfferGroup, getOfferGroupCounts } from './offerDisplay';

const pack = (name_en) => ({ name_en });

describe('getOfferGroup', () => {
  it('treats plain amounts as currency', () => {
    for (const name of ['55 Diamonds', '60 UC', '1800 UC (discounted)', '62', '1,000 Gold']) {
      expect(getOfferGroup(pack(name))).toBe('currency');
    }
  });

  it('treats passes and timed packs as passes', () => {
    for (const name of [
      'Weekly',
      'Weekly Elite Pack',
      'Monthly Elite Pack',
      'Twilight',
      'Prime (1 Month)',
      'Elite Pass LV1-50',
      'Season Pass',
      'Server Rental - 4 Person [30 Days]',
      'Meta Pass (30 Days)',
    ]) {
      expect(getOfferGroup(pack(name))).toBe('pass');
    }
  });

  it('puts gift packs and deals in bundles', () => {
    for (const name of [
      'Starter Selection Gift Pack',
      '049deal',
      'Ultra Skin Lucky Chest',
      'TAGTICAL Bundle II',
      'Weekly Deal Pack 1',
      'Weekly Mythic Emblem Value Pack',
    ]) {
      expect(getOfferGroup(pack(name))).toBe('bundle');
    }
  });

  it('falls back to the supplier or Arabic name', () => {
    expect(getOfferGroup({ g2bulk_catalogue_name: '86 Diamonds' })).toBe('currency');
    expect(getOfferGroup({ name_ar: 'باقة' })).toBe('bundle');
  });
});

describe('getOfferGroupCounts', () => {
  const mixed = [
    ...Array.from({ length: 8 }, (_, i) => pack(`${(i + 1) * 50} Diamonds`)),
    pack('Weekly'),
    pack('Starter Gift Pack'),
  ];

  it('counts each group', () => {
    expect(getOfferGroupCounts(mixed)).toEqual({ currency: 8, pass: 1, bundle: 1 });
  });

  it('returns null for few packs', () => {
    expect(getOfferGroupCounts(mixed.slice(0, 5))).toBeNull();
  });

  it('returns null when every pack is the same kind', () => {
    const same = Array.from({ length: 12 }, (_, i) => pack(`${i + 1}0 UC`));
    expect(getOfferGroupCounts(same)).toBeNull();
  });
});
