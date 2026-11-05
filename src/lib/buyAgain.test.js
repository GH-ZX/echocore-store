import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const { pickBuyAgainOffers } = await import('./userDashboard');

const offers = [
  { id: 'a', price: 1, active: true },
  { id: 'b', price: 2, active: true },
  { id: 'c', price: 3, active: false },
  { id: 'd', price: 4 },
];

describe('pickBuyAgainOffers', () => {
  it('keeps the newest purchase of each pack, in order', () => {
    const picks = pickBuyAgainOffers([
      { offerId: 'b', playerUid: '222' },
      { offerId: 'a', playerUid: '111' },
      { offerId: 'b', playerUid: 'old' },
    ], offers);
    expect(picks.map((p) => p.offer.id)).toEqual(['b', 'a']);
    expect(picks[0].playerUid).toBe('222');
  });

  it('skips packs that are inactive or gone', () => {
    const picks = pickBuyAgainOffers([
      { offerId: 'c' },
      { offerId: 'zzz' },
      { offerId: 'd', playerServer: '2001' },
    ], offers);
    expect(picks.map((p) => p.offer.id)).toEqual(['d']);
    expect(picks[0].playerServer).toBe('2001');
  });

  it('stops at max', () => {
    const items = ['a', 'b', 'd'].map((offerId) => ({ offerId }));
    expect(pickBuyAgainOffers(items, offers, 2)).toHaveLength(2);
  });

  it('handles nothing bought', () => {
    expect(pickBuyAgainOffers([], offers)).toEqual([]);
  });
});
