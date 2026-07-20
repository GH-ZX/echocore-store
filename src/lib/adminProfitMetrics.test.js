import { describe, expect, it } from 'vitest';
import {
  computeAdminProfitMetrics,
  PROFIT_DETAIL_LIST_LIMIT,
  PROFIT_PERIOD_OPTIONS,
} from './adminProfitMetrics';

function makeOffer(id, { cost = 6, price = 10, name = 'Pack' } = {}) {
  return {
    id,
    name_ar: name,
    name_en: name,
    price,
    g2bulk_cost_usd: cost,
  };
}

function makeOrder({
  id = 'ord-1',
  userId = 'u1',
  username = 'ali',
  name = 'Ali',
  offerId = 'o1',
  price = 10,
  qty = 1,
  daysAgo = 0,
} = {}) {
  const created = new Date();
  created.setHours(12, 0, 0, 0);
  created.setDate(created.getDate() - daysAgo);
  return {
    id,
    status: 'completed',
    payment_method: 'balance',
    user_id: userId,
    created_at: created.toISOString(),
    total: price * qty,
    profiles: { id: userId, username, name },
    order_items: [{
      offer_id: offerId,
      price,
      quantity: qty,
      name_snapshot: 'Pack',
    }],
  };
}

describe('PROFIT_PERIOD_OPTIONS', () => {
  it('includes 1-day and defaults-friendly presets', () => {
    expect(PROFIT_PERIOD_OPTIONS).toEqual([1, 7, 14, 30, 90, null]);
  });
});

describe('computeAdminProfitMetrics', () => {
  it('does not double-count cost/profit/revenue on first sale of an offer', () => {
    const offers = [makeOffer('o1', { cost: 6, price: 10 })];
    const orders = [makeOrder({ id: 'a', offerId: 'o1', price: 10, qty: 1 })];
    const m = computeAdminProfitMetrics(orders, offers, { periodDays: 7, topLimit: 5 });

    expect(m.totalRevenue).toBe(10);
    expect(m.supplierCost).toBe(6);
    expect(m.grossProfit).toBe(4);

    const top = m.topOffersByRevenue[0];
    expect(top.revenue).toBe(10);
    expect(top.cost).toBe(6);
    expect(top.profit).toBe(4);
    expect(top.units).toBe(1);
  });

  it('aggregates multiple sales without inflating first sale', () => {
    const offers = [makeOffer('o1', { cost: 6, price: 10 })];
    const orders = [
      makeOrder({ id: 'a', userId: 'u1', username: 'ali', name: 'Ali', qty: 1 }),
      makeOrder({ id: 'b', userId: 'u2', username: 'sara', name: 'Sara', qty: 1 }),
      makeOrder({ id: 'c', userId: 'u1', username: 'ali', name: 'Ali', qty: 1 }),
    ];
    const m = computeAdminProfitMetrics(orders, offers, { periodDays: 7, topLimit: 5 });

    expect(m.totalRevenue).toBe(30);
    expect(m.supplierCost).toBe(18);
    expect(m.grossProfit).toBe(12);

    const top = m.topOffersByUnits[0];
    expect(top.units).toBe(3);
    expect(top.revenue).toBe(30);
    expect(top.cost).toBe(18);
    expect(top.profit).toBe(12);
    expect(top.buyerCount).toBe(2);

    const ali = top.buyerList.find((b) => b.username === 'ali');
    expect(ali.name).toBe('Ali');
    expect(ali.orders).toBe(2);
    expect(ali.revenue).toBe(20);
    expect(ali.profit).toBe(8);
  });

  it('prefers customer display name as label and ranks top customers', () => {
    const offers = [makeOffer('o1')];
    const orders = [
      makeOrder({ id: 'a', userId: 'u1', username: 'bigspender', name: 'أحمد', qty: 2 }),
      makeOrder({ id: 'b', userId: 'u2', username: 'other', name: 'سارة', qty: 1 }),
    ];
    const m = computeAdminProfitMetrics(orders, offers, { periodDays: 7, topLimit: 5 });

    expect(m.uniqueCustomers).toBe(2);
    const top = m.topCustomersByRevenue[0];
    expect(top.name).toBe('أحمد');
    expect(top.label).toBe('أحمد');
    expect(top.username).toBe('bigspender');
    expect(top.revenue).toBe(20);
    expect(top.orders).toBe(1);
    expect(top.orderList.length).toBe(1);
    expect(top.orderList[0].items[0].name).toBe('Pack');
  });

  it('caps detail lists to PROFIT_DETAIL_LIST_LIMIT (newest first)', () => {
    const offers = [makeOffer('o1')];
    const orders = Array.from({ length: PROFIT_DETAIL_LIST_LIMIT + 5 }, (_, i) => (
      makeOrder({
        id: `ord-${i}`,
        userId: 'u1',
        username: 'ali',
        name: 'Ali',
        daysAgo: i,
      })
    ));
    const m = computeAdminProfitMetrics(orders, offers, { periodDays: null, topLimit: 3 });
    const customer = m.topCustomersByOrders[0];
    expect(customer.orders).toBe(PROFIT_DETAIL_LIST_LIMIT + 5);
    expect(customer.orderList.length).toBe(PROFIT_DETAIL_LIST_LIMIT);
    // newest first
    expect(customer.orderList[0].orderId).toBe('ord-0');

    const buyer = m.topOffersByUnits[0].buyerList[0];
    expect(buyer.purchases.length).toBe(PROFIT_DETAIL_LIST_LIMIT);
  });

  it('excludes admin gifts and non-completed orders', () => {
    const offers = [makeOffer('o1')];
    const orders = [
      makeOrder({ id: 'ok' }),
      { ...makeOrder({ id: 'gift' }), payment_method: 'admin_gift' },
      { ...makeOrder({ id: 'pending' }), status: 'pending' },
    ];
    const m = computeAdminProfitMetrics(orders, offers, { periodDays: 7 });
    expect(m.completedOrders).toBe(1);
    expect(m.totalRevenue).toBe(10);
  });
});
