import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from './supabase';
import {
  createOrderAtomic,
  expireStalePendingOrders,
  fetchMyOrderReceipt,
} from './orders';

function mockOrdersTable({ order = null, items = [] } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: order, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: async () => ({ data: items, error: null }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchMyOrderReceipt', () => {
  it('returns null without an order id', async () => {
    expect(await fetchMyOrderReceipt(null)).toBeNull();
  });

  it('reads order and items from tables directly', async () => {
    const order = { id: 'o1', total: 10 };
    mockOrdersTable({ order, items: [{ id: 'i1' }] });

    const receipt = await fetchMyOrderReceipt('o1');
    expect(receipt.order).toEqual(order);
    expect(receipt.items).toEqual([{ id: 'i1' }]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('falls back to the legacy RPC on table miss', async () => {
    mockOrdersTable({ order: null });
    supabase.rpc.mockResolvedValue({
      data: JSON.stringify({ order: { id: 'o2' }, items: [] }),
      error: null,
    });

    const receipt = await fetchMyOrderReceipt('o2');
    expect(receipt.order).toEqual({ id: 'o2' });
    expect(supabase.rpc).toHaveBeenCalledWith('get_my_order_receipt', { p_order_id: 'o2' });
  });

  it('returns null when both table and RPC come back empty', async () => {
    mockOrdersTable({ order: null });
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchMyOrderReceipt('o3')).toBeNull();
  });
});

describe('createOrderAtomic', () => {
  const base = {
    userId: 'u1',
    total: 10,
    paymentMethod: 'balance',
    items: [{ offer_id: 1, qty: 1 }],
  };

  it('calls the RPC with the base payload', async () => {
    supabase.rpc.mockResolvedValue({ data: { order_id: 'o1' }, error: null });

    const result = await createOrderAtomic(base);
    expect(result).toEqual({ order_id: 'o1' });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('create_order_atomic', expect.objectContaining({
      p_user_id: 'u1',
      p_total: 10,
      p_payment_method: 'balance',
    }));
  });

  it('retries without influencer arg when the DB lacks that signature', async () => {
    supabase.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Could not find the function create_order_atomic(p_influencer_code)' },
      })
      .mockResolvedValueOnce({ data: { order_id: 'o2' }, error: null });

    const result = await createOrderAtomic({ ...base, influencerCode: 'CODE1' });
    expect(result).toEqual({ order_id: 'o2' });
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    const lastArgs = supabase.rpc.mock.calls[1][1];
    expect(lastArgs).not.toHaveProperty('p_influencer_code');
  });

  it('maps insufficient balance to the translated message', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Insufficient balance for this order' },
    });

    await expect(
      createOrderAtomic({ ...base, t: { insufficientBalance: 'رصيد غير كافٍ' } }),
    ).rejects.toThrow('رصيد غير كافٍ');
  });

  it('surfaces the setup message when checkout RPC is missing', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'function create_order_atomic does not exist' },
    });

    await expect(createOrderAtomic(base)).rejects.toThrow(/Checkout is not configured/);
  });
});

describe('expireStalePendingOrders', () => {
  it('returns skipped result when the migration is missing', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'function expire_stale_pending_orders does not exist' },
    });

    expect(await expireStalePendingOrders()).toEqual({
      cancelledPending: 0,
      failedStuckFulfillment: 0,
      skipped: true,
    });
  });

  it('returns RPC data when available', async () => {
    supabase.rpc.mockResolvedValue({
      data: { cancelledPending: 2, failedStuckFulfillment: 1 },
      error: null,
    });

    expect(await expireStalePendingOrders(30)).toEqual({
      cancelledPending: 2,
      failedStuckFulfillment: 1,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('expire_stale_pending_orders', {
      p_max_age_minutes: 30,
    });
  });
});
