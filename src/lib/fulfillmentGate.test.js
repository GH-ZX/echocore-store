import { describe, expect, it, vi } from 'vitest';
import { fulfillmentGate } from '../../supabase/functions/g2bulk/orderGate.ts';

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));
vi.mock('./liveCatalog', async (importOriginal) => ({
  ...(await importOriginal()),
  ensureCatalogItems: vi.fn(),
}));

import { ensureCatalogItems } from './liveCatalog';
import { resolveOffersForCheckout } from './catalogPurchase';

const customer = { userId: 'u1', admin: false, serviceAuth: false };
const paid = { id: 'o1', user_id: 'u1', status: 'completed', fulfillment_status: 'fulfilling' };

describe('fulfillmentGate (fulfillOrder, run again on the row re-read under the lock)', () => {
  it('lets a paid order of the caller through', () => {
    expect(fulfillmentGate(paid, customer)).toEqual({ proceed: true });
  });

  it('stops when the fresh copy shows another call already fulfilled it', () => {
    const gate = fulfillmentGate({ ...paid, fulfillment_status: 'fulfilled' }, customer);
    expect(gate).toMatchObject({ proceed: false, status: 200, body: { skipped: true, fulfillmentStatus: 'fulfilled' } });
  });

  it('never sends manual (owner-delivered) orders to the supplier', () => {
    const gate = fulfillmentGate({ ...paid, fulfillment_status: 'awaiting_delivery' }, customer);
    expect(gate).toMatchObject({ proceed: false, body: { skipped: true } });
  });

  it('refuses unpaid orders, missing orders and other people\'s orders', () => {
    expect(fulfillmentGate({ ...paid, status: 'cancelled' }, customer)).toMatchObject({ proceed: false, status: 400 });
    expect(fulfillmentGate(null, customer)).toMatchObject({ proceed: false, status: 404 });
    expect(fulfillmentGate({ ...paid, user_id: 'someone-else' }, customer)).toMatchObject({ proceed: false, status: 403 });
  });

  it('lets admins and the service role work any paid order', () => {
    const other = { ...paid, user_id: 'someone-else' };
    expect(fulfillmentGate(other, { userId: 'a1', admin: true, serviceAuth: false }).proceed).toBe(true);
    expect(fulfillmentGate(other, { userId: null, admin: true, serviceAuth: true }).proceed).toBe(true);
  });
});

describe('resolveOffersForCheckout (ensureCatalogItems is admin-only)', () => {
  it('passes synced packs through without calling the supplier', async () => {
    const items = [{ id: '6f1c2d6e-0000-4000-8000-000000000001' }];
    await expect(resolveOffersForCheckout(items)).resolves.toEqual(items);
    expect(ensureCatalogItems).not.toHaveBeenCalled();
  });

  it('stops the checkout with a clear message when a live-only pack is refused', async () => {
    ensureCatalogItems.mockRejectedValueOnce(new Error('Admin only'));
    await expect(resolveOffersForCheckout([{ id: 'live:topup:x:y' }], { unavailableMessage: 'not available' }))
      .rejects.toThrow('not available');
  });

  it('also stops when the pack could not be resolved', async () => {
    ensureCatalogItems.mockResolvedValueOnce(new Map());
    await expect(resolveOffersForCheckout([{ id: 'live:topup:x:y' }], { unavailableMessage: 'not available' }))
      .rejects.toThrow('not available');
  });
});
