import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { canRefundFailedOrder, orderHasSupplierOrder, refundErrorKey } from './orderRefund';
import { formatNotification } from './notifications';
import { translations } from '../data/translations';

const failed = (over = {}) => ({
  id: 'o1',
  user_id: 'u1',
  status: 'completed',
  fulfillment_status: 'failed',
  payment_method: 'balance',
  total: 10,
  g2bulk_metadata: {},
  order_items: [{ delivery_items: null }],
  ...over,
});

describe('canRefundFailedOrder (mirrors refund_failed_order_internal)', () => {
  it('allows a paid, failed, wallet order with nothing delivered', () => {
    expect(canRefundFailedOrder(failed())).toBe(true);
  });

  it.each([
    ['not paid', { status: 'pending_payment' }],
    ['not failed', { fulfillment_status: 'fulfilling' }],
    ['delivered', { fulfillment_status: 'fulfilled' }],
    ['already refunded', { g2bulk_metadata: { balance_refunded: true } }],
    ['already refunded (text flag)', { g2bulk_metadata: { balance_refunded: 'true' } }],
    ['locked', { g2bulk_metadata: { do_not_refulfill: true } }],
    ['free after refund', { g2bulk_metadata: { free_after_refund: true } }],
    ['paid outside the wallet', { payment_method: 'shamcash' }],
    ['no customer', { user_id: null }],
    ['zero total', { total: 0 }],
    ['has delivered codes', { order_items: [{ delivery_items: ['CODE'] }] }],
  ])('refuses: %s', (_label, over) => {
    expect(canRefundFailedOrder(failed(over))).toBe(false);
  });

  it('refuses nothing', () => {
    expect(canRefundFailedOrder(null)).toBe(false);
  });
});

describe('orderHasSupplierOrder', () => {
  it('spots a supplier order id in the row or metadata', () => {
    expect(orderHasSupplierOrder(failed({ g2bulk_order_id: '42' }))).toBe(true);
    expect(orderHasSupplierOrder(failed({ g2bulk_metadata: { g2bulkOrderId: 7 } }))).toBe(true);
    expect(orderHasSupplierOrder(failed())).toBe(false);
  });
});

describe('refundErrorKey', () => {
  it('maps database refund errors to translation keys that exist in both languages', () => {
    const codes = ['refund_already', 'refund_not_failed', 'refund_not_balance', 'refund_locked',
      'refund_delivered', 'refund_not_found'];
    for (const code of codes) {
      const key = refundErrorKey({ message: code });
      expect(key).toBeTruthy();
      expect(translations.ar[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
    expect(refundErrorKey(new Error('something else'))).toBeNull();
  });
});

describe('money notifications', () => {
  it.each(['influencer_commission_reversed', 'admin_balance_ledger_mismatch',
    'admin_balance_ledger_resolved', 'admin_commission_reversal_failed'])('%s has a title and body', (type) => {
    for (const lang of ['ar', 'en']) {
      const shown = formatNotification(
        { type, metadata: { amount: 1, newBalance: 2, code: 'X', orderRef: 'EC-1', count: 3, totalGap: 4.5 } },
        translations[lang],
        lang,
      );
      expect(shown.title).toBeTruthy();
      expect(shown.title).not.toBe(translations[lang].inboxNotificationFallbackTitle);
      expect(shown.body).not.toMatch(/\{[a-z]+\}/i);
    }
  });
});
